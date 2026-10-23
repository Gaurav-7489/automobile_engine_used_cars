import type { Campaign, Channel, Vehicle } from "../domain";
import { rupees } from "../format";
import { stockAgeDays } from "../finance";
import { now } from "../clock";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, branchGuard, fail, guard, nextId, ok, seq, trim, withAudit } from "./common";

export const CHANNELS: { id: Channel["id"]; name: string; requiresApi: boolean }[] = [
  { id: "search", name: "Search", requiresApi: true },
  { id: "meta", name: "Meta", requiresApi: true },
  { id: "owned", name: "Owned site listing", requiresApi: false },
  { id: "marketplace", name: "Marketplaces", requiresApi: true },
];

/** Channel connection state. Only connected eligible channels are selectable; the explanation names the setup needed. */
export function channelStatus(state: WorkspaceState, id: Channel["id"]): Channel {
  const def = CHANNELS.find((c) => c.id === id)!;
  if (state.live) {
    if (id === "search" || id === "meta") {
      const account = state.integrations.find((i) => i.id === ADVERTISING_ACCOUNT_ID);
      return account?.state === "Connected" ? { id, name: def.name, connected: true } : { id, name: def.name, connected: false, reason: "Setup required: connect an advertising account in Settings → Integrations." };
    }
    if (id === "owned") return { id, name: def.name, connected: state.integrations.find((i) => i.id === "publishing")?.state === "Connected" };
  }
  if (id === "search" || id === "meta") return { id, name: def.name, connected: true };
  if (id === "owned") return { id, name: def.name, connected: true };
  return { id, name: def.name, connected: false, reason: "Marketplaces need an authorised publishing API. Request the integration in Settings." };
}

export const ADVERTISING_ACCOUNT_ID = "ads";

/** Unsupported condition or finance claims are blocked. Copy may use verified stock facts only. */
const BLOCKED_CLAIMS: { pattern: RegExp; message: string }[] = [
  { pattern: /\b(accident[\s-]?free|no accidents?|never (been )?(in an )?accident)\b/i, message: "Accident-history claims are not supported by a verified document." },
  { pattern: /\b(guarantee[ds]?|assured|risk[\s-]?free)\b/i, message: "Guarantee claims are not supported." },
  { pattern: /\b(lowest|cheapest|best) (price|deal)\b/i, message: "Superlative price claims are not supported." },
  { pattern: /\b(0%|zero) (interest|down ?payment)|no (cost )?emi|easy emi|instant (loan|finance)\b/i, message: "Finance claims need an approved lender disclosure." },
  { pattern: /\b(certified|warranty|like new|showroom condition)\b/i, message: "Condition or warranty claims need a supporting document." },
];

export function checkCopy(text: string): string[] {
  return BLOCKED_CLAIMS.filter((claim) => claim.pattern.test(text)).map((claim) => claim.message);
}

export function factsFor(vehicle: Vehicle): { label: string; source: string }[] {
  return [
    { label: `${vehicle.year} ${vehicle.fuel.toLowerCase()} ${vehicle.transmission.toLowerCase()}`, source: `Stock ${vehicle.id}` },
    { label: `${vehicle.km.toLocaleString("en-IN")} km`, source: `Stock ${vehicle.id}` },
    { label: `${vehicle.owners} owner${vehicle.owners > 1 ? "s" : ""}`, source: `Stock ${vehicle.id}` },
  ];
}

export function totalBudget(c: Campaign): number {
  return c.channels.filter((ch) => ch.enabled).reduce((a, ch) => a + ch.budget, 0);
}

