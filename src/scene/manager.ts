import type { Scene, SceneCtx } from './types';

/**
 * @kind core
 * Sequences scenes: hard-cut transitions, or overlapping crossfades, plus
 * the per-frame tick/draw dispatch to whichever scene is current. This is
 * the one piece of orchestration a motion-graphics piece needs regardless
 * of visual style — scenes never talk to each other directly.
 */
export class SceneManager {
  private current: Scene | null = null;
  private abort = new AbortController();

  constructor(private base: Omit<SceneCtx, 'signal'>) {}

  /** Play scenes back-to-back. Each exit awaits before the next enter. */
  async play(scenes: Scene[]) {
    for (const scene of scenes) {
      await this.transitionTo(scene);
    }
  }

  /** Hard cut: exit current, enter next. */
  async transitionTo(scene: Scene) {
    if (this.current) await this.current.exit();
    this.abort = new AbortController();
    this.current = scene;
    await scene.enter(this.makeCtx());
  }

  /** Crossfade: exit and enter overlap. Both scenes render concurrently. */
  async crossfadeTo(scene: Scene) {
    const exiting = this.current?.exit();
    this.abort = new AbortController();
    const entering = scene.enter(this.makeCtx());
    this.current = scene;
    await Promise.all([exiting, entering]);
  }

  tick(t: number, dt: number) {
    this.current?.update?.(t, dt);
  }

  draw(sctx: SceneCtx) {
    this.current?.render?.(sctx);
  }

  skip() {
    this.abort.abort();
  }

  private makeCtx(): SceneCtx {
    const signal = this.abort.signal;
    return Object.create(this.base, {
      signal: { value: signal, enumerable: true },
    }) as SceneCtx;
  }
}
