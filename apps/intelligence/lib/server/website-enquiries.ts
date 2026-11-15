import type { LeadEnquiry, WebsiteEnquiryType } from "../domain";
import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { queueLeadEmail } from "./lead-notifications";
import { WEBSITE_ACTOR_ID } from "./website-enquiry";
import { enterLive, runCommandsIn } from "./workspace";

/**
 * Website integration v2: every enquiry a connected dealership website takes (vehicle, call-back, test drive, price, sell your
 * car, showroom visit, general, WhatsApp form) becomes a lead in the right workspace and branch.
 *
 * The workspace always comes from the authenticated website key, never from the request. A key limited to some branches only
 * records enquiries for cars in those branches. Each submission carries an Idempotency-Key, so a retried delivery returns the
 * first result instead of a second lead; the same phone asking about the same thing on the same day also joins the first lead.
 */

type Row = Record<string, unknown>;
export const ENQUIRY_TYPES: WebsiteEnquiryType[] = ["vehicle", "callback", "test_drive", "price", "sell", "visit", "general", "whatsapp"];
/** Types about one specific car: the car must be published and still available. */
const NEEDS_VEHICLE: WebsiteEnquiryType[] = ["vehicle", "test_drive", "price"];

export type WebsiteEnquiryInput = {
  type: WebsiteEnquiryType;
  name: string;
  phone: string;
  email?: string;
  message: string;
  stockId?: string;
  marketing: boolean;
  consentAt: string;
  requested?: { date?: string; time?: string };
  sell?: LeadEnquiry["sell"];
  websiteReference?: string;
  attribution: NonNullable<LeadEnquiry["attribution"]>;
};

export type WebsiteEnquiryResult =
  | { ok: true; reference: string; duplicate: boolean; type: WebsiteEnquiryType }
  | { ok: false; status: 404 | 422 | 503; message: string; fields?: Record<string, string> };

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : NaN; };
const token = (v: unknown, max: number) => { const s = clean(v, max).toLowerCase(); return /^[a-z0-9_.-]+$/.test(s) ? s : undefined; };
export const IDEMPOTENCY = /^[A-Za-z0-9_:-]{8,80}$/;

/** Checks a website enquiry. Field messages are written for the customer, because the website shows them as they are. */
export function validateWebsiteEnquiry(raw: Record<string, unknown>): { input: WebsiteEnquiryInput | null; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const type = ENQUIRY_TYPES.find((t) => t === raw.type);
  if (!type) fields.type = "Unknown enquiry type.";
  const name = clean(raw.name, 80);
  const phone = clean(raw.phone, 20);
  const digits = phone.replace(/\D/g, "");
  const email = clean(raw.email, 120);
  if (name.length < 2) fields.name = "Enter your name.";
  if (digits.length < 10 || digits.length > 13 || !/^\+?[\d\s-]+$/.test(phone)) fields.phone = "Enter a 10-digit mobile number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = "Check the email address.";
  if (raw.consent !== true) fields.consent = "Please allow the dealership to contact you about this enquiry.";
  const stockId = clean(raw.stockId, 40);
  if (stockId && !/^[A-Za-z0-9-]{1,40}$/.test(stockId)) fields.stockId = "This vehicle could not be identified.";
  if (type && NEEDS_VEHICLE.includes(type) && !stockId) fields.stockId = "This vehicle could not be identified.";

  let requested: WebsiteEnquiryInput["requested"];
  const a = (raw.appointment ?? null) as Row | null;
  if (a && typeof a === "object") {
    const date = clean(a.date, 10);
    const time = clean(a.time, 20);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fields["appointment.date"] = "Choose a date.";
    if (time && !/^(Morning|Afternoon|Evening|\d{2}:\d{2})$/.test(time)) fields["appointment.time"] = "Choose a time.";
    if (date || time) requested = { date: date || undefined, time: time || undefined };
  }
  let sell: WebsiteEnquiryInput["sell"];
  if (type === "sell") {
    const s = (raw.sell ?? {}) as Row;
    const make = clean(s.brand ?? s.make, 40);
    const model = clean(s.model, 60);
    const year = num(s.year);
    const km = num(s.km);
    if (!make) fields["sell.brand"] = "Tell us the make.";
    if (!model) fields["sell.model"] = "Tell us the model.";
    if (!(year >= 1950 && year <= new Date().getFullYear() + 1)) fields["sell.year"] = "Choose the model year.";
    if (!(km >= 0 && km < 2_000_000)) fields["sell.km"] = "Enter the kilometres driven.";
    sell = { make, model, variant: clean(s.variant, 60) || undefined, year, km, owners: num(s.owners) > 0 ? num(s.owners) : undefined, city: clean(s.city, 60) || undefined, expectedPrice: num(s.expectedPrice) > 0 ? num(s.expectedPrice) : undefined };
  }
  if (Object.keys(fields).length || !type) return { input: null, fields };
  const consentAt = Date.parse(clean(raw.consentAt, 40)) ? new Date(clean(raw.consentAt, 40)).toISOString() : new Date().toISOString();
  return {
    fields,
    input: {
      type, name, phone: digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : `+${digits}`, email: email || undefined, message: clean(raw.message, 600),
      stockId: stockId || undefined, marketing: raw.marketing === true, consentAt, requested, sell,
      websiteReference: /^[A-Z0-9-]{4,24}$/.test(clean(raw.reference, 24)) ? clean(raw.reference, 24) : undefined,
      attribution: { utmSource: token(raw.utmSource, 30), utmMedium: token(raw.utmMedium, 30), utmCampaign: clean(raw.utmCampaign, 80) || undefined, referrer: token(raw.referrer, 80), page: clean(raw.page, 200).startsWith("/") ? clean(raw.page, 200) : undefined },
    },
  };
}

