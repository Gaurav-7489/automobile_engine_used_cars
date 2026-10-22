import type { ChannelSync, PriceRequest, Vehicle } from "../domain";
import { landedCost, priceImpact } from "../finance";
import { daysBetween, lakh } from "../format";
import { valuationFor } from "../valuation";
import { now } from "../clock";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, fail, guard, nextId, ok, trim, withAudit } from "./common";

export const HOLDING_SELLING_DEFAULT = lakh(0.2);

export type PriceDraft = { vehicleId: string; proposedAsking: number | null; reason: string; floorRationale?: string; submit: boolean };

/** Evidence older than the configured window (7 days by default) must be re-validated before submission or approval. */
export const evidenceExpired = (evidenceAt: string, at: string, days: number): boolean => daysBetween(evidenceAt, at) > days;

/** No automatic recommendation is made with insufficient evidence. */
export function recommendedAsking(vehicle: Vehicle): number | null {
  const valuation = valuationFor(vehicle);
  if (valuation.tier === "Insufficient" || valuation.estimate === null || vehicle.asking === null) return null;
  if (vehicle.asking <= valuation.estimate) return null;
  return Math.round((valuation.estimate - lakh(0.4)) / 100_000) * 100_000; // ₹1,000 granularity
}

export function createPriceRequest(state: WorkspaceState, actor: Actor, draft: PriceDraft): Result<{ request: PriceRequest }> {
  const denied = guard(actor, "price.propose");
  if (denied) return denied;
  const vehicle = state.vehicles.find((v) => v.id === draft.vehicleId);
  if (!vehicle || !actor.branchIds.includes(vehicle.branchId)) return fail(404, "not_found", "Record not found.");
  const fields: Record<string, string> = {};
  if (vehicle.status !== "available" || vehicle.asking === null) fields.vehicleId = "Only available vehicles with a current asking price can be reviewed.";
  if (draft.proposedAsking === null || !Number.isInteger(draft.proposedAsking) || draft.proposedAsking <= 0) fields.proposedAsking = "Enter the proposed asking price in rupees, for example ₹25,90,000.";
  else if (vehicle.asking !== null && draft.proposedAsking === vehicle.asking) fields.proposedAsking = "The proposed price equals the current asking price.";
  else if (draft.proposedAsking > 100_000_000_000) fields.proposedAsking = "Proposed price is outside the permitted range.";
  if (draft.submit && !trim(draft.reason)) fields.reason = "Enter the reason for this change. It is stored with the request.";
  const valuation = valuationFor(vehicle);
  const landed = landedCost(vehicle.costs);
  const belowFloor = draft.proposedAsking !== null && draft.proposedAsking < Math.round((landed * state.policy.priceFloorPercent) / 100);
  if (belowFloor && draft.submit && !trim(draft.floorRationale)) fields.floorRationale = "This price is below the configured floor. Add a rationale for owner exception review.";
  if (draft.submit && valuation.tier === "Insufficient" && !trim(draft.reason)) fields.reason = "Insufficient evidence blocks an automated proposal. A manual request needs an explicit reason.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to continue.", { fields });
  const stamp = now();
  const recommended = recommendedAsking(vehicle);
  const request: PriceRequest = {
    id: nextId("PR", state.priceRequests.map((r) => r.id), 7004), vehicleId: vehicle.id, vehicleVersion: vehicle.version, status: draft.submit ? "Pending" : "Draft", currentAsking: vehicle.asking!, proposedAsking: draft.proposedAsking!,
    estimate: valuation.estimate, rangeLow: valuation.low, rangeHigh: valuation.high, landed, holdingSelling: HOLDING_SELLING_DEFAULT, reason: trim(draft.reason), requestedBy: actor.sub, requestedByName: actor.name, requestedAt: stamp,
    evidenceAt: valuation.observedAt, evidenceN: valuation.n, evidenceTier: valuation.tier, methodVersion: valuation.methodVersion, userEdited: recommended !== draft.proposedAsking, belowFloor, floorRationale: trim(draft.floorRationale) || undefined,
    channelScope: ["Owned site"], syncs: [], history: [{ at: stamp, actor: actor.name, action: draft.submit ? "Submitted for approval" : "Draft saved" }],
  };
  let next: WorkspaceState = { ...state, priceRequests: [request, ...state.priceRequests] };
  next = withAudit(next, actor, draft.submit ? "price_request.submitted" : "price_request.drafted", request.id, `${vehicle.id}: ${request.currentAsking} → ${request.proposedAsking} paise; evidence ${request.evidenceTier} n=${request.evidenceN}`);
  return ok(next, { request });
}

