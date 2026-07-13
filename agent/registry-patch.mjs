// Wiring a generated scene into playback is done deterministically, not by
// asking the LLM to safely edit an existing file — string-patching main.ts
// ourselves means a bad generation can never corrupt the rest of the project.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function registerScene(projectPath, sceneName, factoryName) {
  const mainPath = join(projectPath, 'src', 'main.ts');
  let src = readFileSync(mainPath, 'utf8');

  const importLine = `import { ${factoryName} } from './scenes/${sceneName}';`;
  if (!src.includes(importLine)) {
    const importBlockRe = /(^import .*from '\.\/scenes\/.*';\n)+/m;
    const match = src.match(importBlockRe);
    if (match) {
      const insertAt = match.index + match[0].length;
      src = src.slice(0, insertAt) + importLine + '\n' + src.slice(insertAt);
    } else {
      const marker = `import timelineData from './timeline.json';\n`;
      if (!src.includes(marker)) {
        throw new Error(`could not find an anchor point in ${mainPath} to insert the scene import`);
      }
      src = src.replace(marker, marker + importLine + '\n');
    }
  }

  const registryRe = /(const sceneRegistry: Record<string, SceneFactory<any>> = \{\n)([\s\S]*?)(\n\};)/;
  const registryMatch = src.match(registryRe);
  if (!registryMatch) {
    throw new Error(`could not find sceneRegistry in ${mainPath}`);
  }
  const [, head, body, tail] = registryMatch;
  // Always quote the key — sceneName is kebab-case, and a hyphen is not
  // valid in an unquoted object-literal key (`particle-burst: x` is a
  // syntax error; `'particle-burst': x` is not).
  if (!new RegExp(`['"]?\\b${sceneName}\\b['"]?\\s*:`).test(body)) {
    const newBody = `${body}\n  '${sceneName}': ${factoryName},`;
    src = src.replace(registryRe, `${head}${newBody}${tail}`);
  }

  writeFileSync(mainPath, src);
}
