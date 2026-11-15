import { plain } from "./db";
import { newToken } from "./password";

/**
 * VandLabs platform administration. Every call goes through a SECURITY DEFINER function that re-checks the
 * caller is an enabled platform administrator, so the runtime role never reads other tenants directly.
 */

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const row = (await plain((c) => c.query("SELECT intelligence_is_platform_admin($1) AS ok", [userId]))).rows[0] as Row | undefined;
  return row?.ok === true;
}

export type WorkspaceSummary = {
  tenantId: string; organization: string; dealership: string; createdAt: string; locations: number; vehicles: number; published: number;
  leads: number; members: number; owners: string; pendingInvites: number;
  /** The Google account assigned as owner that has not signed in yet. */
  pendingOwner?: string;
};

export async function listWorkspaces(adminId: string): Promise<WorkspaceSummary[]> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_workspaces($1)", [adminId]))).rows as Row[];
  const pending = await pendingOwners(adminId);
  return rows.map((r) => ({
    pendingOwner: pending.get(String(r.tenant_id)),
    tenantId: String(r.tenant_id), organization: String(r.organization), dealership: String(r.dealership ?? "Not recorded"), createdAt: new Date(String(r.created_at)).toISOString(),
    locations: num(r.locations), vehicles: num(r.vehicles), published: num(r.available), leads: num(r.leads), members: num(r.members), owners: String(r.owners ?? ""), pendingInvites: num(r.pending_invites),
  }));
}

export type MemberSummary = { userId: string; email: string; name: string; role: string; enabled: boolean; suspended: boolean; twoFactor: boolean; platformAdmin: boolean; createdAt: string };

export async function listMembers(adminId: string, tenantId: string): Promise<MemberSummary[]> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_members($1, $2)", [adminId, tenantId]))).rows as Row[];
  return rows.map((r) => ({
    userId: String(r.user_id), email: String(r.email), name: String(r.display_name), role: String(r.role ?? "viewer"), enabled: r.enabled === true, suspended: r.disabled === true,
    twoFactor: r.totp_enabled === true, platformAdmin: r.platform_admin === true, createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

export async function setSuspended(adminId: string, userId: string, suspended: boolean, reason: string): Promise<boolean> {
  const row = (await plain((c) => c.query("SELECT intelligence_admin_set_disabled($1, $2, $3, $4) AS ok", [adminId, userId, suspended, reason]))).rows[0] as Row | undefined;
  return row?.ok === true;
}

export type NewWorkspace = {
  organization: string; dealership: string; locations: { name: string; city: string; state: string; phone: string }[]; ownerEmail: string; ownerName: string;
};

const INVITE_HOURS = 72;

export function validateWorkspace(input: Partial<NewWorkspace>): Record<string, string> {
  const fields: Record<string, string> = {};
  const text = (v: unknown, min = 2, max = 120) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
  if (!text(input.organization)) fields.organization = "Enter the registered business name.";
  if (!text(input.dealership)) fields.dealership = "Enter the dealership name customers see.";
  if (!text(input.ownerName)) fields.ownerName = "Enter the owner's name.";
  if (typeof input.ownerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.ownerEmail.trim())) fields.ownerEmail = "Enter the owner's email address.";
  const locations = Array.isArray(input.locations) ? input.locations : [];
  if (!locations.length || locations.length > 20) fields.locations = "Add between 1 and 20 branches.";
  locations.forEach((l, i) => {
    if (!text(l?.name) || !text(l?.city) || !text(l?.state)) fields[`locations.${i}`] = "Each branch needs a name, city and state.";
    else if (/^not (set|recorded)$/i.test(l.city.trim()) || /^not (set|recorded)$/i.test(l.state.trim())) fields[`locations.${i}`] = "Enter the real city and state.";
  });
  return fields;
}

/** Creates the workspace and returns a one-time owner setup token. The token is shown once and only its hash is stored. */
export async function createWorkspace(adminId: string, input: NewWorkspace): Promise<{ ok: true; tenantId: string; token: string; expiresAt: string } | { ok: false; code: "duplicate" }> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600_000).toISOString();
  const locations = input.locations.map((l) => ({ name: l.name.trim(), city: l.city.trim(), state: l.state.trim(), phone: l.phone?.trim() ?? "" }));
  try {
    const row = (await plain((c) => c.query("SELECT intelligence_admin_provision($1,$2,$3,$4::jsonb,$5,$6,$7,$8) AS tenant_id",
      [adminId, input.organization.trim(), input.dealership.trim(), JSON.stringify(locations), input.ownerEmail.trim().toLowerCase(), input.ownerName.trim(), hash, expiresAt]))).rows[0] as Row;
    return { ok: true, tenantId: String(row.tenant_id), token, expiresAt };
  } catch (error) {
    if ((error as { code?: string }).code === "23505" || /duplicate_organization/.test(String((error as Error).message))) return { ok: false, code: "duplicate" };
    throw error;
  }
}

