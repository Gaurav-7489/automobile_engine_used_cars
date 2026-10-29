import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { redactFor } from "../../apps/intelligence/lib/server/redact";
import { principalSession } from "../../apps/intelligence/lib/server/auth";
import { migrationPool } from "../../packages/data/src/postgres";
import { pool } from "../../apps/intelligence/lib/server/db";

/** Times the full-workspace read and measures the JSON the browser receives. Run against an isolated database seeded by seed-synthetic.ts. */
const tenantId = process.argv[2];
if (!tenantId) throw new Error("usage: bench-state.ts <tenantId>");
const admin = migrationPool();
const locationIds = (await admin.query("SELECT id FROM locations WHERE tenant_id = $1", [tenantId])).rows.map((r) => String(r.id));
await admin.end();
const principal = { userId: "00000000-0000-4000-8000-000000000001", tenantId, name: "Bench", email: "bench@synthetic.invalid", role: "owner" as const, dealershipIds: [], locationIds };
const times: number[] = []; let bytes = 0; let counts = {};
for (let i = 0; i < 7; i++) {
  const t = performance.now();
  const state = await loadWorkspace(principal);
  times.push(performance.now() - t);
  if (i === 0) {
    const redacted = redactFor(state, principalSession(principal, 0, 0));
    bytes = Buffer.byteLength(JSON.stringify(redacted));
    counts = { vehicles: state.vehicles.length, leads: state.leads.length, sales: state.sales.length, events: state.events.length, alerts: state.alerts.length };
  }
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ tenantId, ...counts, readMs: { first: Math.round(times[0]), median: Math.round(times[3]), max: Math.round(times[6]) }, payloadKB: Math.round(bytes / 1024) }));
process.exit(0);
