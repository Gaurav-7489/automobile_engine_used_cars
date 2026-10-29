import { plain } from "./server/db";
import { clientKey, hitShared } from "./rate-limit";

export const CONSENT_VERSION = "consent-2026-10";

export type FormResult = { status: number; body: Record<string, unknown> };

/** Idempotent public form handling: the same Idempotency-Key always returns the same reference and creates one request. */
export async function handlePublicForm(request: Request, kind: "demo" | "access"): Promise<FormResult> {
  const limit = await hitShared(`${kind}:${clientKey(request)}`, 8, 10 * 60_000);
  if (!limit.allowed) return { status: 429, body: { error: { code: "rate_limited", message: `Too many requests. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`, retry_after: limit.retryAfter } } };
  const text = await request.text();
  if (text.length > 10_000) return { status: 413, body: { error: { code: "too_large", message: "Request is too large." } } };
  let input: Record<string, unknown>;
  try { input = JSON.parse(text) as Record<string, unknown>; } catch { return { status: 422, body: { error: { code: "invalid", message: "Send valid JSON." } } }; }
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string).trim() : "");
  const fields: Record<string, string> = {};
  if (str("name").length < 2) fields.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str("email"))) fields.email = "Enter a valid business email address.";
  else if (/@(gmail|yahoo|hotmail|outlook|rediffmail)\./i.test(str("email")) && kind === "demo") fields.email = "Use your business email address so we can match your dealership.";
  if (str("dealership").length < 2) fields.dealership = "Enter the dealership name.";
  if (str("city").length < 2) fields.city = "Enter the city.";
  if (kind === "demo" && !/^\+?[\d\s-]{8,15}$/.test(str("phone"))) fields.phone = "Enter a phone number we can call, for example +91 90000 00000.";
  if (input.consent !== true) fields.consent = "Please confirm that we may contact you about this request.";
  if (Object.keys(fields).length) return { status: 422, body: { error: { code: "invalid", message: "Fix the highlighted fields to continue.", fields } } };
  const key = request.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 80) return { status: 422, body: { error: { code: "invalid", message: "Missing idempotency key." } } };
  const reference = `${kind === "demo" ? "DR" : "AR"}-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  // Consent is stored separately from marketing permission. The record is saved in the database; a repeated Idempotency-Key returns the same reference.
  const record = {
    kind, receivedAt: new Date().toISOString(), consentVersion: CONSENT_VERSION, serviceContactConsent: true, marketingConsent: input.marketing === true,
    name: str("name"), email: str("email"), dealership: str("dealership"), city: str("city"), phone: str("phone"), plan: str("plan") || null,
  };
  try {
    const saved = (await plain((c) => c.query("SELECT intelligence_submit_enquiry($1, $2, $3, $4) AS reference", [`${kind}:${key}`, kind, reference, JSON.stringify(record)]))).rows[0]?.reference as string | undefined;
    if (!saved) throw new Error("not saved");
    return { status: saved === reference ? 201 : 200, body: { ok: true, reference: saved, ...(saved === reference ? {} : { duplicate: true }) } };
  } catch {
    return { status: 502, body: { error: { code: "delivery_failed", message: "We could not record your request. Your details are kept. Try again." } } };
  }
}
