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
  // 0010 ran before the role existed in this harness, so apply its grants now.
  const migration = await readFile("infra/database/migrations/0010_intelligence_workspace.sql", "utf8");
  await db.exec(migration.slice(migration.indexOf("DO $$ DECLARE r text")).replace(/COMMIT;\s*$/, ""));
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
