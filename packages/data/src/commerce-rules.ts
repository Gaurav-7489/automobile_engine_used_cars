import { commercePlans, type AcquisitionRequest, type AcquisitionReport, type AcquisitionChoice, type CommerceState, type CommercePlan, type DataSource, type SourcingVehicle, type FuelObservation } from "@vandlabs/contracts";
export class CommerceError extends Error {
  constructor(public readonly status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 503, message: string, public readonly retryAfter?: number) { super(message); }
}
export function text(value: unknown, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new CommerceError(400, "Enter valid text fields.");
  return value.trim();
}
export function number(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new CommerceError(400, "Enter valid numeric fields.");
  return value;
}
export function future(value: unknown, now: Date): string {
  const date = text(value, 40);
  if (!Number.isFinite(Date.parse(date)) || Date.parse(date) <= now.getTime()) throw new CommerceError(400, "Expiry must be a valid future date.");
  return new Date(date).toISOString();
}
export function plan(value: unknown): CommercePlan {
  if (typeof value !== "string" || !Object.hasOwn(commercePlans, value)) throw new CommerceError(400, "Unknown subscription plan.");
  return value as CommercePlan;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommerceError(400, "Expected an object.");
  return value as Record<string, unknown>;
}
function bool(value: unknown) { if (typeof value !== "boolean") throw new CommerceError(400, "Expected a boolean."); return value; }
export function sourceInput(value: unknown, now: Date): DataSource {
  const b = object(value), kind = b.kind;
  if (!["dealer", "licensed_api", "demo"].includes(String(kind))) throw new CommerceError(400, "Unknown source type.");
  return { id: text(b.id, 64), name: text(b.name), kind: kind as DataSource["kind"], agreement: text(b.agreement, 250), dealerUse: bool(b.dealerUse), aiProcessing: b.aiProcessing === undefined ? false : bool(b.aiProcessing), redistribute: bool(b.redistribute), enabled: bool(b.enabled), expiresAt: future(b.expiresAt, now) };
}
function observed(value: unknown, now: Date) {
  const time = Date.parse(text(value, 40));
  if (!Number.isFinite(time) || time > now.getTime() + 60000) throw new CommerceError(400, "Observation timestamp is invalid or in the future.");
  return new Date(time).toISOString();
}
export function vehicleInput(value: unknown, source: DataSource, now: Date): SourcingVehicle {
  const b = object(value);
  if (!["petrol", "diesel", "electric", "hybrid"].includes(String(b.fuel)) || !["manual", "automatic"].includes(String(b.transmission))) throw new CommerceError(400, "Unknown fuel or transmission.");
  const nullable = (v: unknown, min: number, max: number) => v === null ? null : number(v, min, max);
  const resaleLow = nullable(b.resaleLow, 0, 100000000), resaleHigh = nullable(b.resaleHigh, 0, 100000000);
  if ((resaleLow === null) !== (resaleHigh === null) || (resaleLow !== null && resaleHigh! < resaleLow)) throw new CommerceError(400, "Provide a consistent resale range or two nulls.");
  const observedAt = observed(b.observedAt, now), expiresAt = future(b.expiresAt, now);
  if (Date.parse(expiresAt) <= Date.parse(observedAt)) throw new CommerceError(400, "Expiry must follow observation.");
  let askingPrice: SourcingVehicle["askingPrice"];
  if (b.askingPrice !== undefined) {
    const price = object(b.askingPrice);
    if (price.currency !== "INR") throw new CommerceError(400, "Asking prices must explicitly use INR.");
    askingPrice = { amount: number(price.amount, 1, 100000000, true), currency: "INR", observedAt: observed(price.observedAt, now) };
    if (Date.parse(askingPrice.observedAt) > Date.parse(observedAt)) throw new CommerceError(400, "Asking-price observation cannot follow the vehicle observation.");
  }
  const sourceRecordId = text(b.sourceRecordId, 100);
  return { id: `${source.id}:${sourceRecordId}`, sourceId: source.id, sourceRecordId, make: text(b.make), model: text(b.model), year: number(b.year, 1900, now.getUTCFullYear() + 1, true), city: text(b.city), state: text(b.state), latitude: number(b.latitude, -90, 90), longitude: number(b.longitude, -180, 180), fuel: b.fuel as SourcingVehicle["fuel"], transmission: b.transmission as SourcingVehicle["transmission"], odometerKm: number(b.odometerKm, 0, 2000000, true), purchasePrice: number(b.purchasePrice, 1, 100000000, true), preparationCost: number(b.preparationCost, 0, 10000000, true), transferFees: number(b.transferFees, 0, 10000000, true), resaleLow, resaleHigh, demandScore: nullable(b.demandScore, 0, 100), mileageKmpl: nullable(b.mileageKmpl, .1, 100), ...(askingPrice ? { askingPrice } : {}), evidence: text(b.evidence, 500), observedAt, expiresAt, available: bool(b.available) };
}
export function fuelInput(value: unknown, source: DataSource, now: Date): FuelObservation {
  const b = object(value);
  if (!["petrol", "diesel"].includes(String(b.fuel))) throw new CommerceError(400, "Unknown fuel price type.");
  const city = text(b.city), fuel = b.fuel as FuelObservation["fuel"];
  return { id: `${source.id}:${city.toLowerCase()}:${fuel}`, sourceId: source.id, city, fuel, pricePerLitre: number(b.pricePerLitre, 1, 1000), observedAt: observed(b.observedAt, now), expiresAt: future(b.expiresAt, now) };
}
export function acquisitionInput(value: unknown): AcquisitionRequest {
  const b = object(value);
  if (![1, 2].includes(b.count as number) || !["margin", "demand"].includes(String(b.goal)) || !["any", "petrol", "diesel", "electric", "hybrid"].includes(String(b.fuel))) throw new CommerceError(400, "Choose valid planning options.");
  const budget = number(b.budget, 1, 100000000, true), reserve = number(b.reserve, 0, budget, true);
  return { budget, reserve, city: text(b.city), latitude: number(b.latitude, -90, 90), longitude: number(b.longitude, -180, 180), radiusKm: number(b.radiusKm, 0, 3000), count: b.count as 1 | 2, goal: b.goal as AcquisitionRequest["goal"], fuel: b.fuel as AcquisitionRequest["fuel"], transportPerKm: number(b.transportPerKm, 0, 1000), dailyHoldingCost: number(b.dailyHoldingCost, 0, 10000), holdingDays: number(b.holdingDays, 0, 365, true), annualKm: number(b.annualKm, 0, 200000, true) };
}
export function allowedSource(source: DataSource | undefined, external: boolean, now: Date) {
  return !!source && source.enabled && source.dealerUse && Date.parse(source.expiresAt) > now.getTime() && (!external || source.redistribute);
}
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function eligibleVehicles(state: CommerceState, external: boolean, now: Date) {
  return state.vehicles.filter(v => v.available && Date.parse(v.expiresAt) > now.getTime() && allowedSource(state.sources.find(s => s.id === v.sourceId), external, now));
}
export function fuelPrices(state: CommerceState, external: boolean, now: Date) {
  return state.fuel.filter(v => Date.parse(v.expiresAt) > now.getTime() && allowedSource(state.sources.find(s => s.id === v.sourceId), external, now));
}
export function sourceCoverage(state: CommerceState, sourceId: string, now: Date) {
  let records=0, available=0, expired=0;
  let oldestObservationAt: string | null=null, latestObservationAt: string | null=null;
  for (const vehicle of state.vehicles) {
    if (vehicle.sourceId !== sourceId) continue;
    records++;
    if (Date.parse(vehicle.expiresAt) <= now.getTime()) expired++;
    else if (vehicle.available) available++;
    if (!oldestObservationAt || Date.parse(vehicle.observedAt) < Date.parse(oldestObservationAt)) oldestObservationAt=vehicle.observedAt;
    if (!latestObservationAt || Date.parse(vehicle.observedAt) > Date.parse(latestObservationAt)) latestObservationAt=vehicle.observedAt;
  }
  return {records,available,expired,oldestObservationAt,latestObservationAt};
}
export function recommend(state: CommerceState, input: AcquisitionRequest, subscriptionPlan: CommercePlan, external: boolean, now: Date): AcquisitionReport {
  const limits = commercePlans[subscriptionPlan];
  if (input.count > limits.maxCars) throw new CommerceError(403, "This plan supports single-car acquisition. Growth or Scale is required for two cars.");
  const round = (n: number) => Math.round(n * 100) / 100;
  const fuels = fuelPrices(state, external, now);
  const candidates = eligibleVehicles(state, external, now).filter(v => (limits.crossCity || v.city.toLowerCase() === input.city.toLowerCase()) && (input.fuel === "any" || v.fuel === input.fuel)).map(v => {
    const distance = distanceKm(input, v), transportEstimate = Math.ceil(distance * input.transportPerKm);
    const quote = fuels.filter(f => f.city.toLowerCase() === input.city.toLowerCase() && f.fuel === v.fuel).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    // Hybrid/electric running costs remain unknown without dedicated consumption data.
    const annualFuelEstimate = ["petrol", "diesel"].includes(v.fuel) && v.mileageKmpl !== null && quote ? round(input.annualKm / v.mileageKmpl * quote.pricePerLitre) : null;
    return { ...v, evidence: external ? "Licensed source record" : v.evidence, distanceKm: round(distance), transportEstimate, annualFuelEstimate, landedCost: v.purchasePrice + v.preparationCost + v.transferFees + transportEstimate + input.dailyHoldingCost * input.holdingDays };
  }).filter(v => v.distanceKm <= input.radiusKm && v.landedCost <= input.budget - input.reserve);
  if (candidates.length > 200) throw new CommerceError(400, "Narrow the radius or fuel filter to at most 200 eligible vehicles.");
  const groups = input.count === 1 ? candidates.map(c => [c]) : candidates.flatMap((c, i) => candidates.slice(i + 1).map(other => [c, other]));
  const options: AcquisitionChoice[] = groups.map(cars => {
    const landedCost = round(cars.reduce((sum, c) => sum + c.landedCost, 0));
    const resaleKnown = cars.every(c => c.resaleLow !== null && c.resaleHigh !== null), demandKnown = cars.every(c => c.demandScore !== null);
    return { cars, landedCost, remaining: round(input.budget - input.reserve - landedCost), marginLow: resaleKnown ? round(cars.reduce((sum, c) => sum + c.resaleLow!, 0) - landedCost) : null, marginHigh: resaleKnown ? round(cars.reduce((sum, c) => sum + c.resaleHigh!, 0) - landedCost) : null, demandScore: demandKnown ? round(cars.reduce((sum, c) => sum + c.demandScore!, 0) / cars.length) : null, explanation: `Fits capital after reserve; includes purchase, preparation, transfer, estimated transport and ${input.holdingDays} days of holding costs. Ranked by ${input.goal === "margin" ? "lower gross contribution estimate" : "average source demand score"}; missing evidence ranks last.` };
  }).filter(o => o.remaining >= 0).sort((a, b) => {
    const av = input.goal === "margin" ? a.marginLow : a.demandScore, bv = input.goal === "margin" ? b.marginLow : b.demandScore;
    if (av === null && bv !== null) return 1; if (bv === null && av !== null) return -1;
    return (bv ?? 0) - (av ?? 0) || a.landedCost - b.landedCost;
  }).slice(0, 10);
  const demo = options.some(o => o.cars.some(v => state.sources.find(s => s.id === v.sourceId)?.kind === "demo"));
  return { version: "dealer-acquisition-v2", generatedAt: now.toISOString(), candidates: candidates.length, options, demo, notices: ["Transport uses straight-line distance and your per-km assumption, not a road quote. Confirm road distance, tax and transfer costs before acquisition.", "Resale ranges and demand scores are supplier/operator evidence, not guaranteed outcomes or independently trained predictions.", "Contribution excludes financing, unrecorded taxes, overhead and sale expenses. Fuel running costs are customer ownership estimates, not dealer profit.", "Unavailable, expired, unlicensed and non-redistributable sources are excluded as applicable. Missing resale, demand or fuel information remains unknown."] };
}

