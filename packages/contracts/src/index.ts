export type ID = string;

export type PublishStatus = "draft" | "published" | "archived";
export type AvailabilityStatus = "available" | "reserved" | "sold";
export type FuelType = "petrol" | "diesel" | "hybrid" | "electric";
export type Transmission = "manual" | "automatic";
export type LeadChannel = "web" | "call" | "whatsapp" | "email" | "chat";
export type LeadIntent = "enquiry" | "test_drive" | "finance" | "exchange";
export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "appointment"
  | "visited"
  | "test_drive"
  | "negotiation"
  | "won"
  | "lost"
  | "nurture";

export interface Location {
  id: ID;
  name: string;
  city: string;
  state: string;
  phone: string;
}

export interface Dealership {
  id: ID;
  organizationId: ID;
  name: string;
  brandName: string;
  locations: Location[];
}

export interface Organization {
  id: ID;
  name: string;
  dealerships: Dealership[];
}

export interface TenantConfig {
  tenantId: ID;
  organization: Organization;
  activeDealershipId: ID;
  brand: {
    logoText: string;
    tagline: string;
    theme: {
      background: string;
      surface: string;
      foreground: string;
      muted: string;
      accent: string;
    };
    typography: { heading: string; body: string };
  };
  contact: { phone: string; email: string; whatsapp: string };
  navigation: { label: string; href: string }[];
  seo: { title: string; description: string; canonicalBase: string };
  entitlements: string[];
  experience: {
    showCompare: boolean;
    showFinance: boolean;
    showExchange: boolean;
  };
}

export interface VehicleMedia {
  url: string;
  alt: string;
  kind?: "exterior" | "interior" | "detail";
}

