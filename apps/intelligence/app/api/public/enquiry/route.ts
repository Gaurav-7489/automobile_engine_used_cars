import { json, problem, rateLimited } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/server/csrf";
import { submitWebsiteEnquiry, validateEnquiry } from "@/lib/server/website-enquiry";

export const dynamic = "force-dynamic";

/** A customer's enquiry from a public vehicle page. Public, so it is same-origin only, rate limited per visitor and per dealership, and size limited. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const visitor = await hitShared(`enquiry:${clientKey(request)}`, 6, 10 * 60_000);
  if (!visitor.allowed) return rateLimited("Too many enquiries from this device. Please call the dealership or try again later.", visitor.retryAfter);
  const text = await request.text();
  if (text.length > 4_000) return problem(413, "too_large", "That message is too long.");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text) as Record<string, unknown>; } catch { return problem(422, "invalid", "Send valid JSON."); }
  // Hidden field people never see: anything in it is an automated submission. Answer as if accepted.
  if (typeof raw.website === "string" && raw.website.trim()) return json({ ok: true, reference: "received" }, { status: 201 });
  const tenant = typeof raw.tenant === "string" ? raw.tenant : "";
  const stock = typeof raw.stock === "string" ? raw.stock : "";
  const dealership = await hitShared(`enquiry-tenant:${tenant}`, 120, 60 * 60_000);
  if (!dealership.allowed) return rateLimited("The dealership is receiving a lot of enquiries. Please call them directly.", dealership.retryAfter);
  const { input, fields } = validateEnquiry(raw);
  if (!input) return problem(422, "invalid", "Please check the highlighted details.", { fields });
  try {
    const result = await submitWebsiteEnquiry(tenant, stock, input);
    if (!result.ok) return problem(result.status, result.status === 404 ? "not_found" : result.status === 503 ? "unavailable" : "invalid", result.message, result.fields ? { fields: result.fields } : {});
    return json({ ok: true, reference: result.reference, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    console.error(JSON.stringify({ event: "website_enquiry_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "We could not send your enquiry just now. Please try again or call the dealership.");
  }
}
