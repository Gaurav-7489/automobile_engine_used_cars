export const commercePlans = {
  starter: { name: "Starter", monthlyRequests: 100, perMinute: 15, maxKeys: 1, maxCars: 1, crossCity: false },
  growth: { name: "Growth", monthlyRequests: 2000, perMinute: 60, maxKeys: 5, maxCars: 2, crossCity: true },
  scale: { name: "Scale", monthlyRequests: 20000, perMinute: 120, maxKeys: 20, maxCars: 2, crossCity: true },
} as const;
export type CommercePlan = keyof typeof commercePlans;
export type ApiScope = "vehicles:read" | "recommendations:read" | "fuel:read" | "sourcing:write";
export interface DealerSubscription { plan: CommercePlan; status: "active" | "suspended" | "cancelled"; expiresAt: string; reference: string; updatedAt: string }
export interface DataSource { id: string; name: string; kind: "dealer" | "licensed_api" | "demo"; agreement: string; dealerUse: boolean; redistribute: boolean; expiresAt: string; enabled: boolean }
export interface SourcingVehicle {
  id: string; sourceId: string; sourceRecordId: string; make: string; model: string; year: number; city: string; state: string;
  latitude: number; longitude: number; fuel: "petrol" | "diesel" | "electric" | "hybrid"; transmission: "manual" | "automatic";
  odometerKm: number; purchasePrice: number; preparationCost: number; transferFees: number;
  resaleLow: number | null; resaleHigh: number | null; demandScore: number | null; mileageKmpl: number | null;
  evidence: string; observedAt: string; expiresAt: string; available: boolean;
}
export interface FuelObservation { id: string; sourceId: string; city: string; fuel: "petrol" | "diesel"; pricePerLitre: number; observedAt: string; expiresAt: string }
export interface BusinessKey { id: string; name: string; prefix: string; digest: string; scopes: ApiScope[]; sourceId?: string; expiresAt: string; revokedAt: string | null; createdAt: string; lastUsedAt: string | null }
export interface CommerceState {
  subscription: DealerSubscription | null; sources: DataSource[]; vehicles: SourcingVehicle[]; fuel: FuelObservation[];
  keys: BusinessKey[]; usage: Record<string, number>; audit: { actor: string; action: string; at: string; subject: string }[];
}
export interface AcquisitionRequest {
  budget: number; reserve: number; city: string; latitude: number; longitude: number; radiusKm: number; count: 1 | 2;
  goal: "margin" | "demand"; transportPerKm: number; dailyHoldingCost: number; holdingDays: number;
  fuel: "any" | SourcingVehicle["fuel"]; annualKm: number;
}
export interface AcquisitionChoice { cars: (SourcingVehicle & { distanceKm: number; transportEstimate: number; landedCost: number; annualFuelEstimate: number | null })[]; landedCost: number; remaining: number; marginLow: number | null; marginHigh: number | null; demandScore: number | null; explanation: string }
export interface AcquisitionReport { version: string; generatedAt: string; candidates: number; options: AcquisitionChoice[]; notices: string[]; demo: boolean; ai?: { status: "available" | "unavailable" | "not_configured"; text?: string; model?: string } }
