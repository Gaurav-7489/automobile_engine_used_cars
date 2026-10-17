import { test } from "node:test";
import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import worker from "../../infra/cloudflare/dealer-ai/worker.mjs";

// workerd provides crypto.subtle.timingSafeEqual; Node does not.
const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean };
subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b));

const current = "c".repeat(43), alternate = "n".repeat(43);
const ai = { run: async () => ({ response: "Commentary." }) };
const call = (env: Record<string, unknown>, bearer?: string) => worker.fetch(new Request("https://dealer-ai.internal/explain", { method: "POST", headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, body: JSON.stringify({ options: [] }) }), { AI: ai, ...env });

test("the worker accepts the current token and an alternate only during rotation", async () => {
  assert.equal((await call({ SERVICE_TOKEN: current }, current)).status, 200);
  assert.equal((await call({ SERVICE_TOKEN: current }, alternate)).status, 401);
  assert.equal((await call({ SERVICE_TOKEN: current, SERVICE_TOKEN_ALTERNATE: alternate }, alternate)).status, 200);
  assert.equal((await call({ SERVICE_TOKEN: current, SERVICE_TOKEN_ALTERNATE: alternate }, current)).status, 200);
  assert.equal((await call({ SERVICE_TOKEN: current, SERVICE_TOKEN_ALTERNATE: "retired" }, current)).status, 200);
});

test("the worker rejects missing, malformed and placeholder tokens with 401, never 403", async () => {
  for (const [env, bearer] of [[{}, current], [{ SERVICE_TOKEN: current }, undefined], [{ SERVICE_TOKEN: current }, "short"], [{ SERVICE_TOKEN: "retired", SERVICE_TOKEN_ALTERNATE: "retired" }, current], [{ SERVICE_TOKEN: "short" }, "short"]] as const) {
    const response = await call(env, bearer);
    assert.equal(response.status, 401, JSON.stringify(env));
  }
  assert.equal((await worker.fetch(new Request("https://dealer-ai.internal/other", { method: "POST" }), { AI: ai, SERVICE_TOKEN: current })).status, 404);
});
