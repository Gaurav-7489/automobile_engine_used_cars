import { plain } from "./db";
import { blobConfigured } from "./blob";
import { mailConfig } from "./lead-notifications";

export type CheckStatus = "pass" | "warn" | "fail";
export type Check = { key: string; group: "Runtime" | "Database" | "Security" | "Services"; label: string; status: CheckStatus; detail: string; ms?: number };
export type SystemReport = {
  checkedAt: string;
  checks: Check[];
  build: { version: string; builtAt: string; commit: string | null; commitMessage: string | null; branch: string | null; environment: string; region: string; repo: string; node: string; uptimeSeconds: number };
  tests: { name: string; files: number; tests: number }[];
  migrations: { name: string; present: boolean }[];
};

/** One object each migration creates. Catalog lookups need no table privileges, so the runtime role can check them. */
const MIGRATIONS: { name: string; kind: "table" | "function"; object: string }[] = [
  { name: "0001 Core tenant schema", kind: "table", object: "organizations" },
  { name: "0002 Ecosystem records", kind: "table", object: "lead_activities" },
  { name: "0003 Sales and inventory history", kind: "table", object: "sales" },
  { name: "0004 Stock costs", kind: "table", object: "stock_costs" },
  { name: "0005 Platform staff", kind: "table", object: "staff_members" },
  { name: "0006 Notification outbox", kind: "table", object: "notification_outbox" },
  { name: "0007 Dealer commerce", kind: "table", object: "dealer_commerce" },
  { name: "0010 Intelligence workspace", kind: "table", object: "intelligence_documents" },
  { name: "0011 Security and media", kind: "table", object: "intelligence_api_keys" },
  { name: "0012 Platform admin", kind: "table", object: "intelligence_platform_admins" },
  { name: "0013 Re-authentication", kind: "function", object: "intelligence_record_reauth" },
  { name: "0014 Rate limits", kind: "table", object: "intelligence_rate_limits" },
  { name: "0015 Read model", kind: "table", object: "intelligence_vehicle_index" },
  { name: "0016 Entitlements", kind: "function", object: "intelligence_admin_set_entitlements" },
  { name: "0017 Automations", kind: "table", object: "intelligence_automation_rules" },
  { name: "0018 Sourcing", kind: "function", object: "intelligence_admin_set_source" },
];

const env = (k: string) => (process.env[k] ?? "").trim();

