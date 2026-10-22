import type { Lead, LeadStage } from "../domain";
import { LEAD_STAGES } from "../domain";
import { now } from "../clock";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, branchGuard, fail, guard, nextId, ok, trim, withAudit } from "./common";

export const LEAD_SOURCES = ["Website", "Search ad", "Meta ad", "Referral", "Walk-in", "Phone"] as const;

export type LeadInput = { name: string; contact: string; source: string; vehicleId: string; owner: string; branchId: string; consentEvidence: string; marketingConsent: boolean };

const maskContact = (contact: string) => `+91 ••••• ••${contact.replace(/\D/g, "").slice(-3)}`;

/** Add requires name or contact, source, linked vehicle or Unspecified interest, owner and consent provenance. */
export function addLead(state: WorkspaceState, actor: Actor, input: LeadInput): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.edit") ?? branchGuard(actor, input.branchId);
  if (denied) return denied;
  const fields: Record<string, string> = {};
  if (!trim(input.name) && !trim(input.contact)) fields.name = "Enter a name or a contact number.";
  if (trim(input.contact) && !/^\+?[\d\s-]{8,15}$/.test(trim(input.contact))) fields.contact = "Enter a valid phone number, for example +91 90000 00000.";
  if (!LEAD_SOURCES.includes(input.source as (typeof LEAD_SOURCES)[number])) fields.source = "Choose where this lead came from.";
  if (!input.vehicleId) fields.vehicleId = "Choose a vehicle or Unspecified interest.";
  if (!trim(input.owner)) fields.owner = "Assign an owner.";
  if (!trim(input.consentEvidence)) fields.consentEvidence = "Record how consent was captured, for example Walk-in form.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to add this lead.", { fields });
  const stamp = now();
  const id = nextId("L", state.leads.map((l) => l.id), 226);
  const vehicle = input.vehicleId === "unspecified" ? null : input.vehicleId;
  const duplicate = trim(input.contact) ? state.leads.find((l) => l.contactFull.replace(/\D/g, "") === input.contact.replace(/\D/g, "") && l.stage !== "Lost") : undefined;
  const lead: Lead = {
    id, name: trim(input.name) || "Unnamed lead", contactMasked: maskContact(input.contact || "000"), contactFull: trim(input.contact), vehicleId: vehicle, source: input.source, stage: "New", owner: input.owner, branchId: input.branchId,
    createdAt: stamp, lastTouchAt: stamp, nextAction: "First response", nextActionAt: new Date(new Date(stamp).getTime() + 60 * 60_000).toISOString(), version: 1, duplicateOf: duplicate?.id,
    consent: { marketing: input.marketingConsent, service: true, evidence: trim(input.consentEvidence), capturedAt: stamp },
    interactions: [{ id: `i-${id}-1`, at: stamp, type: "System", actor: actor.name, detail: `Lead added manually (${input.source}). Consent: ${trim(input.consentEvidence)}.` }],
    tasks: [{ id: `t-${id}-1`, title: "First response", dueAt: new Date(new Date(stamp).getTime() + 60 * 60_000).toISOString(), done: false }],
  };
  return ok(withAudit({ ...state, leads: [lead, ...state.leads] }, actor, "lead.created", id, `${input.source} / ${vehicle ?? "Unspecified interest"}`), { lead });
}

/** Stage validation applies in the dropdown and on drag: Won requires a reconciled sale linkage; Lost requires a reason. */
export function changeStage(state: WorkspaceState, actor: Actor, id: string, expectedVersion: number, stage: LeadStage, extra: { saleId?: string; lostReason?: string } = {}): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.edit");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead || !actor.branchIds.includes(lead.branchId)) return fail(404, "not_found", "Record not found.");
  if (!LEAD_STAGES.includes(stage)) return fail(422, "invalid", "Choose a canonical stage.");
  if (lead.version !== expectedVersion) return fail(409, "conflict", `This lead changed to ${lead.stage}. Refresh before saving.`, { latest: { stage: lead.stage, version: lead.version } });
  const fields: Record<string, string> = {};
  if (stage === "Won") {
    const sale = state.sales.find((s) => s.id === extra.saleId);
    if (!sale) fields.saleId = "Won requires a linked sale. Record the sale in Inventory (Sold) first.";
    else if (sale.state !== "Completed") fields.saleId = "The linked sale is not reconciled. Won cannot post revenue or profit.";
  }
  if (stage === "Lost" && !trim(extra.lostReason)) fields.lostReason = "Enter why this lead was lost.";
  if (Object.keys(fields).length) return fail(422, "invalid", "This stage change needs more information.", { fields });
  const stamp = now();
  const updated: Lead = { ...lead, stage, version: lead.version + 1, lastTouchAt: stamp, saleId: stage === "Won" ? extra.saleId : lead.saleId, lostReason: stage === "Lost" ? trim(extra.lostReason) : lead.lostReason,
    interactions: [{ id: `i-${id}-${lead.interactions.length + 1}`, at: stamp, type: "System", actor: actor.name, detail: `Stage ${lead.stage} → ${stage}` }, ...lead.interactions] };
  return ok(withAudit({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, actor, "lead.stage", id, `${lead.stage} → ${stage}`), { lead: updated });
}

