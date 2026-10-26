export const commercePlans = {
  starter: { name: "Starter", monthlyRequests: 100, perMinute: 15, maxKeys: 1, maxCars: 1, crossCity: false },
  growth: { name: "Growth", monthlyRequests: 2000, perMinute: 60, maxKeys: 5, maxCars: 2, crossCity: true },
  scale: { name: "Scale", monthlyRequests: 20000, perMinute: 120, maxKeys: 20, maxCars: 2, crossCity: true },
} as const;
export type CommercePlan = keyof typeof commercePlans;
export type ApiScope = "vehicles:read" | "recommendations:read" | "fuel:read" | "sourcing:write";
export interface DealerSubscription { plan: CommercePlan; status: "active" | "suspended" | "cancelled"; expiresAt: string; reference: string; updatedAt: string }
export interface DataSource { id: string; name: string; kind: "dealer" | "licensed_api" | "demo"; agreement: string; dealerUse: boolean; aiProcessing?: boolean; redistribute: boolean; expiresAt: string; enabled: boolean }
export interface SourcingVehicle {
  id: string; sourceId: string; sourceRecordId: string; make: string; model: string; year: number; city: string; state: string;
  latitude: number; longitude: number; fuel: "petrol" | "diesel" | "electric" | "hybrid"; transmission: "manual" | "automatic";
  odometerKm: number; purchasePrice: number; preparationCost: number; transferFees: number;
  resaleLow: number | null; resaleHigh: number | null; demandScore: number | null; mileageKmpl: number | null;
  askingPrice?: { amount: number; currency: "INR"; observedAt: string };
  evidence: string; observedAt: string; expiresAt: string; available: boolean;
}
export interface FuelObservation { id: string; sourceId: string; city: string; fuel: "petrol" | "diesel"; pricePerLitre: number; observedAt: string; expiresAt: string }
export interface BusinessKey { id: string; name: string; prefix: string; digest: string; scopes: ApiScope[]; sourceId?: string; expiresAt: string; revokedAt: string | null; createdAt: string; lastUsedAt: string | null }
export type FeedFailure = "configuration" | "provider_auth" | "provider_rate_limit" | "provider_unavailable" | "invalid_payload" | "agreement" | "lease_expired";
export interface FeedSync {
  runId: string; status: "running" | "succeeded" | "failed"; startedAt: string; completedAt: string | null;
  leaseExpiresAt: string; lastSucceededAt: string | null; consecutiveFailures: number; nextAttemptAt: string | null;
  error: FeedFailure | null; received: number | null; fuelReceived: number | null;
}
export interface CommerceState {
  subscription: DealerSubscription | null; sources: DataSource[]; vehicles: SourcingVehicle[]; fuel: FuelObservation[];
  keys: BusinessKey[]; usage: Record<string, number>; audit: { actor: string; action: string; at: string; subject: string }[];
  sourceSync?: (FeedSync & { sourceId: string })[];
  syncHistory?: (FeedSync & { sourceId: string })[];
}
export interface AcquisitionRequest {
  budget: number; reserve: number; city: string; latitude: number; longitude: number; radiusKm: number; count: 1 | 2;
  goal: "margin" | "demand"; transportPerKm: number; dailyHoldingCost: number; holdingDays: number;
  fuel: "any" | SourcingVehicle["fuel"]; annualKm: number;
  /** How much downside the dealer accepts. cautious: only options that cover their landed cost at the low resale end. balanced (default): no downside filter. opportunistic: no filter, margin goal ranks by the high resale end. */
  risk?: "cautious" | "balanced" | "opportunistic";
}
export interface AcquisitionRisk { level: "low" | "medium" | "high"; reasons: string[] }
export interface AcquisitionChoice { cars: (SourcingVehicle & { distanceKm: number; transportEstimate: number; landedCost: number; annualFuelEstimate: number | null })[]; landedCost: number; remaining: number; marginLow: number | null; marginHigh: number | null; demandScore: number | null; explanation: string;
  /** Sum of the recorded resale range of the cars, and the holding cost already inside landedCost. */
  resaleLow?: number | null; resaleHigh?: number | null; holdingCost?: number; marginLowPercent?: number | null; capitalShare?: number; risk?: AcquisitionRisk }
export interface AcquisitionReport { version: string; generatedAt: string; candidates: number; options: AcquisitionChoice[]; notices: string[]; demo: boolean; ai?: { status: "available" | "unavailable" | "not_configured" | "restricted" | "quota_exceeded"; text?: string; model?: string } }
