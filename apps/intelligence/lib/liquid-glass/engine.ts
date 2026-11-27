import { BACKGROUND_SHADER, FRAGMENT_SHADER, GLASS_VERTEX_SHADER, MAX_SURFACES, VERTEX_SHADER } from "./shader";
import { Spring } from "./spring";

/**
 * The liquid glass engine: one shared WebGL2 context and one fullscreen canvas for every glass surface on the page.
 *
 * - A scene (the content behind the glass) is painted into a 2D canvas each frame by a painter you provide, or taken from a
 *   live canvas/video, then uploaded as a mipmapped texture. WebGL cannot read live DOM, so whatever the glass should bend
 *   must be in that scene.
 * - DOM elements are registered as surfaces. Each frame their boxes are read (no layout writes in between, so no thrash),
 *   followed by springs (liquid lag and overshoot), deformed by hover and press springs, and drawn by a single shader pass.
 * - The loop runs only while something changes (live scene, springs moving, scrolling, CSS transitions, pointer) and stops
 *   while the tab is hidden. Resolution adapts to measured frame times. Context loss is handled; without WebGL2 the engine
 *   reports "unsupported" and shows the scene canvas directly so the page can fall back to CSS.
 */

export type GlassParams = {
  ior: number;
  thickness: number;
  bevel: number;
  dispersion: number;
  reflection: number;
  frost: number;
  magnify: number;
  merge: number;
  deform: number;
  shadow: number;
  theme: "dark" | "light";
};

export const DEFAULT_PARAMS: GlassParams = {
  ior: 1.45,
  thickness: 22,
  bevel: 22,
  dispersion: 0.035,
  reflection: 0.55,
  frost: 0,
  magnify: 0.05,
  merge: 14,
  deform: 1,
  shadow: 0.22,
  theme: "dark",
};

export type SurfaceOptions = {
  /** Corner radius in CSS px. Defaults to the element's computed border-top-left-radius. */
  radius?: number;
  /** Legibility tint, 0 = clear glass, ~0.35 = regular glass for text, ~0.6 = dense. */
  tint?: number;
  /** Respond to hover and press. Default true. */
  interactive?: boolean;
  /** Spring stiffness for following the element's box; 0 follows exactly. Default 520. */
  follow?: number;
};

export type EngineStatus = "starting" | "running" | "lost" | "unsupported";

export type EngineStats = {
  fps: number;
  frameMs: number;
  cpuMs: number;
  gpuMs: number | null;
  scale: number;
  dpr: number;
  width: number;
  height: number;
  surfaces: number;
  frames: number;
};

export type ScenePainter = (ctx: CanvasRenderingContext2D, info: { width: number; height: number; scale: number; time: number; dt: number; scrollY: number }) => void;

type Surface = {
  el: HTMLElement;
  opts: Required<Omit<SurfaceOptions, "radius">> & { radius?: number };
  radius: number;
  cx: Spring; cy: Spring; hw: Spring; hh: Spring;
  sx: Spring; sy: Spring;
  hover: Spring; press: Spring;
  px: Spring; py: Spring;
  pressTarget: number;
  fresh: boolean;
  lastW: number; lastH: number; alpha: number;
  cleanup: () => void;
};

const QUALITY_STEPS = [1, 0.85, 0.72, 0.6, 0.5];

export class LiquidGlassEngine {
  readonly canvas: HTMLCanvasElement;
  readonly sceneCanvas: HTMLCanvasElement;
  status: EngineStatus = "starting";
  onStatus?: (s: EngineStatus) => void;

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private bgProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;
  private bgLoc: Record<string, WebGLUniformLocation | null> = {};
  private buffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private timerExt: unknown = null;
  private queries: WebGLQuery[] = [];

  private params: GlassParams = { ...DEFAULT_PARAMS };
  private surfaces = new Map<HTMLElement, Surface>();
  private painter: ScenePainter | null = null;
  private sceneCtx: CanvasRenderingContext2D | null;
  private externalScene: TexImageSource | null = null;
  private sceneLive = true;
  private sceneDirty = true;

