import { timingSafeEqual } from "node:crypto";
import { isUuid, plain, tenantTx, type SqlClient } from "./db";
import { roleOf } from "./identity";
import { readEntitlements } from "./entitlement-store";
import { mailConfig, type MailConfig } from "./lead-notifications";
import { mayReceive, nextRunAfter, reportEmail, type ReportSchedule } from "../report-schedule";

type Row = Record<string, unknown>;

/**
 * Scheduled report emails. A daily job (Vercel cron, protected by CRON_SECRET) asks the database which dealerships have a schedule
 * due, then delivers each dealership's due schedules inside its own row-level-security transaction. Opening the workspace also
 * delivers anything due, so a missed or failed job is caught up without a second scheduler.
 *
 * Each run is claimed before the email service is called (no lock is held while sending) and recorded afterwards. The email
 * service is given an idempotency key per schedule, run and recipient, so a retry after a crash does not send twice.
 */

const BATCH = 20;
const CLAIM_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const iso = (ms: number) => new Date(ms).toISOString();

/** True when CRON_SECRET is usable. The value itself is never returned or logged. */
export function cronSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.CRON_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export function reportDeliveryStatus(env: Record<string, string | undefined> = process.env): "ready" | "setup_required" {
  return mailConfig(env) && cronSecret(env) ? "ready" : "setup_required";
}

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Dealerships with at least one schedule due now. Tenant ids only: the function exposes nothing else. */
export async function dueReportTenants(at: Date = new Date(), limit = 200): Promise<string[]> {
  return plain(async (c) => (await c.query("SELECT tenant_id FROM intelligence_due_report_tenants($1::timestamptz, $2::int)", [at.toISOString(), limit])).rows.map((r) => String(r.tenant_id)));
}

type Mail = { userId: string; to: string; subject: string; text: string };
type Job = { id: string; runFor: string; attempts: number; mails: Mail[]; eligible: number };

const due = (s: ReportSchedule, t: number) => Date.parse(s.nextRunAt) <= t && (!s.claimedUntil || Date.parse(s.claimedUntil) <= t);

async function save(c: SqlClient, tenantId: string, schedule: ReportSchedule) {
  await c.query("UPDATE intelligence_documents SET payload = $3, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND collection = 'reportSchedules' AND id = $2", [tenantId, schedule.id, schedule]);
}

/** Same lock as workspace commands, so a schedule edited or deleted by a person and a delivery never interleave. */
const lock = (c: SqlClient, tenantId: string) => c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 7))", [tenantId]);

