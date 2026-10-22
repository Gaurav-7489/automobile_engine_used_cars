import type { CostLedger, Sale, Vehicle, InventoryEvent } from "../domain";
import { distribute, mulberry32 } from "../rng";
import { daysBeforeSnapshot, ist } from "../time";
import { lakh } from "../format";

/**
 * Illustrative stock for the Kochi branch.
 * The generator is built so the published aggregates reconcile with the visible rows:
 *  - 48 unsold records: 42 available, 3 reserved, 3 in preparation
 *  - available age buckets 0-15 / 16-30 / 31-45 / >45 = 12 / 13 / 10 / 7
 *  - landed capital by age (all unsold) = 120 / 110 / 90 / 60 L = ₹3.80 Cr
 *  - estimated gross at asking over cost-complete, priced, available stock = ₹24.6 L
 */

type Seed = {
  id: string; make: string; model: string; variant: string; year: number; fuel: Vehicle["fuel"]; transmission: Vehicle["transmission"];
  km: number; owners: number; status: Vehicle["status"]; age: number; landedL?: number; askL?: number; enquiries: number; median: number;
};

const FIXED: Seed[] = [
  { id: "V-1042", make: "BMW", model: "520d", variant: "Luxury Line", year: 2019, fuel: "Diesel", transmission: "Automatic", km: 58000, owners: 1, status: "available", age: 32, landedL: 26.0, askL: 28.5, enquiries: 9, median: 5 },
  { id: "V-1043", make: "Mercedes-Benz", model: "E220d", variant: "Avantgarde", year: 2018, fuel: "Diesel", transmission: "Automatic", km: 62000, owners: 2, status: "available", age: 45, landedL: 24.8, askL: 26.8, enquiries: 2, median: 5 },
  { id: "V-1044", make: "Audi", model: "Q5", variant: "Premium Plus", year: 2020, fuel: "Diesel", transmission: "Automatic", km: 48000, owners: 1, status: "available", age: 18, landedL: 32.7, askL: 35.0, enquiries: 6, median: 5 },
  { id: "V-1045", make: "Toyota", model: "Fortuner", variant: "4x2 AT", year: 2021, fuel: "Diesel", transmission: "Automatic", km: 36000, owners: 1, status: "reserved", age: 22, landedL: 29.2, askL: 32.0, enquiries: 7, median: 5 },
  { id: "V-1046", make: "Hyundai", model: "Creta", variant: "SX AT", year: 2021, fuel: "Petrol", transmission: "Automatic", km: 29000, owners: 1, status: "preparation", age: 12, landedL: 12.1, askL: 14.0, enquiries: 1, median: 5 },
  { id: "V-1047", make: "BMW", model: "X1", variant: "sDrive20d", year: 2020, fuel: "Diesel", transmission: "Automatic", km: 40000, owners: 1, status: "available", age: 25, landedL: 24.0, askL: 26.0, enquiries: 4, median: 5 },
  { id: "V-1048", make: "Maruti Suzuki", model: "Baleno", variant: "Alpha", year: 2022, fuel: "Petrol", transmission: "Manual", km: 20000, owners: 1, status: "preparation", age: 6, landedL: 6.0, askL: 7.2, enquiries: 0, median: 5 },
  { id: "V-1049", make: "Renault", model: "Kiger", variant: "RXZ", year: 2022, fuel: "Petrol", transmission: "Manual", km: 24000, owners: 1, status: "reserved", age: 8, landedL: 7.0, askL: 8.5, enquiries: 3, median: 5 },
];

