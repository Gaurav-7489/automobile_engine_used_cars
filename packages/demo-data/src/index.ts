import type {
  AnalyticsSnapshot,
  Appointment,
  JourneyEvent,
  Lead,
  LeadStage,
  Task,
  TenantConfig,
  Vehicle,
} from "@vandlabs/contracts";

export const tenantConfig: TenantConfig = {
  tenantId: "tenant-apex",
  organization: {
    id: "org-apex",
    name: "Apex Automotive Group",
    dealerships: [
      {
        id: "dealer-select",
        organizationId: "org-apex",
        name: "Apex Select Cars",
        brandName: "Apex Select",
        locations: [
          { id: "loc-kochi", name: "Kochi Studio", city: "Kochi", state: "Kerala", phone: "+91 484 555 0140" },
          { id: "loc-bengaluru", name: "Bengaluru Studio", city: "Bengaluru", state: "Karnataka", phone: "+91 80 5555 0140" },
        ],
      },
    ],
  },
  activeDealershipId: "dealer-select",
  brand: {
    logoText: "APEX SELECT",
    tagline: "Exceptional cars. Clearly presented.",
    theme: {
      background: "#f3f1ec",
      surface: "#ffffff",
      foreground: "#111512",
      muted: "#687069",
      accent: "#173f32",
    },
    typography: { heading: "Arial", body: "Arial" },
  },
  contact: {
    phone: "+91 484 555 0140",
    email: "hello@apexselect.example",
    whatsapp: "+919000000000",
  },
  navigation: [
    { label: "Inventory", href: "/inventory" },
    { label: "Compare", href: "/compare" },
    { label: "Contact", href: "/contact" },
  ],
  seo: {
    title: "Apex Select Cars",
    description: "Curated premium pre-owned cars in Kochi and Bengaluru.",
    canonicalBase: "https://example.com",
  },
  entitlements: ["inventory", "compare", "finance-intent", "exchange-intent", "crm", "analytics"],
  experience: { showCompare: true, showFinance: true, showExchange: true },
};

const now = "2026-09-29T10:00:00Z";
const editorialMedia = [
  "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1400&q=80",
];

const rows: Array<[string, string, string, string, number, number, number, Vehicle["fuelType"], string, string, string]> = [
  ["bmw-330li-2024", "BMW", "330Li", "M Sport Pro", 2024, 5850000, 9200, "petrol", "Sedan", "Mineral White", "loc-kochi"],
  ["mercedes-glc-300-2023", "Mercedes-Benz", "GLC", "300 4MATIC", 2023, 6990000, 14800, "petrol", "SUV", "Obsidian Black", "loc-bengaluru"],
  ["audi-q5-technology-2023", "Audi", "Q5", "Technology", 2023, 6150000, 18700, "petrol", "SUV", "Navarra Blue", "loc-kochi"],
  ["volvo-xc60-b5-2024", "Volvo", "XC60", "B5 Ultimate", 2024, 6480000, 7600, "hybrid", "SUV", "Crystal White", "loc-bengaluru"],
  ["bmw-x3-20d-2022", "BMW", "X3", "xDrive20d", 2022, 5290000, 26400, "diesel", "SUV", "Brooklyn Grey", "loc-kochi"],
  ["mercedes-c220d-2023", "Mercedes-Benz", "C-Class", "C 220d", 2023, 5725000, 17100, "diesel", "Sedan", "Selenite Grey", "loc-bengaluru"],
  ["audi-a6-technology-2022", "Audi", "A6", "Technology", 2022, 5480000, 22900, "petrol", "Sedan", "Mythos Black", "loc-kochi"],
  ["volvo-s90-b5-2023", "Volvo", "S90", "B5 Ultimate", 2023, 5990000, 12100, "hybrid", "Sedan", "Onyx Black", "loc-bengaluru"],
  ["bmw-x1-18d-2024", "BMW", "X1", "sDrive18d M Sport", 2024, 4890000, 6100, "diesel", "SUV", "Storm Bay", "loc-kochi"],
  ["mercedes-a200-2023", "Mercedes-Benz", "A-Class", "A 200", 2023, 3990000, 11400, "petrol", "Sedan", "Polar White", "loc-bengaluru"],
  ["toyota-fortuner-4x4-2022", "Toyota", "Fortuner", "4x4 AT", 2022, 3790000, 31200, "diesel", "SUV", "Attitude Black", "loc-kochi"],
  ["skoda-kodiaq-lk-2023", "Skoda", "Kodiaq", "L&K", 2023, 3490000, 16400, "petrol", "SUV", "Moon White", "loc-bengaluru"],
  ["jeep-meridian-limited-2023", "Jeep", "Meridian", "Limited (O)", 2023, 3190000, 20800, "diesel", "SUV", "Brilliant Black", "loc-kochi"],
  ["hyundai-ioniq5-2024", "Hyundai", "IONIQ 5", "RWD", 2024, 3890000, 8400, "electric", "SUV", "Gravity Gold", "loc-bengaluru"],
];

