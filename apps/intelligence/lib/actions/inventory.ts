import type { CostLedger, Lifecycle, Sale, Vehicle } from "../domain";
import { landedCost } from "../finance";
import { ist, SNAPSHOT_AT } from "../time";
import { now } from "../clock";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, branchGuard, fail, guard, nextId, ok, trim, withAudit } from "./common";

export type VehicleInput = {
  make: string; model: string; variant: string; year: string; fuel: Vehicle["fuel"] | ""; transmission: Vehicle["transmission"] | ""; km: string; owners: string; registration: string;
  acquiredOn: string; branchId: string; status: "preparation" | "available"; asking: string; costs: Record<keyof CostLedger, string>; photos: string;
};

export const emptyVehicleInput = (branchId: string): VehicleInput => ({
  make: "", model: "", variant: "", year: "", fuel: "", transmission: "", km: "", owners: "1", registration: "", acquiredOn: "", branchId, status: "preparation", asking: "",
  costs: { acquisition: "", transport: "", inspection: "", refurbishment: "", fees: "" }, photos: "0",
});

const toPaise = (text: string): number | null => {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(Number(cleaned) * 100);
};

/** Save draft allows incomplete media; Available requires the complete required fields. */
export function validateVehicle(input: VehicleInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!trim(input.make)) errors.make = "Enter the make, for example BMW.";
  if (!trim(input.model)) errors.model = "Enter the model, for example 520d.";
  if (!trim(input.variant)) errors.variant = "Enter the variant, for example Luxury Line.";
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1990 || year > 2027) errors.year = "Enter a four-digit model year between 1990 and 2027.";
  if (!input.fuel) errors.fuel = "Choose a fuel type.";
  if (!input.transmission) errors.transmission = "Choose a transmission.";
  const km = Number(input.km.replace(/,/g, ""));
  if (!Number.isInteger(km) || km < 0 || km > 1_000_000) errors.km = "Enter the odometer reading in whole kilometres.";
  const owners = Number(input.owners);
  if (!Number.isInteger(owners) || owners < 1 || owners > 9) errors.owners = "Enter the number of previous owners from 1 to 9.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquiredOn)) errors.acquiredOn = "Choose the acquisition date.";
  else if (new Date(`${input.acquiredOn}T00:00:00+05:30`).getTime() > new Date(SNAPSHOT_AT).getTime() + 86_400_000) errors.acquiredOn = "Acquisition date cannot be in the future.";
  for (const key of Object.keys(input.costs) as (keyof CostLedger)[]) {
    const value = toPaise(input.costs[key]);
    if (Number.isNaN(value)) errors[`costs.${key}`] = "Enter an amount in rupees, for example 25,00,000.";
  }
  const asking = toPaise(input.asking);
  if (Number.isNaN(asking)) errors.asking = "Enter the asking price in rupees, for example 28,50,000.";
  if (input.status === "available") {
    if (asking === null) errors.asking = "Available vehicles need an asking price.";
    if (toPaise(input.costs.acquisition) === null) errors["costs.acquisition"] = "Available vehicles need the acquisition cost.";
    if (Number(input.photos) < 1) errors.photos = "Available vehicles need at least one photo. Save as In preparation to continue without media.";
  }
  return errors;
}

export function addVehicle(state: WorkspaceState, actor: Actor, input: VehicleInput): Result<{ vehicle: Vehicle }> {
  const denied = guard(actor, "inventory.edit") ?? branchGuard(actor, input.branchId);
  if (denied) return denied;
  const fields = validateVehicle(input);
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to save this vehicle.", { fields });
  const costs: CostLedger = {
    acquisition: toPaise(input.costs.acquisition) ?? 0, transport: toPaise(input.costs.transport) ?? 0, inspection: toPaise(input.costs.inspection) ?? 0,
    refurbishment: toPaise(input.costs.refurbishment) ?? 0, fees: toPaise(input.costs.fees) ?? 0,
  };
  const id = nextId("V", state.vehicles.map((v) => v.id), 1050);
  const duplicate = state.vehicles.find((v) => v.registration === trim(input.registration) && trim(input.registration) !== "" && v.status !== "archived");
  if (duplicate) return fail(409, "conflict", `A stock record with this registration already exists (${duplicate.id}).`, { latest: { id: duplicate.id } });
  const vehicle: Vehicle = {
    id, branchId: input.branchId, make: trim(input.make), model: trim(input.model), variant: trim(input.variant), year: Number(input.year), fuel: input.fuel as Vehicle["fuel"], transmission: input.transmission as Vehicle["transmission"],
    km: Number(input.km.replace(/,/g, "")), owners: Number(input.owners), registration: trim(input.registration) || "—", status: input.status, acquiredAt: ist(...(input.acquiredOn.split("-").map(Number) as [number, number, number]), 10),
    asking: toPaise(input.asking), costs, costComplete: costs.acquisition > 0 && costs.refurbishment > 0, hasImages: Number(input.photos) > 0, enquiries14d: 0, cohortMedianEnquiries: 5, version: 1, channels: [],
    documents: [{ name: "Registration certificate", provided: false }, { name: "Inspection report", provided: false }],
  };
  let next: WorkspaceState = { ...state, vehicles: [vehicle, ...state.vehicles] };
  next = withAudit(next, actor, "inventory.created", id, `${vehicle.make} ${vehicle.model} added as ${vehicle.status}`);
  return ok(next, { vehicle });
}

