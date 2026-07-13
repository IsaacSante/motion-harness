import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { scaffoldProject } from './scaffold.mjs';
import { listProjects, addProject, findProject } from './registry.mjs';

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
  const proc = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: project.path,
    stdio: 'pipe',
  });
  const preview = { proc, port, url: `http://localhost:${port}` };
  previews.set(name, preview);
  proc.on('exit', () => previews.delete(name));

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    proc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ready in')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return preview;
}

function stopPreview(name) {
  const preview = previews.get(name);
  if (preview) {
    preview.proc.kill();
    previews.delete(name);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api', 'projects', 'name', 'timeline']

    if (parts[0] !== 'api' || parts[1] !== 'projects') {
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

process.on('SIGINT', () => {
  for (const name of previews.keys()) stopPreview(name);
  process.exit(0);
});
