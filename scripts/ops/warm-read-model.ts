import { migrationPool } from "../../packages/data/src/postgres";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { syncReadModel } from "../../apps/intelligence/lib/server/read-model";

/**
 * Builds (or refreshes) the read model for every dealership, one at a time, so the first person to open a large dealership does not wait for the backfill.
 * Safe to re-run: unchanged rows are not rewritten. Run before cutover and after restoring a database.
 *   MIGRATION_DATABASE_URL=... DATABASE_URL=... pnpm exec tsx scripts/ops/warm-read-model.ts [--force]
 * --force rebuilds every row (use after changing how records are derived).
 */
const force = process.argv.includes("--force");
const admin = migrationPool();
const tenants = (await admin.query("SELECT id, name FROM organizations ORDER BY name")).rows as { id: string; name: string }[];
await admin.end();
for (const t of tenants) {
  const started = Date.now();
  try {
    await tenantTx(t.id, (c) => syncReadModel(c, t.id, { force }));
    console.log(JSON.stringify({ tenant: t.id, name: t.name, ms: Date.now() - started, ok: true }));
  } catch (error) {
    console.log(JSON.stringify({ tenant: t.id, name: t.name, ok: false, error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  }
}
