import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { API_CSP, createNonce, isFrameablePath, pageCsp } from "../../apps/intelligence/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.split(" ")[0] === name);

test("production page policy allows only nonce-tagged scripts", () => {
  const nonce = createNonce();
  const csp = pageCsp(nonce, { dev: false });
  const scripts = directive(csp, "script-src")!;
  assert.match(scripts, new RegExp(`'nonce-${nonce.replace(/[+/=]/g, "\\$&")}'`));
  assert.match(scripts, /'strict-dynamic'/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(directive(csp, "style-src")!, /unsafe-inline/);
  assert.equal(directive(csp, "object-src"), "object-src 'none'");
  assert.equal(directive(csp, "base-uri"), "base-uri 'self'");
  assert.equal(directive(csp, "frame-ancestors"), "frame-ancestors 'none'");
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test("nonces are fresh, 128-bit and base64", () => {
  const seen = new Set(Array.from({ length: 200 }, createNonce));
  assert.equal(seen.size, 200);
  for (const n of seen) assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
});

test("only the public showroom may be framed, and only by this site", () => {
  for (const p of ["/showroom", "/showroom/saved", "/l/abc"]) assert.ok(isFrameablePath(p), p);
  for (const p of ["/app/overview", "/login", "/admin", "/showroomx", "/lx"]) assert.ok(!isFrameablePath(p), p);
  assert.equal(directive(pageCsp("n", { frameable: true, dev: false }), "frame-ancestors"), "frame-ancestors 'self'");
});

test("development adds only what the dev server needs", () => {
  const csp = pageCsp("n", { dev: true });
  assert.match(directive(csp, "script-src")!, /'unsafe-eval'/);
  assert.doesNotMatch(directive(csp, "script-src")!, /unsafe-inline/);
});

test("API responses may load nothing, and the static config no longer allows inline scripts", async () => {
  assert.match(API_CSP, /^default-src 'none'/);
  const config = await readFile("apps/intelligence/next.config.ts", "utf8");
  assert.doesNotMatch(config, /unsafe-inline/);
  const middleware = await readFile("apps/intelligence/middleware.ts", "utf8");
  assert.match(middleware, /x-nonce/);
  const layout = await readFile("apps/intelligence/app/layout.tsx", "utf8");
  assert.match(layout, /<script nonce=\{nonce\}/);
});
