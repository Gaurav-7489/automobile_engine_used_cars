import { randomUUID } from "node:crypto";
import { can } from "../permissions";
import { tenantTx, type SqlClient } from "./db";
import type { Principal } from "./identity";
import { SALES_EFFECTIVE } from "./read-queries";
import { writeAudit } from "./workspace-audit";
import { ENTRY_KINDS, EXPENSE_CATEGORIES, INVESTOR_KINDS, type Expense, type Investor, type InvestorEntry, type MonthFinance } from "../finance-shared";

export * from "../finance-shared";

/**
 * Financial management (playbook M07) and the revenue-and-expense view of business intelligence (M11): the running costs of
 * the dealership recorded next to what its car sales brought in, month by month and branch by branch. Figures are exactly what
 * was recorded. This is not accounting: no tax, GST, depreciation or ledgers, and no profit claim beyond the recorded numbers.
 *
 * Investor management (M10): investor and partner records with their contributions and repayments, as the dealership records
 * them. No return, interest or profit-share is calculated.
 */


const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const scoped = (principal: Principal, asked: string[]) => (asked.length ? asked.filter((id) => principal.locationIds.includes(id)) : principal.locationIds);

export function monthsBetween(from: string, to: string): string[] {
  if (!MONTH.test(from) || !MONTH.test(to) || from > to) return [];
  const out: string[] = [];
  const d = new Date(`${from}-01T00:00:00Z`);
  while (out.length < 36) { const m = d.toISOString().slice(0, 7); out.push(m); if (m === to) break; d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}

export async function financeSummary(c: SqlClient, tenantId: string, branchIds: string[], from: string, to: string): Promise<{ months: MonthFinance[]; expenses: Expense[] }> {
  const months = monthsBetween(from, to);
  if (!months.length) return { months: [], expenses: [] };
  const sales = (await c.query(
    `SELECT to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m, state, count(*)::int AS n, COALESCE(sum(price_paise), 0)::bigint AS revenue,
            COALESCE(sum(landed_paise), 0)::bigint AS landed, COALESCE(sum(direct_paise), 0)::bigint AS direct
     FROM (${SALES_EFFECTIVE}) s WHERE s.branch_id = ANY($2::uuid[]) AND to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') BETWEEN $3 AND $4 GROUP BY 1, 2`,
    [tenantId, branchIds, from, to])).rows as Record<string, unknown>[];
  const exp = (await c.query(
    `SELECT to_char(spent_on, 'YYYY-MM') AS m, category, sum(amount_paise)::bigint AS total FROM intelligence_expenses
     WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(spent_on, 'YYYY-MM') BETWEEN $3 AND $4 GROUP BY 1, 2`,
    [tenantId, branchIds, from, to])).rows as Record<string, unknown>[];
  const list = (await c.query(
    `SELECT * FROM intelligence_expenses WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(spent_on, 'YYYY-MM') BETWEEN $3 AND $4 ORDER BY spent_on DESC, created_at DESC LIMIT 500`,
    [tenantId, branchIds, from, to])).rows as Record<string, unknown>[];
  return {
    months: months.map((month) => {
      const done = sales.filter((r) => r.m === month && r.state === "Completed");
      const sum = (key: string) => done.reduce((a, r) => a + Number(r[key]), 0);
      const byCategory: Record<string, number> = {};
      for (const r of exp.filter((x) => x.m === month)) byCategory[String(r.category)] = Number(r.total);
      const expenses = Object.values(byCategory).reduce((a, n) => a + n, 0);
      const revenue = sum("revenue"), carCost = sum("landed"), sellingCost = sum("direct");
      const grossFromSales = revenue - carCost - sellingCost;
      return { month, carsSold: sum("n"), revenue, carCost, sellingCost, grossFromSales, expenses, byCategory, afterExpenses: grossFromSales - expenses, unreconciledSales: sales.filter((r) => r.m === month && r.state !== "Completed").reduce((a, r) => a + Number(r.n), 0) };
    }),
    expenses: list.map((r) => ({ id: String(r.expense_id), branchId: String(r.branch_id), category: String(r.category), description: String(r.description), amount: Number(r.amount_paise), spentOn: String(r.spent_on instanceof Date ? r.spent_on.toISOString().slice(0, 10) : r.spent_on).slice(0, 10), createdBy: String(r.created_by_name), createdAt: new Date(String(r.created_at)).toISOString() })),
  };
}

export async function readFinance(principal: Principal, input: { from: string; to: string; branches: string[] }) {
  return tenantTx(principal.tenantId, (c) => financeSummary(c, principal.tenantId, scoped(principal, input.branches), input.from, input.to));
}

export type ExpenseInput = { branchId: unknown; category: unknown; description: unknown; amount: unknown; spentOn: unknown };

export function validateExpense(input: ExpenseInput, principal: Principal): { fields: Record<string, string>; value?: { branchId: string; category: string; description: string; amount: number; spentOn: string } } {
  const fields: Record<string, string> = {};
  const branchId = clean(input.branchId, 40);
  const category = clean(input.category, 40);
  const description = clean(input.description, 200);
  const rupees = Number(String(input.amount ?? "").replace(/[,₹\s]/g, ""));
  const spentOn = clean(input.spentOn, 10);
  if (!principal.locationIds.includes(branchId)) fields.branchId = "Choose one of your branches.";
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) fields.category = "Choose a category.";
  if (!Number.isFinite(rupees) || rupees <= 0 || rupees > 100_000_000) fields.amount = "Enter the amount in rupees.";
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  if (!DAY.test(spentOn) || Number.isNaN(Date.parse(spentOn)) || spentOn > today || spentOn < "2015-01-01") fields.spentOn = "Choose the date it was paid (not in the future).";
  if (category === "Other" && description.length < 3) fields.description = "Say what this expense was for.";
  return Object.keys(fields).length ? { fields } : { fields, value: { branchId, category, description, amount: Math.round(rupees * 100), spentOn } };
}

