import { after } from "next/server";
import { json, problem, rateLimited } from "@/lib/api";
import { deliverPendingLeadEmails } from "@/lib/server/lead-notifications";
import { sameOrigin } from "@/lib/server/csrf";
import { gateEnquiry, submitWebsiteEnquiry, validateEnquiry } from "@/lib/server/website-enquiry";

export const dynamic = "force-dynamic";

/**
 * A customer's enquiry from a public vehicle page, or relayed by the dealership's connected website. Same-origin or website key,
 * size limited, and rate limited per visitor, per website and per dealership (see gateEnquiry).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const text = await request.text();
  if (text.length > 4_000) return problem(413, "too_large", "That message is too long.");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text) as Record<string, unknown>; } catch { return problem(422, "invalid", "Send valid JSON."); }
  // Hidden field people never see: anything in it is an automated submission. Answer as if accepted.
  if (typeof raw.website === "string" && raw.website.trim()) return json({ ok: true, reference: "received" }, { status: 201 });
  const tenant = typeof raw.tenant === "string" ? raw.tenant : "";
  const stock = typeof raw.stock === "string" ? raw.stock : "";
  let gate;
  try { gate = await gateEnquiry(request, tenant); } catch { return problem(503, "unavailable", "We could not send your enquiry just now. Please try again or call the dealership."); }
  if (!gate.ok) return gate.status === 429 ? rateLimited(gate.message, gate.retryAfter ?? 60) : problem(gate.status, gate.status === 401 ? "unauthenticated" : "forbidden", gate.message);
  const { input, fields } = validateEnquiry(raw);
  if (!input) return problem(422, "invalid", "Please check the highlighted details.", { fields });
  try {
    const result = await submitWebsiteEnquiry(tenant, stock, input);
    if (!result.ok) return problem(result.status, result.status === 404 ? "not_found" : result.status === 503 ? "unavailable" : "invalid", result.message, result.fields ? { fields: result.fields } : {});
    // The email goes out after the customer has their answer; a failure is retried when the dealership next opens the app.
    if (!result.duplicate) after(() => deliverPendingLeadEmails(tenant.toLowerCase()).then(() => undefined, (error: unknown) => console.error(JSON.stringify({ event: "lead_email_failure", message: error instanceof Error ? error.message : "unknown" }))));
    return json({ ok: true, reference: result.reference, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: "website_enquiry_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "We could not send your enquiry just now. Please try again or call the dealership.");
  }
}
