export interface AttribLayout {
  name: string;
  /** Component count — 1, 2, 3, or 4. */
  size: number;
}

export interface PointField {
  vbo: WebGLBuffer;
  count: number;
  /** Binds the buffer and wires every attribute location on the program passed to createPointField. */
  bind(): void;
  destroy(): void;
}

/**
 * @kind effect
 * Allocates an interleaved GL buffer of `count` points, each described by
 * `layout` (e.g. [{name:'aOrigin',size:2},{name:'aBirth',size:1}]), fills it
 * via `fill(i, out, offsetFloats)`, and returns a bind() that wires every
 * attribute location on `program` in one call — the interleaved-buffer
 * bookkeeping every point-sprite particle system repeats by hand.
 */
export function createPointField(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  count: number,
  layout: AttribLayout[],
  fill: (i: number, out: Float32Array, offsetFloats: number) => void,
): PointField {
  const floatsPerPoint = layout.reduce((s, l) => s + l.size, 0);
  const data = new Float32Array(count * floatsPerPoint);
  for (let i = 0; i < count; i++) {
    fill(i, data, i * floatsPerPoint);
  }
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  const strideBytes = floatsPerPoint * 4;
  let cursor = 0;
  const offsetsBytes = layout.map((l) => {
    const o = cursor * 4;
    cursor += l.size;
    return o;
  });

  return {
    vbo,
    count,
    bind() {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      layout.forEach((l, idx) => {
        const loc = gl.getAttribLocation(program, l.name);
        if (loc < 0) return;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, l.size, gl.FLOAT, false, strideBytes, offsetsBytes[idx]);
      });
    },
    destroy() {
      gl.deleteBuffer(vbo);
    },
  };
}
