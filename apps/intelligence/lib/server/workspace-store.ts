import type { SqlClient } from "./db";
import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { roleOf } from "./identity";
import { istDate, slugify, toRupees, uuidFrom } from "./ids";
import { buildLead, buildLedgerSale, buildVehicle, stageToContract, type Row } from "./records";
import type { Alert, ApiKey, AuditEvent, Branch, Campaign, Integration, Lead, Lifecycle, PriceRequest, Sale, TeamMember, Vehicle, InventoryEvent, SavedSearch, Scenario, AcquisitionReview } from "../domain";
import { buildProductionState, STATE_VERSION, type WorkspaceState } from "../state";
import { deriveAlerts } from "../alerts-derive";
import { reopenExpired } from "../actions/alerts";

type StaffRow = { userId: string; displayName: string; role: string; intelligenceRole?: string; email?: string; locationIds: string[]; enabled: boolean };

/** Collections kept as tenant-scoped documents. Each entity has a string `id`. */
export const DOC_COLLECTIONS = ["alerts", "priceRequests", "campaigns", "integrations", "apiKeys", "audit", "savedSearches", "scenarios", "reviews", "corrections", "reportSchedules", "savedViews"] as const;
type DocCollection = (typeof DOC_COLLECTIONS)[number];
type Meta = Pick<WorkspaceState, "policy" | "notifications" | "sessionsRevoked" | "watchlist" | "contactIntents"> & { profile: { legalName: string; gstin: string; displayName: string; timezone: string; defaultBranchId?: string } };

const LIFECYCLE_AVAILABILITY: Record<Lifecycle, "available" | "reserved" | "sold"> = { available: "available", reserved: "reserved", preparation: "available", sold: "sold", archived: "available" };
/* ------------------------------------------------------------------ read */

/**
 * The reference read of a whole workspace. With `shell: true` the large per-record collections (vehicles, costs, leads, tasks,
 * sales) are not queried: the result holds only the small collections every page needs, and pages fetch their own records.
 */
