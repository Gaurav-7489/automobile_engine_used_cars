import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../../infra/cloudflare/dealer-ai/worker.mjs";
import { dealerAIConfiguration, serviceSecrets } from "../../scripts/cloudflare/service-config.mjs";

// Fixed test fixtures, never deployment credentials.
const current = "A".repeat(43), next = "B".repeat(43);
const request = (token, body = { options: [] }) => new Request("https://ai.test/explain", {
  method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
});

test("rotation preserves the current token, admits the next, and revokes the old after promotion", async () => {
  let calls = 0;
  const AI = { async run() { calls++; return { response: "Inspection required." }; } };
  const env = { SERVICE_TOKEN: current, SERVICE_TOKEN_NEXT: next, AI };
  for (const token of [current, next]) {
    const response = await worker.fetch(request(token), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  for (const token of [undefined, "invalid", "C".repeat(43)]) assert.equal((await worker.fetch(request(token), env)).status, 401);
  assert.equal((await worker.fetch(request(current), { ...env, SERVICE_TOKEN: next, SERVICE_TOKEN_NEXT: undefined })).status, 401);
  assert.equal((await worker.fetch(request(next), { ...env, SERVICE_TOKEN: undefined })).status, 401);
  assert.equal(calls, 2);
});

test("invalid requests and oversized bodies never invoke inference; model failure stays private", async () => {
  let calls = 0;
  const env = { SERVICE_TOKEN: current, AI: { async run() { calls++; throw new Error("private provider detail"); } } };
  assert.equal((await worker.fetch(new Request("https://ai.test/"), env)).status, 404);
  assert.equal((await worker.fetch(request(current, { options: [{}, {}, {}, {}] }), env)).status, 400);
  assert.equal((await worker.fetch(request(current, { options: [], extra: "x".repeat(16001) }), env)).status, 413);
  assert.equal(calls, 0);
  const failed = await worker.fetch(request(current), env);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private provider detail/);
});

test("AI configuration requires the full endpoint and matching credential without returning values", () => {
  const env = { DEALER_AI_URL: "https://ai.test/explain", DEALER_AI_SERVICE_TOKEN: current };
  assert.equal(dealerAIConfiguration({}).status, "disabled");
  assert.equal(dealerAIConfiguration(env).status, "passed");
  for (const endpoint of ["https://ai.test", "http://ai.test/explain", "https://user:private@ai.test/explain", "https://ai.test/explain?private=value"]) {
    const result = dealerAIConfiguration({ ...env, DEALER_AI_URL: endpoint });
    assert.equal(result.status, "failed");
    assert.doesNotMatch(JSON.stringify(result), /private|AAAA/);
  }
  assert.equal(dealerAIConfiguration({ DEALER_AI_URL: env.DEALER_AI_URL }).status, "failed");
  assert.equal(dealerAIConfiguration({ DEALER_AI_SERVICE_TOKEN: current }).status, "failed");
  assert.equal(dealerAIConfiguration({ ...env, DEALER_AI_SERVICE_TOKEN: ` ${current}` }).status, "failed");
});

test("AI and feed secrets only reach Command Center; Resend secrets stay with the notification worker", () => {
  const values = { DATABASE_URL: "db-fixture", DEALER_AI_URL: "https://ai.test/explain", DEALER_AI_SERVICE_TOKEN: current, VANDLABS_FEEDS_JSON: "{}", VANDLABS_FEED_TOKENS_JSON: "{}", RESEND_API_KEY: "notification-fixture", NOTIFICATION_FROM: "fixture", NOTIFICATION_TO: "fixture" };
  for (const name of ["web", "platform"]) assert.deepEqual(serviceSecrets(name, values), { DATABASE_URL: values.DATABASE_URL });
  const command = serviceSecrets("command-center", values);
  assert.equal(command.DEALER_AI_SERVICE_TOKEN, current);
  assert.equal(command.RESEND_API_KEY, undefined);
  assert.throws(() => serviceSecrets("unknown", values));
});