export const vehicles: Vehicle[] = rows.map((row, index) => ({
  id: "veh-" + (index + 1),
  slug: row[0],
  tenantId: tenantConfig.tenantId,
  dealershipId: tenantConfig.activeDealershipId,
  locationId: row[10],
  stockId: "ASC-" + String(index + 1).padStart(3, "0"),
  make: row[1],
  model: row[2],
  variant: row[3],
  year: row[4],
  price: row[5],
  mileage: row[6],
  fuelType: row[7],
  transmission: "automatic",
  ownership: index % 6 === 0 ? 2 : 1,
  bodyType: row[8],
  condition: index % 9 === 0 ? "good" : "excellent",
  exteriorColor: row[9],
  interiorColor: index % 3 === 0 ? "Tan" : "Black",
  features: [
    "360 degree camera",
    "Wireless smartphone integration",
    "Adaptive cruise control",
    "Powered front seats",
    "Full service-history review",
  ],
  specifications: {
    powertrain: row[7] === "electric" ? "Electric RWD" : row[7] === "hybrid" ? "Mild-hybrid automatic" : "Automatic powertrain",
    seats: row[8] === "SUV" && index > 9 ? 7 : 5,
    registration: row[10] === "loc-kochi" ? "Kerala" : "Karnataka",
    colour: row[9],
  },
  media: [
    {
      url: editorialMedia[index % editorialMedia.length],
      alt: "Editorial demo media for " + row[1] + " " + row[2],
      kind: "exterior",
    },
  ],
  availabilityStatus: index === 7 || index === 11 ? "reserved" : index === 13 ? "sold" : "available",
  publishStatus: "published",
  source: "dealer",
  externalId: "APEX-" + (1000 + index),
  financeEligible: true,
  exchangeEligible: true,
  createdAt: now,
  updatedAt: now,
}));

