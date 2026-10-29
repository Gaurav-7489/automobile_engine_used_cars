import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { SqlPool } from "../../apps/intelligence/lib/server/db";
import { setTestPool } from "../../apps/intelligence/lib/server/db";

export type Harness = { db: PGlite; app: SqlPool; admin: SqlPool; close(): Promise<void> };

/** Real migrations applied to an in-process PostgreSQL. The application connects as a role that cannot bypass row-level security. */
export async function harness(): Promise<Harness> {
  const db = new PGlite();
  await db.waitReady;
  for (const name of (await readdir("infra/database/migrations")).filter((n) => n.endsWith(".sql")).sort()) {
    if (/^000[789]/.test(name)) continue; // commerce migrations are independent of Intelligence
    await db.exec((await readFile(`infra/database/migrations/${name}`, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
  }
  await db.exec("CREATE ROLE vandlabs_runtime LOGIN NOSUPERUSER NOBYPASSRLS");
  await db.exec("GRANT USAGE ON SCHEMA public TO vandlabs_runtime");
  await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,dealerships,locations,vehicles,leads,tasks,journey_events,lead_activities,automation_rules,automation_runs,appointments TO vandlabs_runtime");
  await db.exec("GRANT SELECT,INSERT ON sales,inventory_history,stock_cost_history,platform_audit TO vandlabs_runtime");
  await db.exec("GRANT SELECT,INSERT,UPDATE ON stock_costs,staff_members,notification_outbox TO vandlabs_runtime");
  // 0010 to 0015 ran before the role existed in this harness, so apply their grants now.
  for (const name of ["0010_intelligence_workspace.sql", "0011_intelligence_security_media.sql", "0012_intelligence_platform_admin.sql", "0013_intelligence_reauth.sql", "0014_intelligence_rate_limits.sql", "0015_intelligence_read_model.sql"]) {
    const migration = await readFile(`infra/database/migrations/${name}`, "utf8");
    await db.exec(migration.slice(migration.indexOf("DO $$ DECLARE r text")).replace(/COMMIT;\s*$/, ""));
  }
  // PGlite is one session, so role switching is applied per call.
  const make = (role: string | null): SqlPool => ({
    async connect() {
      return {
        async query(sql: string, values?: unknown[]) {
          if (role && !/^ROLLBACK/i.test(sql)) await db.exec(`SET ROLE ${role}`);
          try {
            const r = await db.query<Record<string, unknown>>(sql, values);
            return { rows: r.rows };
          } finally {
            if (role) await db.exec("RESET ROLE").catch(() => undefined);
          }
        },
        release() {},
      };
    },
  });
  const app = make("vandlabs_runtime");
  setTestPool(app);
  return { db, app, admin: make(null), async close() { setTestPool(undefined); await db.close(); } };
}

/**
 * Runs commands and, on success, replaces the (small) returned state with the full reference read, so tests can assert on records
 * exactly as before. The production response carries only the shell plus the changed records.
 */
export async function runFull(principal: import("../../apps/intelligence/lib/server/identity").Principal, commands: { name: string; args: unknown[] }[], reauthenticated = false) {
  const { runCommands, loadWorkspace } = await import("../../apps/intelligence/lib/server/workspace");
  const outcome = await runCommands(principal, commands, reauthenticated);
  return outcome.ok ? { ...outcome, state: await loadWorkspace(principal) } : outcome;
}
