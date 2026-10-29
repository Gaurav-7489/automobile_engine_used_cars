import type { Command } from "../actions/recorder";
import type { Alert, AuditEvent, Lead, Sale, Vehicle } from "../domain";
import type { WorkspaceState } from "../state";
import { reopenExpired } from "../actions/alerts";
import { deriveAlerts } from "../alerts-derive";
import type { SqlClient } from "./db";
import { enquiryContext, idFloors, salesByIds } from "./read-queries";

/**
 * Commands normally run against the whole workspace. At scale that means reading every vehicle and lead to change one, so
 * commands that are known to depend only on the records they name run against those records instead.
 *
 * A command is scoped only if listed in `NEEDS` below, where each entry says exactly which records the command reads or
 * writes. Anything else (an unknown or unlisted command) returns `null` and runs against the whole workspace, which is
 * always correct. tests/intelligence-prod/scoped-commands.test.ts runs every listed command both ways and requires
 * identical results.
 */
export type Needs = {
  vehicles: Set<string>;
  leads: Set<string>;
  sales: Set<string>;
  /** Exact registration numbers a new vehicle must not duplicate (non-archived stock). */
  registrations: Set<string>;
  /** Phone numbers (digits only) a new lead is checked against. */
  contacts: Set<string>;
  /** Appointment instants a booking is checked against for double-booking. */
  appointmentsAt: Set<string>;
  /** Import batch keys, so a retried import is recognised. */
  importBatches: Set<string>;
  /** Every string argument: alert ids, request and campaign ids and record references the command may act on. */
  refs: Set<string>;
};

type Args = unknown[];
type Extractor = (args: Args, shell: WorkspaceState, add: Needs) => void;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length < 200 ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => x !== null).slice(0, 500) : []);
const vehicle = (a: Needs, id: unknown) => { const s = str(id); if (s) a.vehicles.add(s); };
const lead = (a: Needs, id: unknown) => { const s = str(id); if (s) a.leads.add(s); };
const campaignVehicle = (a: Needs, shell: WorkspaceState, id: unknown) => { const c = shell.campaigns.find((x) => x.id === id); if (c) a.vehicles.add(c.vehicleId); };
const requestVehicle = (a: Needs, shell: WorkspaceState, id: unknown) => { const r = shell.priceRequests.find((x) => x.id === id); if (r) a.vehicles.add(r.vehicleId); };
const none: Extractor = () => undefined;

/** An alert id names the record that raised it (AL-price-V-1001, AL-sla-L-1002, AL-approval-PR-1001 ...), so acting on an alert loads that record. */
const alertRecords = (a: Needs, shell: WorkspaceState, ids: string[]) => {
  for (const id of ids) {
    const m = /^AL-(price|aged|docs|photos|costs|sla|task|approval|campaign)-(.+)$/.exec(id);
    if (!m) continue;
    if (["price", "aged", "docs", "photos", "costs"].includes(m[1])) a.vehicles.add(m[2]);
    else if (m[1] === "sla" || m[1] === "task") a.leads.add(m[2]);
    else if (m[1] === "approval") requestVehicle(a, shell, m[2]);
    else campaignVehicle(a, shell, m[2]);
  }
};