/** Live checks of the running deployment. Reveals whether things are configured and working, never secret values or dealership data. */
export async function systemReport(): Promise<SystemReport> {
  const checks: Check[] = [];
  let migrations: SystemReport["migrations"] = MIGRATIONS.map((m) => ({ name: m.name, present: false }));

  // Database: reachability and latency, server version, role safety, schema.
  try {
    const started = performance.now();
    const facts = await plain(async (c) => {
      const row = (await c.query("SELECT current_setting('server_version') AS version, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).rows[0] ?? {};
      const tables = (await c.query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])", [MIGRATIONS.filter((m) => m.kind === "table").map((m) => m.object)])).rows.map((r) => String(r.relname));
      const funcs = (await c.query("SELECT DISTINCT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1::text[])", [MIGRATIONS.filter((m) => m.kind === "function").map((m) => m.object)])).rows.map((r) => String(r.proname));
      return { row, present: new Set([...tables, ...funcs]) };
    });
    const ms = Math.round(performance.now() - started);
    checks.push({ key: "db", group: "Database", label: "Database reachable", status: ms > 1500 ? "warn" : "pass", detail: `PostgreSQL ${String(facts.row.version ?? "?")} answered in ${ms} ms`, ms });
    const safeRole = facts.row.rolsuper === false && facts.row.rolbypassrls === false;
    checks.push({ key: "rls", group: "Security", label: "Row-level security enforced", status: safeRole ? "pass" : "fail", detail: safeRole ? "The app's database role cannot bypass per-dealership isolation" : "The app's database role can bypass row-level security" });
    migrations = MIGRATIONS.map((m) => ({ name: m.name, present: facts.present.has(m.object) }));
    const missing = migrations.filter((m) => !m.present);
    checks.push({ key: "schema", group: "Database", label: "Schema up to date", status: missing.length ? "fail" : "pass", detail: missing.length ? `Missing: ${missing.map((m) => m.name).join(", ")}. Run pnpm db:migrate.` : `All ${migrations.length} migrations present` });
  } catch (error) {
    checks.push({ key: "db", group: "Database", label: "Database reachable", status: "fail", detail: error instanceof Error ? error.message.slice(0, 160) : "No answer" });
  }

  // Security configuration.
  const tlsOff = env("DATABASE_TLS") === "off";
  checks.push({ key: "tls", group: "Security", label: "Database connection encrypted", status: tlsOff ? (process.env.NODE_ENV === "production" ? "fail" : "warn") : "pass", detail: tlsOff ? "TLS is off (allowed only for local development)" : "TLS with certificate verification" });
  const secret = env("SESSION_SECRET");
  checks.push({ key: "session", group: "Security", label: "Session signing key", status: secret.length >= 32 ? "pass" : "fail", detail: secret.length >= 32 ? "Set, 32+ characters" : "Missing or shorter than 32 characters" });
  const origin = env("APP_ORIGIN");
  checks.push({ key: "origin", group: "Security", label: "App address (APP_ORIGIN)", status: /^https:\/\//.test(origin) ? "pass" : origin ? "warn" : "fail", detail: origin ? origin.replace(/^https?:\/\//, "") : "Not set: desktop sign-in and email links need it" });

  // Services.
  checks.push({ key: "photos", group: "Services", label: "Photo storage", status: blobConfigured() ? "pass" : "warn", detail: blobConfigured() ? "Vercel Blob connected: photo upload and social posts work" : "Not connected: dealers cannot upload car photos" });
  const mail = mailConfig();
  checks.push({ key: "email", group: "Services", label: "Enquiry emails (Resend)", status: mail ? "pass" : "warn", detail: mail ? `Sending as ${mail.from}` : "Not configured: enquiries still become leads, emails wait up to 3 days" });
  checks.push({ key: "ads", group: "Services", label: "Advertising platforms", status: "warn", detail: "Google and Meta ad accounts are not connected (needs their developer approval)" });
  checks.push({ key: "market", group: "Services", label: "Licensed market data", status: "warn", detail: "No provider connected: Market Radar and valuations show Setup required" });

  // Runtime.
  checks.push({ key: "runtime", group: "Runtime", label: "Server runtime", status: "pass", detail: `Node ${process.version} · ${env("VERCEL") === "1" ? `Vercel ${env("VERCEL_REGION") || ""}` : env("HOSTING_PROVIDER") || "self-hosted"}`.trim() });

  const owner = env("VERCEL_GIT_REPO_OWNER") || "Gaurav-7489", slug = env("VERCEL_GIT_REPO_SLUG") || "automobile_engine_used_cars";
  let tests: SystemReport["tests"] = [];
  try { tests = JSON.parse(process.env.TEST_MANIFEST ?? "[]") as SystemReport["tests"]; } catch { tests = []; }
  return {
    checkedAt: new Date().toISOString(),
    checks,
    build: {
      version: process.env.APP_VERSION ?? "unknown", builtAt: process.env.BUILD_TIME ?? "", commit: env("VERCEL_GIT_COMMIT_SHA") || null, commitMessage: env("VERCEL_GIT_COMMIT_MESSAGE").split("\n")[0] || null,
      branch: env("VERCEL_GIT_COMMIT_REF") || null, environment: env("VERCEL_ENV") || process.env.NODE_ENV || "unknown", region: env("VERCEL_REGION") || "local", repo: `${owner}/${slug}`, node: process.version, uptimeSeconds: Math.round(process.uptime()),
    },
    tests,
    migrations,
  };
}