const CATALOGUE: { make: string; model: string; variant: string; fuel: Vehicle["fuel"]; transmission: Vehicle["transmission"]; tier: number }[] = [
  { make: "Maruti Suzuki", model: "Alto", variant: "VXi", fuel: "Petrol", transmission: "Manual", tier: 2 },
  { make: "Maruti Suzuki", model: "WagonR", variant: "ZXi", fuel: "Petrol", transmission: "Manual", tier: 3 },
  { make: "Maruti Suzuki", model: "Swift", variant: "ZXi", fuel: "Petrol", transmission: "Manual", tier: 5 },
  { make: "Hyundai", model: "i20", variant: "Asta", fuel: "Petrol", transmission: "Manual", tier: 6 },
  { make: "Honda", model: "City", variant: "VX", fuel: "Petrol", transmission: "Automatic", tier: 8 },
  { make: "Hyundai", model: "Verna", variant: "SX", fuel: "Diesel", transmission: "Manual", tier: 8 },
  { make: "Tata", model: "Nexon", variant: "XZ+", fuel: "Diesel", transmission: "Manual", tier: 9 },
  { make: "Mahindra", model: "XUV500", variant: "W10", fuel: "Diesel", transmission: "Manual", tier: 10 },
  { make: "Kia", model: "Seltos", variant: "HTX", fuel: "Diesel", transmission: "Automatic", tier: 12 },
  { make: "Skoda", model: "Octavia", variant: "Style", fuel: "Diesel", transmission: "Automatic", tier: 14 },
  { make: "Volkswagen", model: "Vento", variant: "Highline", fuel: "Diesel", transmission: "Automatic", tier: 7 },
  { make: "Toyota", model: "Innova Crysta", variant: "GX", fuel: "Diesel", transmission: "Manual", tier: 17 },
  { make: "Jeep", model: "Compass", variant: "Limited", fuel: "Diesel", transmission: "Manual", tier: 19 },
  { make: "Volvo", model: "XC40", variant: "Inscription", fuel: "Diesel", transmission: "Automatic", tier: 28 },
];

const BUCKETS = [
  { name: "0-15", min: 0, max: 15, totalL: 120, count: 15 },
  { name: "16-30", min: 16, max: 30, totalL: 110, count: 15 },
  { name: "31-45", min: 31, max: 45, totalL: 90, count: 11 },
  { name: ">45", min: 46, max: 80, totalL: 60, count: 7 },
] as const;

function splitLanded(landed: number, rng: () => number): CostLedger {
  const transport = Math.round((landed * 0.012) / 10_000) * 10_000;
  const inspection = Math.round((landed * 0.002) / 10_000) * 10_000;
  const refurbishment = Math.round((landed * 0.018) / 10_000) * 10_000;
  const fees = Math.round((landed * 0.008) / 10_000) * 10_000;
  void rng;
  return { acquisition: landed - transport - inspection - refurbishment - fees, transport, inspection, refurbishment, fees };
}

export const sumCosts = (c: CostLedger): number => c.acquisition + c.transport + c.inspection + c.refurbishment + c.fees;

function fixedCosts(landed: number, kind: "stock"): CostLedger {
  void kind;
  // V-1042 and V-1043 carry hand-set ledgers from the specification sample dataset.
  return splitLanded(landed, () => 0.5);
}

