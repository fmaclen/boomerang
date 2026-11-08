// The renderer: three programs over plain WebGL2. Pieces are instanced
// meshes drawn with 4x multisampling and a depth buffer, streaks lie flat
// behind them, and the composite lays the result over the ground through the
// shockwaves' lens.

import { boomerangMesh } from './mesh';
import { mod, type RGB } from './math';
import type { Pose } from './swarm';
import { FS_COMP, FS_PIECE, FS_SPARK, VS_FULL, VS_PIECE, VS_SPARK } from './shaders';

type Program = WebGLProgram & { u: (name: string) => WebGLUniformLocation | null };

interface Batch {
  data: Float32Array;
  buf: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  n: number;
  stride: number;
  max: number;
}

interface Target {
  msFb: WebGLFramebuffer;
  color: WebGLRenderbuffer;
  depth: WebGLRenderbuffer;
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

const WAVE_MAX = 16;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private progPiece: Program;
  private progSpark: Program;
  private progComp: Program;
  private meshCount: number;
  readonly solid: Batch;
  readonly soft: Batch;
  readonly sparks: Batch;
  private fullVao: WebGLVertexArrayObject;
  private target: Target | null = null;
  /** Shockwaves this frame: front radius, width, strength (px) and fade, and each one's colour. */
  readonly waves = new Float32Array(WAVE_MAX * 4);
  readonly waveCol = new Float32Array(WAVE_MAX * 3);
  waveN = 0;
  dpr = 1;

