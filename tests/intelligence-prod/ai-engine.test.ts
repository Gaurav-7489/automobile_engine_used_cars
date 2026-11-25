import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenerateContentParameters, GenerateContentResponse } from "../../apps/intelligence/node_modules/@google/genai";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { runAssistant } from "../../apps/intelligence/lib/server/assistant";
import { handleCustomerMessage } from "../../apps/intelligence/lib/server/customer-ai";
import { saveChannel } from "../../apps/intelligence/lib/server/channels";
import { contactKey } from "../../apps/intelligence/lib/server/conversations";
import { aiConfig, aiLimits } from "../../apps/intelligence/lib/server/ai/config";
import { providerWithClient, runConversation } from "../../apps/intelligence/lib/server/ai/engine";
import { AiError, userMessage } from "../../apps/intelligence/lib/server/ai/errors";
import { GeminiApiError as ApiError, geminiError, type GeminiClient } from "../../apps/intelligence/lib/server/ai/providers/gemini";
import { aiStatus, resetAiStatusCache } from "../../apps/intelligence/lib/server/ai/status";
import { appendToThread, createThread, deleteThread, listThreads, readThread } from "../../apps/intelligence/lib/server/ai/history";
import { usageToday } from "../../apps/intelligence/lib/server/ai/usage";

/*
 * The provider-independent AI engine, tested with scripted Gemini and Claude clients and synthetic dealership data only.
 * No real AI service is called here.
 */

const secs = () => Math.floor(Date.now() / 1000);
const AI_ENV = ["AI_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ASSISTANT_MODEL", "AI_TENANT_DAILY_CALLS", "AI_TENANT_DAILY_TOKENS", "AI_GLOBAL_DAILY_CALLS", "AI_MAX_RETRIES", "AI_MAX_RETRY_DELAY_MS", "AI_MAX_CONCURRENCY", "AI_QUEUE_WAIT_MS", "AI_TIMEOUT_MS", "AI_CALLS_PER_MINUTE"];

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(AI_ENV.map((k) => [k, process.env[k]]));
  for (const k of AI_ENV) delete process.env[k];
  // The shared per-minute limiter is tested on its own; elsewhere it is off so scripted calls are not throttled.
  for (const [k, v] of Object.entries({ AI_CALLS_PER_MINUTE: "0", ...values })) if (v !== undefined) process.env[k] = v;
  try { return await run(); } finally {
    for (const k of AI_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

async function setup() {
  const h = await harness();
  const admin = await h.admin.connect();
  const p = await provisionWorkspace(admin, { organization: "Synthetic Motors", dealership: "Synthetic Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 90000 00000" }], owner: { email: "owner@synthetic.example", name: "Owner S" } });
  const other = await provisionWorkspace(admin, { organization: "Other Synthetic", dealership: "Other", locations: [{ name: "Main", city: "Pune", state: "Maharashtra", phone: "1" }], owner: { email: "owner@other.example", name: "Owner O" } });
  await admin.query("INSERT INTO vehicles(tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,'s-1','S-1',$4,'published','available')",
    [p.tenantId, p.dealershipId, p.locationIds[0], JSON.stringify({ make: "Hyundai", model: "Creta", variant: "SX", year: 2021, price: 1450000, mileage: 32000, fuelType: "diesel", transmission: "manual", ownership: 1 })]);
  const ownerOf = async (ws: typeof p): Promise<Principal> => {
    const r = await redeemToken(ws.ownerToken, "correct horse battery 7");
    return (await resolvePrincipal((r as { userId: string }).userId, ws.tenantId, secs()))!;
  };
  const owner = await ownerOf(p);
  const inv = await issueInvite(owner, { email: "sales@synthetic.example", name: "Sales", role: "sales", locationIds: p.locationIds, dealershipIds: owner.dealershipIds });
  const s = await redeemToken((inv as { token: string }).token, "another horse battery 8");
  const sales = (await resolvePrincipal((s as { userId: string }).userId, p.tenantId, secs()))!;
  return { h, p, other, owner, sales, otherOwner: await ownerOf(other) };
}