function build(): Vehicle[] {
  const rng = mulberry32(20261019);
  const vehicles: Vehicle[] = [];

  // Remaining statuses to place: one extra reserved (31-45 bucket) and one extra in preparation (16-30 bucket).
  const bucketGenerated: Record<string, number> = { "0-15": 12, "16-30": 12, "31-45": 9, ">45": 7 };
  const extraStatus: Record<string, Vehicle["status"][]> = { "16-30": ["preparation"], "31-45": ["reserved"], "0-15": [], ">45": [] };

  let nextId = 1050;
  const generated: Seed[] = [];
  for (const bucket of BUCKETS) {
    const count = bucketGenerated[bucket.name];
    const fixedLanded = FIXED.filter((s) => s.age >= bucket.min && s.age <= bucket.max).reduce((a, s) => a + lakh(s.landedL ?? 0), 0);
    const remaining = lakh(bucket.totalL) - fixedLanded;
    const unit = 50_000; // ₹500 units keep landed costs on clean rupee amounts
    const parts = distribute(remaining / unit, count, rng, 1.1).map((part) => part * unit);
    const extras = [...extraStatus[bucket.name]];
    parts.forEach((landed, index) => {
      const entry = CATALOGUE.reduce((best, c) => (Math.abs(lakh(c.tier) - landed) < Math.abs(lakh(best.tier) - landed) ? c : best), CATALOGUE[0]);
      const status = extras.length && index === 0 ? extras.shift()! : "available";
      const age = bucket.min + Math.floor(rng() * (Math.min(bucket.max, bucket.min + 14) - bucket.min + 1));
      generated.push({
        id: `V-${nextId++}`, make: entry.make, model: entry.model, variant: entry.variant, year: 2017 + Math.floor(rng() * 6),
        fuel: entry.fuel, transmission: entry.transmission, km: 12000 + Math.floor(rng() * 70) * 1000, owners: 1 + Math.floor(rng() * 2),
        // Only V-1043 carries the price-review flag in the sample dataset: older stock keeps healthy enquiry counts.
        status, age, enquiries: age > 30 ? 5 + Math.floor(rng() * 5) : Math.floor(rng() * 9), median: 5, landedL: landed / 10_000_000,
      });
    });
  }

  const priceReviewIds = new Set(["V-1043"]);
  const all = [...FIXED, ...generated];
  for (const seed of all) {
    const landedPaise = seed.askL !== undefined ? lakh(seed.landedL ?? 0) : Math.round((seed.landedL ?? 0) * 10_000_000 / 50_000) * 50_000;
    const costs = seed.askL !== undefined ? fixedCosts(landedPaise, "stock") : splitLanded(landedPaise, rng);
    if (seed.id === "V-1042") Object.assign(costs, { acquisition: lakh(25.0), transport: lakh(0.3), inspection: lakh(0.05), refurbishment: lakh(0.45), fees: lakh(0.2) });
    if (seed.id === "V-1043") Object.assign(costs, { acquisition: lakh(23.5), transport: lakh(0.35), inspection: lakh(0.05), refurbishment: lakh(0.6), fees: lakh(0.3) });
    const landed = sumCosts(costs);
    const margin = 0.045 + rng() * 0.07;
    const asking = seed.askL !== undefined ? lakh(seed.askL) : Math.round((landed * (1 + margin)) / 500_000) * 500_000;
    vehicles.push({
      id: seed.id, branchId: "koc", make: seed.make, model: seed.model, variant: seed.variant, year: seed.year, fuel: seed.fuel,
      transmission: seed.transmission, km: seed.km, owners: seed.owners, registration: `KL ${String(7 + (all.indexOf(seed) % 40)).padStart(2, "0")} •• ••••`,
      status: seed.status, acquiredAt: daysBeforeSnapshot(seed.age), asking, costs, costComplete: true, hasImages: true,
      enquiries14d: seed.enquiries, cohortMedianEnquiries: seed.median, version: 1 + (seed.id === "V-1043" ? 11 : 0),
      channels: seed.status === "available" ? ["Owned site"] : [], documents: [
        { name: "Registration certificate", provided: true }, { name: "Inspection report", provided: seed.id !== "V-1047" }, { name: "Service history", provided: rng() > 0.4 },
      ],
    });
  }

  // Two available records are missing a cost line or photos: attention badges, excluded from gross.
  const incomplete = ["V-1058", "V-1071"];
  for (const vehicle of vehicles) {
    if (incomplete.includes(vehicle.id)) vehicle.costComplete = false; // cost evidence missing: excluded from estimated gross
    if (vehicle.id === "V-1066") vehicle.hasImages = false;
  }

  // Reconcile estimated gross at asking (cost-complete, priced, available) to ₹24.6 L by nudging generated asks.
  const target = lakh(24.6);
  const eligible = (v: Vehicle) => v.status === "available" && v.costComplete && v.asking !== null;
  let gross = vehicles.filter(eligible).reduce((a, v) => a + (v.asking! - sumCosts(v.costs)), 0);
  const adjustable = vehicles.filter((v) => eligible(v) && !FIXED.some((f) => f.id === v.id));
  for (const vehicle of adjustable) vehicle.asking = Math.round(vehicle.asking! / 500_000) * 500_000;
  gross = vehicles.filter(eligible).reduce((a, v) => a + (v.asking! - sumCosts(v.costs)), 0);
  let delta = target - gross;
  const step = 500_000; // ₹5,000
  const per = Math.trunc(delta / adjustable.length / step) * step;
  for (const vehicle of adjustable) { vehicle.asking! += per; delta -= per; }
  for (let i = 0; delta >= step && i < adjustable.length * 4; i += 1) { adjustable[i % adjustable.length].asking! += step; delta -= step; }
  adjustable[adjustable.length - 1].asking! += delta;
  gross = vehicles.filter(eligible).reduce((a, v) => a + (v.asking! - sumCosts(v.costs)), 0);
  if (gross !== target) throw new Error(`Gross reconciliation failed: ${gross}`);

  // Round generated asks to ₹100 where possible without breaking the total (keep integer paise).
  void priceReviewIds;
  return vehicles;
}

export const KOCHI_STOCK: Vehicle[] = build();

