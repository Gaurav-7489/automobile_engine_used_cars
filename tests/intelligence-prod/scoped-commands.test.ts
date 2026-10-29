import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace, runCommandsIn } from "../../apps/intelligence/lib/server/workspace";
import { readState } from "../../apps/intelligence/lib/server/workspace-store";
import { enterLive } from "../../apps/intelligence/lib/server/workspace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { needsOf } from "../../apps/intelligence/lib/server/scoped-state";
import { seedSynthetic } from "../../scripts/perf/synthetic";
import type { WorkspaceState } from "../../apps/intelligence/lib/state";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const future = (days: number) => new Date(Date.now() + (330 + days * 1440) * 60_000).toISOString().slice(0, 10);

/** Everything a person could observe, with clocks and random ids masked, in a stable order. */
function normalise(state: WorkspaceState): string {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));
  const view = {
    vehicles: byId(state.vehicles), leads: byId(state.leads), sales: byId(state.sales), alerts: byId(state.alerts), priceRequests: byId(state.priceRequests), campaigns: byId(state.campaigns),
    corrections: byId(state.corrections), team: byId(state.team), policy: state.policy, notifications: state.notifications, tenant: state.tenant, branches: byId(state.branches), integrations: byId(state.integrations),
    audit: state.audit.map((a) => ({ actor: a.actor, action: a.action, target: a.target, detail: a.detail })).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)), savedSearches: byId(state.savedSearches), scenarios: byId(state.scenarios),
  };
  return JSON.stringify(view).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<ts>").replace(/AU-[a-z0-9-]+/g, "AU-<id>").replace(/invite-[0-9a-f]{12}/g, "invite-<token>");
}

/** Equality with a compact failure message: where the two texts first differ, not the whole texts. */
function same(actual: string, expected: string, label: string) {
  if (actual === expected) return;
  let i = 0;
  while (i < actual.length && actual[i] === expected[i]) i++;
  assert.fail(`${label}\n  scoped: ...${actual.slice(Math.max(0, i - 120), i + 160)}\n  full:   ...${expected.slice(Math.max(0, i - 120), i + 160)}`);
}

class Rollback extends Error { constructor(readonly payload: unknown) { super("rollback"); } }

async function observe(h: Awaited<ReturnType<typeof harness>>, tenantId: string, principal: Principal, commands: { name: string; args: unknown[] }[], mode: "auto" | "full") {
  enterLive();
  try {
    await tenantTx(tenantId, async (c) => {
      const outcome = await runCommandsIn(c, principal, commands, false, mode);
      const after = normalise(await readState(c, tenantId));
      const summary = outcome.ok
        ? { ok: true, changes: normalise({ ...(await readState(c, tenantId, { shell: true })), vehicles: outcome.changes.vehicles, leads: outcome.changes.leads, sales: outcome.changes.sales, alerts: outcome.changes.alerts }).replace(/"team":.*?"policy"/, '"policy"'), effects: outcome.effects.inviteLinks.map((l) => l.email) }
        : { ok: false, code: outcome.code, status: outcome.status, message: outcome.message, fields: outcome.fields };
      throw new Rollback({ summary, after });
    });
  } catch (error) {
    if (error instanceof Rollback) return error.payload as { summary: unknown; after: string };
    throw error;
  }
  throw new Error("unreachable");
}

