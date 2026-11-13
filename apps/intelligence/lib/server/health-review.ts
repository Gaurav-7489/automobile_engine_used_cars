import { plain } from "./db";
import { listWorkspaces } from "./platform-admin";

/**
 * The monthly customer health review from the operating playbook (11.3), filled in from platform data instead of by hand.
 * Five dimensions, each green, amber or red. Thresholds are starting assumptions to calibrate with the first customers, so
 * every rating carries the plain counts behind it.
 */
export type Rating = "green" | "amber" | "red";
export type HealthRow = {
  tenantId: string; organization: string;
  data: { rating: Rating; detail: string }; marketing: { rating: Rating; detail: string }; channels: { rating: Rating; detail: string };
  leads: { rating: Rating; detail: string }; management: { rating: Rating; detail: string }; overall: Rating;
};

const n = (v: unknown) => Number(v ?? 0);
const worst = (rs: Rating[]): Rating => (rs.filter((r) => r === "red").length >= 2 ? "red" : rs.some((r) => r === "red") || rs.filter((r) => r === "amber").length >= 2 ? "amber" : "green");

export function rate(r: Record<string, unknown>): Omit<HealthRow, "tenantId" | "organization"> {
  const live = n(r.vehicles_live), stale = n(r.vehicles_stale), noPhoto = n(r.vehicles_no_photo), noPrice = n(r.vehicles_no_price);
  const gaps = live ? (stale + noPhoto + noPrice) / (live * 3) : 1;
  const data = { rating: (live === 0 ? "red" : gaps <= 0.1 ? "green" : gaps <= 0.3 ? "amber" : "red") as Rating, detail: live ? `${live} cars on sale · ${stale} not updated in 30 days · ${noPhoto} without photos · ${noPrice} without a price` : "No cars on sale" };
  const campaigns = n(r.campaigns_30d), planned = n(r.recommended_30d);
  const marketing = { rating: (planned > 0 ? "green" : campaigns > 0 ? "amber" : "red") as Rating, detail: `${campaigns} campaigns worked on in 30 days, ${planned} from VandLabs plans` };
  const on = n(r.channels_on), convs = n(r.conversations_30d);
  const channels = { rating: (on === 0 ? "red" : convs > 0 ? "green" : "amber") as Rating, detail: on ? `${on} channel${on > 1 ? "s" : ""} on · ${convs} conversations in 30 days` : "No customer channel switched on" };
  const leads30 = n(r.leads_30d), overdue = n(r.leads_overdue), unassigned = n(r.leads_unassigned);
  const open = Math.max(1, leads30);
  const leads = { rating: (leads30 === 0 ? "amber" : (overdue + unassigned) / open <= 0.1 ? "green" : (overdue + unassigned) / open <= 0.3 ? "amber" : "red") as Rating, detail: `${leads30} new leads in 30 days · ${overdue} overdue follow-ups · ${unassigned} unassigned` };
  const logins = n(r.logins_30d), expenses = n(r.expenses_30d);
  const management = { rating: (logins >= 2 && expenses > 0 ? "green" : logins >= 1 ? "amber" : "red") as Rating, detail: `${logins} people signed in within 30 days · ${expenses} expenses recorded` };
  return { data, marketing, channels, leads, management, overall: worst([data.rating, marketing.rating, channels.rating, leads.rating, management.rating]) };
}

export async function healthReview(adminId: string): Promise<HealthRow[]> {
  const [rows, workspaces] = await Promise.all([plain((c) => c.query("SELECT * FROM intelligence_health_counts($1)", [adminId])).then((r) => r.rows as Record<string, unknown>[]), listWorkspaces(adminId)]);
  const names = new Map(workspaces.map((w) => [w.tenantId, w.organization]));
  return rows.map((r) => ({ tenantId: String(r.tenant_id), organization: names.get(String(r.tenant_id)) ?? "Dealership", ...rate(r) }))
    .sort((a, b) => ["red", "amber", "green"].indexOf(a.overall) - ["red", "amber", "green"].indexOf(b.overall) || a.organization.localeCompare(b.organization));
}