export async function addExpense(principal: Principal, input: ExpenseInput): Promise<{ ok: true; id: string } | { ok: false; status: number; message: string; fields?: Record<string, string> }> {
  if (!can(principal.role, "finance.record")) return { ok: false, status: 403, message: "Your role cannot record expenses." };
  const checked = validateExpense(input, principal);
  if (!checked.value) return { ok: false, status: 422, message: "Check the highlighted fields.", fields: checked.fields };
  const v = checked.value;
  const id = `E-${randomUUID().slice(0, 8).toUpperCase()}`;
  await tenantTx(principal.tenantId, async (c) => {
    await c.query("INSERT INTO intelligence_expenses(tenant_id, expense_id, branch_id, category, description, amount_paise, spent_on, created_by, created_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [principal.tenantId, id, v.branchId, v.category, v.description, v.amount, v.spentOn, principal.userId, principal.name]);
    await writeAudit(c, principal.tenantId, principal.name, "expense.recorded", id, `${v.category} ₹${(v.amount / 100).toLocaleString("en-IN")} on ${v.spentOn}`);
  });
  return { ok: true, id };
}

/** Owners and finance staff can remove a mistaken entry; the audit trail keeps what was removed. */
export async function deleteExpense(principal: Principal, id: string): Promise<boolean> {
  if (!(principal.role === "owner" || principal.role === "finance") || !/^E-[0-9A-F]{8}$/.test(id)) return false;
  return tenantTx(principal.tenantId, async (c) => {
    const row = (await c.query("DELETE FROM intelligence_expenses WHERE tenant_id = $1 AND expense_id = $2 AND branch_id = ANY($3::uuid[]) RETURNING category, amount_paise, spent_on", [principal.tenantId, id, principal.locationIds])).rows[0] as Record<string, unknown> | undefined;
    if (row) await writeAudit(c, principal.tenantId, principal.name, "expense.removed", id, `${row.category} ₹${(Number(row.amount_paise) / 100).toLocaleString("en-IN")}`);
    return Boolean(row);
  });
}

/* Investors ------------------------------------------------------------------- */



const toInvestor = (r: Record<string, unknown>): Investor => ({
  id: String(r.investor_id), name: String(r.name), kind: String(r.kind), phone: String(r.phone), email: String(r.email), agreement: String(r.agreement), notes: String(r.notes),
  entries: (r.entries as InvestorEntry[]) ?? [], archived: Boolean(r.archived), updatedAt: new Date(String(r.updated_at)).toISOString(),
});

export async function listInvestors(principal: Principal): Promise<Investor[] | null> {
  if (!can(principal.role, "investors.view")) return null;
  return tenantTx(principal.tenantId, async (c) => ((await c.query("SELECT * FROM intelligence_investors WHERE tenant_id = $1 ORDER BY archived, name", [principal.tenantId])).rows as Record<string, unknown>[]).map(toInvestor));
}

export type InvestorInput = { id?: unknown; name?: unknown; kind?: unknown; phone?: unknown; email?: unknown; agreement?: unknown; notes?: unknown; archived?: unknown };

export async function saveInvestor(principal: Principal, input: InvestorInput): Promise<{ ok: true; id: string } | { ok: false; status: number; message: string; fields?: Record<string, string> }> {
  if (!can(principal.role, "investors.manage")) return { ok: false, status: 403, message: "Only an owner or finance can change investor records." };
  const fields: Record<string, string> = {};
  const name = clean(input.name, 120), kind = clean(input.kind, 20), phone = clean(input.phone, 20), email = clean(input.email, 120).toLowerCase();
  if (name.length < 2) fields.name = "Enter the investor's name.";
  if (!(INVESTOR_KINDS as readonly string[]).includes(kind)) fields.kind = "Choose investor, partner or lender.";
  if (phone && !/^\+?[\d\s-]{8,15}$/.test(phone)) fields.phone = "Enter a valid phone number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = "Enter a valid email.";
  if (Object.keys(fields).length) return { ok: false, status: 422, message: "Check the highlighted fields.", fields };
  const existing = typeof input.id === "string" && /^I-[0-9A-F]{8}$/.test(input.id) ? input.id : null;
  const id = existing ?? `I-${randomUUID().slice(0, 8).toUpperCase()}`;
  const done = await tenantTx(principal.tenantId, async (c) => {
    const values = [principal.tenantId, id, name, kind, phone, email, clean(input.agreement, 1000), clean(input.notes, 2000), input.archived === true];
    const r = existing
      ? await c.query("UPDATE intelligence_investors SET name = $3, kind = $4, phone = $5, email = $6, agreement = $7, notes = $8, archived = $9, updated_at = now() WHERE tenant_id = $1 AND investor_id = $2 RETURNING investor_id", values)
      : await c.query("INSERT INTO intelligence_investors(tenant_id, investor_id, name, kind, phone, email, agreement, notes, archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING investor_id", values);
    if (r.rows.length) await writeAudit(c, principal.tenantId, principal.name, existing ? "investor.updated" : "investor.added", id, name);
    return r.rows.length > 0;
  });
  return done ? { ok: true, id } : { ok: false, status: 404, message: "Investor not found." };
}

export async function addInvestorEntry(principal: Principal, investorId: string, input: { kind?: unknown; amount?: unknown; on?: unknown; note?: unknown }): Promise<{ ok: true } | { ok: false; status: number; message: string; fields?: Record<string, string> }> {
  if (!can(principal.role, "investors.manage")) return { ok: false, status: 403, message: "Only an owner or finance can change investor records." };
  const fields: Record<string, string> = {};
  const kind = clean(input.kind, 20);
  const rupees = Number(String(input.amount ?? "").replace(/[,₹\s]/g, ""));
  const on = clean(input.on, 10);
  if (!(ENTRY_KINDS as readonly string[]).includes(kind)) fields.kind = "Choose contribution, repayment or payout.";
  if (!Number.isFinite(rupees) || rupees <= 0 || rupees > 10_000_000_000) fields.amount = "Enter the amount in rupees.";
  if (!DAY.test(on) || Number.isNaN(Date.parse(on))) fields.on = "Choose the date.";
  if (Object.keys(fields).length) return { ok: false, status: 422, message: "Check the highlighted fields.", fields };
  const entry: InvestorEntry = { id: randomUUID().slice(0, 8), kind: kind as InvestorEntry["kind"], amount: Math.round(rupees * 100), on, note: clean(input.note, 300), by: principal.name };
  const done = await tenantTx(principal.tenantId, async (c) => {
    const r = await c.query("UPDATE intelligence_investors SET entries = entries || $3::jsonb, updated_at = now() WHERE tenant_id = $1 AND investor_id = $2 RETURNING name", [principal.tenantId, investorId, JSON.stringify([entry])]);
    if (r.rows.length) await writeAudit(c, principal.tenantId, principal.name, "investor.entry", investorId, `${kind} ₹${rupees.toLocaleString("en-IN")} on ${on}`);
    return r.rows.length > 0;
  });
  return done ? { ok: true } : { ok: false, status: 404, message: "Investor not found." };
}


