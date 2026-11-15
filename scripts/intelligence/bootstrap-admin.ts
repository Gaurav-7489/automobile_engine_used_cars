import { migrationPool } from "../../packages/data/src/postgres";

/**
 * One-time VandLabs platform administrator approval, run on the database OWNER connection (the application cannot do this):
 *
 *   MIGRATION_DATABASE_URL=... node --import tsx scripts/intelligence/bootstrap-admin.ts --email vandlabsstudio@gmail.com --name "VandLabs Studio" --by "<your name>"
 *
 * It records an approval. Nothing is granted yet: the first sign-in with Continue with Google, by the Google account whose
 * VERIFIED email is this address, binds that account's stable id, grants platform administration and lands on /admin.
 * The approval is used once. Running it again while it is pending, or after the administrator is bound, changes nothing.
 */
function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`--${name} is required`);
  return v;
}

const email = arg("email").trim().toLowerCase();
const name = arg("name");
const by = arg("by");
const pool = migrationPool();
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const row = (await client.query("SELECT intelligence_bootstrap_platform_admin($1, $2, $3) AS outcome", [email, name, by])).rows[0] as { outcome: string };
  await client.query("COMMIT");
  const text: Record<string, string> = {
    approved_new: `Approved. Sign in with Google as ${email} to finish; you will land on /admin.`,
    approved_existing: `Approved for the existing account ${email}. Its next Google sign-in binds the Google account and opens /admin.`,
    already_pending: `An approval for ${email} is already waiting for its first Google sign-in. Nothing changed.`,
    already_admin: `${email} is already a platform administrator bound to a Google account. Nothing changed.`,
  };
  console.log(text[row.outcome] ?? row.outcome);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
