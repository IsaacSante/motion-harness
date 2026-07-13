import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.mjs';
import { generateScene } from './generate-scene.mjs';

loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));

const [, , projectPath, sceneName, ...rest] = process.argv;
const instruction = rest.join(' ');

if (!projectPath || !sceneName || !instruction) {
  console.error('usage: node agent/cli.mjs <project-path> <scene-name> <instruction...>');
  process.exit(1);
}

try {
  const result = await generateScene({ projectPath, sceneName, instruction });
  if (result.success) {
    console.log(`✓ ${result.sceneName} generated and typechecked cleanly after ${result.attempts} attempt(s)`);
  } else {
    console.error(`✗ ${result.sceneName} failed after ${result.attempts} attempt(s)`);
    console.error(result.errors);
    process.exit(1);
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
