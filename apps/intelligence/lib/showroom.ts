import { postPrice } from "./social-post";
import { vehicles, tenantConfig, locationName } from "@vandlabs/demo-data";
import type { Vehicle } from "@vandlabs/contracts";

/** The public showroom shows the built-in sample catalogue only. It never reads a dealership's tenant data. */
export const SAMPLE_NOTICE = "Sample showroom with demo cars. Every dealership on VandLabs gets its own showroom like this for its published stock, managed from Showroom in the app.";

export const sampleVehicles = (): Vehicle[] => vehicles.filter(v => v.publishStatus === "published");
export const sampleVehicle = (slug: string) => sampleVehicles().find(v => v.slug === slug) ?? null;
export const showroomLocations = tenantConfig.organization.dealerships.flatMap(d => d.locations.map(l => ({ id: l.id, name: l.name, city: l.city })));
export const sampleLocation = (id: string) => locationName(id);
export const dealerName = tenantConfig.organization.dealerships[0]?.brandName ?? "VandLabs";

const num = new Intl.NumberFormat("en-IN");
/** Same wording as a dealership's own pages (₹58.50 Lakh), from rupees. */
export const money = (n: number) => postPrice(n * 100);
/** Sample records store some values in lower case ("petrol"); dealership pages show them capitalised. */
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
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
