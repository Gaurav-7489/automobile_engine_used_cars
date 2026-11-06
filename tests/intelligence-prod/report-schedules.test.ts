import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { plain, tenantTx } from "../../apps/intelligence/lib/server/db";
import { redactFor } from "../../apps/intelligence/lib/server/redact";
import { cronAuthorized, deliverDueReports, dueReportTenants, reportDeliveryStatus, runReportCron } from "../../apps/intelligence/lib/server/report-delivery";
import { nextRunAfter, periodFor, reportEmail, reportLink, runAt, type ReportSchedule } from "../../apps/intelligence/lib/report-schedule";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const secs = () => Math.floor(Date.now() / 1000);
const config = { apiKey: "re_test", from: "VandLabs <reports@vandlabs.example>", origin: "https://app.example", fallbackTo: [] };
const SECRET = "cron-secret-0123456789abcdef";

type Call = { body: { to: string[]; subject: string; text: string }; key: string };
function recorder(status = 200) {
  const calls: Call[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)), key: (init.headers as Record<string, string>)["Idempotency-Key"] });
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

test("schedule times: 07:00 India time, weekly every 7 days, monthly on the same day (last day in short months), missed runs skipped", () => {
  const weekly = { cadence: "Weekly" as const, startDate: "2026-11-10" };
  assert.equal(runAt(weekly, 0), "2026-11-10T01:30:00.000Z");
  assert.equal(runAt(weekly, 1), "2026-11-17T01:30:00.000Z");
  assert.equal(runAt(weekly, 3), "2026-12-01T01:30:00.000Z");
  const monthly = { cadence: "Monthly" as const, startDate: "2027-01-31" };
  assert.equal(runAt(monthly, 1), "2027-02-28T01:30:00.000Z");
  assert.equal(runAt(monthly, 2), "2027-03-31T01:30:00.000Z");
  assert.equal(nextRunAfter(weekly, "2026-11-01T00:00:00.000Z"), "2026-11-10T01:30:00.000Z");
  assert.equal(nextRunAfter(weekly, "2026-11-10T01:30:00.000Z"), "2026-11-17T01:30:00.000Z", "strictly after");
  assert.equal(nextRunAfter(weekly, "2027-03-02T09:00:00.000Z"), "2027-03-09T01:30:00.000Z", "a long gap jumps to the next future run, not a burst");
  assert.equal(nextRunAfter(monthly, "2027-02-28T02:00:00.000Z"), "2027-03-31T01:30:00.000Z");
  assert.equal(periodFor("Weekly", "2026-11-10T01:30:00.000Z"), "2026-11");
  assert.equal(periodFor("Monthly", "2027-01-01T01:30:00.000Z"), "2026-12");
  assert.equal(reportLink("https://app.example/", "overview", "2026-11"), "https://app.example/app/reports?from=2026-11&to=2026-11");
  assert.equal(reportLink("https://app.example", "leads", "2026-11"), "https://app.example/app/reports?tab=leads&from=2026-11&to=2026-11");
  const mail = reportEmail({ origin: "https://app.example", dealer: "Delta Motors", schedule: { report: "finance", cadence: "Monthly", createdBy: "Owner" }, runFor: "2026-12-05T01:30:00.000Z", branchNames: ["North"] });
  assert.equal(mail.subject, "Delta Motors: your monthly Finance report is ready");
  assert.match(mail.text, /November 2026/);
  assert.match(mail.text, /\/app\/reports\?tab=finance&from=2026-11&to=2026-11/);
  assert.match(mail.text, /Branches: North\./);
  assert.equal(mail.text.replace(/https:\S+/, "").replace(/November 2026/g, "").match(/\d/g), null, "no figures in the email: only the month and the link");
});

