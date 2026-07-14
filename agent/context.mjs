// Builds the context bundle the LLM needs to write a valid scene: the Scene
// contract itself, the kit's tagged-primitive catalog, this project's own
// tokens, and an existing scene to anchor code-gen on the right shape.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalog } from '../scripts/lib/catalog.mjs';

export function buildContext(projectPath) {
  const kitRoot = join(projectPath, 'node_modules', 'motion-harness');
  const sceneTypesPath = join(kitRoot, 'src', 'scene', 'types.ts');
  const tokensPath = join(projectPath, 'src', 'tokens.ts');
  const scenesDir = join(projectPath, 'src', 'scenes');

  if (!existsSync(kitRoot)) {
    throw new Error(`${kitRoot} not found — is motion-harness installed in this project?`);
  }

  const sceneContract = existsSync(sceneTypesPath) ? readFileSync(sceneTypesPath, 'utf8') : '';
  // Built live from the kit's actual current source (kitRoot is a `file:`
  // dependency symlink, not a copy) rather than read from catalog.json —
  // that file is only for humans browsing it; it can't go stale for the
  // agent because the agent never reads it.
  const catalog = buildCatalog(join(kitRoot, 'src'));
  const tokens = existsSync(tokensPath) ? readFileSync(tokensPath, 'utf8') : '';
  const existingScenes = existsSync(scenesDir)
    ? readdirSync(scenesDir).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''))
    : [];

  // reference-scene.ts (scaffolded at src/, not src/scenes/ — it's not a
  // real scene, never registered or on the timeline) is a curated,
  // guaranteed-correct example. Prefer it over an arbitrary already-
  // generated scene, which might itself have quality issues; fall back to
  // an existing scene only if a project predates this file or it's been
  // deleted.
  let exampleScene = '';
  const referenceScenePath = join(projectPath, 'src', 'reference-scene.ts');
  if (existsSync(referenceScenePath)) {
    exampleScene = readFileSync(referenceScenePath, 'utf8');
  } else if (existingScenes.length > 0) {
    exampleScene = readFileSync(join(scenesDir, `${existingScenes[0]}.ts`), 'utf8');
  }

  return { sceneContract, catalog, tokens, exampleScene, existingScenes };
}
