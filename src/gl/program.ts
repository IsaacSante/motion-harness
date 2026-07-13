/**
 * @kind effect
 * Compiles and links a vertex/fragment shader pair, throwing with the GL
 * error log on failure — the compile/link dance every hand-rolled shader
 * effect needs, written once.
 */
export function compileProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`shader compile failed: ${log}`);
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`shader link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

/**
 * @kind effect
 * Uploads one oversized triangle covering the whole clip space — a cheaper
 * full-screen quad (one triangle instead of two). Bind the returned buffer
 * to your position attribute and draw with gl.TRIANGLES, 0, 3.
 */
export function createFullscreenTriangle(gl: WebGLRenderingContext): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return buf;
}

/**
 * @kind effect
 * Deletes a program's attached shaders and the program itself. Call from a
 * scene's exit() so shader-driven scenes don't leak GL objects across
 * repeated enter/exit cycles.
 */
export function destroyProgram(gl: WebGLRenderingContext, program: WebGLProgram) {
  gl.getAttachedShaders(program)?.forEach(sh => gl.deleteShader(sh));
  gl.deleteProgram(program);
}

/**
 * @kind effect
 * Forces a context to release GPU resources immediately rather than waiting
 * on GC — useful when a scene spins up a fresh WebGL context per instance
 * (e.g. one canvas per particle burst) and needs it gone before the next one
 * spawns.
 */
export function loseContext(gl: WebGLRenderingContext) {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
