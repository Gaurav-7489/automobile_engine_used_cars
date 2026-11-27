/**
 * GLSL ES 3.00 shaders for the liquid glass engine.
 *
 * One fullscreen pass per frame. Every pixel samples the scene texture (the moving content behind the glass). Pixels that fall
 * inside a registered surface are shaded as a thick convex slab of glass:
 *
 *   1. Shape: a rounded-rectangle signed distance per surface, combined with a smooth minimum so surfaces that come close
 *      merge like liquid. Springs on the CPU squash, stretch and bulge each shape.
 *   2. Height: a circular bevel profile (flat optical centre, steep rim), giving a surface normal from the distance gradient.
 *   3. Refraction: Snell's law per colour channel (three indices of refraction = chromatic dispersion). The refracted ray is
 *      followed down through the glass thickness to the scene plane, which displaces and magnifies what is behind.
 *   4. Reflection: Schlick Fresnel mixes in a blurred, mirrored sample of the scene (environment reflection) and a soft
 *      studio light; steep rim pixels add a total-internal-reflection sample from the opposite side of the lens.
 *   5. Light: Blinn-Phong highlights from a fixed key light and from the cursor; scroll velocity tilts the surface slightly.
 *   6. Legibility: a per-surface tint that adapts to the brightness of what is behind it, so text on the glass stays readable.
 */

export const MAX_SURFACES = 24;

