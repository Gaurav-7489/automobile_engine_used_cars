import { test } from "node:test";
import assert from "node:assert/strict";
import { explainAcquisition } from "../../packages/data/src/dealer-ai";
import type { AcquisitionChoice, AcquisitionReport } from "../../packages/contracts/src/index";
const report: AcquisitionReport = { version:"v2",generatedAt:new Date().toISOString(),candidates:0,options:[],notices:[],demo:false };
test("optional AI never replaces deterministic recommendations when unavailable", async () => {
  const beforeURL = process.env.DEALER_AI_URL, beforeToken = process.env.DEALER_AI_SERVICE_TOKEN;
  try {
    delete process.env.DEALER_AI_URL; delete process.env.DEALER_AI_SERVICE_TOKEN;
    const result = await explainAcquisition(report);
    assert.equal(result.ai?.status, "not_configured"); assert.deepEqual(result.options, report.options);
    process.env.DEALER_AI_URL="https://example.test/explain";process.env.DEALER_AI_SERVICE_TOKEN="test";
    assert.equal((await explainAcquisition(report, true)).ai?.status,"unavailable","no options means nothing to explain");
  } finally { if(beforeURL===undefined)delete process.env.DEALER_AI_URL;else process.env.DEALER_AI_URL=beforeURL; if(beforeToken===undefined)delete process.env.DEALER_AI_SERVICE_TOKEN;else process.env.DEALER_AI_SERVICE_TOKEN=beforeToken; }
});

test("AI commentary defaults to no processing permission even with configured credentials", async () => {
  const beforeURL = process.env.DEALER_AI_URL, beforeToken = process.env.DEALER_AI_SERVICE_TOKEN, originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    process.env.DEALER_AI_URL = "https://example.test/explain"; process.env.DEALER_AI_SERVICE_TOKEN = "test";
    globalThis.fetch = async () => { requests++; throw new Error("must not send"); };
    assert.equal((await explainAcquisition(report)).ai?.status, "restricted");
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (beforeURL === undefined) delete process.env.DEALER_AI_URL; else process.env.DEALER_AI_URL = beforeURL;
    if (beforeToken === undefined) delete process.env.DEALER_AI_SERVICE_TOKEN; else process.env.DEALER_AI_SERVICE_TOKEN = beforeToken;
  }
});

const option = { cars: [{ year: 2021, make: "Maruti", model: "Swift", city: "Pune", distanceKm: 140 }], landedCost: 610000, remaining: 90000, marginLow: 20000, marginHigh: 45000, demandScore: null, explanation: "Fits the budget." } as unknown as AcquisitionChoice;
const withOption: AcquisitionReport = { ...report, options: [option] };
const token = "a".repeat(43);
async function withAiEnv(env: Record<string, string | undefined>, run: (sent: Request[], warnings: unknown[][]) => Promise<void>, upstream: (request: Request) => Response = () => Response.json({ text: "Commentary.", model: "test-model" })) {
  const keys = ["DEALER_AI_URL", "DEALER_AI_SERVICE_TOKEN"] as const, before = keys.map(k => process.env[k]), originalFetch = globalThis.fetch, originalWarn = console.warn;
  const sent: Request[] = [], warnings: unknown[][] = [];
  try {
    for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { const request = new Request(input, init); sent.push(request); return upstream(request); }) as typeof fetch;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    await run(sent, warnings);
  } finally {
    globalThis.fetch = originalFetch; console.warn = originalWarn;
    keys.forEach((k, i) => { if (before[i] === undefined) delete process.env[k]; else process.env[k] = before[i]; });
  }
}

test("AI requests identify the service and never travel without the bearer token", async () => {
  await withAiEnv({ DEALER_AI_URL: "https://dealer-ai.example.test/explain", DEALER_AI_SERVICE_TOKEN: token }, async sent => {
    const result = await explainAcquisition(withOption, true);
    assert.equal(result.ai?.status, "available"); assert.equal(result.ai?.text, "Commentary.");
    assert.equal(sent.length, 1);
    assert.match(sent[0].headers.get("user-agent") ?? "", /^VandLabs-CommandCenter\//, "a service User-Agent avoids edge browser-signature blocks");
    assert.equal(sent[0].headers.get("authorization"), `Bearer ${token}`);
    assert.equal(new URL(sent[0].url).href, "https://dealer-ai.example.test/explain");
    assert.equal(sent[0].redirect, "manual", "workerd rejects redirect \"error\" with a TypeError");
  });
});

test("edge rejections degrade to unavailable and log only status and ray id", async () => {
  await withAiEnv({ DEALER_AI_URL: "https://dealer-ai.example.test/explain", DEALER_AI_SERVICE_TOKEN: token }, async (_sent, warnings) => {
    const result = await explainAcquisition(withOption, true);
    assert.equal(result.ai?.status, "unavailable"); assert.deepEqual(result.options, withOption.options);
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0][1], { status: 403, transport: "url", ray: "8c0ffee-BOM" });
    assert.ok(!JSON.stringify(warnings).includes(token), "the token is never logged");
  }, () => new Response("error code: 1010", { status: 403, headers: { "cf-ray": "8c0ffee-BOM" } }));
});

test("a service binding is preferred over the public URL and works without one", async () => {
  await withAiEnv({ DEALER_AI_URL: undefined, DEALER_AI_SERVICE_TOKEN: token }, async sent => {
    const bound: Request[] = [];
    const binding = { fetch: async (request: Request) => { bound.push(request); return Response.json({ text: "Bound.", model: "test-model" }); } };
    assert.equal((await explainAcquisition(withOption, true, binding)).ai?.text, "Bound.");
    assert.equal(sent.length, 0, "no public fetch when bound");
    assert.equal(new URL(bound[0].url).pathname, "/explain");
    assert.equal(bound[0].headers.get("authorization"), `Bearer ${token}`);
    assert.equal(bound[0].redirect, "manual");
  });
  await withAiEnv({ DEALER_AI_URL: undefined, DEALER_AI_SERVICE_TOKEN: undefined }, async () => {
    const binding = { fetch: async () => { throw new Error("must not send"); } };
    assert.equal((await explainAcquisition(withOption, true, binding)).ai?.status, "not_configured", "a binding still requires the service token");
  });
});