export async function readState(c: SqlClient, tenantId: string, options: { shell?: boolean } = {}): Promise<WorkspaceState> {
  // One round trip instead of ten: each result set comes back as a JSON array in a single row. A network hop to a hosted
  // database costs far more than the query, and the connection runs statements one at a time.
  const HEAVY = new Set([2, 3, 4, 5, 6]);
  const queries = [
    "SELECT id, name FROM organizations WHERE tenant_id=$1 ORDER BY created_at LIMIT 1",
    "SELECT id, dealership_id, name, city, state FROM locations WHERE tenant_id=$1 ORDER BY name",
    "SELECT id, dealership_id, location_id, stock_id, payload, publish_status, availability_status, created_at, updated_at FROM vehicles WHERE tenant_id=$1",
    "SELECT vehicle_id, payload FROM stock_costs WHERE tenant_id=$1",
    "SELECT id, location_id, vehicle_id, payload, stage, source, campaign, created_at, updated_at FROM leads WHERE tenant_id=$1",
    "SELECT id, lead_id, payload, due_at, completed FROM tasks WHERE tenant_id=$1",
    "SELECT id, lead_id, vehicle_id, payload, amount, sold_at FROM sales WHERE tenant_id=$1",
    "SELECT user_id, payload FROM staff_members WHERE tenant_id=$1",
    `SELECT collection, id, payload, updated_at FROM intelligence_documents WHERE tenant_id=$1 AND (collection <> 'audit' OR id IN (SELECT id FROM intelligence_documents WHERE tenant_id=$1 AND collection='audit' ORDER BY updated_at DESC LIMIT 500))`,
    "SELECT token_hash, email, role, intelligence_role, location_ids, display_name, created_at, expires_at FROM intelligence_tokens WHERE tenant_id=$1 AND kind='invite' AND used_at IS NULL AND expires_at > now()",
  ];
  const packed = (await c.query(`SELECT ${queries.map((sql, i) => `(SELECT coalesce(json_agg(r), '[]'::json) FROM (${options.shell && HEAVY.has(i) ? "SELECT 1 AS x WHERE false" : sql}) r) AS r${i}`).join(", ")}`, [tenantId])).rows[0] ?? {};
  const [orgs, locations, vehicles, costs, leads, tasks, sales, staff, docs, tokens] = queries.map((_, i) => (typeof packed[`r${i}`] === "string" ? JSON.parse(packed[`r${i}`] as string) : packed[`r${i}`] ?? []) as Row[]);

  const org = orgs[0];
  const byCollection = new Map<string, Map<string, { payload: unknown; updatedAt: number }>>();
  for (const d of docs) {
    const m = byCollection.get(String(d.collection)) ?? new Map();
    m.set(String(d.id), { payload: d.payload, updatedAt: new Date(String(d.updated_at)).getTime() });
    byCollection.set(String(d.collection), m);
  }
  const list = <T>(name: string): T[] => [...(byCollection.get(name)?.values() ?? [])].map((d) => d.payload as T);
  const meta = (byCollection.get("meta")?.get("workspace")?.payload ?? {}) as Partial<Meta>;
  const base = buildProductionState();
  const profile = { legalName: org ? String(org.name) : "", gstin: "", displayName: org ? String(org.name) : "", timezone: "Asia/Kolkata", ...(meta.profile ?? {}) };

  const branches: Branch[] = locations.map((l, i) => ({ id: String(l.id), name: String(l.name), city: String(l.city), state: String(l.state), timezone: "Asia/Kolkata", isDefault: meta.profile?.defaultBranchId ? String(l.id) === meta.profile.defaultBranchId : i === 0 }));
  const firstBranch = branches[0]?.id ?? "";

  // Vehicles: shared row is the system of record for core fields whenever it changed after the Intelligence record.
  const costByVehicle = new Map(costs.map((r) => [String(r.vehicle_id), r.payload as Row]));
  const vehicleDocs = byCollection.get("vehicles");
  const stockIdByUuid = new Map(vehicles.map((v) => [String(v.id), String(v.stock_id)]));
  const outVehicles: Vehicle[] = vehicles.map((row) => buildVehicle(row, vehicleDocs?.get(String(row.stock_id)), costByVehicle.get(String(row.id))));

  // Enquiry counts for the last 14 days are measured from real leads, not estimated.
  const fourteenDays = Date.now() - 14 * 86_400_000;
  const enquiries = new Map<string, number>();
  for (const l of leads) {
    if (!l.vehicle_id || new Date(String(l.created_at)).getTime() < fourteenDays) continue;
    const sid = stockIdByUuid.get(String(l.vehicle_id));
    if (sid) enquiries.set(sid, (enquiries.get(sid) ?? 0) + 1);
  }
  const live = outVehicles.filter((v) => v.status === "available");
  const counts = live.map((v) => enquiries.get(v.id) ?? 0).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  for (const v of outVehicles) { v.enquiries14d = enquiries.get(v.id) ?? 0; v.cohortMedianEnquiries = median; }

  // Leads
  const leadDocs = byCollection.get("leads");
  const tasksByLead = new Map<string, Row[]>();
  for (const t of tasks) tasksByLead.set(String(t.lead_id), [...(tasksByLead.get(String(t.lead_id)) ?? []), t]);
  const leadIdByUuid = new Map<string, string>();
  const stockOf = (uuid: string) => stockIdByUuid.get(uuid);
  const outLeads: Lead[] = leads.map((row) => {
    const uuid = String(row.id);
    const publicId = String((row.payload as Row).intelligenceId ?? `L-${uuid.slice(0, 8)}`);
    leadIdByUuid.set(uuid, publicId);
    return buildLead(row, leadDocs?.get(publicId), tasksByLead.get(uuid) ?? [], stockOf, firstBranch);
  });

  // Sales
  const saleDocs = byCollection.get("sales");
  const outSales: Sale[] = [];
  const documentedSales = new Set<string>();
  for (const [, d] of saleDocs ?? []) { const s = d.payload as Sale; outSales.push(s); documentedSales.add(s.vehicleId); }
  const vehicleById = new Map(outVehicles.map((v) => [v.id, v]));
  for (const row of sales) {
    const stockId = stockIdByUuid.get(String(row.vehicle_id));
    if (!stockId || documentedSales.has(stockId)) continue;
    outSales.push(buildLedgerSale(row, stockId, vehicleById.get(stockId), firstBranch));
  }

  // Team
  const staffRows = staff.map((s) => ({ ...(s.payload as Row), userId: String(s.user_id) })) as unknown as StaffRow[];
  const team: TeamMember[] = [
    ...staffRows.flatMap((s) => {
      const role = roleOf({ role: s.role, intelligenceRole: s.intelligenceRole });
      return role && s.enabled !== false ? [{ id: s.userId, name: s.displayName, email: s.email ?? "", role, branchIds: s.locationIds, mfa: false, status: "Active" as const }] : [];
    }),
    ...tokens.map((t) => ({ id: `invite-${String(t.token_hash).slice(0, 12)}`, name: String(t.display_name ?? t.email), email: String(t.email), role: (t.intelligence_role ?? "viewer") as TeamMember["role"], branchIds: t.location_ids as string[], mfa: false, status: "Invited" as const })),
  ];

  const state: WorkspaceState = {
    ...base,
    version: STATE_VERSION,
    tenant: { id: tenantId, name: profile.displayName, legalName: profile.legalName, gstin: profile.gstin, displayName: profile.displayName, timezone: profile.timezone },
    branches, vehicles: outVehicles, sales: outSales, leads: outLeads, team,
    events: inventoryEvents(outVehicles, outSales), alerts: list<Alert>("alerts"), priceRequests: list<PriceRequest>("priceRequests"), campaigns: list<Campaign>("campaigns"),
    integrations: mergeIntegrations(base.integrations, list<Integration>("integrations")), apiKeys: list<ApiKey>("apiKeys"),
    audit: list<AuditEvent>("audit").sort((a, b) => b.at.localeCompare(a.at)), savedSearches: list<SavedSearch>("savedSearches"), scenarios: list<Scenario>("scenarios"), reviews: list<AcquisitionReview>("reviews"),
    corrections: list<WorkspaceState["corrections"][number]>("corrections"), reportSchedules: list<WorkspaceState["reportSchedules"][number]>("reportSchedules"), savedViews: list<WorkspaceState["savedViews"][number]>("savedViews"),
    policy: { ...base.policy, ...(meta.policy ?? {}) }, notifications: { ...base.notifications, ...(meta.notifications ?? {}) }, sessionsRevoked: meta.sessionsRevoked ?? 0, watchlist: meta.watchlist ?? [], contactIntents: meta.contactIntents ?? [],
  };
  if (options.shell) return { ...state, alerts: [] };
  return reopenExpired({ ...state, alerts: deriveAlerts(state, new Date().toISOString()) });
}

