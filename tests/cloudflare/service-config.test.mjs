import { test } from "node:test";
import assert from "node:assert/strict";
import { serviceSecrets } from "../../scripts/cloudflare/service-config.mjs";

const all = { DATABASE_URL: "d", SESSION_SECRET: "s", DEALER_AI_URL: "u", DEALER_AI_SERVICE_TOKEN: "t",
  VANDLABS_FEEDS_JSON: "f", VANDLABS_FEED_TOKENS_JSON: "ft", DISCOVERY_AI_SERVICE_TOKEN: "dt" };
test("only Command Center receives Dealer AI and licensed-feed credentials", () => {
  assert.deepEqual(Object.keys(serviceSecrets("command-center", all)).sort(),
    ["DATABASE_URL", "DEALER_AI_SERVICE_TOKEN", "DEALER_AI_URL", "SESSION_SECRET", "VANDLABS_FEEDS_JSON", "VANDLABS_FEED_TOKENS_JSON"]);
  for (const surface of ["web", "platform"]) {
    const keys = Object.keys(serviceSecrets(surface, all));
    for (const key of ["DEALER_AI_URL", "DEALER_AI_SERVICE_TOKEN", "VANDLABS_FEEDS_JSON", "VANDLABS_FEED_TOKENS_JSON"]) assert.ok(!keys.includes(key), `${surface} must not receive ${key}`);
  }
});
test("only the public site receives the discovery AI credential", () => {
  assert.ok("DISCOVERY_AI_SERVICE_TOKEN" in serviceSecrets("web", all));
  for (const surface of ["command-center", "platform"]) assert.ok(!("DISCOVERY_AI_SERVICE_TOKEN" in serviceSecrets(surface, all)));
});
test("unknown surfaces are rejected", () => assert.throws(() => serviceSecrets("other", all)));
