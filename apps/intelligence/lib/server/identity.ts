import type { Role } from "../domain";
import { hashPassword, hashToken, newToken, passwordProblem, burnPasswordCheck, verifyPassword } from "./password";
import { isUuid, plain, tenantTx, type SqlClient } from "./db";
import { newTotpSecret, verifyTotp } from "./totp";

/** The shared platform's role vocabulary. Intelligence's inventory and finance roles are stored as an overlay. */
const TO_PLATFORM: Record<Role, "owner" | "manager" | "sales" | "acquisition" | "marketing" | "viewer"> = {
  owner: "owner", manager: "manager", sales: "sales", inventory: "acquisition", marketing: "marketing", finance: "viewer", viewer: "viewer",
};
const FROM_PLATFORM: Record<string, Role> = { owner: "owner", manager: "manager", sales: "sales", acquisition: "inventory", marketing: "marketing", viewer: "viewer" };
const INTELLIGENCE_ROLES = new Set<Role>(["owner", "manager", "inventory", "marketing", "sales", "finance", "viewer"]);

export const toPlatformRole = (role: Role) => TO_PLATFORM[role];

export type Principal = {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  dealershipIds: string[];
  locationIds: string[];
};

type StaffPayload = {
  userId: string; tenantId: string; displayName: string; role: string; intelligenceRole?: string; email?: string;
  dealershipIds: string[]; locationIds: string[]; enabled: boolean; version: number; updatedAt: string; updatedBy: string;
};

export function roleOf(payload: Pick<StaffPayload, "role" | "intelligenceRole">): Role | null {
  if (payload.intelligenceRole && INTELLIGENCE_ROLES.has(payload.intelligenceRole as Role)) {
    // The overlay may only narrow within the platform role it was stored with.
    return TO_PLATFORM[payload.intelligenceRole as Role] === payload.role ? (payload.intelligenceRole as Role) : null;
  }
  return FROM_PLATFORM[payload.role] ?? null;
}

export type SignIn =
  | { ok: true; userId: string; name: string; tenantId: string }
  | { ok: false; code: "invalid" | "locked" | "no_access" | "mfa_required" | "mfa_invalid" };

const emailOk = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 254;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => emailOk(normalizeEmail(email));

export async function signIn(emailInput: string, password: string, code?: string): Promise<SignIn> {
  const email = normalizeEmail(emailInput);
  if (!emailOk(email) || !password || password.length > 200) { await burnPasswordCheck(password || "x"); return { ok: false, code: "invalid" }; }
  const user = (await plain((c) => c.query("SELECT * FROM intelligence_login_lookup($1)", [email]))).rows[0] as
    { id: string; display_name: string; password_hash: string; disabled: boolean; locked_until: string | null; totp_enabled: boolean; totp_secret: string | null } | undefined;
  if (!user) { await burnPasswordCheck(password); return { ok: false, code: "invalid" }; }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) { await burnPasswordCheck(password); return { ok: false, code: "locked" }; }
  const valid = await verifyPassword(password, user.password_hash);
  if (valid && !user.disabled && user.totp_enabled && user.totp_secret) {
    // The password is right; the second factor decides. A wrong code counts as a failed attempt toward the lockout.
    if (!code) return { ok: false, code: "mfa_required" };
    const second = verifyTotp(user.totp_secret, code.trim());
    await plain((c) => c.query("SELECT intelligence_record_login($1, $2)", [user.id, second]));
    if (!second) return { ok: false, code: "mfa_invalid" };
  } else {
    await plain((c) => c.query("SELECT intelligence_record_login($1, $2)", [user.id, valid && !user.disabled]));
  }
  if (!valid || user.disabled) return { ok: false, code: "invalid" };
  const memberships = (await plain((c) => c.query("SELECT * FROM intelligence_memberships($1)", [user.id]))).rows as { tenant_id: string; payload: StaffPayload }[];
  const usable = memberships.filter((m) => roleOf(m.payload) !== null);
  if (!usable.length) return { ok: false, code: "no_access" };
  return { ok: true, userId: user.id, name: user.display_name, tenantId: usable[0].tenant_id };
}

