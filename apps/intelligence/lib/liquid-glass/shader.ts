/**
 * GLSL ES 3.00 shaders for the Liquid Glass engine. Three programs, one WebGL2 context:
 *
 *   1. SCENE: the environment behind the glass, rendered into a mipmapped texture. A studio: a deep gradient, slow aurora light in
 *      the brand colours, three softbox light strips and aerodynamic streamlines (thin, anti-aliased contour lines of a slowly flowing
 *      field). On sign-in it is a photograph instead, with a slow drift. Layers are attached to the page at different depths, so
 *      scrolling moves them at different speeds (parallax) and the glass refracts a moving environment.
 *   2. BLIT: the environment, unchanged, as the page background.
 *   3. GLASS: every registered surface in one instanced draw, each quad covering its element plus a margin for the contact shadow.
 *      Per surface: a rounded-rectangle signed distance (spring-deformed), a circular bevel height field and its normal, Snell
 *      refraction traced through the glass thickness with 3 or 5 wavelengths recombined by spectral weights (chromatic dispersion),
 *      convex-lens magnification, Schlick Fresnel reflection of the environment and of two studio softboxes, a total-internal-
 *      reflection sample on the steep rim, an adaptive legibility tint, clamped Blinn-Phong highlights from a key light and the
 *      cursor, and the three polished-edge cues (crisp Fresnel rim line, curvature-following highlight, dark inner line).
 *
 * WebGL cannot read the DOM: the glass refracts the environment texture, never the page's own text.
 */

