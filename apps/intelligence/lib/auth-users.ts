import type { Role } from "./domain";

export type DemoUser = { sub: string; name: string; email: string; role: Role; branchIds: string[]; mfa: boolean };

const ALL = ["koc", "tcr", "ccj"];

/** Synthetic identities for the demonstration workspace. Real tenants authenticate through the configured identity provider. */
const USERS: DemoUser[] = [
  { sub: "u-owner", name: "Arjun Rao", email: "owner@example.com", role: "owner", branchIds: ALL, mfa: false },
  { sub: "u-manager", name: "Manager 01", email: "manager@example.com", role: "manager", branchIds: ["koc", "tcr"], mfa: false },
  { sub: "u-inventory", name: "Ops 01", email: "inventory@example.com", role: "inventory", branchIds: ["koc"], mfa: false },
  { sub: "u-marketing", name: "Marketing 01", email: "marketing@example.com", role: "marketing", branchIds: ALL, mfa: false },
  { sub: "u-sales", name: "Sales 01", email: "sales@example.com", role: "sales", branchIds: ["koc"], mfa: false },
  { sub: "u-finance", name: "Finance 01", email: "finance@example.com", role: "finance", branchIds: ALL, mfa: true },
  { sub: "u-viewer", name: "Viewer 01", email: "viewer@example.com", role: "viewer", branchIds: ["koc"], mfa: false },
];

export function demoModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.INTELLIGENCE_DEMO === "1";
}

function configuredUsers(): DemoUser[] | null {
  const raw = process.env.INTELLIGENCE_USERS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DemoUser[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function directory(): DemoUser[] {
  return configuredUsers() ?? (demoModeEnabled() ? USERS : []);
}

export function demoPassword(): string | null {
  const configured = process.env.INTELLIGENCE_DEMO_PASSWORD;
  if (configured && configured.length >= 12) return configured;
  return process.env.NODE_ENV === "production" ? null : "vandlabs-demo";
}

export function demoMfaCode(): string {
  return process.env.INTELLIGENCE_DEMO_MFA_CODE || "424242";
}

export function configuredProviders(): { id: "google" | "microsoft"; label: string }[] {
  const raw = process.env.SSO_PROVIDERS ?? (process.env.NODE_ENV === "production" ? "" : "google,microsoft");
  const ids = raw.split(",").map((s) => s.trim().toLowerCase());
  return ([{ id: "google", label: "Google SSO" }, { id: "microsoft", label: "Microsoft SSO" }] as const).filter((p) => ids.includes(p.id));
}

/** Constant-time string comparison for credential checks. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
