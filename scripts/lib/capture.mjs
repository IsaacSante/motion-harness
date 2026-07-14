// Headless Playwright + raw-CDP frame capture, ported from the prototype at
// ~/Documents/GitHub/motion (scripts/export.mjs). Uses Chrome's CDP
// Emulation.setVirtualTimePolicy to advance ALL browser clocks (rAF,
// performance.now, Date, setTimeout, AND the compositor) in lockstep — the
// only way to get frame-exact, flicker-free capture of a running animation.
//
// Not ported: the prototype's `delete Element.prototype.animate` hack. That
// forces animations off Chrome's WAAPI compositor thread (which ignores the
// mocked clock) and onto the JS rAF driver instead — necessary there because
// Motion (framer-motion) routes through WAAPI by default. motion-harness
// scenes tween through GSAP's own rAF-driven ticker, never native
// `Element.animate()`, so the mocked clock already applies with no extra
// steps.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Deterministic-mode flag set: required so Page.captureScreenshot doesn't
// hang waiting for a BeginFrame once the page has non-trivial paint work.
// See: chrome-headless-render-pdf#29, puppeteer#11315, chromium
// headless-dev list. The full Chromium build (channel: 'chromium') is
// required too — chrome-headless-shell rejects --default-background-color.
const LAUNCH_ARGS = [
  '--default-background-color=00000000',
  '--hide-scrollbars',
  '--run-all-compositor-stages-before-draw',
  '--disable-new-content-rendering-timeout',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
  '--disable-image-animation-resync',
  '--disable-features=PaintHolding',
];

export async function launchChromium() {
  const { chromium } = await import('playwright');
  return chromium.launch({ channel: 'chromium', args: LAUNCH_ARGS });
}

/**
 * Captures a numbered PNG sequence of `url` into `framesDir`, one file per
 * frame at exactly `N * (1000/fps)` virtual milliseconds. Assumes the page
 * exposes `window.__motion = { start() }` (set by a project's main.ts in
 * `?export=1` mode) and honors a paused-then-manually-advanced CDP clock.
 */
export async function captureDeterministicFrames({
  browser,
  url,
  width,
  height,
  designWidth = 1920,
  fps = 24,
  duration,
  framesDir,
  onProgress,
}) {
  const dsf = width / designWidth;
  const designHeight = Math.round(height / dsf);
  const totalFrames = Math.round(duration * fps);
  const frameMs = 1000 / fps;

  await mkdir(framesDir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: designWidth, height: designHeight },
    deviceScaleFactor: dsf,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));

  const cdp = await ctx.newCDPSession(page);

  // Advance virtual time by `ms`, resolving when the budget expires.
  // 'pauseIfNetworkFetchesPending' during boot lets module/font fetches
  // finish on real-time network; 'advance' during capture so a stray
  // websocket frame (Vite HMR) can't stall frame stepping.
  const advance = (ms, { policy = 'advance', stallMs = 30000 } = {}) => {
    const expired = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`virtualTimeBudgetExpired stalled (${stallMs}ms, policy=${policy})`)),
        stallMs,
      );
      cdp.once('Emulation.virtualTimeBudgetExpired', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return cdp
      .send('Emulation.setVirtualTimePolicy', { policy, budget: ms, maxVirtualTimeTaskStarvationCount: 100000 })
      .then(() => expired);
  };

  // Kept in both the launch arg and here — the launch flag alone isn't
  // enough when capturing via raw CDP.
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  await page.goto(url, { waitUntil: 'commit' });

  await advance(30000, { policy: 'pauseIfNetworkFetchesPending' });
  await page.waitForFunction(() => !!window.__motion);
  await page.evaluate(() => document.fonts.ready);

  // Re-pause at scene t=0, then start scenes from a frozen clock so frame 0
  // captures the true initial state instead of one tick in.
  await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  await page.evaluate(() => window.__motion.start());

  // Capture-then-advance: frame 0 lands at virtual t=0, frame N at
  // t=N*frameMs. Raw CDP screenshot bypasses Playwright's per-call
  // document.fonts.ready wait, which can stall under a paused clock on long
  // runs.
  for (let i = 0; i < totalFrames; i++) {
    const file = path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    });
    await writeFile(file, Buffer.from(data, 'base64'));
    onProgress?.(i + 1, totalFrames);
    if (i < totalFrames - 1) await advance(frameMs);
  }

  await ctx.close();
}
