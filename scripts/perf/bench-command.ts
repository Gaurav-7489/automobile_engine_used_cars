import { migrationPool } from "../../packages/data/src/postgres";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { executeCommands } from "../../apps/intelligence/lib/actions/registry";
import { persist, readState } from "../../apps/intelligence/lib/server/workspace-store";
import { enterLive } from "../../apps/intelligence/lib/server/workspace";

/** Phase timings of one changeStage command: full read, domain execution, persistence. Run against a seeded synthetic tenant. */
const tenantId = process.argv[2];
enterLive();
const admin = migrationPool();
const loc = (await admin.query("SELECT id FROM locations WHERE tenant_id = $1", [tenantId])).rows.map((r) => String(r.id));
const user = String((await admin.query("SELECT user_id FROM staff_members WHERE tenant_id = $1 LIMIT 1", [tenantId])).rows[0]?.user_id ?? "00000000-0000-4000-8000-000000000001");
await admin.end();
const principal = { userId: user, tenantId, name: "Bench", email: "b@x.invalid", role: "owner" as const, dealershipIds: [], locationIds: loc };
const actor = { sub: user, name: "Bench", role: "owner" as const, branchIds: loc };
await tenantTx(tenantId, async (c) => {
  let t = performance.now();
  const before = await readState(c, tenantId);
  const read = performance.now() - t; t = performance.now();
  const lead = before.leads.find((l) => l.stage === "New")!;
  const out = executeCommands(before, actor, [{ name: "changeStage", args: [lead.id, lead.version, "Contacted"] }], false);
  const exec = performance.now() - t; t = performance.now();
  if (!out.ok) throw new Error(out.message);
  const changedAlerts = out.state.alerts.filter((a) => JSON.stringify(before.alerts.find((b) => b.id === a.id)) !== JSON.stringify(a)).length;
  await persist(c, principal, before, out.state, new Date().toISOString());
  const persisted = performance.now() - t;
  console.log(JSON.stringify({ tenantId, vehicles: before.vehicles.length, leads: before.leads.length, alerts: before.alerts.length, changedAlerts, readMs: Math.round(read), executeMs: Math.round(exec), persistMs: Math.round(persisted) }));
  throw new Error("rollback");
}).catch((e) => { if (e.message !== "rollback") throw e; });
process.exit(0);