export async function reissueOwnerInvite(adminId: string, tenantId: string, ownerEmail: string, ownerName: string): Promise<{ token: string; expiresAt: string } | null> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600_000).toISOString();
  const row = (await plain((c) => c.query("SELECT intelligence_admin_reissue_owner_invite($1,$2,$3,$4,$5,$6) AS ok", [adminId, tenantId, ownerEmail.trim().toLowerCase(), ownerName.trim(), hash, expiresAt]))).rows[0] as Row | undefined;
  return row?.ok === true ? { token, expiresAt } : null;
}

/* Google-only sign-in (migration 0024) ------------------------------------------------------------------------------------------ */

/**
 * Creates the dealership workspace and assigns its owner's Google account. Nothing is sent or shown: the owner opens the application,
 * chooses Continue with Google with that account, and the first verified sign-in activates the owner identity, once.
 */
export async function createWorkspaceForGoogle(adminId: string, input: NewWorkspace): Promise<{ ok: true; tenantId: string } | { ok: false; code: "duplicate" }> {
  const locations = input.locations.map((l) => ({ name: l.name.trim(), city: l.city.trim(), state: l.state.trim(), phone: l.phone?.trim() ?? "" }));
  try {
    const row = (await plain((c) => c.query("SELECT intelligence_admin_provision_google($1,$2,$3,$4::jsonb,$5,$6) AS tenant_id",
      [adminId, input.organization.trim(), input.dealership.trim(), JSON.stringify(locations), input.ownerEmail.trim().toLowerCase(), input.ownerName.trim()]))).rows[0] as Row;
    return { ok: true, tenantId: String(row.tenant_id) };
  } catch (error) {
    if ((error as { code?: string }).code === "23505" || /duplicate_organization/.test(String((error as Error).message))) return { ok: false, code: "duplicate" };
    throw error;
  }
}

/** Changes the assigned owner Google account while nobody has signed in to the workspace. */
export async function assignOwner(adminId: string, tenantId: string, ownerEmail: string, ownerName: string): Promise<boolean> {
  const row = (await plain((c) => c.query("SELECT intelligence_admin_assign_owner($1,$2,$3,$4) AS ok", [adminId, tenantId, ownerEmail.trim().toLowerCase(), ownerName.trim()]))).rows[0] as Row | undefined;
  return row?.ok === true;
}

export async function pendingOwners(adminId: string): Promise<Map<string, string>> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_pending_owners($1)", [adminId]))).rows as Row[];
  return new Map(rows.map((r) => [String(r.tenant_id), String(r.email)]));
}

export type WebsiteKeyView = { id: string; site: string; prefix: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; webhooks: boolean };
const isoOrNull = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

export async function websiteKeys(adminId: string, tenantId: string): Promise<WebsiteKeyView[]> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_website_keys($1,$2)", [adminId, tenantId]))).rows as Row[];
  return rows.map((r) => ({ id: String(r.id), site: String(r.name).replace(/^Website: /, ""), prefix: `vl_${String(r.prefix)}`, createdBy: String(r.created_by), createdAt: isoOrNull(r.created_at)!, expiresAt: isoOrNull(r.expires_at)!, revokedAt: isoOrNull(r.revoked_at), lastUsedAt: isoOrNull(r.last_used_at), webhooks: Boolean(r.site_origin) }));
}

/**
 * Links a dealership website: issues a website-scope key (shown once) that the website's own deployment uses as VANDLABS_API_KEY.
 * Only its SHA-256 is stored. Linking the same website again replaces its previous key.
 */
export async function linkWebsite(adminId: string, tenantId: string, site: { host: string; origin: string | null }, days = 365): Promise<{ key: string; id: string; expiresAt: string }> {
  const { randomBytes, createHash } = await import("node:crypto");
  const prefix = randomBytes(9).toString("base64url");
  const key = `vl_${prefix}_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const row = (await plain((c) => c.query("SELECT intelligence_admin_create_website_key($1,$2,$3,$4,$5,$6,$7) AS id",
    [adminId, tenantId, site.host, site.origin, prefix, createHash("sha256").update(key).digest("hex"), expiresAt]))).rows[0] as Row;
  return { key, id: String(row.id), expiresAt };
}

export async function unlinkWebsite(adminId: string, tenantId: string, keyId: string): Promise<boolean> {
  const row = (await plain((c) => c.query("SELECT intelligence_admin_revoke_website_key($1,$2,$3) AS ok", [adminId, tenantId, keyId]))).rows[0] as Row | undefined;
  return row?.ok === true;
}
