export type Role = "owner" | "manager" | "inventory" | "marketing" | "sales" | "finance" | "viewer";

export type Branch = { id: string; name: string; city: string; state: string; timezone: string; isDefault?: boolean };

export type Lifecycle = "available" | "reserved" | "preparation" | "sold" | "archived";

export type CostLedger = {
  acquisition: number;
  transport: number;
  inspection: number;
  refurbishment: number;
  fees: number;
};

export type Vehicle = {
  id: string;
  branchId: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  fuel: "Diesel" | "Petrol" | "Hybrid" | "Electric";
  transmission: "Automatic" | "Manual";
  km: number;
  owners: number;
  registration: string; // masked by default
  status: Lifecycle;
  acquiredAt: string; // ISO instant
  soldAt?: string;
  asking: number | null;
  costs: CostLedger;
  costComplete: boolean;
  hasImages: boolean;
  enquiries14d: number;
  cohortMedianEnquiries: number;
  version: number;
  channels: string[];
  documents: { name: string; provided: boolean }[];
  /** Public photo addresses from the shared vehicle record (live workspaces). */
  photos?: string[];
};

export type Sale = {
  id: string;
  vehicleId: string;
  branchId: string;
  label: string;
  closedAt: string;
  salePrice: number;
  landed: number;
  directCosts: number;
  state: "Completed" | "Void" | "Unreconciled";
  note?: string;
};

export type InventoryEvent = {
  id: string;
  branchId: string;
  type: "acquired" | "sold";
  at: string;
  label: string;
  ref: string;
};

export type Listing = {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  fuel: "Diesel" | "Petrol";
  transmission: "Automatic" | "Manual";
  km: number;
  owners: number;
  city: string;
  state: string;
  region: string;
  source: "Authorised feed A" | "Authorised feed B";
  observedAt: string;
  asking: number;
  estimate: number | null;
  matched: number;
  completeness: number; // 0..1 match completeness
  freshestDays: number;
  version: string;
};

export type EvidenceTier = "High" | "Moderate" | "Insufficient";

export type RegionStat = {
  region: string;
  state: string;
  n: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  observedAt: string | null;
  completeness: number;
  freshestDays: number;
  transport: number; // estimated cost to move to the base region
  fees: number;
  status: "ok" | "unavailable";
  aggregateOnly?: boolean;
};

export type PriceRequestStatus = "Draft" | "Pending" | "Approved" | "Applying" | "Applied" | "PartiallySynced" | "Failed" | "Rejected" | "Withdrawn";

export type ChannelSync = { channel: string; status: "Applied" | "Failed" | "Queued"; at?: string; syncId?: string; error?: string };

export type PriceRequest = {
  id: string;
  vehicleId: string;
  vehicleVersion: number;
  status: PriceRequestStatus;
  currentAsking: number;
  proposedAsking: number;
  estimate: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  landed: number;
  holdingSelling: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  approverName?: string;
  approvedBy?: string;
  decidedAt?: string;
  rejectReason?: string;
  evidenceAt: string;
  evidenceN: number;
  evidenceTier: EvidenceTier;
  methodVersion: string;
  userEdited: boolean;
  belowFloor: boolean;
  floorRationale?: string;
  channelScope: string[];
  syncs: ChannelSync[];
  history: { at: string; actor: string; action: string; detail?: string }[];
};

export type CampaignStatus = "Draft" | "Pending" | "Approved" | "Publishing" | "Active" | "Pausing" | "Paused" | "Failed" | "Completed";

export type Channel = { id: "search" | "meta" | "owned" | "marketplace"; name: string; connected: boolean; reason?: string };

export type Campaign = {
  id: string;
  name: string;
  vehicleId: string;
  vehicleVersion: number;
  objective: "Enquiries" | "Test-drive requests";
  status: CampaignStatus;
  step: number; // 1..5
  region: string;
  radiusKm: number;
  startDate: string;
  endDate: string;
  channels: { id: Channel["id"]; enabled: boolean; budget: number }[];
  totalCap30d: number;
  dailyCap: number;
  headline: string;
  body: string;
  creativeApproved: boolean;
  budgetApproved: boolean;
  approvedVersion?: number;
  utm: string;
  clickWindowDays: number;
  viewWindowDays: number;
  createdBy: string;
  createdByName: string;
  note?: string;
  platformAck?: "awaiting" | "acknowledged";
  metrics?: {
    spend: number; clicks: number; leads: number; qualified: number; testDrives: number;
    byChannel: { channel: string; spend: number; clicks: number; leads: number }[];
    daily: { date: string; spend: number; leads: number }[];
  };
  history: { at: string; actor: string; action: string }[];
};

