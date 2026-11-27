import type { LiquidGlassEngine, SurfaceOptions } from "./engine";
import type { Material, MaterialName } from "./tokens";

/**
 * The material map: which elements of the application are optical glass, and which material each one uses.
 * Pages never call the engine; they use the shared classes (or data-glass="<material>"), and this registry keeps the engine in
 * step with the DOM as routes change, dialogs open and lists load. First matching rule wins.
 */
type Rule = { sel: string; material: MaterialName; mirror?: "auto" | "inner"; layer: number; interactive?: boolean; fades?: boolean; overrides?: Partial<Material> };

const RULES: Rule[] = [
  // Selection indicators that slide between items.
  { sel: ".lg-indicator, .liquid-pill:not(.trail)", material: "indicator", layer: 30 },
  // Elevated overlays: their glass is mirrored inside them, above the page they cover.
  { sel: ".dialog, .drawer, .ask-panel", material: "overlay", mirror: "inner", layer: 60, fades: true },
  { sel: ".menu, .car-combo-list, .route-veil-card", material: "overlay", mirror: "inner", layer: 70, fades: true },
  { sel: ".toast", material: "overlay", mirror: "inner", layer: 80, fades: true },
  { sel: ".cc-panel", material: "overlay", mirror: "inner", layer: 60, fades: true },
  // Floating chrome.
  { sel: ".ask-fab, .cc-launch", material: "floating", mirror: "auto", layer: 50, interactive: true },
  { sel: ".topbar, .rail, .bottom-nav, .sr-header, .adm-side, .compare-tray, .landing-header, .onb-actions, .assistant:not(.compact) .chat-form", material: "floating", mirror: "auto", layer: 40 },
  // Prominent actions and small controls (they fade when disabled, so their opacity is followed).
  { sel: ".btn-primary", material: "accent", layer: 20, interactive: true, fades: true },
  { sel: ".topbar .icon-btn, .topbar .avatar, .topbar .search-trigger, .topbar .branch-select .btn, .sr-header .icon-btn, .login-theme .icon-btn, .overlay-head .icon-btn, .ask-head .icon-btn, .adm-round, .adm-notifications", material: "control", layer: 45, interactive: true, fades: true },
  // Segmented controls and the sign-in card.
  { sel: ".section-tabs, .liquid-seg, .login-form", material: "pronounced", layer: 10 },
  // Content surfaces.
  { sel: ".table-wrap", material: "subtle", layer: 5 },
  // Cards that are links or buttons swell under the pointer and dent when pressed.
  { sel: "a.card, button.card, .kpi-action, a.pl-card, .adm-card", material: "standard", layer: 5, interactive: true, overrides: { deform: 0.35 } },
  { sel: ".card, .kpi, .state-box, .cap-card, .plan-card, .conv-item, .chat-starter, .cc-panel, .ad-account, .pf-card, .pipe-col, .settings-nav, .adm-card, .adm-kpi, .adm-sec, .pl-card, .pl-filters, .sr-how li, .sr-facts > div, .sr-saved-row, .promo-platform, .promo-preset, .channel-row", material: "standard", layer: 5 },
];

const MATERIAL_NAMES = new Set<MaterialName>(["subtle", "standard", "pronounced", "floating", "overlay", "control", "accent", "indicator"]);
const ALL = [...RULES.map((r) => r.sel), "[data-glass]"].join(",");
/** Glass inside these scroll inside an overlay; it would trail its content by a frame, so those keep the solid material. */
const NO_GLASS_INSIDE = ".overlay-body, .ask-body, [data-glass='none']";
const OVERLAY_HOST = ".dialog, .drawer, .ask-panel, .menu, .toast, .car-combo-list";

function ruleFor(el: HTMLElement): Rule | null {
  const attr = el.getAttribute("data-glass");
  if (attr === "none") return null;
  if (attr && MATERIAL_NAMES.has(attr as MaterialName)) {
    const base = RULES.find((r) => el.matches(r.sel));
    return { sel: "[data-glass]", material: attr as MaterialName, mirror: base?.mirror ?? (el.hasAttribute("data-glass-mirror") ? "auto" : undefined), layer: base?.layer ?? 10, interactive: base?.interactive ?? el.hasAttribute("data-glass-interactive"), fades: base?.fades };
  }
  return RULES.find((r) => el.matches(r.sel)) ?? null;
}

/** An ancestor (below the page) that really scrolls: in-flow glass inside it would trail its content during that scroll. */
function inNestedScroller(el: HTMLElement, tracked: Map<HTMLElement, unknown>): boolean {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    if (tracked.has(n)) continue; // a mirrored host (sidebar, dialog) re-copies its glass every frame
    const cs = getComputedStyle(n);
    const sx = (cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1;
    const sy = (cs.overflowY === "auto" || cs.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1;
    if (sx || sy) return true;
  }
  return false;
}

export function startRegistry(engine: LiquidGlassEngine): () => void {
  const tracked = new Map<HTMLElement, Rule>();
  const layers = new Map<HTMLElement, number>();

  /** Glass nested in other glass always draws above it, whatever the materials' base layers. */
  const layerOf = (el: HTMLElement, base: number) => {
    for (let n = el.parentElement; n; n = n.parentElement) { const l = layers.get(n); if (l !== undefined) return Math.max(base, l + 1); }
    return base;
  };

  const consider = (el: HTMLElement) => {
    if (tracked.has(el)) return;
    const rule = ruleFor(el);
    if (!rule) return;
    if (el.closest(NO_GLASS_INSIDE)) return;
    // Content panels inside overlays stay on the overlay's own glass; their buttons and indicators are glass droplets.
    const inOverlay = el.parentElement?.closest(OVERLAY_HOST);
    if (inOverlay && !["accent", "control", "indicator"].includes(rule.material)) return;
    if (inNestedScroller(el, tracked)) return;
    let mirror: SurfaceOptions["mirror"] = "none";
    if (rule.mirror === "inner") mirror = "inner";
    else if (rule.mirror === "auto") {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") mirror = el.closest(OVERLAY_HOST) ? "inner" : "layer";
    }
    tracked.set(el, rule);
    const layer = layerOf(el, rule.layer);
    layers.set(el, layer);
    engine.register(el, { material: rule.material, overrides: rule.overrides, layer, mirror, interactive: rule.interactive, fades: rule.fades });
  };

  const scan = (root: ParentNode) => {
    if (root instanceof HTMLElement && root.matches(ALL)) consider(root);
    root.querySelectorAll<HTMLElement>(ALL).forEach(consider);
  };

  const prune = () => {
    for (const [el, rule] of tracked) {
      if (!el.isConnected || ruleFor(el)?.sel !== rule.sel) { engine.unregister(el); tracked.delete(el); layers.delete(el); }
    }
  };

  let pending = false;
  const added: Node[] = [];
  const flush = () => {
    pending = false;
    prune();
    for (const n of added.splice(0)) if (n instanceof HTMLElement && n.isConnected) scan(n);
    engine.invalidate();
  };
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach((n) => added.push(n));
      else if (r.target instanceof HTMLElement) added.push(r.target);
    }
    if (!pending) { pending = true; requestAnimationFrame(flush); }
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-glass", "aria-current", "aria-selected", "aria-pressed", "open"] });
  scan(document.body);
  // Late layout (fonts, images, hydration) can make a container scrollable or not: settle once things are in place.
  const late = window.setTimeout(() => { prune(); scan(document.body); engine.invalidate(); }, 1200);

  return () => {
    mo.disconnect();
    window.clearTimeout(late);
    for (const el of tracked.keys()) engine.unregister(el);
    tracked.clear(); layers.clear();
  };
}
