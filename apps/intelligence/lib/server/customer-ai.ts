import Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_MODEL, assistantConfigured, type AssistantClient } from "./assistant";
import { appendMessages, CHANNEL_LABEL, cleanText, openConversation, type Channel, type Conversation, type ConvMessage } from "./conversations";
import { tenantTx, type SqlClient } from "./db";
import type { Principal } from "./identity";
import { queueLeadEmail } from "./lead-notifications";
import { readPublicInventory, readPublicListing } from "./public-listing";
import { WEBSITE_ACTOR_ID } from "./website-enquiry";
import { enterLive, runCommandsIn } from "./workspace";

/**
 * The dealership's AI agent for customers (playbook module M03). It answers on the channels the dealership has configured,
 * using only the dealership's own published vehicle records, and hands the conversation to the team whenever a person is
 * needed. Every message is logged in the conversation, and the conversation is linked to a lead in the CRM.
 *
 * What it does when information is missing or out of date, how it hands over, and what it will not discuss are fixed in the
 * instructions below (the playbook's verification item V-04), and tested in tests/intelligence-prod/engagement.test.ts.
 */
const SOURCE: Record<Channel, string> = { website: "Website chat", whatsapp: "WhatsApp", instagram: "Instagram" };
const HISTORY = 20;
const MAX_TURNS = 4;

export const CUSTOMER_RULES = `You are the AI assistant for a used-car dealership in India, replying to a customer on {CHANNEL}. You represent {DEALER}. The customer knows they are talking to an AI assistant; never pretend to be a person.

How to answer:
- Look cars up with the tools before saying anything about them. Every fact about a car (price, availability, fuel, kilometres, owners, colour, location) must come from a tool result in this conversation.
- If the record does not include something the customer asks about (service history, accident history, insurance, tyre condition, loan options, exact colour shade, anything else), say the record doesn't show it and offer to have someone from the team confirm it. Never guess or fill gaps from general knowledge.
- If a car is not found, sold or no longer listed, say it is no longer available and offer similar available cars from find_cars.
- A "reserved" car is held for another buyer: say so, and offer to tell the team they are interested in case it becomes free.

What you never do (offer to hand over to the team instead):
- Negotiate, discount, agree a final price or promise a price will hold.
- Approve, quote or promise finance, EMI, loans, insurance or exchange/trade-in values.
- Book, reserve or hold a car, or confirm a test-drive or visit time. You can pass the customer's request and preferred time to the team.
- Make claims about condition, accident history, warranty, certification or reliability.
- Discuss anything unrelated to buying a car from this dealership.

Handing over to a person:
- When the customer asks for a person, a call, a visit, a test drive, a better price, finance, or anything you cannot answer from the records, use hand_to_team.
- On the website you need the customer's name and a 10-digit mobile number first; ask for them in one short message. On WhatsApp their number is already known. On Instagram ask for a number if they want a call.
- After handing over, tell the customer plainly that the team will contact them, without promising a specific time.

Style: short, warm and plain, like a helpful showroom executive on chat. One to four short sentences. Prices in lakh (₹14.5 lakh). Mention the car's page link when you share a car. Reply in the language the customer writes in.`;

type Ctx = { tenantId: string; conv: Conversation; origin: string; handedOver: boolean; leadId: string | null };

const noInput = { type: "object" as const, properties: {}, required: [], additionalProperties: false };
const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_cars", strict: true,
    description: "Search this dealership's cars currently listed for sale. Returns up to 8 cars with price, kilometres, fuel, transmission, city, availability and a page link.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Make, model or words like 'suv diesel'. Empty for all cars." }, max_price_rupees: { type: "integer", description: "Budget in rupees; 0 for no limit." }, fuel: { type: "string", enum: ["", "Petrol", "Diesel", "CNG", "Electric", "Hybrid"] } }, required: ["query", "max_price_rupees", "fuel"], additionalProperties: false },
  },
  {
    name: "car_details", strict: true,
    description: "Full listed details of one car by its reference (stock number). Says if it is no longer available.",
    input_schema: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"], additionalProperties: false },
  },
  { name: "dealership_info", strict: true, description: "The dealership's branches with city and phone number.", input_schema: noInput },
  {
    name: "hand_to_team", strict: true,
    description: "Pass this conversation to the dealership's team, who will contact the customer. Use for calls, visits, test drives, price, finance, or anything the records cannot answer. On the website, name and mobile number are required.",
    input_schema: { type: "object", properties: { name: { type: "string" }, mobile: { type: "string", description: "10-digit mobile number; empty if not given." }, reason: { type: "string", description: "What the customer wants, in one sentence, including any preferred time." } }, required: ["name", "mobile", "reason"], additionalProperties: false },
  },
];

