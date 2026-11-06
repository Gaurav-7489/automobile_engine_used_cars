import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { enterLive, runCommandsIn } from "./workspace";

type Row = Record<string, unknown>;

export type EnquiryInput = {
  name: string;
  phone: string;
  message: string;
  intent: "call" | "whatsapp" | "test-drive" | "price";
  consent: boolean;
  marketing: boolean;
  utmSource?: string;
  utmCampaign?: string;
};

export type EnquiryResult =
  | { ok: true; reference: string; duplicate: boolean }
  | { ok: false; status: 404 | 422 | 503; message: string; fields?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOCK = /^[A-Za-z0-9-]{1,40}$/;
const INTENTS: Record<EnquiryInput["intent"], string> = { call: "Please call me", whatsapp: "Please WhatsApp me", "test-drive": "I'd like a test drive", price: "Price and finance enquiry" };
/** The website acts through a fixed system identity. It is never a staff account and cannot sign in. */
export const WEBSITE_ACTOR_ID = "00000000-0000-4000-8000-00000000000a";
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Checks a submission; returns field errors in the customer's words. */
export function validateEnquiry(raw: Record<string, unknown>): { input: EnquiryInput | null; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const name = clean(raw.name, 80);
  const phone = clean(raw.phone, 20);
  const digits = phone.replace(/\D/g, "");
  if (name.length < 2) fields.name = "Enter your name.";
  if (digits.length < 10 || digits.length > 13 || !/^\+?[\d\s-]+$/.test(phone)) fields.phone = "Enter a 10-digit mobile number.";
  if (raw.consent !== true) fields.consent = "Please allow the dealership to contact you about this car.";
  const intent = (Object.keys(INTENTS) as EnquiryInput["intent"][]).find((k) => k === raw.intent) ?? "call";
  if (Object.keys(fields).length) return { input: null, fields };
  return {
    input: { name, phone: digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : `+${digits}`, message: clean(raw.message, 500), intent, consent: true, marketing: raw.marketing === true, utmSource: clean(raw.utmSource, 40).toLowerCase() || undefined, utmCampaign: clean(raw.utmCampaign, 80) || undefined },
    fields,
  };
}

/**
 * Records a customer's enquiry from the public listing page as a lead on that vehicle, in the vehicle's branch, attributed to
 * the campaign whose tracking tag the visitor arrived with. Runs through the normal command pipeline, so follow-up rules,
 * the read model and the audit trail behave exactly as for a lead a member adds. The same phone on the same vehicle within a
 * day returns the existing lead instead of creating another.
 */
export async function submitWebsiteEnquiry(tenantId: string, stockId: string, input: EnquiryInput): Promise<EnquiryResult> {
  if (!UUID.test(tenantId) || !STOCK.test(stockId)) return { ok: false, status: 404, message: "This vehicle is no longer available." };
  enterLive();
  const tenant = tenantId.toLowerCase();
  return tenantTx(tenant, async (c) => {
    const vehicle = (await c.query(
      "SELECT v.stock_id, v.location_id, v.dealership_id, v.payload FROM vehicles v WHERE v.tenant_id = $1 AND upper(v.stock_id) = upper($2) AND v.publish_status = 'published' AND v.availability_status IN ('available', 'reserved') LIMIT 1",
      [tenant, stockId],
    )).rows[0] as Row | undefined;
    if (!vehicle) return { ok: false as const, status: 404 as const, message: "This vehicle is no longer available." };
    const stock = String(vehicle.stock_id);
    const digits = input.phone.replace(/\D/g, "");
    const recent = (await c.query(
      "SELECT lead_id FROM intelligence_lead_index WHERE tenant_id = $1 AND contact_digits = $2 AND vehicle_stock_id = $3 AND created_at > now() - interval '1 day' LIMIT 1",
      [tenant, digits, stock],
    )).rows[0] as Row | undefined;
    if (recent) return { ok: true as const, reference: String(recent.lead_id), duplicate: true };
    const campaign = input.utmCampaign
      ? ((await c.query("SELECT id FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'campaigns' AND payload->>'utm' = $2 AND payload->>'vehicleId' = $3 LIMIT 1", [tenant, input.utmCampaign, stock])).rows[0] as Row | undefined)
      : undefined;
    const p = vehicle.payload as Row;
    const title = [p.year, p.make, p.model, p.variant].filter(Boolean).join(" ");
    const via = input.utmSource ? ` via ${input.utmSource}` : "";
    const note = `Website enquiry${via} for ${title} (${stock}): ${INTENTS[input.intent]}.${input.message ? ` "${input.message}"` : ""}`;
    const website: Principal = { userId: WEBSITE_ACTOR_ID, tenantId: tenant, name: "Website", email: "", role: "manager", dealershipIds: [String(vehicle.dealership_id)], locationIds: [String(vehicle.location_id)] };
    const outcome = await runCommandsIn(c, website, [{
      name: "addLead",
      args: [{ name: input.name, contact: input.phone, source: "Website", vehicleId: stock, owner: "Unassigned", branchId: String(vehicle.location_id), consentEvidence: `Website enquiry form, ${new Date().toISOString().slice(0, 10)}`, marketingConsent: input.marketing, campaignId: campaign ? String(campaign.id) : undefined, note }],
    }], false);
    if (!outcome.ok) return { ok: false as const, status: outcome.status === 403 ? (503 as const) : (422 as const), message: outcome.status === 403 ? "Enquiries are not being accepted online right now. Please call the dealership." : outcome.message, fields: outcome.fields };
    const lead = outcome.changes.leads.find((l) => l.contactFull.replace(/\D/g, "") === digits) ?? outcome.changes.leads[0];
    return { ok: true as const, reference: lead?.id ?? "received", duplicate: false };
  });
}
