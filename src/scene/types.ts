// The shared per-frame context every scene receives. width/height/dpr track
// the live viewport (read them each frame — the harness may resize mid-scene);
// canvas/ctx are optional since not every scene rasterizes to a 2D surface.
export interface SceneCtx {
  overlay: HTMLElement;
  width: number;
  height: number;
  dpr: number;
  signal: AbortSignal;
  now: () => number;
  /** True when rendering for deterministic offline export rather than live playback. */
  exportMode: boolean;
  /** True when the capture output should have a transparent background. */
  transparentBg: boolean;
  canvas?: HTMLCanvasElement;
  ctx?: CanvasRenderingContext2D;
}

export interface Scene<C = unknown> {
  id: string;
  config: C;
  enter(ctx: SceneCtx): Promise<void> | void;
  update?(t: number, dt: number): void;
  render?(ctx: SceneCtx): void;
  exit(): Promise<void> | void;
}

export type SceneFactory<C = unknown> = (config: C) => Scene<C>;
