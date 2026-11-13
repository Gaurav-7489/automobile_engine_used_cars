"use client";

import { useState } from "react";
import { ENTRY_KINDS, INVESTOR_KINDS, recordedTotals, type Investor } from "@/lib/finance-shared";
import { formatDate, formatRupees } from "@/lib/format";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, ErrorPanel, FormSummary, PageHead, PanelSkeleton, SelectField, TextArea, TextField } from "../ui";
import { useWorkspace } from "../workspace";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const blank = { id: "", name: "", kind: "Investor", phone: "", email: "", agreement: "", notes: "" };

/** Investor and partner records kept with the business they invested in. Records only: VandLabs does not calculate returns. */
export function InvestorsPage() {
  const { can } = useWorkspace();
  const toast = useToast();
  const remote = useRemote<{ investors: Investor[] }>("/api/investors");
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const [entry, setEntry] = useState({ kind: "Contribution", amount: "", on: today(), note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const manage = can("investors.manage");

  const post = async (url: string, body: object, done: string) => {
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) { setErrors(b?.error?.fields ?? { form: b?.error?.message ?? "Could not save." }); return false; }
    setErrors({}); toast(done); remote.reload(); return true;
  };

  if (!remote.data && remote.status !== "error") return <div className="page"><PageHead title="Investors" /><PanelSkeleton rows={4} /></div>;
  if (!remote.data) return <div className="page"><PageHead title="Investors" /><ErrorPanel title="Investor records could not load" message={remote.error} onRetry={remote.reload} /></div>;
  const list = remote.data.investors;

  return (
    <div className="page">
      <PageHead title="Investors" lead="Investors, partners and lenders, and what they have put in or taken out."
        actions={manage && !edit ? <Button variant="primary" onClick={() => { setEdit({ ...blank }); setErrors({}); }}>Add investor</Button> : undefined} />
      {edit ? (
        <section className="card stack" aria-label={edit.id ? "Edit investor" : "Add investor"}>
          <FormSummary errors={errors} />
          <div className="form-grid">
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={errors.name} />
            <SelectField label="Type" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} options={[...INVESTOR_KINDS]} error={errors.kind} />
            <TextField label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} error={errors.phone} />
            <TextField label="Email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} error={errors.email} />
            <TextArea label="Arrangement" className="span-2" value={edit.agreement} onChange={(e) => setEdit({ ...edit, agreement: e.target.value })} help="In your own words, e.g. 20% partner in the Kochi branch from April 2025. Kept as written; nothing is calculated from it." />
            <TextArea label="Notes" className="span-2" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </div>
          <div className="row-flex"><Button variant="primary" loading={busy} onClick={async () => { if (await post("/api/investors", edit, edit.id ? "Saved." : "Investor added.")) setEdit(null); }}>Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
        </section>
      ) : null}
      {list.length === 0 && !edit ? <EmptyState title="No investors recorded">If partners or investors fund the business, keep their records and contributions here, next to the operation they invested in.</EmptyState> : null}
      <div className="plan-grid">
        {list.map((inv) => {
          const totals = recordedTotals(inv);
          return (
            <article key={inv.id} className="card plan-card" aria-labelledby={`inv-${inv.id}`}>
              <div className="spread"><Badge tone={inv.archived ? "neutral" : "accent"}>{inv.archived ? "Archived" : inv.kind}</Badge>{manage ? <button type="button" className="link-btn" onClick={() => { setEdit({ id: inv.id, name: inv.name, kind: inv.kind, phone: inv.phone, email: inv.email, agreement: inv.agreement, notes: inv.notes }); setErrors({}); }}>Edit</button> : null}</div>
              <h2 className="h3" id={`inv-${inv.id}`}>{inv.name}</h2>
              <span className="meta">{[inv.phone, inv.email].filter(Boolean).join(" · ") || "No contact recorded"}</span>
              {inv.agreement ? <p className="plan-copy">{inv.agreement}</p> : null}
              <dl className="plan-facts">
                {ENTRY_KINDS.map((k) => <div key={k}><dt>{k}s recorded</dt><dd>{formatRupees(totals[k])}</dd></div>)}
              </dl>
              {inv.entries.length ? <ul className="plan-list">{[...inv.entries].reverse().slice(0, 5).map((e) => <li key={e.id}>{formatDate(e.on)} · {e.kind} {formatRupees(e.amount)}{e.note ? ` · ${e.note}` : ""}</li>)}</ul> : null}
              {entryFor === inv.id ? (
                <div className="stack-sm">
                  <FormSummary errors={errors} />
                  <div className="form-grid">
                    <SelectField label="Entry" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })} options={[...ENTRY_KINDS]} error={errors.kind} />
                    <TextField label="Amount (₹)" inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} error={errors.amount} />
                    <TextField label="Date" type="date" value={entry.on} onChange={(e) => setEntry({ ...entry, on: e.target.value })} error={errors.on} />
                    <TextField label="Note" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
                  </div>
                  <div className="row-flex"><Button size="sm" variant="primary" loading={busy} onClick={async () => { if (await post(`/api/investors/${inv.id}`, entry, "Entry recorded.")) { setEntryFor(null); setEntry({ kind: "Contribution", amount: "", on: today(), note: "" }); } }}>Save entry</Button><Button size="sm" onClick={() => setEntryFor(null)}>Cancel</Button></div>
                </div>
              ) : manage ? <div><Button size="sm" onClick={() => { setEntryFor(inv.id); setErrors({}); }}>Record money in or out</Button></div> : null}
            </article>
          );
        })}
      </div>
      <p className="meta">Totals add up the entries recorded here. VandLabs does not calculate returns, interest or profit shares. Visible to owners and finance only.</p>
    </div>
  );
}
