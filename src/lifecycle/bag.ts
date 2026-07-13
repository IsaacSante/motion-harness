export interface Disposable {
  dispose(): void;
}

export interface TeardownBag {
  /** Track a gsap tween/timeline (or anything with .kill()) so it's killed on teardown. */
  track<T extends { kill(): void }>(animation: T): T;
  /** Track any other resource (a glass handle, a GL context, a Matter.js engine) with a dispose(). */
  own(resource: Disposable): void;
  /** Kill every tracked animation. */
  killAll(): void;
  /** Dispose every owned resource. */
  disposeAll(): void;
}

/**
 * @kind primitive
 * Central bookkeeping for a scene's teardown: track every tween and owned
 * resource as you create it, then killAll()/disposeAll() from exit() instead
 * of hand-maintaining parallel arrays and remembering to drain each one.
 */
export function createTeardownBag(): TeardownBag {
  const animations: { kill(): void }[] = [];
  const resources: Disposable[] = [];
  return {
    track(animation) {
      animations.push(animation);
      return animation;
    },
    own(resource) {
      resources.push(resource);
    },
    killAll() {
      animations.forEach(a => a.kill());
      animations.length = 0;
    },
    disposeAll() {
      resources.forEach(r => r.dispose());
      resources.length = 0;
    },
  };
}
