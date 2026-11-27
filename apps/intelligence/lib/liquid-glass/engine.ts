import { BLIT_FS, FULLSCREEN_VS, GLASS_FS, GLASS_VS, SCENE_FS } from "./shader";
import { Spring } from "./spring";
import { IDLE_FREEZE_MS, MATERIALS, OVERSCAN_PX, QUALITY_STEPS, SPRINGS, TIERS, type Material, type MaterialName, type Tier } from "./tokens";

/**
 * The Liquid Glass engine: one WebGL2 context and one canvas for the whole application.
 *
 * Frame:
 *   1. Measure the visible surfaces (only when something could have moved: scroll, resize, DOM change, transition, pointer).
 *   2. Step springs (indicator travel, squash and stretch, hover and press, pointer light, theme crossfade).
 *   3. Render the environment into a mipmapped texture (only when it changed: time, scroll parallax, pointer, theme).
 *   4. Draw the environment, then every surface's glass in one instanced call, in stacking order.
 *   5. Copy the glass of elevated surfaces (top bar, dialogs, menus…) into their mirrors, which sit above the content they cover.
 *
 * The canvas lives in the document, re-anchored to the scroll position each frame, so in-flow glass scrolls with its content on the
 * compositor and never lags it. Scheduling: every frame while something moves; a capped ambient rate while the environment drifts;
 * nothing at all when idle, hidden, or for reduced motion. Resolution adapts to measured frame times; context loss is recovered.
 */

export type SurfaceOptions = {
  material?: MaterialName;
  /** Overrides on top of the material. */
  overrides?: Partial<Material>;
  /** Stacking order; higher draws later (on top). */
  layer?: number;
  /** "layer": a fixed mirror canvas under the element (fixed/sticky chrome). "inner": a mirror canvas inside the element (portalled overlays). */
  mirror?: "none" | "layer" | "inner";
  /** React to hover and press. */
  interactive?: boolean;
  /** Read the element's opacity every frame (elements that fade in and out). */
  fades?: boolean;
  /** Corner radius in CSS px; default: the element's computed border radius. */
  radius?: number;
};

export type EngineStatus = "starting" | "running" | "lost" | "unsupported";

export type EngineStats = {
  status: EngineStatus;
  tier: Tier;
  fps: number;
  frameMs: number;
  cpuMs: number;
  gpuMs: number | null;
  scale: number;
  dpr: number;
  width: number;
  height: number;
  surfaces: number;
  drawn: number;
  mirrors: number;
  frames: number;
  sceneFrames: number;
  ambient: boolean;
  renderer: string;
};

export type Palette = {
  baseTop: number[]; baseBottom: number[]; envA: number[]; envB: number[]; light: number[]; line: number[];
  tint: number[]; accent: number[]; lightTheme: number;
};

type Surface = {
  el: HTMLElement;
  mat: Material;
  layer: number;
  mirror: "none" | "layer" | "inner";
  interactive: boolean;
  fades: boolean;
  fixedRadius: number | null;
  radius: number;
  fixed: boolean;
  visible: boolean;
  shown: boolean;
  alpha: number;
  w: number; h: number;
  cx: Spring; cy: Spring; hw: Spring; hh: Spring;
  sx: Spring; sy: Spring; hover: Spring; press: Spring; px: Spring; py: Spring;
  fresh: boolean;
  mirrorCanvas: HTMLCanvasElement | null;
  mirrorCtx: CanvasRenderingContext2D | null;
  zIndex: number;
  cleanup: () => void;
};

const FLOATS = 28;
const ATTRS = 7;

export class LiquidGlassEngine {
  readonly canvas: HTMLCanvasElement;
  status: EngineStatus = "starting";
  onStatus?: (s: EngineStatus) => void;

  private stage: HTMLElement;
  private mirrorLayer: HTMLElement;
  private gl: WebGL2RenderingContext | null = null;
  private progScene: WebGLProgram | null = null;
  private progBlit: WebGLProgram | null = null;
  private progGlass: WebGLProgram | null = null;
  private vaoEmpty: WebGLVertexArrayObject | null = null;
  private vaoGlass: WebGLVertexArrayObject | null = null;
  private instBuf: WebGLBuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneW = 0; private sceneH = 0;
  private photoTex: WebGLTexture | null = null;
  private photo: HTMLImageElement | null = null;
  private photoUrl: string | null = null;
  private photoOn = new Spring(0, 40, 13);
  private uScene: Record<string, WebGLUniformLocation | null> = {};
  private uBlit: Record<string, WebGLUniformLocation | null> = {};
  private uGlass: Record<string, WebGLUniformLocation | null> = {};
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private queries: WebGLQuery[] = [];
  private renderer = "";

