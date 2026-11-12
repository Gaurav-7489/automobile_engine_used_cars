import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, signInVerifiedEmail, type Principal } from "../../apps/intelligence/lib/server/identity";
import { readStatePrices } from "../../apps/intelligence/lib/server/state-prices";
import { runAssistant, runTool, toolsFor, validMessages, type AssistantClient } from "../../apps/intelligence/lib/server/assistant";
import { readGoogleIdToken } from "../../apps/intelligence/lib/server/google-oauth";
import { open, seal } from "../../apps/intelligence/lib/server/secret-box";
import { adAccess, adAccountStatus, disconnect } from "../../apps/intelligence/lib/server/ad-accounts";
import { dailyPaise, googleSearchAd, launchGoogle, launchMeta } from "../../apps/intelligence/lib/server/ad-launch";
import { channelStatus } from "../../apps/intelligence/lib/actions/campaigns";
import { buildProductionState } from "../../apps/intelligence/lib/state";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import type { Campaign, Vehicle } from "../../apps/intelligence/lib/domain";

const secs = () => Math.floor(Date.now() / 1000);

async function setup() {
  const h = await harness();
  const admin = await h.admin.connect();
  const kerala = await provisionWorkspace(admin, { organization: "Kerala Cars", dealership: "Kerala Cars", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }], owner: { email: "owner@kerala.example", name: "Owner K" } });
  const tn = await provisionWorkspace(admin, { organization: "Chennai Autos", dealership: "Chennai Autos", locations: [{ name: "Main", city: "Chennai", state: "Tamil Nadu", phone: "2" }], owner: { email: "owner@tn.example", name: "Owner T" } });
  const insert = (p: typeof kerala, stock: string, make: string, model: string, price: number, publish = "published", availability = "available") =>
    admin.query("INSERT INTO vehicles(tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [p.tenantId, p.dealershipId, p.locationIds[0], stock.toLowerCase(), stock, JSON.stringify({ make, model, variant: "SX", year: 2021, price, mileage: 30000, fuelType: "petrol", transmission: "manual", registration: "KL 07 PRIVATE" }), publish, availability]);
  await insert(kerala, "K-1", "Hyundai", "Creta", 1400000);
  await insert(kerala, "K-2", "Hyundai", "Creta", 1500000);
  await insert(kerala, "K-3", "Hyundai", "Creta", 9900000, "draft");
  await insert(tn, "T-1", "Hyundai", "Creta", 1300000);
  await insert(tn, "T-2", "Maruti", "Swift", 600000);
  const owner = async (p: typeof kerala): Promise<Principal> => {
    const r = await redeemToken(p.ownerToken, "correct horse battery 7");
    assert.ok(r.ok);
    return (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, secs()))!;
  };
  return { h, admin, kerala, tn, owner };
}

test("prices by state: published cars only, typical price per state, compared with the dealer's own state", async () => {
  const { h } = await setup();
  try {
    const creta = await readStatePrices({ make: "hyundai", model: "creta", home: "Kerala" });
    assert.deepEqual(creta.states.map((s) => [s.state, s.cars, s.median]), [["Tamil Nadu", 1, 1300000], ["Kerala", 2, 1450000]], "the draft at 99 lakh is never counted");
    assert.equal(creta.home, "Kerala");
    assert.equal(creta.states.find((s) => s.state === "Tamil Nadu")!.vsHome, -10.3);
    assert.ok(creta.states.every((s) => s.thin), "fewer than five cars is marked as a rough guide");
    assert.deepEqual(creta.models.map((m) => `${m.make} ${m.model}:${m.cars}`), ["Hyundai Creta:3", "Maruti Swift:1"]);
    assert.ok(!JSON.stringify(creta).includes("PRIVATE"), "no registration or stock detail leaves the aggregate");
    assert.equal((await readStatePrices({ make: "' OR 1=1 --", model: "" })).states.length, 0, "input is data, never SQL");
  } finally { await h.close(); }
});

