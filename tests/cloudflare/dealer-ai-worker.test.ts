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

const discovery = "d".repeat(43);
const search = { query: ["SUV under 40 lakh"], understood: ["SUV", "Up to ₹40 lakh"], notes: [], demo: true, cars: [{ ref: "A", name: "2023 Jeep Meridian", matches: ["SUV"], strengths: ["7 seats recorded"], checks: ["Fuel economy isn't recorded — confirm it with the dealer."] }] };
const ask = (path: string, env: Record<string, unknown>, bearer: string, body: unknown = search) => worker.fetch(new Request(`https://dealer-ai.internal${path}`, { method: "POST", headers: { authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) }), env);

test("buyer discovery and dealer commentary are separate credentials and routes", async () => {
  const prompts: string[] = [];
  const recorder = { run: async (_model: string, input: { messages: { role: string; content: string }[] }) => { prompts.push(input.messages[0].content); return { response: "Grounded summary." }; } };
  const env = { AI: recorder, SERVICE_TOKEN: current, DISCOVERY_TOKEN: discovery };
  assert.equal((await ask("/discover", env, discovery)).status, 200);
  assert.match(prompts.at(-1)!, /Do not write any other numbers/);
  assert.equal((await ask("/discover", env, current)).status, 401, "the dealer token cannot drive buyer search");
  assert.equal((await ask("/explain", env, discovery, { options: [] })).status, 401, "the public website token cannot request dealer commentary");
  assert.equal((await ask("/discover", { AI: recorder, SERVICE_TOKEN: current }, discovery)).status, 401, "discovery is off until its own token exists");
  assert.equal((await ask("/discover", { ...env, DISCOVERY_TOKEN_ALTERNATE: "n".repeat(43) }, "n".repeat(43))).status, 200, "rotation overlap");
});

test("buyer discovery accepts only bounded, well-formed summaries of shown cars", async () => {
  const env = { AI: ai, DISCOVERY_TOKEN: discovery };
  for (const body of [{ ...search, cars: [] }, { ...search, cars: Array(4).fill(search.cars[0]) }, { ...search, demo: "yes" }, { ...search, query: ["x".repeat(301)] }, { ...search, cars: [{ ...search.cars[0], matches: "SUV" }] }])
    assert.equal((await ask("/discover", env, discovery, body)).status, 400);
  const large = await ask("/discover", env, discovery, { ...search, notes: ["x".repeat(9000)] });
  assert.equal(large.status, 413);
  assert.deepEqual(await (await ask("/discover", env, discovery)).json(), { text: "Commentary.", model: "@cf/meta/llama-3.1-8b-instruct-fast" });
});
