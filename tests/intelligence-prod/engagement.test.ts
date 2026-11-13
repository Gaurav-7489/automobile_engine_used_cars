import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, signIn, type Principal } from "../../apps/intelligence/lib/server/identity";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { saveChannel, tenantForChannel, websiteChatEnabled } from "../../apps/intelligence/lib/server/channels";
import { contactKey, listConversations } from "../../apps/intelligence/lib/server/conversations";
import { CUSTOMER_RULES, FALLBACK_REPLY, handleCustomerMessage } from "../../apps/intelligence/lib/server/customer-ai";
import { parseDelivery, validSignature } from "../../apps/intelligence/lib/server/meta-webhook";
import { seal } from "../../apps/intelligence/lib/server/secret-box";
import type { AssistantClient } from "../../apps/intelligence/lib/server/assistant";
import { recommendPlan, segmentOf } from "../../apps/intelligence/lib/marketing-plan";
import { checkCopy } from "../../apps/intelligence/lib/actions/campaigns";
import { addExpense, addInvestorEntry, deleteExpense, listInvestors, readFinance, recordedTotals, saveInvestor } from "../../apps/intelligence/lib/server/finance-records";
import { healthReview, rate } from "../../apps/intelligence/lib/server/health-review";
import type { Vehicle } from "../../apps/intelligence/lib/domain";

const secs = () => Math.floor(Date.now() / 1000);
const ORIGIN = "https://app.example";