export type Reauth = { ok: true } | { ok: false; code: "invalid" | "locked" };

/**
 * Password confirmation for a user who is already signed in. It checks the supplied password against that one user's
 * stored hash and nothing else: no workspace is selected, the sign-in lockout is untouched, and a disabled account is
 * indistinguishable from a wrong password. Repeated wrong passwords pause confirmation (not sign-in) for ten minutes.
 */
export async function reauthenticate(userId: string, password: string): Promise<Reauth> {
  if (!isUuid(userId) || !password || password.length > 200) { await burnPasswordCheck(password || "x"); return { ok: false, code: "invalid" }; }
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_reauth_state($1)", [userId]))).rows[0] as { password_hash: string; disabled: boolean; locked: boolean } | undefined;
  if (!row) { await burnPasswordCheck(password); return { ok: false, code: "invalid" }; }
  if (row.locked) { await burnPasswordCheck(password); return { ok: false, code: "locked" }; }
  const valid = await verifyPassword(password, row.password_hash);
  if (row.disabled) return { ok: false, code: "invalid" };
  await plain((c) => c.query("SELECT intelligence_record_reauth($1, $2)", [userId, valid]));
  return valid ? { ok: true } : { ok: false, code: "invalid" };
}

/** Validates a session against the database on every request, so revocation and role changes apply immediately. */
export async function resolvePrincipal(userId: string, tenantId: string, issuedAtSeconds: number): Promise<Principal | null> {
  if (!isUuid(userId) || !isUuid(tenantId)) return null;
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_resolve_session($1, $2, to_timestamp($3))", [userId, tenantId, issuedAtSeconds]))).rows[0] as
    { display_name: string; email: string; payload: StaffPayload } | undefined;
  if (!row) return null;
  const role = roleOf(row.payload);
  if (!role || row.payload.userId !== userId || row.payload.tenantId !== tenantId) return null;
  return { userId, tenantId, name: row.display_name, email: row.email, role, dealershipIds: row.payload.dealershipIds, locationIds: row.payload.locationIds };
}

export async function revokeSessions(userId: string): Promise<void> {
  await plain((c) => c.query("SELECT intelligence_revoke_sessions($1)", [userId]));
}

const INVITE_TTL_MINUTES = 7 * 24 * 60;
const RESET_TTL_MINUTES = 60;

export type Issued = { ok: true; token: string; expiresAt: string } | { ok: false; message: string };

/** Creates a one-time invitation. The raw token is returned once to the inviting owner and never stored. */
export async function issueInvite(principal: Principal, input: InviteInput): Promise<Issued> {
  const check = checkInvite(principal, input);
  if (check) return check;
  return tenantTx(principal.tenantId, (c) => insertInvite(c, principal, input));
}

/** Same as issueInvite, inside an already-open tenant transaction. */
export async function issueInviteWith(c: SqlClient, principal: Principal, input: InviteInput): Promise<Issued> {
  const check = checkInvite(principal, input);
  return check ?? insertInvite(c, principal, input);
}

export type InviteInput = { email: string; name: string; role: Role; locationIds: string[]; dealershipIds: string[] };

function checkInvite(principal: Principal, input: InviteInput): Issued | null {
  const email = normalizeEmail(input.email);
  if (!emailOk(email)) return { ok: false, message: "Enter a valid business email." };
  if (!input.locationIds.length || !input.locationIds.every((id) => principal.locationIds.includes(id))) return { ok: false, message: "Choose branches within your own access." };
  if (input.role === "owner" && principal.role !== "owner") return { ok: false, message: "Only an owner can invite another owner." };
  return null;
}