type Chunk = Partial<GenerateContentResponse>;
type Reply = Chunk[] | Error | "hang";
/** A scripted Gemini client: each generateContentStream call plays the next reply's chunks (or throws). Records requests. */
function gemini(replies: Reply[], sent: { contents: unknown; config: Record<string, unknown> }[] = []): GeminiClient {
  return {
    models: {
      async generateContentStream(params: GenerateContentParameters) {
        const { abortSignal, ...config } = (params.config ?? {}) as Record<string, unknown> & { abortSignal?: AbortSignal };
        sent.push({ contents: structuredClone(params.contents), config: structuredClone(config) });
        const reply = replies.shift();
        if (!reply) throw new Error("no scripted reply left");
        if (reply instanceof Error) throw reply;
        if (reply === "hang") {
          await new Promise((_, reject) => abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
        }
        return (async function* () { for (const c of reply as Chunk[]) yield c as GenerateContentResponse; })();
      },
      async get() { return { name: "models/test" }; },
    },
  };
}
const text = (t: string, finishReason?: string): Chunk => ({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, ...(finishReason ? { finishReason: finishReason as never } : {}) }] } as Chunk);
const call = (name: string, args: Record<string, unknown>, id = "fc-1"): Chunk => ({ candidates: [{ content: { role: "model", parts: [{ functionCall: { id, name, args }, thoughtSignature: "sig-abc" }] }, finishReason: "STOP" as never }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 5 } } as Chunk);
const done = (t: string): Chunk[] => [text(t.slice(0, 5)), { ...text(t.slice(5), "STOP"), usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 20 } } as Chunk];

test("provider selection comes from the environment; the original Claude setup keeps working; keys never appear in status", async () => {
  await withEnv({}, async () => {
    assert.deepEqual(aiConfig(), { provider: "anthropic", model: "claude-opus-5-5", configured: false, problem: "ANTHROPIC_API_KEY is not set." });
  });
  await withEnv({ ANTHROPIC_API_KEY: "sk-ant-test-0000000000000000", ASSISTANT_MODEL: "claude-custom" }, async () => {
    assert.deepEqual(aiConfig(), { provider: "anthropic", model: "claude-custom", configured: true, problem: null }, "unset AI_PROVIDER keeps the original behaviour");
  });
  await withEnv({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "sk-ant-test-0000000000000000" }, async () => {
    const cfg = aiConfig();
    assert.equal(cfg.provider, "gemini");
    assert.equal(cfg.configured, false, "a Claude key never makes Gemini look ready, and there is no silent switch to Claude");
    assert.equal(cfg.problem, "GEMINI_API_KEY is not set.");
  });
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "AQ.synthetic-test-key-value", GEMINI_MODEL: "gemini-flash-latest" }, async () => {
    resetAiStatusCache();
    const status = await aiStatus();
    assert.equal(status.provider, "gemini");
    assert.equal(status.model, "gemini-flash-latest");
    assert.equal(status.configured, true);
    assert.ok(!JSON.stringify(status).includes("synthetic-test-key"), "the key is never part of the status");
    delete process.env.AI_CALLS_PER_MINUTE;
    assert.equal(aiLimits().tenantDailyCalls, 200, "free-tier friendly defaults for Gemini");
    assert.equal(aiLimits().callsPerMinute, 5);
    assert.equal(aiLimits().maxRetries, 1);
    assert.equal(aiLimits("anthropic").callsPerMinute, 0, "Claude keeps the original, unthrottled behaviour");
  });
  await withEnv({ AI_PROVIDER: "openai", GEMINI_API_KEY: "x" }, async () => assert.equal(aiConfig().configured, false));
});

