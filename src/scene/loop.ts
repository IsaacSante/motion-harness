import type { SceneCtx } from './types';
import type { SceneManager } from './manager';

/**
 * @kind core
 * Starts the shared rAF loop: ticks the active scene's update(), then draws
 * it. One loop, one clock, for the whole piece — scenes never run their own
 * requestAnimationFrame.
 */
export function startLoop(manager: SceneManager, sctx: SceneCtx) {
  let last = performance.now();
  function frame(t: number) {
    const dt = (t - last) / 1000;
    last = t;
    manager.tick(t, dt);
    manager.draw(sctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export interface CanvasSurface {
  ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/**
 * @kind core
 * Optional helper for scenes that need a raw Canvas2D surface (particle
 * fields, hand-rolled text effects). DOM/WebGL-only scenes don't need this —
 * they can read width/height/dpr straight off SceneCtx.
 */
export function setupCanvas(canvas: HTMLCanvasElement): CanvasSurface {
  const ctx = canvas.getContext('2d')!;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();
  return {
    ctx,
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight; },
    get dpr() { return Math.min(window.devicePixelRatio || 1, 2); },
  };
}
