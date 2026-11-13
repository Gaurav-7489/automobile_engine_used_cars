import Anthropic from "@anthropic-ai/sdk";
import type { Campaign, Vehicle } from "../domain";
import { stockAgeDays } from "../finance";
import { can, type Capability } from "../permissions";
import { tenantTx, type SqlClient } from "./db";
import type { Principal } from "./identity";
import { listVehicles, salesSummarySql, stageCounts, stockMetricsSql, todayIst } from "./read-queries";
import { syncReadModel } from "./read-model";
import { readStatePrices } from "./state-prices";
import { financeSummary } from "./finance-records";
import { enterLive } from "./workspace";

/**
 * The dealership assistant: Claude answering questions about this dealership's own stock, leads, sales, campaigns and
 * market prices. It reads through the same tenant-scoped, branch-scoped queries as the pages, limited to what the signed-in
 * member's role may see, and it cannot change anything. Customer names, phone numbers and emails are never sent to the model.
 */
export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL?.trim() || "claude-opus-5-5";
export const assistantConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export type ChatMessage = { role: "user" | "assistant"; content: string };
export const MAX_MESSAGES = 24;
export const MAX_MESSAGE_CHARS = 4000;
const MAX_TURNS = 6;

export function validMessages(value: unknown): value is ChatMessage[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_MESSAGES
    && value.every((m) => m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0 && m.content.length <= MAX_MESSAGE_CHARS)
    && value[0].role === "user" && value.at(-1)!.role === "user";
}

const SYSTEM = `You are the assistant inside VandLabs, the workspace a used-car dealership in India runs its business in. The person asking works at the dealership: an owner, manager or a member of the sales, stock, marketing or finance staff.

Use the tools to look things up before you answer anything about this dealership's cars, leads, sales, campaigns or market prices. Every figure you state must come from a tool result in this conversation; if the tools do not have it, say so plainly instead of estimating. A tool you were not given means this person's role cannot see that data, so tell them to ask an owner or manager.

What the data means:
- Money in tool results is in Indian rupees. Write prices the way dealers do: lakh for cars (₹14.5 lakh), plain rupees for small amounts.
- State prices are asking prices from cars dealers have published on VandLabs, not sale prices. A state marked "thin" has under five cars, so call that a rough guide. Moving a car between states adds transport and re-registration cost; mention it when comparing states.
- "landedCost" is what the dealership has spent on a car in total. Asking price minus landed cost is the margin before selling costs.
- Days in stock above 45 is ageing stock that needs a decision: a price review, better photos, an ad, or a follow-up on its enquiries.

You can draft things for the person to use: ad text, a social post, a message to a customer, a pricing note. When you write ad or post text, use only facts from the car's record, and never claim a car is accident-free, certified, under warranty, the cheapest, or that finance is guaranteed. You cannot change records, publish ads or message customers yourself; say where in the workspace to do it (Inventory, Pricing, Leads, Advertising, Prices by state).

Keep answers short and practical: lead with the answer, then the two or three figures behind it, then one suggested next step when there is an obvious one. Plain sentences, no headings; a short list is fine for several cars. Reply in the language the person writes in.`;

type ToolContext = { c: SqlClient; principal: Principal; home: string };
type AssistantTool = { def: Anthropic.Beta.BetaTool; needs: Capability; run: (ctx: ToolContext, input: Record<string, unknown>) => Promise<unknown> };

const rupee = (paise: number | null | undefined): number | null => (paise === null || paise === undefined ? null : Math.round(paise / 100));
const text = (v: unknown, max = 60): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const noInput = { type: "object" as const, properties: {}, required: [], additionalProperties: false };