export function validateCampaign(state: WorkspaceState, c: Campaign): Record<string, string> {
  const errors: Record<string, string> = {};
  const vehicle = state.vehicles.find((v) => v.id === c.vehicleId);
  if (!vehicle || vehicle.status !== "available") errors.vehicle = "Only available vehicles can be advertised.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(c.endDate) || c.endDate < c.startDate) errors.dates = "Choose a start date and an end date that is not before it.";
  const enabled = c.channels.filter((ch) => ch.enabled);
  if (!enabled.length) errors.channels = "Select at least one connected channel.";
  for (const ch of enabled) if (!channelStatus(state, ch.id).connected) errors.channels = `${CHANNELS.find((x) => x.id === ch.id)?.name} is not connected.`;
  if (c.totalCap30d <= 0) errors.totalCap = "Set a total spend cap for 30 days.";
  else if (totalBudget(c) > c.totalCap30d) errors.totalCap = "Channel budgets exceed the total cap. Reduce a channel budget or raise the cap.";
  if (c.dailyCap <= 0) errors.dailyCap = "Set a daily cap.";
  else if (c.dailyCap > c.totalCap30d) errors.dailyCap = "The daily cap cannot exceed the 30-day cap.";
  const claims = [...checkCopy(c.headline), ...checkCopy(c.body)];
  if (!trim(c.headline) || !trim(c.body)) errors.copy = "Add a headline and body from verified stock facts.";
  else if (claims.length) errors.copy = claims[0];
  return errors;
}

export function createCampaign(state: WorkspaceState, actor: Actor, vehicleId: string): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle || !actor.branchIds.includes(vehicle.branchId)) return fail(404, "not_found", "Record not found.");
  if (vehicle.status !== "available") return fail(422, "invalid", "Only available vehicles are selectable.", { fields: { vehicle: "Choose an available vehicle." } });
  const id = nextId("CMP", state.campaigns.map((c) => c.id), seq(state, 3004));
  const stamp = now();
  const days = stockAgeDays(vehicle, stamp);
  const campaign: Campaign = {
    id, name: `${vehicle.make} ${vehicle.model} / ${state.branches.find((b) => b.id === vehicle.branchId)?.city ?? ""}`, vehicleId, vehicleVersion: vehicle.version, objective: "Enquiries", status: "Draft", step: 2,
    region: `${state.branches.find((b) => b.id === vehicle.branchId)?.city ?? "Local"} + 40 km`, radiusKm: 40, startDate: stamp.slice(0, 10), endDate: new Date(new Date(stamp).getTime() + 29 * 86_400_000).toISOString().slice(0, 10),
    channels: [{ id: "search", enabled: true, budget: rupees(9000) }, { id: "meta", enabled: true, budget: rupees(6000) }, { id: "owned", enabled: false, budget: 0 }, { id: "marketplace", enabled: false, budget: 0 }],
    totalCap30d: rupees(15000), dailyCap: rupees(500), headline: `${vehicle.model} / ${state.branches.find((b) => b.id === vehicle.branchId)?.city ?? ""}`,
    body: `${vehicle.year} ${vehicle.fuel.toLowerCase()} ${vehicle.transmission.toLowerCase()}. ${vehicle.km.toLocaleString("en-IN")} km. Request vehicle details.`, creativeApproved: false, budgetApproved: false,
    utm: `vl_${id.toLowerCase()}_${vehicle.id.toLowerCase()}`, clickWindowDays: 7, viewWindowDays: 1, createdBy: actor.sub, createdByName: actor.name,
    note: `Reason: ${days} days in stock and ${vehicle.enquiries14d} enquiries in 14 days. Budget experiment; outcomes unknown.`, history: [{ at: stamp, actor: actor.name, action: "Draft created" }],
  };
  return ok(withAudit({ ...state, campaigns: [campaign, ...state.campaigns] }, actor, "campaign.created", id, vehicleId), { campaign });
}

const EDITABLE: Campaign["status"][] = ["Draft"];

/** Any change to an approved campaign returns it to Draft: budget or creative changes invalidate approval. */
export function updateCampaign(state: WorkspaceState, actor: Actor, id: string, patch: Partial<Campaign>): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  const vehicle = state.vehicles.find((v) => v.id === current.vehicleId);
  if (vehicle && branchGuard(actor, vehicle.branchId)) return fail(404, "not_found", "Record not found.");
  if (!EDITABLE.includes(current.status) && !(current.status === "Approved" || current.status === "Pending")) return fail(409, "conflict", `A ${current.status.toLowerCase()} campaign cannot be edited.`);
  const stamp = now();
  const material = ["channels", "totalCap30d", "dailyCap", "headline", "body", "vehicleId", "startDate", "endDate"].some((key) => key in patch);
  const invalidated = material && (current.status === "Approved" || current.status === "Pending");
  const updated: Campaign = {
    ...current, ...patch, ...(invalidated ? { status: "Draft" as const, creativeApproved: false, budgetApproved: false, history: [...current.history, { at: stamp, actor: actor.name, action: "Edited: approval invalidated" }] } : {}),
  };
  return ok({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)) }, { campaign: updated });
}

