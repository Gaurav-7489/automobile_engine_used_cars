import { problem } from "../api";
import { getPrincipal, hasRecentReauth } from "./auth";
import { sameOrigin } from "./csrf";
import { totpState } from "./identity";
import { legacyPasswordLogin } from "./legacy-auth";
import { isPlatformAdmin } from "./platform-admin";

export type AdminAccess =
  | { ok: true; userId: string; name: string; email: string; tenantId: string }
  | { ok: false; reason: "signed_out" | "not_admin" | "google_required" };

/**
 * Platform administration can see and change every dealership, so it requires: a valid session, an enabled administrator grant,
 * and a session that came through verified Google sign-in (the Google account's own protections, such as 2-Step Verification, apply).
 * Every change additionally needs a fresh Google confirmation (`reauth`), bound to this user and this session.
 *
 * While LEGACY_PASSWORD_LOGIN=enabled (migration and rollback only), a password session with authenticator-app two-factor also passes,
 * exactly as before.
 */
export async function adminAccess(): Promise<AdminAccess> {
  const current = await getPrincipal();
  if (!current) return { ok: false, reason: "signed_out" };
  if (!(await isPlatformAdmin(current.principal.userId))) return { ok: false, reason: "not_admin" };
  const google = current.session.amr === "google";
  const legacy = !google && legacyPasswordLogin() && (await totpState(current.principal.userId)).enabled;
  if (!google && !legacy) return { ok: false, reason: "google_required" };
  return { ok: true, userId: current.principal.userId, name: current.principal.name, email: current.principal.email, tenantId: current.principal.tenantId };
}

/** Gate for admin API routes. Changes also require a same-origin request and, when `reauth` is set, a recent step-up confirmation. */
export async function adminApi(request: Request | null, options: { reauth?: boolean } = {}) {
  if (request && !sameOrigin(request)) return { error: problem(403, "forbidden", "Request origin is not allowed.") };
  const access = await adminAccess();
  if (!access.ok) {
    if (access.reason === "signed_out") return { error: problem(401, "unauthenticated", "Sign in to continue.") };
    if (access.reason === "google_required") return { error: problem(403, "google_required", "Sign in with Google to use the admin console.") };
    return { error: problem(404, "not_found", "Not found.") };
  }
  if (options.reauth && !(await hasRecentReauth(access.userId))) return { error: problem(403, "reauth_required", "Confirm it's you with Google first.") };
  return { access };
}

/** Gate for admin reads that hold no dealership data (system health, build and test facts). */
export async function adminSystemApi() {
  const access = await adminAccess();
  if (access.ok) return { ok: true as const, twoFactor: true };
  if (access.reason === "google_required") return { ok: true as const, twoFactor: false };
  return { ok: false as const, error: access.reason === "signed_out" ? problem(401, "unauthenticated", "Sign in to continue.") : problem(404, "not_found", "Not found.") };
}
