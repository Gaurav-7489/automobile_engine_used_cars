/**
 * DEMO DATA for the admin console. Fictional dealerships used to show the console to prospective dealers before they
 * sign up. Never stored, never sent to the server, never mixed into a real dealership's numbers, and always labelled DEMO.
 */

export type DemoDealership = {
  tenantId: string;
  dealership: string;
  organization: string;
  city: string;
  plan: "Starter" | "Growth" | "Enterprise" | "Trial";
  status: "Active" | "Trial" | "Setting up" | "Paused";
  owner: string;
  createdAt: string;
  locations: number;
  vehicles: number;
  published: number;
  leads: number;
  members: number;
  leads14d: number[];
  stockValueLakh: number;
  avgDaysInStock: number;
  lastActive: string;
  health: number;
};

const days = (n: number) => new Date(Date.UTC(2026, 10, 6) - n * 86_400_000).toISOString();

export const DEMO_DEALERSHIPS: DemoDealership[] = [
  { tenantId: "demo-1", dealership: "Malabar Auto Hub", organization: "Malabar Motors Pvt Ltd", city: "Kozhikode", plan: "Growth", status: "Active", owner: "Anil Varma", createdAt: days(96), locations: 3, vehicles: 148, published: 131, leads: 612, members: 14, leads14d: [31, 28, 35, 40, 37, 44, 39, 46, 42, 51, 48, 55, 49, 58], stockValueLakh: 1084, avgDaysInStock: 34, lastActive: days(0), health: 96 },
  { tenantId: "demo-2", dealership: "Kochi Car Gallery", organization: "KCG Automobiles LLP", city: "Kochi", plan: "Enterprise", status: "Active", owner: "Farah Ibrahim", createdAt: days(152), locations: 5, vehicles: 263, published: 247, leads: 1290, members: 31, leads14d: [72, 80, 77, 85, 91, 88, 95, 102, 98, 107, 111, 104, 118, 121], stockValueLakh: 2236, avgDaysInStock: 29, lastActive: days(0), health: 98 },
  { tenantId: "demo-3", dealership: "Thrissur Pre-Owned", organization: "TPO Wheels", city: "Thrissur", plan: "Starter", status: "Active", owner: "Joseph Mathew", createdAt: days(61), locations: 1, vehicles: 42, published: 35, leads: 158, members: 5, leads14d: [8, 10, 7, 12, 11, 9, 13, 14, 12, 15, 13, 16, 14, 17], stockValueLakh: 251, avgDaysInStock: 47, lastActive: days(1), health: 84 },
  { tenantId: "demo-4", dealership: "Capital Motors Trivandrum", organization: "Capital Motor Traders", city: "Thiruvananthapuram", plan: "Trial", status: "Trial", owner: "Lakshmi Nair", createdAt: days(9), locations: 2, vehicles: 57, published: 22, leads: 41, members: 6, leads14d: [0, 0, 0, 0, 0, 2, 3, 4, 3, 5, 6, 5, 7, 6], stockValueLakh: 402, avgDaysInStock: 52, lastActive: days(0), health: 71 },
  { tenantId: "demo-5", dealership: "Bengaluru Drive Select", organization: "Drive Select Autos Pvt Ltd", city: "Bengaluru", plan: "Growth", status: "Active", owner: "Rohan Shetty", createdAt: days(118), locations: 2, vehicles: 119, published: 104, leads: 538, members: 12, leads14d: [36, 33, 39, 35, 41, 38, 43, 40, 45, 42, 47, 44, 49, 46], stockValueLakh: 1012, avgDaysInStock: 38, lastActive: days(0), health: 91 },
  { tenantId: "demo-6", dealership: "Coimbatore Auto Point", organization: "CAP Vehicles", city: "Coimbatore", plan: "Starter", status: "Setting up", owner: "", createdAt: days(2), locations: 1, vehicles: 0, published: 0, leads: 0, members: 0, leads14d: Array(14).fill(0), stockValueLakh: 0, avgDaysInStock: 0, lastActive: days(2), health: 40 },
];

export const DEMO_ACTIVITY: { at: string; dealership: string; action: string; actor: string }[] = [
  { at: days(0), dealership: "Kochi Car Gallery", action: "Published 6 cars to the showroom", actor: "Farah Ibrahim" },
  { at: days(0), dealership: "Malabar Auto Hub", action: "12 website enquiries became leads", actor: "Website" },
  { at: days(0), dealership: "Capital Motors Trivandrum", action: "Imported 31 vehicles from spreadsheet", actor: "Lakshmi Nair" },
  { at: days(1), dealership: "Bengaluru Drive Select", action: "Approved price change on 2021 Hyundai Creta", actor: "Rohan Shetty" },
  { at: days(1), dealership: "Thrissur Pre-Owned", action: "Invited 2 sales staff", actor: "Joseph Mathew" },
  { at: days(2), dealership: "Coimbatore Auto Point", action: "Dealership created; owner setup link sent", actor: "VandLabs admin" },
  { at: days(3), dealership: "Kochi Car Gallery", action: "Plan changed to Enterprise", actor: "VandLabs admin" },
];

export const DEMO_PLANS: Record<DemoDealership["plan"], number> = { Trial: 0, Starter: 4999, Growth: 12999, Enterprise: 29999 };
