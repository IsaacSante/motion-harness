export type BeatMap = Record<string, number>;

export interface BeatsOptions {
  /** Multiplies every beat. 1 = authored pacing, 0.5 = twice as fast, 2 = half. */
  scale?: number;
}

export interface Beats<M extends BeatMap> {
  (name: keyof M): number;
  /** The raw, unscaled map, in case a caller needs to reason about ratios. */
  readonly raw: M;
  readonly scale: number;
  /** A new Beats bound to the same map at a different scale. */
  withScale(scale: number): Beats<M>;
}

/**
 * @kind primitive
 * Named-duration pacing. Define a scene's rhythm as one beat -> seconds map,
 * then retime the whole scene by scaling a single number instead of hunting
 * for magic-number durations scattered across the file.
 */
export function defineBeats<M extends BeatMap>(map: M, opts: BeatsOptions = {}): Beats<M> {
  const scale = opts.scale ?? 1;
  const beats = ((name: keyof M) => map[name] * scale) as Beats<M>;
  Object.defineProperties(beats, {
    raw: { value: map, enumerable: true },
    scale: { value: scale, enumerable: true },
    withScale: { value: (s: number) => defineBeats(map, { scale: s }), enumerable: true },
  });
  return beats;
}
