// Flattens every @kind-tagged export under src/ into src/catalog/catalog.json.
// Run via `npm run catalog` after adding or changing a tagged primitive.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'catalog', 'catalog.json');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Matches a /** ... */ block immediately followed by an exported const/function/class.
const DOC_RE = /\/\*\*\s*\n((?:\s*\*.*\n)*?)\s*\*\/\s*\nexport\s+(?:const|function|class)\s+(\w+)/g;

function parseDoc(block) {
  const lines = block
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l.length > 0);
  let kind = null;
  const descLines = [];
  for (const line of lines) {
    const m = line.match(/^@kind\s+(\w+)/);
    if (m) {
      kind = m[1];
      continue;
    }
    if (line.startsWith('@')) continue;
    descLines.push(line);
  }
  return { kind, description: descLines.join(' ') };
}

const entries = [];
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  const modPath = relative(SRC, file).replace(/\\/g, '/');
  DOC_RE.lastIndex = 0;
  let match;
  while ((match = DOC_RE.exec(src))) {
    const [, doc, name] = match;
    const { kind, description } = parseDoc(doc);
    if (!kind) continue;
    entries.push({ name, module: `src/${modPath}`, kind, description });
  }
}

entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify(entries, null, 2) + '\n');
console.log(`catalog: wrote ${entries.length} entries to ${relative(ROOT, OUT)}`);