test("the assistant only offers and runs the lookups the member's role allows, and never sees customer contacts", async () => {
  const { h, kerala, owner } = await setup();
  try {
    const boss = await owner(kerala);
    assert.deepEqual(toolsFor("owner").sort(), ["campaigns", "find_cars", "lead_overview", "sales_summary", "state_prices", "stock_overview"]);
    assert.ok(!toolsFor("sales").includes("sales_summary"), "sales staff do not get the finance summary");
    const inv = await issueInvite(boss, { email: "sales@kerala.example", name: "Sales", role: "sales", locationIds: kerala.locationIds, dealershipIds: boss.dealershipIds });
    const s = await redeemToken((inv as { token: string }).token, "another horse battery 8");
    const sales = (await resolvePrincipal((s as { userId: string }).userId, kerala.tenantId, secs()))!;
    assert.deepEqual(await runTool(sales, "sales_summary", {}), { ok: false, message: "That information is not available to this person's role." }, "a tool the role lacks cannot be called, whatever the model asks");
    assert.equal((await runTool(boss, "drop_tables", {})).ok, false);
    const prices = await runTool(boss, "state_prices", { make: "Hyundai", model: "Creta" });
    assert.ok(prices.ok);
    assert.equal((prices.result as { homeState: string }).homeState, "Kerala", "the dealer's own state is the comparison base");
    const stock = await runTool(boss, "stock_overview", {});
    assert.ok(stock.ok, JSON.stringify(stock));
    const salesStock = await runTool(sales, "stock_overview", {});
    assert.ok(salesStock.ok && !("moneyTiedUpInStock" in (salesStock.result as object)), "costs are only shown to roles that may see capital");
    assert.ok(validMessages([{ role: "user", content: "hi" }]));
    assert.ok(!validMessages([{ role: "assistant", content: "hi" }]) && !validMessages([{ role: "user", content: "x".repeat(5000) }]) && !validMessages([]));
  } finally { await h.close(); }
});

