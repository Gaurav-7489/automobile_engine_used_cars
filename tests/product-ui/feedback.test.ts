import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p: string) => readFile(`apps/intelligence/${p}`, "utf8");

test("filters, tabs and views update the address in place, with no server round trip before the screen changes", async () => {
  const ws = await read("components/workspace.tsx");
  assert.match(ws, /window\.history\.pushState\(null, "", url\)/);
  assert.match(ws, /window\.history\.replaceState\(null, "", url\)/);
  // Safe only while no server component reads the query string: keep it that way.
  for (const page of ["overview", "leads", "inventory", "advertising", "alerts", "pricing", "reports", "capital"]) {
    const src = await read(`app/app/${page}/page.tsx`);
    assert.ok(!/searchParams/.test(src), `${page} page must not read searchParams on the server`);
  }
});

test("a followed link is marked at once and released when the page arrives or after a timeout", async () => {
  const loader = await read("components/motion/route-loader.tsx");
  assert.match(loader, /a\.setAttribute\("data-pending", "true"\)/);
  assert.match(loader, /removeAttribute\("data-pending"\)/);
  assert.match(loader, /addEventListener\("click", onClick, true\)/, "capture phase: Next links cancel the bubbling click");
  const css = await read("app/globals.css");
  assert.match(css, /a\[data-pending\]/);
});

test("press feedback is visible, and switched off for reduced motion", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.btn:active:not\(:disabled\)[^{]*\{ transform: scale\(0\.96\); \}/);
  assert.match(css, /\.btn-primary:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{ background:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.btn:active/);
  assert.match(css, /:root\[data-motion="reduced"\] \.btn:active/);
});

test("shadows come from one scale, with no coloured glow on the selected tab", async () => {
  const css = await read("app/globals.css");
  for (const level of ["--e1", "--e2", "--e3", "--e4"]) assert.equal((css.match(new RegExp(`${level}: `, "g")) ?? []).length >= 3, true, `${level} defined for dark, light and system-light`);
  assert.match(css, /\.liquid-pill \{ background: var\(--accent-subtle\); box-shadow: none; \}/);
  assert.match(css, /\.dialog, \.drawer, \.overlay\.sheet-wrap \.dialog, \.dialog\.w480 \{ box-shadow: var\(--e4\); \}/);
});

test("a lead opened from a link shows its drawer at once while the record loads", async () => {
  const src = await read("components/leads/leads-page.tsx");
  assert.match(src, /description="Loading the lead…"/);
  assert.match(src, /aria-label="Loading lead"/);
});

test("no decorative dot-and-caps labels: sign-in, admin header, onboarding and showroom start with their headline", async () => {
  const files = ["components/login/login-experience.tsx", "components/admin/admin-home.tsx", "components/onboarding/onboarding.tsx", "app/showroom/page.tsx", "components/login/login-cinema.tsx"];
  for (const f of files) {
    const src = await read(f);
    assert.ok(!/login-kicker|login-dot|adm-kicker|className="eyebrow"|cine-captions|Acquire with evidence/.test(src), `${f} has a decorative label`);
  }
  const css = await read("app/globals.css");
  assert.ok(!/\.login-dot|\.login-kicker|\.adm-kicker|\.cine-captions/.test(css), "their styles are gone too");
});
