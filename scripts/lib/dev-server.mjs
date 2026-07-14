// Spawns a project's `npm run dev` on a specific port and waits for Vite's
// "ready in" line before resolving. Shared by the studio server (long-lived
// preview per project), the exporter, and the agent's visual-check step
// (both short-lived, one server per call) — three copies of the same
// spawn/wait/kill dance was the sign to pull it out once.
import { spawn } from 'node:child_process';

/**
 * Rejects (rather than silently resolving) if the process exits before
 * printing "ready in" — e.g. --strictPort refusing an already-taken port —
 * or if nothing happens within the timeout. A caller that doesn't check for
 * failure here has no way to know the returned URL isn't actually serving
 * anything; that's exactly what let a port collision silently point a
 * preview at a stale, unrelated dev server instead of failing loudly.
 */
export function startDevServer(projectPath, port, { readyTimeoutMs = 15000 } = {}) {
  const proc = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: projectPath,
    stdio: 'pipe',
  });
  const handle = { proc, port, url: `http://localhost:${port}` };

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = '';

    const onData = (chunk) => {
      output += chunk.toString();
      if (!settled && chunk.toString().includes('ready in')) {
        settled = true;
        clearTimeout(timer);
        resolve(handle);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (chunk) => { output += chunk.toString(); });

    proc.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`dev server for ${projectPath} on port ${port} exited before becoming ready (code ${code}):\n${output}`));
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      reject(new Error(`dev server for ${projectPath} on port ${port} didn't report ready within ${readyTimeoutMs}ms:\n${output}`));
    }, readyTimeoutMs);
  });
}

/**
 * Like startDevServer, but retries on the next port if the preferred one is
 * taken (e.g. by an orphaned dev server from a previous process lifetime —
 * killing the parent doesn't kill children it spawned unless it explicitly
 * cleans them up first). Returned handle's .port/.url reflect whichever
 * port actually ended up serving.
 */
export async function startDevServerOnAvailablePort(projectPath, preferredPort, { maxAttempts = 5 } = {}) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await startDevServer(projectPath, preferredPort + i);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`couldn't start a dev server for ${projectPath} after ${maxAttempts} attempts starting at port ${preferredPort}: ${lastErr?.message}`);
}

export function stopDevServer(handle) {
  if (handle) handle.proc.kill();
}