const LABEL: Record<WebsiteEnquiryType, string> = { vehicle: "Vehicle enquiry", callback: "Call-back request", test_drive: "Test drive request", price: "Price and finance enquiry", sell: "Sell-your-car enquiry", visit: "Showroom visit request", general: "General enquiry", whatsapp: "WhatsApp contact request" };
const TASK: Record<WebsiteEnquiryType, string> = { vehicle: "First response", callback: "Call the customer back", test_drive: "Confirm the test drive", price: "Send price and finance details", sell: "Arrange an appraisal", visit: "Confirm the showroom visit", general: "First response", whatsapp: "Reply on WhatsApp" };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function noteFor(input: WebsiteEnquiryInput, site: string, title: string | null): string {
  const parts = [`${LABEL[input.type]} from ${site || "the website"}${input.attribution.utmSource ? ` via ${input.attribution.utmSource}` : ""}`];
  if (title) parts.push(`for ${title}`);
  if (input.requested) parts.push(`(requested ${[input.requested.date, input.requested.time].filter(Boolean).join(" ")}, to be confirmed)`);
  if (input.sell) parts.push(`: ${input.sell.year} ${input.sell.make} ${input.sell.model}${input.sell.variant ? ` ${input.sell.variant}` : ""}, ${input.sell.km.toLocaleString("en-IN")} km${input.sell.owners ? `, ${input.sell.owners} owner(s)` : ""}${input.sell.city ? `, ${input.sell.city}` : ""}${input.sell.expectedPrice ? `, expects ${inr(input.sell.expectedPrice)}` : ""}`);
  let note = parts.join(" ") + ".";
  if (input.email) note += ` Email: ${input.email}.`;
  if (input.message) note += ` "${input.message}"`;
  return note;
}

export type WebsiteCaller = { tenantId: string; locationIds: string[]; keyId: string; site: string };