// Shared by staff imports and source-bound supplier API keys; the repository
// transaction rolls the complete batch back if validation or quota checks fail.
export function ingestBatch(state: CommerceState, sourceId: string, b: Record<string, unknown>, now: Date) {
  if (!Array.isArray(b.vehicles) || b.vehicles.length > 500 || (b.fuel !== undefined && (!Array.isArray(b.fuel) || b.fuel.length > 100))) throw new CommerceError(400, "Import at most 500 vehicles and 100 fuel observations.");
  const source = state.sources.find(s => s.id === sourceId);
  if (!allowedSource(source, false, now)) throw new CommerceError(403, "Source must have an active dealer-use agreement.");
  const vehicles = b.vehicles.map(v => vehicleInput(v, source!, now)), fuel = ((b.fuel ?? []) as unknown[]).map(v => fuelInput(v, source!, now));
  if (new Set(vehicles.map(v => v.id)).size !== vehicles.length || new Set(fuel.map(v => v.id)).size !== fuel.length) throw new CommerceError(400, "Duplicate source record IDs in batch.");
  const existingVehicles = new Map(state.vehicles.map(v => [v.id, v]));
  const existingFuel = new Map(state.fuel.map(f => [f.id, f]));
  if (vehicles.some(v => Date.parse(existingVehicles.get(v.id)?.observedAt ?? "") > Date.parse(v.observedAt)) ||
      fuel.some(f => Date.parse(existingFuel.get(f.id)?.observedAt ?? "") > Date.parse(f.observedAt))) {
    throw new CommerceError(409, "Older observations cannot replace newer source records.");
  }
  if (vehicles.some(v => {
    const previous = existingVehicles.get(v.id)?.askingPrice;
    return previous && (!v.askingPrice || Date.parse(previous.observedAt) > Date.parse(v.askingPrice.observedAt));
  })) throw new CommerceError(409, "Asking-price evidence cannot be removed or replaced by an older observation.");
  const ids = new Set(vehicles.map(v => v.id)), fuelIds = new Set(fuel.map(f => f.id));
  const next = [...state.vehicles.filter(v => !ids.has(v.id)), ...vehicles];
  if (next.length > 2000) throw new CommerceError(409, "Tenant sourcing capacity reached. Contact support for expanded capacity.");
  state.vehicles = next; state.fuel = [...state.fuel.filter(f => !fuelIds.has(f.id)), ...fuel].slice(-1000);
  return { received: vehicles.length, fuelReceived: fuel.length, total: next.length };
}
export function queryVehicles(state: CommerceState, input: Record<string, unknown>, now: Date) {
  const numeric = (key: string, min: number, max: number, fallback?: number, integer = false) => {
    if (input[key] === undefined) return fallback;
    if (typeof input[key] !== "number" && typeof input[key] !== "string" || String(input[key]).trim() === "") throw new CommerceError(400, `Invalid ${key}.`);
    return number(Number(input[key]), min, max, integer);
  };
  const city = input.city === undefined ? "" : text(input.city), make = input.make === undefined ? "" : text(input.make);
  const fuel = input.fuel === undefined ? "any" : text(input.fuel);
  if (!["any", "petrol", "diesel", "electric", "hybrid"].includes(fuel)) throw new CommerceError(400, "Unknown fuel filter.");
  const limit = numeric("limit", 1, 100, 25, true)!, offset = numeric("offset", 0, 2000, 0, true)!;
  const minPrice = numeric("minPrice", 0, 100000000, 0)!, maxPrice = numeric("maxPrice", 0, 100000000, 100000000)!;
  if (minPrice > maxPrice) throw new CommerceError(400, "Minimum price exceeds maximum price.");
  const latitude = numeric("latitude", -90, 90), longitude = numeric("longitude", -180, 180), radiusKm = numeric("radiusKm", 0, 3000);
  const location = [latitude, longitude, radiusKm].filter(v => v !== undefined).length;
  if (location && location !== 3) throw new CommerceError(400, "Provide latitude, longitude and radiusKm together.");
  const vehicles = eligibleVehicles(state, true, now).filter(v => (!city || v.city.toLowerCase() === city.toLowerCase()) && (!make || v.make.toLowerCase() === make.toLowerCase()) && (fuel === "any" || v.fuel === fuel) && v.purchasePrice >= minPrice && v.purchasePrice <= maxPrice)
    .map(v => ({ ...v, evidence: undefined, ...(location ? { distanceKm: distanceKm({ latitude: latitude!, longitude: longitude! }, v) } : {}) }))
    .filter(v => !location || v.distanceKm! <= radiusKm!)
    .sort((a, b) => location ? a.distanceKm! - b.distanceKm! || a.id.localeCompare(b.id) : a.id.localeCompare(b.id));
  return { items: vehicles.slice(offset, offset + limit), total: vehicles.length, offset, limit };
}