async function setup() {
  const h = await harness();
  const admin = await h.admin.connect();
  const p = await provisionWorkspace(admin, { organization: "Kerala Cars", dealership: "Kerala Cars", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 90000 00000" }], owner: { email: "owner@kerala.example", name: "Owner K" } });
  const other = await provisionWorkspace(admin, { organization: "Other Motors", dealership: "Other", locations: [{ name: "Main", city: "Pune", state: "Maharashtra", phone: "1" }], owner: { email: "o@other.example", name: "O" } });
  const car = (stock: string, make: string, model: string, price: number, extra: Record<string, unknown> = {}) => admin.query(
    "INSERT INTO vehicles(tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,$4,$5,$6,'published',$7)",
    [p.tenantId, p.dealershipId, p.locationIds[0], stock.toLowerCase(), stock, JSON.stringify({ make, model, variant: "SX", year: 2021, price, mileage: 32000, fuelType: "diesel", transmission: "manual", ownership: 1, media: [{ url: `https://cdn.example/${stock}.jpg` }], ...extra }), extra.reserved ? "reserved" : "available"]);
  await car("V-1", "Hyundai", "Creta", 1450000);
  await car("V-2", "Maruti", "Swift", 550000);
  const r = await redeemToken(p.ownerToken, "correct horse battery 7");
  const owner = (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, secs()))!;
  const invite = async (email: string, role: Principal["role"]) => {
    const inv = await issueInvite(owner, { email, name: role, role, locationIds: p.locationIds, dealershipIds: owner.dealershipIds });
    const s = await redeemToken((inv as { token: string }).token, "another horse battery 8");
    return (await resolvePrincipal((s as { userId: string }).userId, p.tenantId, secs()))!;
  };
  return { h, admin, p, other, owner, invite };
}

/** A scripted model: each call returns the next reply. Records what it was sent. */
function scripted(replies: { stop_reason: string; content: unknown[] }[], sent: unknown[] = []): AssistantClient {
  return { beta: { messages: { stream(params) {
    sent.push(structuredClone(params));
    const reply = replies.shift() ?? { stop_reason: "end_turn", content: [{ type: "text", text: "OK." }] };
    return { on() { return this; }, async finalMessage() { return reply as never; } };
  } } } };
}

test("website chat is off until the owner switches it on, and answers from the dealer's own published cars", async () => {
  const { h, p, owner, invite } = await setup();
  try {
    assert.equal(await websiteChatEnabled(p.tenantId), false, "nothing is on by default");
    const sales = await invite("s@kerala.example", "sales");
    assert.equal((await saveChannel(sales, { channel: "website", enabled: true })).ok, false, "only owners and managers switch channels");
    assert.ok((await saveChannel(owner, { channel: "website", enabled: true })).ok);
    assert.equal(await websiteChatEnabled(p.tenantId), true);

    const sent: unknown[] = [];
    const ai = scripted([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "car_details", input: { reference: "V-1" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Yes, the 2021 Hyundai Creta is available and it is diesel." }] },
    ], sent);
    const key = contactKey("website", "visitor-token-aaaaaaaaaaaaaaaa");
    const out = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Is the white Creta diesel?", stock: "V-1", origin: ORIGIN }, ai);
    assert.equal(out.reply?.text, "Yes, the 2021 Hyundai Creta is available and it is diesel.");
    const toolResult = JSON.stringify((sent[1] as { messages: unknown[] }).messages.at(-1));
    assert.match(toolResult, /\\"fuel\\":\\"Diesel\\"/, "the answer is built from the synced vehicle record");
    assert.match(toolResult, /notInRecord/, "the agent is told what the record does not hold");
    const system = JSON.stringify((sent[0] as { system: unknown }).system);
    assert.match(system, /record does not include/i);
    assert.match(system, /Negotiate/);
    assert.ok(CUSTOMER_RULES.includes("Book, reserve or hold a car"));

    const [conv] = await tenantTx(p.tenantId, (c) => listConversations(c, p.tenantId));
    assert.equal(conv.messages.length, 2, "both sides are logged");
    assert.equal(conv.vehicleStockId, "V-1");
    assert.equal(conv.status, "ai");
  } finally { await h.close(); }
});

test("asking for a person needs a name and number on the website, then creates a lead with the car and hands over", async () => {
  const { h, p, owner } = await setup();
  try {
    await saveChannel(owner, { channel: "website", enabled: true });
    const key = contactKey("website", "visitor-token-bbbbbbbbbbbbbbbb");
    const first = scripted([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "hand_to_team", input: { name: "", mobile: "", reason: "Wants a call" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Sure. What is your name and mobile number?" }] },
    ]);
    await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Please ask someone to call me", stock: "V-1", origin: ORIGIN }, first);
    let [conv] = await tenantTx(p.tenantId, (c) => listConversations(c, p.tenantId));
    assert.equal(conv.leadId, null, "no lead without contact details");
    const second = scripted([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "hand_to_team", input: { name: "Anu", mobile: "98470 12345", reason: "Call tomorrow morning about the Creta" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Thanks Anu, the team will call you." }] },
    ]);
    const out = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Anu, 9847012345, tomorrow morning", origin: ORIGIN }, second);
    assert.equal(out.conversation.status, "team");
    [conv] = await tenantTx(p.tenantId, (c) => listConversations(c, p.tenantId));
    assert.ok(conv.leadId, "the conversation now points at a lead");
    const full = await (await import("../../apps/intelligence/lib/server/workspace")).loadWorkspace(owner);
    const lead = full.leads.find((l) => l.id === conv.leadId)!;
    assert.equal(lead.source, "Website chat");
    assert.equal(lead.vehicleId, "V-1", "the vehicle enquired about is attached");
    assert.equal(lead.contactFull, "+91 98470 12345");
    assert.match(lead.interactions.at(-1)!.detail, /Transcript/);

    // Once the team has it, the AI stays quiet.
    const silent = scripted([{ stop_reason: "end_turn", content: [{ type: "text", text: "should not be sent" }] }]);
    const after = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key, text: "Thanks!", origin: ORIGIN }, silent);
    assert.equal(after.reply, null);
  } finally { await h.close(); }
});

test("without an AI key the customer gets an acknowledgement and the team gets the conversation", async () => {
  const { h, p, owner } = await setup();
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await saveChannel(owner, { channel: "website", enabled: true });
    const out = await handleCustomerMessage({ tenantId: p.tenantId, channel: "website", key: contactKey("website", "v-cccccccccccccccccccccccc"), text: "Hi", origin: ORIGIN });
    assert.equal(out.reply?.text, FALLBACK_REPLY);
    assert.equal(out.conversation.status, "team");
  } finally { if (saved) process.env.ANTHROPIC_API_KEY = saved; await h.close(); }
});

test("WhatsApp: signed deliveries only, routed to the dealer that switched the number on, and the customer becomes a lead", async () => {
  const { h, p, other, owner } = await setup();
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "1234567890" }, contacts: [{ wa_id: "919847012345", profile: { name: "Ravi" } }], messages: [{ from: "919847012345", type: "text", text: { body: "Is the Swift available?" } }, { from: "919847012345", type: "image" }] } }] }] });
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    assert.ok(validSignature(body, sig, "app-secret"));
    assert.equal(validSignature(body, sig, "other-secret"), false);
    assert.equal(validSignature(body, null, "app-secret"), false);
    const parsed = parseDelivery(JSON.parse(body));
    assert.deepEqual(parsed, [{ channel: "whatsapp", account: "1234567890", from: "919847012345", name: "Ravi", text: "Is the Swift available?" }], "only text messages");
    assert.deepEqual(parseDelivery({ object: "instagram", entry: [{ id: "178", messaging: [{ sender: { id: "u1" }, message: { text: "hi" } }, { sender: { id: "me" }, message: { text: "echo", is_echo: true } }] }] }), [{ channel: "instagram", account: "178", from: "u1", name: "", text: "hi" }]);

    const token = await seal("wa-token");
    await tenantTx(p.tenantId, (c) => c.query("INSERT INTO intelligence_ai_channels(tenant_id, channel, enabled, external_id, token_cipher) VALUES($1,'whatsapp',false,'1234567890',$2)", [p.tenantId, token]));
    assert.equal(await tenantForChannel("whatsapp", "1234567890"), null, "a switched-off number receives nothing");
    await tenantTx(p.tenantId, (c) => c.query("UPDATE intelligence_ai_channels SET enabled = true WHERE tenant_id = $1", [p.tenantId]));
    assert.equal(await tenantForChannel("whatsapp", "1234567890"), p.tenantId);
    await assert.rejects(tenantTx(other.tenantId, (c) => c.query("INSERT INTO intelligence_ai_channels(tenant_id, channel, enabled, external_id) VALUES($1,'whatsapp',true,'1234567890')", [other.tenantId])), "one number belongs to one dealership");

    const out = await handleCustomerMessage({ tenantId: p.tenantId, channel: "whatsapp", key: contactKey("whatsapp", "919847012345"), ref: "919847012345", text: "Is the Swift available?", name: "Ravi", phone: "+919847012345", origin: ORIGIN });
    assert.ok(out.conversation.leadId, "a WhatsApp customer is a lead from the first message");
    const ws = await (await import("../../apps/intelligence/lib/server/workspace")).loadWorkspace(owner);
    const lead = ws.leads.find((l) => l.id === out.conversation.leadId)!;
    assert.equal(lead.source, "WhatsApp");
    assert.equal(lead.name, "Ravi");
    assert.equal((await tenantTx(other.tenantId, (c) => listConversations(c, other.tenantId))).length, 0, "conversations stay inside their dealership");
  } finally { if (saved) process.env.ANTHROPIC_API_KEY = saved; await h.close(); }
});

