// Shared "create a new project" logic — used by both the CLI
// (scripts/create-project.mjs) and the studio server's POST /api/projects,
// so there's exactly one place that knows how to scaffold a project.
import { mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HARNESS_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEMPLATE_DIR = join(HARNESS_ROOT, 'template');

// Where new projects land when the caller doesn't specify a directory —
// override with MOTION_HARNESS_PROJECTS_DIR if you want them somewhere else.
export const DEFAULT_PROJECTS_ROOT =
  process.env.MOTION_HARNESS_PROJECTS_DIR || join(homedir(), 'motion-harness-projects');

function replaceInFile(path, replacements) {
  let contents = readFileSync(path, 'utf8');
  for (const [find, replaceWith] of replacements) {
    contents = contents.split(find).join(replaceWith);
  }
  writeFileSync(path, contents);
}

export function scaffoldProject({ name, targetDir }) {
  if (!name) {
    throw new Error('scaffoldProject requires a name');
  }
  const resolvedTargetDir = targetDir || DEFAULT_PROJECTS_ROOT;
  const projectPath = join(resolvedTargetDir, name);
  if (existsSync(projectPath)) {
    throw new Error(`${projectPath} already exists`);
  }

  mkdirSync(resolvedTargetDir, { recursive: true });
  cpSync(TEMPLATE_DIR, projectPath, { recursive: true });

  const kitRelPath = relative(projectPath, HARNESS_ROOT);
  const replacements = [
    ['__PROJECT_NAME__', name],
    ['__KIT_FILE_DEP__', `file:${kitRelPath}`],
  ];
  replaceInFile(join(projectPath, 'package.json'), replacements);
  replaceInFile(join(projectPath, 'index.html'), replacements);
  replaceInFile(join(projectPath, 'CLAUDE.md'), replacements);

  execSync('git init --quiet', { cwd: projectPath });
  execSync('npm install', { cwd: projectPath, stdio: 'inherit' });

  return projectPath;
}