export type LeadStage = "New" | "Contacted" | "Qualified" | "Appointment" | "Visited" | "Test drive" | "Negotiation" | "Won" | "Lost" | "Nurture";
export const LEAD_STAGES: LeadStage[] = ["New", "Contacted", "Qualified", "Appointment", "Visited", "Test drive", "Negotiation", "Won", "Lost", "Nurture"];

export type Lead = {
  id: string;
  name: string;
  contactMasked: string;
  contactFull: string;
  email?: string;
  vehicleId: string | null;
  source: string;
  stage: LeadStage;
  owner: string;
  branchId: string;
  createdAt: string;
  lastTouchAt: string;
  nextAction: string;
  nextActionAt?: string;
  nextActionTone?: "warning" | "neutral";
  consent: { marketing: boolean; service: boolean; evidence: string; capturedAt: string };
  saleId?: string;
  lostReason?: string;
  campaignId?: string;
  version: number;
  expectedGross?: number;
  interactions: { id: string; at: string; type: "Call" | "Message" | "Note" | "System" | "Appointment"; actor: string; outcome?: string; detail: string; delivery?: "Queued" | "Delivered" | "Failed" }[];
  tasks: { id: string; title: string; dueAt: string; done: boolean; doneAt?: string; doneBy?: string }[];
  appointment?: { id: string; at: string; kind: "Visit" | "Test drive"; status: "Scheduled" | "Completed" | "Cancelled" | "Rescheduled"; staff: string; previousAt?: string; cancelReason?: string };
  duplicateOf?: string;
};

export type AlertSeverity = "Critical" | "Warning" | "Due today" | "Overdue" | "Info";
export type AlertStatus = "Open" | "Snoozed" | "Resolved";

export type Alert = {
  id: string;
  type: "Integration" | "Pricing" | "Leads" | "Documents" | "Approvals";
  severity: AlertSeverity;
  title: string;
  recordRef: string;
  recordKind: "vehicle" | "lead" | "integration" | "price-request" | "campaign";
  trigger: string;
  owner: string;
  assignee: string;
  dueAt: string | null;
  dueLabel: string;
  actionLabel: string;
  status: AlertStatus;
  waiting?: boolean;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  acknowledgedBy?: string;
  snoozeUntil?: string;
  snoozeReason?: string;
  resolution?: { code: string; note: string; at: string; by: string };
  branchId: string;
  history: { at: string; actor: string; action: string }[];
};

export type IntegrationState = "Not configured" | "Authorising" | "Connected" | "Degraded" | "Expired" | "Disconnected";

export type Integration = {
  id: string;
  name: string;
  kind: "Licensed feed" | "Advertising account" | "Inventory publishing";
  state: IntegrationState;
  lastSuccessAt: string | null;
  scopes: string;
  detail: string;
  branchScope: string;
  cadence: string;
  freshnessSla: string;
  received: number;
  rejected: number;
  lastJob: string;
  logs: { id: string; at: string; job: string; received: number; rejected: number; status: "Success" | "Partial" | "Failed"; rejectedRows?: { row: number; reason: string }[] }[];
};

export type TeamMember = { id: string; name: string; email: string; role: Role; branchIds: string[]; mfa: boolean; status: "Active" | "Invited" };

export type ApiKey = { id: string; name: string; scope: string; branch: string; expiresAt: string; prefix: string; revoked: boolean; createdAt: string };

export type AuditEvent = { id: string; at: string; actor: string; action: string; target: string; detail: string };

export type Scenario = {
  id: string;
  listingId: string;
  offer: number;
  transport: number;
  inspection: number;
  refurbishment: number;
  fees: number;
  holdingSelling: number;
  targetResale: number;
  savedAt: string;
  by: string;
  version: number;
};

export type AcquisitionReview = {
  id: string;
  listingId: string;
  targetOffer: number;
  scenario: Scenario;
  evidenceAt: string;
  evidenceN: number;
  evidenceTier: EvidenceTier;
  rationale: string;
  status: "Draft" | "Pending";
  createdBy: string;
  createdAt: string;
};

export type SavedSearch = { id: string; name: string; query: string; cadence: "Off" | "Daily" | "Weekly"; createdAt: string };

/** sub is the account id, tid the workspace (tenant). iat is the issue time in seconds; role and branches are re-read from the database on every request. */
export type Session = { sub: string; name: string; email: string; role: Role; branchIds: string[]; exp: number; tid?: string; iat?: number };