export function changeVehicle(state: WorkspaceState, actor: Actor, id: string, vehicleId: string): Result<{ campaign: Campaign }> {
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  if (current.status !== "Draft") return fail(409, "conflict", "The vehicle can only be changed before approval.");
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle || vehicle.status !== "available") return fail(422, "invalid", "Only available vehicles are selectable.");
  return updateCampaign(state, actor, id, { vehicleId, vehicleVersion: vehicle.version, name: `${vehicle.make} ${vehicle.model} / ${state.branches.find((b) => b.id === vehicle.branchId)?.city ?? ""}`, utm: `vl_${id.toLowerCase()}_${vehicle.id.toLowerCase()}` });
}

export function submitCampaign(state: WorkspaceState, actor: Actor, id: string): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  if (current.status !== "Draft") return fail(409, "conflict", "Only drafts can be submitted.");
  const errors = validateCampaign(state, current);
  if (Object.keys(errors).length) return fail(422, "invalid", "Review vehicle, audience, channels, creative and spend cap before submitting.", { fields: errors });
  const stamp = now();
  const updated: Campaign = { ...current, status: "Pending", step: 5, history: [...current.history, { at: stamp, actor: actor.name, action: "Submitted for budget approval" }] };
  return ok(withAudit({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)) }, actor, "campaign.submitted", id, "Routed to budget approver"), { campaign: updated });
}

/** Approve locks the version of vehicle, creative and budget. Approval alone never spends. */
export function approveCampaign(state: WorkspaceState, actor: Actor, id: string): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.approve");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  if (current.status !== "Pending") return fail(409, "conflict", `This campaign is ${current.status.toLowerCase()}.`);
  if (state.policy.distinctApprover && current.createdBy === actor.sub) return fail(403, "forbidden", "Self-approval is prohibited under the default approval policy. Ask a distinct approver.");
  const vehicle = state.vehicles.find((v) => v.id === current.vehicleId);
  if (!vehicle || vehicle.status !== "available") return fail(409, "conflict", "The vehicle is no longer available. This campaign cannot be approved.");
  const stamp = now();
  const updated: Campaign = { ...current, status: "Approved", creativeApproved: true, budgetApproved: true, vehicleVersion: vehicle.version, approvedVersion: vehicle.version, history: [...current.history, { at: stamp, actor: actor.name, action: "Approved budget and creative. Version locked." }] };
  return ok(withAudit({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)) }, actor, "campaign.approved", id, `Total cap ${current.totalCap30d} paise`), { campaign: updated });
}

export type Preflight = { key: string; label: string; passed: boolean; detail: string };

export function preflight(state: WorkspaceState, c: Campaign): Preflight[] {
  const vehicle = state.vehicles.find((v) => v.id === c.vehicleId);
  const account = state.integrations.find((i) => i.id === ADVERTISING_ACCOUNT_ID);
  const enabled = c.channels.filter((ch) => ch.enabled);
  return [
    { key: "approval", label: "Approved creative and budget", passed: c.status === "Approved" && c.budgetApproved && c.creativeApproved, detail: c.status === "Approved" ? "Version locked" : "Submit and approve first" },
    { key: "stock", label: "Vehicle available and unchanged", passed: !!vehicle && vehicle.status === "available" && vehicle.version === (c.approvedVersion ?? -1), detail: vehicle ? (vehicle.version === c.approvedVersion ? `${vehicle.id} available` : "Vehicle changed after approval") : "Vehicle missing" },
    { key: "channels", label: "Connected channels", passed: enabled.length > 0 && enabled.every((ch) => channelStatus(state, ch.id).connected), detail: enabled.map((ch) => CHANNELS.find((x) => x.id === ch.id)?.name).join(", ") || "None selected" },
    { key: "tracking", label: "Valid tracking", passed: /^vl_cmp-\d+_v-\d+$/.test(c.utm) && c.clickWindowDays > 0, detail: `UTM ${c.utm} · click ${c.clickWindowDays}d / view ${c.viewWindowDays}d` },
    { key: "account", label: "Advertising account connected", passed: account?.state === "Connected", detail: account?.state === "Connected" ? "Connected" : "Not configured: connect it in Settings → Integrations" },
  ];
}