const SHARED = /* glsl */ `
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** Fullscreen triangle. */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

export const SCENE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;          // target size in px
uniform float uDpr;         // px per CSS px
uniform vec2 uOrigin;       // page position (CSS px) of the canvas's top-left corner
uniform vec2 uViewport;     // viewport size, CSS px
uniform float uScroll;      // page scroll, CSS px
uniform float uTime;
uniform vec3 uBaseTop;
uniform vec3 uBaseBottom;
uniform vec3 uEnvA;
uniform vec3 uEnvB;
uniform vec3 uLight;        // softbox strips (signed: light themes darken slightly)
uniform vec4 uLine;         // streamline colour and opacity
uniform float uLightTheme;  // 0 dark, 1 light
uniform vec2 uPointer;      // viewport CSS px, negative when absent
uniform sampler2D uPhoto;
uniform float uPhotoOn;
uniform vec2 uPhotoSize;
out vec4 outColor;

float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

float strip(vec2 q, vec2 c, vec2 hs, float soft) {
  vec2 d = abs(q - c) - hs + hs.y;
  float s = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - hs.y;
  return 1.0 - smoothstep(-soft, soft, s);
}

void main() {
  vec2 cp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 page = cp + uOrigin;
  vec2 vp = vec2(page.x, page.y - uScroll);
  float vh = max(uViewport.y, 1.0);
  float asp = uViewport.x / vh;
  vec2 v = vp / vh;
  float t = uTime;

  // Base: fixed to the viewport.
  vec3 col = mix(uBaseTop, uBaseBottom, smoothstep(0.0, 1.0, clamp(v.y, 0.0, 1.0)));

  // Aurora: three slow light pools, attached to the page at 35%.
  vec2 a = vec2(v.x, v.y + uScroll * 0.35 / vh);
  vec2 c1 = vec2(asp * 0.16 + 0.10 * sin(t * 0.051), 0.06 + 0.08 * cos(t * 0.043));
  vec2 c2 = vec2(asp * 0.88 + 0.09 * cos(t * 0.038), 0.58 + 0.10 * sin(t * 0.047));
  vec2 c3 = vec2(asp * 0.52 + 0.14 * sin(t * 0.029 + 1.7), 1.12 + 0.07 * cos(t * 0.033));
  float g1 = exp(-dot(a - c1, a - c1) / 0.17);
  float g2 = exp(-dot(a - c2, a - c2) / 0.13);
  float g3 = exp(-dot(a - c3, a - c3) / 0.22);
  vec3 mid = mix(uEnvA, uEnvB, 0.5);
  col += (uEnvA * g1 + uEnvB * g2 + mid * g3 * 0.8) * (1.0 - uLightTheme);
  col = mix(col, uEnvA, g1 * 0.42 * uLightTheme);
  col = mix(col, uEnvB, g2 * 0.36 * uLightTheme);
  col = mix(col, mid, g3 * 0.30 * uLightTheme);

  // Studio softboxes: two long strips overhead and a tall one on the right, drifting slowly. Attached at 60%.
  vec2 s = vec2(v.x, v.y + uScroll * 0.6 / vh);
  float sweep = sin(t * 0.06) * 0.22 * asp;
  float b1 = strip(s, vec2(asp * 0.30 + sweep, 0.15), vec2(asp * 0.24, 0.016), 0.03);
  float b2 = strip(s, vec2(asp * 0.76 - sweep * 0.6, 0.31), vec2(asp * 0.15, 0.011), 0.026);
  float b3 = strip(s, vec2(asp * 0.94, 0.86), vec2(0.011, 0.34), 0.036);
  float boxes = b1 * 0.9 + b2 * 0.6 + b3 * 0.5;

  // Photograph (sign-in): cover-fitted with a slow drift, so the glass always refracts something moving.
  if (uPhotoOn > 0.001) {
    vec2 uv = vp / max(uViewport, vec2(1.0));
    float pa = uPhotoSize.x / max(uPhotoSize.y, 1.0), va = uViewport.x / vh;
    vec2 fit = va > pa ? vec2(1.0, pa / va) : vec2(va / pa, 1.0);
    float zoom = 1.0 / (1.05 + 0.025 * sin(t * 0.05));
    vec2 puv = (uv - 0.5) * fit * zoom + 0.5 + vec2(0.012 * sin(t * 0.031), 0.009 * cos(t * 0.027));
    vec3 ph = texture(uPhoto, vec2(puv.x, 1.0 - puv.y)).rgb;
    col = mix(col, ph + uLight * boxes * 0.5, uPhotoOn);
  } else {
    col += uLight * boxes;
  }

  // Streamlines: contour lines of a slowly flowing field, like smoke in a wind tunnel. Attached at 85%, anti-aliased with fwidth.
  vec2 f = vec2(v.x, v.y + uScroll * 0.85 / vh);
  float field = f.y * 6.5 + 0.55 * sin(f.x * 1.6 + t * 0.11 + f.y * 0.9) + 0.28 * sin(f.x * 3.7 - t * 0.07 + 1.3) + 0.12 * sin((f.x - f.y) * 7.3 + t * 0.13);
  float dn = abs(fract(field + 0.5) - 0.5);
  float aa = max(fwidth(field), 1e-4);
  float line = 1.0 - smoothstep(aa * 0.55, aa * 1.7, dn);
  float fine = field * 4.0;
  float dn2 = abs(fract(fine + 0.5) - 0.5);
  float aa2 = max(fwidth(fine), 1e-4);
  float line2 = (1.0 - smoothstep(aa2 * 0.5, aa2 * 1.5, dn2)) * 0.35;
  float lineMask = (0.45 + 0.55 * smoothstep(0.05, 0.95, clamp(v.y, 0.0, 1.0))) * (0.6 + 0.8 * (g1 + g2 + g3));
  col = mix(col, uLine.rgb, clamp((line + line2) * uLine.a * lineMask * (1.0 - uPhotoOn * 0.85), 0.0, 1.0));

  // The pointer carries a faint lamp across the studio.
  if (uPointer.x >= 0.0) {
    vec2 dp = vp - uPointer;
    col += uLight * 0.7 * exp(-dot(dp, dp) / (300.0 * 300.0)) * (1.0 - uPhotoOn * 0.5);
  }

  vec2 cv = vp / max(uViewport, vec2(1.0)) - 0.5;
  col *= 1.0 - 0.22 * dot(cv, cv) * (1.0 - uLightTheme);
  col += (hash(gl_FragCoord.xy + fract(t) * 37.0) - 0.5) / 255.0;
  outColor = vec4(max(col, 0.0), 1.0);
}
`;