export const leads: Lead[] = [
  {
    id: "lead-1",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-kochi",
    vehicleId: "veh-1",
    vehicleIds: ["veh-1"],
    name: "Arjun Nair",
    phone: "+91 98765 41001",
    email: "arjun@example.com",
    channel: "web",
    stage: "new",
    intent: "test_drive",
    assignedTo: "Maya",
    source: "google",
    campaign: "premium-sedan-kochi",
    consent: { whatsapp: true, marketing: false },
    journey: { vehicleInterestHistory: ["veh-1", "veh-6"] },
    createdAt: "2026-09-29T08:35:00Z",
    updatedAt: "2026-09-29T08:35:00Z",
  },
  {
    id: "lead-2",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-bengaluru",
    vehicleId: "veh-4",
    vehicleIds: ["veh-4"],
    name: "Neha Rao",
    phone: "+91 98765 41002",
    channel: "call",
    stage: "contacted",
    intent: "enquiry",
    assignedTo: "Kabir",
    source: "direct",
    consent: { whatsapp: false, marketing: false },
    journey: { vehicleInterestHistory: ["veh-4"] },
    createdAt: "2026-09-29T07:50:00Z",
    updatedAt: "2026-09-29T09:05:00Z",
  },
  {
    id: "lead-3",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-kochi",
    vehicleId: "veh-3",
    vehicleIds: ["veh-3", "veh-5"],
    name: "Rohan Menon",
    phone: "+91 98765 41003",
    email: "rohan@example.com",
    channel: "whatsapp",
    stage: "qualified",
    intent: "finance",
    assignedTo: "Maya",
    source: "instagram",
    campaign: "suv-week",
    consent: { whatsapp: true, marketing: true },
    journey: { vehicleInterestHistory: ["veh-3", "veh-5"] },
    createdAt: "2026-09-28T13:20:00Z",
    updatedAt: "2026-09-29T08:10:00Z",
  },
  {
    id: "lead-4",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-bengaluru",
    vehicleId: "veh-2",
    vehicleIds: ["veh-2"],
    name: "Aisha Khan",
    phone: "+91 98765 41004",
    channel: "web",
    stage: "appointment",
    intent: "test_drive",
    assignedTo: "Kabir",
    source: "google",
    campaign: "glc-search",
    consent: { whatsapp: true, marketing: false },
    journey: { vehicleInterestHistory: ["veh-2"] },
    createdAt: "2026-09-27T11:10:00Z",
    updatedAt: "2026-09-29T09:30:00Z",
  },
  {
    id: "lead-5",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-kochi",
    vehicleId: "veh-11",
    vehicleIds: ["veh-11"],
    name: "Vikram Pillai",
    phone: "+91 98765 41005",
    channel: "web",
    stage: "test_drive",
    intent: "exchange",
    assignedTo: "Maya",
    source: "referral",
    consent: { whatsapp: true, marketing: false },
    journey: { vehicleInterestHistory: ["veh-11"] },
    createdAt: "2026-09-25T10:00:00Z",
    updatedAt: "2026-09-29T09:45:00Z",
  },
  {
    id: "lead-6",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-bengaluru",
    vehicleId: "veh-8",
    vehicleIds: ["veh-8"],
    name: "Meera Iyer",
    phone: "+91 98765 41006",
    channel: "whatsapp",
    stage: "negotiation",
    intent: "finance",
    assignedTo: "Kabir",
    source: "meta",
    campaign: "executive-sedan",
    consent: { whatsapp: true, marketing: true },
    journey: { vehicleInterestHistory: ["veh-8", "veh-7"] },
    createdAt: "2026-09-21T14:15:00Z",
    updatedAt: "2026-09-29T09:55:00Z",
  },
  {
    id: "lead-7",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-kochi",
    vehicleId: "veh-9",
    vehicleIds: ["veh-9"],
    name: "Aditya Bose",
    phone: "+91 98765 41007",
    channel: "email",
    stage: "won",
    intent: "enquiry",
    assignedTo: "Maya",
    source: "organic",
    consent: { whatsapp: false, marketing: false },
    journey: { vehicleInterestHistory: ["veh-9"] },
    createdAt: "2026-09-15T09:00:00Z",
    updatedAt: "2026-09-27T12:00:00Z",
  },
  {
    id: "lead-8",
    tenantId: "tenant-apex",
    dealershipId: "dealer-select",
    locationId: "loc-bengaluru",
    vehicleId: "veh-10",
    vehicleIds: ["veh-10"],
    name: "Sara Thomas",
    phone: "+91 98765 41008",
    channel: "web",
    stage: "nurture",
    intent: "enquiry",
    assignedTo: "Kabir",
    source: "google",
    campaign: "entry-luxury",
    consent: { whatsapp: true, marketing: true },
    journey: { vehicleInterestHistory: ["veh-10"] },
    createdAt: "2026-09-18T16:20:00Z",
    updatedAt: "2026-09-26T10:00:00Z",
  },
];

