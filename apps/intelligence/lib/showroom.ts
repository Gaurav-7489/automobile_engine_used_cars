import { vehicles, tenantConfig, locationName } from "@vandlabs/demo-data";
import type { Vehicle } from "@vandlabs/contracts";

/** The public showroom shows the built-in sample catalogue only. It never reads a dealership's tenant data. */
export const SAMPLE_NOTICE = "Sample catalogue for demonstration. Real dealership stock is private to signed-in staff.";

export const sampleVehicles = (): Vehicle[] => vehicles.filter(v => v.publishStatus === "published");
export const sampleVehicle = (slug: string) => sampleVehicles().find(v => v.slug === slug) ?? null;
export const showroomLocations = tenantConfig.organization.dealerships.flatMap(d => d.locations.map(l => ({ id: l.id, name: l.name, city: l.city })));
export const sampleLocation = (id: string) => locationName(id);
export const dealerName = tenantConfig.organization.dealerships[0]?.brandName ?? "VandLabs";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");
export const money = (n: number) => inr.format(n);
export const km = (n: number) => `${num.format(n)} km`;

export type ShowroomQuery = { q?: string; body?: string; fuel?: string; sort?: string };
export function filterVehicles(list: Vehicle[], { q, body, fuel, sort }: ShowroomQuery) {
  const needle = q?.trim().toLowerCase();
  const out = list.filter(v =>
    (!needle || `${v.make} ${v.model} ${v.variant} ${v.year}`.toLowerCase().includes(needle)) &&
    (!body || v.bodyType === body) && (!fuel || v.fuelType === fuel));
  const by: Record<string, (a: Vehicle, b: Vehicle) => number> = {
    "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price,
    "km-asc": (a, b) => a.mileage - b.mileage, newest: (a, b) => b.year - a.year,
  };
  return sort && by[sort] ? out.sort(by[sort]) : out;
}
