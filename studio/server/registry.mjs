// Tracks which projects the studio knows about and where they live on disk.
// Projects can live anywhere, so this is just a flat local record — not
// meant to be committed (see studio/server/.gitignore).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REGISTRY_PATH = fileURLToPath(new URL('./projects.json', import.meta.url));

export function listProjects() {
  if (!existsSync(REGISTRY_PATH)) return [];
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

export function addProject(project) {
  const projects = listProjects().filter((p) => p.name !== project.name);
  projects.push(project);
  writeFileSync(REGISTRY_PATH, JSON.stringify(projects, null, 2) + '\n');
  return projects;
}

export function findProject(name) {
  const project = listProjects().find((p) => p.name === name);
  if (!project) throw new Error(`unknown project: ${name}`);
  return project;
}

export function removeProject(name) {
  const projects = listProjects().filter((p) => p.name !== name);
  writeFileSync(REGISTRY_PATH, JSON.stringify(projects, null, 2) + '\n');
  return projects;
}
