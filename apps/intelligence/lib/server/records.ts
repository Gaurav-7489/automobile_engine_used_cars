import type { Lead, LeadStage, Lifecycle, Sale, Vehicle } from "../domain";
import { LEAD_STAGES } from "../domain";
import { fromIstDate, toPaise } from "./ids";

/**
 * Pure builders that turn the authoritative rows into the workspace's Vehicle, Lead and Sale records. Shared by the full
 * workspace read (the reference implementation) and the read model, so both always reconcile the same way.
 */
export type Row = Record<string, unknown>;
export type DocEntry = { payload: unknown; updatedAt: number };

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const maskContact = (contact: string) => `+91 ••••• ••${contact.replace(/\D/g, "").slice(-3)}`;
export const stageToContract = (s: LeadStage) => s.toLowerCase().replace(" ", "_");
export const stageFromContract = (s: string): LeadStage => LEAD_STAGES.find((x) => stageToContract(x) === s) ?? "New";


export const landedOf = (c: Vehicle["costs"]): number => c.acquisition + c.transport + c.inspection + c.refurbishment + c.fees;

/** Shared row is the system of record for core fields whenever it changed after the Intelligence record. Time-dependent enquiry counts are filled in by the caller. */
export function buildVehicle(row: Row, doc: DocEntry | undefined, cost: Row | undefined): Vehicle {
  const payload = row.payload as Row;
  const stockId = String(row.stock_id);
  const sharedUpdated = new Date(String(row.updated_at)).getTime();
  const costTotal = cost ? toPaise(Number(cost.purchasePrice) + Number(cost.reconditioningCost) + Number(cost.transferCost) + Number(cost.otherCost)) : null;
  const fromShared = (acquiredFallback: string): Vehicle => {
    const media = Array.isArray(payload.media) ? payload.media : [];
    const availability = String(row.availability_status);
    const status: Lifecycle = availability === "sold" ? "sold" : String(row.publish_status) === "archived" ? "archived" : availability === "reserved" ? "reserved" : "available";
    return {
      id: stockId, branchId: String(row.location_id), make: String(payload.make ?? ""), model: String(payload.model ?? ""), variant: String(payload.variant ?? ""), year: Number(payload.year ?? 0),
      fuel: cap(String(payload.fuelType ?? "petrol")) as Vehicle["fuel"], transmission: cap(String(payload.transmission ?? "manual")) as Vehicle["transmission"], km: Number(payload.mileage ?? 0), owners: Number(payload.ownership ?? 1),
      registration: String((payload.specifications as Row | undefined)?.registration ?? "—"), status, acquiredAt: cost ? fromIstDate(String(cost.acquiredOn)) : acquiredFallback,
      soldAt: status === "sold" ? new Date(String(row.updated_at)).toISOString() : undefined, asking: Number(payload.price ?? 0) > 0 ? toPaise(Number(payload.price)) : null,
      costs: cost ? { acquisition: toPaise(Number(cost.purchasePrice)), transport: toPaise(Number(cost.transferCost)), inspection: 0, refurbishment: toPaise(Number(cost.reconditioningCost)), fees: toPaise(Number(cost.otherCost)) } : { acquisition: 0, transport: 0, inspection: 0, refurbishment: 0, fees: 0 },
      costComplete: !!cost, hasImages: media.length > 0, enquiries14d: 0, cohortMedianEnquiries: 0, version: Number(payload.version ?? 0) + 1,
      channels: String(row.publish_status) === "published" ? ["Owned site"] : [], documents: [{ name: "Registration certificate", provided: false }, { name: "Inspection report", provided: false }],
    };
  };
  const photos = (Array.isArray(payload.media) ? payload.media : []).map((m) => String((m as Row).url ?? "")).filter((u) => /^https:\/\//.test(u));
  if (!doc) return { ...fromShared(new Date(String(row.created_at)).toISOString()), photos };
  const stored = doc.payload as Vehicle;
  if (sharedUpdated <= doc.updatedAt) return { ...stored, branchId: String(row.location_id), photos, hasImages: stored.hasImages || photos.length > 0 };
  // Changed elsewhere (for example in Command Center) after our last write: shared core fields win.
  const shared = fromShared(stored.acquiredAt);
  const ledgerTotal = stored.costs.acquisition + stored.costs.transport + stored.costs.inspection + stored.costs.refurbishment + stored.costs.fees;
  return { ...stored, make: shared.make, model: shared.model, variant: shared.variant, year: shared.year, km: shared.km, owners: shared.owners, asking: shared.asking, status: stored.status === "preparation" && shared.status === "available" ? "preparation" : shared.status,
    branchId: shared.branchId, hasImages: shared.hasImages, photos, costs: costTotal !== null && costTotal !== ledgerTotal ? shared.costs : stored.costs, version: Math.max(stored.version, shared.version) };
}

/** `vehicleStockId` resolves the shared vehicle uuid on a lead to its stock id. */
export function buildLead(row: Row, doc: DocEntry | undefined, taskRows: Row[], vehicleStockId: (uuid: string) => string | undefined, firstBranch: string): Lead {
  const payload = row.payload as Row;
  const uuid = String(row.id);
  const publicId = String(payload.intelligenceId ?? `L-${uuid.slice(0, 8)}`);
  const sharedUpdated = new Date(String(row.updated_at)).getTime();
  const sharedTasks = taskRows.map((t) => { const p = t.payload as Row; return { id: String(p.intelligenceTaskId ?? t.id), title: String(p.title ?? ""), dueAt: new Date(String(t.due_at)).toISOString(), done: Boolean(t.completed), doneAt: undefined as string | undefined, doneBy: undefined as string | undefined }; });
  const phone = String(payload.phone ?? "");
  const fromShared = (): Lead => ({
    id: publicId, name: String(payload.name ?? "Unnamed lead"), contactMasked: maskContact(phone || "000"), contactFull: phone, email: payload.email ? String(payload.email) : undefined, vehicleId: row.vehicle_id ? vehicleStockId(String(row.vehicle_id)) ?? null : null,
    source: String(row.source), stage: stageFromContract(String(row.stage)), owner: String(payload.assignedTo ?? "Unassigned"), branchId: row.location_id ? String(row.location_id) : firstBranch,
    createdAt: new Date(String(row.created_at)).toISOString(), lastTouchAt: new Date(String(row.updated_at)).toISOString(), nextAction: "Respond to enquiry", version: Number(payload.version ?? 0) + 1,
    consent: { marketing: Boolean((payload.consent as Row | undefined)?.marketing), service: true, evidence: "Captured on the enquiry form", capturedAt: new Date(String(row.created_at)).toISOString() },
    interactions: [{ id: `i-${publicId}-0`, at: new Date(String(row.created_at)).toISOString(), type: "System", actor: "System", detail: `Enquiry received (${String(row.source)})${payload.notes ? `: ${String(payload.notes)}` : ""}` }],
    tasks: sharedTasks, campaignId: row.campaign ? String(row.campaign) : undefined,
  });
  if (!doc) return fromShared();
  const stored = doc.payload as Lead;
  if (sharedUpdated <= doc.updatedAt) return { ...stored, tasks: stored.tasks };
  const shared = fromShared();
  return { ...stored, name: shared.name, contactFull: shared.contactFull, contactMasked: shared.contactMasked, email: shared.email, stage: shared.stage, owner: shared.owner, vehicleId: shared.vehicleId, version: Math.max(stored.version, shared.version), tasks: sharedTasks.length ? sharedTasks : stored.tasks };
}

export function buildLedgerSale(row: Row, stockId: string, vehicle: Vehicle | undefined, firstBranch: string): Sale {
  const payload = row.payload as Row;
  const landed = vehicle ? landedOf(vehicle.costs) : 0;
  return { id: `S-${String(row.id).slice(0, 8)}`, vehicleId: stockId, branchId: vehicle?.branchId ?? firstBranch, label: vehicle ? `${vehicle.make} ${vehicle.model}` : stockId, closedAt: new Date(String(row.sold_at)).toISOString(), salePrice: toPaise(Number(row.amount)), landed, directCosts: 0, state: vehicle?.costComplete ? "Completed" : "Unreconciled", note: payload.confirmedBy ? `Confirmed by ${String(payload.confirmedBy)}` : undefined };
}