const NEEDS: Record<string, Extractor> = {
  // Alerts: acted on by id; the alert objects themselves are provided from the derived set.
  acknowledge: (a, s, n) => alertRecords(n, s, strs(a[0])), assignAlerts: (a, s, n) => alertRecords(n, s, strs(a[0])),
  snooze: (a, s, n) => alertRecords(n, s, [str(a[0]) ?? ""]), resolve: (a, s, n) => alertRecords(n, s, [str(a[0]) ?? ""]), updateRules: none,
  // Campaigns: the campaign is in the shell; the vehicle it refers to is loaded.
  createCampaign: (a, _s, v) => vehicle(v, a[0]),
  updateCampaign: (a, s, v) => campaignVehicle(v, s, a[0]),
  changeVehicle: (a, s, v) => { campaignVehicle(v, s, a[0]); vehicle(v, a[1]); },
  submitCampaign: (a, s, v) => campaignVehicle(v, s, a[0]), approveCampaign: (a, s, v) => campaignVehicle(v, s, a[0]), publishCampaign: (a, s, v) => campaignVehicle(v, s, a[0]),
  pauseCampaign: (a, s, v) => campaignVehicle(v, s, a[0]), resumeCampaign: (a, s, v) => campaignVehicle(v, s, a[0]), discardCampaign: (a, s, v) => campaignVehicle(v, s, a[0]),
  // Pricing.
  createPriceRequest: (a, _s, v) => vehicle(v, (a[0] as { vehicleId?: unknown } | undefined)?.vehicleId),
  submitPriceRequest: (a, s, v) => requestVehicle(v, s, a[0]), approvePriceRequest: (a, s, v) => requestVehicle(v, s, a[0]), rejectPriceRequest: (a, s, v) => requestVehicle(v, s, a[0]),
  withdrawPriceRequest: (a, s, v) => requestVehicle(v, s, a[0]), retryFailedChannels: (a, s, v) => requestVehicle(v, s, a[0]),
  // Finance.
  proposeCorrection: (a, _s, n) => { const s = str(a[0]); if (s) n.sales.add(s); },
  // Inventory.
  addVehicle: (a, _s, n) => { const reg = str((a[0] as { registration?: unknown } | undefined)?.registration)?.trim(); if (reg) n.registrations.add(reg); },
  updateVehicle: (a, _s, n) => vehicle(n, a[0]),
  transitionVehicle: (a, _s, n) => vehicle(n, a[0]),
  importCommit: (a, _s, n) => {
    for (const row of Array.isArray(a[0]) ? (a[0] as { values?: Record<string, unknown> }[]).slice(0, 2000) : []) { const reg = str(row?.values?.registration)?.trim(); if (reg) n.registrations.add(reg); }
    const key = str(a[2]); if (key) n.importBatches.add(key);
  },
  bulkArchive: (a, _s, n) => strs(a[0]).forEach((id) => n.vehicles.add(id)),
  bulkAssignBranch: (a, _s, n) => strs(a[0]).forEach((id) => n.vehicles.add(id)),
  publishVehicles: (a, _s, n) => strs(a[0]).forEach((id) => n.vehicles.add(id)),
  // Leads.
  addLead: (a, _s, n) => { const digits = str((a[0] as { contact?: unknown } | undefined)?.contact)?.replace(/\D/g, ""); if (digits) n.contacts.add(digits); },
  changeStage: (a, _s, n) => { lead(n, a[0]); const sale = str((a[3] as { saleId?: unknown } | undefined)?.saleId); if (sale) n.sales.add(sale); },
  logOutcome: (a, _s, n) => lead(n, a[0]), sendMessage: (a, _s, n) => lead(n, a[0]), retryMessage: (a, _s, n) => lead(n, a[0]), cancelAppointment: (a, _s, n) => lead(n, a[0]),
  toggleTask: (a, _s, n) => lead(n, a[0]), assignLead: (a, _s, n) => lead(n, a[0]),
  scheduleAppointment: (a, _s, n) => {
    lead(n, a[0]);
    const i = a[1] as { date?: unknown; time?: unknown } | undefined;
    const [y, m, d] = String(i?.date ?? "").split("-").map(Number); const [hh, mm] = String(i?.time ?? "").split(":").map(Number);
    if ([y, m, d, hh, mm].every(Number.isFinite)) n.appointmentsAt.add(new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60_000).toISOString());
  },
  mergeLeads: (a, _s, n) => { lead(n, a[0]); lead(n, a[1]); },
  // Settings, market and team: shell collections only.
  toggleWatch: none, saveSearch: none, renameSearch: none, deleteSearch: none, logContactIntent: none, saveScenario: none,
  testConnection: none, connectIntegration: none, disconnectIntegration: none, inviteMember: none, changeRole: none, removeMember: none, saveBusiness: none, saveBranch: none,
  setNotification: none, revokeApiKey: none, revokeSessions: none, setPolicy: none,
};