export function submitPriceRequest(state: WorkspaceState, actor: Actor, id: string): Result<{ request: PriceRequest }> {
  const denied = guard(actor, "price.propose");
  if (denied) return denied;
  const request = state.priceRequests.find((r) => r.id === id);
  if (!request) return fail(404, "not_found", "Record not found.");
  if (request.status !== "Draft") return fail(422, "invalid", "Only drafts can be submitted.");
  if (!trim(request.reason)) return fail(422, "invalid", "Enter the reason for this change before submitting.", { fields: { reason: "A reason is required." } });
  const vehicle = state.vehicles.find((v) => v.id === request.vehicleId);
  if (!vehicle) return fail(404, "not_found", "Record not found.");
  if (vehicle.version !== request.vehicleVersion || vehicle.asking !== request.currentAsking) return fail(409, "conflict", "The vehicle price or costs changed after this draft. Refresh the evidence and resubmit.", { latest: { version: vehicle.version, asking: vehicle.asking } });
  const stamp = now();
  const updated: PriceRequest = { ...request, status: "Pending", requestedAt: stamp, history: [...request.history, { at: stamp, actor: actor.name, action: "Submitted for approval" }] };
  return ok(withAudit({ ...state, priceRequests: state.priceRequests.map((r) => (r.id === id ? updated : r)) }, actor, "price_request.submitted", id, "Snapshot of current price and costs attached"), { request: updated });
}

/**
 * Approval confirms the exact old/new price. It requires a distinct approver (default policy), a matching vehicle version, fresh evidence,
 * and an owner for below-floor exceptions. Internal apply and per-channel sync are separate states: approval never implies every channel synced.
 */
export function approvePriceRequest(state: WorkspaceState, actor: Actor, id: string): Result<{ request: PriceRequest }> {
  const denied = guard(actor, "price.approve");
  if (denied) return denied;
  const request = state.priceRequests.find((r) => r.id === id);
  if (!request) return fail(404, "not_found", "Record not found.");
  if (request.status !== "Pending") return fail(409, "conflict", `This request is already ${request.status.toLowerCase()}. Duplicate approvals are ignored.`, { latest: { status: request.status } });
  if (state.policy.distinctApprover && request.requestedBy === actor.sub) return fail(403, "forbidden", "Self-approval is prohibited under the default approval policy. Ask a distinct approver.");
  if (request.belowFloor && !can_floor(actor)) return fail(403, "forbidden", "This price is below the configured floor and needs an owner exception review.");
  const vehicle = state.vehicles.find((v) => v.id === request.vehicleId);
  if (!vehicle) return fail(404, "not_found", "Record not found.");
  if (vehicle.version !== request.vehicleVersion || vehicle.asking !== request.currentAsking) {
    return fail(409, "conflict", "The vehicle price or costs changed after this request. Approval is blocked: refresh evidence and resubmit.", { latest: { version: vehicle.version, asking: vehicle.asking, requested: request.currentAsking } });
  }
  const stamp = now();
  if (evidenceExpired(request.evidenceAt, stamp, state.policy.evidenceExpiryDays)) return fail(422, "invalid", `Evidence is older than ${state.policy.evidenceExpiryDays} days. Revalidate before approving.`, { fields: { evidence: "Evidence expired" } });
  const syncs: ChannelSync[] = request.channelScope.map((channel, index) => ({ channel, status: "Applied" as const, at: stamp, syncId: `SY-${5600 + state.priceRequests.length * 3 + index}` }));
  const updated: PriceRequest = {
    ...request, status: "Applied", approvedBy: actor.sub, approverName: actor.name, decidedAt: stamp, syncs,
    history: [...request.history, { at: stamp, actor: actor.name, action: "Approved" }, { at: stamp, actor: "System", action: `Internal price applied (version ${vehicle.version + 1})` }, ...syncs.map((s) => ({ at: stamp, actor: "System", action: `${s.channel} sync acknowledged` }))],
  };
  const vehicles = state.vehicles.map((v) => (v.id === vehicle.id ? { ...v, asking: request.proposedAsking, version: v.version + 1 } : v));
  // Price changes invalidate approved or draft campaigns for the vehicle.
  const campaigns = state.campaigns.map((c) => (c.vehicleId === vehicle.id && (c.status === "Approved" || c.status === "Pending") ? { ...c, status: "Draft" as const, creativeApproved: false, budgetApproved: false, history: [...c.history, { at: stamp, actor: "System", action: "Approval invalidated: price changed" }] } : c));
  let next: WorkspaceState = { ...state, vehicles, campaigns, priceRequests: state.priceRequests.map((r) => (r.id === id ? updated : r)), alerts: state.alerts.map((a) => (a.recordRef === vehicle.id && a.type === "Pricing" && a.status === "Open" ? { ...a, status: "Resolved" as const, resolution: { code: "price-applied", note: `${request.id} applied`, at: stamp, by: actor.name } } : a)) };
  next = withAudit(next, actor, "price_request.approved", id, `${vehicle.id}: ${request.currentAsking} → ${request.proposedAsking} paise`);
  return ok(next, { request: updated });
}

