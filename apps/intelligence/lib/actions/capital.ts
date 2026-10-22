import type { Sale } from "../domain";
import { now } from "../clock";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, fail, guard, nextId, ok, trim, withAudit } from "./common";

/** Posted corrections use reversal + new entry, not silent overwrite. This demo records the proposal; the ledger is unchanged until finance posts it. */
export function proposeCorrection(state: WorkspaceState, actor: Actor, saleId: string, reason: string, evidence: string): Result {
  const denied = guard(actor, "capital.correct");
  if (denied) return denied;
  const sale = state.sales.find((s) => s.id === saleId);
  if (!sale) return fail(404, "not_found", "Record not found.");
  const fields: Record<string, string> = {};
  if (!trim(reason)) fields.reason = "Enter the reason for the correction.";
  if (!trim(evidence)) fields.evidence = "Attach or reference the supporting evidence.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Corrections need a reason and evidence.", { fields });
  const correction = { id: nextId("COR", state.corrections.map((c) => c.id), 1), saleId, reason: trim(reason), evidence: trim(evidence), proposedBy: actor.name, at: now(), status: "Proposed" as const };
  return ok(withAudit({ ...state, corrections: [correction, ...state.corrections] }, actor, "ledger.correction_proposed", saleId, `${correction.id}: reversal + new entry proposed`));
}

export const saleStateNote = (sale: Sale): string => (sale.state === "Completed" ? "Completed / reconciled" : sale.state === "Void" ? "Void: excluded from realized totals" : "Unreconciled: excluded until reconciled");