/** The records a batch needs, or null when any command in it is not proven scope-safe (the caller then reads everything). */
export function needsOf(commands: Command[], shell: WorkspaceState): Needs | null {
  const needs: Needs = { vehicles: new Set(), leads: new Set(), sales: new Set(), registrations: new Set(), contacts: new Set(), appointmentsAt: new Set(), importBatches: new Set(), refs: new Set() };
  for (const command of commands) {
    if (!Object.hasOwn(NEEDS, command.name)) return null;
    NEEDS[command.name](command.args, shell, needs);
    for (const arg of command.args) { for (const s of Array.isArray(arg) ? strs(arg) : [str(arg)]) if (s) needs.refs.add(s); }
  }
  return needs;
}

const unique = <T,>(items: T[], key: (t: T) => string): T[] => [...new Map(items.map((x) => [key(x), x])).values()];

/**
 * The shell plus exactly the records the commands need. Reads the read model inside the caller's tenant transaction, after it
 * has been brought up to date, so the records equal what the whole-workspace read would give for them.
 */
export async function scopedState(c: SqlClient, tenantId: string, shell: WorkspaceState, needs: Needs): Promise<WorkspaceState> {
  const rows = async <T,>(sql: string, values: unknown[]): Promise<T[]> => (await c.query(sql, [tenantId, ...values])).rows.map((r) => r.data as T);
  let vehicles = needs.vehicles.size ? await rows<Vehicle>("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = ANY($2::text[])", [[...needs.vehicles]]) : [];
  if (needs.registrations.size) vehicles = vehicles.concat(await rows<Vehicle>("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND registration = ANY($2::text[]) AND status <> 'archived'", [[...needs.registrations]]));
  vehicles = unique(vehicles, (v) => v.id);
  const ctx = vehicles.length ? await enquiryContext(c, tenantId) : null;
  vehicles = vehicles.map((v) => ({ ...v, enquiries14d: ctx?.byStock.get(v.id) ?? 0, cohortMedianEnquiries: ctx?.median ?? 0 }));

  let leads = needs.leads.size ? await rows<Lead>("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND lead_id = ANY($2::text[])", [[...needs.leads]]) : [];
  if (needs.contacts.size) leads = leads.concat(await rows<Lead>("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND contact_digits = ANY($2::text[]) AND stage <> 'Lost'", [[...needs.contacts]]));
  if (needs.appointmentsAt.size) leads = leads.concat(await rows<Lead>("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND appointment_at = ANY($2::timestamptz[])", [[...needs.appointmentsAt]]));
  leads = unique(leads, (l) => l.id);

  const sales: Sale[] = await salesByIds(c, tenantId, [...needs.sales]);
  const audit: AuditEvent[] = needs.importBatches.size
    ? ((await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'audit' AND payload->>'action' = 'inventory.import' AND payload->>'target' = ANY($2::text[])", [tenantId, [...needs.importBatches]])).rows.map((r) => r.payload as AuditEvent))
    : [];

  // Alerts the commands can act on: derived from just the records loaded here (an alert depends only on its own record, the policy and the
  // pending requests), merged with the stored alert documents exactly as the whole-workspace read does.
  const stored = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'alerts'", [tenantId])).rows.map((r) => r.payload as Alert);
  const partial: WorkspaceState = { ...shell, vehicles, leads, alerts: stored };
  const derived = reopenExpired({ ...partial, alerts: deriveAlerts(partial, new Date().toISOString()) }).alerts;
  const refs = new Set<string>([...needs.refs, ...vehicles.map((v) => v.id), ...leads.map((l) => l.id), ...sales.map((x) => x.id)]);
  const alerts: Alert[] = derived.filter((a) => refs.has(a.id) || refs.has(a.recordRef) || a.type === "Integration");

  return { ...shell, vehicles, leads, sales, alerts, audit, events: [], idFloor: await idFloors(c, tenantId), partial: true };
}