/** Delivers this dealership's due schedules. Does nothing when email is not configured. */
export async function deliverDueReports(tenantId: string, options: { config?: MailConfig | null; fetcher?: typeof fetch; now?: Date } = {}): Promise<{ configured: boolean; sent: number; runs: number }> {
  const config = options.config === undefined ? mailConfig() : options.config;
  if (!config) return { configured: false, sent: 0, runs: 0 };
  const fetcher = options.fetcher ?? fetch;
  const t = (options.now ?? new Date()).getTime();

  // 1. Claim due runs and work out who may still receive them.
  const jobs = await tenantTx(tenantId, async (c) => {
    await lock(c, tenantId);
    const schedules = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'reportSchedules' ORDER BY id", [tenantId])).rows.map((r) => r.payload as ReportSchedule).filter((s) => s && typeof s.nextRunAt === "string" && due(s, t)).slice(0, BATCH);
    if (!schedules.length) return [] as Job[];
    const advance = (s: ReportSchedule, result: string): ReportSchedule => ({ ...s, nextRunAt: nextRunAfter(s, iso(Math.max(t, Date.parse(s.nextRunAt)))), lastResult: result, attempts: 0, claimedUntil: undefined });

    const entitlements = await readEntitlements(c, tenantId);
    const meta = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'meta' AND id = 'workspace'", [tenantId])).rows[0] as Row | undefined;
    const prefs = ((meta?.payload as Row | undefined)?.notifications ?? {}) as Record<string, boolean>;
    const paused = !entitlements.features.reports.enabled ? "Skipped: Reports is not included for this dealership." : prefs["reports.ready"] === false ? "Skipped: scheduled report emails are turned off in Settings, Notifications." : null;
    if (paused) { for (const s of schedules) await save(c, tenantId, advance(s, paused)); return [] as Job[]; }

    const org = (await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId])).rows[0] as Row | undefined;
    const meta2 = (meta?.payload as { profile?: { displayName?: string } } | undefined)?.profile?.displayName;
    const dealer = String(meta2 || org?.name || "");
    const branches = new Map((await c.query("SELECT id, name FROM locations WHERE tenant_id = $1", [tenantId])).rows.map((r) => [String(r.id), String(r.name)]));
    const staff = (await c.query("SELECT user_id, payload FROM staff_members WHERE tenant_id = $1", [tenantId])).rows.map((r) => ({ ...(r.payload as Row), userId: String(r.user_id) }) as Row & { userId: string });
    const ids = [...new Set(schedules.flatMap((s) => s.recipients ?? []))].filter(isUuid);
    const active = new Set(ids.length ? (await c.query("SELECT user_id FROM intelligence_active_members($1::uuid, $2::uuid[])", [tenantId, ids])).rows.map((r) => String(r.user_id)) : []);

    const out: Job[] = [];
    for (const s of schedules) {
      const mails: Mail[] = [];
      for (const userId of s.recipients ?? []) {
        const member = staff.find((m) => m.userId === userId);
        if (!member || !active.has(userId) || member.enabled === false) continue;
        const role = roleOf({ role: String(member.role ?? ""), intelligenceRole: member.intelligenceRole ? String(member.intelligenceRole) : undefined });
        const memberBranches = Array.isArray(member.locationIds) ? (member.locationIds as unknown[]).map(String) : [];
        const email = String(member.email ?? "");
        if (!role || !EMAIL.test(email) || !mayReceive({ role, branchIds: memberBranches }, s.report, s.branchIds ?? [])) continue;
        const names = (s.branchIds ?? []).filter((b) => memberBranches.includes(b)).map((b) => branches.get(b)).filter((n): n is string => Boolean(n));
        mails.push({ userId, to: email, ...reportEmail({ origin: config.origin, dealer, schedule: s, runFor: s.nextRunAt, branchNames: names }) });
      }
      if (!mails.length) { await save(c, tenantId, advance(s, "Skipped: no recipient still has access to this report.")); continue; }
      const attempts = (s.attempts ?? 0) + 1;
      await save(c, tenantId, { ...s, attempts, claimedUntil: iso(t + CLAIM_MINUTES * 60_000) });
      out.push({ id: s.id, runFor: s.nextRunAt, attempts, mails, eligible: mails.length });
    }
    return out;
  });

  // 2. Send, with no transaction or lock held.
  let sent = 0;
  const results: { job: Job; delivered: number }[] = [];
  for (const job of jobs) {
    let delivered = 0;
    for (const mail of job.mails) {
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `report-${tenantId}-${job.id}-${job.runFor}-${mail.userId}` },
          body: JSON.stringify({ from: config.from, to: [mail.to], subject: mail.subject, text: mail.text }),
          signal: AbortSignal.timeout(10_000), redirect: "error",
        });
        if (!response.ok) throw new Error(`provider ${response.status}`);
        delivered += 1;
      } catch {
        // Counted below; the address and provider response are never logged.
      }
    }
    sent += delivered;
    results.push({ job, delivered });
  }

  // 3. Record the outcome. A run nobody received is retried later, up to three attempts; then it moves on to the next run.
  if (results.length) {
    await tenantTx(tenantId, async (c) => {
      await lock(c, tenantId);
      for (const { job, delivered } of results) {
        const row = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'reportSchedules' AND id = $2", [tenantId, job.id])).rows[0] as Row | undefined;
        const s = row?.payload as ReportSchedule | undefined;
        if (!s || s.nextRunAt !== job.runFor) continue; // deleted or changed meanwhile
        const finished = iso(Date.now());
        if (delivered > 0 || job.attempts >= MAX_ATTEMPTS) {
          const result = delivered > 0 ? `Sent to ${delivered} of ${job.eligible} recipient${job.eligible === 1 ? "" : "s"}.` : `Not delivered: the email service did not accept it after ${MAX_ATTEMPTS} attempts.`;
          await save(c, tenantId, { ...s, nextRunAt: nextRunAfter(s, iso(Math.max(t, Date.parse(s.nextRunAt)))), lastSentAt: delivered > 0 ? finished : s.lastSentAt, lastResult: result, attempts: 0, claimedUntil: undefined });
        } else {
          await save(c, tenantId, { ...s, lastResult: "Not delivered yet: the email service did not accept it. It will be retried.", claimedUntil: iso(t + RETRY_MINUTES * 60_000) });
        }
      }
    });
  }
  return { configured: true, sent, runs: jobs.length };
}

export type CronOutcome = { status: 200 | 401 | 503; body: Record<string, unknown> };

/** The daily job. Answers with counts only. */
export async function runReportCron(authorization: string | null, options: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: Date } = {}): Promise<CronOutcome> {
  const env = options.env ?? process.env;
  const secret = cronSecret(env);
  if (!secret) return { status: 503, body: { error: "setup_required", message: "Setup required: CRON_SECRET is not set (16 or more characters)." } };
  if (!cronAuthorized(authorization, secret)) return { status: 401, body: { error: "unauthorized" } };
  const config = mailConfig(env);
  if (!config) return { status: 200, body: { configured: false, dealerships: 0, sent: 0, message: "Setup required: RESEND_API_KEY, NOTIFICATION_FROM and APP_ORIGIN are needed to send report emails." } };
  const now = options.now ?? new Date();
  const tenants = await dueReportTenants(now);
  let sent = 0, failed = 0;
  for (const tenantId of tenants) {
    try { sent += (await deliverDueReports(tenantId, { config, fetcher: options.fetcher, now })).sent; }
    catch (error) { failed += 1; console.error(JSON.stringify({ event: "report_delivery_failure", message: error instanceof Error ? error.message : "unknown" })); }
  }
  return { status: 200, body: { configured: true, dealerships: tenants.length, sent, failed } };
}