const lakhs = (rupees: number | null) => (rupees === null ? "price on request" : `₹${(rupees / 100000).toFixed(rupees % 100000 === 0 ? 0 : 1)} lakh`);

async function firstBranch(c: SqlClient, tenantId: string, stock: string | null): Promise<{ branchId: string; dealershipId: string; stock: string | null }> {
  if (stock) {
    const v = (await c.query("SELECT location_id, dealership_id, stock_id FROM vehicles WHERE tenant_id = $1 AND upper(stock_id) = upper($2) LIMIT 1", [tenantId, stock])).rows[0] as Record<string, unknown> | undefined;
    if (v) return { branchId: String(v.location_id), dealershipId: String(v.dealership_id), stock: String(v.stock_id) };
  }
  const l = (await c.query("SELECT id, dealership_id FROM locations WHERE tenant_id = $1 ORDER BY name, id LIMIT 1", [tenantId])).rows[0] as Record<string, unknown>;
  return { branchId: String(l.id), dealershipId: String(l.dealership_id), stock: null };
}

/** Turns a conversation into a CRM lead (or reuses the one it already has), with the vehicle attached and the transcript as its first note. */
export async function leadForConversation(c: SqlClient, tenantId: string, conv: Conversation, input: { name: string; phone: string; reason: string }): Promise<string | null> {
  if (conv.leadId) return conv.leadId;
  const place = await firstBranch(c, tenantId, conv.vehicleStockId);
  const transcript = conv.messages.slice(-8).map((m) => `${m.from === "customer" ? "Customer" : m.from === "ai" ? "AI" : "Team"}: ${m.text}`).join(" / ");
  const actor: Principal = { userId: WEBSITE_ACTOR_ID, tenantId, name: SOURCE[conv.channel], email: "", role: "manager", dealershipIds: [place.dealershipId], locationIds: [place.branchId] };
  const outcome = await runCommandsIn(c, actor, [{ name: "addLead", args: [{
    name: input.name || conv.contactName || `${CHANNEL_LABEL[conv.channel]} customer`, contact: input.phone, source: SOURCE[conv.channel], vehicleId: place.stock ?? "unspecified", owner: "Unassigned", branchId: place.branchId,
    consentEvidence: `Customer contacted the dealership on ${CHANNEL_LABEL[conv.channel]} (conversation ${conv.id}), ${new Date().toISOString().slice(0, 10)}`, marketingConsent: false,
    note: `${CHANNEL_LABEL[conv.channel]} conversation ${conv.id}: ${input.reason}. Transcript: ${transcript}`.slice(0, 600),
  }] }], false);
  if (!outcome.ok) { console.error(JSON.stringify({ event: "conversation_lead_failure", code: outcome.code, message: outcome.message })); return null; }
  const lead = outcome.changes.leads[0];
  if (!lead) return null;
  await queueLeadEmail(c, tenantId, lead.id);
  return lead.id;
}

