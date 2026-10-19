import type { PriceChangeRequest, PriceRequestReason, StockCost, Vehicle } from "@vandlabs/contracts";
import { InputError } from "./errors";

// A price change is guarded, not forbidden: the owner can always make it directly, and anyone else
// raises a request the owner decides. The rule reads only recorded values and never guesses a cost.

export const priceApprovalPolicy = {
  /** A reduction larger than this share of the current asking price needs a decision. */
  maxUnapprovedDropPercent: 10,
  noteMax: 500,
} as const;

export function costBasis(cost?: Pick<StockCost, "purchasePrice" | "reconditioningCost" | "transferCost" | "otherCost">) {
  return cost ? Math.round((cost.purchasePrice + cost.reconditioningCost + cost.transferCost + cost.otherCost) * 100) / 100 : null;
}

export function priceChangeReasons(currentPrice: number, proposedPrice: number, cost?: StockCost): PriceRequestReason[] {
  const reasons: PriceRequestReason[] = [];
  if (!(proposedPrice < currentPrice)) return reasons; // increases and no-ops never need approval
  const basis = costBasis(cost);
  if (basis !== null && proposedPrice < basis) reasons.push("below_cost");
  if (currentPrice > 0 && (currentPrice - proposedPrice) / currentPrice * 100 > priceApprovalPolicy.maxUnapprovedDropPercent) reasons.push("large_drop");
  return reasons;
}

export interface PriceRequestInput { proposedPrice: number; note: string }
export function priceRequestInput(value: unknown): PriceRequestInput {
  const b = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (typeof b.proposedPrice !== "number" || !Number.isFinite(b.proposedPrice) || b.proposedPrice <= 0 || b.proposedPrice > 999999999) throw new InputError("Enter a valid proposed price.");
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (!note || note.length > priceApprovalPolicy.noteMax) throw new InputError("Explain the change in up to 500 characters.");
  return { proposedPrice: Math.round(b.proposedPrice * 100) / 100, note };
}
export function decisionInput(value: unknown): { decision: "approved" | "rejected"; note: string } {
  const b = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (b.decision !== "approved" && b.decision !== "rejected") throw new InputError("Choose approve or reject.");
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > priceApprovalPolicy.noteMax) throw new InputError("Keep the decision note under 500 characters.");
  if (b.decision === "rejected" && !note) throw new InputError("Say why the request is rejected.");
  return { decision: b.decision, note };
}

export function makePriceRequest(id: string, tenantId: string, vehicle: Vehicle, input: PriceRequestInput, reasons: PriceRequestReason[], actor: string, now: Date): PriceChangeRequest {
  return { id, tenantId, vehicleId: vehicle.id, version: 1, currentPrice: vehicle.price, proposedPrice: input.proposedPrice, vehicleVersion: vehicle.version ?? 0, reasons, note: input.note, status: "pending", requestedBy: actor, requestedAt: now.toISOString() };
}

/** Roles without capital access see that a request needs approval, never why in cost terms. */
export function redactPriceRequest(request: PriceChangeRequest, capital: boolean): PriceChangeRequest {
  return capital ? request : { ...request, reasons: request.reasons.includes("large_drop") ? ["large_drop"] : [] };
}