const vehicle = (over: Partial<Vehicle>): Vehicle => ({ id: "V-9", branchId: "b", make: "Hyundai", model: "Creta", variant: "SX", year: 2021, fuel: "Diesel", transmission: "Manual", km: 32000, owners: 1, registration: "", status: "available", acquiredAt: "2026-09-01T00:00:00Z", asking: 14_500_000 * 100 / 10, costs: { acquisition: 0, transport: 0, inspection: 0, refurbishment: 0 } as Vehicle["costs"], costComplete: true, hasImages: true, enquiries14d: 2, cohortMedianEnquiries: 2, version: 1, channels: [], documents: [], ...over });

test("each car gets its own plan from its own record, explained, with copy that passes the claim rules", () => {
  assert.equal(segmentOf({ make: "Maruti", model: "Swift", asking: 55_000_000 }), "budget");
  assert.equal(segmentOf({ make: "Hyundai", model: "Creta", asking: 145_000_000 }), "family");
  assert.equal(segmentOf({ make: "BMW", model: "520d", asking: 400_000_000 }), "premium");
  assert.equal(segmentOf({ make: "Honda", model: "City", asking: 90_000_000 }), "value");
  const steady = recommendPlan({ vehicle: vehicle({}), city: "Kochi", daysInStock: 20 });
  const ageing = recommendPlan({ vehicle: vehicle({ enquiries14d: 0 }), city: "Kochi", daysInStock: 70 });
  assert.equal(steady.priority, "steady");
  assert.equal(ageing.priority, "act now");
  assert.ok(ageing.budget.daily > steady.budget.daily, "an ageing car with no interest gets more attention");
  assert.equal(ageing.budget.total30, ageing.budget.daily * 30);
  assert.deepEqual(recommendPlan({ vehicle: vehicle({}), city: "Kochi", daysInStock: 20 }), steady, "deterministic");
  const premium = recommendPlan({ vehicle: vehicle({ make: "BMW", model: "520d", asking: 400_000_000 }), city: "Kochi", daysInStock: 10 });
  assert.notEqual(premium.angle, steady.angle, "contrasting cars get contrasting plans");
  assert.ok(premium.audience.radiusKm > steady.audience.radiusKm);
  const noPhotos = recommendPlan({ vehicle: vehicle({ hasImages: false, photos: [] }), city: "Kochi", daysInStock: 10 });
  assert.ok(!noPhotos.channels.some((c) => c.id === "meta"), "no photo-led ads without photos");
  for (const plan of [steady, ageing, premium, noPhotos]) assert.deepEqual(checkCopy(`${plan.headline} ${plan.body}`), [], "plans never write blocked claims");
});