test("Gemini: streamed answer after a tool call, thought signature replayed, results scoped to the member, usage recorded", async () => {
  const { h, p, owner } = await setup();
  try {
    const sent: { contents: unknown; config: Record<string, unknown> }[] = [];
    const client = gemini([[call("find_cars", { query: "creta", status: "on_sale" })], done("We have one Creta: S-1 at ₹14.5 lakh.")], sent);
    let out = "";
    const outcome = await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" }, () =>
      runAssistant({ principal: owner, dealership: "Synthetic Motors", messages: [{ role: "user", content: "Do we have a Creta?" }], emit: (t) => { out += t; }, provider: providerWithClient.gemini(client) }));
    assert.deepEqual(outcome, { status: "done", turns: 2 });
    assert.equal(out, "\n\nWe have one Creta: S-1 at ₹14.5 lakh.", "streamed in chunks, with a break after the lookup round");
    const first = sent[0].config as { systemInstruction: string; tools: { functionDeclarations: { name: string; parametersJsonSchema: unknown }[] }[]; automaticFunctionCalling: unknown; maxOutputTokens: number };
    assert.match(first.systemInstruction, /Use the tools to look things up/);
    assert.match(first.systemInstruction, /Dealership: Synthetic Motors/);
    assert.deepEqual(first.automaticFunctionCalling, { disable: true }, "the engine runs tools itself, with the member's permissions");
    assert.ok(first.tools[0].functionDeclarations.some((d) => d.name === "sales_summary"), "an owner gets the finance tools");
    const second = sent[1].contents as { role: string; parts: { thoughtSignature?: string; functionCall?: unknown; functionResponse?: { id: string; name: string; response: { result: { cars: { stock: string }[] } } } }[] }[];
    assert.equal(second[1].role, "model");
    assert.equal(second[1].parts[0].thoughtSignature, "sig-abc", "Gemini 3 thought signatures go back unchanged");
    const response = second[2].parts[0].functionResponse!;
    assert.equal(response.name, "find_cars");
    assert.equal(response.id, "fc-1");
    assert.equal(response.response.result.cars[0].stock, "S-1", "the tool read this dealership's own car");
    const usage = await usageToday(p.tenantId);
    assert.equal(usage.tenantCalls, 2, "each model call is in the ledger");
    assert.equal(usage.tenantTokens, 100 + 15 + 150 + 20);
  } finally { await h.close(); }
});

test("Gemini: a role cannot reach tools it lacks, even if the model asks for one", async () => {
  const { h, sales } = await setup();
  try {
    const sent: { contents: unknown; config: Record<string, unknown> }[] = [];
    const client = gemini([[call("sales_summary", {})], done("I can't see sales figures for your role.")], sent);
    const outcome = await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" }, () =>
      runAssistant({ principal: sales, dealership: "", messages: [{ role: "user", content: "What was profit last month?" }], emit: () => undefined, provider: providerWithClient.gemini(client) }));
    assert.equal(outcome.status, "done");
    const declared = (sent[0].config as { tools: { functionDeclarations: { name: string }[] }[] }).tools[0].functionDeclarations.map((d) => d.name);
    assert.ok(!declared.includes("sales_summary"), "the tool is not offered to a sales role");
    const response = (sent[1].contents as { parts: { functionResponse?: { response: { error?: string } } }[] }[]).at(-1)!.parts[0].functionResponse!;
    assert.equal(response.response.error, "That information is not available to this person's role.");
  } finally { await h.close(); }
});

