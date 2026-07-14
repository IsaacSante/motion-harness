import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { buildContext } from './context.mjs';
import { buildSystemPrompt, buildRepairMessage, buildVisualRepairMessage, buildDesignRepairMessage, factoryNameFor } from './prompt.mjs';
import { extractCode } from './extract-code.mjs';
import { registerScene } from './registry-patch.mjs';
import { chatCompletion } from './cerebras.mjs';
import { captureScenePreview, judgeScreenshot, judgeDesignQuality } from './screenshot.mjs';
import { startDevServerOnAvailablePort, stopDevServer } from '../scripts/lib/dev-server.mjs';

const MAX_ATTEMPTS = 3;
// Spent only once correctness (typecheck + on-screen + on-brief) is already
// established, on top of MAX_ATTEMPTS rather than sharing its budget — a
// stubborn correctness fix would otherwise eat into every pass available
// for design polish. judgeScreenshot never evaluates spacing/composition,
// so without this a scene could pass every existing check while still
// looking arbitrary.
const MAX_DESIGN_PASSES = 2;
const DEFAULT_MODEL = 'gemma-4-31b'; // Cerebras preview model — eval-only, may change without notice.

function runTypecheck(projectPath) {
  try {
    execSync('npm run typecheck', { cwd: projectPath, stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (err) {
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    return { ok: false, output };
  }
}

// tsc's text output is one diagnostic per block: a `file(line,col): error
// TSxxxx: ...` header line followed by indented continuation lines (the
// actual "why" — e.g. every overload it tried and how each one failed).
// Only the header line contains the file path, so filtering line-by-line
// on "does this line mention the file" keeps the header and throws away
// every continuation line — the model gets "no overload matches" with zero
// explanation of why. Group into whole blocks first, then filter blocks.
function groupDiagnosticBlocks(output) {
  const lines = output.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (/^\S+\.ts\(\d+,\d+\): error/.test(line)) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function blocksForFiles(blocks, fileNames) {
  return blocks.filter((block) => fileNames.some((f) => block[0].includes(f)));
}

// Best-effort: a broken or unavailable visual check must never turn an
// otherwise-good generation into a hard failure. Any error here — dev
// server didn't boot, vision call failed, the model doesn't actually
// support image input despite the assumption it does — is swallowed and
// reported as a skipped check, not surfaced as a generation bug.
async function runVisualCheck({ projectPath, sceneName, instruction, apiKey, model, getDevServer }) {
  try {
    const devServer = await getDevServer();
    const screenshotBase64 = await captureScenePreview({ previewUrl: devServer.url, sceneName });
    const verdict = await judgeScreenshot({ apiKey, model, instruction, sceneName, screenshotBase64 });
    return { ...verdict, screenshotBase64 };
  } catch (err) {
    return {
      ok: true,
      skipped: true,
      explanation: '',
      screenshotBase64: null,
      warning: `Visual check unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Runs after correctness is already confirmed — each pass judges design
// quality, and if flagged, regenerates and re-verifies BOTH typecheck and
// correctness before accepting the change (a "design improvement" that
// breaks typecheck or pushes something off-screen is a regression, not a
// polish). Reverts to the last known-good code and stops early on any
// regression rather than continuing to spend passes on a worse version.
async function runDesignPasses({
  projectPath, scenePath, sceneName, instruction, factoryName,
  apiKey, model, messages, getDevServer, code, screenshotBase64,
}) {
  let currentCode = code;
  let currentScreenshot = screenshotBase64;
  let passes = 0;

  for (let i = 0; i < MAX_DESIGN_PASSES; i++) {
    let designVerdict;
    try {
      designVerdict = await judgeDesignQuality({ apiKey, model, instruction, sceneName, screenshotBase64: currentScreenshot });
    } catch (err) {
      return { code: currentCode, passes, warning: `Design check unavailable: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (designVerdict.ok) {
      return { code: currentCode, passes };
    }

    passes++;
    messages.push(buildDesignRepairMessage(designVerdict.explanation, currentScreenshot));
    const raw = await chatCompletion({ apiKey, model, messages });
    const candidateCode = extractCode(raw);
    messages.push({ role: 'assistant', content: raw });

    if (!candidateCode.includes(factoryName)) {
      return { code: currentCode, passes, warning: 'A design-refinement pass produced invalid output; kept the last working version.' };
    }

    writeFileSync(scenePath, candidateCode);
    const typecheckResult = runTypecheck(projectPath);
    if (!typecheckResult.ok) {
      writeFileSync(scenePath, currentCode);
      return { code: currentCode, passes, warning: 'A design-refinement pass broke typecheck; reverted to the last working version.' };
    }

    let correctnessVerdict;
    let newScreenshot;
    try {
      const devServer = await getDevServer();
      newScreenshot = await captureScenePreview({ previewUrl: devServer.url, sceneName });
      correctnessVerdict = await judgeScreenshot({ apiKey, model, instruction, sceneName, screenshotBase64: newScreenshot });
    } catch (err) {
      writeFileSync(scenePath, currentCode);
      return { code: currentCode, passes, warning: `Design check unavailable: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!correctnessVerdict.ok) {
      writeFileSync(scenePath, currentCode);
      return { code: currentCode, passes, warning: 'A design-refinement pass regressed correctness (off-screen or off-brief); reverted to the last working version.' };
    }

    currentCode = candidateCode;
    currentScreenshot = newScreenshot;
  }

  return { code: currentCode, passes, warning: 'Design quality was still flagged after the available refinement passes.' };
}

/**
 * Generate one scene file for a motion-harness project from a natural-
 * language instruction: prompts the LLM with the kit's catalog + this
 * project's tokens + an example scene, writes the result, registers it in
 * main.ts, typechecks, screenshots it and has the model visually judge the
 * result, and feeds compiler errors or visual issues back for a fix-up turn
 * (up to MAX_ATTEMPTS total) if either check fails.
 */
export async function generateScene({
  projectPath,
  sceneName,
  instruction,
  apiKey = process.env.CEREBRAS_API_KEY,
  model = DEFAULT_MODEL,
  overwrite = false,
}) {
  if (!apiKey) {
    throw new Error('No Cerebras API key — set CEREBRAS_API_KEY (see agent/.env.example) or pass apiKey explicitly');
  }
  if (!sceneName || !/^[a-z][a-z0-9-]*$/.test(sceneName)) {
    throw new Error('sceneName must be kebab-case (a-z, 0-9, hyphens), starting with a letter');
  }
  if (!instruction || !instruction.trim()) {
    throw new Error('instruction must not be empty');
  }

  const scenesDir = join(projectPath, 'src', 'scenes');
  const scenePath = join(scenesDir, `${sceneName}.ts`);
  if (existsSync(scenePath) && !overwrite) {
    throw new Error(`${scenePath} already exists — pass overwrite: true to replace it`);
  }

  const ctx = buildContext(projectPath);
  const factoryName = factoryNameFor(sceneName);
  const systemPrompt = buildSystemPrompt(ctx, sceneName);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: instruction },
  ];

  let code = '';
  let attempts = 0;
  let lastErrors = '';
  // Started lazily on the first typecheck pass and reused across repair
  // attempts within this one generateScene() call — one dev-server boot
  // per call, not per attempt.
  let devServer = null;
  const getDevServer = async () => {
    if (!devServer) {
      devServer = await startDevServerOnAvailablePort(projectPath, 4800 + Math.floor(Math.random() * 500));
    }
    return devServer;
  };

  try {
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      const raw = await chatCompletion({ apiKey, model, messages });
      code = extractCode(raw);
      messages.push({ role: 'assistant', content: raw });

      if (!code.includes(factoryName)) {
        lastErrors = `Your output did not export a function named exactly \`${factoryName}\`.`;
        messages.push({ role: 'user', content: buildRepairMessage(lastErrors) });
        continue;
      }

      mkdirSync(scenesDir, { recursive: true });
      writeFileSync(scenePath, code);
      registerScene(projectPath, sceneName, factoryName);

      const result = runTypecheck(projectPath);
      let typecheckWarning;
      if (!result.ok) {
        // Typecheck runs across the whole project, so a pre-existing broken
        // file elsewhere (e.g. left over from an earlier failed generation)
        // would otherwise fail every future generation forever, regardless
        // of whether what we just wrote is actually fine. Only treat this
        // as a real failure if a diagnostic actually points at our own
        // files.
        const ownFiles = [`scenes/${sceneName}.ts`, 'main.ts'];
        const allBlocks = groupDiagnosticBlocks(result.output);
        const ownBlocks = blocksForFiles(allBlocks, ownFiles);

        if (ownBlocks.length > 0) {
          lastErrors = ownBlocks.map((b) => b.join('\n')).join('\n\n');
          messages.push({ role: 'user', content: buildRepairMessage(lastErrors) });
          continue;
        }
        typecheckWarning = 'This scene typechecks clean, but the project has unrelated pre-existing typecheck errors elsewhere.';
      }

      // Typechecks clean — the visual check is the only thing that can
      // still catch a scene that renders wrong (see PLAN.md bug #1/#2:
      // wrong positioning typechecks fine).
      const visualCheck = await runVisualCheck({ projectPath, sceneName, instruction, apiKey, model, getDevServer });

      if (visualCheck.ok) {
        let designWarning;
        let designPasses = 0;
        if (!visualCheck.skipped) {
          // Correctness was actually confirmed (not fail-open) — worth
          // spending a few more passes specifically on design quality.
          // Skip this entirely if correctness itself couldn't be verified;
          // refining against an unconfirmed screenshot isn't worth it.
          const designResult = await runDesignPasses({
            projectPath, scenePath, sceneName, instruction, factoryName,
            apiKey, model, messages, getDevServer,
            code, screenshotBase64: visualCheck.screenshotBase64,
          });
          code = designResult.code;
          designPasses = designResult.passes;
          designWarning = designResult.warning;
        }
        const warning = [typecheckWarning, visualCheck.warning, designWarning].filter(Boolean).join(' ') || undefined;
        return { success: true, sceneName, factoryName, code, attempts, designPasses, warning };
      }

      lastErrors = visualCheck.explanation;
      messages.push(buildVisualRepairMessage(visualCheck.explanation, visualCheck.screenshotBase64));
    }

    return { success: false, sceneName, factoryName, code, attempts, errors: lastErrors };
  } finally {
    if (devServer) stopDevServer(devServer);
  }
}
