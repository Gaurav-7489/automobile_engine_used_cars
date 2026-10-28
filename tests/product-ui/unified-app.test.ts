import { test } from "node:test";
import assert from "node:assert/strict";
import { showroomRewrites } from "../../apps/intelligence/lib/showroom-routing";
import manifest from "../../apps/intelligence/app/manifest";

test("the showroom gateway cannot take over private pages or authentication", () => {
  const routes = showroomRewrites("https://showroom.example");
  const patterns = routes.map(r => new RegExp("^" + r.source.replace(/:[a-z]+\*/g, ".*").replace(/:[a-z]+/g, "[^/]+") + "$"));
  for (const path of ["/login", "/admin", "/admin/dealers", "/app/overview", "/join/secret", "/api/auth/login", "/api/workspace", "/api/admin/workspaces", "/api/vehicles/V-1/photos", "/api/v1/leads", "/api/events", "/manifest.webmanifest", "/install", "/_next/static/private.js"]) {
    assert.ok(!patterns.some(pattern => pattern.test(path)), path);
  }
  for (const path of ["/", "/inventory", "/vehicles/car-one", "/api/vehicles/car-one", "/api/discover/cards", "/api/showroom/events", "/showroom-assets/_next/static/public.js"]) {
    assert.ok(patterns.some(pattern => pattern.test(path)), path);
  }
  assert.equal(routes.find(r => r.source === "/showroom-assets/_next/:path*")?.destination, "https://showroom.example/_next/:path*");
});

test("gateway destinations require a trusted deployment origin", () => {
  assert.deepEqual(showroomRewrites(undefined), []);
  assert.ok(showroomRewrites("http://127.0.0.1:3000").length);
  for (const value of ["http://showroom.example", "https://user:password@showroom.example", "https://showroom.example/path", "https://showroom.example?x=1", "https://showroom.example/", "not-a-url"]) assert.throws(() => showroomRewrites(value));
});

test("the installed application starts at the shared login and covers the whole ecosystem", () => {
  const app = manifest();
  assert.equal(app.scope, "/");
  assert.equal(app.start_url, "/login?source=installed");
  assert.equal(app.display, "standalone");
  assert.deepEqual(app.icons?.map(icon => icon.sizes), ["192x192", "512x512"]);
});
