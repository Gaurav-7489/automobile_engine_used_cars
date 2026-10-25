import { migrationPool } from "../../packages/data/src/postgres";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";

/**
 * Administrator-only. Creates a dealership workspace and a one-time owner setup link on the migration connection.
 *
 *   MIGRATION_DATABASE_URL=... APP_ORIGIN=https://intelligence.example.com \
 *   node --import tsx scripts/intelligence/provision-workspace.ts \
 *     --organization "Name Pvt Ltd" --dealership "Name Motors" \
 *     --location "Kochi Main|Kochi|Kerala|+91 00000 00000" [--location ...] \
 *     --owner-email owner@example.com --owner-name "Owner Name"
 *
 * The link is printed once, to this terminal only. It is not stored anywhere and works a single time.
 */
function args(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || value === undefined) throw new Error(`Missing value for ${argv[i]}`);
    (out[key] ??= []).push(value);
  }
  return out;
}

const a = args();
const one = (key: string) => {
  const value = a[key]?.[0];
  if (!value) throw new Error(`--${key} is required`);
  return value;
};
const origin = process.env.APP_ORIGIN?.replace(/\/$/, "");
if (!origin) throw new Error("Set APP_ORIGIN to the public https origin of the application.");

const locations = (a.location ?? []).map((raw) => {
  const [name, city, state, phone] = raw.split("|").map((v) => v.trim());
  if (!name || !city || !state || !phone) throw new Error(`--location must be "name|city|state|phone", got: ${raw}`);
  return { name, city, state, phone };
});

const pool = migrationPool();
const client = await pool.connect();
try {
  const result = await provisionWorkspace(client, {
    organization: one("organization"), dealership: one("dealership"), locations,
    owner: { email: one("owner-email"), name: one("owner-name") },
  });
  console.log(`Workspace created. Tenant ${result.tenantId}; ${result.locationIds.length} location(s).`);
  console.log(`Owner setup link (shown once, expires ${result.ownerTokenExpiresAt}):`);
  console.log(`${origin}/intelligence/join/${result.ownerToken}`);
} finally {
  client.release();
  await pool.end();
}