export const BLIT_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
out vec4 outColor;
void main() { outColor = vec4(textureLod(uScene, gl_FragCoord.xy / uRes, 0.0).rgb, 1.0); }
`;

/** One quad per surface. Per-instance material data arrives as attributes and is passed flat to the fragment shader. */
export const GLASS_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec4 aRect;   // centre x, centre y, half w, half h (canvas CSS px)
layout(location = 1) in vec4 aShape;  // corner radius, scale x, scale y, hover
layout(location = 2) in vec4 aFx;     // pointer x, y relative to centre, press, opacity
layout(location = 3) in vec4 aMatA;   // thickness, bevel, ior, dispersion
layout(location = 4) in vec4 aMatB;   // refraction, magnify, reflection, frost px
layout(location = 5) in vec4 aMatC;   // tint, edge light, shadow, accent
layout(location = 6) in vec4 aMatD;   // deform, -, -, -
uniform vec2 uView;
flat out vec4 vRect; flat out vec4 vShape; flat out vec4 vFx;
flat out vec4 vMatA; flat out vec4 vMatB; flat out vec4 vMatC; flat out vec4 vMatD;
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0));
void main() {
  vec2 halfSize = aRect.zw * max(aShape.y, aShape.z) + 18.0 + aMatD.x * 6.0;
  vec2 p = aRect.xy + CORNERS[gl_VertexID] * halfSize;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vRect = aRect; vShape = aShape; vFx = aFx; vMatA = aMatA; vMatB = aMatB; vMatC = aMatC; vMatD = aMatD;
}
`;

export const GLASS_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uView;         // canvas CSS px
uniform float uDpr;         // px per CSS px
uniform float uTime;
uniform vec3 uTint;         // glass body colour for legibility
uniform vec3 uAccent;
uniform float uLightTheme;
uniform vec2 uMouse;        // canvas CSS px, negative when absent
uniform float uScrollV;     // -1..1
uniform int uSpectral;      // 3 or 5 wavelengths at the rim
flat in vec4 vRect; flat in vec4 vShape; flat in vec4 vFx;
flat in vec4 vMatA; flat in vec4 vMatB; flat in vec4 vMatC; flat in vec4 vMatD;
out vec4 outColor;
${SHARED}

float shapeDist(vec2 p) {
  vec2 q = (p - vRect.xy) / vShape.yz;
  float r = min(vShape.x, min(vRect.z, vRect.w));
  return sdRoundBox(q, vRect.zw, r) * min(vShape.y, vShape.z);
}

vec3 sceneAt(vec2 p, float lod) {
  vec2 uv = clamp(p / uView, vec2(0.0), vec2(1.0));
  return textureLod(uScene, vec2(uv.x, 1.0 - uv.y), lod).rgb;
}
float lodFor(float px) { return log2(max(px * uDpr, 1.0)); }

// Visible-spectrum weights (red, green, blue response to a wavelength position u in 0..1, red end first).
vec3 spectrumWeight(float u) {
  float a = (u - 0.12) / 0.22, a2 = (u - 0.90) / 0.12;
  float g = (u - 0.45) / 0.22, b = (u - 0.80) / 0.21;
  return max(vec3(exp(-a * a) + 0.26 * exp(-a2 * a2), exp(-g * g), exp(-b * b)), 0.0);
}

