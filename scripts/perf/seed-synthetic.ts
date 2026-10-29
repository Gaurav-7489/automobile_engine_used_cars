import { migrationPool } from "../../packages/data/src/postgres";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { seedSynthetic } from "./synthetic";

/**
 * SYNTHETIC DATA FOR ISOLATED TEST DATABASES ONLY. Creates one clearly labelled workspace with generated vehicles,
 * leads, tasks and sales so list/aggregate performance can be measured at realistic sizes. Refuses to run unless the
 * migration connection points at this machine, so it cannot be aimed at a hosted or production database.
 *
 *   MIGRATION_DATABASE_URL=postgresql://postgres@127.0.0.1:5544/vl DATABASE_TLS=off \
 *   node --import tsx scripts/perf/seed-synthetic.ts --vehicles 2000 --leads 6000 --sales 800 --label perf-2000
 */
const url = process.env.MIGRATION_DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("Refusing to seed synthetic data: MIGRATION_DATABASE_URL must point at localhost.");

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const vehicles = Number(arg("vehicles", "500")), leads = Number(arg("leads", String(vehicles * 3))), sales = Math.min(Number(arg("sales", String(Math.floor(vehicles / 5)))), vehicles, leads);
const label = arg("label", `perf-${vehicles}`);

const pool = migrationPool();
const client = await pool.connect();
try {
  const spec = { organization: `SYNTHETIC ${label}`, dealership: `Synthetic ${label}`, locations: [
    { name: "Synthetic North", city: "Kochi", state: "Kerala", phone: "+91 00000 00001" }, { name: "Synthetic South", city: "Thrissur", state: "Kerala", phone: "+91 00000 00002" }, { name: "Synthetic East", city: "Kozhikode", state: "Kerala", phone: "+91 00000 00003" },
  ], owner: { email: `${label}@synthetic.invalid`, name: "Synthetic Owner" } };
  const { tenantId } = await provisionWorkspace(client, spec);
  const ids = (await client.query("SELECT d.id AS dealership_id, array_agg(l.id ORDER BY l.name) AS locs FROM dealerships d JOIN locations l ON l.tenant_id = d.tenant_id AND l.dealership_id = d.id WHERE d.tenant_id = $1 GROUP BY d.id", [tenantId])).rows[0] as { dealership_id: string; locs: string[] };
  const t0 = Date.now();
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout = 0");
  await seedSynthetic(client, tenantId, ids, { vehicles, leads, sales });
  await client.query("COMMIT");
  await client.query("ANALYZE");
  const counts = (await client.query("SELECT (SELECT count(*) FROM vehicles WHERE tenant_id=$1) v, (SELECT count(*) FROM leads WHERE tenant_id=$1) l, (SELECT count(*) FROM sales WHERE tenant_id=$1) s, (SELECT count(*) FROM tasks WHERE tenant_id=$1) t", [tenantId])).rows[0];
  console.log(JSON.stringify({ label, tenantId, ...counts, seconds: (Date.now() - t0) / 1000 }));
} catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); await pool.end(); }
