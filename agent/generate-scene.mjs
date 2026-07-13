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

    lastErrors = result.output
      .split('\n')
      .filter((line) => line.includes(`scenes/${sceneName}.ts`) || line.includes('main.ts'))
      .join('\n') || result.output;

    messages.push({ role: 'user', content: buildRepairMessage(lastErrors) });
  }

  return { success: false, sceneName, factoryName, code, attempts, errors: lastErrors };
}