export type VehiclePatch = Partial<Pick<Vehicle, "variant" | "km" | "owners" | "hasImages" | "documents">> & { costs?: Partial<CostLedger>; branchId?: string };

/** Optimistic concurrency: a stale expectedVersion returns 409 with the latest server version and never overwrites. Asking price changes go through Pricing Intelligence. */
export function updateVehicle(state: WorkspaceState, actor: Actor, id: string, expectedVersion: number, patch: VehiclePatch): Result<{ vehicle: Vehicle }> {
  const denied = guard(actor, "inventory.edit");
  if (denied) return denied;
  const current = state.vehicles.find((v) => v.id === id);
  if (!current || !actor.branchIds.includes(current.branchId)) return fail(404, "not_found", "Record not found.");
  if (current.version !== expectedVersion) {
    return fail(409, "conflict", "This vehicle changed while you were editing. Review the latest version and reapply your changes.", { latest: { version: current.version, asking: current.asking, km: current.km, costs: current.costs } });
  }
  const costs = { ...current.costs, ...patch.costs };
  const updated: Vehicle = { ...current, ...patch, costs, branchId: patch.branchId ?? current.branchId, version: current.version + 1, costComplete: costs.acquisition > 0 && costs.refurbishment > 0 };
  let next: WorkspaceState = { ...state, vehicles: state.vehicles.map((v) => (v.id === id ? updated : v)) };
  next = withAudit(next, actor, "inventory.updated", id, `Version ${current.version} → ${updated.version}`);
  return ok(next, { vehicle: updated });
}

export type Transition = { to: Lifecycle; note?: string; sale?: { salePrice: string; directCosts: string; closedOn: string } };

