import { requireCapability, type AuthenticatedPrincipal, type JourneyEvent, type Lead, type Vehicle } from "@vandlabs/contracts";
import { capitalReport } from "./capital";
import { InputError } from "./errors";
import { staffSnapshot, type Snapshot } from "./index";

// Dead-stock intelligence: deterministic, explainable rules over the dealership's own
// records. It never computes a new price, invents market demand or acts on its own.
// Every recommendation is a review prompt for staff with the evidence that triggered it.

export interface DeadStockPolicy {
  /** Inclusive upper bounds (days) of the first three bands; the last band is open-ended. */
  bandLimits: readonly [number, number, number];
  /** Activity window for views and enquiries. */
  lookbackDays: number;
  /** Fewer views than this in the window counts as low visibility. */
  minViews: number;
  /** Days since the last recorded price change before a price review is suggested. */
  priceReviewAfterDays: number;
}

export const defaultDeadStockPolicy: DeadStockPolicy = { bandLimits: [30, 60, 90], lookbackDays: 30, minViews: 10, priceReviewAfterDays: 21 };

/**
 * What the caller's role may see. Staff snapshots omit leads without lead:read, limit them to
 * assigned leads for assigned-only sales staff, and omit costs without capital:read. Withheld
 * evidence is reported as unavailable, never as zero.
 */
export interface DeadStockAccess { enquiries: "all" | "assigned" | "unavailable"; capital: boolean }
export const fullDeadStockAccess: DeadStockAccess = { enquiries: "all", capital: true };
export function deadStockAccess(p: Pick<AuthenticatedPrincipal, "capabilities" | "assignedLeadOnly">): DeadStockAccess {
  return { enquiries: !p.capabilities.includes("lead:read") ? "unavailable" : p.assignedLeadOnly ? "assigned" : "all", capital: p.capabilities.includes("capital:read") };
}

export type DeadStockAction = "inspect" | "publish" | "promote" | "review_price" | "follow_up";
export type AgeBasis = "acquisition" | "listing" | "unknown";

const DAY = 86_400_000;
const indiaDay = (time: number) => Math.floor((time + 19_800_000) / DAY); // Asia/Kolkata calendar day number

export function validateDeadStockPolicy(policy: DeadStockPolicy): DeadStockPolicy {
  const [a, b, c] = policy.bandLimits;
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!whole(a, 1, 3650) || !whole(b, 1, 3650) || !whole(c, 1, 3650) || !(a < b && b < c)) throw new InputError("Age bands must be ascending whole days.");
  if (!whole(policy.lookbackDays, 1, 365) || !whole(policy.minViews, 0, 1_000_000) || !whole(policy.priceReviewAfterDays, 1, 3650)) throw new InputError("Invalid dead-stock policy.");
  return policy;
}

export function bandLabels(policy: DeadStockPolicy = defaultDeadStockPolicy) {
  const [a, b, c] = policy.bandLimits;
  return [`0–${a} days`, `${a + 1}–${b} days`, `${b + 1}–${c} days`, `Over ${c} days`] as const;
}

const within = (iso: string, from: number, to: number) => { const t = Date.parse(iso); return Number.isFinite(t) && t >= from && t <= to; };
const concerns = (lead: Lead, vehicleId: string) => lead.vehicleId === vehicleId || (lead.vehicleIds ?? []).includes(vehicleId);