function carRow(v: Vehicle, costs: boolean, today: string) {
  return {
    stock: v.id, car: `${v.year} ${v.make} ${v.model} ${v.variant}`.trim(), fuel: v.fuel, transmission: v.transmission, km: v.km, owners: v.owners, status: v.status,
    askingPrice: rupee(v.asking), daysInStock: stockAgeDays(v, `${today}T00:00:00.000Z`), enquiriesLast14Days: v.enquiries14d, hasPhotos: v.hasImages,
    ...(costs ? { landedCost: v.costComplete ? rupee(Object.values(v.costs).reduce((a, n) => a + (typeof n === "number" ? n : 0), 0)) : "cost record incomplete" } : {}),
  };
}

const TOOLS: Record<string, AssistantTool> = {
  stock_overview: {
    needs: "inventory.view",
    def: { name: "stock_overview", description: "Counts of unsold cars by status and age, money tied up in stock (if this person may see costs), and the ten cars that have been in stock longest. Call this for any question about stock health, ageing or what to focus on.", input_schema: noInput, strict: true },
    run: async ({ c, principal }) => {
      const today = todayIst();
      const costs = can(principal.role, "capital.view");
      const m = await stockMetricsSql(c, principal.tenantId, principal.locationIds, today);
      const oldest = await listVehicles(c, principal.tenantId, principal.locationIds, { tab: "available", sort: "age", dir: "desc", page: 1, size: 10 }, today);
      return {
        unsold: m.unsold, onSale: m.available, reserved: m.reserved, beingPrepared: m.preparation, onSaleOver45Days: m.ageing, onSaleByDaysInStock: m.availableByAge,
        ...(costs ? { moneyTiedUpInStock: rupee(m.landedCapital), expectedMarginOnPricedCars: rupee(m.estimatedGross), carsLeftOutOfMargin: m.grossExcluded } : {}),
        longestInStock: oldest.vehicles.map((v) => carRow(v, costs, today)),
      };
    },
  },
  find_cars: {
    needs: "inventory.view",
    def: {
      name: "find_cars", description: "Search this dealership's own cars by make, model, variant or stock number. Returns up to 15 cars with price, kilometres, days in stock and recent enquiries. Use an empty query to list cars in a status.",
      input_schema: { type: "object", properties: { query: { type: "string", description: "Words to match, e.g. 'creta' or 'V-104'. Empty for all." }, status: { type: "string", enum: ["on_sale", "reserved", "being_prepared", "sold", "any_unsold"] } }, required: ["query", "status"], additionalProperties: false },
      strict: true,
    },
    run: async ({ c, principal }, input) => {
      const today = todayIst();
      const tab = ({ on_sale: "available", reserved: "reserved", being_prepared: "preparation", sold: "sold", any_unsold: "all" } as const)[text(input.status) as "on_sale"] ?? "all";
      const page = await listVehicles(c, principal.tenantId, principal.locationIds, { tab, q: text(input.query) || undefined, sort: "age", dir: "desc", page: 1, size: 15 }, today);
      return { matches: page.total, shown: page.vehicles.length, cars: page.vehicles.map((v) => carRow(v, can(principal.role, "capital.view"), today)) };
    },
  },
  lead_overview: {
    needs: "leads.view",
    def: { name: "lead_overview", description: "How many leads are in each stage, how many follow-ups are overdue, where leads come from, and which cars get the most enquiries. No customer names or contact details.", input_schema: noInput, strict: true },
    run: async ({ c, principal }) => {
      const scope = [principal.tenantId, principal.locationIds];
      const one = async (sql: string) => (await c.query(sql, scope)).rows as Record<string, unknown>[];
      const stages = await stageCounts(c, principal.tenantId, principal.locationIds);
      const overdue = Number((await one("SELECT count(*)::int AS n FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND overdue_flag"))[0]?.n ?? 0);
      const sources = await one("SELECT source, count(*)::int AS n FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 8");
      const cars = await one("SELECT vehicle_stock_id AS stock, count(*)::int AS n FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND vehicle_stock_id IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 8");
      return { leadsByStage: stages, overdueFollowUps: overdue, newLeadsLast30DaysBySource: sources.map((r) => ({ source: String(r.source), leads: Number(r.n) })), mostEnquiredCarsLast30Days: cars.map((r) => ({ stock: String(r.stock), leads: Number(r.n) })) };
    },
  },
  sales_summary: {
    needs: "reports.view",
    def: { name: "sales_summary", description: "Completed sales per month for the last six months: cars sold and typical days to sell, and (if this person may see finance) profit on cars sold, recorded running expenses by category, and the result after expenses.", input_schema: noInput, strict: true },
    run: async ({ c, principal }) => {
      const month = (offset: number) => { const d = new Date(`${todayIst().slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - offset); return d.toISOString().slice(0, 7); };
      const rows = (await salesSummarySql(c, principal.tenantId, principal.locationIds, month(5), month(0))).filter((r) => r.state === "Completed");
      const finance = can(principal.role, "reports.finance");
      const money = finance ? (await financeSummary(c, principal.tenantId, principal.locationIds, month(5), month(0))).months : [];
      return { months: rows.sort((a, b) => a.month.localeCompare(b.month)).map((r) => {
        const days = [...r.days].sort((a, b) => a - b);
        const m = money.find((x) => x.month === r.month);
        return { month: r.month, carsSold: r.count, ...(finance ? { profitOnCarsSold: rupee(r.profit), runningExpenses: rupee(m?.expenses ?? 0), afterExpenses: rupee(m?.afterExpenses ?? r.profit), expensesByCategory: Object.fromEntries(Object.entries(m?.byCategory ?? {}).map(([k, v]) => [k, rupee(v)])) } : {}), typicalDaysToSell: days.length ? days[Math.floor(days.length / 2)] : null };
      }), ...(finance ? { note: "Profit is from completed sales with full car costs; expenses are what the dealership recorded in Revenue & expenses." } : {}) };
    },
  },
  state_prices: {
    needs: "market.view",
    def: {
      name: "state_prices", description: "Typical, lowest and highest asking price for a make and model in each Indian state, from cars dealers have published on VandLabs, with the difference against this dealership's own state. Leave model empty for the whole make, or both empty for all cars.",
      input_schema: { type: "object", properties: { make: { type: "string", description: "e.g. 'Hyundai'. Empty for all makes." }, model: { type: "string", description: "e.g. 'Creta'. Empty for all models." } }, required: ["make", "model"], additionalProperties: false },
      strict: true,
    },
    run: async ({ home }, input) => {
      const r = await readStatePrices({ make: text(input.make, 40), model: text(input.model, 40), home });
      return {
        make: r.make || "all makes", model: r.model || "all models", homeState: r.home || "unknown", note: "Asking prices in rupees, not sale prices.",
        states: r.states.map((s) => ({ state: s.state, typicalPrice: s.median, lowest: s.low, highest: s.high, cars: s.cars, thin: s.thin, percentVsHomeState: s.vsHome })),
        ...(r.states.length ? {} : { modelsWithData: r.models.slice(0, 40).map((m) => `${m.make} ${m.model}`) }),
      };
    },
  },
  campaigns: {
    needs: "campaign.view",
    def: { name: "campaigns", description: "This dealership's advertising campaigns: the car, status, channels, budget and results where the ad platform has reported them.", input_schema: noInput, strict: true },
    run: async ({ c, principal }) => {
      const rows = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'campaigns' ORDER BY updated_at DESC LIMIT 25", [principal.tenantId])).rows as { payload: Campaign }[];
      return { campaigns: rows.map(({ payload: p }) => ({
        id: p.id, name: p.name, stock: p.vehicleId, status: p.status, goal: p.objective, area: p.region, dates: `${p.startDate} to ${p.endDate}`,
        channels: p.channels.filter((ch) => ch.enabled).map((ch) => ({ channel: ch.id, budget: rupee(ch.budget) })), spendLimit30Days: rupee(p.totalCap30d), headline: p.headline,
        results: p.metrics ? { spend: rupee(p.metrics.spend), clicks: p.metrics.clicks, leads: p.metrics.leads, testDrives: p.metrics.testDrives } : "not reported yet",
      })) };
    },
  },
};

/** The tools this member's role may use. A tool that is not offered cannot be called, whatever the conversation says. */
export const toolsFor = (role: Principal["role"]): string[] => Object.keys(TOOLS).filter((name) => can(role, TOOLS[name].needs));

/** Runs one tool as the signed-in member: tenant from the session, branches from the membership, capability re-checked here. */
export async function runTool(principal: Principal, name: string, input: unknown): Promise<{ ok: true; result: unknown } | { ok: false; message: string }> {
  const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : undefined;
  if (!tool || !can(principal.role, tool.needs)) return { ok: false, message: "That information is not available to this person's role." };
  const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  try {
    enterLive();
    const result = await tenantTx(principal.tenantId, async (c) => {
      await syncReadModel(c, principal.tenantId);
      const home = String((await c.query("SELECT state FROM locations WHERE tenant_id = $1 AND id = ANY($2::uuid[]) ORDER BY name, id LIMIT 1", [principal.tenantId, principal.locationIds])).rows[0]?.state ?? "");
      return tool.run({ c, principal, home }, args);
    });
    return { ok: true, result };
  } catch (error) {
    console.error(JSON.stringify({ event: "assistant_tool_failure", tool: name, message: error instanceof Error ? error.message : "unknown" }));
    return { ok: false, message: "This lookup failed. Tell the person it could not be loaded right now." };
  }
}

type StreamLike = { on(event: "text", listener: (delta: string) => void): unknown; finalMessage(): Promise<Anthropic.Beta.BetaMessage> };
export type AssistantClient = { beta: { messages: { stream(params: Parameters<Anthropic["beta"]["messages"]["stream"]>[0]): StreamLike } } };

export type AssistantOutcome = { status: "done" | "refused" | "truncated" | "too_long"; turns: number };

/**
 * One answer: Claude may look things up several times before it replies. Text is passed to `emit` as it is written.
 * A request the model's safety checks decline is retried on the fallback model by the API itself (server-side fallbacks).
 */
export async function runAssistant(input: { principal: Principal; dealership: string; messages: ChatMessage[]; emit: (text: string) => void; client?: AssistantClient }): Promise<AssistantOutcome> {
  const { principal, emit } = input;
  const client: AssistantClient = input.client ?? new Anthropic();
  const names = toolsFor(principal.role);
  const messages: Anthropic.Beta.BetaMessageParam[] = input.messages.map((m) => ({ role: m.role, content: m.content }));
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const stream = client.beta.messages.stream({
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The instructions and tools are the same for everyone, so they are cached; who is asking comes after the cached part.
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Dealership: ${input.dealership || "this dealership"}. The person asking: ${principal.name || "a team member"}, role ${principal.role}. Today is ${todayIst()} (India time).` },
      ],
      tools: names.map((name) => TOOLS[name].def),
      messages,
    });
    stream.on("text", emit);
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return { status: "refused", turns: turn };
    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason === "max_tokens") return { status: "truncated", turns: turn };
    if (message.stop_reason !== "tool_use" || !calls.length) return { status: "done", turns: turn };
    messages.push({ role: "assistant", content: message.content });
    const results = await Promise.all(calls.map(async (call) => {
      const out = await runTool(principal, call.name, call.input);
      return { type: "tool_result" as const, tool_use_id: call.id, content: JSON.stringify(out.ok ? out.result : { error: out.message }), ...(out.ok ? {} : { is_error: true }) };
    }));
    messages.push({ role: "user", content: results });
    emit("\n\n");
  }
  return { status: "too_long", turns: MAX_TURNS };
}
