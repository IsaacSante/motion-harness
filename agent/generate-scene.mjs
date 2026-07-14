import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { buildContext } from './context.mjs';
import { buildSystemPrompt, buildRepairMessage, buildUnusedVarsRepairMessage, buildVisualRepairMessage, buildDesignRepairMessage, factoryNameFor } from './prompt.mjs';
import { extractCode } from './extract-code.mjs';
import { extractEdits, applyEdits } from './apply-edits.mjs';
import { registerScene } from './registry-patch.mjs';
import { chatCompletion } from './cerebras.mjs';
import { isPlaceholderTokens, derivePaletteTokens } from './tokens.mjs';
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
// TS6133 ("declared but its value is never read") is a mechanical fix — delete
// or underscore-prefix the named binding, nothing else — so it gets its own
// separate, more generous retry budget rather than sharing MAX_ATTEMPTS with
// genuine logic/type errors. Observed in practice to otherwise burn the whole
// general budget on what should be a one-line fix.
const MAX_UNUSED_VAR_REPAIRS = 3;
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
//
// An uncaught JS exception during enter() renders as an indistinguishable
// blank/stuck frame to the vision judge, which then has to guess at a
// layout/timing explanation for what's actually a crash — burning repair
// attempts on the wrong fix. captureScenePreview surfaces these separately,
// so a page error short-circuits straight to the real cause instead.
function buildPageErrorExplanation(pageErrors) {
  return `Uncaught JavaScript error while rendering — this is why nothing shows up, not a layout/timing issue: ${pageErrors.join(' | ')}`;
}

async function runVisualCheck({ projectPath, sceneName, instruction, apiKey, model, getDevServer }) {
  try {
    const devServer = await getDevServer();
    const { screenshotBase64, pageErrors } = await captureScenePreview({ previewUrl: devServer.url, sceneName });
    if (pageErrors.length > 0) {
      return { ok: false, explanation: buildPageErrorExplanation(pageErrors), screenshotBase64 };
    }
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
    messages.push(buildDesignRepairMessage(designVerdict.explanation, currentScreenshot, currentCode));
    const raw = await chatCompletion({ apiKey, model, messages });
    messages.push({ role: 'assistant', content: raw });

    let candidateCode;
    try {
      candidateCode = applyEdits(currentCode, extractEdits(raw));
    } catch (err) {
      return {
        code: currentCode,
        passes,
        warning: `A design-refinement pass produced invalid edits (${err instanceof Error ? err.message : String(err)}); kept the last working version.`,
      };
    }

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
      const captured = await captureScenePreview({ previewUrl: devServer.url, sceneName });
      newScreenshot = captured.screenshotBase64;
      correctnessVerdict = captured.pageErrors.length > 0
        ? { ok: false, explanation: buildPageErrorExplanation(captured.pageErrors) }
        : await judgeScreenshot({ apiKey, model, instruction, sceneName, screenshotBase64: newScreenshot });
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

  // Runs once per project: as long as tokens.ts is still the scaffolded
  // placeholder, this project has no visual identity of its own yet, so
  // treat THIS instruction as the brief and derive one from it before
  // building the prompt context below — ctx.tokens then picks up whatever
  // was just written instead of the placeholder. Once this succeeds,
  // tokens.ts no longer matches the placeholder, so later scenes in this
  // project skip this and reuse the same derived look.
  let tokensWarning;
  const tokensPath = join(projectPath, 'src', 'tokens.ts');
  if (existsSync(tokensPath) && isPlaceholderTokens(readFileSync(tokensPath, 'utf8'))) {
    const derived = await derivePaletteTokens({ apiKey, model, instruction });
    writeFileSync(tokensPath, derived.source);
    tokensWarning = derived.warning;
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
  let unusedVarRepairs = 0;
  let lastErrors = '';
  // The most recent attempt's code that actually typechecked cleanly (own
  // files), captured right before the visual check — NOT necessarily the
  // last attempt overall, since a later attempt can break typecheck again
  // while chasing a visual fix. On a final failure this is what gets left
  // on disk instead of a possibly-broken last attempt, and is reported back
  // so a caller (the studio UI) can tell a "typechecks but doesn't look
  // right" failure — safe to preview — from one where nothing usable exists.
  let lastGoodCode = null;
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
          const isOnlyUnusedVars = ownBlocks.every((b) => /error TS6133:/.test(b[0]));

          if (isOnlyUnusedVars && unusedVarRepairs < MAX_UNUSED_VAR_REPAIRS) {
            unusedVarRepairs++;
            attempts--; // mechanical fix — doesn't spend the general repair budget
            messages.push({ role: 'user', content: buildUnusedVarsRepairMessage(lastErrors) });
            continue;
          }

          messages.push({ role: 'user', content: buildRepairMessage(lastErrors) });
          continue;
        }
        typecheckWarning = 'This scene typechecks clean, but the project has unrelated pre-existing typecheck errors elsewhere.';
      }

      lastGoodCode = code;

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
        const warning = [tokensWarning, typecheckWarning, visualCheck.warning, designWarning].filter(Boolean).join(' ') || undefined;
        return { success: true, sceneName, factoryName, code, attempts, designPasses, warning };
      }

      lastErrors = visualCheck.explanation;
      messages.push(buildVisualRepairMessage(visualCheck.explanation, visualCheck.screenshotBase64));
    }

    // Never leave a typecheck-broken file as the final on-disk state just
    // because the last attempt was chasing a visual fix and broke
    // compilation along the way — fall back to the last version that
    // actually typechecked, so whatever's on disk (and registered in
    // main.ts) is always at least safe to attach to the timeline and preview.
    if (lastGoodCode !== null && lastGoodCode !== code) {
      writeFileSync(scenePath, lastGoodCode);
      code = lastGoodCode;
    }
    return { success: false, sceneName, factoryName, code, attempts, errors: lastErrors, safeToAttach: lastGoodCode !== null };
  } finally {
    if (devServer) stopDevServer(devServer);
  }
}
