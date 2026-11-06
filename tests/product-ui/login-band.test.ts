import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { LoginBand } from "../../apps/intelligence/components/login/login-cinema";

test("phones get a slim, decorative night-drive band; it is hidden on desktop and still under reduced motion", async () => {
  // React lives in the app's own dependencies, not at the repository root.
  const appRequire = createRequire(new URL("../../apps/intelligence/package.json", import.meta.url));
  const React = appRequire("react") as typeof import("react");
  const { createElement } = React;
  // The test runner compiles the app's TSX with the classic transform, which expects a global React (Next.js does not).
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = appRequire("react-dom/server") as typeof import("react-dom/server");
  const html = renderToStaticMarkup(createElement(LoginBand));
  assert.match(html, /^<div class="cine-band" aria-hidden="true">/, "decorative: skipped by screen readers");
  assert.ok(!/hero-car|cine-captions/.test(html), "minimal: no car and no captions");
  assert.ok(!/<(a|button|input)\b/.test(html), "nothing focusable");

  const css = await readFile("apps/intelligence/app/globals.css", "utf8");
  assert.match(css, /\.cine-band \{ display: none; \}/, "hidden by default (desktop shows the full panel)");
  assert.match(css, /@media \(max-width: 1023px\) \{\s*\.cine-band \{ display: block;[^}]*height: 88px;/);
  assert.match(css, /@media \(max-width: 767px\) \{ \.cine-band \{ height: 72px; \} \}/);
  const reduced = css.slice(css.indexOf("/* Every cinematic and card animation stops under reduced motion. */"));
  assert.match(reduced, /@media \(prefers-reduced-motion: reduce\) \{\s*[^}]*\.cine-band \*/, "system reduced-motion setting");
  assert.match(reduced, /:root\[data-motion="reduced"\] \.cine-band \*/, "in-app reduced-motion setting");

  const page = await readFile("apps/intelligence/components/login/login-experience.tsx", "utf8");
  assert.match(page, /<LoginBand \/>/);
  assert.match(page, /label="Business email"/, "the sign-in form keeps its labels");
});