/** Fullscreen triangle for the background pass. */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** The background pass: the scene, unchanged. Cheap, so most of the screen costs one texture read. */
export const BACKGROUND_SHADER = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uView;
uniform float uDpr;
out vec4 outColor;
void main() {
  vec2 uv = vec2(gl_FragCoord.x, gl_FragCoord.y) / (uView * uDpr);
  outColor = vec4(textureLod(uScene, uv, 0.0).rgb, 1.0);
}
`;

/**
 * The glass pass is drawn as one instanced quad per surface (its box plus a margin for the shadow, the merge bridge and
 * deformation), so the expensive shader only runs near glass. Overlapping quads write identical colours.
 */
export const GLASS_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
#define MAX_SURFACES ${MAX_SURFACES}
uniform vec4 uRect[MAX_SURFACES];
uniform vec4 uShape[MAX_SURFACES];
uniform vec2 uView;
uniform float uMargin;
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0));
void main() {
  vec4 R = uRect[gl_InstanceID];
  vec2 halfSize = R.zw * max(uShape[gl_InstanceID].y, uShape[gl_InstanceID].z) + uMargin;
  vec2 p = R.xy + CORNERS[gl_VertexID] * halfSize;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

#define MAX_SURFACES ${MAX_SURFACES}

uniform sampler2D uScene;
uniform vec2 uView;          // viewport size in CSS px
uniform float uDpr;          // canvas px per CSS px
uniform int uCount;
uniform vec4 uRect[MAX_SURFACES];   // centre x, centre y, half w, half h (CSS px, top-left origin)
uniform vec4 uShape[MAX_SURFACES];  // corner radius, scale x, scale y, hover 0..1
uniform vec4 uFx[MAX_SURFACES];     // pointer x, pointer y (CSS px, relative to centre), press 0..1, tint 0..1
uniform float uAlpha[MAX_SURFACES]; // element opacity, so fades and exits fade the glass too

uniform float uIor;
uniform float uThickness;    // glass height in CSS px
uniform float uBevel;        // rim width in CSS px
uniform float uDispersion;
uniform float uReflection;
uniform float uFrost;        // mip level for the refracted sample
uniform float uMagnify;
uniform float uMerge;        // smooth-union radius in CSS px
uniform float uDeform;
uniform float uTheme;        // 0 dark, 1 light
uniform vec3 uTint;
uniform vec2 uMouse;         // CSS px; negative when no pointer
uniform float uScrollV;      // -1..1
uniform float uTime;
uniform float uShadow;

out vec4 outColor;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Distance to one surface with its spring deformation applied.
float surfaceDist(int i, vec2 p) {
  vec4 R = uRect[i];
  vec4 S = uShape[i];
  vec2 c = R.xy;
  vec2 q = p - c;
  vec2 scale = S.yz;
  q /= scale;
  vec2 b = R.zw;
  float r = min(S.x, min(b.x, b.y));
  float d = sdRoundBox(q, b, r) * min(scale.x, scale.y);
  // Liquid wobble on the rim while the shape is being pressed or hovered: a slow, low-amplitude standing wave.
  float energy = (S.w * 0.35 + uFx[i].z) * uDeform;
  if (energy > 0.001 && d < 6.0) {
    float a = atan(q.y, q.x);
    d += sin(a * 3.0 + uTime * 2.4) * sin(a * 2.0 - uTime * 1.7) * 0.9 * energy;
  }
  return d;
}

// Combined field: smooth union of all surfaces. Also returns the index of the nearest surface and its blend weight.
float field(vec2 p, out int nearest) {
  float d = 1e5;
  float best = 1e5;
  nearest = -1;
  for (int i = 0; i < MAX_SURFACES; i++) {
    if (i >= uCount) break;
    float di = surfaceDist(i, p);
    if (di < best) { best = di; nearest = i; }
    d = (uMerge > 0.5) ? smin(d, di, uMerge) : min(d, di);
  }
  return d;
}

float fieldOnly(vec2 p) { int n; return field(p, n); }

vec3 sceneAt(vec2 p, float lod) {
  vec2 uv = clamp(p / uView, vec2(0.0), vec2(1.0));
  return textureLod(uScene, vec2(uv.x, 1.0 - uv.y), lod).rgb;
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec3 base = sceneAt(p, 0.0);

  int idx;
  float d = field(p, idx);
  float aa = 0.75 / uDpr;
  float alpha = idx >= 0 ? uAlpha[idx] : 0.0;

  // Outside every surface: the scene, with a soft contact shadow around the glass.
  if (d > aa || alpha < 0.004) {
    float sh = idx >= 0 ? uShadow * alpha * exp(-max(d, 0.0) / 18.0) * (1.0 - uTheme * 0.35) : 0.0;
    outColor = vec4(base * (1.0 - sh), 1.0);
    return;
  }

  vec4 R = uRect[idx];
  vec4 S = uShape[idx];
  vec4 F = uFx[idx];
  vec2 c = R.xy;

  // ---- Height field and normal ----
  float bevel = max(1.0, min(uBevel, min(R.z, R.w) * min(S.y, S.z)));
  float e = 0.75;
  float dx = fieldOnly(p + vec2(e, 0.0)) - fieldOnly(p - vec2(e, 0.0));
  float dy = fieldOnly(p + vec2(0.0, e)) - fieldOnly(p - vec2(0.0, e));
  vec2 g = vec2(dx, dy) / (2.0 * e);
  float gl = length(g);
  g = gl > 1e-4 ? g / gl : vec2(0.0);

  float u = clamp(-d / bevel, 0.0, 1.0);       // 0 at the rim, 1 where the flat top begins
  float w = 1.0 - u;
  float arc = sqrt(max(1.0 - w * w, 0.0));      // circular bevel
  float height = uThickness * arc;
  float slope = uThickness / bevel * w / max(arc, 0.12);   // dh/d(depth), clamped at the very rim

  // Hover bulge: a soft dome under the cursor (spring-eased), pressed down when clicked.
  vec2 local = p - c;
  float bump = 0.0;
  vec2 bumpGrad = vec2(0.0);
  float dome = (S.w * 0.55 - F.z * 0.9) * uDeform;
  if (abs(dome) > 0.001) {
    vec2 dv = local - F.xy;
    float rad = max(28.0, min(R.z, R.w) * 1.6);
    float k = exp(-dot(dv, dv) / (rad * rad));
    bump = dome * uThickness * 0.5 * k;
    bumpGrad = bump * (-2.0 * dv / (rad * rad));
  }
  height += bump;

  // Scroll velocity leans the surface a little in the scroll direction.
  vec2 lean = vec2(0.0, uScrollV * 0.18 * uDeform);
  vec2 grad = -g * slope + bumpGrad + lean;     // gradient of height over the plane (height rises inward)
  vec3 n = normalize(vec3(-grad, 1.0));

  // ---- Refraction with dispersion ----
  vec3 I = vec3(0.0, 0.0, -1.0);
  float depth = height + uThickness * 0.6;     // the scene plane sits a little below the glass
  vec2 mag = -local * uMagnify * smoothstep(0.0, 1.0, u);
  float iors[3];
  iors[0] = uIor - uDispersion;
  iors[1] = uIor;
  iors[2] = uIor + uDispersion;
  // Text-bearing glass (tint > 0) frosts its flat interior so busy backgrounds cannot fight the text; the rim stays sharp and
  // keeps refracting crisply. Clear glass (tint 0) is never frosted.
  float interior = smoothstep(0.25, 0.9, u);
  float lod = uFrost + F.w * 9.0 * interior;
  vec3 refr;
  bool tir = false;
  for (int ch = 0; ch < 3; ch++) {
    vec3 T = refract(I, n, 1.0 / iors[ch]);
    if (dot(T, T) < 1e-6) { tir = true; T = reflect(I, n); }
    vec2 off = T.xy / max(abs(T.z), 0.2) * depth;
    vec3 s = sceneAt(p + off + mag, lod);
    refr[ch] = s[ch];
  }

  // ---- Reflection (Fresnel) ----
  float cosT = clamp(dot(n, -I), 0.0, 1.0);
  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float fres = f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
  vec3 Rv = reflect(I, n);
  // Environment: the scene seen in the curved surface (mirrored about the rim, heavily blurred) plus a soft overhead studio light.
  vec3 envScene = sceneAt(p - Rv.xy * 90.0, 4.5);
  float sky = smoothstep(-0.2, 0.9, -Rv.y) * 0.55 + 0.25;
  vec3 env = mix(envScene, vec3(sky), 0.45);
  float reflAmt = clamp(fres * uReflection * 2.2, 0.0, 0.85);

  // Internal reflection: steep rim pixels also carry light bounced from the opposite inner wall.
  float rim = pow(w, 3.0);
  vec3 internal = sceneAt(p + g * bevel * 1.6 + (c - p) * 0.08, uFrost + 1.5);
  vec3 col = mix(refr, internal, rim * 0.35 * uReflection + (tir ? 0.25 : 0.0));
  col = mix(col, env, reflAmt);

  // ---- Legibility tint, adaptive to what is behind ----
  // Adapt to brightness (bright scenery under light text needs more tint) and to busyness (fine detail that survives the frost).
  float bl = luma(sceneAt(p, 5.0));
  float busy = clamp(abs(luma(sceneAt(p, 2.0)) - bl) * 2.5, 0.0, 1.0);
  float adapt = uTheme < 0.5 ? smoothstep(0.3, 0.8, bl) : smoothstep(0.7, 0.2, bl);
  float tintAmt = clamp(F.w * (0.8 + (1.0 + 0.6 * uTheme) * adapt + 0.6 * busy) * mix(0.55, 1.0, interior), 0.0, 0.9);
  col = mix(col, uTint, tintAmt);
  // Slight vibrancy on the clear glass.
  float lc = luma(col);
  col = mix(vec3(lc), col, 1.12);

  // ---- Specular light ----
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Lk = normalize(vec3(-0.45, -0.75, 0.55));   // key light from the top left
  vec3 Hk = normalize(Lk + V);
  float spec = pow(max(dot(n, Hk), 0.0), 60.0) * 0.55;
  if (uMouse.x >= 0.0) {
    vec3 Lm = normalize(vec3(uMouse - p, 260.0));
    vec3 Hm = normalize(Lm + V);
    float near = exp(-length(uMouse - p) / 420.0);
    spec += pow(max(dot(n, Hm), 0.0), 90.0) * 0.9 * near;
  }
  // The rim line: bright on the side facing the light, a soft shade on the other side for thickness.
  float facing = dot(-g, normalize(vec2(-0.45, -0.75)));
  float rimLine = smoothstep(0.82, 1.0, w) * (0.5 + 0.5 * facing);
  float rimShade = smoothstep(0.6, 1.0, w) * max(-facing, 0.0) * 0.12;
  col += vec3(1.0) * (spec + rimLine * 0.28 * uReflection);
  col *= 1.0 - rimShade;
  // Pressed glass catches a little more light, like a lens pushed toward the eye.
  col += F.z * 0.03;

  float cover = clamp(0.5 - d * uDpr, 0.0, 1.0) * alpha;
  outColor = vec4(mix(base, col, cover), 1.0);
}
`;