test("the assistant looks things up, then answers; a refusal is reported, not shown as an answer", async () => {
  const { h, kerala, owner } = await setup();
  try {
    const boss = await owner(kerala);
    const sent: unknown[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "state_prices", input: { make: "Hyundai", model: "Creta" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Tamil Nadu is cheapest." }] },
    ];
    const fake = (queue: typeof replies): AssistantClient => ({ beta: { messages: { stream(params) {
      sent.push(structuredClone(params));
      const reply = queue.shift()!;
      let listener: (t: string) => void = () => undefined;
      return { on(_e, l) { listener = l; return this; }, async finalMessage() { for (const b of reply.content) if (b.type === "text") listener((b as { text: string }).text); return reply as never; } };
    } } } });
    let out = "";
    const outcome = await runAssistant({ principal: boss, dealership: "Kerala Cars", messages: [{ role: "user", content: "Where is the Creta cheapest?" }], emit: (t) => { out += t; }, client: fake(replies) });
    assert.equal(outcome.status, "done");
    assert.equal(outcome.turns, 2);
    assert.match(out, /Tamil Nadu is cheapest\./);
    const second = sent[1] as { messages: { role: string; content: { type: string; content?: string }[] }[]; model: string; fallbacks: unknown };
    const result = second.messages.at(-1)!.content[0];
    assert.equal(result.type, "tool_result");
    assert.match(result.content!, /"homeState":"Kerala"/);
    assert.equal(second.model, "claude-opus-5-5");
    assert.equal(second.fallbacks, "default");
    const refused = await runAssistant({ principal: boss, dealership: "", messages: [{ role: "user", content: "x" }], emit: () => undefined, client: fake([{ stop_reason: "refusal", content: [] }] as never) });
    assert.equal(refused.status, "refused");
  } finally { await h.close(); }
});

test("Google sign-in admits only existing members with a verified email, and never bypasses two-factor", async () => {
  const { h, kerala, owner } = await setup();
  try {
    process.env.GOOGLE_CLIENT_ID = "client-123";
    const token = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
    const good = { iss: "https://accounts.google.com", aud: "client-123", exp: secs() + 300, nonce: "n1", email: "Owner@Kerala.example", email_verified: true, sub: "g-1", name: "Owner" };
    assert.deepEqual(readGoogleIdToken(token(good), "n1"), { sub: "g-1", email: "owner@kerala.example", name: "Owner" });
    assert.equal(readGoogleIdToken(token(good), "other"), null, "a replayed token with another nonce is refused");
    assert.equal(readGoogleIdToken(token({ ...good, aud: "someone-else" }), "n1"), null);
    assert.equal(readGoogleIdToken(token({ ...good, email_verified: false }), "n1"), null);
    assert.equal(readGoogleIdToken(token({ ...good, exp: secs() - 10 }), "n1"), null);
    assert.equal(readGoogleIdToken(token({ ...good, iss: "https://evil.example" }), "n1"), null);
    assert.equal(readGoogleIdToken("garbage", "n1"), null);

    assert.deepEqual(await signInVerifiedEmail("stranger@gmail.com"), { ok: false, code: "no_account" }, "Google never creates accounts");
    const boss = await owner(kerala);
    const ok = await signInVerifiedEmail("OWNER@kerala.example");
    assert.ok(ok.ok && ok.userId === boss.userId && ok.tenantId === kerala.tenantId);
    await h.admin.connect().then((c) => c.query("UPDATE intelligence_users SET totp_enabled = true, totp_secret = 'JBSWY3DPEHPK3PXP' WHERE id = $1", [boss.userId]));
    assert.deepEqual(await signInVerifiedEmail("owner@kerala.example"), { ok: false, code: "mfa" });
  } finally { delete process.env.GOOGLE_CLIENT_ID; await h.close(); }
});

test("provider tokens are encrypted at rest, stay inside the dealership, and are deleted on disconnect", async () => {
  const { h, kerala, tn, owner } = await setup();
  try {
    const sealed = await seal("ya29.secret-token");
    assert.ok(sealed && !sealed.includes("secret"));
    assert.equal(await open(sealed), "ya29.secret-token");
    assert.equal(await open(`${sealed!.slice(0, -2)}xx`), null, "tampering is detected");

    const boss = await owner(kerala);
    await tenantTx(kerala.tenantId, (c) => c.query(
      "INSERT INTO intelligence_ad_connections(tenant_id, provider, account_id, account_name, details, access_cipher, expires_at, connected_by) VALUES($1,'meta','act_1','Kerala ads',$2,$3,$4,$5)",
      [kerala.tenantId, { accounts: [{ id: "act_1", name: "Kerala ads" }], pageId: "p1", instagramId: "ig1" }, sealed, new Date(Date.now() + 86_400_000).toISOString(), boss.userId]));
    assert.equal((await adAccess(kerala.tenantId, "meta"))?.token, "ya29.secret-token");
    assert.equal(await adAccess(tn.tenantId, "meta"), null, "another dealership cannot read it");
    const status = await adAccountStatus(boss);
    assert.deepEqual(status.map((s) => [s.provider, s.connected]), [["google", false], ["meta", true]]);
    assert.ok(!JSON.stringify(status).includes("secret"), "status never carries tokens");
    assert.ok(await disconnect(boss, "meta"));
    assert.equal(await adAccess(kerala.tenantId, "meta"), null);
  } finally { await h.close(); }
});

test("each ad channel needs its own provider connected", () => {
  const state = buildProductionState();
  state.integrations = state.integrations.map((i) => (i.id === "ads" ? { ...i, state: "Connected", providers: ["meta"] } : i));
  assert.equal(channelStatus(state, "meta").connected, true);
  assert.equal(channelStatus(state, "search").connected, false);
});

const vehicle = { id: "V-9", make: "Hyundai", model: "Creta", variant: "SX", year: 2021, fuel: "Petrol", transmission: "Manual", km: 30000, photos: ["https://cdn.example/creta.jpg"] } as Vehicle;
const campaign = { id: "CMP-3005", name: "Hyundai Creta / Kochi", headline: "Creta SX in Kochi", body: "2021 petrol manual. 30,000 km. Request vehicle details.", startDate: "2026-11-12", endDate: "2026-12-11", radiusKm: 40, dailyCap: 50000, totalCap30d: 1500000,
  channels: [{ id: "search", enabled: true, budget: 900000 }, { id: "meta", enabled: true, budget: 600000 }], utm: "vl_cmp-3005_v-9" } as unknown as Campaign;

test("Google Ads launch: one atomic request, daily budget within the approved limit, ends on the approved date", async () => {
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev";
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
    if (url.includes("geoTargetConstants:suggest")) return new Response(JSON.stringify({ geoTargetConstantSuggestions: [{ geoTargetConstant: { resourceName: "geoTargetConstants/1007768" } }] }));
    return new Response(JSON.stringify({ mutateOperationResponses: [{ campaignBudgetResult: { resourceName: "customers/1/campaignBudgets/9" } }, { campaignResult: { resourceName: "customers/1/campaigns/8" } }] }));
  }) as typeof fetch;
  try {
    assert.equal(dailyPaise(campaign, "search"), 30000, "₹9,000 over 30 days is ₹300 a day");
    assert.equal(dailyPaise({ ...campaign, dailyCap: 10000 }, "search"), 10000, "never above the daily limit");
    const r = await launchGoogle({ provider: "google", token: "t", accountId: "1234567890", details: { accounts: [] } }, { campaign, vehicle, landingUrl: "https://app.example/l/x/v-9", city: "Kochi", dealer: "Kerala Cars" });
    assert.deepEqual(r, { ok: true, ids: { campaign: "customers/1/campaigns/8", budget: "customers/1/campaignBudgets/9" } });
    const mutate = calls.find((c) => c.url.endsWith("googleAds:mutate"))!;
    const ops = mutate.body.mutateOperations as Record<string, { create: Record<string, unknown> }>[];
    assert.equal(ops[0].campaignBudgetOperation.create.amountMicros, "300000000", "₹300 a day in micros");
    assert.equal(ops[1].campaignOperation.create.endDate, "2026-12-11");
    assert.deepEqual(ops[2].campaignCriterionOperation.create.location, { geoTargetConstant: "geoTargetConstants/1007768" });
    const ad = googleSearchAd({ campaign, vehicle, landingUrl: "", city: "Kochi", dealer: "Kerala Cars" });
    assert.ok(ad.headlines.length >= 3 && ad.headlines.every((h) => h.length <= 30) && ad.descriptions.every((d) => d.length <= 90));
  } finally { globalThis.fetch = real; delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN; }
});

