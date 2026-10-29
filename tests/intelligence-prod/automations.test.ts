import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace, runCommands } from "../../apps/intelligence/lib/server/workspace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { listRules, recentRuns, saveRule } from "../../apps/intelligence/lib/server/automation-store";
import { evaluateLead, validateRule } from "../../apps/intelligence/lib/automation";
import type { Lead } from "../../apps/intelligence/lib/domain";

const spec = (name: string, email: string) => ({ organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 0" }], owner: { email, name: name + " Owner" } });

test("rule validation reports every field and evaluation matches the legacy rules", () => {
  const bad = validateRule({ name: "x", trigger: "stage_changed", stages: [], delayMinutes: -1, taskTitle: "" });
  assert.ok("fields" in bad && bad.fields.name && bad.fields.stages && bad.fields.delayMinutes && bad.fields.taskTitle);
  const ok = validateRule({ name: "First response", trigger: "lead_created", delayMinutes: 15, taskTitle: "Call the lead", priority: "high" });
  assert.ok("rule" in ok);
  const rule = (extra: object) => ({ id: "R1", name: "R", enabled: true, trigger: "lead_created" as const, stages: [], delayMinutes: 15, taskTitle: "Call", priority: "normal" as const, channel: "internal_task" as const, requiresConsent: false, ...extra });
  const lead = { id: "L-1", stage: "New", consent: { marketing: false } } as unknown as Lead;
  const at = new Date("2026-10-29T10:00:00Z");
  const made = evaluateLead(lead, "lead_created", [rule({})], new Set(), at);
  assert.equal(made.tasks.length, 1); assert.equal(made.tasks[0].dueAt, "2026-10-29T10:15:00.000Z"); assert.equal(made.runs[0].outcome, "created");
  assert.equal(evaluateLead(lead, "lead_created", [rule({})], new Set(["R1|L-1|lead_created"]), at).runs[0].outcome, "skipped_duplicate");
  assert.equal(evaluateLead(lead, "lead_created", [rule({ channel: "whatsapp", requiresConsent: true })], new Set(), at).runs[0].outcome, "skipped_consent");
  assert.equal(evaluateLead({ ...lead, consent: { marketing: true } } as unknown as Lead, "lead_created", [rule({ channel: "whatsapp", requiresConsent: true })], new Set(), at).runs[0].outcome, "skipped_provider");
  assert.equal(evaluateLead(lead, "lead_created", [rule({ enabled: false }), rule({ trigger: "stage_changed", stages: ["Qualified"] })], new Set(), at).runs.length, 0);
});

test("new leads and stage moves create tasks in the same transaction, once, tenant-scoped and disableable", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const a = await provisionWorkspace(admin, spec("Alpha", "owner@alpha.example"));
    const b = await provisionWorkspace(admin, spec("Beta", "owner@beta.example"));
    const users = [] as { userId: string }[];
    for (const [t, pw] of [[a, "another horse battery 8"], [b, "third horse battery 9"]] as const) { const r = await redeemToken(t.ownerToken, pw); assert.ok(r.ok); users.push(r as { userId: string }); }
    const owner = (await resolvePrincipal(users[0].userId, a.tenantId, Math.floor(Date.now() / 1000)))!;
    const [branch] = a.locationIds;

    await tenantTx(a.tenantId, async (c) => {
      assert.ok(await saveRule(c, a.tenantId, null, { name: "Greet", enabled: true, trigger: "lead_created", stages: [], delayMinutes: 30, taskTitle: "Greet the customer", priority: "normal", channel: "internal_task", requiresConsent: false }));
      assert.ok(await saveRule(c, a.tenantId, null, { name: "Qualified chase", enabled: true, trigger: "stage_changed", stages: ["Qualified"], delayMinutes: 120, taskTitle: "Chase quote", priority: "high", channel: "internal_task", requiresConsent: false }));
    });
    assert.equal((await tenantTx(b.tenantId, (c) => listRules(c, b.tenantId))).length, 0, "other dealerships never see the rules");

    const input = { name: "Asha", contact: "+91 98765 43210", source: "Walk-in", vehicleId: "unspecified", owner: owner.name, branchId: branch, consentEvidence: "Walk-in form", marketingConsent: true };
    const added = await runCommands(owner, [{ name: "addLead", args: [input] }], false);
    assert.ok(added.ok, JSON.stringify(added));
    const lead = added.changes.leads[0];
    assert.ok(lead.tasks.some((t) => t.title === "Greet the customer"), "task created with the lead");
    assert.ok(lead.interactions.some((i) => i.actor === "Automation"));
    let runs = await tenantTx(a.tenantId, (c) => recentRuns(c, a.tenantId, { page: 1, size: 50 }));
    assert.equal(runs.total, 1); assert.equal(runs.runs[0].outcome, "created");

    const moved = await runCommands(owner, [{ name: "changeStage", args: [lead.id, lead.version, "Qualified"] }], false);
    assert.ok(moved.ok, JSON.stringify(moved));
    assert.ok(moved.changes.leads[0].tasks.some((t) => t.title.startsWith("Chase quote")));
    const persisted = (await loadWorkspace(owner)).leads.find((l) => l.id === lead.id)!;
    assert.equal(persisted.tasks.filter((t) => t.title.startsWith("Chase quote")).length, 1, "saved with the command");

    // Re-entering the stage does not repeat the task; the skip is recorded.
    const l2 = moved.changes.leads[0];
    assert.ok((await runCommands(owner, [{ name: "changeStage", args: [l2.id, l2.version, "Contacted"] }], false)).ok);
    const l3 = (await loadWorkspace(owner)).leads.find((l) => l.id === lead.id)!;
    assert.ok((await runCommands(owner, [{ name: "changeStage", args: [l3.id, l3.version, "Qualified"] }], false)).ok);
    runs = await tenantTx(a.tenantId, (c) => recentRuns(c, a.tenantId, { page: 1, size: 50 }));
    assert.equal(runs.counts.created, 2); assert.equal(runs.counts.skipped_duplicate, 1);
    assert.equal((await loadWorkspace(owner)).leads.find((l) => l.id === lead.id)!.tasks.filter((t) => t.title.startsWith("Chase quote")).length, 1);

    // The feature switch turns the engine off without touching the rules.
    await admin.query("INSERT INTO dealer_commerce(tenant_id, payload) VALUES ($1, $2)", [a.tenantId, { features: { automations: false } }]);
    const { clearEntitlementMemo } = await import("../../apps/intelligence/lib/server/entitlement-store");
    clearEntitlementMemo();
    const off = await runCommands(owner, [{ name: "addLead", args: [{ ...input, name: "Ben", contact: "+91 98765 11111" }] }], false);
    assert.ok(off.ok);
    assert.ok(!off.changes.leads[0].tasks.some((t) => t.title === "Greet the customer"));
  } finally { await h.close(); }
});
