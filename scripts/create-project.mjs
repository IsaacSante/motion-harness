import { scaffoldProject } from '../studio/server/scaffold.mjs';

const [, , name, targetDir] = process.argv;
if (!name || !targetDir) {
  console.error('usage: node scripts/create-project.mjs <name> <target-dir>');
  process.exit(1);
}

const path = scaffoldProject({ name, targetDir });
console.log(`created ${path}`);
