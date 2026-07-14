import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldProject, DEFAULT_PROJECTS_ROOT } from './scaffold.mjs';
import { listProjects, addProject, findProject } from './registry.mjs';
import { loadEnvFile } from '../../agent/env.mjs';
import { generateScene } from '../../agent/generate-scene.mjs';
import { startDevServerOnAvailablePort, stopDevServer } from '../../scripts/lib/dev-server.mjs';

loadEnvFile(fileURLToPath(new URL('../../agent/.env', import.meta.url)));

const PORT = 4310;
let nextPreviewPort = 4400;
// project name -> { proc, port, url }
const previews = new Map();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

async function startPreview(name) {
  const existing = previews.get(name);
  if (existing) return existing;

  const project = findProject(name);
  const port = nextPreviewPort++;
  const preview = await startDevServerOnAvailablePort(project.path, port);
  previews.set(name, preview);
  preview.proc.on('exit', () => previews.delete(name));

  return preview;
}

function stopPreview(name) {
  const preview = previews.get(name);
  if (preview) {
    stopDevServer(preview);
    previews.delete(name);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api', 'projects', 'name', 'timeline']

    if (parts[0] !== 'api') {
      return send(res, 404, { error: 'not found' });
    }

    if (parts[1] === 'config' && parts.length === 2 && req.method === 'GET') {
      return send(res, 200, { defaultProjectsRoot: DEFAULT_PROJECTS_ROOT });
    }

    if (parts[1] !== 'projects') {
      return send(res, 404, { error: 'not found' });
    }

    if (parts.length === 2 && req.method === 'GET') {
      return send(res, 200, listProjects());
    }

    if (parts.length === 2 && req.method === 'POST') {
      const { name, targetDir } = await readJsonBody(req);
      const path = scaffoldProject({ name, targetDir });
      const projects = addProject({ name, path });
      return send(res, 200, projects);
    }

    const projectName = decodeURIComponent(parts[2]);
    const sub = parts[3];

    if (sub === 'timeline' && req.method === 'GET') {
      const project = findProject(projectName);
      const timeline = JSON.parse(readFileSync(join(project.path, 'src/timeline.json'), 'utf8'));
      return send(res, 200, timeline);
    }

    if (sub === 'timeline' && req.method === 'PUT') {
      const project = findProject(projectName);
      const body = await readJsonBody(req);
      writeFileSync(join(project.path, 'src/timeline.json'), JSON.stringify(body, null, 2) + '\n');
      return send(res, 200, { ok: true });
    }

    if (sub === 'scenes' && req.method === 'GET') {
      const project = findProject(projectName);
      const dir = join(project.path, 'src/scenes');
      const scenes = existsSync(dir)
        ? readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''))
        : [];
      return send(res, 200, scenes);
    }

    if (sub === 'scenes' && parts[4] === 'generate' && req.method === 'POST') {
      const project = findProject(projectName);
      const { sceneName, instruction, overwrite } = await readJsonBody(req);
      const result = await generateScene({ projectPath: project.path, sceneName, instruction, overwrite });
      return send(res, 200, result);
    }

    if (sub === 'preview' && parts[4] === 'start' && req.method === 'POST') {
      const preview = await startPreview(projectName);
      return send(res, 200, { url: preview.url });
    }

    if (sub === 'preview' && parts[4] === 'stop' && req.method === 'POST') {
      stopPreview(projectName);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`motion-harness studio server on http://localhost:${PORT}`);
});

// SIGTERM too, not just SIGINT — a plain `kill`/`pkill` sends SIGTERM, and
// without a handler for it, spawned preview dev servers are orphaned
// instead of cleaned up. That's exactly what let a stale preview keep
// serving on a port this process later reused after restart, silently
// pointing a different project's preview at leftover content.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const name of previews.keys()) stopPreview(name);
    process.exit(0);
  });
}
