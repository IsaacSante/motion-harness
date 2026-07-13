import { scaffoldProject, DEFAULT_PROJECTS_ROOT } from '../studio/server/scaffold.mjs';

const [, , name, targetDir] = process.argv;
if (!name) {
  console.error(`usage: node scripts/create-project.mjs <name> [target-dir]`);
  console.error(`  target-dir defaults to ${DEFAULT_PROJECTS_ROOT}`);
  process.exit(1);
}

const path = scaffoldProject({ name, targetDir });
console.log(`created ${path}`);