test("Gemini errors map to clear kinds; temporary ones are retried before any text is shown, others are not", async () => {
  assert.equal(geminiError(new ApiError({ status: 400, message: '{"error":{"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}' })).kind, "invalid_key");
  assert.equal(geminiError(new ApiError({ status: 403, message: "PERMISSION_DENIED" })).kind, "invalid_key");
  assert.equal(geminiError(new ApiError({ status: 404, message: "Model is not found" })).kind, "model_unavailable");
  const daily = geminiError(new ApiError({ status: 429, message: '{"error":{"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 250, model: gemini-flash. Quota id: GenerateRequestsPerDayPerProjectPerModel-FreeTier","details":[{"retryDelay":"43s"}]}}' }));
  assert.equal(daily.kind, "quota_exhausted");
  // The shape Gemini actually returned for this key: same metric name as the daily limit, but a per-minute violation.
  const perMinute = geminiError(new ApiError({ status: 429, message: '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"3s"}]}}' }));
  assert.equal(perMinute.kind, "rate_limited");
  assert.equal(perMinute.retryAfter, 3);
  // As the SDK actually raises it: the provider's JSON nested as an escaped string inside the SDK's own.
  const nested = geminiError(new ApiError({ status: 429, message: JSON.stringify({ error: { message: JSON.stringify({ error: { code: 429, message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 5, description: Generate content requests per minute limit exceeded on Free Tier.\nPlease retry in 43.4s.", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "43s" }] } }, null, 2), code: 429 } }) }));
  assert.equal(nested.kind, "rate_limited", "a per-minute limit is temporary, even though the metric name matches the daily one");
  assert.equal(nested.retryAfter, 43, "the wait is read through the escaping, so no quota is wasted on early retries");
  assert.equal(geminiError(new ApiError({ status: 503, message: "The model is overloaded" })).kind, "busy");
  assert.equal(geminiError(new TypeError("fetch failed")).kind, "network");
  assert.match(userMessage(daily), /today's usage limit/);
  assert.ok(!userMessage(new AiError("invalid_key", "x")).includes("key"), "people are not told about keys");

  const { h, p, owner } = await setup();
  try {
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test", AI_MAX_RETRY_DELAY_MS: "2000" }, async () => {
      // Overloaded once, then fine: answered, and the failed attempt is in the ledger.
      const busyOnce = gemini([new ApiError({ status: 503, message: "overloaded" }), done("All good now.")]);
      let out = "";
      const ok = await runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "hi" }], emit: (t) => { out += t; }, provider: providerWithClient.gemini(busyOnce) });
      assert.equal(ok.status, "done");
      assert.equal(out, "All good now.");
      const ledger = (await tenantTx(p.tenantId, (c) => c.query("SELECT status, error_kind FROM intelligence_ai_usage WHERE tenant_id = $1 ORDER BY created_at", [p.tenantId]))).rows;
      assert.deepEqual(ledger, [{ status: "error", error_kind: "busy" }, { status: "ok", error_kind: null }]);
      // A bad key is not retried.
      const badKey = gemini([new ApiError({ status: 400, message: "API_KEY_INVALID" }), done("never")]);
      await assert.rejects(runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "hi" }], emit: () => undefined, provider: providerWithClient.gemini(badKey) }), (e: unknown) => e instanceof AiError && e.kind === "invalid_key");
      // A daily quota that asks to wait 43 s is not retried either.
      const exhausted = gemini([new ApiError({ status: 429, message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier retryDelay\":\"43s\"" })]);
      await assert.rejects(runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "hi" }], emit: () => undefined, provider: providerWithClient.gemini(exhausted) }), (e: unknown) => e instanceof AiError && e.kind === "quota_exhausted");
      // Once text has been shown, a failure is reported instead of starting the answer again.
      const midway: GeminiClient = { models: { async get() { return {}; }, async generateContentStream() {
        return (async function* () { yield text("Partial ") as GenerateContentResponse; throw new ApiError({ status: 503, message: "overloaded" }); })();
      } } };
      let partial = "";
      await assert.rejects(runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "hi" }], emit: (t) => { partial += t; }, provider: providerWithClient.gemini(midway) }), (e: unknown) => e instanceof AiError && e.kind === "busy");
      assert.equal(partial, "Partial ", "no duplicated text from a retry");
    });
  } finally { await h.close(); }
});

test("safety stops, truncation and timeouts are reported, not shown as answers", async () => {
  const { h, owner } = await setup();
  try {
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test", AI_TIMEOUT_MS: "5000", AI_MAX_RETRIES: "0" }, async () => {
      const blocked = gemini([[{ candidates: [{ content: { role: "model", parts: [] }, finishReason: "SAFETY" as never }] } as Chunk]]);
      assert.equal((await runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "x" }], emit: () => undefined, provider: providerWithClient.gemini(blocked) })).status, "refused");
      const long = gemini([[text("A very long answ", "MAX_TOKENS")]]);
      assert.equal((await runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "x" }], emit: () => undefined, provider: providerWithClient.gemini(long) })).status, "truncated");
      const started = Date.now();
      await assert.rejects(runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "x" }], emit: () => undefined, provider: providerWithClient.gemini(gemini(["hang"])) }), (e: unknown) => e instanceof AiError && e.kind === "timeout");
      assert.ok(Date.now() - started < 9000, "the call is stopped at the timeout");
    });
  } finally { await h.close(); }
});

