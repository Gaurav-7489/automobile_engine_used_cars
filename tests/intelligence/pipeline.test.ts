import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPipeline, pipelinePolicy } from "../../packages/data/src/pipeline";
import type { Appointment, Lead, LeadActivity, Task, Vehicle } from "../../packages/contracts/src/index";
import { leads as seeded, vehicles } from "../../packages/demo-data/src/index";

const now = new Date("2026-10-19T12:00:00Z"), ago = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const base = seeded[0], car = vehicles[0];
const lead = (id: string, stage: Lead["stage"], extra: Partial<Lead> = {}): Lead => ({ ...base, id, name: `Buyer ${id}`, stage, version: 2, createdAt: ago(1), updatedAt: ago(1), assignedTo: "maya", vehicleId: car.id, ...extra });
const task = (leadId: string, dueAgoH: number, extra: Partial<Task> = {}): Task => ({ id: `t-${leadId}-${dueAgoH}`, leadId, title: "Call back", owner: "maya", dueAt: ago(dueAgoH), completed: false, priority: "normal", ...extra });
const stageChange = (leadId: string, h: number): LeadActivity => ({ id: `a-${leadId}-${h}`, tenantId: base.tenantId, leadId, type: "stage_changed", actor: "maya", description: "", occurredAt: ago(h) } as LeadActivity);
const run = (leads: Lead[], tasks: Task[] = [], appointments: Appointment[] = [], activities: LeadActivity[] = [], filter = {}) => buildPipeline({ leads, tasks, appointments, activities, vehicles: [car] as Vehicle[] }, now, filter);
const card = (view: ReturnType<typeof run>, id: string) => view.columns.flatMap(c => c.cards).find(c => c.leadId === id)!;

test("open stages are columns in order; won, lost and nurture are counted, not boarded", () => {
  const view = run([lead("a", "new"), lead("b", "negotiation"), lead("c", "won"), lead("d", "lost"), lead("e", "nurture")]);
  assert.deepEqual(view.columns.map(c => [c.stage, c.total]), [["new", 1], ["contacted", 0], ["qualified", 0], ["appointment", 0], ["visited", 0], ["test_drive", 0], ["negotiation", 1]]);
  assert.deepEqual(view.closed.map(c => [c.stage, c.total]), [["won", 1], ["lost", 1], ["nurture", 1]]);
  assert.equal(view.totals.open, 2);
});
test("a new lead waiting past the first-response window is flagged, with the hours waited", () => {
  const view = run([lead("a", "new", { createdAt: ago(6) }), lead("b", "new", { createdAt: ago(1) })], [task("a", -2), task("b", -2)]);
  assert.ok(card(view, "a").attention.includes("first_response_overdue")); assert.equal(card(view, "a").waitingHours, 6);
  assert.ok(!card(view, "b").attention.includes("first_response_overdue"));
  assert.equal(view.totals.uncontacted, 1);
});
test("overdue tasks, missing next steps and stale stages are separate, explainable flags", () => {
  const leads = [lead("late", "contacted"), lead("empty", "qualified"), lead("old", "contacted"), lead("fine", "contacted")];
  const view = run(leads, [task("late", 30), task("old", -5), task("fine", -5)], [], [stageChange("old", 24 * 9), stageChange("fine", 24 * 2)]);
  assert.deepEqual(card(view, "late").attention, ["task_overdue"]);
  assert.deepEqual(card(view, "empty").attention, ["no_next_step"]);
  assert.deepEqual(card(view, "old").attention, ["stale"]); assert.equal(card(view, "old").daysInStage, 9);
  assert.deepEqual(card(view, "fine").attention, []); assert.equal(card(view, "fine").daysInStage, 2);
  assert.equal(pipelinePolicy.staleDays, 7);
});
test("stage age comes from the latest stage change, not from note edits", () => {
  const l = lead("x", "qualified", { createdAt: ago(24 * 30), updatedAt: ago(1) });
  assert.equal(card(run([l], [task("x", -5)], [], [stageChange("x", 24 * 4), stageChange("x", 24 * 10)]), "x").daysInStage, 4);
  assert.equal(card(run([l], [task("x", -5)]), "x").daysInStage, 30, "no stage change recorded: counts from creation");
});
test("a scheduled visit counts as a next step, and the nearest of task and visit is shown", () => {
  const visit: Appointment = { id: "v1", leadId: "a", type: "test_drive", scheduledAt: ago(-3), locationId: "loc", status: "scheduled" };
  const view = run([lead("a", "appointment")], [task("a", -8)], [visit]);
  assert.deepEqual(card(view, "a").next, { kind: "visit", title: "Test drive", at: ago(-3), overdue: false });
  assert.deepEqual(card(view, "a").attention, []);
  const cancelled = run([lead("a", "appointment")], [], [{ ...visit, status: "cancelled" }]);
  assert.deepEqual(card(cancelled, "a").attention, ["no_next_step"]);
});
test("owner and attention filters narrow the board and agree with unassigned handling", () => {
  const leads = [lead("a", "new", { assignedTo: "maya" }), lead("b", "new", { assignedTo: "ravi" }), lead("c", "new", { assignedTo: undefined })];
  const tasks = [task("a", -3), task("b", 2), task("c", -3)];
  assert.deepEqual(run(leads, tasks, [], [], { owner: "ravi" }).columns[0].cards.map(c => c.leadId), ["b"]);
  assert.deepEqual(run(leads, tasks, [], [], { owner: "unassigned" }).columns[0].cards.map(c => c.leadId), ["c"]);
  assert.deepEqual(run(leads, tasks, [], [], { attention: true }).columns[0].cards.map(c => c.leadId), ["b"]);
  assert.deepEqual(run(leads, tasks).owners, ["maya", "ravi"]);
});
test("cards needing attention sort first; asking value sums only known vehicle prices; column limit is honest", () => {
  const many = Array.from({ length: pipelinePolicy.columnLimit + 5 }, (_, i) => lead(`n${i}`, "contacted", { vehicleId: i % 2 ? undefined : car.id }));
  const view = run(many, many.slice(1).map(l => task(l.id, -4)));
  const column = view.columns.find(c => c.stage === "contacted")!;
  assert.equal(column.total, many.length); assert.equal(column.shown, pipelinePolicy.columnLimit); assert.equal(column.cards.length, pipelinePolicy.columnLimit);
  assert.equal(column.cards[0].leadId, "n0", "the lead with no next step is first");
  assert.equal(column.askingValue, many.filter(l => l.vehicleId).length * car.price, "the value covers the whole column, not just the cards shown");
});
test("the engine never mutates its inputs", () => {
  const leads = [lead("a", "new")], tasks = [task("a", 3)], frozen = structuredClone({ leads, tasks });
  run(leads, tasks); assert.deepEqual({ leads, tasks }, frozen);
});
