export interface TransformLayer {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  scale: number;
  opacity: number;
}

export const emptyLayer = (over: Partial<TransformLayer> = {}): TransformLayer => ({
  x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, opacity: 1, ...over,
});

export interface LayeredElement<L extends string> {
  el: HTMLElement;
  layers: Record<L, TransformLayer>;
  /** Recomputes the composed transform/opacity and writes it to el.style. Call from every layer's onUpdate. */
  apply(): void;
}

export interface CreateLayeredElementOptions {
  /** Static offset applied outside every layer — e.g. a grid slot position, or -w/2,-h/2 to center on the layer origin. */
  origin?: { x: number; y: number; z?: number };
  /**
   * Center the element ON this point instead of computing origin yourself.
   * Measures el's own current rendered size (getBoundingClientRect) and sets
   * origin to `target - size / 2` for whichever axis you give — the correct
   * way to center an absolutely-positioned element via transform, done for
   * you instead of eyeballed. Overrides `origin` on that axis if both are
   * given. Not for an element that should fill/span its container (that's a
   * CSS sizing concern, e.g. `width: '100%'` — a different intent, don't
   * combine a nonzero origin/center on an axis with self-sizing CSS on that
   * same axis, they'll compound).
   */
  center?: { x?: number; y?: number };
}

/**
 * @kind primitive
 * The single-writer composition pattern: several independently-tweened
 * layers of motion (entry, idle drift, exit, reaction to something else...)
 * summed into ONE transform/opacity write per frame, so they compose instead
 * of fighting over the same element. Positions and rotations add; scale and
 * opacity multiply. Layers are plain mutable objects — tween them with
 * whatever animation engine you like (gsap, motion, raw rAF); call apply()
 * from that tween's onUpdate. For a channel outside transform/opacity (blur,
 * color), keep a parallel plain object and write it in the same onUpdate —
 * nothing here forces every property through apply().
 *
 * PRECONDITION: `el` must already be `position: absolute; left: 0; top: 0`
 * before apply() ever runs. `apply()` only ever writes `transform` — CSS
 * transforms visually offset whatever position the element already has,
 * they don't establish one. Leave an element in normal flow (or
 * flex-centered) and every translate3d() this writes stacks on top of that
 * existing positioning instead of replacing it, silently pushing the
 * element off-stage. This typechecks fine either way — there is no type
 * error for it — so get the positioning right before wiring an element
 * through createLayeredElement.
 *
 * To CENTER el on a point, use `opts.center` (see CreateLayeredElementOptions)
 * instead of hand-computing `origin` — it measures el's actual rendered size
 * for you. Also requires el to already be appended to the DOM with its final
 * content/style set (createLayeredElement reads its layout, so call it after
 * you've built the element, not before).
 */
export function createLayeredElement<L extends string>(
  el: HTMLElement,
  layerNames: readonly L[],
  opts: CreateLayeredElementOptions = {},
): LayeredElement<L> {
  const layers = Object.fromEntries(layerNames.map(name => [name, emptyLayer()])) as Record<L, TransformLayer>;
  const rect = (opts.center?.x !== undefined || opts.center?.y !== undefined) ? el.getBoundingClientRect() : null;
  const ox = opts.center?.x !== undefined ? opts.center.x - rect!.width / 2 : (opts.origin?.x ?? 0);
  const oy = opts.center?.y !== undefined ? opts.center.y - rect!.height / 2 : (opts.origin?.y ?? 0);
  const oz = opts.origin?.z ?? 0;

  const apply = () => {
    let x = ox, y = oy, z = oz, rx = 0, ry = 0, rz = 0, scale = 1, opacity = 1;
    for (const name of layerNames) {
      const l = layers[name];
      x += l.x; y += l.y; z += l.z;
      rx += l.rx; ry += l.ry; rz += l.rz;
      scale *= l.scale; opacity *= l.opacity;
    }
    el.style.transform =
      `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`;
    el.style.opacity = String(opacity);
  };

  return { el, layers, apply };
}