  private raf = 0;
  private lastT = 0;
  private time = 0;
  private awakeUntil = 0;
  private transitions = 0;
  private maxDpr: number;
  private qualityIndex = 0;
  private qualityLocked: number | null = null;
  private refreshMs = 1000 / 60;
  private deltas: number[] = [];
  private calmFrames = 0;
  private lastQualityChange = 0;
  /** Levels that recently failed the budget are not retried for a while, so quality never oscillates. */
  private failedAt = new Map<number, number>();
  private reduced: () => boolean;

  private mouse = { x: new Spring(-1, 260, 30), y: new Spring(-1, 260, 30), present: false };
  private scroll = { last: 0, v: new Spring(0, 120, 22), lastT: 0 };

  private stats: EngineStats = { fps: 0, frameMs: 0, cpuMs: 0, gpuMs: null, scale: 1, dpr: 1, width: 0, height: 0, surfaces: 0, frames: 0 };
  private cpuAcc: number[] = [];
  private gpuAcc: number[] = [];

  private rectBuf = new Float32Array(MAX_SURFACES * 4);
  private shapeBuf = new Float32Array(MAX_SURFACES * 4);
  private fxBuf = new Float32Array(MAX_SURFACES * 4);
  private alphaBuf = new Float32Array(MAX_SURFACES);
  private disposers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, options: { params?: Partial<GlassParams>; maxDpr?: number; reducedMotion?: () => boolean } = {}) {
    this.canvas = canvas;
    this.sceneCanvas = document.createElement("canvas");
    this.sceneCtx = this.sceneCanvas.getContext("2d", { alpha: false });
    this.maxDpr = options.maxDpr ?? 2;
    this.reduced = options.reducedMotion ?? (() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (options.params) Object.assign(this.params, options.params);
    this.listen();
    this.init();
  }

  // ---------- Public API ----------

  register(el: HTMLElement, options: SurfaceOptions = {}): () => void {
    this.unregister(el);
    const opts = { tint: options.tint ?? 0.3, interactive: options.interactive ?? true, follow: options.follow ?? 520, radius: options.radius };
    const s: Surface = {
      el, opts, radius: options.radius ?? readRadius(el),
      cx: new Spring(0), cy: new Spring(0), hw: new Spring(0), hh: new Spring(0),
      sx: new Spring(1, 520, 22), sy: new Spring(1, 520, 22),
      hover: new Spring(0, 170, 20), press: new Spring(0, 700, 30),
      px: new Spring(0, 300, 30), py: new Spring(0, 300, 30),
      pressTarget: 0, fresh: true, lastW: -1, lastH: -1, alpha: 1, cleanup: () => undefined,
    };
    for (const sp of [s.cx, s.cy, s.hw, s.hh]) { sp.stiffness = opts.follow || 1; sp.damping = 2 * Math.sqrt(sp.stiffness) * 0.72; }
    if (opts.interactive) {
      const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); s.px.target = e.clientX - (r.left + r.width / 2); s.py.target = e.clientY - (r.top + r.height / 2); };
      const enter = (e: PointerEvent) => { if (e.pointerType === "mouse") { s.hover.target = 1; local(e); if (s.hover.value < 0.05) { s.px.snap(s.px.target); s.py.snap(s.py.target); } } this.wake(); };
      const move = (e: PointerEvent) => { local(e); if (s.pressTarget > 0 && e.pressure > 0 && e.pointerType !== "mouse") s.press.target = pressureOf(e); this.wake(); };
      const leave = () => { s.hover.target = 0; s.press.target = 0; s.pressTarget = 0; this.wake(); };
      const down = (e: PointerEvent) => { local(e); s.pressTarget = pressureOf(e); s.press.target = s.pressTarget; this.wake(); };
      const up = () => { s.pressTarget = 0; s.press.target = 0; this.wake(); };
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointermove", move, { passive: true });
      el.addEventListener("pointerleave", leave);
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      s.cleanup = () => {
        el.removeEventListener("pointerenter", enter); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave);
        el.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      };
    }
    this.surfaces.set(el, s);
    this.wake();
    return () => this.unregister(el);
  }

  unregister(el: HTMLElement): void {
    const s = this.surfaces.get(el);
    if (!s) return;
    s.cleanup();
    this.surfaces.delete(el);
    this.wake();
  }

  /** Update a surface's options without re-registering (radius, tint…). */
  update(el: HTMLElement, options: SurfaceOptions): void {
    const s = this.surfaces.get(el);
    if (!s) return;
    if (options.tint !== undefined) s.opts.tint = options.tint;
    if (options.radius !== undefined) { s.opts.radius = options.radius; s.radius = options.radius; }
    this.wake();
  }

  setParams(p: Partial<GlassParams>): void { Object.assign(this.params, p); this.wake(); }
  getParams(): GlassParams { return { ...this.params }; }

  /** Paint the scene each frame with a 2D painter. `live` false paints only when invalidated (static backgrounds). */
  setScenePainter(painter: ScenePainter, live = true): void { this.painter = painter; this.externalScene = null; this.sceneLive = live; this.sceneDirty = true; this.wake(); }
  /** Use an existing canvas or video as the scene (re-uploaded every frame while live). */
  setSceneSource(source: TexImageSource, live = true): void { this.externalScene = source; this.painter = null; this.sceneLive = live; this.sceneDirty = true; this.wake(); }
  setSceneLive(live: boolean): void { this.sceneLive = live; this.sceneDirty = true; this.wake(); }

  /** Lock the render scale (0.3–1) or pass null for adaptive quality. */
  setQuality(scale: number | null): void { this.qualityLocked = scale; this.wake(); }
  getStats(): EngineStats { return { ...this.stats }; }

  /** Keep rendering for at least `ms` (for JS-driven animations the engine cannot observe). */
  wake(ms = 120): void {
    this.awakeUntil = Math.max(this.awakeUntil, performance.now() + ms);
    if (!this.raf && !document.hidden && this.status !== "lost") this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const s of this.surfaces.values()) s.cleanup();
    this.surfaces.clear();
    for (const d of this.disposers) d();
    this.disposers = [];
    this.releaseGL();
    const lose = this.gl?.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    this.gl = null;
    this.sceneCanvas.width = this.sceneCanvas.height = 0;
    this.sceneCanvas.remove();
  }

  // ---------- Setup ----------

  private setStatus(s: EngineStatus): void {
    this.status = s;
    document.documentElement.setAttribute("data-liquid-glass", s === "running" ? "gpu" : s === "starting" ? "starting" : "fallback");
    this.onStatus?.(s);
  }

  private init(): void {
    const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) { this.fallback(); return; }
    this.gl = gl;
    if (!this.buildGL()) { this.fallback(); return; }
    this.setStatus("running");
    this.wake(400);
  }

  private buildGL(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    const prog = link(gl, GLASS_VERTEX_SHADER, FRAGMENT_SHADER);
    const bg = link(gl, VERTEX_SHADER, BACKGROUND_SHADER);
    if (!prog || !bg) { if (prog) gl.deleteProgram(prog); if (bg) gl.deleteProgram(bg); return false; }
    this.program = prog;
    this.bgProgram = bg;
    for (const n of ["uScene", "uView", "uDpr"]) this.bgLoc[n] = gl.getUniformLocation(bg, n);
    this.emptyVao = gl.createVertexArray();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (const n of ["uScene", "uView", "uDpr", "uCount", "uRect", "uShape", "uFx", "uAlpha", "uIor", "uThickness", "uBevel", "uDispersion", "uReflection", "uFrost", "uMagnify", "uMerge", "uDeform", "uTheme", "uTint", "uMouse", "uScrollV", "uTime", "uShadow", "uMargin"]) {
      this.loc[n] = gl.getUniformLocation(prog, n);
    }
    this.timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.sceneDirty = true;
    return true;
  }

  private releaseGL(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    for (const q of this.queries) gl.deleteQuery(q);
    this.queries = [];
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    if (this.program) gl.deleteProgram(this.program);
    if (this.bgProgram) gl.deleteProgram(this.bgProgram);
    this.texture = this.buffer = this.vao = this.emptyVao = this.program = this.bgProgram = null;
  }

  private fallback(): void {
    // Show the scene itself where the glass canvas would be, so the page keeps its moving background.
    const c = this.sceneCanvas;
    c.setAttribute("aria-hidden", "true");
    c.className = this.canvas.className;
    c.style.cssText = this.canvas.style.cssText;
    this.canvas.style.display = "none";
    this.canvas.after(c);
    this.setStatus("unsupported");
    this.wake();
  }

  private listen(): void {
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => { window.addEventListener(t, f, o); this.disposers.push(() => window.removeEventListener(t, f)); };
    on("resize", () => { this.sceneDirty = true; this.wake(); }, { passive: true });
    on("scroll", () => {
      const now = performance.now(), y = window.scrollY, dt = Math.max(16, now - this.scroll.lastT);
      const v = Math.max(-1, Math.min(1, ((y - this.scroll.last) / dt) * 0.5));
      this.scroll.v.target = v; this.scroll.last = y; this.scroll.lastT = now; this.sceneDirty = true; this.wake(200);
    }, { passive: true });
    on("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      if (!this.mouse.present) { this.mouse.x.snap(e.clientX); this.mouse.y.snap(e.clientY); this.mouse.present = true; }
      this.mouse.x.target = e.clientX; this.mouse.y.target = e.clientY; this.wake();
    }, { passive: true });
    const outDoc = (e: MouseEvent) => { if (!e.relatedTarget) { this.mouse.present = false; this.wake(); } };
    document.addEventListener("mouseout", outDoc);
    this.disposers.push(() => document.removeEventListener("mouseout", outDoc));
    // CSS transitions and animations move elements without telling us; stay awake while any run.
    const tStart = () => { this.transitions++; this.wake(); };
    const tEnd = () => { this.transitions = Math.max(0, this.transitions - 1); this.wake(160); };
    for (const t of ["transitionrun", "animationstart"]) document.addEventListener(t, tStart);
    for (const t of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) document.addEventListener(t, tEnd);
    this.disposers.push(() => {
      for (const t of ["transitionrun", "animationstart"]) document.removeEventListener(t, tStart);
      for (const t of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) document.removeEventListener(t, tEnd);
    });
    const vis = () => { if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; } else { this.lastT = 0; this.wake(300); } };
    document.addEventListener("visibilitychange", vis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", vis));
    const lost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(this.raf); this.raf = 0; this.queries = []; this.setStatus("lost"); };
    const restored = () => { this.program = null; if (this.buildGL()) { this.setStatus("running"); this.wake(400); } else this.fallback(); };
    this.canvas.addEventListener("webglcontextlost", lost);
    this.canvas.addEventListener("webglcontextrestored", restored);
    this.disposers.push(() => { this.canvas.removeEventListener("webglcontextlost", lost); this.canvas.removeEventListener("webglcontextrestored", restored); });
    this.scroll.last = window.scrollY;
  }

  // ---------- Frame ----------

  private frame = (t: number): void => {
    this.raf = 0;
    const dt = this.lastT ? Math.min((t - this.lastT) / 1000, 0.1) : 1 / 60;
    if (this.lastT) this.trackFrame(t - this.lastT, t);
    this.lastT = t;
    const reduced = this.reduced();
    if (!reduced || !this.sceneLive) this.time += dt;
    const cpu0 = performance.now();

    const moving = this.stepSprings(dt, reduced);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const scale = this.qualityLocked ?? QUALITY_STEPS[this.qualityIndex];
    const vw = this.canvas.clientWidth || window.innerWidth, vh = this.canvas.clientHeight || window.innerHeight;

    // Scene first: paint into the 2D canvas at the current render scale.
    const live = this.sceneLive && !reduced;
    if (this.painter && (live || this.sceneDirty)) {
      const sw = Math.max(1, Math.round(vw * dpr * scale)), sh = Math.max(1, Math.round(vh * dpr * scale));
      if (this.sceneCanvas.width !== sw || this.sceneCanvas.height !== sh) { this.sceneCanvas.width = sw; this.sceneCanvas.height = sh; }
      if (this.status === "unsupported") { this.sceneCanvas.style.width = "100%"; this.sceneCanvas.style.height = "100%"; }
      const ctx = this.sceneCtx;
      if (ctx) {
        ctx.setTransform(sw / vw, 0, 0, sh / vh, 0, 0);
        this.painter(ctx, { width: vw, height: vh, scale: sw / vw, time: this.time, dt: live ? dt : 0, scrollY: window.scrollY });
      }
    }

    if (this.status === "running" && this.gl && !this.gl.isContextLost()) this.render(vw, vh, dpr * scale, live);
    this.sceneDirty = false;
    this.cpuAcc.push(performance.now() - cpu0);
    if (this.cpuAcc.length > 30) this.cpuAcc.shift();

    const keep = live || moving || this.transitions > 0 || performance.now() < this.awakeUntil;
    if (keep && !document.hidden) this.raf = requestAnimationFrame(this.frame);
    else this.lastT = 0;
  };

  private stepSprings(dt: number, reduced: boolean): boolean {
    let moving = false;
    const deform = reduced ? 0 : this.params.deform;
    const sx = window.scrollX, sy = window.scrollY;
    for (const s of this.surfaces.values()) {
      const r = s.el.getBoundingClientRect();
      // Radius and opacity come from CSS unless given: re-read when the box changes (a circle morphing into a panel) and each frame for opacity.
      if (s.opts.radius === undefined && (Math.abs(r.width - s.lastW) > 0.25 || Math.abs(r.height - s.lastH) > 0.25)) s.radius = readRadius(s.el);
      s.lastW = r.width; s.lastH = r.height;
      const op = parseFloat(getComputedStyle(s.el).opacity);
      s.alpha = Number.isFinite(op) ? op : 1;
      // Follow in page coordinates so scrolling never makes in-flow glass lag behind its content.
      const tx = r.left + r.width / 2 + sx, ty = r.top + r.height / 2 + sy;
      s.cx.target = tx; s.cy.target = ty; s.hw.target = r.width / 2; s.hh.target = r.height / 2;
      if (s.fresh || reduced || s.opts.follow === 0 || r.width === 0) { s.cx.snap(tx); s.cy.snap(ty); s.hw.snap(r.width / 2); s.hh.snap(r.height / 2); s.fresh = false; }
      const hw = Math.max(1, r.width / 2), hh = Math.max(1, r.height / 2);
      const squash = 3.2 * s.press.value * deform;
      const stretch = 1.6 * s.hover.value * deform;
      s.sx.target = 1 + (squash + stretch) / hw;
      s.sy.target = 1 + (stretch * 0.6 - squash * 0.85) / hh;
      if (reduced) { s.hover.snap(0); s.press.snap(0); }
      for (const sp of [s.cx, s.cy, s.hw, s.hh, s.sx, s.sy, s.hover, s.press, s.px, s.py]) {
        sp.step(dt);
        if (!sp.settled(sp === s.sx || sp === s.sy ? 0.0005 : sp === s.hover || sp === s.press ? 0.002 : 0.05)) moving = true;
      }
    }
    this.mouse.x.step(dt); this.mouse.y.step(dt);
    if (!this.mouse.x.settled(0.3) || !this.mouse.y.settled(0.3)) moving = true;
    this.scroll.v.target *= Math.pow(0.02, dt);
    this.scroll.v.step(dt);
    if (Math.abs(this.scroll.v.value) > 0.002 || Math.abs(this.scroll.v.target) > 0.002) moving = true;
    return moving;
  }

  private render(vw: number, vh: number, dprScaled: number, live: boolean): void {
    const gl = this.gl!;
    const W = Math.max(1, Math.round(vw * dprScaled)), H = Math.max(1, Math.round(vh * dprScaled));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const src = this.externalScene ?? this.sceneCanvas;
    if (live || this.sceneDirty || this.externalScene) {
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D); } catch { /* source not ready (video still loading) */ }
    }

    // Pass 1: the scene everywhere (one texture read per pixel).
    let q: WebGLQuery | null = null;
    const ext = this.timerExt as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    if (ext && this.queries.length < 4) { q = gl.createQuery(); if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.bgProgram);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(this.bgLoc.uScene, 0);
    gl.uniform2f(this.bgLoc.uView, vw, vh);
    gl.uniform1f(this.bgLoc.uDpr, W / vw);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2: glass, as one quad per visible surface. Surfaces: only those intersecting the viewport, nearest first is unnecessary (union is order-independent).
    const sx = window.scrollX, sy = window.scrollY;
    let n = 0;
    for (const s of this.surfaces.values()) {
      if (n >= MAX_SURFACES) break;
      const cx = s.cx.value - sx, cy = s.cy.value - sy, hw = s.hw.value, hh = s.hh.value;
      if (hw < 1 || hh < 1) continue;
      if (cx + hw < -60 || cx - hw > vw + 60 || cy + hh < -60 || cy - hh > vh + 60) continue;
      if (s.el.dataset.glassHidden === "true" || s.alpha < 0.004) continue;
      const o = n * 4;
      this.rectBuf[o] = cx; this.rectBuf[o + 1] = cy; this.rectBuf[o + 2] = hw; this.rectBuf[o + 3] = hh;
      this.shapeBuf[o] = s.radius; this.shapeBuf[o + 1] = s.sx.value; this.shapeBuf[o + 2] = s.sy.value; this.shapeBuf[o + 3] = Math.max(0, s.hover.value);
      this.fxBuf[o] = s.px.value; this.fxBuf[o + 1] = s.py.value; this.fxBuf[o + 2] = Math.max(0, s.press.value) * (this.reduced() ? 0 : 1); this.fxBuf[o + 3] = s.opts.tint;
      this.alphaBuf[n] = s.alpha;
      n++;
    }
    const p = this.params, L = this.loc;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.emptyVao);
    // Overlapping quads would shade the same pixel several times. All quads sit at the same depth with LESS testing, so the
    // first one claims the pixel and the rest are rejected before the fragment shader runs (the shader writes no depth).
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(L.uScene, 0);
    gl.uniform1f(L.uMargin, 36 + p.merge + p.deform * 4);
    gl.uniform2f(L.uView, vw, vh);
    gl.uniform1f(L.uDpr, W / vw);
    gl.uniform1i(L.uCount, n);
    gl.uniform4fv(L.uRect, this.rectBuf);
    gl.uniform4fv(L.uShape, this.shapeBuf);
    gl.uniform4fv(L.uFx, this.fxBuf);
    gl.uniform1fv(L.uAlpha, this.alphaBuf);
    gl.uniform1f(L.uIor, p.ior);
    gl.uniform1f(L.uThickness, p.thickness);
    gl.uniform1f(L.uBevel, p.bevel);
    gl.uniform1f(L.uDispersion, p.dispersion);
    gl.uniform1f(L.uReflection, p.reflection);
    gl.uniform1f(L.uFrost, p.frost);
    gl.uniform1f(L.uMagnify, p.magnify);
    gl.uniform1f(L.uMerge, p.merge);
    gl.uniform1f(L.uDeform, this.reduced() ? 0 : p.deform);
    gl.uniform1f(L.uTheme, p.theme === "light" ? 1 : 0);
    if (p.theme === "light") gl.uniform3f(L.uTint, 0.97, 0.98, 0.975); else gl.uniform3f(L.uTint, 0.055, 0.07, 0.066);
    gl.uniform2f(L.uMouse, this.mouse.present ? this.mouse.x.value : -1, this.mouse.present ? this.mouse.y.value : -1);
    gl.uniform1f(L.uScrollV, this.reduced() ? 0 : this.scroll.v.value);
    gl.uniform1f(L.uTime, this.time);
    gl.uniform1f(L.uShadow, p.shadow);

    if (n > 0) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    if (ext && q) { gl.endQuery(ext.TIME_ELAPSED_EXT); this.queries.push(q); }
    if (ext) this.pollQueries(ext);

    this.stats.width = W; this.stats.height = H; this.stats.surfaces = n; this.stats.scale = W / vw / Math.min(window.devicePixelRatio || 1, this.maxDpr); this.stats.dpr = W / vw;
    this.stats.frames++;
  }

  private pollQueries(ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }): void {
    const gl = this.gl!;
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      if (!disjoint) { this.gpuAcc.push(ns / 1e6); if (this.gpuAcc.length > 30) this.gpuAcc.shift(); }
      gl.deleteQuery(q);
      this.queries.shift();
    }
    if (this.gpuAcc.length) this.stats.gpuMs = this.gpuAcc.reduce((a, b) => a + b, 0) / this.gpuAcc.length;
  }

  /** Frame-time bookkeeping and adaptive resolution. */
  private trackFrame(delta: number, now: number): void {
    if (delta > 250) return;
    this.deltas.push(delta);
    if (this.deltas.length > 60) this.deltas.shift();
    const avg = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
    this.stats.frameMs = avg; this.stats.fps = 1000 / avg;
    this.stats.cpuMs = this.cpuAcc.length ? this.cpuAcc.reduce((a, b) => a + b, 0) / this.cpuAcc.length : 0;
    // The display's refresh interval: the fastest frames we see.
    if (this.deltas.length >= 20) {
      const sorted = [...this.deltas].sort((a, b) => a - b);
      this.refreshMs = Math.min(this.refreshMs * 0.98 + sorted[2] * 0.02, sorted[2]);
      if (this.qualityLocked !== null) return;
      const median = sorted[sorted.length >> 1];
      // Budget: 60 fps, or the display's refresh if that is slower. High-refresh screens are not chased at the cost of sharpness.
      const budget = Math.max(this.refreshMs, 1000 / 60);
      if (median > budget * 1.2 && this.qualityIndex < QUALITY_STEPS.length - 1 && now - this.lastQualityChange > 900) {
        this.failedAt.set(this.qualityIndex, now);
        this.qualityIndex++; this.lastQualityChange = now; this.deltas.length = 0; this.calmFrames = 0;
      } else if (median < budget * 0.8) {
        const up = this.qualityIndex - 1;
        const recentFail = now - (this.failedAt.get(up) ?? -1e9) < 30000;
        if (++this.calmFrames > 240 && up >= 0 && !recentFail && now - this.lastQualityChange > 4000) { this.qualityIndex = up; this.lastQualityChange = now; this.calmFrames = 0; }
      } else this.calmFrames = 0;
    }
  }
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return null; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("[liquid-glass] link failed", gl.getProgramInfoLog(prog)); gl.deleteProgram(prog); return null; }
  return prog;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn("[liquid-glass] shader compile failed", gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null; }
  return sh;
}

function readRadius(el: HTMLElement): number {
  const v = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return Number.isFinite(v) ? v : 16;
}

function pressureOf(e: PointerEvent): number {
  if (e.pointerType !== "mouse" && e.pressure > 0 && e.pressure !== 0.5) return Math.min(1, 0.35 + e.pressure * 0.9);
  return 0.8;
}
