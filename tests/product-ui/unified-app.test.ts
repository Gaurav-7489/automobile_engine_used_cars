import { test } from "node:test";
import assert from "node:assert/strict";
import manifest from "../../apps/intelligence/app/manifest";

test("no public showroom gateway remains in the platform's configuration", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = await readFile("apps/intelligence/next.config.ts", "utf8");
  assert.ok(!/rewrites|showroom/i.test(config), "next.config.ts must not proxy a public showroom");
  const redirects = await (await import("../../apps/intelligence/next.config")).default.redirects!();
  assert.deepEqual(redirects.map(r => r.source).sort(), ["/app", "/app/finance", "/app/sales", "/app/staff"]);
});

test("the installed application starts at the shared login and covers the whole ecosystem", () => {
  const app = manifest();
  assert.equal(app.scope, "/");
  assert.equal(app.start_url, "/login?source=installed");
  assert.equal(app.display, "standalone");
  assert.deepEqual(app.icons?.map(icon => icon.sizes), ["192x192", "512x512"]);
});