/** Inventory events are derived from the records themselves: an acquisition per vehicle and a sale per recorded sale. */
function inventoryEvents(vehicles: Vehicle[], sales: Sale[]): InventoryEvent[] {
  return [
    ...vehicles.map((v) => ({ id: `ev-a-${v.id}`, branchId: v.branchId, type: "acquired" as const, at: v.acquiredAt, label: `${v.make} ${v.model}`, ref: v.id })),
    ...sales.filter((s) => s.state === "Completed").map((s) => ({ id: `ev-s-${s.id}`, branchId: s.branchId, type: "sold" as const, at: s.closedAt, label: s.label, ref: s.vehicleId })),
  ];
}

function mergeIntegrations(base: Integration[], stored: Integration[]): Integration[] {
  return base.map((i) => stored.find((s) => s.id === i.id) ?? i);
}

/* --------------------------------------------------------------- persist */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function persist(c: SqlClient, p: Principal, before: WorkspaceState, after: WorkspaceState, stamp: string): Promise<void> {
  const tenantId = p.tenantId;
  const upsertDoc = (collection: string, id: string, payload: unknown) =>
    c.query(`INSERT INTO intelligence_documents(tenant_id, collection, id, payload, updated_at) VALUES($1,$2,$3,$4,$5)
             ON CONFLICT (tenant_id, collection, id) DO UPDATE SET payload = EXCLUDED.payload, version = intelligence_documents.version + 1, updated_at = EXCLUDED.updated_at`, [tenantId, collection, id, payload, stamp]);
  const deleteDoc = (collection: string, id: string) => c.query("DELETE FROM intelligence_documents WHERE tenant_id=$1 AND collection=$2 AND id=$3", [tenantId, collection, id]);

  for (const name of DOC_COLLECTIONS as readonly DocCollection[]) {
    const prev = new Map((before[name] as { id: string }[]).map((x) => [x.id, x]));
    const next = new Map((after[name] as { id: string }[]).map((x) => [x.id, x]));
    for (const [id, item] of next) if (!prev.has(id) || !same(prev.get(id), item)) await upsertDoc(name, id, item);
    for (const id of prev.keys()) if (!next.has(id)) await deleteDoc(name, id);
  }
  const metaBefore = metaOf(before);
  const metaAfter = metaOf(after);
  if (!same(metaBefore, metaAfter)) await upsertDoc("meta", "workspace", metaAfter);

  await persistBranches(c, tenantId, before, after);
  await persistVehicles(c, p, before, after, stamp, upsertDoc);
  await persistLeads(c, p, before, after, stamp, upsertDoc);
  await persistSales(c, p, before, after, stamp, upsertDoc);
  await persistTeam(c, p, before, after, stamp);
}

