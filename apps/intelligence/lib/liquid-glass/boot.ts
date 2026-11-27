import { LiquidGlassEngine, type EngineStats, type Palette } from "./engine";
import { startRegistry } from "./registry";
import type { Tier } from "./tokens";

/**
 * Starts Liquid Glass for the page: decides whether the GPU path runs, picks a quality tier, feeds the engine the theme palette
 * (from CSS custom properties, so light, dark and per-area palettes live in CSS) and the environment for the current route, and
 * keeps all of that in step. Returns a disposer.
 *
 * <html data-liquid-glass> reports the state to CSS: "gpu" (optical glass is drawn; surfaces become transparent), "starting",
 * "fallback" (no WebGL2 or the context could not be restored: coordinated solid materials) or "off" (switched off by the person,
 * or reduced transparency / more contrast requested).
 */

export const GLASS_KEY = "vl-glass";
export type GlassChoice = "auto" | "low" | "off";

export function readGlassChoice(): GlassChoice {
  try { const v = localStorage.getItem(GLASS_KEY); return v === "low" || v === "off" ? v : "auto"; } catch { return "auto"; }
}

declare global {
  interface Window { __vlGlass?: { stats: () => EngineStats; engine: LiquidGlassEngine } }
}

const reducedMotion = () => document.documentElement.getAttribute("data-motion") === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A tier pinned for measurement (localStorage "vl-glass-tier"), otherwise null. */
function forcedTier(): Tier | null {
  try { const v = localStorage.getItem("vl-glass-tier"); return v === "high" || v === "medium" || v === "low" ? v : null; } catch { return null; }
}

function detectTier(choice: GlassChoice): Tier {
  if (choice === "low") return "low";
  const forced = forcedTier();
  if (forced) return forced;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const mem = nav.deviceMemory ?? 8, cores = nav.hardwareConcurrency ?? 8;
  if (nav.connection?.saveData || mem <= 2) return "low";
  if (matchMedia("(pointer: coarse)").matches || mem <= 4 || cores <= 4) return "medium";
  return "high";
}

function parseColor(v: string, fallback: number[]): number[] {
  const s = v.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full.slice(0, 6), 16);
    if (Number.isFinite(n)) return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); if (p.length >= 3) return [p[0] / 255, p[1] / 255, p[2] / 255, ...(p.length > 3 ? [p[3]] : [])]; }
  return fallback;
}

/** Signed colours ("-0.04 -0.03 -0.02") for the softbox strips, which darken a light studio slightly. */
function parseVec(v: string, fallback: number[]): number[] {
  const p = v.trim().split(/\s+/).map(parseFloat);
  return p.length >= 3 && p.every(Number.isFinite) ? p.slice(0, 3) : fallback;
}

function readPalette(host: Element): Palette {
  const cs = getComputedStyle(host);
  const get = (n: string) => cs.getPropertyValue(n);
  const line = parseColor(get("--lg-line"), [1, 1, 1]);
  return {
    baseTop: parseColor(get("--lg-base-top"), [0.04, 0.05, 0.05]),
    baseBottom: parseColor(get("--lg-base-bottom"), [0.02, 0.03, 0.03]),
    envA: parseColor(get("--lg-env-a"), [0.05, 0.25, 0.17]),
    envB: parseColor(get("--lg-env-b"), [0.04, 0.14, 0.22]),
    light: parseVec(get("--lg-light"), [0.1, 0.11, 0.11]),
    line: [line[0], line[1], line[2], parseFloat(get("--lg-line-alpha")) || 0.08],
    tint: parseColor(get("--lg-tint"), [0.06, 0.07, 0.07]),
    accent: parseColor(get("--lg-accent"), [0.2, 0.83, 0.6]),
    lightTheme: parseFloat(get("--lg-light-theme")) || 0,
  };
}

export function bootLiquidGlass(els: { stage: HTMLElement; mirrors: HTMLElement }): () => void {
  const root = document.documentElement;
  const set = (state: string) => root.setAttribute("data-liquid-glass", state);
  const choice = readGlassChoice();
  const plain = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)");
  if (choice === "off" || plain.matches) { set("off"); return () => root.removeAttribute("data-liquid-glass"); }

  const tier = detectTier(choice);
  root.setAttribute("data-glass-tier", tier);
  set("starting");
  // A fresh canvas per start: a context that was released cannot be obtained again from the same element.
  const canvas = document.createElement("canvas");
  canvas.className = "lg-canvas";
  els.stage.append(canvas);
  const engine = new LiquidGlassEngine({ canvas, stage: els.stage, mirrorLayer: els.mirrors, tier, reducedMotion });
  engine.onStatus = (s) => set(s === "running" ? "gpu" : s === "starting" ? "starting" : "fallback");
  if (engine.status === "unsupported") { set("fallback"); return () => { engine.destroy(); canvas.remove(); root.removeAttribute("data-liquid-glass"); }; }
  // Software rasterisers (no GPU) get the still, low-resolution tier; the read uses the engine's own context.
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(engine.rendererName) && !forcedTier()) { engine.setTier("low"); root.setAttribute("data-glass-tier", "low"); }

  // Environment and palette follow the route: an element with data-glass-scene (sign-in, admin) supplies its own.
  let host: Element = root;
  const syncScene = () => {
    const sceneEl = document.querySelector("[data-glass-scene]");
    host = sceneEl ?? root;
    engine.setPhoto(sceneEl?.getAttribute("data-glass-photo") ?? null);
    engine.setPalette(readPalette(host));
  };
  syncScene();
  const stopRegistry = startRegistry(engine);

  let sceneTick = false;
  const sceneMo = new MutationObserver(() => { if (!sceneTick) { sceneTick = true; requestAnimationFrame(() => { sceneTick = false; if ((document.querySelector("[data-glass-scene]") ?? root) !== host) syncScene(); }); } });
  sceneMo.observe(document.body, { childList: true, subtree: true });
  const themeMo = new MutationObserver(() => syncScene());
  themeMo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = matchMedia("(prefers-color-scheme: light)");
  scheme.addEventListener("change", syncScene);
  const motionMo = new MutationObserver(() => engine.invalidate());
  motionMo.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
  const offNow = () => { if (plain.matches) { dispose(); set("off"); } };
  plain.addEventListener("change", offNow);

  window.__vlGlass = { stats: () => engine.getStats(), engine };

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopRegistry(); sceneMo.disconnect(); themeMo.disconnect(); motionMo.disconnect();
    scheme.removeEventListener("change", syncScene); plain.removeEventListener("change", offNow);
    engine.destroy();
    canvas.remove();
    delete window.__vlGlass;
  }
  return () => { dispose(); root.removeAttribute("data-liquid-glass"); root.removeAttribute("data-glass-tier"); };
}