export function deadStockReport(snapshot: Pick<Snapshot, "vehicles" | "leads" | "events" | "costs" | "sales" | "inventoryHistory">, asOf = new Date(), policy: DeadStockPolicy = defaultDeadStockPolicy, access: DeadStockAccess = fullDeadStockAccess) {
  const now = asOf.getTime();
  if (!Number.isFinite(now)) throw new InputError("Invalid report date.");
  validateDeadStockPolicy(policy);
  const labels = bandLabels(policy);
  const windowStart = now - policy.lookbackDays * DAY;
  const showCapital = access.capital && snapshot.costs !== undefined, showEnquiries = access.enquiries !== "unavailable";
  const capital = capitalReport(snapshot.vehicles, showCapital ? snapshot.costs! : [], snapshot.sales ?? [], asOf);

  const rows = snapshot.vehicles.flatMap((vehicle: Vehicle, index) => {
    const economics = capital.rows[index]; // capitalReport keeps vehicle order; ids are not unique across tenants
    if (!economics.active) return []; // sold stock is not dead stock
    const created = Date.parse(vehicle.createdAt);
    const listingAge = Number.isFinite(created) && created <= now ? indiaDay(now) - indiaDay(created) : null;
    const [ageDays, ageBasis]: [number | null, AgeBasis] = economics.ageDays !== null ? [economics.ageDays, "acquisition"] : listingAge !== null ? [listingAge, "listing"] : [null, "unknown"];
    const band = ageDays === null ? null : policy.bandLimits.findIndex(limit => ageDays <= limit) === -1 ? 3 : policy.bandLimits.findIndex(limit => ageDays <= limit);

    const sameTenant = <T extends { tenantId: string }>(r: T) => r.tenantId === vehicle.tenantId;
    const views = snapshot.events.filter((e: JourneyEvent) => sameTenant(e) && e.vehicleId === vehicle.id && e.type === "vehicle_view" && within(e.occurredAt, windowStart, now)).length;
    const vehicleLeads = showEnquiries ? snapshot.leads.filter(l => sameTenant(l) && concerns(l, vehicle.id)) : null;
    const enquiries = vehicleLeads && vehicleLeads.filter(l => within(l.createdAt, windowStart, now)).length;
    const openLeads = vehicleLeads && vehicleLeads.filter(l => !["won", "lost"].includes(l.stage)).length;
    const priceChanges = (snapshot.inventoryHistory ?? []).filter(h => sameTenant(h) && h.vehicleId === vehicle.id && h.before.price !== h.after.price && Date.parse(h.occurredAt) <= now);
    const lastPriceChange = priceChanges.map(h => h.occurredAt).sort().at(-1) ?? null;
    const daysSincePrice = lastPriceChange ? Math.floor((now - Date.parse(lastPriceChange)) / DAY) : null;

    const issues: string[] = [];
    if (!Number.isFinite(vehicle.price) || vehicle.price <= 0) issues.push("No valid asking price");
    if (!vehicle.media.length) issues.push("No photographs");
    if (ageBasis === "unknown") issues.push("No valid acquisition or listing date");

    const recommendations: { action: DeadStockAction; reason: string; evidence: string[] }[] = [];
    const aged = band !== null && band >= 1;
    const reserved = vehicle.availabilityStatus === "reserved";
    if (issues.length) recommendations.push({ action: "inspect", reason: "Listing record is incomplete", evidence: issues });
    if (aged && vehicle.publishStatus !== "published" && !reserved) recommendations.push({ action: "publish", reason: "Aged stock is not published", evidence: [`${ageDays} days in stock (${ageBasis} date)`, `Publish status: ${vehicle.publishStatus}`] });
    if (aged && !reserved && vehicle.publishStatus === "published" && views < policy.minViews) recommendations.push({ action: "promote", reason: "Low visibility in the activity window", evidence: [`${views} vehicle views in ${policy.lookbackDays} days (threshold ${policy.minViews})`] });
    // "No enquiries" is only evidence when every enquiry for the dealership is visible.
    if (aged && !reserved && access.enquiries === "all" && views >= policy.minViews && enquiries === 0 && (daysSincePrice === null || daysSincePrice >= policy.priceReviewAfterDays))
      recommendations.push({ action: "review_price", reason: "Viewed but not enquired about", evidence: [`${views} views and 0 enquiries in ${policy.lookbackDays} days`, lastPriceChange ? `Last price change ${daysSincePrice} days ago` : "No recorded price change", "Compare against permitted market evidence before changing price"] });
    if (openLeads && aged) recommendations.push({ action: "follow_up", reason: "Open enquiries on aged stock", evidence: [`${openLeads} open ${access.enquiries === "assigned" ? "assigned " : ""}${openLeads === 1 ? "enquiry" : "enquiries"}`] });

    return [{ vehicleId: vehicle.id, stockId: vehicle.stockId, label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(), locationId: vehicle.locationId,
      status: vehicle.availabilityStatus, ageDays, ageBasis, band: band === null ? null : labels[band], views, enquiries, openLeads, lastPriceChange,
      capitalLocked: showCapital ? economics.costBasis : null, recommendations, reviewRequired: true as const }];
  });

  const bands = labels.map(label => {
    const inBand = rows.filter(r => r.band === label), costed = inBand.filter(r => r.capitalLocked !== null);
    if (!showCapital) return { label, vehicles: inBand.length, recordedCapital: null, costCoverage: null };
    const cents = costed.reduce((sum, r) => sum + Math.round(r.capitalLocked! * 100), 0);
    if (!Number.isSafeInteger(cents)) throw new InputError("Report amounts exceed safe precision.");
    return { label, vehicles: inBand.length, recordedCapital: cents / 100, costCoverage: `${costed.length}/${inBand.length}` };
  });

  return {
    version: "dead-stock-rules-v1", asOf: asOf.toISOString(), policy, access,
    bands, unknownAge: rows.filter(r => r.band === null).length,
    vehicles: rows.sort((x, y) => (y.ageDays ?? -1) - (x.ageDays ?? -1)),
    assumptions: [
      "Age uses the recorded acquisition date when a cost record exists, otherwise the listing date; the basis is shown per vehicle.",
      `Views and enquiries are counted over the last ${policy.lookbackDays} days. A view is not a purchase signal on its own.`,
      "Recorded capital excludes vehicles without cost records; missing costs are not treated as zero.",
      "Recommendations are prompts for staff review. Prices are never changed or proposed automatically.",
    ],
    unavailable: [
      "Transfer recommendations: no permitted cross-location demand evidence is connected.",
      "Market-relative pricing: requires licensed comparable asking-price evidence.",
      ...(showCapital ? [] : ["Recorded capital and acquisition dates: requires capital access; ages use the listing date."]),
      ...(access.enquiries === "unavailable" ? ["Enquiries and follow-ups: requires CRM access; price reviews are not suggested without enquiry evidence."] : []),
      ...(access.enquiries === "assigned" ? ["Enquiry counts cover only leads assigned to you; price reviews are not suggested from partial enquiry evidence."] : []),
    ],
  };
}

/** Tenant-scoped report for the signed-in staff member, limited to evidence their role may see. */
export async function staffDeadStock(p: AuthenticatedPrincipal, asOf = new Date(), policy: DeadStockPolicy = defaultDeadStockPolicy) {
  for (const capability of ["inventory:read", "analytics:read"] as const) requireCapability(p, capability);
  return deadStockReport(await staffSnapshot(p), asOf, policy, deadStockAccess(p));
}
