import type { JourneyEvent, Lead, Vehicle } from "@vandlabs/contracts";
import { capitalReport } from "./capital";
import { InputError } from "./errors";
import type { Snapshot } from "./index";

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

export function deadStockReport(snapshot: Pick<Snapshot, "vehicles" | "leads" | "events" | "costs" | "sales" | "inventoryHistory">, asOf = new Date(), policy: DeadStockPolicy = defaultDeadStockPolicy) {
  const now = asOf.getTime();
  if (!Number.isFinite(now)) throw new InputError("Invalid report date.");
  validateDeadStockPolicy(policy);
  const labels = bandLabels(policy);
  const windowStart = now - policy.lookbackDays * DAY;
  const capital = capitalReport(snapshot.vehicles, snapshot.costs ?? [], snapshot.sales ?? [], asOf);

  const rows = snapshot.vehicles.flatMap((vehicle: Vehicle) => {
    const economics = capital.rows.find(r => r.vehicleId === vehicle.id)!;
    if (!economics.active) return []; // sold stock is not dead stock
    const created = Date.parse(vehicle.createdAt);
    const listingAge = Number.isFinite(created) && created <= now ? indiaDay(now) - indiaDay(created) : null;
    const [ageDays, ageBasis]: [number | null, AgeBasis] = economics.ageDays !== null ? [economics.ageDays, "acquisition"] : listingAge !== null ? [listingAge, "listing"] : [null, "unknown"];
    const band = ageDays === null ? null : policy.bandLimits.findIndex(limit => ageDays <= limit) === -1 ? 3 : policy.bandLimits.findIndex(limit => ageDays <= limit);

    const sameTenant = <T extends { tenantId: string }>(r: T) => r.tenantId === vehicle.tenantId;
    const views = snapshot.events.filter((e: JourneyEvent) => sameTenant(e) && e.vehicleId === vehicle.id && e.type === "vehicle_view" && within(e.occurredAt, windowStart, now)).length;
    const vehicleLeads = snapshot.leads.filter(l => sameTenant(l) && concerns(l, vehicle.id));
    const enquiries = vehicleLeads.filter(l => within(l.createdAt, windowStart, now)).length;
    const openLeads = vehicleLeads.filter(l => !["won", "lost"].includes(l.stage)).length;
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
    if (aged && !reserved && views >= policy.minViews && enquiries === 0 && (daysSincePrice === null || daysSincePrice >= policy.priceReviewAfterDays))
      recommendations.push({ action: "review_price", reason: "Viewed but not enquired about", evidence: [`${views} views and 0 enquiries in ${policy.lookbackDays} days`, lastPriceChange ? `Last price change ${daysSincePrice} days ago` : "No recorded price change", "Compare against permitted market evidence before changing price"] });
    if (openLeads > 0 && aged) recommendations.push({ action: "follow_up", reason: "Open enquiries on aged stock", evidence: [`${openLeads} open ${openLeads === 1 ? "enquiry" : "enquiries"}`] });

    return [{ vehicleId: vehicle.id, stockId: vehicle.stockId, label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(), locationId: vehicle.locationId,
      status: vehicle.availabilityStatus, ageDays, ageBasis, band: band === null ? null : labels[band], views, enquiries, openLeads, lastPriceChange,
      capitalLocked: economics.costBasis, recommendations, reviewRequired: true as const }];
  });

  const bands = labels.map(label => {
    const inBand = rows.filter(r => r.band === label), costed = inBand.filter(r => r.capitalLocked !== null);
    const cents = costed.reduce((sum, r) => sum + Math.round(r.capitalLocked! * 100), 0);
    if (!Number.isSafeInteger(cents)) throw new InputError("Report amounts exceed safe precision.");
    return { label, vehicles: inBand.length, recordedCapital: cents / 100, costCoverage: `${costed.length}/${inBand.length}` };
  });

  return {
    version: "dead-stock-rules-v1", asOf: asOf.toISOString(), policy,
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
    ],
  };
}