  tier: Tier;
  private surfaces = new Map<HTMLElement, Surface>();
  private order: Surface[] = [];
  private orderDirty = true;
  private inst = new Float32Array(64 * FLOATS);
  private instBytes = 0;
  /** Clock for the rim wobble of pressed or hovered glass; runs even while the environment is still. */
  private fxTime = 0;
  private io: IntersectionObserver;
  private ro: ResizeObserver;

  private raf = 0;
  private timer = 0;
  private lastT = 0;
  private time = 0;
  private activeUntil = 0;
  private transitions = 0;
  private lastInput = performance.now();
  private layoutDirty = true;
  private sceneDirty = true;
  private anchorY = 0;
  private anchorX = 0;

  private qualityIndex = 0;
  private qualityLocked: number | null = null;
  private refreshMs = 1000 / 60;
  private deltas: number[] = [];
  private calmFrames = 0;
  private lastQualityChange = 0;
  private failedAt = new Map<number, number>();
  private reduced: () => boolean;

  private mouse = { x: new Spring(-1, SPRINGS.light.stiffness, SPRINGS.light.damping), y: new Spring(-1, SPRINGS.light.stiffness, SPRINGS.light.damping), present: false };
  private scroll = { last: 0, lastT: 0, v: new Spring(0, 120, 22) };
  private palette: Palette | null = null;
  private colors: { cur: number[]; target: number[]; v: number[] } = { cur: [], target: [], v: [] };

  private stats: EngineStats;
  private cpuAcc: number[] = [];
  private gpuAcc: number[] = [];
  private disposers: (() => void)[] = [];

