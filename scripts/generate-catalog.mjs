// Writes the current catalog to src/catalog/catalog.json — for humans
// browsing the kit's primitives (see docs/AGENT.md). The agent itself no
// longer depends on this file being up to date: agent/context.mjs builds
// the same catalog live from source on every generation via
// scripts/lib/catalog.mjs's buildCatalog(), so a forgotten `npm run catalog`
// after editing a JSDoc can't silently desync what the agent actually sees.
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from './lib/catalog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'catalog', 'catalog.json');

const entries = buildCatalog(SRC);
writeFileSync(OUT, JSON.stringify(entries, null, 2) + '\n');
console.log(`catalog: wrote ${entries.length} entries to ${relative(ROOT, OUT)}`);
