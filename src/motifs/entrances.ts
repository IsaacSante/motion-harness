import type { TransformLayer } from '../compose/layered-state';

/** Anything a motif can drive — the transform layer plus a blur channel, since "resolves into focus" recurs constantly. */
export type MotionValues = Partial<TransformLayer> & { blur?: number };

export interface MotifSpec {
  from: MotionValues;
  to: MotionValues;
  duration: number;
  ease: string;
}

export interface MotifParams {
  duration?: number;
  ease?: string;
  distance?: number;
}

/**
 * @kind motif
 * Rises from below while fading in — a grounded, straightforward arrival.
 * One option among the motifs here, not a default to reach for regardless
 * of brief; a scene calling for a different feel (a pop, a materialize, a
 * custom transform entirely) should use that instead.
 */
export const riseFade = ({ duration = 0.6, ease = 'power3.out', distance = 30 }: MotifParams = {}): MotifSpec => ({
  from: { y: distance, opacity: 0 },
  to: { y: 0, opacity: 1 },
  duration,
  ease,
});

/**
 * @kind motif
 * Scales up from slightly-under-size while fading in — reads as a soft pop
 * rather than a slide. Good for pills, badges, small chips.
 */
export const scalePop = ({ duration = 0.45, ease = 'back.out(1.6)' }: MotifParams = {}): MotifSpec => ({
  from: { scale: 0.92, opacity: 0 },
  to: { scale: 1, opacity: 1 },
  duration,
  ease,
});

/**
 * @kind motif
 * Text or UI "resolves into focus" — starts blurred, undersized and
 * transparent, sharpens to rest. Reads as materializing rather than sliding
 * in; pairs well with a progressive reveal (e.g. a typewriter) running
 * underneath it.
 */
export const blurMaterialize = ({ duration = 0.7, ease = 'expo.out', distance = 25 }: MotifParams = {}): MotifSpec => ({
  from: { y: distance, scale: 0.94, opacity: 0, blur: 10 },
  to: { y: 0, scale: 1, opacity: 1, blur: 0 },
  duration,
  ease,
});

/**
 * @kind motif
 * Cinematic, decisive settle — the "Jitter / Screen Studio" house curve.
 * The final ~20% of the tween covers a tiny distance so motion reads as
 * genuinely stopped, not still drifting when the eye moves on.
 */
export const expoSettle = ({ duration = 0.7, distance = 30 }: MotifParams = {}): MotifSpec => ({
  from: { y: distance, opacity: 0 },
  to: { y: 0, opacity: 1 },
  duration,
  ease: 'expo.out',
});

/**
 * @kind motif
 * Overshoots past rest then springs back — gives an element a sense of
 * weight on arrival instead of a frictionless glide.
 */
export const overshootSpring = ({ duration = 0.6 }: MotifParams = {}): MotifSpec => ({
  from: { scale: 0.9, opacity: 0 },
  to: { scale: 1, opacity: 1 },
  duration,
  ease: 'back.out(1.4)',
});

export interface DriftParams {
  ampX?: number;
  ampY?: number;
  periodX?: number;
  periodY?: number;
  /** Vary this per-instance (e.g. array index) so multiple drifting elements don't fall into lockstep. */
  seed?: number;
}

export interface DriftAxis {
  to: number;
  duration: number;
  ease: string;
}

/**
 * @kind motif
 * Perpetual idle wander for a RESTING element — mismatched x/y periods so
 * multiple instances never bob in lockstep. Start this only after any entry
 * tween on the same element has finished, not at the same time as one:
 * starting drift simultaneously with an entry motion composes into a
 * chaotic wobble-while-arriving instead of a clean arrival followed by a
 * settled idle. Different shape from every other motif here — no `.from`,
 * and the finite `{ to, duration, ease }` spec lives PER AXIS, not at the
 * top level: `floatDrift()` returns `{ x: { to, duration, ease }, y: {
 * to, duration, ease } }`. Never read `.x`/`.y` as numbers — each is its
 * own tween target. Feed each axis to its own infinite-yoyo tween on the
 * SAME layer:
 * ```ts
 * const drift = floatDrift();
 * gsap.to(layer.layers.idle, { x: drift.x.to, duration: drift.x.duration, ease: drift.x.ease, repeat: -1, yoyo: true, onUpdate: layer.apply });
 * gsap.to(layer.layers.idle, { y: drift.y.to, duration: drift.y.duration, ease: drift.y.ease, repeat: -1, yoyo: true, onUpdate: layer.apply });
 * ```
 */
export const floatDrift = ({
  ampX = 20,
  ampY = 25,
  periodX = 6,
  periodY = 7,
  seed = 0,
}: DriftParams = {}): { x: DriftAxis; y: DriftAxis } => ({
  x: { to: ampX, duration: periodX + seed * 0.4, ease: 'sine.inOut' },
  y: { to: ampY, duration: periodY + seed * 0.4, ease: 'sine.inOut' },
});
