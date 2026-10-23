import { randomUUID } from "node:crypto";
import type { SqlClient } from "./db";
import { newToken } from "./password";

export type WorkspaceSpec = {
  organization: string;
  dealership: string;
  brandName?: string;
  locations: { name: string; city: string; state: string; phone: string }[];
  owner: { email: string; name: string };
};

export type Provisioned = { tenantId: string; dealershipId: string; locationIds: string[]; ownerToken: string; ownerTokenExpiresAt: string };

/**
 * Administrator-only: runs on the migration/admin connection, never from the web application.
 * Creates the dealership hierarchy and a one-time owner setup link. The owner chooses their own password.
 * Refuses to touch an organization that already exists.
 */
export async function provisionWorkspace(client: SqlClient, spec: WorkspaceSpec): Promise<Provisioned> {
  const email = spec.owner.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Owner email is not valid.");
  if (!spec.locations.length) throw new Error("At least one location is required.");
  const tenantId = randomUUID();
  const dealershipId = randomUUID();
  const locationIds = spec.locations.map(() => randomUUID());
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + 72 * 3600_000).toISOString();
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["intelligence:provision:" + spec.organization.toLowerCase()]);
    if ((await client.query("SELECT 1 FROM organizations WHERE lower(name) = lower($1)", [spec.organization])).rows.length) throw new Error("An organization with this name already exists; nothing was changed.");
    await client.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,$2)", [tenantId, spec.organization]);
    await client.query("INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES($1,$2,$2,$3,$4)", [dealershipId, tenantId, spec.dealership, spec.brandName ?? spec.dealership]);
    for (const [i, l] of spec.locations.entries()) {
      await client.query("INSERT INTO locations(id,tenant_id,dealership_id,name,city,state,phone) VALUES($1,$2,$3,$4,$5,$6,$7)", [locationIds[i], tenantId, dealershipId, l.name, l.city, l.state, l.phone]);
    }
    await client.query(
      `INSERT INTO intelligence_tokens(token_hash,kind,tenant_id,email,role,intelligence_role,dealership_ids,location_ids,display_name,created_by,expires_at)
       VALUES($1,'invite',$2,$3,'owner','owner',$4,$5,$6,'platform-provisioning',$7)`,
      [hash, tenantId, email, JSON.stringify([dealershipId]), JSON.stringify(locationIds), spec.owner.name.trim() || email, expiresAt],
    );
    await client.query(
      "INSERT INTO platform_audit(id,tenant_id,actor,action,subject,payload) VALUES($1,$2,'platform-provisioning','workspace.provisioned',$3,$4)",
      [randomUUID(), tenantId, tenantId, JSON.stringify({ organization: spec.organization, locations: locationIds.length, ownerEmail: email })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return { tenantId, dealershipId, locationIds, ownerToken: token, ownerTokenExpiresAt: expiresAt };
}