test("daily budgets per dealership are enforced across calls, and one dealership's use never counts against another", async () => {
  const { h, p, owner, otherOwner } = await setup();
  try {
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test", AI_TENANT_DAILY_CALLS: "2", AI_GLOBAL_DAILY_CALLS: "0" }, async () => {
      const ask = (who: Principal, client: GeminiClient) => runAssistant({ principal: who, dealership: "", messages: [{ role: "user", content: "hi" }], emit: () => undefined, provider: providerWithClient.gemini(client) });
      assert.equal((await ask(owner, gemini([done("one")]))).status, "done");
      assert.equal((await ask(owner, gemini([done("two")]))).status, "done");
      await assert.rejects(ask(owner, gemini([done("three")])), (e: unknown) => e instanceof AiError && e.kind === "quota_exhausted");
      assert.equal((await ask(otherOwner, gemini([done("other dealer")]))).status, "done", "budgets are per dealership");
      assert.equal((await usageToday(p.tenantId)).tenantCalls, 2, "the refused call never reached the provider");
    });
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test", AI_TENANT_DAILY_CALLS: "0", AI_GLOBAL_DAILY_CALLS: "3" }, async () => {
      await assert.rejects(runAssistant({ principal: otherOwner, dealership: "", messages: [{ role: "user", content: "hi" }], emit: () => undefined, provider: providerWithClient.gemini(gemini([done("x")])) }), (e: unknown) => e instanceof AiError && e.kind === "quota_exhausted", "the project-wide cap protects the free-tier quota");
    });
  } finally { await h.close(); }
});

test("concurrency: extra calls wait, then are told the AI is busy", async () => {
  const { h, owner } = await setup();
  try {
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test", AI_MAX_CONCURRENCY: "1", AI_QUEUE_WAIT_MS: "0", AI_TIMEOUT_MS: "5000", AI_MAX_RETRIES: "0" }, async () => {
      let release: () => void = () => undefined;
      const slow: GeminiClient = { models: { async get() { return {}; }, async generateContentStream() {
        await new Promise<void>((r) => { release = r; });
        return (async function* () { yield done("slow")[1] as GenerateContentResponse; })();
      } } };
      const first = runConversation({ feature: "assistant", tenantId: owner.tenantId, userId: owner.userId, maxTurns: 1, system: { stable: "s", context: [] }, tools: [], history: [{ role: "user", content: "a" }], runTool: async () => ({ ok: true, result: null }), provider: providerWithClient.gemini(slow) });
      await new Promise((r) => setTimeout(r, 300));
      await assert.rejects(runConversation({ feature: "assistant", tenantId: owner.tenantId, userId: owner.userId, maxTurns: 1, system: { stable: "s", context: [] }, tools: [], history: [{ role: "user", content: "b" }], runTool: async () => ({ ok: true, result: null }), provider: providerWithClient.gemini(gemini([done("b")])) }), (e: unknown) => e instanceof AiError && e.kind === "busy");
      release();
      assert.equal((await first).status, "done");
    });
  } finally { await h.close(); }
});

test("the shared per-minute limit stops calls before they reach the provider", async () => {
  const { h, owner } = await setup();
  try {
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test", AI_CALLS_PER_MINUTE: "2", AI_QUEUE_WAIT_MS: "0", AI_MAX_RETRIES: "0" }, async () => {
      let reached = 0;
      const counting = (): GeminiClient => ({ models: { async get() { return {}; }, async generateContentStream() { reached += 1; return (async function* () { yield done("ok")[1] as GenerateContentResponse; })(); } } });
      const ask = () => runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "hi" }], emit: () => undefined, provider: providerWithClient.gemini(counting()) });
      await ask();
      await ask();
      await assert.rejects(ask(), (e: unknown) => e instanceof AiError && e.kind === "rate_limited" && (e.retryAfter ?? 0) > 0);
      assert.equal(reached, 2, "the third call never reached the provider");
    });
  } finally { await h.close(); }
});