test("the cron check needs the exact bearer secret; delivery reports Setup required until email and the secret are set", () => {
  assert.equal(cronAuthorized(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(cronAuthorized(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(cronAuthorized(null, SECRET), false);
  assert.equal(cronAuthorized(SECRET, SECRET), false);
  assert.equal(reportDeliveryStatus({}), "setup_required");
  assert.equal(reportDeliveryStatus({ RESEND_API_KEY: "k", NOTIFICATION_FROM: "a@b.example", APP_ORIGIN: "https://x.example" }), "setup_required");
  assert.equal(reportDeliveryStatus({ RESEND_API_KEY: "k", NOTIFICATION_FROM: "a@b.example", APP_ORIGIN: "https://x.example", CRON_SECRET: "short" }), "setup_required");
  assert.equal(reportDeliveryStatus({ RESEND_API_KEY: "k", NOTIFICATION_FROM: "a@b.example", APP_ORIGIN: "https://x.example", CRON_SECRET: SECRET }), "ready");
});

async function member(owner: Principal, email: string, role: string, locationIds: string[]): Promise<Principal> {
  const inv = await issueInvite(owner, { email, name: email.split("@")[0], role: role as Principal["role"], locationIds, dealershipIds: owner.dealershipIds });
  assert.ok(inv.ok, JSON.stringify(inv));
  const user = await redeemToken((inv as { token: string }).token, "another horse battery 8");
  assert.ok(user.ok);
  return (await resolvePrincipal((user as { userId: string }).userId, owner.tenantId, secs()))!;
}

test("scheduled reports: saved by permitted people only, delivered as links to people who still have access, once per run, isolated per dealership", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "Echo", dealership: "Echo Motors", locations: [{ name: "North", city: "Kochi", state: "Kerala", phone: "1" }, { name: "South", city: "Thrissur", state: "Kerala", phone: "2" }], owner: { email: "owner@echo.example", name: "Owner" } });
    const r = await redeemToken(p.ownerToken, "correct horse battery 7");
    assert.ok(r.ok);
    const owner = (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, secs()))!;
    const [north, south] = p.locationIds;
    const manager = await member(owner, "mgr@echo.example", "manager", [north]);
    const sales = await member(owner, "sales@echo.example", "sales", [north]);

    // A second dealership with no schedules, to prove isolation.
    const other = await provisionWorkspace(admin, { organization: "Foxtrot", dealership: "Foxtrot Cars", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }], owner: { email: "owner@foxtrot.example", name: "Owner F" } });

    const save = (who: Principal, input: Record<string, unknown>) => runFull(who, [{ name: "saveReportSchedule", args: [{ report: "overview", cadence: "Weekly", startDate: today(), recipients: [owner.userId, manager.userId], branchIds: [north, south], ...input }] }], false);
    // Refusals: a role that cannot schedule, a recipient who cannot view reports, a past date, a branch the scheduler cannot access.
    const bySales = await save(sales, { recipients: [sales.userId], branchIds: [north] });
    assert.equal(bySales.ok, false);
    assert.equal((bySales as { status: number }).status, 403);
    const toSales = await save(owner, { recipients: [sales.userId] });
    assert.equal(toSales.ok, false);
    assert.match(JSON.stringify(toSales), /recipient/);
    assert.equal((await save(owner, { startDate: "2020-01-01" })).ok, false);
    assert.equal((await save(manager, { recipients: [manager.userId], branchIds: [south] })).ok, false);
    assert.equal((await save(owner, { report: "anything" })).ok, false);
    assert.equal((await save(manager, { report: "finance", recipients: [owner.userId], branchIds: [north] })).ok, false, "finance reports need finance access");

    const saved = await save(owner, {});
    assert.ok(saved.ok, JSON.stringify(saved));
    const schedule = saved.state.reportSchedules[0];
    assert.equal(schedule.id, "RS-1");
    assert.equal(schedule.nextRunAt, runAt({ cadence: "Weekly", startDate: today() }, 0));
    assert.equal(saved.state.notifications["reports.ready"], true, "saving a schedule turns report emails on");
    assert.ok(saved.state.audit.some((a) => a.action === "report.scheduled" && a.target === "RS-1"));

    // Redaction: the North-only manager does not see a schedule that also covers South; sales (no reports access) sees none.
    const full = await loadWorkspace(owner);
    assert.equal(redactFor(full, { role: "manager", branchIds: [north] }).reportSchedules.length, 0);
    assert.equal(redactFor(full, { role: "owner", branchIds: [north, south] }).reportSchedules.length, 1);
    assert.equal(redactFor(full, { role: "sales", branchIds: [north, south] }).reportSchedules.length, 0);
    assert.equal(redactFor(full, { role: "owner", branchIds: [north, south] }).reportSchedules[0].claimedUntil, undefined);

    const run1 = new Date(Date.parse(schedule.nextRunAt) + 3_600_000);
    assert.deepEqual(await dueReportTenants(new Date(Date.parse(schedule.nextRunAt) - 60_000)), [], "not due before its time");
    assert.deepEqual(await dueReportTenants(run1), [p.tenantId], "only the dealership with a due schedule is listed");
    assert.ok(!(await dueReportTenants(run1)).includes(other.tenantId));
    // The membership check refuses to answer outside that dealership's own transaction.
    assert.equal((await plain((c) => c.query("SELECT * FROM intelligence_active_members($1::uuid, $2::uuid[])", [p.tenantId, [owner.userId]]))).rows.length, 0);
    assert.equal((await tenantTx(other.tenantId, (c) => c.query("SELECT * FROM intelligence_active_members($1::uuid, $2::uuid[])", [p.tenantId, [owner.userId]]))).rows.length, 0);
    // The runtime role cannot read another dealership's schedules directly.
    assert.equal((await tenantTx(other.tenantId, (c) => c.query("SELECT 1 FROM intelligence_documents WHERE collection = 'reportSchedules'"))).rows.length, 0);

    // Not configured: nothing happens.
    assert.deepEqual(await deliverDueReports(p.tenantId, { config: null, now: run1 }), { configured: false, sent: 0, runs: 0 });

    const ok = recorder();
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: ok.fetcher, now: run1 })).sent, 2);
    assert.deepEqual(ok.calls.map((c) => c.body.to[0]).sort(), ["mgr@echo.example", "owner@echo.example"]);
    const month = periodFor("Weekly", schedule.nextRunAt);
    for (const call of ok.calls) {
      assert.match(call.body.text, new RegExp(`https://app\\.example/app/reports\\?from=${month}&to=${month}`));
      assert.ok(!call.body.text.includes("₹"));
    }
    assert.match(ok.calls.find((c) => c.body.to[0] === "mgr@echo.example")!.body.text, /Branches: North\./, "each recipient sees only their own branches named");
    assert.match(ok.calls.find((c) => c.body.to[0] === "owner@echo.example")!.body.text, /Branches: North, South\./);
    assert.equal(new Set(ok.calls.map((c) => c.key)).size, 2, "one idempotency key per recipient");
    const doc = async () => (await tenantTx(p.tenantId, (c) => c.query("SELECT payload FROM intelligence_documents WHERE collection = 'reportSchedules' AND id = 'RS-1'"))).rows[0]?.payload as ReportSchedule | undefined;
    let s = (await doc())!;
    assert.equal(s.nextRunAt, runAt(schedule, 1), "moves to the next week");
    assert.equal(s.lastResult, "Sent to 2 of 2 recipients.");
    assert.ok(s.lastSentAt);
    // The same moment again: nothing is due, nothing is sent twice.
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: ok.fetcher, now: run1 })).sent, 0);
    assert.equal(ok.calls.length, 2);
    assert.deepEqual(await dueReportTenants(run1), []);

    // A suspended account gets nothing at the next run.
    await admin.query("UPDATE intelligence_users SET disabled = true WHERE id = $1", [manager.userId]);
    const run2 = new Date(Date.parse(runAt(schedule, 1)) + 3_600_000);
    const second = recorder();
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: second.fetcher, now: run2 })).sent, 1);
    assert.deepEqual(second.calls.map((c) => c.body.to[0]), ["owner@echo.example"]);
    assert.equal((await doc())!.lastResult, "Sent to 1 of 1 recipient.");

    // The email service refuses: the run stays due, is held back for 30 minutes, then retried; after three attempts it moves on.
    const run3 = new Date(Date.parse(runAt(schedule, 2)) + 3_600_000);
    const failing = recorder(500);
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: failing.fetcher, now: run3 })).sent, 0);
    s = (await doc())!;
    assert.equal(s.nextRunAt, runAt(schedule, 2));
    assert.match(s.lastResult ?? "", /retried/);
    assert.deepEqual(await dueReportTenants(run3), [], "held back after a failure");
    const retryAt = new Date(run3.getTime() + 31 * 60_000);
    assert.deepEqual(await dueReportTenants(retryAt), [p.tenantId]);
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: failing.fetcher, now: retryAt })).sent, 0);
    const thirdTry = new Date(retryAt.getTime() + 31 * 60_000);
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: failing.fetcher, now: thirdTry })).sent, 0);
    s = (await doc())!;
    assert.equal(s.nextRunAt, runAt(schedule, 3), "gives up on that run after three attempts");
    assert.match(s.lastResult ?? "", /Not delivered/);
    assert.equal(failing.calls.length, 3);

    // The dealership turns report emails off: the run is skipped and recorded, nothing is sent.
    assert.ok((await runFull(owner, [{ name: "setNotification", args: ["reports.ready", false] }], false)).ok);
    const run4 = new Date(Date.parse(runAt(schedule, 3)) + 3_600_000);
    const off = recorder();
    assert.equal((await deliverDueReports(p.tenantId, { config, fetcher: off.fetcher, now: run4 })).sent, 0);
    assert.equal(off.calls.length, 0);
    assert.match((await doc())!.lastResult ?? "", /turned off/);

    // The daily job: refuses without the secret, reports Setup required without email, sends with both.
    assert.ok((await runFull(owner, [{ name: "setNotification", args: ["reports.ready", true] }], false)).ok);
    const env = { CRON_SECRET: SECRET, RESEND_API_KEY: "re_test", NOTIFICATION_FROM: "VandLabs <reports@vandlabs.example>", APP_ORIGIN: "https://app.example" };
    const run5 = new Date(Date.parse(runAt(schedule, 4)) + 3_600_000);
    assert.equal((await runReportCron(`Bearer ${SECRET}`, { env: {}, now: run5 })).status, 503);
    assert.equal((await runReportCron("Bearer wrong", { env, now: run5 })).status, 401);
    assert.equal((await runReportCron(null, { env, now: run5 })).status, 401);
    assert.deepEqual((await runReportCron(`Bearer ${SECRET}`, { env: { CRON_SECRET: SECRET }, now: run5 })).body.configured, false);
    const cron = recorder();
    const outcome = await runReportCron(`Bearer ${SECRET}`, { env, fetcher: cron.fetcher, now: run5 });
    assert.equal(outcome.status, 200);
    assert.deepEqual(outcome.body, { configured: true, dealerships: 1, sent: 1, failed: 0 });

    // Deleting: someone who cannot see every branch is told it does not exist; the owner can, and it is audited.
    const byManager = await runFull(manager, [{ name: "deleteReportSchedule", args: ["RS-1"] }], false);
    assert.equal(byManager.ok, false);
    const del = await runFull(owner, [{ name: "deleteReportSchedule", args: ["RS-1"] }], false);
    assert.ok(del.ok);
    assert.equal(del.state.reportSchedules.length, 0);
    assert.ok(del.state.audit.some((a) => a.action === "report.schedule_deleted"));
    assert.equal(await doc(), undefined);
  } finally {
    await h.close();
  }
});