const validMobile = (s: string) => { const d = s.replace(/\D/g, ""); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : d.length === 12 && d.startsWith("91") ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : null; };

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const link = (stock: string) => `${ctx.origin}/l/${ctx.tenantId}/${encodeURIComponent(stock.toLowerCase())}`;
  if (name === "find_cars") {
    const inv = await readPublicInventory(ctx.tenantId, { q: cleanText(input.query, 60), fuel: cleanText(input.fuel, 20) || undefined, sort: "price-asc" });
    const max = Number(input.max_price_rupees) > 0 ? Number(input.max_price_rupees) : Infinity;
    const cars = (inv?.cars ?? []).filter((c) => c.price === null || c.price <= max).slice(0, 8);
    return { found: cars.length, cars: cars.map((c) => ({ reference: c.stockId, car: `${c.year} ${c.make} ${c.model} ${c.variant}`.trim(), price: lakhs(c.price), km: c.km, fuel: c.fuel, transmission: c.transmission, city: c.city, availability: c.availability, link: link(c.stockId) })) };
  }
  if (name === "car_details") {
    const ref = cleanText(input.reference, 40);
    const v = /^[A-Za-z0-9-]{1,40}$/.test(ref) ? await readPublicListing(ctx.tenantId, ref) : null;
    if (!v) return { available: false, note: "This car is not listed for sale (sold, removed or the reference is wrong)." };
    return { available: v.availability === "available", reserved: v.availability === "reserved", reference: v.stockId, car: `${v.year} ${v.make} ${v.model} ${v.variant}`.trim(), price: lakhs(v.price), km: v.km, fuel: v.fuel || "not recorded", transmission: v.transmission || "not recorded", owners: v.owners, body: v.bodyType || "not recorded", colour: v.colour || "not recorded", photos: v.photos.length, branch: `${v.branch.name}, ${v.branch.city}`, branchPhone: v.branch.phone || "not recorded", link: link(v.stockId), notInRecord: "service history, accident history, insurance, condition details, loan options" };
  }
  if (name === "dealership_info") {
    const rows = (await tenantTx(ctx.tenantId, (c) => c.query("SELECT name, city, state, phone FROM locations WHERE tenant_id = $1 ORDER BY name", [ctx.tenantId]))).rows as Record<string, unknown>[];
    return { branches: rows.map((r) => ({ name: String(r.name), city: String(r.city), state: String(r.state), phone: String(r.phone || "not recorded") })), openingHours: "not recorded" };
  }
  if (name === "hand_to_team") {
    const reason = cleanText(input.reason, 300) || "Customer asked for the team";
    const known = ctx.conv.contactPhone || (ctx.conv.channel === "whatsapp" ? ctx.conv.contactRef : "");
    const phone = validMobile(cleanText(input.mobile, 20)) ?? (known ? validMobile(known) ?? "" : "");
    const customerName = cleanText(input.name, 80) || ctx.conv.contactName;
    if (ctx.conv.channel === "website" && (!phone || customerName.length < 2)) return { done: false, needed: "Ask the customer for their name and 10-digit mobile number, then call hand_to_team again." };
    const leadId = await tenantTx(ctx.tenantId, async (c) => {
      const id = await leadForConversation(c, ctx.tenantId, ctx.conv, { name: customerName, phone, reason });
      await appendMessages(c, ctx.tenantId, ctx.conv.id, [], { status: "team", unread: true, leadId: id ?? undefined, name: customerName, phone });
      return id;
    });
    ctx.handedOver = true;
    ctx.leadId = leadId;
    return { done: true, note: "The team has the conversation and will contact the customer. Do not promise a specific time." };
  }
  return { error: "Unknown tool." };
}

/** One reply to the customer. Returns null when the agent should stay quiet (the team has taken over or AI is not set up). */
export async function aiReply(tenantId: string, conv: Conversation, dealer: string, origin: string, client: AssistantClient = new Anthropic()): Promise<{ text: string; handedOver: boolean; leadId: string | null }> {
  const ctx: Ctx = { tenantId, conv, origin, handedOver: false, leadId: conv.leadId };
  // The conversation as the model sees it: customer turns as the user, earlier AI and team replies as the assistant.
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of conv.messages.slice(-HISTORY)) {
    const role = m.from === "customer" ? "user" : "assistant";
    const text = m.from === "team" ? `[Team member ${m.by ?? ""}]: ${m.text}` : m.text;
    const last = messages.at(-1);
    if (last && last.role === role) last.content = `${last.content as string}\n${text}`; else messages.push({ role, content: text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages.at(-1)!.role !== "user") return { text: "", handedOver: false, leadId: ctx.leadId };
  const system = CUSTOMER_RULES.replace("{CHANNEL}", CHANNEL_LABEL[conv.channel]).replace("{DEALER}", dealer || "the dealership");
  let text = "";
  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const message = await client.beta.messages.stream({
      model: ASSISTANT_MODEL, max_tokens: 2000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }, { type: "text", text: conv.vehicleStockId ? `The customer started from the page of car ${conv.vehicleStockId}.` : "The customer has not picked a car yet." }],
      tools: TOOLS, messages,
    }).finalMessage();
    text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (message.stop_reason === "refusal") { text = ""; break; }
    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !calls.length) break;
    messages.push({ role: "assistant", content: message.content });
    const results = await Promise.all(calls.map(async (call) => {
      try { return { type: "tool_result" as const, tool_use_id: call.id, content: JSON.stringify(await runTool(ctx, call.name, (call.input ?? {}) as Record<string, unknown>)) }; }
      catch (error) {
        console.error(JSON.stringify({ event: "customer_ai_tool_failure", tool: call.name, message: error instanceof Error ? error.message : "unknown" }));
        return { type: "tool_result" as const, tool_use_id: call.id, content: JSON.stringify({ error: "Lookup failed. Offer to pass the question to the team." }), is_error: true };
      }
    }));
    messages.push({ role: "user", content: results });
  }
  return { text, handedOver: ctx.handedOver, leadId: ctx.leadId };
}