/** Available > Reserved > Sold require explicit transition forms; Sold requires a reconciled sale record. Reservation or sale queues a pause for active campaigns. */
export function transitionVehicle(state: WorkspaceState, actor: Actor, id: string, expectedVersion: number, transition: Transition): Result<{ vehicle: Vehicle; sale?: Sale; pausedCampaigns: string[] }> {
  const denied = guard(actor, "inventory.transition");
  if (denied) return denied;
  const current = state.vehicles.find((v) => v.id === id);
  if (!current || !actor.branchIds.includes(current.branchId)) return fail(404, "not_found", "Record not found.");
  if (current.version !== expectedVersion) return fail(409, "conflict", "This vehicle changed while you were editing. Reload and try again.", { latest: { version: current.version, status: current.status } });
  const allowed: Record<Lifecycle, Lifecycle[]> = { preparation: ["available", "archived"], available: ["reserved", "sold", "archived", "preparation"], reserved: ["available", "sold"], sold: [], archived: [] };
  if (!allowed[current.status].includes(transition.to)) return fail(422, "invalid", `A ${current.status} vehicle cannot move to ${transition.to}.`, { fields: { to: "Choose a permitted next state." } });
  const fields: Record<string, string> = {};
  if (transition.to === "available") {
    if (current.asking === null) fields.asking = "Set an asking price through Pricing Intelligence before making this vehicle available.";
    if (!current.hasImages) fields.photos = "Add at least one photo before making this vehicle available.";
    if (landedCost(current.costs) === 0) fields.costs = "Record the acquisition cost before making this vehicle available.";
  }
  if (transition.to === "reserved" && !trim(transition.note)) fields.note = "Enter who the vehicle is reserved for or the booking reference.";
  let sale: Sale | undefined;
  if (transition.to === "sold") {
    const price = toPaise(transition.sale?.salePrice ?? "");
    const direct = toPaise(transition.sale?.directCosts ?? "0") ?? 0;
    if (price === null || Number.isNaN(price) || price <= 0) fields.salePrice = "Enter the completed sale price in rupees.";
    if (Number.isNaN(direct)) fields.directCosts = "Enter direct selling and holding costs in rupees.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transition.sale?.closedOn ?? "")) fields.closedOn = "Choose the sale-close date.";
    if (!Object.keys(fields).length && price !== null && !Number.isNaN(price)) {
      sale = {
        id: nextId("S", state.sales.map((s) => s.id), 392), vehicleId: id, branchId: current.branchId, label: `${current.make} ${current.model}`, closedAt: ist(...((transition.sale!.closedOn).split("-").map(Number) as [number, number, number]), 12),
        salePrice: price, landed: landedCost(current.costs), directCosts: direct, state: "Completed", note: "Recorded at transition",
      };
    }
  }
  if (Object.keys(fields).length) return fail(422, "invalid", "Complete the transition form to continue.", { fields });
  const stamp = now();
  const updated: Vehicle = { ...current, status: transition.to, version: current.version + 1, soldAt: transition.to === "sold" ? sale?.closedAt ?? stamp : current.soldAt, channels: transition.to === "available" ? current.channels : [] };
  const pausedCampaigns: string[] = [];
  const campaigns = state.campaigns.map((c) => {
    if (c.vehicleId === id && (transition.to === "reserved" || transition.to === "sold" || transition.to === "archived") && (c.status === "Active" || c.status === "Publishing" || c.status === "Approved")) {
      pausedCampaigns.push(c.id);
      return c.status === "Active" || c.status === "Publishing"
        ? { ...c, status: "Pausing" as const, platformAck: "awaiting" as const, history: [...c.history, { at: stamp, actor: "System", action: `Automatic pause queued: vehicle ${transition.to}` }] }
        : { ...c, status: "Draft" as const, history: [...c.history, { at: stamp, actor: "System", action: `Approval invalidated: vehicle ${transition.to}` }] };
    }
    return c;
  });
  let next: WorkspaceState = { ...state, vehicles: state.vehicles.map((v) => (v.id === id ? updated : v)), campaigns, sales: sale ? [sale, ...state.sales] : state.sales };
  next = withAudit(next, actor, "inventory.transition", id, `${current.status} → ${transition.to}${sale ? ` (sale ${sale.id})` : ""}`);
  return ok(next, { vehicle: updated, sale, pausedCampaigns });
}

export type ImportRow = { line: number; values: Record<string, string>; status: "valid" | "duplicate" | "error"; errors: string[] };

export const IMPORT_COLUMNS = ["make", "model", "variant", "year", "fuel", "transmission", "km", "owners", "registration", "acquired_on", "acquisition_cost", "asking"] as const;

