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
};

export async function listWorkspaces(adminId: string): Promise<WorkspaceSummary[]> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_workspaces($1)", [adminId]))).rows as Row[];
  return rows.map((r) => ({
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