  static create(canvas: HTMLCanvasElement, maxPieces: number): Renderer | null {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    return gl ? new Renderer(canvas, gl, maxPieces) : null;
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, maxPieces: number) {
    this.canvas = canvas;
    this.gl = gl;
    this.progPiece = this.compile(VS_PIECE, FS_PIECE);
    this.progSpark = this.compile(VS_SPARK, FS_SPARK);
    this.progComp = this.compile(VS_FULL, FS_COMP);
    const mesh = boomerangMesh();
    this.meshCount = mesh.count;
    const meshPos = this.staticBuffer(gl.ARRAY_BUFFER, mesh.pos);
    const meshNor = this.staticBuffer(gl.ARRAY_BUFFER, mesh.nor);
    const meshIdx = gl.createBuffer()!;
    // Pieces come in two batches: solid ones, which hide what is behind them,
    // and ones still fading in or out, drawn over those without hiding anything.
    const pieceBatch = () => {
      const b = this.instanced(5, maxPieces);
      gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, meshNor);
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return b;
    };
    this.solid = pieceBatch();
    this.soft = pieceBatch();
    this.sparks = this.instanced(3, 1800);
    gl.bindVertexArray(null);
    this.fullVao = gl.createVertexArray()!;
  }

  private compile(vs: string, fs: string): Program {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${gl.getShaderInfoLog(s)}\n${src}`);
      return s;
    };
    const p = gl.createProgram()! as Program;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed');
    const loc = new Map<string, WebGLUniformLocation | null>();
    p.u = (name) => {
      if (!loc.has(name)) loc.set(name, gl.getUniformLocation(p, name));
      return loc.get(name)!;
    };
    return p;
  }

  private instanced(nVec4: number, max: number): Batch {
    const gl = this.gl;
    const data = new Float32Array(max * nVec4 * 4);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    for (let k = 0; k < nVec4; k++) {
      gl.enableVertexAttribArray(k);
      gl.vertexAttribPointer(k, 4, gl.FLOAT, false, nVec4 * 16, k * 16);
      gl.vertexAttribDivisor(k, 1);
    }
    return { data, buf, vao, n: 0, stride: nVec4 * 4, max };
  }

  private staticBuffer(target: number, data: Float32Array): WebGLBuffer {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  /** Sizes the canvas to the window at up to 2x, and the targets with it. */
  resize(w: number, h: number, dpr: number): void {
    const gl = this.gl;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.target) this.dropTarget(this.target);
    this.target = this.makeTarget(this.canvas.width, this.canvas.height);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    const rb = (fmt: number) => {
      const r = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
      return r;
    };
    const color = rb(gl.RGBA8);
    const depth = rb(gl.DEPTH_COMPONENT24);
    const msFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    // Linear filtering, so the shockwave's bent lookups stay smooth.
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { msFb, color, depth, tex, fb, w, h };
  }

  private dropTarget(t: Target): void {
    const gl = this.gl;
    gl.deleteFramebuffer(t.msFb);
    gl.deleteRenderbuffer(t.color);
    gl.deleteRenderbuffer(t.depth);
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
  }

  begin(): void {
    this.solid.n = 0;
    this.soft.n = 0;
    this.sparks.n = 0;
    this.waveN = 0;
  }

  /** One piece. shade darkens it without making it see-through; alpha fades it. push is its eased shove on screen and the turn it adds. */
  piece(o: Pose, col: RGB, shade: number, alpha: number, heat: number, push: [number, number, number]): void {
    if (alpha <= 0.003) return;
    const b = alpha >= 0.995 ? this.solid : this.soft;
    if (b.n >= b.max) return;
    const d = b.data;
    const k = b.n * b.stride;
    d[k] = mod(o.th);
    d[k + 1] = o.r;
    d[k + 2] = o.Om;
    d[k + 3] = o.incl;
    d[k + 4] = o.size;
    d[k + 5] = mod(o.spin);
    d[k + 6] = heat;
    d[k + 7] = o.bank;
    d[k + 8] = col[0] * shade;
    d[k + 9] = col[1] * shade;
    d[k + 10] = col[2] * shade;
    d[k + 11] = Math.min(alpha, 1);
    const off = o.off;
    d[k + 12] = off ? off[0] : 0;
    d[k + 13] = off ? off[1] : 0;
    d[k + 14] = off ? off[2] : 0;
    d[k + 15] = o.w;
    d[k + 16] = push[0] + o.sx;
    d[k + 17] = push[1] + o.sy;
    d[k + 18] = push[2];
    d[k + 19] = 0;
    b.n++;
  }

  /** A streak from tail to head; an even one keeps its strength along its length. */
  spark(hx: number, hy: number, tx: number, ty: number, col: RGB, alpha: number, width: number, even = false): void {
    const b = this.sparks;
    if (b.n >= b.max || alpha <= 0.002) return;
    const d = b.data;
    const k = b.n * b.stride;
    d[k] = hx;
    d[k + 1] = hy;
    d[k + 2] = tx;
    d[k + 3] = ty;
    d[k + 4] = col[0];
    d[k + 5] = col[1];
    d[k + 6] = col[2];
    d[k + 7] = alpha;
    d[k + 8] = width;
    d[k + 9] = even ? 1 : 0;
    d[k + 10] = 0;
    d[k + 11] = 0;
    b.n++;
  }

  wave(R: number, w: number, strength: number, fade: number, col: RGB): void {
    if (this.waveN >= WAVE_MAX) return;
    this.waves.set([R, w, strength, fade], this.waveN * 4);
    this.waveCol.set(col, this.waveN * 3);
    this.waveN++;
  }

  /**
   * Draws the frame: the scene seen from (off, zoom) in a W x H window with
   * the camera at cam, then the composite. hand is the parallax, and waveC the
   * shockwaves' centre in device pixels with y up.
   */
  draw(W: number, H: number, off: [number, number], zoom: number, cam: number, hand: [number, number], waveC: [number, number]): void {
    const gl = this.gl;
    const t = this.target;
    if (!t) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFb);
    gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const b of [this.sparks, this.solid, this.soft]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n * b.stride);
    }
    const uniforms = (p: Program) => {
      gl.useProgram(p);
      gl.uniform2f(p.u('u_res'), W, H);
      gl.uniform2f(p.u('u_off'), off[0], off[1]);
      gl.uniform1f(p.u('u_zoom'), zoom);
      gl.uniform1f(p.u('u_cam'), cam);
    };
    // Streaks lie flat behind everything; the pieces hide one another by
    // depth, solid ones first, then the ones fading in or out over them.
    if (this.sparks.n) {
      gl.bindVertexArray(this.sparks.vao);
      uniforms(this.progSpark);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.sparks.n);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    const pieces = (b: Batch) => {
      if (!b.n) return;
      gl.bindVertexArray(b.vao);
      uniforms(this.progPiece);
      gl.uniform2f(this.progPiece.u('u_hand'), hand[0], hand[1]);
      gl.drawElementsInstanced(gl.TRIANGLES, this.meshCount, gl.UNSIGNED_SHORT, 0, b.n);
    };
    pieces(this.solid);
    gl.depthMask(false);
    pieces(this.soft);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msFb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fb);
    gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    const p = this.progComp;
    gl.bindVertexArray(this.fullVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(p.u('u_scene'), 0);
    gl.uniform2f(p.u('u_px'), 1 / t.w, 1 / t.h);
    for (let k = 0; k < this.waveN; k++) for (let q = 0; q < 3; q++) this.waves[k * 4 + q] *= this.dpr;
    gl.uniform4fv(p.u('u_wave'), this.waves);
    gl.uniform3fv(p.u('u_waveCol'), this.waveCol);
    gl.uniform1i(p.u('u_waves'), this.waveN);
    gl.uniform2f(p.u('u_waveC'), ...waveC);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
