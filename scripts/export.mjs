// Renders a motion-harness project to a transparent (or solid) ProRes .mov.
// Spins up the project's own dev server, drives it headlessly via
// scripts/lib/capture.mjs, then hands the PNG sequence to ffmpeg.
//
// Usage:
//   node scripts/export.mjs --project=/path/to/project [flags]
//
// Flags (all optional except --project):
//   --duration=       seconds; defaults to the sum of src/timeline.json's clip durations
//   --fps=24
//   --w=3840 --h=2160 (4K)
//   --designWidth=1920
//   --solid           opaque ProRes 422 instead of transparent ProRes 4444
//   --out=<project>/out
//   --name=output
//   --no-mov          skip ffmpeg encode (PNG sequence only)
//   --no-frames       skip rendering, re-encode existing PNGs
//
// Requires ffmpeg on PATH — not an npm dependency, install it yourself
// (e.g. `brew install ffmpeg`).
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { startDevServerOnAvailablePort, stopDevServer } from './lib/dev-server.mjs';
import { launchChromium, captureDeterministicFrames } from './lib/capture.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const stripped = a.replace(/^--/, '');
    const eq = stripped.indexOf('=');
    if (eq === -1) return [stripped, true];
    return [stripped.slice(0, eq), stripped.slice(eq + 1)];
  }),
);

if (!args.project) {
  console.error('usage: node scripts/export.mjs --project=<path> [--duration=] [--fps=24] [--w=3840] [--h=2160] [--solid] ...');
  process.exit(1);
}

const projectPath = path.resolve(args.project);
if (!existsSync(path.join(projectPath, 'package.json'))) {
  console.error(`${projectPath} doesn't look like a project (no package.json)`);
  process.exit(1);
}

const width = Number(args.w ?? 3840);
const height = Number(args.h ?? 2160);
const fps = Number(args.fps ?? 24);
const designWidth = Number(args.designWidth ?? 1920);
const solid = !!args.solid;
const outDir = args.out ?? path.join(projectPath, 'out');
const name = args.name ?? 'output';
const framesDir = path.join(outDir, 'frames');
const movPath = path.join(outDir, `${name}.mov`);
const skipMov = !!args['no-mov'];
const skipFrames = !!args['no-frames'];

function defaultDuration() {
  const timelinePath = path.join(projectPath, 'src', 'timeline.json');
  if (!existsSync(timelinePath)) {
    throw new Error(`no --duration given and ${timelinePath} not found to infer one from`);
  }
  const { clips } = JSON.parse(readFileSync(timelinePath, 'utf8'));
  return clips.reduce((sum, c) => sum + c.duration, 0);
}

const duration = Number(args.duration ?? defaultDuration());
const totalFrames = Math.round(duration * fps);

const phase = (label) => console.log(`[${(performance.now() / 1000).toFixed(1)}s] ${label}`);

if (!skipFrames) {
  await rm(framesDir, { recursive: true, force: true });

  phase('starting dev server');
  const port = 4500 + Math.floor(Math.random() * 500);
  const dev = await startDevServerOnAvailablePort(projectPath, port);

  const url = `${dev.url}/?export=1${solid ? '&solid=1' : ''}`;
  console.log(
    `launching chromium @ ${designWidth}x${Math.round(height / (width / designWidth))} logical → ${width}x${height} output, ${fps}fps, ${duration}s (${totalFrames} frames) — ${solid ? 'SOLID' : 'TRANSPARENT'} bg`,
  );
  console.log(`url: ${url}`);

  const browser = await launchChromium();
  try {
    await captureDeterministicFrames({
      browser,
      url,
      width,
      height,
      designWidth,
      fps,
      duration,
      framesDir,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) process.stdout.write(`\rframe ${done}/${total}`);
      },
    });
    process.stdout.write('\n');
  } finally {
    await browser.close();
    stopDevServer(dev);
  }

  console.log(`png sequence: ${framesDir}`);
}

if (!skipMov) {
  const label = solid ? 'ProRes 422 HQ (opaque)' : 'ProRes 4444 (alpha)';
  console.log(`encoding ${label} via ffmpeg...`);
  const codecArgs = solid
    ? ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0', '-qscale:v', '5']
    : ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-qscale:v', '5'];
  await new Promise((resolve, reject) => {
    const ff = spawn(
      'ffmpeg',
      ['-y', '-framerate', String(fps), '-i', path.join(framesDir, 'frame_%05d.png'), ...codecArgs, movPath],
      { stdio: 'inherit' },
    );
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ff.on('error', reject);
  });
  console.log(`${label}: ${movPath}`);
}