/** Smaller illustrative stock for the other permitted branches. */
function buildOther(branchId: string, prefix: string, count: number, seed: number): Vehicle[] {
  const rng = mulberry32(seed);
  const result: Vehicle[] = [];
  for (let i = 0; i < count; i += 1) {
    const entry = CATALOGUE[Math.floor(rng() * CATALOGUE.length)];
    const costs = splitLanded(lakh(entry.tier) + Math.round(rng() * 50) * 50_000, rng);
    const landed = sumCosts(costs);
    result.push({
      id: `${prefix}-${2001 + i}`, branchId, make: entry.make, model: entry.model, variant: entry.variant, year: 2018 + Math.floor(rng() * 5), fuel: entry.fuel,
      transmission: entry.transmission, km: 15000 + Math.floor(rng() * 60) * 1000, owners: 1 + Math.floor(rng() * 2), registration: "KL •• •• ••••",
      status: i === 0 ? "reserved" : i === 1 ? "preparation" : "available", acquiredAt: daysBeforeSnapshot(3 + Math.floor(rng() * 55)),
      asking: Math.round((landed * 1.08) / 500_000) * 500_000, costs, costComplete: true, hasImages: true, enquiries14d: Math.floor(rng() * 8), cohortMedianEnquiries: 5,
      version: 1, channels: ["Owned site"], documents: [{ name: "Registration certificate", provided: true }],
    });
  }
  return result;
}

export const THRISSUR_STOCK = buildOther("tcr", "T", 9, 7711);
export const KOZHIKODE_STOCK = buildOther("ccj", "K", 7, 9137);

/** Monthly synthetic series for Jan-Jun 2026 (acquired, sold, realized profit in ₹ L). */
export const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"] as const;

const SERIES: Record<string, { acquired: number[]; sold: number[]; profitL: number[] }> = {
  koc: { acquired: [5, 7, 6, 8, 6, 9], sold: [3, 4, 5, 5, 7, 6], profitL: [2.0, 2.5, 3.1, 2.9, 3.4, 4.3] },
  tcr: { acquired: [1, 2, 1, 2, 1, 2], sold: [1, 1, 1, 2, 1, 2], profitL: [0.4, 0.5, 0.4, 0.8, 0.5, 0.9] },
  ccj: { acquired: [1, 1, 2, 1, 2, 1], sold: [1, 0, 1, 1, 1, 1], profitL: [0.3, 0, 0.4, 0.3, 0.4, 0.4] },
};

const SALE_MODELS = ["BMW 3 Series", "Honda City", "Hyundai Creta", "Toyota Innova Crysta", "Maruti Suzuki Swift", "Tata Nexon", "Kia Seltos", "Mahindra XUV700", "Skoda Octavia", "Mercedes-Benz C-Class", "Audi A4", "Volkswagen Polo"];

function buildSalesAndEvents(): { sales: Sale[]; events: InventoryEvent[] } {
  const rng = mulberry32(99173);
  const sales: Sale[] = [];
  const events: InventoryEvent[] = [];
  let saleNo = 302;
  for (const [branchId, series] of Object.entries(SERIES)) {
    MONTHS.forEach((month, mi) => {
      const [y, m] = month.split("-").map(Number);
      const soldCount = series.sold[mi];
      const totalProfit = lakh(series.profitL[mi]);
      let fixedProfit = 0;
      const records: Sale[] = [];
      if (branchId === "koc" && month === "2026-03") {
        // Specification sample: S-301 Audi Q5, ₹34.5 L - ₹32.7 L - ₹0.60 L = ₹1.20 L realized.
        records.push({ id: "S-301", vehicleId: "H-0301", branchId, label: "Audi Q5", closedAt: ist(y, m, 14, 16, 20), salePrice: lakh(34.5), landed: lakh(32.7), directCosts: lakh(0.6), state: "Completed", note: "Historical sample sale" });
        fixedProfit = lakh(1.2);
      }
      const remainingCount = soldCount - records.length;
      const profits = distribute(totalProfit - fixedProfit, remainingCount, rng, 0.9);
      profits.forEach((realized, index) => {
        const label = SALE_MODELS[Math.floor(rng() * SALE_MODELS.length)];
        const landed = lakh(5 + Math.floor(rng() * 24) + rng());
        const direct = Math.round((landed * (0.008 + rng() * 0.012)) / 5000) * 5000;
        records.push({
          id: `S-${saleNo++}`, vehicleId: `H-${String(400 + saleNo)}`, branchId, label, closedAt: ist(y, m, 2 + ((index * 5 + mi) % 26), 11 + (index % 6), (index * 13) % 60),
          salePrice: landed + realized + direct, landed, directCosts: direct, state: "Completed", note: "Illustrative closed sale",
        });
      });
      sales.push(...records);
      records.forEach((sale) => events.push({ id: `E-${sale.id}`, branchId, type: "sold", at: sale.closedAt, label: sale.label, ref: sale.id }));
      for (let k = 0; k < series.acquired[mi]; k += 1) {
        events.push({ id: `E-A-${branchId}-${month}-${k + 1}`, branchId, type: "acquired", at: ist(y, m, 1 + ((k * 4 + mi * 3) % 27), 10 + (k % 5), (k * 11) % 60), label: SALE_MODELS[Math.floor(rng() * SALE_MODELS.length)], ref: `H-${branchId.toUpperCase()}-${month.slice(2).replace("-", "")}${k + 1}` });
      }
    });
  }
  // Excluded records: one void sale and one unreconciled sale never enter realized totals.
  sales.push({ id: "S-390", vehicleId: "H-0390", branchId: "koc", label: "Hyundai Verna", closedAt: ist(2026, 6, 21, 12, 5), salePrice: lakh(8.4), landed: lakh(7.9), directCosts: lakh(0.2), state: "Void", note: "Voided: buyer withdrew" });
  sales.push({ id: "S-391", vehicleId: "H-0391", branchId: "koc", label: "Tata Harrier", closedAt: ist(2026, 6, 28, 15, 40), salePrice: lakh(17.8), landed: lakh(16.9), directCosts: lakh(0.4), state: "Unreconciled", note: "Settlement not yet reconciled" });
  return { sales, events };
}