export const tasks: Task[] = [
  { id: "task-1", leadId: "lead-1", title: "First response", owner: "Maya", dueAt: "2026-09-29T10:15:00Z", completed: false, priority: "high" },
  { id: "task-2", leadId: "lead-3", title: "Share finance options", owner: "Maya", dueAt: "2026-09-29T12:00:00Z", completed: false, priority: "normal" },
  { id: "task-3", leadId: "lead-6", title: "Negotiation follow-up", owner: "Kabir", dueAt: "2026-09-29T11:30:00Z", completed: false, priority: "high" },
  { id: "task-4", leadId: "lead-7", title: "Handover follow-up", owner: "Maya", dueAt: "2026-09-30T09:30:00Z", completed: false, priority: "normal" },
];

export const appointments: Appointment[] = [
  { id: "appt-1", leadId: "lead-4", vehicleId: "veh-2", type: "test_drive", scheduledAt: "2026-09-29T13:30:00Z", locationId: "loc-bengaluru", status: "scheduled" },
  { id: "appt-2", leadId: "lead-5", vehicleId: "veh-11", type: "test_drive", scheduledAt: "2026-09-29T16:00:00Z", locationId: "loc-kochi", status: "scheduled" },
  { id: "appt-3", leadId: "lead-3", vehicleId: "veh-3", type: "appointment", scheduledAt: "2026-09-30T10:00:00Z", locationId: "loc-kochi", status: "scheduled" },
];

export const journeyEvents: JourneyEvent[] = [
  { id: "evt-1", tenantId: "tenant-apex", sessionId: "s1", type: "vehicle_view", vehicleId: "veh-1", source: "google", campaign: "premium-sedan-kochi", path: "/vehicles/bmw-330li-2024", occurredAt: now },
  { id: "evt-2", tenantId: "tenant-apex", sessionId: "s2", type: "vehicle_view", vehicleId: "veh-4", source: "direct", path: "/vehicles/volvo-xc60-b5-2024", occurredAt: now },
  { id: "evt-3", tenantId: "tenant-apex", sessionId: "s3", type: "lead_created", vehicleId: "veh-3", source: "instagram", campaign: "suv-week", path: "/vehicles/audi-q5-technology-2023", occurredAt: now },
];

const stageCounts = leads.reduce<Partial<Record<LeadStage, number>>>((acc, lead) => {
  acc[lead.stage] = (acc[lead.stage] ?? 0) + 1;
  return acc;
}, {});

const sourceCounts = leads.reduce<Record<string, number>>((acc, lead) => {
  acc[lead.source] = (acc[lead.source] ?? 0) + 1;
  return acc;
}, {});

export const analyticsSnapshot: AnalyticsSnapshot = {
  inventory: vehicles.length,
  available: vehicles.filter((vehicle) => vehicle.availabilityStatus === "available").length,
  reserved: vehicles.filter((vehicle) => vehicle.availabilityStatus === "reserved").length,
  sold: vehicles.filter((vehicle) => vehicle.availabilityStatus === "sold").length,
  leads: leads.length,
  uncontacted: leads.filter((lead) => lead.stage === "new").length,
  qualified: leads.filter((lead) => ["qualified", "appointment", "visited", "test_drive", "negotiation", "won"].includes(lead.stage)).length,
  appointments: appointments.filter((appointment) => appointment.status === "scheduled").length,
  testDrives: leads.filter((lead) => ["test_drive", "negotiation", "won"].includes(lead.stage)).length,
  negotiations: leads.filter((lead) => lead.stage === "negotiation").length,
  wins: leads.filter((lead) => lead.stage === "won").length,
  stageCounts,
  sourceCounts,
  vehicleDemand: [
    { vehicleId: "veh-1", views: 128, enquiries: 11 },
    { vehicleId: "veh-4", views: 112, enquiries: 9 },
    { vehicleId: "veh-3", views: 96, enquiries: 8 },
    { vehicleId: "veh-2", views: 85, enquiries: 7 },
  ],
};

export const activeDealership = tenantConfig.organization.dealerships.find(
  (dealership) => dealership.id === tenantConfig.activeDealershipId,
)!;

export const locationName = (id: string) =>
  activeDealership.locations.find((location) => location.id === id)?.name ?? "Dealership";

export const vehicleById = (id?: string) => vehicles.find((vehicle) => vehicle.id === id);
export const leadById = (id: string) => leads.find((lead) => lead.id === id);