test("a draft campaign can start from the plan; the server computes it and the team still approves", async () => {
  const { h, owner } = await setup();
  try {
    const out = await runFull(owner, [{ name: "createCampaign", args: ["V-1", true] }]);
    assert.ok(out.ok, JSON.stringify(out));
    const campaign = out.state.campaigns[0];
    assert.equal(campaign.status, "Draft", "a plan never skips approval");
    assert.equal(campaign.recommendation?.segment, "family");
    assert.equal(campaign.totalCap30d, campaign.dailyCap * 30);
    assert.ok(campaign.channels.find((c) => c.id === "search")!.enabled);
    assert.match(campaign.history[0].action, /recommended plan/);
  } finally { await h.close(); }
});

test("expenses: recorded by owner, manager or finance, shown next to sales by month, removable only by owner or finance", async () => {
  const { h, p, owner, invite } = await setup();
  try {
    const sales = await invite("s2@kerala.example", "sales");
    const manager = await invite("m@kerala.example", "manager");
    const month = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
    const day = `${month}-01`;
    assert.equal((await addExpense(sales, { branchId: p.locationIds[0], category: "Rent", description: "", amount: "50000", spentOn: day })).ok, false);
    const bad = await addExpense(owner, { branchId: "x", category: "Fun", description: "", amount: "-5", spentOn: "2099-01-01" });
    assert.ok(!bad.ok && bad.fields && Object.keys(bad.fields).length === 4);
    assert.ok((await addExpense(owner, { branchId: p.locationIds[0], category: "Rent", description: "Showroom", amount: "50,000", spentOn: day })).ok);
    const salary = await addExpense(manager, { branchId: p.locationIds[0], category: "Salaries", description: "", amount: "120000", spentOn: day });
    assert.ok(salary.ok);
    const f = await readFinance(owner, { from: month, to: month, branches: [] });
    assert.equal(f.months[0].expenses, 17_000_000, "₹1,70,000 in paise");
    assert.deepEqual(f.months[0].byCategory, { Rent: 5_000_000, Salaries: 12_000_000 });
    assert.equal(f.months[0].afterExpenses, -17_000_000);
    assert.equal(await deleteExpense(manager, (salary as { id: string }).id), false, "managers cannot remove entries");
    assert.ok(await deleteExpense(owner, (salary as { id: string }).id));
    const audit = (await (await import("../../apps/intelligence/lib/server/workspace")).loadWorkspace(owner)).audit.map((a) => a.action);
    assert.ok(audit.includes("expense.recorded") && audit.includes("expense.removed"));
  } finally { await h.close(); }
});