// A rectangular studio softbox seen along direction rd.
float softbox(vec3 rd, vec3 centerDir, vec2 halfSize, vec2 softness) {
  vec3 f = normalize(centerDir);
  vec3 r = normalize(cross(f, vec3(0.0, -1.0, 0.0)));
  vec3 u = cross(r, f);
  float fd = dot(rd, f);
  if (fd <= 0.0) return 0.0;
  vec2 uv = vec2(dot(rd, r), dot(rd, u)) / max(fd, 0.15);
  vec2 d = abs(uv) - halfSize;
  return (1.0 - smoothstep(0.0, softness.x, d.x)) * (1.0 - smoothstep(0.0, softness.y, d.y)) * smoothstep(0.0, 0.35, fd);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 q = p - vRect.xy;
  float d = shapeDist(p);
  float deform = vMatD.x;
  float energy = (vShape.w * 0.35 + vFx.z) * deform;
  if (energy > 0.001 && d < 8.0) {
    float ang = atan(q.y, q.x);
    d += sin(ang * 3.0 + uTime * 2.4) * sin(ang * 2.0 - uTime * 1.7) * 0.9 * energy;
  }
  float alpha = vFx.w;
  float aaW = 0.75 / uDpr;

  // Outside: a soft contact shadow, offset down (the key light is overhead).
  if (d > aaW) {
    float ds = shapeDist(p - vec2(0.0, 3.0));
    float sh = vMatC.z * alpha * exp(-max(ds, 0.0) / 7.0) * (1.0 - 0.4 * uLightTheme) * (1.0 - smoothstep(10.0, 17.0, ds));
    if (sh < 0.003) discard;
    outColor = vec4(0.0, 0.0, 0.0, sh);
    return;
  }

  float minHalf = min(vRect.z, vRect.w) * min(vShape.y, vShape.z);
  float T = vMatA.x;
  float bevel = max(1.0, min(vMatA.y, minHalf * 0.95));
  float ior = vMatA.z, disp = vMatA.w;

  // ---- Height field and normal ----
  float e = 0.75;
  vec2 g = vec2(shapeDist(p + vec2(e, 0.0)) - shapeDist(p - vec2(e, 0.0)), shapeDist(p + vec2(0.0, e)) - shapeDist(p - vec2(0.0, e)));
  float gl = length(g);
  g = gl > 1e-4 ? g / gl : vec2(0.0);
  float u = clamp(-d / bevel, 0.0, 1.0);
  float w = 1.0 - u;
  float arc = sqrt(max(1.0 - w * w, 0.0));
  float height = T * arc;
  float slope = T / bevel * w / max(arc, 0.12);

  // Hover swells a soft dome under the pointer; a press pushes it in.
  float dome = (vShape.w * 0.55 - vFx.z * 0.9) * deform;
  vec2 bumpGrad = vec2(0.0);
  if (abs(dome) > 0.001) {
    vec2 dv = q - vFx.xy;
    float rad = max(24.0, minHalf * 1.6);
    float k = exp(-dot(dv, dv) / (rad * rad));
    float bump = dome * T * 0.5 * k;
    height += bump;
    bumpGrad = bump * (-2.0 * dv / (rad * rad));
  }
  vec2 lean = vec2(0.0, uScrollV * 0.16);
  vec2 grad = -g * slope * vMatB.x + bumpGrad + lean;
  vec3 n = normalize(vec3(-grad, 1.0));

  // ---- Refraction ----
  vec3 I = vec3(0.0, 0.0, -1.0);
  float depth = height + T * 0.6;
  vec2 mag = -q * vMatB.y * smoothstep(0.0, 1.0, u);
  float interior = smoothstep(0.25, 0.9, u);
  float frostLod = lodFor(vMatB.w * interior);
  vec3 refr;
  if (w < 0.004 && abs(dome) < 0.001 && abs(uScrollV) < 0.002) {
    // Flat optical centre: the ray passes straight through; one frosted sample.
    refr = sceneAt(p + mag, frostLod);
  } else {
    vec3 acc = vec3(0.0), wsum = vec3(0.0);
    float lod = mix(lodFor(vMatB.w * 0.2), frostLod, interior);
    for (int i = 0; i < 5; i++) {
      if (i >= uSpectral) break;
      float s = (float(i) + 0.5) / float(uSpectral);
      vec3 Tr = refract(I, n, 1.0 / (ior + disp * (s - 0.5) * 2.0));
      if (dot(Tr, Tr) < 1e-6) Tr = reflect(I, n);
      vec2 off = Tr.xy / max(abs(Tr.z), 0.2) * depth;
      vec3 wt = spectrumWeight(s);
      acc += sceneAt(p + off + mag, lod) * wt;
      wsum += wt;
    }
    refr = acc / max(wsum, vec3(1e-3));
  }

  // ---- Reflection (Fresnel): the environment mirrored in the curve, plus two studio softboxes ----
  float NdotV = clamp(n.z, 0.0, 1.0);
  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  float fres = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);
  vec3 Rv = reflect(I, n);
  vec3 envScene = sceneAt(p - Rv.xy * 90.0, lodFor(12.0));
  float panels = softbox(Rv, vec3(-0.42, -0.55, 0.72), vec2(0.34, 0.12), vec2(0.12)) * 1.4 + softbox(Rv, vec3(0.7, -0.12, 0.7), vec2(0.08, 0.5), vec2(0.1)) * 0.9;
  vec3 env = envScene + vec3(panels) * mix(0.55, 0.38, uLightTheme);
  float reflAmt = clamp(fres * vMatB.z * 2.2, 0.0, 0.9);

  // Internal reflection: steep rim pixels carry light bounced from the opposite inner wall.
  float rimK = w * w * w;
  vec3 internal = sceneAt(p + g * bevel * 1.6 - q * 0.06, lodFor(vMatB.w * 0.3) + 1.5);
  vec3 col = mix(refr, internal, rimK * 0.35 * vMatB.z);
  col = mix(col, env, reflAmt);

  // ---- Legibility: a tint that adapts to how bright the environment behind is ----
  float bl = luma(sceneAt(p, lodFor(40.0)));
  float adapt = uLightTheme < 0.5 ? smoothstep(0.3, 0.8, bl) : smoothstep(0.7, 0.2, bl);
  float tintAmt = clamp(vMatC.x * (0.85 + 0.8 * adapt) * mix(0.55, 1.0, interior), 0.0, 0.92);
  col = mix(col, uTint, tintAmt);
  col = mix(col, uAccent, vMatC.w * mix(0.5, 0.92, interior));
  col = mix(vec3(luma(col)), col, 1.12);

  // ---- Light ----
  vec2 toKey = normalize(vec2(-0.45, -0.75));
  vec2 ld = toKey;
  if (uMouse.x >= 0.0) {
    vec2 m = uMouse - vRect.xy;
    float ml = length(m);
    if (ml > 1.0) ld = normalize(mix(toKey, m / ml, 0.35 * exp(-ml / 900.0)));
  }
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Lk = normalize(vec3(ld * 0.85, 0.55));
  float spec = pow(max(dot(n, normalize(Lk + V)), 0.0), 70.0) * 0.6 * (0.25 + 0.75 * smoothstep(0.0, 0.6, w));
  if (uMouse.x >= 0.0) {
    vec3 Lm = normalize(vec3(uMouse - p, 240.0));
    spec += pow(max(dot(n, normalize(Lm + V)), 0.0), 90.0) * 0.9 * exp(-length(uMouse - p) / 380.0) * (0.12 + 0.88 * smoothstep(0.0, 0.6, w));
  }
  spec = min(spec, 2.5);
  spec = spec / (1.0 + 0.25 * spec);
  float edge = smoothstep(0.86, 1.0, w);
  float facing = dot(g, ld);
  float glint = edge * (0.6 * max(facing, 0.0) + 0.22 * max(-facing, 0.0)) * 0.42 * vMatC.y;
  float rimLine = smoothstep(0.80, 0.95, 1.0 - NdotV);
  col += vec3(1.0) * (spec + glint + rimLine * 0.10 * vMatB.z);
  col *= 1.0 - 0.18 * smoothstep(0.55, 0.80, 1.0 - NdotV) * (1.0 - rimLine) * (1.0 - 0.4 * uLightTheme);
  col += vFx.z * 0.03;

  float cover = clamp(0.5 - d * uDpr, 0.0, 1.0) * alpha;
  outColor = vec4(col, cover);
}
`;