const can_floor = (actor: Actor) => actor.role === "owner";

export function rejectPriceRequest(state: WorkspaceState, actor: Actor, id: string, reason: string): Result<{ request: PriceRequest }> {
  const denied = guard(actor, "price.approve");
  if (denied) return denied;
  const request = state.priceRequests.find((r) => r.id === id);
  if (!request) return fail(404, "not_found", "Record not found.");
  if (request.status !== "Pending") return fail(409, "conflict", `This request is already ${request.status.toLowerCase()}.`);
  if (!trim(reason)) return fail(422, "invalid", "Reject requires a reason.", { fields: { reason: "Enter a reason for rejecting this request." } });
  const stamp = now();
  const updated: PriceRequest = { ...request, status: "Rejected", approverName: actor.name, approvedBy: actor.sub, decidedAt: stamp, rejectReason: trim(reason), history: [...request.history, { at: stamp, actor: actor.name, action: "Rejected", detail: trim(reason) }] };
  return ok(withAudit({ ...state, priceRequests: state.priceRequests.map((r) => (r.id === id ? updated : r)) }, actor, "price_request.rejected", id, trim(reason)), { request: updated });
}

export function withdrawPriceRequest(state: WorkspaceState, actor: Actor, id: string): Result<{ request: PriceRequest }> {
  const request = state.priceRequests.find((r) => r.id === id);
  if (!request) return fail(404, "not_found", "Record not found.");
  if (request.requestedBy !== actor.sub) return fail(403, "forbidden", "Only the requester can withdraw a pending request.");
  if (request.status !== "Pending" && request.status !== "Draft") return fail(409, "conflict", `This request is already ${request.status.toLowerCase()}.`);
  const stamp = now();
  const updated: PriceRequest = { ...request, status: "Withdrawn", decidedAt: stamp, history: [...request.history, { at: stamp, actor: actor.name, action: "Withdrawn" }] };
  return ok(withAudit({ ...state, priceRequests: state.priceRequests.map((r) => (r.id === id ? updated : r)) }, actor, "price_request.withdrawn", id, "Requester withdrew"), { request: updated });
}

/** Retry only failed channels. The internal price stays applied; an idempotent retry cannot double-apply. */
export function retryFailedChannels(state: WorkspaceState, actor: Actor, id: string): Result<{ request: PriceRequest; retried: number }> {
  const denied = guard(actor, "settings.integrations") ?? null;
  const approver = guard(actor, "price.approve");
  if (denied && approver) return approver;
  const request = state.priceRequests.find((r) => r.id === id);
  if (!request) return fail(404, "not_found", "Record not found.");
  const failed = request.syncs.filter((s) => s.status === "Failed");
  if (!failed.length) return ok(state, { request, retried: 0 });
  const stamp = now();
  const syncs = request.syncs.map((s) => (s.status === "Failed" ? { ...s, status: "Applied" as const, at: stamp, error: undefined } : s));
  const updated: PriceRequest = { ...request, status: "Applied", syncs, history: [...request.history, ...failed.map((s) => ({ at: stamp, actor: actor.name, action: `${s.channel} retry acknowledged` }))] };
  const integrations = state.integrations.map((i) => (i.id === "publishing" ? { ...i, state: "Connected" as const, detail: "Last success", lastSuccessAt: stamp } : i));
  const alerts = state.alerts.map((a) => (a.title === "Price sync failed" && a.recordRef === request.vehicleId && a.status === "Open" ? { ...a, status: "Resolved" as const, resolution: { code: "retry-succeeded", note: "Failed channel retried and acknowledged", at: stamp, by: actor.name } } : a));
  return ok(withAudit({ ...state, priceRequests: state.priceRequests.map((r) => (r.id === id ? updated : r)), integrations, alerts }, actor, "price_request.retry", id, `${failed.length} channel(s) retried`), { request: updated, retried: failed.length });
}

export const impactFor = (request: Pick<PriceRequest, "currentAsking" | "proposedAsking" | "landed" | "holdingSelling">) => priceImpact(request);
