/**
 * Liquid Glass design tokens: the single source of truth for every optical, motion and quality value in the material system.
 *
 * Lengths are CSS pixels. The shader receives these per surface (instanced attributes), so pages never carry shader logic;
 * they pick a material by class (see registry.ts) or with data-glass="<material>".
 */

export type MaterialName = "subtle" | "standard" | "pronounced" | "floating" | "overlay" | "control" | "accent" | "indicator";

export type Material = {
  /** Glass height above the scene plane. Thicker glass bends more and casts a deeper rim. */
  thickness: number;
  /** Width of the curved rim. The flat optical centre begins this far in from the edge (surface curvature). */
  bevel: number;
  /** Refractive index (crown glass ≈ 1.52). */
  ior: number;
  /** Spread of the index across the visible spectrum (chromatic dispersion at the rim). */
  dispersion: number;
  /** Multiplier on the refracted displacement (refraction intensity). */
  refraction: number;
  /** Convex-lens magnification of the background across the flat centre. */
  magnify: number;
  /** Strength of Fresnel environment reflections and the polished rim line. */
  reflection: number;
  /** Frost radius of the flat centre in CSS px (0 = perfectly clear glass). */
  frost: number;
  /** Legibility tint toward the theme's glass body colour (0 = clear, ~0.6 = dense content). */
  tint: number;
  /** Directional rim glint strength (edge light). */
  edgeLight: number;
  /** Contact shadow strength (elevation). */
  shadow: number;
  /** Mix toward the accent colour (tinted glass for prominent actions). */
  accent: number;
  /** Liquid silhouette deformation on hover and press (0 = rigid). */
  deform: number;
  /** Follow the element with springs (liquid lag) instead of exactly. Only for surfaces that are pure glass, never content. */
  spring: boolean;
};

const base: Material = {
  thickness: 18, bevel: 18, ior: 1.52, dispersion: 0.018, refraction: 1, magnify: 0.03, reflection: 0.5,
  frost: 14, tint: 0.5, edgeLight: 0.9, shadow: 0.16, accent: 0, deform: 0, spring: false,
};

/** Material levels, from the quietest (dense data) to the most optical (floating chrome and small controls). */
export const MATERIALS: Record<MaterialName, Material> = {
  /** Dense data (tables): thin rim, heavy frost, high tint so numbers stay crisp. */
  subtle: { ...base, thickness: 10, bevel: 10, dispersion: 0.01, refraction: 0.8, magnify: 0, reflection: 0.35, frost: 22, tint: 0.72, edgeLight: 0.55, shadow: 0.1 },
  /** Cards, metric tiles, panels, empty and error states. */
  standard: { ...base, thickness: 16, bevel: 16, frost: 16, tint: 0.58, edgeLight: 0.8, shadow: 0.14 },
  /** Section tabs, segmented controls, the sign-in card: clearer glass with a thicker rim. */
  pronounced: { ...base, thickness: 24, bevel: 22, dispersion: 0.026, refraction: 1.15, magnify: 0.05, reflection: 0.62, frost: 8, tint: 0.42, edgeLight: 1.05, shadow: 0.18, deform: 0.6 },
  /** Sidebar, top bar, tab bar, sticky headers, the assistant button: the thickest, clearest lenses. */
  floating: { ...base, thickness: 26, bevel: 24, dispersion: 0.03, refraction: 1.2, magnify: 0.06, reflection: 0.68, frost: 6, tint: 0.4, edgeLight: 1.15, shadow: 0.2 },
  /** Dialogs, drawers, menus, toasts, the assistant panel: elevated glass that carries forms, so a denser body. */
  overlay: { ...base, thickness: 22, bevel: 22, dispersion: 0.024, refraction: 1.1, magnify: 0.04, reflection: 0.6, frost: 18, tint: 0.7, edgeLight: 1, shadow: 0.24 },
  /** Icon buttons, the avatar, the search field in the top bar: small droplets that squash when pressed. */
  control: { ...base, thickness: 14, bevel: 14, dispersion: 0.03, refraction: 1.25, magnify: 0.08, reflection: 0.7, frost: 4, tint: 0.34, edgeLight: 1.2, shadow: 0.12, deform: 1 },
  /** Primary actions: accent-tinted glass. */
  accent: { ...base, thickness: 14, bevel: 14, dispersion: 0.024, refraction: 1.1, magnify: 0.05, reflection: 0.62, frost: 6, tint: 0.2, edgeLight: 1.1, shadow: 0.14, accent: 0.86, deform: 1 },
  /** Selection indicators that slide between items: pure glass, spring-followed, stretching as they travel. */
  indicator: { ...base, thickness: 14, bevel: 13, dispersion: 0.034, refraction: 1.3, magnify: 0.1, reflection: 0.72, frost: 2, tint: 0.18, edgeLight: 1.25, shadow: 0.08, accent: 0.18, deform: 1, spring: true },
};

export type Tier = "high" | "medium" | "low";

export type QualityTier = {
  /** Device pixel ratio cap. */
  maxDpr: number;
  /** Starting render scale (fraction of the capped DPR); adaptive quality steps down from here. */
  scale: number;
  /** Wavelengths traced at the rim: 5 = spectral dispersion, 3 = per-channel. */
  spectral: 3 | 5;
  /** Environment animation rate while nothing is being touched (0 = still, rendered on change only). */
  ambientFps: number;
};

export const TIERS: Record<Tier, QualityTier> = {
  high: { maxDpr: 2, scale: 1, spectral: 5, ambientFps: 30 },
  medium: { maxDpr: 1.5, scale: 0.85, spectral: 3, ambientFps: 24 },
  low: { maxDpr: 1, scale: 0.7, spectral: 3, ambientFps: 0 },
};

/** Adaptive resolution steps, multiplied with the tier's scale. */
export const QUALITY_STEPS = [1, 0.85, 0.72, 0.6, 0.5];

/** Spring presets (stiffness, damping) with mass 1. */
export const SPRINGS = {
  /** Following an element's box (indicators). Slightly under-damped: liquid lag and a small overshoot. */
  follow: { stiffness: 340, damping: 26 },
  /** Hover swell. */
  hover: { stiffness: 170, damping: 20 },
  /** Press compression: fast in, soft release. */
  press: { stiffness: 700, damping: 30 },
  /** Squash and stretch of the silhouette. */
  shape: { stiffness: 520, damping: 22 },
  /** Pointer light. */
  light: { stiffness: 260, damping: 30 },
  /** Theme colour crossfade. */
  theme: { stiffness: 60, damping: 15 },
} as const;

/** Stop animating the environment after this long without input, so an idle tab costs nothing. */
export const IDLE_FREEZE_MS = 45_000;
/** Extra rows rendered above and below the viewport, so asynchronous (compositor) scrolling never reveals an edge. */
export const OVERSCAN_PX = 96;
