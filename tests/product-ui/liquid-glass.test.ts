import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const app = "apps/intelligence";
const read = (f: string) => readFile(join(app, f), "utf8");

async function files(dir: string, ext: RegExp): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(join(app, dir))) {
    const rel = join(dir, name);
    if ((await stat(join(app, rel))).isDirectory()) out.push(...await files(rel, ext));
    else if (ext.test(name)) out.push(rel);
  }
  return out;
}

test("no CSS blur stands in for glass: backdrop-filter is gone from every stylesheet and component", async () => {
  for (const f of [...await files("app", /\.(css|tsx)$/), ...await files("components", /\.(css|tsx)$/)]) {
    assert.ok(!/backdrop-filter/.test(await read(f)), `${f} uses backdrop-filter`);
  }
});

test("one WebGL2 context for the whole application, mounted once in the root layout", async () => {
  const [layout, engine, boot] = await Promise.all([read("app/layout.tsx"), read("lib/liquid-glass/engine.ts"), read("lib/liquid-glass/boot.ts")]);
  assert.match(layout, /<LiquidGlassRoot \/>/);
  assert.equal((engine.match(/getContext\("webgl2"/g) ?? []).length, 1, "the engine owns the only context");
  assert.ok(!/getContext\("webgl/.test(boot), "tier detection must not open a second context");
  assert.match(engine, /drawArraysInstanced/, "all surfaces in one instanced draw");
});

test("the engine handles context loss, hidden tabs, idle time, reduced motion and adaptive resolution", async () => {
  const engine = await read("lib/liquid-glass/engine.ts");
  for (const needle of ["webglcontextlost", "webglcontextrestored", "visibilitychange", "IDLE_FREEZE_MS", "IntersectionObserver", "trackFrame", "TIME_ELAPSED_EXT"]) assert.ok(engine.includes(needle), needle);
  const boot = await read("lib/liquid-glass/boot.ts");
  assert.match(boot, /prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)/, "people who ask for less transparency get solid materials");
});

test("the optical model: spectral dispersion, Fresnel, softbox reflections, internal reflection and polished-edge cues", async () => {
  const shader = await read("lib/liquid-glass/shader.ts");
  for (const needle of ["spectrumWeight", "refract(I, n", "f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0)", "softbox(Rv", "internal", "rimLine", "spec / (1.0 + 0.25 * spec)"]) assert.ok(shader.includes(needle), needle);
});

test("every shared surface class maps to a material", async () => {
  const registry = await read("lib/liquid-glass/registry.ts");
  for (const cls of [".topbar", ".rail", ".bottom-nav", ".dialog", ".drawer", ".menu", ".toast", ".ask-panel", ".ask-fab", ".card", ".kpi", ".table-wrap", ".state-box", ".section-tabs", ".btn-primary", ".login-form", ".sr-header", ".adm-side", ".lg-indicator", ".liquid-pill"]) {
    assert.ok(registry.includes(cls), `${cls} has no material`);
  }
});

test("no demonstration route ships, and the AGPL glass-gl package is not a dependency", async () => {
  await assert.rejects(stat(join(app, "app/lab")));
  const pkg = JSON.parse(await read("package.json"));
  assert.ok(!("glass-gl" in { ...pkg.dependencies, ...pkg.devDependencies }));
});