export interface Vehicle {
  version?: number;
  id: ID;
  slug: string;
  tenantId: ID;
  dealershipId: ID;
  locationId: ID;
  stockId: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  mileage: number;
  fuelType: FuelType;
  transmission: Transmission;
  ownership: number;
  bodyType: string;
  condition: "excellent" | "good" | "fair";
  exteriorColor: string;
  interiorColor: string;
  features: string[];
  specifications: Record<string, string | number>;
  media: VehicleMedia[];
  availabilityStatus: AvailabilityStatus;
  publishStatus: PublishStatus;
  source: string;
  externalId?: string;
  financeEligible: boolean;
  exchangeEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttributionTouch {
  source: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPath: string;
  capturedAt: string;
}

export interface Lead {
  version?: number;
  id: ID;
  tenantId: ID;
  dealershipId: ID;
  locationId?: ID;
  vehicleId?: ID;
  vehicleIds: ID[];
  name: string;
  phone: string;
  email?: string;
  channel: LeadChannel;
  stage: LeadStage;
  intent: LeadIntent;
  assignedTo?: string;
  source: string;
  campaign?: string;
  notes?: string;
  consent: { whatsapp: boolean; marketing: boolean };
  journey?: {
    firstTouch?: AttributionTouch;
    lastTouch?: AttributionTouch;
    vehicleInterestHistory: ID[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: ID;
  tenantId: ID;
  leadId: ID;
  type:
    | "stage_changed"
    | "assignment_changed"
    | "note_updated"
    | "follow_up_created"
    | "follow_up_completed"
    | "follow_up_reopened"
    | "appointment_scheduled"
    | "appointment_updated"
    | "sale_confirmed";
  actor: string;
  description: string;
  occurredAt: string;
}

export interface Task {
  version?: number;
  closedBySaleId?: ID;
  id: ID;
  tenantId?: ID;
  leadId: ID;
  title: string;
  owner: string;
  dueAt: string;
  completed: boolean;
  priority: "normal" | "high";
  origin?: "human" | "automation";
  automationRuleId?: ID;
}

export type AutomationTrigger = "lead_created" | "stage_changed";

export interface AutomationRule {
  id: ID;
  tenantId: ID;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  intents?: LeadIntent[];
  stages?: LeadStage[];
  delayMinutes: number;
  taskTitle: string;
  ownerFallback: string;
  priority: "normal" | "high";
  channel: "internal_task" | "whatsapp";
  requiresWhatsappConsent: boolean;
}

export interface AutomationRun {
  id: ID;
  tenantId: ID;
  ruleId: ID;
  leadId: ID;
  trigger: AutomationTrigger;
  outcome: "created" | "skipped_consent" | "skipped_provider" | "skipped_duplicate";
  taskId?: ID;
  occurredAt: string;
}

export interface CampaignTemplate {
  id: ID;
  tenantId: ID;
  name: string;
  channel: "google" | "meta" | "email" | "whatsapp" | "other";
  source: string;
  medium?: string;
  campaign: string;
  destinationPath: string;
  vehicleId?: ID;
  enabled: boolean;
}

export type IntegrationCategory = "crm" | "dms" | "messaging" | "acquisition" | "finance" | "valuation";

export interface IntegrationAdapter {
  id: ID;
  tenantId: ID;
  name: string;
  category: IntegrationCategory;
  direction: "inbound" | "outbound" | "bidirectional";
  status: "connected" | "contract_only" | "disabled";
  fieldAuthority: Record<string, "automobile_engine" | "provider">;
  lastReconciledAt?: string;
}

export interface ReconciliationRun {
  id: ID;
  tenantId: ID;
  adapterId: ID;
  startedAt: string;
  completedAt?: string;
  status: "success" | "partial" | "failed";
  read: number;
  created: number;
  updated: number;
  conflicts: number;
  failed: number;
  note?: string;
}

export interface Appointment {
  id: ID;
  leadId: ID;
  vehicleId?: ID;
  type: "appointment" | "test_drive";
  scheduledAt: string;
  locationId: ID;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
}

export interface Sale {
  id: ID;
  tenantId: ID;
  leadId: ID;
  vehicleId: ID;
  amount: number;
  currency: "INR";
  soldAt: string;
  confirmedBy: string;
  confirmedAt: string;
}

export interface InventoryChange {
  action?: "created" | "updated";
  beforeRecord?: Vehicle;
  afterRecord?: Vehicle;
  batchId?: ID;
  source?: string;
  id: ID;
  tenantId: ID;
  vehicleId: ID;
  actor: string;
  occurredAt: string;
  before: Pick<Vehicle, "price" | "availabilityStatus" | "publishStatus">;
  after: Pick<Vehicle, "price" | "availabilityStatus" | "publishStatus">;
}

export interface JourneyEvent {
  id: ID;
  tenantId: ID;
  sessionId: string;
  type:
    | "page_view"
    | "inventory_search"
    | "vehicle_view"
    | "compare"
    | "whatsapp_click"
    | "call_click"
    | "lead_created"
    | "test_drive_requested"
    | "finance_interest"
    | "exchange_interest";
  vehicleId?: ID;
  source?: string;
  campaign?: string;
  path: string;
  occurredAt: string;
}

export interface AnalyticsSnapshot {
  inventory: number;
  available: number;
  reserved: number;
  sold: number;
  leads: number;
  uncontacted: number;
  qualified: number;
  appointments: number;
  testDrives: number;
  negotiations: number;
  wins: number;
  stageCounts: Partial<Record<LeadStage, number>>;
  sourceCounts: Record<string, number>;
  vehicleDemand: { vehicleId: ID; views: number; enquiries: number }[];
}

export interface VehicleRepository {
  listPublished(): Promise<Vehicle[]>;
  findPublishedBySlug(slug: string): Promise<Vehicle | null>;
  findByIds(ids: ID[]): Promise<Vehicle[]>;
}

export interface TenantRepository {
  getActive(): Promise<TenantConfig>;
}

export interface LeadRepository {
  listRecent(): Promise<Lead[]>;
  findById(id: ID): Promise<Lead | null>;
  create(input: Omit<Lead, "id" | "createdAt" | "updatedAt" | "stage">): Promise<Lead>;
}

export interface AnalyticsRepository {
  getSnapshot(): Promise<AnalyticsSnapshot>;
}


export * from "./auth";

export interface StockCost {
  tenantId: ID; vehicleId: ID; version: number; currency: "INR";
  acquiredOn: string; purchasePrice: number; reconditioningCost: number; transferCost: number; otherCost: number;
  dailyHoldingCost: number | null; reference: string; recordedBy: string; recordedAt: string;
}
export interface StockCostChange {
  id: ID; tenantId: ID; vehicleId: ID; before: StockCost | null; after: StockCost;
}
