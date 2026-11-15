import { signPayload, verifyPayload } from "../session";
import { plain } from "./db";
import type { GoogleIdentity } from "./google-oauth";

/**
 * Access requests from people who signed in with Google but have no access yet. Asking grants nothing: a VandLabs platform
 * administrator approves (creating the dealership with this Google account as owner) or declines.
 *
 * The request is bound to the Google identity that Google just verified: after a refused sign-in, the callback sets a signed,
 * 30-minute, httpOnly cookie with that subject and email, and only a request carrying it is accepted. Nobody can ask on behalf of
 * an email they did not just prove they control.
 */
export const ACCESS_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vl_access" : "vl_access";
export const ACCESS_TTL_SECONDS = 30 * 60;

export type AccessIdentity = { sub: string; email: string; name: string; purpose: "access-request"; exp: number };

export const newAccessCookie = (identity: GoogleIdentity) =>
  signPayload({ sub: identity.sub, email: identity.email, name: identity.name, purpose: "access-request", exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS } satisfies AccessIdentity);

export async function readAccessCookie(value: string | undefined): Promise<AccessIdentity | null> {
  const payload = await verifyPayload<AccessIdentity>(value);
  return payload && payload.purpose === "access-request" && typeof payload.sub === "string" && typeof payload.email === "string" ? payload : null;
}

export type AccessRequestInput = { name: string; businessName: string; dealershipName: string; phone: string; city: string; state: string; message: string };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Field messages are shown as they are on the request form. */
export function validateAccessRequest(raw: Record<string, unknown>): { input: AccessRequestInput | null; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const input = {
    name: text(raw.name, 120), businessName: text(raw.businessName, 120), dealershipName: text(raw.dealershipName, 120),
    phone: text(raw.phone, 20), city: text(raw.city, 80), state: text(raw.state, 80), message: text(raw.message, 600),
  };
  if (input.name.length < 2) fields.name = "Enter your name.";
  if (input.businessName.length < 2) fields.businessName = "Enter the registered business name.";
  if (input.dealershipName.length < 2) fields.dealershipName = "Enter the dealership name customers see.";
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13 || !/^\+?[\d\s-]+$/.test(input.phone)) fields.phone = "Enter a 10-digit mobile number.";
  if (input.city.length < 2) fields.city = "Enter the city.";
  if (input.state.length < 2) fields.state = "Enter the state.";
  return Object.keys(fields).length ? { input: null, fields } : { input, fields };
}

export async function submitAccessRequest(identity: Pick<AccessIdentity, "sub" | "email">, input: AccessRequestInput): Promise<"created" | "updated" | "has_account" | "declined_recently"> {
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_submit_access_request($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [identity.sub, identity.email, input.name, input.businessName, input.dealershipName, input.phone, input.city, input.state, input.message]))).rows[0] as { outcome: string };
  return row.outcome as "created" | "updated" | "has_account" | "declined_recently";
}

export type AccessRequestStatus = { status: "pending" | "approved" | "declined"; businessName: string; createdAt: string; decidedAt: string | null } | null;

export async function accessRequestStatus(sub: string): Promise<AccessRequestStatus> {
  const r = (await plain((c) => c.query("SELECT * FROM intelligence_access_request_status($1)", [sub]))).rows[0] as Record<string, unknown> | undefined;
  return r ? { status: r.status as "pending", businessName: String(r.business_name), createdAt: new Date(String(r.created_at)).toISOString(), decidedAt: r.decided_at ? new Date(String(r.decided_at)).toISOString() : null } : null;
}

export type AccessRequestView = { id: string; email: string; name: string; businessName: string; dealershipName: string; phone: string; city: string; state: string; message: string | null; status: string; createdAt: string; decidedAt: string | null; decisionNote: string | null; tenantId: string | null };

export async function listAccessRequests(adminId: string, status: "pending" | "approved" | "declined" | null): Promise<AccessRequestView[]> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_access_requests($1,$2)", [adminId, status]))).rows as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id), email: String(r.email), name: String(r.name), businessName: String(r.business_name), dealershipName: String(r.dealership_name), phone: String(r.phone),
    city: String(r.city), state: String(r.state), message: (r.message as string | null) ?? null, status: String(r.status), createdAt: new Date(String(r.created_at)).toISOString(),
    decidedAt: r.decided_at ? new Date(String(r.decided_at)).toISOString() : null, decisionNote: (r.decision_note as string | null) ?? null, tenantId: (r.tenant_id as string | null) ?? null,
  }));
}

/** Approve (returns the new workspace) or decline. Throws `not_pending` when someone already decided, `duplicate` for a taken business name. */
export async function decideAccessRequest(adminId: string, requestId: string, decision: { approve: boolean; note?: string; businessName?: string; dealershipName?: string }): Promise<{ tenantId: string | null }> {
  try {
    const row = (await plain((c) => c.query("SELECT intelligence_admin_decide_access_request($1,$2,$3,$4,$5,$6) AS tenant_id",
      [adminId, requestId, decision.approve, decision.note ?? "", decision.businessName ?? "", decision.dealershipName ?? ""]))).rows[0] as { tenant_id: string | null };
    return { tenantId: row.tenant_id };
  } catch (error) {
    const message = String((error as Error).message);
    if ((error as { code?: string }).code === "23505" || /duplicate_organization/.test(message)) throw new Error("duplicate");
    throw error;
  }
}
