"use client";

import { useState } from "react";
import { EXPENSE_CATEGORIES, type Expense, type MonthFinance } from "@/lib/finance-shared";
import { formatDate, formatRupees, monthLabel } from "@/lib/format";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Button, EmptyState, ErrorPanel, FormSummary, Kpi, PageHead, SelectField, TableSkeleton, TextField } from "../ui";
import { useUrlState, useWorkspace } from "../workspace";

const ist = () => new Date(Date.now() + 330 * 60_000);
const monthOffset = (n: number) => { const d = ist(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };

/** Revenue from car sales and the dealership's running costs, side by side, month by month. */
export function FinancePage() {
  const { state, scope, can, session } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const span = url.get("span", "6");
  const from = monthOffset(Number(span) - 1), to = monthOffset(0);
  const remote = useRemote<{ months: MonthFinance[]; expenses: Expense[] }>(`/api/finance?from=${from}&to=${to}&branches=${scope.ids.join(",")}`);
  const [adding, setAdding] = useState(false);
  const branches = state.branches.filter((b) => scope.ids.includes(b.id));
  const [form, setForm] = useState({ category: "", amount: "", spentOn: ist().toISOString().slice(0, 10), description: "", branchId: branches[0]?.id ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await fetch("/api/finance/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, branchId: form.branchId || branches[0]?.id }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setSaving(false);
    if (!r?.ok) { setErrors(b?.error?.fields ?? { form: b?.error?.message ?? "Could not save." }); return; }
    toast("Expense recorded.");
    setErrors({}); setAdding(false); setForm({ ...form, amount: "", description: "", category: "" });
    remote.reload();
  };
  const remove = async (id: string) => {
    const r = await fetch("/api/finance/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id }) }).catch(() => null);
    toast(r?.ok ? "Removed. The audit trail keeps a record." : "Could not remove it.", r?.ok ? undefined : "error");
    remote.reload();
  };

  const months = remote.data?.months ?? [];
  const total = (k: keyof MonthFinance) => months.reduce((a, m) => a + (m[k] as number), 0);
  const branchName = (id: string) => state.branches.find((b) => b.id === id)?.name ?? "";
  const canDelete = ["owner", "finance"].includes(session.role);

  return (
    <div className="page">
      <PageHead title="Revenue & expenses" lead="What car sales brought in, next to what it cost to run the dealership."
        actions={can("finance.record") ? <Button variant="primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Record expense"}</Button> : undefined} />
      {adding ? (
        <section className="card stack" aria-label="Record an expense">
          <FormSummary errors={errors} />
          <div className="form-grid">
            <SelectField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={[...EXPENSE_CATEGORIES]} placeholder="Choose" error={errors.category} />
            <TextField label="Amount (₹)" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} error={errors.amount} />
            <TextField label="Paid on" type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} error={errors.spentOn} />
            {branches.length > 1 ? <SelectField label="Branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} options={branches.map((b) => ({ value: b.id, label: b.name }))} error={errors.branchId} /> : null}
            <TextField label="Note" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description} className={branches.length > 1 ? "span-2" : undefined} placeholder="Optional, e.g. October showroom rent" />
          </div>
          <div><Button variant="primary" loading={saving} onClick={save}>Save expense</Button></div>
        </section>
      ) : null}
      <div style={{ maxWidth: 240 }}><SelectField label="Period" value={span} onChange={(e) => url.set({ span: e.target.value === "6" ? null : e.target.value })} options={[{ value: "1", label: "This month" }, { value: "3", label: "Last 3 months" }, { value: "6", label: "Last 6 months" }, { value: "12", label: "Last 12 months" }]} /></div>
      {!remote.data && remote.status !== "error" ? <TableSkeleton rows={6} columns={6} /> : null}
      {remote.status === "error" && !remote.data ? <ErrorPanel title="Finances could not load" message={remote.error} onRetry={remote.reload} /> : null}
      {remote.data ? (
        <>
          <div className="kpi-grid">
            <Kpi label="Sales revenue" value={formatRupees(total("revenue"))} note={`${total("carsSold")} cars sold`} tone="neutral" />
            <Kpi label="Gross from sales" value={formatRupees(total("grossFromSales"))} note="Revenue minus car and selling costs" tone="neutral" />
            <Kpi label="Running expenses" value={formatRupees(total("expenses"))} tone="neutral" />
            <Kpi label="After expenses" value={formatRupees(total("afterExpenses"))} tone={total("afterExpenses") < 0 ? "warn" : "accent"} />
          </div>
          <div className="table-wrap fit">
            <table className="data-table" aria-label="Revenue and expenses by month">
              <thead><tr><th>Month</th><th className="num">Revenue</th><th className="num only-desktop">Car cost</th><th className="num">Gross</th><th className="num">Expenses</th><th className="num">After expenses</th></tr></thead>
              <tbody>{[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td><span className="row-title">{monthLabel(m.month)}</span><span className="sub">{m.carsSold} sold{m.unreconciledSales ? ` · ${m.unreconciledSales} not counted (costs incomplete)` : ""}</span></td>
                  <td className="num">{formatRupees(m.revenue)}</td><td className="num only-desktop">{formatRupees(m.carCost + m.sellingCost)}</td><td className="num">{formatRupees(m.grossFromSales)}</td>
                  <td className="num">{formatRupees(m.expenses)}</td><td className={`num ${m.afterExpenses < 0 ? "tone-warn" : ""}`}><strong>{formatRupees(m.afterExpenses)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <section className="stack-sm" aria-labelledby="exp-h">
            <h2 className="h3" id="exp-h">Expenses recorded</h2>
            {remote.data.expenses.length === 0 ? <EmptyState title="No expenses recorded for this period">Record rent, salaries, utilities and other running costs to see them next to your sales.</EmptyState> : (
              <div className="table-wrap fit"><table className="data-table dense" aria-label="Expenses">
                <thead><tr><th>Date</th><th>Category</th><th className="only-desktop">Branch</th><th className="num">Amount</th><th className="only-desktop">By</th>{canDelete ? <th><span className="sr-only">Remove</span></th> : null}</tr></thead>
                <tbody>{remote.data.expenses.map((e) => (
                  <tr key={e.id}><td>{formatDate(e.spentOn)}</td><td>{e.category}{e.description ? <span className="sub">{e.description}</span> : null}</td><td className="only-desktop">{branchName(e.branchId)}</td><td className="num">{formatRupees(e.amount)}</td><td className="only-desktop">{e.createdBy}</td>
                    {canDelete ? <td><button type="button" className="link-btn" onClick={() => remove(e.id)}>Remove</button></td> : null}</tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          <p className="meta">Figures are what was recorded: completed sales with full car costs, and the expenses entered here. This is a management view, not accounts: no GST, tax or depreciation.</p>
        </>
      ) : null}
    </div>
  );
}