export type Outcome = { kind: "Call" | "Message" | "Note"; outcome: string; detail: string };

/** Neither Call nor Message records a successful contact automatically: the user logs the outcome. */
export function logOutcome(state: WorkspaceState, actor: Actor, id: string, outcome: Outcome): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.contact");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead || !actor.branchIds.includes(lead.branchId)) return fail(404, "not_found", "Record not found.");
  if (!trim(outcome.outcome)) return fail(422, "invalid", "Choose the outcome to log.", { fields: { outcome: "Choose an outcome." } });
  const stamp = now();
  const updated: Lead = {
    ...lead, lastTouchAt: stamp, version: lead.version + 1,
    interactions: [{ id: `i-${id}-${lead.interactions.length + 1}`, at: stamp, type: outcome.kind, actor: actor.name, outcome: outcome.outcome, detail: trim(outcome.detail) || `${outcome.kind} logged` }, ...lead.interactions],
  };
  return ok(withAudit({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, actor, "lead.outcome_logged", id, `${outcome.kind}: ${outcome.outcome}`), { lead: updated });
}

export function canMessage(lead: Lead): { allowed: boolean; reason: string } {
  if (lead.consent.marketing) return { allowed: true, reason: "Marketing and service consent on file." };
  if (lead.consent.service) return { allowed: true, reason: "Service-response only: replies to this enquiry. No marketing messages." };
  return { allowed: false, reason: "No consent on file. Messaging is blocked." };
}

/** A message is Queued until the integration acknowledges: Delivered is never inferred. */
export function sendMessage(state: WorkspaceState, actor: Actor, id: string, text: string, marketing: boolean): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.contact");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead || !actor.branchIds.includes(lead.branchId)) return fail(404, "not_found", "Record not found.");
  const eligibility = canMessage(lead);
  if (!eligibility.allowed) return fail(422, "invalid", eligibility.reason, { fields: { message: eligibility.reason } });
  if (marketing && !lead.consent.marketing) return fail(422, "invalid", "Missing marketing consent blocks marketing messages. A service response is still permitted.", { fields: { message: "Missing marketing consent" } });
  if (!trim(text)) return fail(422, "invalid", "Write a message.", { fields: { message: "Enter the message to send." } });
  const stamp = now();
  const updated: Lead = {
    ...lead, version: lead.version + 1,
    interactions: [{ id: `i-${id}-${lead.interactions.length + 1}`, at: stamp, type: "Message", actor: actor.name, detail: trim(text), delivery: "Queued" }, ...lead.interactions],
  };
  return ok(withAudit({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, actor, "lead.message_queued", id, "Delivery not yet acknowledged"), { lead: updated });
}

export function retryMessage(state: WorkspaceState, actor: Actor, id: string, interactionId: string): Result<{ lead: Lead }> {
  const lead = state.leads.find((l) => l.id === id);
  if (!lead) return fail(404, "not_found", "Record not found.");
  const updated: Lead = { ...lead, interactions: lead.interactions.map((i) => (i.id === interactionId ? { ...i, delivery: "Queued" as const } : i)) };
  return ok({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, { lead: updated });
}

export type AppointmentInput = { kind: "Visit" | "Test drive"; date: string; time: string; staff: string };

/** Schedule in the branch timezone; validate staff and vehicle conflicts. Reschedule records the previous slot; cancel requires a reason. */
export function scheduleAppointment(state: WorkspaceState, actor: Actor, id: string, input: AppointmentInput): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.edit");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead || !actor.branchIds.includes(lead.branchId)) return fail(404, "not_found", "Record not found.");
  const fields: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fields.date = "Choose a date.";
  if (!/^\d{2}:\d{2}$/.test(input.time)) fields.time = "Choose a time.";
  if (!trim(input.staff)) fields.staff = "Assign staff.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to schedule.", { fields });
  const [y, m, d] = input.date.split("-").map(Number);
  const [hh, mm] = input.time.split(":").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60_000).toISOString();
  if (new Date(at).getTime() < new Date(now()).getTime()) return fail(422, "invalid", "Choose a time in the future.", { fields: { date: "Choose a future slot." } });
  const clash = state.leads.find((l) => l.id !== id && l.appointment && l.appointment.status === "Scheduled" && l.appointment.at === at && (l.appointment.staff === input.staff || (lead.vehicleId && l.vehicleId === lead.vehicleId && input.kind === "Test drive" && l.appointment.kind === "Test drive")));
  if (clash) return fail(409, "conflict", `Conflict with ${clash.id}: the same ${clash.appointment!.staff === input.staff ? "staff member" : "vehicle"} is booked at that time.`, { fields: { time: "Choose another slot." }, latest: { conflictWith: clash.id } });
  const previous = lead.appointment;
  const appointment = { id: previous?.id ?? `ap-${id}`, at, kind: input.kind, status: (previous ? "Rescheduled" : "Scheduled") as "Scheduled" | "Rescheduled", staff: input.staff, previousAt: previous?.at };
  const updated: Lead = {
    ...lead, appointment: { ...appointment, status: "Scheduled" }, stage: lead.stage === "New" || lead.stage === "Contacted" || lead.stage === "Qualified" ? "Appointment" : lead.stage, version: lead.version + 1, nextAction: `${input.date.slice(8)} / ${input.time}`, nextActionAt: at,
    interactions: [{ id: `i-${id}-${lead.interactions.length + 1}`, at: now(), type: "Appointment", actor: actor.name, detail: `${input.kind} ${previous ? "rescheduled" : "scheduled"} for ${input.date} ${input.time} IST with ${input.staff}.` }, ...lead.interactions],
  };
  return ok(withAudit({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, actor, "lead.appointment", id, `${input.kind} ${input.date} ${input.time}`), { lead: updated });
}