const generated = buildSalesAndEvents();
export const SALES: Sale[] = generated.sales;
export const EVENTS: InventoryEvent[] = generated.events;
export const MONTHLY_SERIES = SERIES;

/** Archived records are separate from live stock and excluded from availability and advertising. */
export const ARCHIVED_STOCK: Vehicle[] = [
  { ...KOCHI_STOCK[5], id: "V-0988", make: "Ford", model: "EcoSport", variant: "Titanium", year: 2017, status: "archived", asking: lakh(5.5), version: 3, channels: [] },
  { ...KOCHI_STOCK[6], id: "V-0991", make: "Nissan", model: "Terrano", variant: "XL", year: 2016, status: "archived", asking: lakh(4.2), version: 2, channels: [] },
  { ...KOCHI_STOCK[7], id: "V-0995", make: "Fiat", model: "Linea", variant: "Emotion", year: 2015, status: "archived", asking: lakh(2.8), version: 2, channels: [] },
  { ...KOCHI_STOCK[8], id: "V-0999", make: "Chevrolet", model: "Beat", variant: "LT", year: 2014, status: "archived", asking: lakh(1.9), version: 4, channels: [] },
];

/** Deterministic days-to-sale per completed sale; the Kochi cohort has a median of exactly 32 days. */
function daysToSaleMap(): Record<string, number> {
  const rng = mulberry32(4455);
  const result: Record<string, number> = {};
  for (const branchId of ["koc", "tcr", "ccj"]) {
    const rows = SALES.filter((s) => s.branchId === branchId && s.state === "Completed");
    const days = rows.map(() => 14 + Math.floor(rng() * 56));
    if (branchId === "koc" && rows.length === 30) {
      const sorted = [...days].sort((a, b) => a - b).map((d, i) => (i < 14 ? Math.min(d, 31) : i > 15 ? Math.max(d, 33) : 32));
      sorted.forEach((d, i) => { days[(i * 7) % 30] = d; });
      // The stride walk visits every index once because 7 and 30 are coprime.
    }
    rows.forEach((sale, i) => { result[sale.id] = days[i]; });
  }
  return result;
}

/** Sold vehicles appear in the Sold lifecycle tab, linked to their reconciled sale. */
export function soldVehicles(): Vehicle[] {
  const days = daysToSaleMap();
  return SALES.filter((sale) => sale.state === "Completed").map((sale) => {
    const [make, ...rest] = sale.label.split(" ");
    const costs = splitLanded(sale.landed, () => 0.5);
    const closed = new Date(sale.closedAt);
    return {
      id: sale.vehicleId, branchId: sale.branchId, make, model: rest.join(" ") || sale.label, variant: "—", year: 2019, fuel: "Diesel" as const, transmission: "Automatic" as const,
      km: 45000, owners: 1, registration: "KL •• •• ••••", status: "sold" as const, acquiredAt: new Date(closed.getTime() - days[sale.id] * 86_400_000).toISOString(), soldAt: sale.closedAt, asking: sale.salePrice, costs, costComplete: true,
      hasImages: true, enquiries14d: 0, cohortMedianEnquiries: 5, version: 1, channels: [], documents: [],
    };
  });
}
