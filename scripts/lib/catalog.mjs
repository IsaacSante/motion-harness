// Flattens every @kind-tagged export under a src/ directory into a flat
// catalog array. Shared by scripts/generate-catalog.mjs (writes it to disk
// for humans browsing catalog.json) and agent/context.mjs (builds it live,
// in-process, on every generation — the catalog the agent sees is always
// exactly the kit's current source, never a file someone forgot to
// regenerate after editing a JSDoc).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
const DOC_RE = /\/\*\*\s*\n((?:\s*\*.*\n)*?)\s*\*\/\s*\nexport\s+(const|function|class)\s+(\w+)/g;

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

// A one-line prose description is exactly as guessable-wrong as a prose
// rule in a system prompt — a model asked to call a function it's never
// seen used has nothing but that description to infer parameter order,
// count, and types from, and a plausible-sounding guess is not the same as
// the real signature (confirmed live: a generated scene called the brand-new
// `columnSlots` with a plausible-but-wrong 3-arg signature it invented from
// the prose alone). Extracting the actual signature text removes the
// guessing entirely, for every primitive, not just the one that happened to
// get called wrong first.
//
// Handles the two declaration styles in this codebase:
//   `export const NAME = <generics>(params): ReturnType => body`
//   `export function NAME<generics>(params): ReturnType { body }`
// The parameter list is found by balancing parens by hand (regex can't
// reliably match balanced brackets). The return type's end is genuinely
// ambiguous from text alone if it's an inline object type (e.g. floatDrift's
// `{ x: DriftAxis; y: DriftAxis }`) immediately followed by more `{`/`}` —
// but arrow functions always have a `=>` after their return type (mandatory
// syntax) and `function` declarations in this codebase never return an
// inline object type (always a named type), so branching on which keyword
// was used resolves it exactly, without needing a real parser: stop at the
// first `=>` for `const`, stop at the first bare `{` for `function`.
function extractSignature(src, afterNameIndex, keyword) {
  let i = afterNameIndex;
  const skipWs = () => { while (/\s/.test(src[i])) i++; };
  skipWs();
  if (src[i] === '<') {
    let depth = 0;
    do {
      if (src[i] === '<') depth++;
      else if (src[i] === '>') depth--;
      i++;
    } while (depth > 0 && i < src.length);
    skipWs();
  }
  if (src[i] === '=') {
    i++;
    skipWs();
  }
  if (src[i] !== '(') return null;
  const paramsStart = i;
  let depth = 0;
  do {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
    i++;
  } while (depth > 0 && i < src.length);
  const paramsEnd = i;
  const rest = src.slice(paramsEnd);
  const stop = keyword === 'function' ? /\{/.exec(rest) : /=>/.exec(rest);
  const returnType = stop ? rest.slice(0, stop.index) : '';
  return (src.slice(paramsStart, paramsEnd) + returnType).replace(/\s+/g, ' ').trim();
}

export function buildCatalog(srcDir) {
  const entries = [];
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, 'utf8');
    const modPath = relative(srcDir, file).replace(/\\/g, '/');
    DOC_RE.lastIndex = 0;
    let match;
    while ((match = DOC_RE.exec(src))) {
      const [full, doc, keyword, name] = match;
      const { kind, description } = parseDoc(doc);
      if (!kind) continue;
      const signature = extractSignature(src, match.index + full.length, keyword);
      entries.push({ name, module: `src/${modPath}`, kind, signature, description });
    }
  }
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return entries;
}
