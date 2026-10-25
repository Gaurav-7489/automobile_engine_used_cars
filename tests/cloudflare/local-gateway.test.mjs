import { test } from "node:test";
import assert from "node:assert/strict";
import { targetPort, rewriteLocation } from "../../scripts/local-gateway.mjs";
import { surface } from "../../infra/cloudflare/src/admission-core.ts";

test("the local one-address gateway routes every path exactly like the Cloudflare gateway", () => {
  const ports = { WEB: 3000, COMMAND: 3001, PLATFORM: 3002, INTELLIGENCE: 3003 };
  for (const path of ["/", "/inventory", "/dealer", "/command", "/command/leads", "/commanding", "/platform", "/platform/staff", "/platforms", "/intelligence", "/intelligence/app/overview", "/intelligence/api/workspace", "/intelligencex", "/api/leads"]) {
    assert.equal(targetPort(path), ports[surface(path)], path);
  }
  assert.equal(targetPort("/intelligence/login?returnTo=/app"), 3003);
});

test("absolute redirects from an app come back onto the product address", () => {
  const origin = "http://127.0.0.1:8080";
  assert.equal(rewriteLocation("http://127.0.0.1:3003/intelligence/login?x=1", origin), "http://127.0.0.1:8080/intelligence/login?x=1");
  assert.equal(rewriteLocation("http://localhost:3001/command", origin), "http://127.0.0.1:8080/command");
  assert.equal(rewriteLocation("/intelligence/app/overview", origin), "/intelligence/app/overview");
  assert.equal(rewriteLocation("https://auth.example/oauth2/authorize", origin), "https://auth.example/oauth2/authorize");
  assert.equal(rewriteLocation("http://127.0.0.1:30001/x", origin), "http://127.0.0.1:30001/x");
});