/** Records one website enquiry. Safe to call again with the same idempotency key. */
export async function recordWebsiteEnquiry(caller: WebsiteCaller, idempotencyKey: string, input: WebsiteEnquiryInput): Promise<WebsiteEnquiryResult> {
  if (!IDEMPOTENCY.test(idempotencyKey)) return { ok: false, status: 422, message: "Send an Idempotency-Key header.", fields: { idempotencyKey: "Required." } };
  enterLive();
  const tenant = caller.tenantId.toLowerCase();
  return tenantTx(tenant, async (c) => {
    // Serialise submissions with the same key, so two concurrent retries cannot both create a lead.
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 11))", [`${tenant}:${idempotencyKey}`]);
    const seen = (await c.query("SELECT reference, enquiry_type FROM intelligence_website_enquiries WHERE tenant_id = $1 AND idempotency_key = $2", [tenant, idempotencyKey])).rows[0] as Row | undefined;
    if (seen) return { ok: true as const, reference: String(seen.reference), duplicate: true, type: seen.enquiry_type as WebsiteEnquiryType };

    let vehicle: Row | undefined;
    if (input.stockId) {
      vehicle = (await c.query(
        "SELECT stock_id, location_id, dealership_id, payload FROM vehicles WHERE tenant_id = $1 AND upper(stock_id) = upper($2) AND publish_status = 'published' AND availability_status IN ('available', 'reserved') LIMIT 1",
        [tenant, input.stockId],
      )).rows[0] as Row | undefined;
      // A key limited to some branches never sees, or records enquiries for, another branch's cars.
      if (vehicle && caller.locationIds.length && !caller.locationIds.includes(String(vehicle.location_id))) vehicle = undefined;
      if (!vehicle && NEEDS_VEHICLE.includes(input.type)) return { ok: false as const, status: 404 as const, message: "This vehicle is no longer available." };
    }
    const branch = vehicle
      ? (vehicle as Row)
      : ((await c.query("SELECT id AS location_id, dealership_id FROM locations WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[])) ORDER BY array_position($2::uuid[], id), name, id LIMIT 1", [tenant, caller.locationIds.length ? caller.locationIds : null])).rows[0] as Row | undefined);
    if (!branch) return { ok: false as const, status: 503 as const, message: "Enquiries are not being accepted online right now. Please call the dealership." };
    const stock = vehicle ? String(vehicle.stock_id) : null;
    const digits = input.phone.replace(/\D/g, "");

    // The same phone about the same car (or, without a car, the same kind of request) today joins the existing lead.
    const recent = (await c.query(
      stock
        ? "SELECT lead_id FROM intelligence_lead_index WHERE tenant_id = $1 AND contact_digits = $2 AND vehicle_stock_id = $3 AND created_at > now() - interval '1 day' LIMIT 1"
        : "SELECT lead_id FROM intelligence_lead_index WHERE tenant_id = $1 AND contact_digits = $2 AND vehicle_stock_id IS NULL AND data->'enquiry'->>'type' = $3 AND created_at > now() - interval '1 day' LIMIT 1",
      [tenant, digits, stock ?? input.type],
    )).rows[0] as Row | undefined;
    if (recent) {
      await c.query("INSERT INTO intelligence_website_enquiries (tenant_id, idempotency_key, reference, enquiry_type, website_reference) VALUES ($1, $2, $3, $4, $5)", [tenant, idempotencyKey, String(recent.lead_id), input.type, input.websiteReference ?? null]);
      return { ok: true as const, reference: String(recent.lead_id), duplicate: true, type: input.type };
    }

    const campaign = input.attribution.utmCampaign && stock
      ? ((await c.query("SELECT id FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'campaigns' AND payload->>'utm' = $2 AND payload->>'vehicleId' = $3 LIMIT 1", [tenant, input.attribution.utmCampaign, stock])).rows[0] as Row | undefined)
      : undefined;
    const p = (vehicle?.payload ?? {}) as Row;
    const title = vehicle ? `${[p.year, p.make, p.model, p.variant].filter(Boolean).join(" ")} (${stock})` : null;
    const website: Principal = { userId: WEBSITE_ACTOR_ID, tenantId: tenant, name: "Website", email: "", role: "manager", dealershipIds: [String(branch.dealership_id)], locationIds: [String(branch.location_id)] };
    const enquiry: LeadEnquiry = { type: input.type, requested: input.requested, sell: input.sell, site: caller.site || undefined, websiteReference: input.websiteReference, attribution: input.attribution, consentAt: input.consentAt };
    const outcome = await runCommandsIn(c, website, [{
      name: "addLead",
      args: [{ name: input.name, contact: input.phone, email: input.email, source: input.type === "whatsapp" ? "WhatsApp" : "Website", vehicleId: stock ?? "unspecified", owner: "Unassigned", branchId: String(branch.location_id), consentEvidence: `Website enquiry form (${caller.site || "website"}), ${input.consentAt.slice(0, 10)}`, marketingConsent: input.marketing, campaignId: campaign ? String(campaign.id) : undefined, note: noteFor(input, caller.site, title), enquiry, firstTask: TASK[input.type] }],
    }], false);
    if (!outcome.ok) return { ok: false as const, status: outcome.status === 403 ? (503 as const) : (422 as const), message: outcome.status === 403 ? "Enquiries are not being accepted online right now. Please call the dealership." : outcome.message, fields: outcome.fields };
    const lead = outcome.changes.leads.find((l) => l.contactFull.replace(/\D/g, "") === digits) ?? outcome.changes.leads[0];
    if (!lead) throw new Error("lead not created");
    await c.query("INSERT INTO intelligence_website_enquiries (tenant_id, idempotency_key, reference, enquiry_type, website_reference) VALUES ($1, $2, $3, $4, $5)", [tenant, idempotencyKey, lead.id, input.type, input.websiteReference ?? null]);
    await queueLeadEmail(c, tenant, lead.id);
    return { ok: true as const, reference: lead.id, duplicate: false, type: input.type };
  });
}