test("scoped command execution gives exactly the same results as running against the whole workspace", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, {
      organization: "Scoped", dealership: "Scoped Motors",
      locations: [{ name: "North", city: "Kochi", state: "Kerala", phone: "+91 0" }, { name: "South", city: "Thrissur", state: "Kerala", phone: "+91 1" }],
      owner: { email: "owner@scoped.example", name: "Owner" },
    });
    const created = await redeemToken(p.ownerToken, "correct horse battery 7");
    assert.ok(created.ok);
    const owner = (await resolvePrincipal((created as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))!;
    const ids = (await admin.query("SELECT d.id AS dealership_id, array_agg(l.id ORDER BY l.name) AS locs FROM dealerships d JOIN locations l ON l.tenant_id = d.tenant_id AND l.dealership_id = d.id WHERE d.tenant_id = $1 GROUP BY d.id", [p.tenantId])).rows[0] as { dealership_id: string; locs: string[] };
    await seedSynthetic(admin, p.tenantId, { dealership_id: ids.dealership_id, locs: [ids.locs[0], ids.locs[1], ids.locs[0]] }, { vehicles: 120, leads: 360, sales: 20 });
    const [north, south] = p.locationIds;

    // A manager (for price requests an owner must approve) invited and activated through the real flow.
    const inv = await issueInvite(owner, { email: "mgr@scoped.example", name: "Manager", role: "manager", locationIds: p.locationIds, dealershipIds: owner.dealershipIds });
    assert.ok(inv.ok);
    const mgrUser = await redeemToken((inv as { token: string }).token, "another horse battery 8");
    assert.ok(mgrUser.ok);
    const manager = (await resolvePrincipal((mgrUser as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))!;

    // Committed prerequisites: app-created records (documents), a pending price request, a draft campaign, a booked appointment.
    const veh = (extra: Record<string, unknown> = {}) => ({ make: "Honda", model: "City", variant: "VX", year: "2021", fuel: "Petrol", transmission: "Automatic", km: "32000", owners: "1", registration: "KL 07 AA 1111", acquiredOn: today(), branchId: north, status: "preparation", asking: "950000", costs: { acquisition: "800000", transport: "5000", inspection: "2000", refurbishment: "30000", fees: "3000" }, photos: "0", ...extra });
    assert.ok((await runFull(owner, [{ name: "addVehicle", args: [veh()] }])).ok);
    const base = await loadWorkspace(owner);
    const mine = base.vehicles.find((v) => v.registration === "KL 07 AA 1111")!;
    assert.ok((await runFull(owner, [{ name: "transitionVehicle", args: [mine.id, mine.version, { to: "available" }] }])).ok);
    const afterAvail = (await loadWorkspace(owner)).vehicles.find((v) => v.id === mine.id)!;
    const req = await runFull(manager, [{ name: "createPriceRequest", args: [{ vehicleId: mine.id, proposedAsking: 90000000, reason: "Aged stock, price to move", submit: true }] }]);
    assert.ok(req.ok, JSON.stringify(req));
    const camp = await runFull(manager, [{ name: "createCampaign", args: [mine.id] }]);
    assert.ok(camp.ok, JSON.stringify(camp));
    const state = await loadWorkspace(owner);
    const requestId = state.priceRequests[0].id;
    const campaignId = state.campaigns[0].id;
    const leads = state.leads.filter((l) => l.stage === "New").sort((a, b) => (a.id < b.id ? -1 : 1));
    const [leadA, leadB, leadC, leadD] = leads;
    const withTask = state.leads.find((l) => l.tasks.length > 0 && l.stage !== "Won" && l.stage !== "Lost")!;
    const slot = { kind: "Visit" as const, date: future(3), time: "11:00", staff: "Owner" };
    assert.ok((await runFull(owner, [{ name: "scheduleAppointment", args: [leadA.id, slot] }])).ok);
    const sale = state.sales.find((s) => s.state === "Completed")!;
    const seededVehicles = state.vehicles.filter((v) => v.id.startsWith("SYN-") && v.status === "available");
    const sold = state.vehicles.find((v) => v.id.startsWith("SYN-") && v.status === "sold")!;
    const alertIds = state.alerts.filter((a) => a.status === "Open").slice(0, 3).map((a) => a.id);
    assert.ok(alertIds.length === 3);
    const lead = (id: string) => (state.leads.find((l) => l.id === id) ?? leadA);

    const cases: [string, { name: string; args: unknown[] }[]][] = [
      ["changeStage to Contacted", [{ name: "changeStage", args: [leadB.id, leadB.version, "Contacted"] }]],
      ["changeStage stale version", [{ name: "changeStage", args: [leadB.id, leadB.version + 5, "Contacted"] }]],
      ["changeStage Won with a sale", [{ name: "changeStage", args: [leadC.id, leadC.version, "Won", { saleId: sale.id }] }]],
      ["changeStage Won without a sale", [{ name: "changeStage", args: [leadC.id, leadC.version, "Won"] }]],
      ["changeStage Lost with a reason", [{ name: "changeStage", args: [leadD.id, leadD.version, "Lost", { lostReason: "Bought elsewhere" }] }]],
      ["logOutcome", [{ name: "logOutcome", args: [leadB.id, { kind: "Call", outcome: "Connected", detail: "Discussed finance" }] }]],
      ["sendMessage", [{ name: "sendMessage", args: [leadB.id, "Hello from the showroom", false] }]],
      ["assignLead", [{ name: "assignLead", args: [leadB.id, "Owner"] }]],
      ["toggleTask", [{ name: "toggleTask", args: [withTask.id, withTask.tasks[0].id] }]],
      ["scheduleAppointment free slot", [{ name: "scheduleAppointment", args: [leadB.id, { kind: "Visit", date: future(4), time: "15:30", staff: "Owner" }] }]],
      ["scheduleAppointment double booking", [{ name: "scheduleAppointment", args: [leadB.id, slot] }]],
      ["cancelAppointment", [{ name: "cancelAppointment", args: [leadA.id, "Customer asked to cancel"] }]],
      ["mergeLeads", [{ name: "mergeLeads", args: [leadB.id, leadC.id] }]],
      ["addLead", [{ name: "addLead", args: [{ name: "New Person", contact: "+91 98765 43210", source: "Walk-in", vehicleId: "unspecified", owner: "Owner", branchId: north, consentEvidence: "Verbal at showroom", marketingConsent: false }] }]],
      ["addLead duplicate contact", [{ name: "addLead", args: [{ name: "Same Person", contact: lead(leadB.id).contactFull, source: "Walk-in", vehicleId: "unspecified", owner: "Owner", branchId: north, consentEvidence: "Verbal", marketingConsent: false }] }]],
      ["updateVehicle", [{ name: "updateVehicle", args: [afterAvail.id, afterAvail.version, { km: 33000 }] }]],
      ["updateVehicle stale", [{ name: "updateVehicle", args: [afterAvail.id, afterAvail.version + 3, { km: 34000 }] }]],
      ["transition to reserved", [{ name: "transitionVehicle", args: [afterAvail.id, afterAvail.version, { to: "reserved", note: "Booked by R Nair" }] }]],
      ["transition to sold", [{ name: "transitionVehicle", args: [afterAvail.id, afterAvail.version, { to: "sold", sale: { salePrice: "930000", directCosts: "1000", closedOn: today() } }] }]],
      ["transition not allowed", [{ name: "transitionVehicle", args: [sold.id, sold.version, { to: "available" }] }]],
      ["addVehicle", [{ name: "addVehicle", args: [veh({ registration: "KL 07 BB 2222" })] }]],
      ["addVehicle duplicate registration", [{ name: "addVehicle", args: [veh({ registration: afterAvail.registration })] }]],
      ["importCommit", [{ name: "importCommit", args: [[{ line: 2, status: "valid", errors: [], values: { make: "Toyota", model: "Glanza", variant: "G", year: "2021", fuel: "Petrol", transmission: "Manual", km: "20000", owners: "1", registration: "KL 07 CC 3333", acquired_on: today(), acquisition_cost: "600000", asking: "720000" } }, { line: 3, status: "valid", errors: [], values: { make: "Kia", model: "Seltos", variant: "HTK", year: "2022", fuel: "Diesel", transmission: "Manual", km: "15000", owners: "1", registration: afterAvail.registration, acquired_on: today(), acquisition_cost: "900000", asking: "1100000" } }], north, "batch-scoped-1"] }]],
      ["bulkArchive", [{ name: "bulkArchive", args: [seededVehicles.slice(0, 3).map((v) => v.id)] }]],
      ["bulkAssignBranch", [{ name: "bulkAssignBranch", args: [seededVehicles.slice(3, 6).map((v) => v.id), south] }]],
      ["publishVehicles", [{ name: "publishVehicles", args: [[afterAvail.id]] }]],
      ["createPriceRequest", [{ name: "createPriceRequest", args: [{ vehicleId: seededVehicles[10].id, proposedAsking: 80000000, reason: "Slow mover", submit: false }] }]],
      ["approvePriceRequest", [{ name: "approvePriceRequest", args: [requestId] }]],
      ["rejectPriceRequest", [{ name: "rejectPriceRequest", args: [requestId, "Not enough evidence"] }]],
      ["withdrawPriceRequest by owner", [{ name: "withdrawPriceRequest", args: [requestId] }]],
      ["createCampaign", [{ name: "createCampaign", args: [seededVehicles[11].id] }]],
      ["updateCampaign", [{ name: "updateCampaign", args: [campaignId, { name: "Festive push", headline: "Test drive this week" }] }]],
      ["submitCampaign", [{ name: "submitCampaign", args: [campaignId] }]],
      ["proposeCorrection", [{ name: "proposeCorrection", args: [sale.id, "Direct cost missing", "Invoice 42"] }]],
      ["acknowledge alerts", [{ name: "acknowledge", args: [alertIds] }]],
      ["assignAlerts", [{ name: "assignAlerts", args: [alertIds.slice(0, 2), "Owner"] }]],
      ["snooze alert", [{ name: "snooze", args: [alertIds[0], "1h", "Waiting for the customer"] }]],
      ["resolve alert", [{ name: "resolve", args: [alertIds[1], "action-taken", "Done"] }]],
      ["setPolicy", [{ name: "setPolicy", args: [{ ageingDays: 60 }] }]],
      ["updateRules", [{ name: "updateRules", args: [{ reviewThresholdDays: 40 }] }]],
      ["saveBusiness", [{ name: "saveBusiness", args: [{ displayName: "Scoped Motors Kochi", legalName: "Scoped Motors Pvt Ltd", gstin: "", timezone: "Asia/Kolkata" }] }]],
      ["setNotification", [{ name: "setNotification", args: ["reports.ready", true] }]],
      ["inviteMember", [{ name: "inviteMember", args: [{ email: "new@scoped.example", role: "sales", branchIds: [north] }] }]],
      ["two commands in one batch", [{ name: "assignLead", args: [leadB.id, "Owner"] }, { name: "changeStage", args: [leadB.id, leadB.version + 1, "Contacted"] }]],
      ["unknown command", [{ name: "doesNotExist", args: [] }]],
    ];

    let scopedCount = 0;
    for (const [label, commands] of cases) {
      const shell = await tenantTx(p.tenantId, (c) => readState(c, p.tenantId, { shell: true }));
      const scoped = needsOf(commands, shell) !== null;
      if (scoped) scopedCount += 1;
      const principal = label.includes("by owner") || !label.includes("withdraw") ? owner : manager;
      const full = await observe(h, p.tenantId, principal, commands, "full");
      const auto = await observe(h, p.tenantId, principal, commands, "auto");
      same(JSON.stringify(auto.summary), JSON.stringify(full.summary), `${label}: outcome`);
      same(auto.after, full.after, `${label}: resulting workspace`);
    }
    assert.ok(scopedCount >= cases.length - 1, `expected every case except the unknown command to run scoped, got ${scopedCount}`);

    // Every operation the registry offers is either listed as scope-safe or deliberately falls back to the full read.
    const { COMMANDS } = await import("../../apps/intelligence/lib/actions/registry");
    const shell = await tenantTx(p.tenantId, (c) => readState(c, p.tenantId, { shell: true }));
    const unlisted = Object.keys(COMMANDS).filter((name) => needsOf([{ name, args: [] }], shell) === null);
    assert.deepEqual(unlisted, [], `commands without a scope entry run against the whole workspace: ${unlisted.join(", ")}`);
  } finally { await h.close(); }
});
