import { problem } from "../api";
import { getPrincipal, hasRecentReauth } from "./auth";
import { sameOrigin } from "./csrf";
import { totpState } from "./identity";
import { isPlatformAdmin } from "./platform-admin";

export type AdminAccess =
  | { ok: true; userId: string; name: string; email: string; tenantId: string }
  | { ok: false; reason: "signed_out" | "not_admin" | "two_factor_required" };

/**
 * Platform administration requires a valid session, an enabled administrator grant and two-factor login switched on,
 * because these accounts can see and change every dealership.
 */
export async function adminAccess(): Promise<AdminAccess> {
  const current = await getPrincipal();
  if (!current) return { ok: false, reason: "signed_out" };
  if (!(await isPlatformAdmin(current.principal.userId))) return { ok: false, reason: "not_admin" };
  if (!(await totpState(current.principal.userId)).enabled) return { ok: false, reason: "two_factor_required" };
  return { ok: true, userId: current.principal.userId, name: current.principal.name, email: current.principal.email, tenantId: current.principal.tenantId };
}

/** Gate for admin API routes. Changes also require a same-origin request and, when `reauth` is set, a recent password confirmation. */
export async function adminApi(request: Request | null, options: { reauth?: boolean } = {}) {
  if (request && !sameOrigin(request)) return { error: problem(403, "forbidden", "Request origin is not allowed.") };
  const access = await adminAccess();
  if (!access.ok) {
    if (access.reason === "signed_out") return { error: problem(401, "unauthenticated", "Sign in to continue.") };
    if (access.reason === "two_factor_required") return { error: problem(403, "two_factor_required", "Turn on two-factor login to use the admin console.") };
    return { error: problem(404, "not_found", "Not found.") };
  }
  if (options.reauth && !(await hasRecentReauth(access.userId))) return { error: problem(403, "reauth_required", "Confirm your password first.") };
  return { access };
}