function metaOf(s: WorkspaceState): Meta & { id: string } {
  return { id: "workspace", policy: s.policy, notifications: s.notifications, sessionsRevoked: s.sessionsRevoked, watchlist: s.watchlist, contactIntents: s.contactIntents,
    profile: { legalName: s.tenant.legalName, gstin: s.tenant.gstin, displayName: s.tenant.displayName, timezone: s.tenant.timezone, defaultBranchId: s.branches.find((b) => b.isDefault)?.id } };
}

async function persistBranches(c: SqlClient, tenantId: string, before: WorkspaceState, after: WorkspaceState) {
  const prev = new Map(before.branches.map((b) => [b.id, b]));
  const dealership = (await c.query("SELECT id FROM dealerships WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenantId])).rows[0] as Row | undefined;
  for (const b of after.branches) {
    const old = prev.get(b.id);
    if (old && same(old, b)) continue;
    if (old) await c.query("UPDATE locations SET name=$3, city=$4, state=$5 WHERE tenant_id=$1 AND id=$2", [tenantId, b.id, b.name, b.city, b.state]);
    else if (dealership) await c.query("INSERT INTO locations(id,tenant_id,dealership_id,name,city,state,phone) VALUES($1,$2,$3,$4,$5,$6,'Not recorded')", [b.id, tenantId, dealership.id, b.name, b.city, b.state]);
  }
}

async function persistVehicles(c: SqlClient, p: Principal, before: WorkspaceState, after: WorkspaceState, stamp: string, upsertDoc: (c: string, id: string, payload: unknown) => Promise<unknown>) {
  const tenantId = p.tenantId;
  const prev = new Map(before.vehicles.map((v) => [v.id, v]));
  for (const v of after.vehicles) {
    const old = prev.get(v.id);
    if (old && same(old, v)) continue;
    const existing = (await c.query("SELECT id, payload, availability_status, publish_status FROM vehicles WHERE tenant_id=$1 AND stock_id=$2 FOR UPDATE", [tenantId, v.id])).rows[0] as Row | undefined;
    const location = (await c.query("SELECT id, dealership_id FROM locations WHERE tenant_id=$1 AND id=$2", [tenantId, v.branchId])).rows[0] as Row | undefined;
    if (!location) throw new Error("Unknown branch for vehicle.");
    const availability = LIFECYCLE_AVAILABILITY[v.status];
    const owned = v.channels.includes("Owned site") && v.status === "available" && v.hasImages && (v.asking ?? 0) > 0;
    const publish = v.status === "archived" || v.status === "sold" ? "archived" : owned ? "published" : "draft";
    const uuid = existing ? String(existing.id) : uuidFrom("vehicle", `${tenantId}:${v.id}`);
    const prior = (existing?.payload ?? {}) as Row;
    const payload = {
      ...prior, id: uuid, tenantId, dealershipId: String(location.dealership_id), locationId: v.branchId, stockId: v.id, slug: String(prior.slug ?? `${slugify(`${v.year} ${v.make} ${v.model} ${v.variant}`)}-${slugify(v.id)}`),
      make: v.make, model: v.model, variant: v.variant, year: v.year, price: v.asking === null ? 0 : toRupees(v.asking), mileage: v.km, fuelType: v.fuel.toLowerCase(), transmission: v.transmission.toLowerCase(), ownership: v.owners,
      bodyType: prior.bodyType ?? "Not recorded", condition: prior.condition ?? "good", exteriorColor: prior.exteriorColor ?? "Not recorded", interiorColor: prior.interiorColor ?? "Not recorded", features: prior.features ?? [],
      specifications: { ...((prior.specifications as Row | undefined) ?? {}), registration: v.registration }, media: prior.media ?? [], availabilityStatus: availability, publishStatus: publish, source: prior.source ?? "automobile-intelligence",
      financeEligible: prior.financeEligible ?? false, exchangeEligible: prior.exchangeEligible ?? false, version: v.version, createdAt: prior.createdAt ?? stamp, updatedAt: stamp,
    };
    if (existing) {
      await c.query("UPDATE vehicles SET location_id=$3, dealership_id=$4, payload=$5, publish_status=$6, availability_status=$7, updated_at=$8 WHERE tenant_id=$1 AND id=$2", [tenantId, uuid, v.branchId, location.dealership_id, payload, publish, availability, stamp]);
    } else {
      await c.query("INSERT INTO vehicles(id,tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)", [uuid, tenantId, location.dealership_id, v.branchId, payload.slug, v.id, payload, publish, availability, stamp]);
    }
    await c.query("INSERT INTO inventory_history(id,tenant_id,vehicle_id,payload,occurred_at) VALUES($1,$2,$3,$4,$5)", [uuidFrom("invhist", `${tenantId}:${v.id}:${v.version}:${stamp}`), tenantId, uuid, {
      id: uuidFrom("invhist", `${tenantId}:${v.id}:${v.version}:${stamp}`), tenantId, vehicleId: uuid, actor: p.userId, occurredAt: stamp, source: "automobile-intelligence", action: existing ? "updated" : "created",
      before: { price: Number(prior.price ?? 0), availabilityStatus: String(existing?.availability_status ?? availability), publishStatus: String(existing?.publish_status ?? "draft") }, after: { price: payload.price, availabilityStatus: availability, publishStatus: publish },
    }, stamp]);
    if (v.costComplete || v.costs.acquisition > 0) {
      const ledger = v.costs;
      const record = { tenantId, vehicleId: uuid, version: v.version, currency: "INR", acquiredOn: istDate(v.acquiredAt), purchasePrice: toRupees(ledger.acquisition), reconditioningCost: toRupees(ledger.refurbishment), transferCost: toRupees(ledger.transport), otherCost: toRupees(ledger.inspection + ledger.fees), dailyHoldingCost: null, reference: "Automobile Intelligence entry", recordedBy: p.userId, recordedAt: stamp };
      const prevCost = (await c.query("SELECT payload FROM stock_costs WHERE tenant_id=$1 AND vehicle_id=$2", [tenantId, uuid])).rows[0]?.payload as Row | undefined;
      const changed = !prevCost || ["acquiredOn", "purchasePrice", "reconditioningCost", "transferCost", "otherCost"].some((k) => prevCost[k] !== (record as Row)[k]);
      if (changed) {
        const nextVersion = Number(prevCost?.version ?? 0) + 1;
        const saved = { ...record, version: nextVersion };
        await c.query("INSERT INTO stock_costs(tenant_id,vehicle_id,version,payload) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,vehicle_id) DO UPDATE SET version=EXCLUDED.version,payload=EXCLUDED.payload", [tenantId, uuid, nextVersion, saved]);
        const changeId = uuidFrom("costhist", `${tenantId}:${v.id}:${nextVersion}`);
        await c.query("INSERT INTO stock_cost_history(id,tenant_id,vehicle_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING", [changeId, tenantId, uuid, { id: changeId, tenantId, vehicleId: uuid, before: prevCost ?? null, after: saved }]);
      }
    }
    await upsertDoc("vehicles", v.id, v);
  }
}

async function persistLeads(c: SqlClient, p: Principal, before: WorkspaceState, after: WorkspaceState, stamp: string, upsertDoc: (c: string, id: string, payload: unknown) => Promise<unknown>) {
  const tenantId = p.tenantId;
  const prev = new Map(before.leads.map((l) => [l.id, l]));
  for (const l of after.leads) {
    const old = prev.get(l.id);
    if (old && same(old, l)) continue;
    const existing = (await c.query("SELECT id, payload FROM leads WHERE tenant_id=$1 AND (payload->>'intelligenceId' = $2 OR 'L-' || substr(id::text, 1, 8) = $2) FOR UPDATE", [tenantId, l.id])).rows[0] as Row | undefined;
    const location = (await c.query("SELECT id, dealership_id FROM locations WHERE tenant_id=$1 AND id=$2", [tenantId, l.branchId])).rows[0] as Row | undefined;
    if (!location) throw new Error("Unknown branch for lead.");
    const vehicleRow = l.vehicleId ? (await c.query("SELECT id FROM vehicles WHERE tenant_id=$1 AND stock_id=$2", [tenantId, l.vehicleId])).rows[0] as Row | undefined : undefined;
    const uuid = existing ? String(existing.id) : uuidFrom("lead", `${tenantId}:${l.id}`);
    const prior = (existing?.payload ?? {}) as Row;
    const contract = {
      ...prior, id: uuid, tenantId, dealershipId: String(location.dealership_id), locationId: l.branchId, vehicleId: vehicleRow ? String(vehicleRow.id) : undefined, vehicleIds: vehicleRow ? [String(vehicleRow.id)] : [], intelligenceId: l.id,
      name: l.name, phone: l.contactFull, email: l.email, channel: prior.channel ?? "web", stage: stageToContract(l.stage), intent: prior.intent ?? "enquiry", assignedTo: l.owner === "Unassigned" ? undefined : l.owner, source: l.source, campaign: l.campaignId,
      notes: prior.notes, consent: { whatsapp: Boolean((prior.consent as Row | undefined)?.whatsapp), marketing: l.consent.marketing }, version: l.version, createdAt: prior.createdAt ?? l.createdAt, updatedAt: stamp,
    };
    if (existing) await c.query("UPDATE leads SET location_id=$3, dealership_id=$4, vehicle_id=$5, payload=$6, stage=$7, source=$8, campaign=$9, updated_at=$10 WHERE tenant_id=$1 AND id=$2", [tenantId, uuid, l.branchId, location.dealership_id, vehicleRow?.id ?? null, contract, contract.stage, l.source, l.campaignId ?? null, stamp]);
    else await c.query("INSERT INTO leads(id,tenant_id,dealership_id,location_id,vehicle_id,payload,stage,source,campaign,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [uuid, tenantId, location.dealership_id, l.branchId, vehicleRow?.id ?? null, contract, contract.stage, l.source, l.campaignId ?? null, l.createdAt, stamp]);

    for (const t of l.tasks) {
      const taskId = uuidFrom("task", `${tenantId}:${l.id}:${t.id}`);
      const task = { id: taskId, tenantId, leadId: uuid, title: t.title, owner: l.owner, dueAt: t.dueAt, completed: t.done, priority: "normal", origin: "human", version: 0, intelligenceTaskId: t.id };
      await c.query(`INSERT INTO tasks(id,tenant_id,lead_id,payload,due_at,completed) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET payload = tasks.payload || EXCLUDED.payload, due_at = EXCLUDED.due_at, completed = EXCLUDED.completed`, [taskId, tenantId, uuid, task, t.dueAt, t.done]);
    }
    await upsertDoc("leads", l.id, l);
  }
}

async function persistSales(c: SqlClient, p: Principal, before: WorkspaceState, after: WorkspaceState, stamp: string, upsertDoc: (c: string, id: string, payload: unknown) => Promise<unknown>) {
  const tenantId = p.tenantId;
  const prev = new Map(before.sales.map((s) => [s.id, s]));
  const changed = new Set<string>();
  for (const s of after.sales) {
    if (same(prev.get(s.id), s)) continue;
    changed.add(s.id);
    await upsertDoc("sales", s.id, s);
  }
  // The shared sales ledger is append-only and keyed to a lead, so a sale is mirrored there once a lead is linked to it.
  const priorLead = new Map(before.leads.map((l) => [l.id, l]));
  for (const lead of after.leads) {
    if (!lead.saleId) continue;
    if (!changed.has(lead.saleId) && priorLead.get(lead.id)?.saleId === lead.saleId) continue;
    const s = after.sales.find((x) => x.id === lead.saleId);
    if (!s || s.state !== "Completed") continue;
    const leadRow = (await c.query("SELECT id FROM leads WHERE tenant_id=$1 AND payload->>'intelligenceId' = $2", [tenantId, lead.id])).rows[0] as Row | undefined;
    const vehicleRow = (await c.query("SELECT id FROM vehicles WHERE tenant_id=$1 AND stock_id=$2", [tenantId, s.vehicleId])).rows[0] as Row | undefined;
    if (!leadRow || !vehicleRow) continue;
    const exists = (await c.query("SELECT 1 FROM sales WHERE tenant_id=$1 AND (lead_id=$2 OR vehicle_id=$3)", [tenantId, leadRow.id, vehicleRow.id])).rows.length;
    if (exists) continue;
    const id = uuidFrom("sale", `${tenantId}:${s.id}`);
    await c.query("INSERT INTO sales(id,tenant_id,lead_id,vehicle_id,payload,amount,sold_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, tenantId, leadRow.id, vehicleRow.id, { id, tenantId, leadId: leadRow.id, vehicleId: vehicleRow.id, amount: toRupees(s.salePrice), currency: "INR", soldAt: s.closedAt, confirmedBy: p.userId, confirmedAt: stamp }, toRupees(s.salePrice), s.closedAt]);
  }
}

async function persistTeam(c: SqlClient, p: Principal, before: WorkspaceState, after: WorkspaceState, stamp: string) {
  const tenantId = p.tenantId;
  const prev = new Map(before.team.filter((m) => m.status === "Active").map((m) => [m.id, m]));
  const next = new Map(after.team.filter((m) => m.status === "Active").map((m) => [m.id, m]));
  for (const [id, m] of next) {
    const old = prev.get(id);
    if (!old || (old.role === m.role && same(old.branchIds, m.branchIds))) continue;
    if (id === p.userId) throw new Error("You cannot change your own access.");
    await c.query(
      `UPDATE staff_members SET payload = payload || jsonb_build_object('role', $3::text, 'intelligenceRole', $4::text, 'locationIds', $5::jsonb, 'version', COALESCE((payload->>'version')::int, 0) + 1, 'updatedAt', $6::text, 'updatedBy', $7::text)
       WHERE tenant_id=$1 AND user_id=$2`, [tenantId, id, platformRole(m.role), m.role, JSON.stringify(m.branchIds), stamp, p.userId]);
    await c.query("INSERT INTO platform_audit(id,tenant_id,actor,action,subject,payload,occurred_at) VALUES($1,$2,$3,'staff.role_changed',$4,$5,$6)", [uuidFrom("audit", `${tenantId}:${id}:${stamp}`), tenantId, p.userId, id, { role: m.role, branchIds: m.branchIds }, stamp]);
  }
  const invitedBefore = before.team.filter((m) => m.status === "Invited").map((m) => m.id);
  const invitedAfter = new Set(after.team.filter((m) => m.status === "Invited").map((m) => m.id));
  for (const id of invitedBefore) {
    if (invitedAfter.has(id) || !id.startsWith("invite-")) continue;
    await c.query("UPDATE intelligence_tokens SET used_at = now() WHERE tenant_id = $1 AND kind = 'invite' AND used_at IS NULL AND token_hash LIKE $2", [tenantId, `${id.slice("invite-".length)}%`]);
  }
  for (const id of prev.keys()) {
    if (next.has(id)) continue;
    if (id === p.userId) throw new Error("You cannot remove your own access.");
    await c.query("UPDATE staff_members SET payload = payload || jsonb_build_object('enabled', false, 'version', COALESCE((payload->>'version')::int, 0) + 1, 'updatedAt', $3::text, 'updatedBy', $4::text) WHERE tenant_id=$1 AND user_id=$2", [tenantId, id, stamp, p.userId]);
    await c.query("INSERT INTO platform_audit(id,tenant_id,actor,action,subject,payload,occurred_at) VALUES($1,$2,$3,'staff.disable',$4,'{}',$5)", [uuidFrom("audit", `${tenantId}:${id}:rm:${stamp}`), tenantId, p.userId, id, stamp]);
    await c.query("SELECT intelligence_revoke_sessions($1)", [id]);
  }
}

function platformRole(role: TeamMember["role"]): string {
  return ({ owner: "owner", manager: "manager", sales: "sales", inventory: "acquisition", marketing: "marketing", finance: "viewer", viewer: "viewer" } as const)[role];
}

export { tenantTx };
