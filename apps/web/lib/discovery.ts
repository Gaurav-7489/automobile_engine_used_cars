import type { Vehicle } from "@vandlabs/contracts";
import { discover, sanitizeTurns, type DiscoveryMatch, type DiscoveryResult } from "@vandlabs/data/discovery";
import { dealershipService } from "./services";
import { activeDealership, tenantConfig } from "./config";

/** The public facts a reel needs. Costs, sources and internal identifiers never reach the browser. */
export interface ReelCard {
  id: string; slug: string; stockId: string; make: string; model: string; variant: string; year: number; price: number; mileage: number;
  fuelType: Vehicle["fuelType"]; transmission: Vehicle["transmission"]; ownership: number; bodyType: string; exteriorColor: string;
  condition: Vehicle["condition"]; features: string[]; media: { url: string; alt: string; kind: "photo" | "video"; poster?: string }[];
  location: { name: string; city: string } | null; dealership: string; phone: string | null; availability: Vehicle["availabilityStatus"];
}
export type ReelMatch = DiscoveryMatch & { card: ReelCard };
export type DiscoveryPage = Omit<DiscoveryResult, "results"> & { results: ReelMatch[] };

export const locations = tenantConfig.organization.dealerships.flatMap(dealership => dealership.locations);
/** Demo media is editorial photography, not the listed car; real data modes show dealer photos. */
export const editorialMedia = () => !["aurora", "neon"].includes(process.env.DATA_MODE ?? "");

export function reelCard(vehicle: Vehicle): ReelCard {
  const location = locations.find(item => item.id === vehicle.locationId);
  const dealership = tenantConfig.organization.dealerships.find(item => item.id === vehicle.dealershipId) ?? activeDealership;
  return {
    id: vehicle.id, slug: vehicle.slug, stockId: vehicle.stockId, make: vehicle.make, model: vehicle.model, variant: vehicle.variant,
    year: vehicle.year, price: vehicle.price, mileage: vehicle.mileage, fuelType: vehicle.fuelType, transmission: vehicle.transmission,
    ownership: vehicle.ownership, bodyType: vehicle.bodyType, exteriorColor: vehicle.exteriorColor, condition: vehicle.condition,
    features: (vehicle.features ?? []).slice(0, 6),
    media: vehicle.media.filter(item => typeof item.url === "string" && (item.url.startsWith("https://") || item.url.startsWith("/"))).slice(0, 8)
      .map(item => ({ url: item.url, alt: item.alt, kind: item.kind === "video" ? "video" as const : "photo" as const, poster: item.kind === "video" ? item.poster : undefined })),
    location: location ? { name: location.name, city: location.city } : null,
    dealership: dealership?.name ?? tenantConfig.brand.logoText, phone: location?.phone ?? tenantConfig.contact.phone ?? null,
    availability: vehicle.availabilityStatus,
  };
}

export function turnsFrom(value: string | string[] | undefined) { return sanitizeTurns(value); }

export async function discoveryPage(turns: string[], cursor = 0, limit?: number): Promise<DiscoveryPage> {
  const inventory = await dealershipService.inventory();
  const result = discover({ turns, vehicles: inventory, locations, cursor, limit });
  const byId = new Map(inventory.map(vehicle => [vehicle.id, vehicle]));
  return { ...result, results: result.results.flatMap(match => { const vehicle = byId.get(match.vehicleId); return vehicle ? [{ ...match, card: reelCard(vehicle) }] : []; }) };
}

export function discoverHref(turns: string[], vehicle?: string) {
  const params = new URLSearchParams();
  for (const turn of turns) params.append("q", turn);
  if (vehicle) params.set("v", vehicle);
  const query = params.toString();
  return "/discover" + (query ? "?" + query : "");
}
