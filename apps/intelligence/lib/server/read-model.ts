import type { Lead, Sale, Vehicle } from "../domain";
import type { SqlClient } from "./db";
import { istDate } from "./ids";
import { buildLead, buildLedgerSale, buildVehicle, landedOf, type DocEntry, type Row } from "./records";

/**
 * Keeps the tenant's read model (intelligence_vehicle_index, _lead_index, _sale_index) in step with the authoritative
 * tables. Only rows whose source changed are rebuilt, using the same builders as the full workspace read, so the index
 * can never disagree with it. Callers run this inside a tenant transaction.
 */

const BATCH = 1500;
const lastSync = new Map<string, number>();
/** Reads inside this window reuse the previous check. Writes always force a check, so a person always sees their own changes at once. */
const FRESH_MS = 3000;

/** Full-precision UTC timestamp text, the same value the workspace read sees through JSON. */
const ts = (col: string, as: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${as}`;
const iso = (v: unknown) => new Date(String(v)).toISOString();
const ms = (v: unknown) => new Date(String(v)).getTime();

type Bulk = { table: string; rows: Record<string, unknown>[]; type: string };

async function upsertAll(c: SqlClient, tenantId: string, { table, rows, type }: Bulk, keyCols: string): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({ ...r, tenant_id: tenantId }));
    // jsonb_populate_recordset maps each JSON object onto the table's own column types.
    await c.query(
      `INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${type}, $1::jsonb)
       ON CONFLICT (${keyCols}) DO UPDATE SET ${Object.keys(chunk[0]).filter((k) => !["tenant_id", ...keyCols.split(",").map((s) => s.trim())].includes(k)).map((k) => `${k} = EXCLUDED.${k}`).join(", ")}`,
      [JSON.stringify(chunk)],
    );
  }
}

export function vehicleIndexRow(v: Vehicle, sharedUpdatedAt: unknown, docUpdatedAt: unknown, costVersion: unknown): Record<string, unknown> {
  const landed = landedOf(v.costs);
  return {
    stock_id: v.id, branch_id: v.branchId, status: v.status, make: v.make, model: v.model, variant: v.variant, year: v.year, fuel: v.fuel, transmission: v.transmission, km: v.km, owners: v.owners,
    registration: v.registration, asking_paise: v.asking, landed_paise: landed, acquired_day: istDate(v.acquiredAt), sold_day: v.soldAt ? istDate(v.soldAt) : null, has_images: v.hasImages, cost_complete: v.costComplete,
    search: `${v.id} ${v.make} ${v.model} ${v.variant} ${v.registration}`.toLowerCase(), data: v,
    shared_updated_at: String(sharedUpdatedAt), doc_updated_at: docUpdatedAt ? String(docUpdatedAt) : null, cost_version: costVersion === null || costVersion === undefined ? null : Number(costVersion),
  };
}

export function leadIndexRow(l: Lead, sharedUpdatedAt: unknown, docUpdatedAt: unknown): Record<string, unknown> {
  const open = l.tasks.filter((t) => !t.done).map((t) => t.dueAt).sort();
  return {
    lead_id: l.id, branch_id: l.branchId, stage: l.stage, owner: l.owner, source: l.source, vehicle_stock_id: l.vehicleId, created_at: iso(l.createdAt), last_touch_at: iso(l.lastTouchAt),
    next_due_at: open[0] ? iso(open[0]) : null, has_sale: Boolean(l.saleId), has_appointment: l.appointment !== undefined, marketing_consent: l.consent.marketing,
    overdue_flag: l.nextActionTone === "warning" && l.nextAction === "Overdue",
    search: `${l.id} ${l.name} ${l.vehicleId ?? ""} ${l.source}`.toLowerCase(), data: l,
    shared_updated_at: String(sharedUpdatedAt), doc_updated_at: docUpdatedAt ? String(docUpdatedAt) : null,
  };
}

export function saleIndexRow(s: Sale, sourceUpdatedAt: unknown, fromLedger: boolean): Record<string, unknown> {
  return {
    sale_id: s.id, vehicle_stock_id: s.vehicleId, branch_id: s.branchId, closed_at: iso(s.closedAt), price_paise: s.salePrice, from_ledger: fromLedger, landed_paise: fromLedger ? null : s.landed,
    direct_paise: s.directCosts, state: s.state, data: s, source_updated_at: String(sourceUpdatedAt),
  };
}

/** Rebuilds whatever is stale or missing. Returns how many rows were refreshed. */
export async function syncReadModel(c: SqlClient, tenantId: string, options: { force?: boolean } = {}): Promise<number> {
  const now = Date.now();
  if (!options.force && now - (lastSync.get(tenantId) ?? 0) < FRESH_MS) return 0;
  lastSync.set(tenantId, now);
  const firstBranch = String(((await c.query("SELECT id FROM locations WHERE tenant_id = $1 ORDER BY name LIMIT 1", [tenantId])).rows[0] as Row | undefined)?.id ?? "");
  let refreshed = 0;

  /* Vehicles: any difference in the shared row, the Intelligence document or the cost ledger rebuilds the row. */
  const staleVehicles = (await c.query(
    `SELECT v.id, v.stock_id, v.location_id, v.payload, v.availability_status, v.publish_status, ${ts('v.created_at', 'created_at')}, ${ts('v.updated_at', 'updated_at')}, v.updated_at::text AS updated_txt,
            d.payload AS doc_payload, ${ts('d.updated_at', 'doc_updated_at')}, d.updated_at::text AS doc_updated_txt, sc.payload AS cost_payload, sc.version AS cost_version
     FROM vehicles v
     LEFT JOIN intelligence_documents d ON d.tenant_id = v.tenant_id AND d.collection = 'vehicles' AND d.id = v.stock_id
     LEFT JOIN stock_costs sc ON sc.tenant_id = v.tenant_id AND sc.vehicle_id = v.id
     LEFT JOIN intelligence_vehicle_index i ON i.tenant_id = v.tenant_id AND i.stock_id = v.stock_id
     WHERE v.tenant_id = $1 AND (i.stock_id IS NULL OR i.shared_updated_at <> v.updated_at OR i.doc_updated_at IS DISTINCT FROM d.updated_at OR i.cost_version IS DISTINCT FROM sc.version)`, [tenantId])).rows as Row[];
  if (staleVehicles.length) {
    const rows = staleVehicles.map((r) => {
      const doc: DocEntry | undefined = r.doc_payload ? { payload: r.doc_payload, updatedAt: ms(r.doc_updated_at) } : undefined;
      const built = buildVehicle(r, doc, r.cost_payload as Row | undefined);
      return vehicleIndexRow(built, r.updated_txt, r.doc_updated_txt, r.cost_version);
    });
    await upsertAll(c, tenantId, { table: "intelligence_vehicle_index", type: "intelligence_vehicle_index", rows }, "tenant_id, stock_id");
    refreshed += rows.length;
  }

  /* Leads. */
  const staleLeads = (await c.query(
    `SELECT l.id, l.location_id, l.vehicle_id, l.payload, l.stage, l.source, l.campaign, ${ts('l.created_at', 'created_at')}, ${ts('l.updated_at', 'updated_at')}, l.updated_at::text AS updated_txt, v.stock_id AS vehicle_stock_id,
            d.payload AS doc_payload, ${ts('d.updated_at', 'doc_updated_at')}, d.updated_at::text AS doc_updated_txt,
            coalesce(l.payload->>'intelligenceId', 'L-' || substr(l.id::text, 1, 8)) AS public_id
     FROM leads l
     LEFT JOIN vehicles v ON v.tenant_id = l.tenant_id AND v.id = l.vehicle_id
     LEFT JOIN intelligence_documents d ON d.tenant_id = l.tenant_id AND d.collection = 'leads' AND d.id = coalesce(l.payload->>'intelligenceId', 'L-' || substr(l.id::text, 1, 8))
     LEFT JOIN intelligence_lead_index i ON i.tenant_id = l.tenant_id AND i.lead_id = coalesce(l.payload->>'intelligenceId', 'L-' || substr(l.id::text, 1, 8))
     WHERE l.tenant_id = $1 AND (i.lead_id IS NULL OR i.shared_updated_at <> l.updated_at OR i.doc_updated_at IS DISTINCT FROM d.updated_at)`, [tenantId])).rows as Row[];
  if (staleLeads.length) {
    const ids = staleLeads.map((r) => r.id);
    const tasks = (await c.query(`SELECT id, lead_id, payload, ${ts("due_at", "due_at")}, completed FROM tasks WHERE tenant_id = $1 AND lead_id = ANY($2::uuid[])`, [tenantId, ids])).rows as Row[];
    const byLead = new Map<string, Row[]>();
    for (const t of tasks) byLead.set(String(t.lead_id), [...(byLead.get(String(t.lead_id)) ?? []), t]);
    const rows = staleLeads.map((r) => {
      const doc: DocEntry | undefined = r.doc_payload ? { payload: r.doc_payload, updatedAt: ms(r.doc_updated_at) } : undefined;
      const built = buildLead(r, doc, byLead.get(String(r.id)) ?? [], () => (r.vehicle_stock_id ? String(r.vehicle_stock_id) : undefined), firstBranch);
      return leadIndexRow(built, r.updated_txt, r.doc_updated_txt);
    });
    await upsertAll(c, tenantId, { table: "intelligence_lead_index", type: "intelligence_lead_index", rows }, "tenant_id, lead_id");
    refreshed += rows.length;
  }

  /* Sales: Intelligence's own sale documents, plus ledger sales for vehicles that have no such document. */
  const staleDocSales = (await c.query(
    `SELECT d.id, d.payload, d.updated_at::text AS updated_txt FROM intelligence_documents d
     LEFT JOIN intelligence_sale_index i ON i.tenant_id = d.tenant_id AND i.sale_id = d.id
     WHERE d.tenant_id = $1 AND d.collection = 'sales' AND (i.sale_id IS NULL OR i.source_updated_at <> d.updated_at)`, [tenantId])).rows as Row[];
  const staleLedger = (await c.query(
    `SELECT s.id, s.vehicle_id, s.payload, s.amount, ${ts('s.sold_at', 'sold_at')}, s.sold_at::text AS sold_txt, v.stock_id FROM sales s
     JOIN vehicles v ON v.tenant_id = s.tenant_id AND v.id = s.vehicle_id
     LEFT JOIN intelligence_sale_index i ON i.tenant_id = s.tenant_id AND i.sale_id = 'S-' || substr(s.id::text, 1, 8)
     WHERE s.tenant_id = $1 AND i.sale_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM intelligence_documents d WHERE d.tenant_id = s.tenant_id AND d.collection = 'sales' AND d.payload->>'vehicleId' = v.stock_id)`, [tenantId])).rows as Row[];
  if (staleDocSales.length || staleLedger.length) {
    const saleRows: Record<string, unknown>[] = staleDocSales.map((r) => saleIndexRow(r.payload as Sale, r.updated_txt, false));
    if (staleLedger.length) {
      const stock = (await c.query("SELECT stock_id, data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = ANY($2::text[])", [tenantId, staleLedger.map((r) => r.stock_id)])).rows as Row[];
      const byStock = new Map(stock.map((r) => [String(r.stock_id), r.data as Vehicle]));
      for (const r of staleLedger) saleRows.push(saleIndexRow(buildLedgerSale(r, String(r.stock_id), byStock.get(String(r.stock_id)), firstBranch), r.sold_txt, true));
    }
    await upsertAll(c, tenantId, { table: "intelligence_sale_index", type: "intelligence_sale_index", rows: saleRows }, "tenant_id, sale_id");
    refreshed += saleRows.length;
  }
  return refreshed;
}

/** Drops every derived row for a tenant. They are rebuilt on the next read. */
export async function resetReadModel(c: SqlClient, tenantId: string): Promise<void> {
  for (const table of ["intelligence_vehicle_index", "intelligence_lead_index", "intelligence_sale_index"]) await c.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  lastSync.delete(tenantId);
}