export const FALLBACK_REPLY = "Thanks for your message. Someone from our team will get back to you shortly.";
export const HANDOVER_REPLY = "Thanks. I've passed this to our team and they will contact you.";

export type IncomingMessage = { tenantId: string; channel: Channel; key: string; ref?: string; text: string; name?: string; phone?: string; stock?: string | null; origin: string };
export type Handled = { conversation: Conversation; reply: ConvMessage | null };

/**
 * Everything that happens when a customer writes: the message is logged, a WhatsApp customer becomes a lead at once (their
 * number is known), and the AI answers unless the team has taken the conversation over or AI is not set up, in which case the
 * team is notified and replies itself.
 */
export async function handleCustomerMessage(msg: IncomingMessage, client?: AssistantClient): Promise<Handled> {
  enterLive();
  const text = cleanText(msg.text, 1000);
  const { conv, dealer } = await tenantTx(msg.tenantId, async (c) => {
    let conv = await openConversation(c, msg.tenantId, { channel: msg.channel, key: msg.key, ref: msg.ref, name: msg.name, phone: msg.phone, stock: msg.stock });
    const [added] = await appendMessages(c, msg.tenantId, conv.id, [{ from: "customer", text }], { unread: true });
    conv = { ...conv, messages: [...conv.messages, added].filter(Boolean) };
    if (!conv.leadId && msg.channel === "whatsapp" && msg.phone) {
      const leadId = await leadForConversation(c, msg.tenantId, conv, { name: msg.name ?? "", phone: validMobile(msg.phone) ?? msg.phone, reason: "Customer messaged on WhatsApp" });
      if (leadId) { await appendMessages(c, msg.tenantId, conv.id, [], { leadId }); conv = { ...conv, leadId }; }
    }
    const org = (await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [msg.tenantId])).rows[0] as { name?: string } | undefined;
    return { conv, dealer: String(org?.name ?? "") };
  });
  if (conv.status !== "ai") return { conversation: conv, reply: null };
  if (!assistantConfigured() && !client) {
    // No AI key: the customer still gets an acknowledgement and the team gets the conversation.
    const reply = await tenantTx(msg.tenantId, async (c) => (await appendMessages(c, msg.tenantId, conv.id, [{ from: "ai", text: FALLBACK_REPLY }], { status: "team" }))[0]);
    return { conversation: { ...conv, status: "team" }, reply };
  }
  let result: { text: string; handedOver: boolean; leadId: string | null };
  try {
    result = await aiReply(msg.tenantId, conv, dealer, msg.origin, client);
  } catch (error) {
    console.error(JSON.stringify({ event: "customer_ai_failure", channel: msg.channel, message: error instanceof Error ? error.name : "unknown" }));
    result = { text: "", handedOver: true, leadId: conv.leadId };
  }
  const answer = result.text || (result.handedOver ? HANDOVER_REPLY : FALLBACK_REPLY);
  const reply = await tenantTx(msg.tenantId, async (c) => (await appendMessages(c, msg.tenantId, conv.id, [{ from: "ai", text: answer }], result.text ? {} : { status: "team" }))[0]);
  return { conversation: { ...conv, status: result.handedOver || !result.text ? "team" : conv.status, leadId: result.leadId }, reply };
}
