export interface Point {
  x: number;
  y: number;
}

/**
 * @kind layout
 * Evenly spaced horizontal row of n slots, centered on (cx, cy).
 */
export const rowSlots = (n: number, cx: number, cy: number, w: number, gap: number): Point[] => {
  const total = n * w + (n - 1) * gap;
  const startX = cx - total / 2 + w / 2;
  return Array.from({ length: n }, (_, i) => ({ x: startX + i * (w + gap), y: cy }));
};

/**
 * @kind layout
 * Evenly spaced vertical column of n slots, centered on (cx, cy) — the
 * title/subtitle/badge-style vertical stack every title-card scene needs.
 * `gap` is a real parameter, not a magic number you eyeball per element:
 * pass a `space` token (e.g. `space.lg`) for a consistent rhythm instead of
 * hand-picking a different offset for every element in the stack.
 */
export const columnSlots = (n: number, cx: number, cy: number, h: number, gap: number): Point[] => {
  const total = n * h + (n - 1) * gap;
  const startY = cy - total / 2 + h / 2;
  return Array.from({ length: n }, (_, i) => ({ x: cx, y: startY + i * (h + gap) }));
};

export interface RingSlot {
  x: number;
  z: number;
  angleDeg: number;
}

/**
 * @kind layout
 * n slots evenly spaced around a circle of the given radius in the XZ plane
 * (for a 3D perspective ring/carousel) — angle 0 sits at +Z, facing the
 * camera.
 */
export const ringSlots = (n: number, radius: number, rotationDeg = 0): RingSlot[] => {
  const step = 360 / n;
  return Array.from({ length: n }, (_, i) => {
    const angleDeg = i * step + rotationDeg;
    const a = (angleDeg * Math.PI) / 180;
    return { x: Math.sin(a) * radius, z: Math.cos(a) * radius, angleDeg };
  });
};

/**
 * @kind layout
 * Given a list of element widths, returns centers for a row of that total
 * width centered on cx — used to reflow a pill/chip row as items join or
 * leave.
 */
export const reflowRow = (widths: number[], gap: number, cx: number): number[] => {
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, widths.length - 1);
  let cursor = cx - total / 2;
  return widths.map((w) => {
    const center = cursor + w / 2;
    cursor += w + gap;
    return center;
  });
};
