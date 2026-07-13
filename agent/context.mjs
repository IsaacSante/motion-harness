// Builds the context bundle the LLM needs to write a valid scene: the Scene
// contract itself, the kit's tagged-primitive catalog, this project's own
// tokens, and an existing scene to anchor code-gen on the right shape.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function buildContext(projectPath) {
  const kitRoot = join(projectPath, 'node_modules', 'motion-harness');
  const sceneTypesPath = join(kitRoot, 'src', 'scene', 'types.ts');
  const catalogPath = join(kitRoot, 'src', 'catalog', 'catalog.json');
  const tokensPath = join(projectPath, 'src', 'tokens.ts');
  const scenesDir = join(projectPath, 'src', 'scenes');

  if (!existsSync(kitRoot)) {
    throw new Error(`${kitRoot} not found — is motion-harness installed in this project?`);
  }

  const sceneContract = existsSync(sceneTypesPath) ? readFileSync(sceneTypesPath, 'utf8') : '';
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : [];
  const tokens = existsSync(tokensPath) ? readFileSync(tokensPath, 'utf8') : '';
  const existingScenes = existsSync(scenesDir)
    ? readdirSync(scenesDir).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''))
    : [];

  let exampleScene = '';
  const examplePath = join(scenesDir, 'example.ts');
  if (existsSync(examplePath)) {
    exampleScene = readFileSync(examplePath, 'utf8');
  } else if (existingScenes.length > 0) {
    exampleScene = readFileSync(join(scenesDir, `${existingScenes[0]}.ts`), 'utf8');
  }

  return { sceneContract, catalog, tokens, exampleScene, existingScenes };
}