test("Meta launch builds everything paused and removes it again if any step is refused", async () => {
  const calls: { url: string; method: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (url.includes("/campaigns")) return new Response(JSON.stringify({ id: "c1" }));
    if (url.includes("/search")) return new Response(JSON.stringify({ data: [{ key: "1035921" }] }));
    if (url.includes("/adsets")) return new Response(JSON.stringify({ id: "s1" }));
    if (url.includes("/adcreatives")) return new Response(JSON.stringify({ error: { message: "Invalid image" } }), { status: 400 });
    return new Response("{}");
  }) as typeof fetch;
  try {
    const r = await launchMeta({ provider: "meta", token: "t", accountId: "act_1", details: { accounts: [], pageId: "p1", instagramId: "ig1" } }, { campaign, vehicle, landingUrl: "https://app.example/l", city: "Kochi", dealer: "Kerala Cars" });
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /Invalid image/);
    assert.deepEqual(calls.filter((c) => c.method === "DELETE").map((c) => c.url.split("/").pop()), ["s1", "c1"], "the half-built ad set and campaign are deleted");
    const noPhoto = await launchMeta({ provider: "meta", token: "t", accountId: "act_1", details: { accounts: [], pageId: "p1" } }, { campaign, vehicle: { ...vehicle, photos: [] }, landingUrl: "", city: "Kochi", dealer: "" });
    assert.match((noPhoto as { message: string }).message, /photo/);
  } finally { globalThis.fetch = real; }
});
