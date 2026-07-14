import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { buildContext } from './context.mjs';
import { buildSystemPrompt, buildRepairMessage, factoryNameFor } from './prompt.mjs';
import { extractCode } from './extract-code.mjs';
import { registerScene } from './registry-patch.mjs';
import { chatCompletion } from './cerebras.mjs';

const MAX_ATTEMPTS = 3;
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

/**
 * Generate one scene file for a motion-harness project from a natural-
 * language instruction: prompts the LLM with the kit's catalog + this
 * project's tokens + an example scene, writes the result, registers it in
 * main.ts, typechecks, and feeds compiler errors back for a fix-up turn
 * (up to MAX_ATTEMPTS) if it doesn't typecheck clean.
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
    if (result.ok) {
      return { success: true, sceneName, factoryName, code, attempts };
    }

    // Typecheck runs across the whole project, so a pre-existing broken
    // file elsewhere (e.g. left over from an earlier failed generation)
    // would otherwise fail every future generation forever, regardless of
    // whether what we just wrote is actually fine. Only treat this as a
    // real failure if a diagnostic actually points at our own files.
    const ownFiles = [`scenes/${sceneName}.ts`, 'main.ts'];
    const allBlocks = groupDiagnosticBlocks(result.output);
    const ownBlocks = blocksForFiles(allBlocks, ownFiles);

    if (ownBlocks.length === 0) {
      return {
        success: true,
        sceneName,
        factoryName,
        code,
        attempts,
        warning: 'This scene typechecks clean, but the project has unrelated pre-existing typecheck errors elsewhere.',
      };
    }

    lastErrors = ownBlocks.map((b) => b.join('\n')).join('\n\n');
    messages.push({ role: 'user', content: buildRepairMessage(lastErrors) });
  }

  return { success: false, sceneName, factoryName, code, attempts, errors: lastErrors };
}