test("customer agent on Gemini: answers from published cars, hands over to the team, and stays quiet afterwards", async () => {
  const { h, p, owner } = await setup();
  try {
    await saveChannel(owner, { channel: "website", enabled: true });
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" }, async () => {
      const key = contactKey("website", "visitor-token-gggggggggggggggg");
      const sent: { contents: unknown; config: Record<string, unknown> }[] = [];
      const first = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Is the Creta diesel?", stock: "S-1", origin: "https://app.example" },
        providerWithClient.gemini(gemini([[call("car_details", { reference: "S-1" })], done("Yes, the 2021 Hyundai Creta SX is diesel.")], sent)));
      assert.equal(first.reply?.text, "Yes, the 2021 Hyundai Creta SX is diesel.");
      assert.match(JSON.stringify(sent[1].contents), /"fuel":"Diesel"/, "the answer is built from the vehicle record");
      assert.match(String(sent[0].config.systemInstruction), /Negotiate/, "the customer rules go in as the system instruction");
      const handover = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Call me please, Ravi 9847012345", origin: "https://app.example" },
        providerWithClient.gemini(gemini([[call("hand_to_team", { name: "Ravi", mobile: "9847012345", reason: "Wants a call" })], done("Thanks Ravi, the team will call you.")])));
      assert.ok(handover.conversation.leadId, "the customer became a lead");
      assert.equal(handover.conversation.status, "team");
      const after = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Thanks", origin: "https://app.example" }, providerWithClient.gemini(gemini([done("should not be sent")])));
      assert.equal(after.reply, null);
      // A provider failure never leaves the customer without a reply; the team gets the conversation.
      const key2 = contactKey("website", "visitor-token-hhhhhhhhhhhhhhhh");
      const failed = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key: key2, text: "Hello", origin: "https://app.example" }, providerWithClient.gemini(gemini([new ApiError({ status: 400, message: "API_KEY_INVALID" })])));
      assert.ok(failed.reply?.text);
      assert.equal(failed.conversation.status, "team");
    });
  } finally { await h.close(); }
});

test("saved assistant conversations belong to one member of one dealership", async () => {
  const { h, p, other, owner, sales, otherOwner } = await setup();
  try {
    const id = await tenantTx(p.tenantId, async (c) => {
      const t = await createThread(c, p.tenantId, owner.userId, "Which cars are ageing?");
      await appendToThread(c, p.tenantId, owner.userId, t, [{ role: "user", content: "Which cars are ageing?" }, { role: "assistant", content: "S-1 has been in stock 40 days." }]);
      return t;
    });
    assert.deepEqual(await tenantTx(p.tenantId, (c) => readThread(c, p.tenantId, owner.userId, id)), [{ role: "user", content: "Which cars are ageing?" }, { role: "assistant", content: "S-1 has been in stock 40 days." }]);
    assert.equal((await tenantTx(p.tenantId, (c) => listThreads(c, p.tenantId, owner.userId)))[0].title, "Which cars are ageing?");
    assert.equal(await tenantTx(p.tenantId, (c) => readThread(c, p.tenantId, sales.userId, id)), null, "a colleague cannot read it");
    assert.equal(await tenantTx(p.tenantId, (c) => appendToThread(c, p.tenantId, sales.userId, id, [{ role: "user", content: "x" }])), false, "or add to it");
    assert.equal(await tenantTx(p.tenantId, (c) => deleteThread(c, p.tenantId, sales.userId, id)), false, "or delete it");
    assert.equal(await tenantTx(other.tenantId, (c) => readThread(c, other.tenantId, otherOwner.userId, id)), null, "another dealership cannot see it");
    const leaked = await tenantTx(other.tenantId, (c) => c.query("SELECT count(*)::int AS n FROM intelligence_assistant_messages"));
    assert.equal(leaked.rows[0].n, 0, "row-level security hides other dealerships' messages entirely");
    assert.ok(await tenantTx(p.tenantId, (c) => deleteThread(c, p.tenantId, owner.userId, id)));
  } finally { await h.close(); }
});

test("Claude still works through the same engine (scripted client), with caching and server-side fallback kept", async () => {
  const { h, owner } = await setup();
  try {
    const sent: Record<string, unknown>[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "find_cars", input: { query: "creta", status: "on_sale" } }], usage: { input_tokens: 50, output_tokens: 5 } },
      { stop_reason: "end_turn", content: [{ type: "text", text: "One Creta." }], usage: { input_tokens: 60, output_tokens: 3 } },
    ];
    const client = { beta: { messages: { stream(params: Record<string, unknown>) {
      sent.push(structuredClone(params));
      const reply = replies.shift()!;
      let listener: (t: string) => void = () => undefined;
      return { on(_e: "text", l: (t: string) => void) { listener = l; return this; }, async finalMessage() { for (const b of reply.content) if (b.type === "text") listener((b as { text: string }).text); return reply as never; } };
    } } } };
    let out = "";
    const outcome = await withEnv({ ANTHROPIC_API_KEY: "sk-ant-test" }, () => runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "Creta?" }], emit: (t) => { out += t; }, client: client as never }));
    assert.equal(outcome.status, "done");
    assert.equal(out, "\n\nOne Creta.");
    assert.deepEqual((sent[0].system as { cache_control?: unknown }[])[0].cache_control, { type: "ephemeral" });
    assert.equal(sent[0].fallbacks, "default");
    assert.ok((sent[0].tools as { strict: boolean }[]).every((t) => t.strict));
  } finally { await h.close(); }
});