/** Publish moves to Publishing and waits for the platform. It is never Live until acknowledged. */
export function publishCampaign(state: WorkspaceState, actor: Actor, id: string): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  if (current.status !== "Approved") return fail(409, "conflict", "Publish requires an approved campaign.");
  const checks = preflight(state, current);
  const failedCheck = checks.find((c) => !c.passed);
  if (failedCheck) return fail(422, "invalid", `Publishing is blocked: ${failedCheck.label.toLowerCase()}. ${failedCheck.detail}.`, { fields: { [failedCheck.key]: failedCheck.detail } });
  const stamp = now();
  const updated: Campaign = { ...current, status: "Publishing", platformAck: "awaiting", history: [...current.history, { at: stamp, actor: actor.name, action: "Publish requested: awaiting platform acknowledgement" }] };
  return ok(withAudit({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)) }, actor, "campaign.publish_requested", id, "Preflight passed"), { campaign: updated });
}

export function acknowledgePlatform(state: WorkspaceState, id: string): Result<{ campaign: Campaign }> {
  const current = state.campaigns.find((c) => c.id === id);
  if (!current || current.platformAck !== "awaiting") return fail(404, "not_found", "Nothing awaiting acknowledgement.");
  const stamp = now();
  const next: Campaign["status"] = current.status === "Publishing" ? "Active" : current.status === "Pausing" ? "Paused" : current.status;
  const updated: Campaign = { ...current, status: next, platformAck: "acknowledged", history: [...current.history, { at: stamp, actor: "Platform", action: next === "Active" ? "Acknowledged: campaign active" : "Acknowledged: delivery paused" }] };
  const alerts = state.alerts.map((a) => (a.recordRef === id && a.waiting && a.status === "Open" ? { ...a, status: "Resolved" as const, resolution: { code: "platform-ack", note: "Platform acknowledged", at: stamp, by: "Platform" } } : a));
  return ok({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)), alerts }, { campaign: updated });
}

export function pauseCampaign(state: WorkspaceState, actor: Actor, id: string): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  if (current.status !== "Active") return fail(409, "conflict", "Only active campaigns can be paused.");
  const updated: Campaign = { ...current, status: "Pausing", platformAck: "awaiting", history: [...current.history, { at: now(), actor: actor.name, action: "Pause requested" }] };
  return ok(withAudit({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)) }, actor, "campaign.pause_requested", id, "Pending until acknowledged"), { campaign: updated });
}

/** Resume rechecks available stock and dates. */
export function resumeCampaign(state: WorkspaceState, actor: Actor, id: string): Result<{ campaign: Campaign }> {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current) return fail(404, "not_found", "Record not found.");
  if (current.status !== "Paused") return fail(409, "conflict", "Only paused campaigns can be resumed.");
  const vehicle = state.vehicles.find((v) => v.id === current.vehicleId);
  if (!vehicle || vehicle.status !== "available") return fail(422, "invalid", "The vehicle is no longer available. Resume is blocked.");
  if (current.endDate < now().slice(0, 10)) return fail(422, "invalid", "The campaign end date has passed. Edit the dates to resume.");
  const updated: Campaign = { ...current, status: "Publishing", platformAck: "awaiting", history: [...current.history, { at: now(), actor: actor.name, action: "Resume requested: awaiting platform acknowledgement" }] };
  return ok(withAudit({ ...state, campaigns: state.campaigns.map((c) => (c.id === id ? updated : c)) }, actor, "campaign.resume_requested", id, "Stock rechecked"), { campaign: updated });
}

export function discardCampaign(state: WorkspaceState, actor: Actor, id: string): Result {
  const denied = guard(actor, "campaign.edit");
  if (denied) return denied;
  const current = state.campaigns.find((c) => c.id === id);
  if (!current || current.status !== "Draft") return fail(409, "conflict", "Only drafts can be discarded.");
  return ok(withAudit({ ...state, campaigns: state.campaigns.filter((c) => c.id !== id) }, actor, "campaign.discarded", id, "Draft discarded"));
}

export function metricsFor(c: Campaign) {
  const m = c.metrics;
  if (!m) return null;
  return { cpl: m.leads ? Math.round(m.spend / m.leads) : null, costPerQualified: m.qualified ? Math.round(m.spend / m.qualified) : null, ...m };
}
