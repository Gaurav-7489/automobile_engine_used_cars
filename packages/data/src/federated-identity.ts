import type { SqlPool } from "./postgres";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function scalar(pool: SqlPool, sql: string, values: unknown[]): Promise<string | null> {
  const client = await pool.connect();
  try {
    const value = Object.values((await client.query(sql, values)).rows[0] ?? {})[0];
    return typeof value === "string" && uuidPattern.test(value) ? value : null;
  } finally {
    client.release();
  }
}

/**
 * Links a verified federated identity to the one existing staff account that owns the email, or returns
 * the account it is already linked to. Callers must have confirmed the provider's `email_verified` claim.
 * Never creates an account: unknown emails return null.
 */
export function resolveFederatedUser(pool: SqlPool, subject: string, verifiedEmail: string): Promise<string | null> {
  return scalar(pool, "SELECT identity_resolve_federated($1, $2)", [subject, verifiedEmail]);
}

/** Canonical staff user id for an already-linked subject, or null. */
export function linkedStaffUser(pool: SqlPool, subject: string): Promise<string | null> {
  return scalar(pool, "SELECT identity_linked_user($1)", [subject]);
}