/** CSV upload > mapping > validation preview > explicit Commit valid rows. Duplicates and errors are reported; nothing is overwritten silently. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function importPreview(state: WorkspaceState, csv: string, mapping: Record<string, string>, branchId: string): { rows: ImportRow[]; headers: string[] } {
  const parsed = parseCsv(csv);
  const headers = parsed[0] ?? [];
  const registrations = new Set(state.vehicles.filter((v) => v.status !== "archived").map((v) => v.registration));
  const seen = new Set<string>();
  const rows: ImportRow[] = parsed.slice(1).map((cells, index) => {
    const values: Record<string, string> = {};
    for (const column of IMPORT_COLUMNS) {
      const header = mapping[column];
      const at = header ? headers.indexOf(header) : -1;
      values[column] = at >= 0 ? trim(cells[at]) : "";
    }
    const input = importToInput(values, branchId);
    const errors = Object.values(validateVehicle(input));
    const registration = trim(values.registration);
    let status: ImportRow["status"] = errors.length ? "error" : "valid";
    if (!errors.length && registration && (registrations.has(registration) || seen.has(registration))) { status = "duplicate"; errors.push("Registration already exists in stock or earlier in this file."); }
    if (registration) seen.add(registration);
    return { line: index + 2, values, status, errors };
  });
  return { rows, headers };
}

function importToInput(values: Record<string, string>, branchId: string): VehicleInput {
  return {
    make: values.make, model: values.model, variant: values.variant, year: values.year, fuel: (values.fuel as Vehicle["fuel"]) || "", transmission: (values.transmission as Vehicle["transmission"]) || "", km: values.km,
    owners: values.owners || "1", registration: values.registration, acquiredOn: values.acquired_on, branchId, status: "preparation", asking: values.asking,
    costs: { acquisition: values.acquisition_cost, transport: "", inspection: "", refurbishment: "", fees: "" }, photos: "0",
  };
}

export function importCommit(state: WorkspaceState, actor: Actor, rows: ImportRow[], branchId: string, batchKey: string): Result<{ imported: number; skipped: number }> {
  const denied = guard(actor, "inventory.edit") ?? branchGuard(actor, branchId);
  if (denied) return denied;
  if (state.audit.some((a) => a.action === "inventory.import" && a.target === batchKey)) return ok(state, { imported: 0, skipped: rows.length }); // idempotent retry cannot double-import
  let next = state;
  let imported = 0;
  for (const row of rows.filter((r) => r.status === "valid")) {
    const result = addVehicle(next, actor, importToInput(row.values, branchId));
    if (result.ok) { next = result.state; imported += 1; }
  }
  next = withAudit(next, actor, "inventory.import", batchKey, `${imported} imported, ${rows.length - imported} skipped`);
  return ok(next, { imported, skipped: rows.length - imported });
}

export function bulkArchive(state: WorkspaceState, actor: Actor, ids: string[]): Result<{ archived: number }> {
  const denied = guard(actor, "inventory.bulk");
  if (denied) return denied;
  let archived = 0;
  const vehicles = state.vehicles.map((v) => {
    if (ids.includes(v.id) && actor.branchIds.includes(v.branchId) && (v.status === "available" || v.status === "preparation")) { archived += 1; return { ...v, status: "archived" as const, version: v.version + 1, channels: [] }; }
    return v;
  });
  return ok(withAudit({ ...state, vehicles }, actor, "inventory.bulk_archive", ids.join(","), `${archived} archived`), { archived });
}

export function bulkAssignBranch(state: WorkspaceState, actor: Actor, ids: string[], branchId: string): Result<{ moved: number }> {
  const denied = guard(actor, "inventory.bulk") ?? branchGuard(actor, branchId);
  if (denied) return denied;
  let moved = 0;
  const vehicles = state.vehicles.map((v) => {
    if (ids.includes(v.id) && actor.branchIds.includes(v.branchId) && v.status !== "sold" && v.status !== "archived") { moved += 1; return { ...v, branchId, version: v.version + 1 }; }
    return v;
  });
  return ok(withAudit({ ...state, vehicles }, actor, "inventory.bulk_assign", ids.join(","), `${moved} moved to ${branchId}`), { moved });
}

export type PublishResult = { channel: string; status: "Synced" | "Not configured" | "Failed"; detail: string };

/** Publishing opens a channel checklist and returns per-channel sync results. */
export function publishVehicles(state: WorkspaceState, actor: Actor, ids: string[]): Result<{ results: { id: string; channels: PublishResult[] }[] }> {
  const denied = guard(actor, "inventory.transition");
  if (denied) return denied;
  const publishing = state.integrations.find((i) => i.id === "publishing");
  const results = ids.map((id) => {
    const vehicle = state.vehicles.find((v) => v.id === id);
    if (!vehicle || vehicle.status !== "available") return { id, channels: [{ channel: "Owned site", status: "Failed" as const, detail: "Only available vehicles can be published." }] };
    const owned: PublishResult = publishing?.state === "Degraded"
      ? { channel: "Owned site", status: "Failed", detail: "Owned site returned a timeout; retry from Settings → Integrations." }
      : { channel: "Owned site", status: "Synced", detail: "Listing updated." };
    return { id, channels: [owned, { channel: "Marketplaces", status: "Not configured" as const, detail: "Requires an authorised publishing API." }] };
  });
  const vehicles = state.vehicles.map((v) => (ids.includes(v.id) && results.find((r) => r.id === v.id)?.channels[0].status === "Synced" ? { ...v, channels: Array.from(new Set([...v.channels, "Owned site"])) } : v));
  return ok(withAudit({ ...state, vehicles }, actor, "inventory.publish", ids.join(","), "Channel checklist run"), { results });
}