  constructor(opts: { canvas: HTMLCanvasElement; stage: HTMLElement; mirrorLayer: HTMLElement; tier: Tier; reducedMotion: () => boolean }) {
    this.canvas = opts.canvas;
    this.stage = opts.stage;
    this.mirrorLayer = opts.mirrorLayer;
    this.tier = opts.tier;
    this.reduced = opts.reducedMotion;
    this.stats = { status: "starting", tier: this.tier, fps: 0, frameMs: 0, cpuMs: 0, gpuMs: null, scale: 1, dpr: 1, width: 0, height: 0, surfaces: 0, drawn: 0, mirrors: 0, frames: 0, sceneFrames: 0, ambient: false, renderer: "" };
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) { const s = this.surfaces.get(e.target as HTMLElement); if (s) s.visible = e.isIntersecting; }
      this.invalidate();
    }, { rootMargin: `${OVERSCAN_PX + 160}px 0px` });
    this.ro = new ResizeObserver(() => this.invalidate());
    this.listen();
    this.init();
  }

  // ---------- Public API ----------

  register(el: HTMLElement, o: SurfaceOptions = {}): () => void {
    this.unregister(el);
    const mat: Material = { ...MATERIALS[o.material ?? "standard"], ...o.overrides };
    const follow = SPRINGS.follow;
    const mk = (v: number, st: { stiffness: number; damping: number }) => new Spring(v, st.stiffness, st.damping);
    const s: Surface = {
      el, mat, layer: o.layer ?? 0, mirror: o.mirror ?? "none", interactive: o.interactive ?? false, fades: o.fades ?? false,
      fixedRadius: o.radius ?? null, radius: o.radius ?? readRadius(el), fixed: false, visible: true, shown: false, alpha: 1, w: -1, h: -1,
      cx: mk(0, follow), cy: mk(0, follow), hw: mk(0, { stiffness: follow.stiffness * 1.6, damping: follow.damping * 1.3 }), hh: mk(0, { stiffness: follow.stiffness * 1.6, damping: follow.damping * 1.3 }),
      sx: mk(1, SPRINGS.shape), sy: mk(1, SPRINGS.shape), hover: mk(0, SPRINGS.hover), press: mk(0, SPRINGS.press), px: mk(0, { stiffness: 300, damping: 30 }), py: mk(0, { stiffness: 300, damping: 30 }),
      fresh: true, mirrorCanvas: null, mirrorCtx: null, zIndex: 0, cleanup: () => undefined,
    };
    s.fixed = inFixedContext(el);
    if (s.mirror !== "none") this.attachMirror(s);
    const disposers: (() => void)[] = [];
    if (s.interactive) {
      const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); s.px.target = e.clientX - (r.left + r.width / 2); s.py.target = e.clientY - (r.top + r.height / 2); };
      const enter = (e: PointerEvent) => { if (e.pointerType === "mouse") { s.hover.target = 1; local(e); if (s.hover.value < 0.05) { s.px.snap(s.px.target); s.py.snap(s.py.target); } } this.wake(); };
      const move = (e: PointerEvent) => { local(e); this.wake(); };
      const leave = () => { s.hover.target = 0; s.press.target = 0; this.wake(); };
      const down = (e: PointerEvent) => { local(e); s.press.target = e.pointerType !== "mouse" && e.pressure > 0 && e.pressure !== 0.5 ? Math.min(1, 0.35 + e.pressure * 0.9) : 0.8; this.wake(); };
      const up = () => { s.press.target = 0; this.wake(); };
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointermove", move, { passive: true });
      el.addEventListener("pointerleave", leave);
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      disposers.push(() => {
        el.removeEventListener("pointerenter", enter); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave);
        el.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      });
    }
    if (!s.fixed && s.mirror === "none") this.io.observe(el);
    this.ro.observe(el);
    // CSS clears the solid fallback material only on elements that really have GPU glass behind them.
    el.classList.add("lg-on");
    s.cleanup = () => { for (const d of disposers) d(); this.io.unobserve(el); this.ro.unobserve(el); this.detachMirror(s); el.classList.remove("lg-on"); };
    this.surfaces.set(el, s);
    this.orderDirty = true;
    this.invalidate();
    return () => this.unregister(el);
  }

  unregister(el: HTMLElement): void {
    const s = this.surfaces.get(el);
    if (!s) return;
    s.cleanup();
    this.surfaces.delete(el);
    this.orderDirty = true;
    this.invalidate();
  }

  has(el: HTMLElement): boolean { return this.surfaces.has(el); }

  /** Something on the page changed (DOM, layout, fonts): measure again and render. */
  invalidate(): void { this.layoutDirty = true; this.wake(); }

  setPalette(p: Palette): void {
    this.palette = p;
    const flat = [...p.baseTop, ...p.baseBottom, ...p.envA, ...p.envB, ...p.light, ...p.line, ...p.tint, ...p.accent, p.lightTheme];
    if (!this.colors.cur.length || this.reduced()) { this.colors.cur = [...flat]; this.colors.v = flat.map(() => 0); }
    this.colors.target = flat;
    this.sceneDirty = true;
    this.wake(900);
  }

  /** A photograph as the environment (sign-in), or null for the studio. Same-origin URLs only. */
  setPhoto(url: string | null): void {
    if (url === this.photoUrl) return;
    this.photoUrl = url;
    if (!url) { this.photoOn.target = 0; this.wake(1200); return; }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { if (this.photoUrl !== url) return; this.photo = img; this.uploadPhoto(); this.photoOn.target = 1; this.sceneDirty = true; this.wake(1400); };
    img.src = url;
  }

  /** Change the quality tier (for example after learning the GPU is a software renderer). */
  setTier(t: Tier): void { this.tier = t; this.stats.tier = t; this.qualityIndex = 0; this.sceneDirty = true; this.invalidate(); }
  get rendererName(): string { return this.renderer; }

  setQuality(scale: number | null): void { this.qualityLocked = scale; this.invalidate(); }
  getStats(): EngineStats { return { ...this.stats, status: this.status }; }

  /** Keep rendering every frame for at least `ms`. */
  wake(ms = 160): void {
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms);
    this.schedule(0);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf); clearTimeout(this.timer); this.raf = 0; this.timer = 0;
    for (const s of this.surfaces.values()) s.cleanup();
    this.surfaces.clear();
    this.io.disconnect(); this.ro.disconnect();
    for (const d of this.disposers) d();
    this.disposers = [];
    this.releaseGL();
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
  }

  // ---------- Setup ----------

  private setStatus(s: EngineStatus): void {
    this.status = s;
    this.stats.status = s;
    this.onStatus?.(s);
  }

  private init(): void {
    const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) { this.setStatus("unsupported"); return; }
    this.gl = gl;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    this.stats.renderer = this.renderer;
    if (!this.buildGL()) { this.setStatus("unsupported"); return; }
    this.wake(400);
  }

  private buildGL(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    this.progScene = link(gl, FULLSCREEN_VS, SCENE_FS);
    this.progBlit = link(gl, FULLSCREEN_VS, BLIT_FS);
    this.progGlass = link(gl, GLASS_VS, GLASS_FS);
    if (!this.progScene || !this.progBlit || !this.progGlass) return false;
    const loc = (p: WebGLProgram, names: string[]) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
    this.uScene = loc(this.progScene, ["uRes", "uDpr", "uOrigin", "uViewport", "uScroll", "uTime", "uBaseTop", "uBaseBottom", "uEnvA", "uEnvB", "uLight", "uLine", "uLightTheme", "uPointer", "uPhoto", "uPhotoOn", "uPhotoSize"]);
    this.uBlit = loc(this.progBlit, ["uScene", "uRes"]);
    this.uGlass = loc(this.progGlass, ["uScene", "uView", "uDpr", "uTime", "uTint", "uAccent", "uLightTheme", "uMouse", "uScrollV", "uSpectral"]);
    this.vaoEmpty = gl.createVertexArray();
    this.vaoGlass = gl.createVertexArray();
    gl.bindVertexArray(this.vaoGlass);
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    this.instBytes = this.inst.byteLength;
    for (let i = 0; i < ATTRS; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, FLOATS * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
    this.sceneTex = null;
    this.sceneFbo = gl.createFramebuffer();
    this.sceneW = this.sceneH = 0;
    this.photoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.photo) this.uploadPhoto();
    this.timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2") as typeof this.timerExt;
    this.sceneDirty = true;
    return true;
  }

  private uploadPhoto(): void {
    const gl = this.gl;
    if (!gl || !this.photo || gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.photo);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } catch { /* decoding failed: the studio stays */ }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private ensureSceneTarget(w: number, h: number): void {
    const gl = this.gl!;
    if (w === this.sceneW && h === this.sceneH) return;
    this.sceneW = w; this.sceneH = h;
    // Immutable storage with the full mip chain: the glass samples blurred levels for frost and reflections.
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.sceneDirty = true;
  }

  private releaseGL(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    for (const q of this.queries) gl.deleteQuery(q);
    this.queries = [];
    for (const p of [this.progScene, this.progBlit, this.progGlass]) if (p) gl.deleteProgram(p);
    if (this.vaoEmpty) gl.deleteVertexArray(this.vaoEmpty);
    if (this.vaoGlass) gl.deleteVertexArray(this.vaoGlass);
    if (this.instBuf) gl.deleteBuffer(this.instBuf);
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.photoTex) gl.deleteTexture(this.photoTex);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    this.progScene = this.progBlit = this.progGlass = null;
    this.vaoEmpty = this.vaoGlass = null;
    this.instBuf = null; this.sceneTex = this.photoTex = null; this.sceneFbo = null;
  }

  private listen(): void {
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => { window.addEventListener(t, f, o); this.disposers.push(() => window.removeEventListener(t, f, o)); };
    const input = () => { this.lastInput = performance.now(); };
    on("resize", () => { this.sceneDirty = true; for (const s of this.surfaces.values()) s.fixed = inFixedContext(s.el); this.invalidate(); }, { passive: true });
    // Capture: scrolls of any element (tables, dialogs, the sidebar) move glass too.
    const onScroll = (e: Event) => {
      input();
      if (e.target === document || e.target === document.documentElement || e.target === document.body) {
        const now = performance.now(), y = window.scrollY, dt = Math.max(16, now - this.scroll.lastT);
        this.scroll.v.target = Math.max(-1, Math.min(1, ((y - this.scroll.last) / dt) * 0.5));
        this.scroll.last = y; this.scroll.lastT = now; this.sceneDirty = true;
      }
      this.layoutDirty = true;
      this.wake(240);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    this.disposers.push(() => document.removeEventListener("scroll", onScroll, { capture: true }));
    on("pointermove", (e) => {
      input();
      if (e.pointerType !== "mouse") return;
      if (!this.mouse.present) { this.mouse.x.snap(e.clientX); this.mouse.y.snap(e.clientY); this.mouse.present = true; }
      this.mouse.x.target = e.clientX; this.mouse.y.target = e.clientY; this.sceneDirty = true; this.wake();
    }, { passive: true });
    on("pointerdown", () => { input(); this.invalidate(); }, { passive: true });
    on("keydown", () => { input(); this.invalidate(); });
    on("touchstart", () => input(), { passive: true });
    const outDoc = (e: MouseEvent) => { if (!e.relatedTarget) { this.mouse.present = false; this.sceneDirty = true; this.wake(); } };
    document.addEventListener("mouseout", outDoc);
    this.disposers.push(() => document.removeEventListener("mouseout", outDoc));
    // CSS transitions and animations move elements without telling us: render every frame while any run.
    const tStart = () => { this.transitions++; this.invalidate(); };
    const tEnd = () => { this.transitions = Math.max(0, this.transitions - 1); this.invalidate(); };
    for (const t of ["transitionrun", "animationstart"]) document.addEventListener(t, tStart);
    for (const t of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) document.addEventListener(t, tEnd);
    this.disposers.push(() => {
      for (const t of ["transitionrun", "animationstart"]) document.removeEventListener(t, tStart);
      for (const t of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) document.removeEventListener(t, tEnd);
    });
    // Infinite CSS animations (spinners) never end: the counter is reset now and then so it cannot keep the GPU awake forever.
    const drain = window.setInterval(() => { this.transitions = 0; }, 4000);
    this.disposers.push(() => window.clearInterval(drain));
    const vis = () => { if (document.hidden) { cancelAnimationFrame(this.raf); clearTimeout(this.timer); this.raf = 0; this.timer = 0; } else { this.lastT = 0; input(); this.invalidate(); } };
    document.addEventListener("visibilitychange", vis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", vis));
    void document.fonts?.ready.then(() => this.invalidate());
    const lost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(this.raf); this.raf = 0; this.queries = []; this.setStatus("lost"); };
    const restored = () => { this.sceneW = this.sceneH = 0; if (this.buildGL()) { this.setStatus("running"); this.invalidate(); } else this.setStatus("unsupported"); };
    this.canvas.addEventListener("webglcontextlost", lost);
    this.canvas.addEventListener("webglcontextrestored", restored);
    this.disposers.push(() => { this.canvas.removeEventListener("webglcontextlost", lost); this.canvas.removeEventListener("webglcontextrestored", restored); });
    this.scroll.last = window.scrollY;
  }

  // ---------- Scheduling ----------

  private ambientActive(): boolean {
    const fps = TIERS[this.tier].ambientFps;
    return fps > 0 && !this.reduced() && performance.now() - this.lastInput < IDLE_FREEZE_MS;
  }

  private schedule(delay: number): void {
    if (document.hidden || this.status === "lost" || this.status === "unsupported") return;
    if (delay <= 0) {
      if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
      if (!this.raf) this.raf = requestAnimationFrame(this.frame);
      return;
    }
    if (this.raf || this.timer) return;
    this.timer = window.setTimeout(() => { this.timer = 0; if (!this.raf) this.raf = requestAnimationFrame(this.frame); }, delay);
  }

  // ---------- Frame ----------

  private frame = (t: number): void => {
    this.raf = 0;
    if (!this.gl || this.gl.isContextLost()) return;
    const now = performance.now();
    const continuous = now < this.activeUntil || this.transitions > 0;
    const dt = this.lastT ? Math.min((t - this.lastT) / 1000, 0.1) : 1 / 60;
    if (this.lastT && continuous) this.trackFrame(t - this.lastT, t);
    this.lastT = t;
    const reduced = this.reduced();
    const ambient = this.ambientActive();
    if (ambient) { this.time += dt; this.sceneDirty = true; }
    this.fxTime = (this.fxTime + dt) % 600;
    const cpu0 = performance.now();

    const moving = this.step(dt, reduced);
    this.render();
    this.cpuAcc.push(performance.now() - cpu0);
    if (this.cpuAcc.length > 30) this.cpuAcc.shift();
    this.stats.ambient = ambient;

    if (moving || now < this.activeUntil || this.transitions > 0) this.schedule(0);
    else if (ambient) { this.lastT = 0; this.schedule(Math.max(0, 1000 / TIERS[this.tier].ambientFps - 6)); }
    else this.lastT = 0;
  };

  private step(dt: number, reduced: boolean): boolean {
    let moving = false;
    const sx = window.scrollX, sy = window.scrollY;
    if (this.orderDirty) { this.order = [...this.surfaces.values()].sort((a, b) => a.layer - b.layer); this.orderDirty = false; }
    // CSS transitions and animations move elements without layout events: measure every frame while any run.
    const measure = this.layoutDirty || this.transitions > 0;
    this.layoutDirty = false;
    for (const s of this.order) {
      const springy = s.mat.spring && !reduced;
      const animated = s.interactive || springy;
      if (!measure && !animated) continue;
      if (!s.visible && !s.fixed && s.mirror === "none") { s.shown = false; continue; }
      const r = s.el.getBoundingClientRect();
      s.shown = r.width > 0.5 && r.height > 0.5 && s.el.dataset.glassHidden !== "true";
      if (!s.shown) { s.fresh = true; continue; }
      if (s.fixedRadius === null && (Math.abs(r.width - s.w) > 0.25 || Math.abs(r.height - s.h) > 0.25)) s.radius = readRadius(s.el);
      s.w = r.width; s.h = r.height;
      if (s.fades) { const op = parseFloat(getComputedStyle(s.el).opacity); s.alpha = Number.isFinite(op) ? op : 1; }
      // Fixed chrome follows in viewport coordinates, in-flow glass in page coordinates, so scrolling never makes either lag.
      const ox = s.fixed ? 0 : sx, oy = s.fixed ? 0 : sy;
      const tx = r.left + r.width / 2 + ox, ty = r.top + r.height / 2 + oy;
      s.cx.target = tx; s.cy.target = ty; s.hw.target = r.width / 2; s.hh.target = r.height / 2;
      if (s.fresh || !springy) { s.cx.snap(tx); s.cy.snap(ty); s.hw.snap(r.width / 2); s.hh.snap(r.height / 2); s.fresh = false; }
    }
    for (const s of this.order) {
      if (!s.shown) continue;
      const springy = s.mat.spring && !reduced;
      const deform = reduced ? 0 : s.mat.deform;
      if (!springy && !s.interactive) continue;
      const hw = Math.max(1, s.hw.target), hh = Math.max(1, s.hh.target);
      let tsx = 1, tsy = 1;
      // Mirrored surfaces keep their silhouette (their mirror is clipped to the element); the dome and light still respond.
      if (s.mirror === "none") {
        const squash = 3.2 * s.press.value * deform, stretch = 1.6 * s.hover.value * deform;
        tsx += (squash + stretch) / hw; tsy += (stretch * 0.6 - squash * 0.85) / hh;
        if (springy) {
          // Travel stretches the droplet along its motion and thins it across (volume roughly kept).
          const vx = s.cx.velocity, vy = s.cy.velocity;
          const k = Math.min(0.32, Math.hypot(vx, vy) / 2600);
          const ax = Math.abs(vx) >= Math.abs(vy);
          tsx *= ax ? 1 + k : 1 - k * 0.45; tsy *= ax ? 1 - k * 0.45 : 1 + k;
        }
      }
      s.sx.target = tsx; s.sy.target = tsy;
      if (reduced) { s.hover.snap(0); s.press.snap(0); }
      for (const sp of springy ? [s.cx, s.cy, s.hw, s.hh] : []) { sp.step(dt); if (!sp.settled(0.05)) moving = true; }
      for (const sp of [s.sx, s.sy, s.hover, s.press, s.px, s.py]) {
        sp.step(dt);
        if (!sp.settled(sp === s.sx || sp === s.sy ? 0.0005 : sp === s.hover || sp === s.press ? 0.002 : 0.05)) moving = true;
      }
    }
    this.mouse.x.step(dt); this.mouse.y.step(dt);
    if (!this.mouse.x.settled(0.3) || !this.mouse.y.settled(0.3)) { moving = true; this.sceneDirty = true; }
    this.scroll.v.target *= Math.pow(0.02, dt);
    this.scroll.v.step(dt);
    if (Math.abs(this.scroll.v.value) > 0.002 || Math.abs(this.scroll.v.target) > 0.002) moving = true;
    // Theme crossfade.
    const c = this.colors;
    if (c.target.length) {
      let still = true;
      for (let i = 0; i < c.target.length; i++) {
        const a = -SPRINGS.theme.stiffness * (c.cur[i] - c.target[i]) - SPRINGS.theme.damping * c.v[i];
        c.v[i] += a * dt; c.cur[i] += c.v[i] * dt;
        if (Math.abs(c.cur[i] - c.target[i]) > 0.001 || Math.abs(c.v[i]) > 0.001) still = false; else { c.cur[i] = c.target[i]; c.v[i] = 0; }
      }
      if (!still) { moving = true; this.sceneDirty = true; }
    }
    this.photoOn.step(dt);
    if (!this.photoOn.settled(0.002)) { moving = true; this.sceneDirty = true; }
    return moving;
  }

  private render(): void {
    const gl = this.gl!;
    const tier = TIERS[this.tier];
    const dpr = Math.min(window.devicePixelRatio || 1, tier.maxDpr);
    const scale = this.qualityLocked ?? tier.scale * QUALITY_STEPS[this.qualityIndex];
    const px = dpr * scale;
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    const cssW = vw, cssH = vh + OVERSCAN_PX * 2;
    const W = Math.max(1, Math.round(cssW * px)), H = Math.max(1, Math.round(cssH * px));
    const pxScale = W / cssW;

    // Anchor the canvas in the document at the current scroll position.
    const sx = window.scrollX, sy = window.scrollY;
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; this.sceneDirty = true; }
    const sizeCss = `${cssW}px`, sizeCssH = `${cssH}px`;
    if (this.canvas.style.width !== sizeCss) this.canvas.style.width = sizeCss;
    if (this.canvas.style.height !== sizeCssH) this.canvas.style.height = sizeCssH;
    if (sy !== this.anchorY || sx !== this.anchorX || !this.canvas.style.transform) {
      this.anchorY = sy; this.anchorX = sx;
      this.canvas.style.transform = `translate3d(${sx}px, ${sy - OVERSCAN_PX}px, 0)`;
    }
    const originX = sx, originY = sy - OVERSCAN_PX;
    const c = this.colors.cur;
    if (!c.length) return;

    let q: WebGLQuery | null = null;
    const ext = this.timerExt;
    if (ext && this.queries.length < 4) { q = gl.createQuery(); if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }

    // 1. Environment.
    this.ensureSceneTarget(W, H);
    if (this.sceneDirty) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.useProgram(this.progScene);
      gl.bindVertexArray(this.vaoEmpty);
      const U = this.uScene;
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uDpr, pxScale);
      gl.uniform2f(U.uOrigin, originX, originY);
      gl.uniform2f(U.uViewport, vw, vh);
      gl.uniform1f(U.uScroll, sy);
      gl.uniform1f(U.uTime, this.time);
      gl.uniform3f(U.uBaseTop, c[0], c[1], c[2]);
      gl.uniform3f(U.uBaseBottom, c[3], c[4], c[5]);
      gl.uniform3f(U.uEnvA, c[6], c[7], c[8]);
      gl.uniform3f(U.uEnvB, c[9], c[10], c[11]);
      gl.uniform3f(U.uLight, c[12], c[13], c[14]);
      gl.uniform4f(U.uLine, c[15], c[16], c[17], c[18]);
      gl.uniform1f(U.uLightTheme, c[25]);
      gl.uniform2f(U.uPointer, this.mouse.present ? this.mouse.x.value : -1, this.mouse.present ? this.mouse.y.value : -1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
      gl.uniform1i(U.uPhoto, 1);
      gl.uniform1f(U.uPhotoOn, Math.max(0, Math.min(1, this.photoOn.value)));
      gl.uniform2f(U.uPhotoSize, this.photo?.naturalWidth ?? 1, this.photo?.naturalHeight ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.sceneDirty = false;
      this.stats.sceneFrames++;
    }

    // 2. Background.
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.useProgram(this.progBlit);
    gl.bindVertexArray(this.vaoEmpty);
    gl.uniform1i(this.uBlit.uScene, 0);
    gl.uniform2f(this.uBlit.uRes, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3. Glass.
    const reduced = this.reduced();
    let n = 0;
    const mirrored: Surface[] = [];
    for (const s of this.order) {
      if (!s.shown || s.alpha < 0.004) continue;
      const ox = s.fixed ? sx : 0, oy = s.fixed ? sy : 0;
      const cx = s.cx.value + ox - originX, cy = s.cy.value + oy - originY, hw = s.hw.value, hh = s.hh.value;
      if (hw < 1 || hh < 1) continue;
      if (cx + hw < -40 || cx - hw > cssW + 40 || cy + hh < -40 || cy - hh > cssH + 40) continue;
      if ((n + 1) * FLOATS > this.inst.length) { const grown = new Float32Array(this.inst.length * 2); grown.set(this.inst); this.inst = grown; }
      const m = s.mat, o = n * FLOATS, I = this.inst;
      I[o] = cx; I[o + 1] = cy; I[o + 2] = hw; I[o + 3] = hh;
      I[o + 4] = s.radius; I[o + 5] = s.sx.value; I[o + 6] = s.sy.value; I[o + 7] = Math.max(0, s.hover.value);
      I[o + 8] = s.px.value; I[o + 9] = s.py.value; I[o + 10] = reduced ? 0 : Math.max(0, s.press.value); I[o + 11] = s.alpha;
      I[o + 12] = m.thickness; I[o + 13] = m.bevel; I[o + 14] = m.ior; I[o + 15] = m.dispersion;
      I[o + 16] = m.refraction; I[o + 17] = m.magnify; I[o + 18] = m.reflection; I[o + 19] = m.frost;
      I[o + 20] = m.tint; I[o + 21] = m.edgeLight; I[o + 22] = m.shadow; I[o + 23] = m.accent;
      I[o + 24] = reduced ? 0 : m.deform; I[o + 25] = 0; I[o + 26] = 0; I[o + 27] = 0;
      n++;
      if (s.mirrorCtx) mirrored.push(s);
    }
    if (n > 0) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.useProgram(this.progGlass);
      gl.bindVertexArray(this.vaoGlass);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      if (n * FLOATS * 4 > this.instBytes) { gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW); this.instBytes = this.inst.byteLength; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * FLOATS);
      const U = this.uGlass;
      gl.uniform1i(U.uScene, 0);
      gl.uniform2f(U.uView, cssW, cssH);
      gl.uniform1f(U.uDpr, pxScale);
      gl.uniform1f(U.uTime, this.fxTime);
      gl.uniform3f(U.uTint, c[19], c[20], c[21]);
      gl.uniform3f(U.uAccent, c[22], c[23], c[24]);
      gl.uniform1f(U.uLightTheme, c[25]);
      gl.uniform2f(U.uMouse, this.mouse.present ? this.mouse.x.value + sx - originX : -1, this.mouse.present ? this.mouse.y.value + sy - originY : -1);
      gl.uniform1f(U.uScrollV, reduced ? 0 : this.scroll.v.value);
      gl.uniform1i(U.uSpectral, tier.spectral);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    if (ext && q) { gl.endQuery(ext.TIME_ELAPSED_EXT); this.queries.push(q); }
    if (ext) this.pollQueries(ext);

    // 4. Mirrors: copy each elevated surface's glass into the canvas that sits above the content it covers.
    for (const s of mirrored) this.copyMirror(s, pxScale);

    if (this.status !== "running") this.setStatus("running");
    this.stats.width = W; this.stats.height = H; this.stats.surfaces = this.surfaces.size; this.stats.drawn = n; this.stats.mirrors = mirrored.length;
    this.stats.scale = scale; this.stats.dpr = pxScale; this.stats.frames++;
  }

  // ---------- Mirrors ----------

  private attachMirror(s: Surface): void {
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    if (s.mirror === "inner") {
      c.className = "lg-mirror lg-mirror-inner";
      s.el.classList.add("lg-host");
      s.el.prepend(c);
    } else {
      c.className = "lg-mirror lg-mirror-layer";
      s.zIndex = rootZ(s.el);
      c.style.zIndex = String(Math.max(0, s.zIndex - 1));
      this.mirrorLayer.append(c);
    }
    s.mirrorCanvas = c;
    s.mirrorCtx = c.getContext("2d", { alpha: true });
  }

  private detachMirror(s: Surface): void {
    s.mirrorCanvas?.remove();
    s.el.classList.remove("lg-host");
    s.mirrorCanvas = null; s.mirrorCtx = null;
  }

  private copyMirror(s: Surface, pxScale: number): void {
    const c = s.mirrorCanvas!, ctx = s.mirrorCtx!;
    const r = s.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * pxScale)), h = Math.max(1, Math.round(r.height * pxScale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    if (s.mirror === "inner") {
      const el = s.el;
      const inset = `${-el.clientTop}px ${-(el.offsetWidth - el.clientWidth - el.clientLeft)}px ${-(el.offsetHeight - el.clientHeight - el.clientTop)}px ${-el.clientLeft}px`;
      if (c.style.inset !== inset) c.style.inset = inset;
      const tr = el.scrollTop || el.scrollLeft ? `translate(${el.scrollLeft}px, ${el.scrollTop}px)` : "";
      if (c.style.transform !== tr) c.style.transform = tr;
    } else {
      const radius = getComputedStyle(s.el).borderRadius;
      if (c.style.borderRadius !== radius) c.style.borderRadius = radius;
      c.style.width = `${r.width}px`; c.style.height = `${r.height}px`;
      c.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.canvas, r.left * pxScale, (r.top + OVERSCAN_PX) * pxScale, w, h, 0, 0, w, h);
  }

  // ---------- Measurement ----------

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

  /** Frame-time bookkeeping and adaptive resolution (only frames rendered back to back count). */
  private trackFrame(delta: number, now: number): void {
    if (delta > 250) return;
    this.deltas.push(delta);
    if (this.deltas.length > 60) this.deltas.shift();
    const avg = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
    this.stats.frameMs = avg; this.stats.fps = 1000 / avg;
    this.stats.cpuMs = this.cpuAcc.length ? this.cpuAcc.reduce((a, b) => a + b, 0) / this.cpuAcc.length : 0;
    if (this.deltas.length < 20) return;
    const sorted = [...this.deltas].sort((a, b) => a - b);
    this.refreshMs = Math.min(this.refreshMs * 0.98 + sorted[2] * 0.02, sorted[2]);
    if (this.qualityLocked !== null) return;
    const median = sorted[sorted.length >> 1];
    const budget = Math.max(this.refreshMs, 1000 / 60);
    if (median > budget * 1.25 && this.qualityIndex < QUALITY_STEPS.length - 1 && now - this.lastQualityChange > 900) {
      this.failedAt.set(this.qualityIndex, now);
      this.qualityIndex++; this.lastQualityChange = now; this.deltas.length = 0; this.calmFrames = 0;
    } else if (median < budget * 0.8) {
      const up = this.qualityIndex - 1;
      const recentFail = now - (this.failedAt.get(up) ?? -1e9) < 30000;
      if (++this.calmFrames > 240 && up >= 0 && !recentFail && now - this.lastQualityChange > 4000) { this.qualityIndex = up; this.lastQualityChange = now; this.calmFrames = 0; }
    } else this.calmFrames = 0;
  }
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return null; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
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

/** True when the element (or an ancestor) is fixed or sticky: it stays put on screen while the page scrolls. */
function inFixedContext(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === "fixed" || p === "sticky") return true;
  }
  return false;
}

/** The z-index the element competes with at the root stacking level. */
function rootZ(el: HTMLElement): number {
  let z = 0;
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const v = parseInt(getComputedStyle(n).zIndex, 10);
    if (Number.isFinite(v)) z = v;
  }
  return z;
}