test("investors: owners and finance only, records and recorded totals, no calculations", async () => {
  const { h, owner, invite } = await setup();
  try {
    const manager = await invite("m2@kerala.example", "manager");
    assert.equal(await listInvestors(manager), null, "managers do not see investor records");
    assert.equal((await saveInvestor(manager, { name: "Joseph", kind: "Partner" })).ok, false);
    const saved = await saveInvestor(owner, { name: "Joseph Mathew", kind: "Partner", agreement: "20% partner in the Kochi branch", phone: "+91 90000 11111" });
    assert.ok(saved.ok);
    const id = (saved as { id: string }).id;
    assert.ok((await addInvestorEntry(owner, id, { kind: "Contribution", amount: "1000000", on: "2026-04-01" })).ok);
    assert.ok((await addInvestorEntry(owner, id, { kind: "Repayment", amount: "250000", on: "2026-10-01", note: "Part repayment" })).ok);
    assert.equal((await addInvestorEntry(owner, id, { kind: "Gift", amount: "x", on: "" })).ok, false);
    const [inv] = (await listInvestors(owner))!;
    assert.equal(inv.agreement, "20% partner in the Kochi branch", "kept as written");
    assert.deepEqual(recordedTotals(inv), { Contribution: 100_000_000, Repayment: 25_000_000, Payout: 0 });
    assert.ok(!("returns" in inv) && !("share" in inv));
  } finally { await h.close(); }
});

test("health review: ratings from platform data, for platform administrators only; sign-in is recorded", async () => {
  const { h, admin, owner } = await setup();
  try {
    assert.equal(rate({ vehicles_live: 10, vehicles_stale: 0, vehicles_no_photo: 0, vehicles_no_price: 0, campaigns_30d: 2, recommended_30d: 1, channels_on: 1, conversations_30d: 5, leads_30d: 20, leads_overdue: 1, leads_unassigned: 0, logins_30d: 3, expenses_30d: 4 }).overall, "green");
    const poor = rate({ vehicles_live: 0, campaigns_30d: 0, recommended_30d: 0, channels_on: 0, conversations_30d: 0, leads_30d: 4, leads_overdue: 4, leads_unassigned: 2, logins_30d: 0, expenses_30d: 0 });
    assert.equal(poor.overall, "red");
    assert.equal(poor.data.rating, "red");
    assert.equal((await healthReview(owner.userId)).length, 0, "a dealer owner is not a platform administrator");
    await admin.query("INSERT INTO intelligence_platform_admins(user_id, granted_by) VALUES($1, $2)", [owner.userId, "test"]);
    const rows = await healthReview(owner.userId);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => ["green", "amber", "red"].includes(r.overall)));
    const signed = await signIn("owner@kerala.example", "correct horse battery 7");
    assert.ok(signed.ok);
    const last = (await admin.query("SELECT last_login_at FROM intelligence_users WHERE id = $1", [owner.userId])).rows[0] as { last_login_at: Date | null };
    assert.ok(last.last_login_at, "management engagement can be measured");
  } finally { await h.close(); }
});