async function insertInvite(c: SqlClient, principal: Principal, input: InviteInput): Promise<Issued> {
  const email = normalizeEmail(input.email);
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MINUTES * 60_000).toISOString();
  // A newer invitation replaces any unused one for the same email.
  await c.query("UPDATE intelligence_tokens SET used_at = now() WHERE tenant_id = $1 AND lower(email) = $2 AND kind = 'invite' AND used_at IS NULL", [principal.tenantId, email]);
  await c.query(
    `INSERT INTO intelligence_tokens(token_hash, kind, tenant_id, email, role, intelligence_role, dealership_ids, location_ids, display_name, created_by, expires_at)
     VALUES($1,'invite',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [hash, principal.tenantId, email, toPlatformRole(input.role), input.role, JSON.stringify(input.dealershipIds), JSON.stringify(input.locationIds), input.name.trim() || email, principal.userId, expiresAt],
  );
  return { ok: true, token, expiresAt };
}

export async function issueReset(principal: Principal, email: string): Promise<Issued> {
  const target = normalizeEmail(email);
  const userId = (await plain((c) => c.query("SELECT intelligence_user_id_for_email($1, $2) AS id", [principal.tenantId, target]))).rows[0]?.id as string | null | undefined;
  if (!userId) return { ok: false, message: "No member of this workspace uses that email." };
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString();
  await tenantTx(principal.tenantId, (c) => c.query(
    "INSERT INTO intelligence_tokens(token_hash, kind, tenant_id, email, user_id, created_by, expires_at) VALUES($1,'reset',$2,$3,$4,$5,$6)",
    [hash, principal.tenantId, target, userId, principal.userId, expiresAt],
  ));
  return { ok: true, token, expiresAt };
}

export type Redeemed = { ok: true; outcome: "account_created" | "membership_added" | "password_reset"; userId: string; tenantId: string } | { ok: false; message: string };

export async function tokenInfo(token: string): Promise<{ kind: "invite" | "reset"; email: string; name: string } | null> {
  if (!token || token.length > 200) return null;
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_token_info($1)", [hashToken(token)]))).rows[0] as { kind: "invite" | "reset"; email: string; display_name: string | null } | undefined;
  return row ? { kind: row.kind, email: row.email, name: row.display_name ?? "" } : null;
}

const INVALID = "This link is not valid or has expired. Ask your administrator for a new one.";

export async function redeemToken(token: string, password: string): Promise<Redeemed> {
  const info = await tokenInfo(token);
  if (!info) return { ok: false, message: INVALID };
  const problem = passwordProblem(password, info.email);
  if (problem) return { ok: false, message: problem };
  const row = (await plain(async (c) => c.query("SELECT * FROM intelligence_redeem_token($1, $2)", [hashToken(token), await hashPassword(password)]))).rows[0] as
    { out_outcome: string; out_user_id: string | null; out_tenant_id: string | null } | undefined;
  if (!row || row.out_outcome === "invalid" || !row.out_user_id || !row.out_tenant_id) return { ok: false, message: INVALID };
  return { ok: true, outcome: row.out_outcome as "account_created" | "membership_added" | "password_reset", userId: row.out_user_id, tenantId: row.out_tenant_id };
}

/* Two-factor authentication ------------------------------------------------- */

export async function totpState(userId: string): Promise<{ enabled: boolean; pending: string | null }> {
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_totp_state($1)", [userId]))).rows[0] as { totp_enabled: boolean; totp_secret: string | null } | undefined;
  return { enabled: Boolean(row?.totp_enabled), pending: row && !row.totp_enabled ? row.totp_secret : null };
}

/** Starts enrolment with a fresh secret. Refused while two-factor is already on. */
export async function beginTotp(userId: string): Promise<string | null> {
  if ((await totpState(userId)).enabled) return null;
  const secret = newTotpSecret();
  await plain((c) => c.query("SELECT intelligence_set_totp($1, $2, false)", [userId, secret]));
  return secret;
}

export async function confirmTotp(userId: string, code: string): Promise<boolean> {
  const state = await totpState(userId);
  if (state.enabled || !state.pending || !verifyTotp(state.pending, code)) return false;
  await plain((c) => c.query("SELECT intelligence_set_totp($1, $2, true)", [userId, state.pending]));
  return true;
}

export async function disableTotp(userId: string, code: string): Promise<boolean> {
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_totp_state($1)", [userId]))).rows[0] as { totp_enabled: boolean; totp_secret: string | null } | undefined;
  if (!row?.totp_enabled || !row.totp_secret || !verifyTotp(row.totp_secret, code)) return false;
  await plain((c) => c.query("SELECT intelligence_set_totp($1, NULL, false)", [userId]));
  return true;
}