export function cancelAppointment(state: WorkspaceState, actor: Actor, id: string, reason: string): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.edit");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead?.appointment) return fail(404, "not_found", "Record not found.");
  if (!trim(reason)) return fail(422, "invalid", "Cancel requires a reason.", { fields: { reason: "Enter why the appointment is cancelled." } });
  const updated: Lead = { ...lead, appointment: { ...lead.appointment, status: "Cancelled", cancelReason: trim(reason) }, version: lead.version + 1 };
  return ok(withAudit({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, actor, "lead.appointment_cancelled", id, trim(reason)), { lead: updated });
}

/** Task completion writes actor and time and can be undone. */
export function toggleTask(state: WorkspaceState, actor: Actor, id: string, taskId: string): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.edit");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead) return fail(404, "not_found", "Record not found.");
  const stamp = now();
  const updated: Lead = { ...lead, tasks: lead.tasks.map((t) => (t.id === taskId ? (t.done ? { ...t, done: false, doneAt: undefined, doneBy: undefined } : { ...t, done: true, doneAt: stamp, doneBy: actor.name }) : t)) };
  return ok({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, { lead: updated });
}

export function assignLead(state: WorkspaceState, actor: Actor, id: string, owner: string): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.edit");
  if (denied) return denied;
  const lead = state.leads.find((l) => l.id === id);
  if (!lead) return fail(404, "not_found", "Record not found.");
  const updated: Lead = { ...lead, owner, version: lead.version + 1 };
  return ok(withAudit({ ...state, leads: state.leads.map((l) => (l.id === id ? updated : l)) }, actor, "lead.assigned", id, owner), { lead: updated });
}

/** Duplicate suggestions open a side-by-side preview. Merge needs an explicit primary record and keeps a reversible audit; it is never silent. */
export function mergeLeads(state: WorkspaceState, actor: Actor, primaryId: string, duplicateId: string): Result<{ lead: Lead }> {
  const denied = guard(actor, "leads.merge");
  if (denied) return denied;
  const primary = state.leads.find((l) => l.id === primaryId);
  const duplicate = state.leads.find((l) => l.id === duplicateId);
  if (!primary || !duplicate || primaryId === duplicateId) return fail(404, "not_found", "Record not found.");
  const merged: Lead = {
    ...primary, version: primary.version + 1, interactions: [...duplicate.interactions.map((i) => ({ ...i, detail: `[merged from ${duplicate.id}] ${i.detail}` })), ...primary.interactions].sort((a, b) => b.at.localeCompare(a.at)),
    tasks: [...primary.tasks, ...duplicate.tasks.map((t) => ({ ...t, id: `${t.id}-m` }))],
  };
  const archived: Lead = { ...duplicate, stage: "Lost", lostReason: `Merged into ${primary.id}`, version: duplicate.version + 1, duplicateOf: primary.id };
  const next = { ...state, leads: state.leads.map((l) => (l.id === primaryId ? merged : l.id === duplicateId ? archived : l)) };
  return ok(withAudit(next, actor, "lead.merged", primaryId, `${duplicateId} merged. Reversible from audit; original kept as ${duplicateId}.`), { lead: merged });
}

export function leadsForExport(leads: Lead[]): string[][] {
  // Export minimises contact fields: masked contact only.
  return [["lead_id", "name", "vehicle", "source", "stage", "owner", "last_touch"], ...leads.map((l) => [l.id, l.name, l.vehicleId ?? "Unspecified", l.source, l.stage, l.owner, l.lastTouchAt])];
}