test("progress lines: shown while lookups run, never part of the answer", async () => {
  const { splitStatus, statusLine } = await import("../../apps/intelligence/lib/assistant-stream");
  assert.deepEqual(splitStatus(statusLine("Looking up your cars…")), { text: "", status: "Looking up your cars…" });
  assert.deepEqual(splitStatus(`${statusLine("A")}${statusLine("B")}Answer`), { text: "Answer", status: "B" });
  assert.deepEqual(splitStatus(`${statusLine("A")}\u001eHalf`), { text: "", status: "A" }, "a status line still arriving is not shown");
  assert.deepEqual(splitStatus("plain answer"), { text: "plain answer", status: "" }, "older servers without progress lines still work");
  assert.equal(statusLine("x\u001ey"), "\u001exy\u001e", "a separator inside a label cannot break the stream");

  const { h, owner } = await setup();
  try {
    const statuses: string[] = [];
    let out = "";
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" }, () => runAssistant({
      principal: owner, dealership: "", messages: [{ role: "user", content: "Creta price and leads?" }], emit: (t) => { out += t; }, onStatus: (s) => statuses.push(s),
      provider: providerWithClient.gemini(gemini([[{ candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "a", name: "find_cars", args: { query: "creta", status: "on_sale" } } }, { functionCall: { id: "b", name: "lead_overview", args: {} } }] }, finishReason: "STOP" as never }] } as Chunk], done("Done.")])),
    }));
    assert.deepEqual(statuses, ["Looking up your cars, Checking your leads…"], "both lookups run in one round, with one progress line");
    assert.equal(out, "\n\nDone.");
  } finally { await h.close(); }
});

test("the assistant is told to answer how-to questions from the included guide excerpts without an extra lookup", async () => {
  const { h, owner } = await setup();
  try {
    const sent: { contents: unknown; config: Record<string, unknown> }[] = [];
    await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" }, () => runAssistant({ principal: owner, dealership: "", messages: [{ role: "user", content: "How do I connect WhatsApp?" }], emit: () => undefined, provider: providerWithClient.gemini(gemini([done("Settings → Customer messaging.")], sent)) }));
    const system = String(sent[0].config.systemInstruction);
    assert.match(system, /answer directly from the product guide excerpts below when they cover the question/);
    assert.match(system, /Product guide excerpts for this question[\s\S]*WhatsApp/, "the relevant guide entry is already in the request");
  } finally { await h.close(); }
});

test("car search: fuel and gearbox words filter instead of matching nothing", async () => {
  const { carFilters, runTool } = await import("../../apps/intelligence/lib/server/assistant");
  assert.deepEqual(carFilters("diesel"), { words: "", fuel: "diesel", gearbox: "" });
  assert.deepEqual(carFilters("automatic Creta diesel cars"), { words: "Creta", fuel: "diesel", gearbox: "automatic" });
  assert.deepEqual(carFilters("V-104"), { words: "V-104", fuel: "", gearbox: "" });
  const { h, owner } = await setup();
  try {
    const diesel = await runTool(owner, "find_cars", { query: "diesel", status: "on_sale" });
    assert.ok(diesel.ok);
    const result = diesel.result as { matches: number; cars: { stock: string }[]; filteredBy: string };
    assert.equal(result.matches, 1);
    assert.equal(result.cars[0].stock, "S-1");
    assert.equal(result.filteredBy, "diesel");
    const petrol = await runTool(owner, "find_cars", { query: "petrol", status: "on_sale" });
    assert.equal((petrol as { result: { matches: number } }).result.matches, 0);
    const automaticCreta = await runTool(owner, "find_cars", { query: "automatic creta", status: "any_unsold" });
    assert.equal((automaticCreta as { result: { matches: number } }).result.matches, 0, "the synthetic Creta is manual");
  } finally { await h.close(); }
});
