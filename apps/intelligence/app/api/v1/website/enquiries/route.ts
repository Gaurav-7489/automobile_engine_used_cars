import { json, problem } from "@/lib/api";
import { deliverPendingLeadEmails } from "@/lib/server/lead-notifications";
import { later } from "@/lib/server/later";
import { jsonBody, websiteCaller } from "@/lib/server/website-auth";
import { IDEMPOTENCY, recordWebsiteEnquiry, validateWebsiteEnquiry } from "@/lib/server/website-enquiries";

export const dynamic = "force-dynamic";

/**
 * A connected dealership website records a customer enquiry (server to server; see docs/WEBSITE_CONNECTION.md).
 * 201 created · 200 duplicate (same Idempotency-Key, or same customer and request today) · 404 vehicle unavailable · 422 invalid.
 */
export async function POST(request: Request) {
  const gate = await websiteCaller(request, { perKeyPerMinute: 60 });
  if ("response" in gate) return gate.response;
  const key = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY.test(key)) return problem(422, "invalid", "Send an Idempotency-Key header (8 to 80 letters, digits, - _ :).");
  const parsed = await jsonBody(request, 6_000);
  if ("response" in parsed) return parsed.response;
  const { input, fields } = validateWebsiteEnquiry(parsed.body);
  if (!input) return problem(422, "invalid", "Please check the highlighted details.", { fields });
  try {
    const result = await recordWebsiteEnquiry({ tenantId: gate.caller.tenantId, locationIds: gate.caller.locationIds, keyId: gate.caller.keyId, site: gate.caller.site }, key, input);
    if (!result.ok) return problem(result.status, result.status === 404 ? "not_found" : result.status === 503 ? "unavailable" : "invalid", result.message, result.fields ? { fields: result.fields } : {});
    const tenant = gate.caller.tenantId.toLowerCase();
    if (!result.duplicate) later(() => deliverPendingLeadEmails(tenant));
    return json({ ok: true, reference: result.reference, duplicate: result.duplicate, type: result.type }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: "website_enquiry_v2_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "The enquiry could not be recorded just now. Try again shortly.");
  }
}
