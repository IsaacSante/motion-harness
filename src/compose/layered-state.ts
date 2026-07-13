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
 */
export function createLayeredElement<L extends string>(
  el: HTMLElement,
  layerNames: readonly L[],
  opts: CreateLayeredElementOptions = {},
): LayeredElement<L> {
  const layers = Object.fromEntries(layerNames.map(name => [name, emptyLayer()])) as Record<L, TransformLayer>;
  const ox = opts.origin?.x ?? 0;
  const oy = opts.origin?.y ?? 0;
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
