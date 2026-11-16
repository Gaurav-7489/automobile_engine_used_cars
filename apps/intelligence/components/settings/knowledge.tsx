"use client";

import { useEffect, useState } from "react";
import { formatShortDateTime } from "@/lib/format";
import type { KnowledgeEntry, KnowledgeStatus } from "@/lib/server/knowledge";
import { call } from "../admin/shared";
import { Dialog } from "../overlay";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, FormSummary, Notice, TextArea, TextField } from "../ui";
import { useWorkspace } from "../workspace";
import { ListSkeleton } from "./settings-skeleton";

const STATUS: Record<string, { label: string; tone: "accent" | "warn" | "danger" | "neutral" }> = {
  ok: { label: "Read", tone: "accent" }, never: { label: "Not read yet", tone: "neutral" }, failed: { label: "Could not read", tone: "danger" }, no_website: { label: "No website linked", tone: "warn" },
};

/**
 * What the AI agents may tell customers about the dealership: the linked website (read daily) plus notes the owner writes.
 * Car prices and availability never come from here; the agents read those live from stock.
 */
export function Knowledge() {
  const { can } = useWorkspace();
  const toast = useToast();
  const [data, setData] = useState<KnowledgeStatus | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<KnowledgeEntry | "new" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const allowed = can("settings.admin");
  const load = async () => { const r = await call<KnowledgeStatus>("/api/settings/knowledge"); if (r.ok) { setData(r.data); setError(""); } else setError(r.data.error?.message ?? "Knowledge could not be loaded."); };
  useEffect(() => { if (allowed) void load(); }, [allowed]);
  if (!allowed) return <section className="card stack"><h2 className="h2">Knowledge</h2><Notice role="status">Only an owner can change what the AI tells customers.</Notice></section>;

  const refresh = async () => {
    setRefreshing(true);
    const r = await call<{ result: { status: string; pages: number; passages: number; error?: string }; status: KnowledgeStatus }>("/api/settings/knowledge", { method: "POST", body: JSON.stringify({ action: "refresh" }) });
    setRefreshing(false);
    if (!r.ok) { toast(r.data.error?.message ?? "The website was not read.", "error"); return; }
    setData(r.data.status);
    const res = r.data.result;
    toast(res.status === "ok" ? `Read ${res.pages} page${res.pages === 1 ? "" : "s"}.` : res.status === "no_website" ? "No website is linked to this workspace." : res.error ?? "The website could not be read.", res.status === "ok" ? undefined : "error");
  };
  const remove = async (e: KnowledgeEntry) => {
    if (!window.confirm(`Delete “${e.title}”? The AI stops using it at once.`)) return;
    const r = await call<KnowledgeStatus>("/api/settings/knowledge", { method: "POST", body: JSON.stringify({ action: "delete", id: e.id }) });
    if (r.ok) { setData(r.data); toast("Note deleted."); } else toast(r.data.error?.message ?? "The note was not deleted.", "error");
  };
  const w = data?.website;
  const s = w ? STATUS[w.status] ?? STATUS.never : null;
  return (
    <>
      <section className="card stack" aria-labelledby="kn-site-h">
        <div className="spread" style={{ flexWrap: "wrap" }}>
          <h2 className="h2" id="kn-site-h">Your website</h2>
          {w?.origin ? <Button onClick={refresh} loading={refreshing} loadingLabel="Reading website…">Read website now</Button> : null}
        </div>
        <p className="muted">The AI assistant on your website chat, WhatsApp and Instagram answers questions about your dealership (address, timings, services, documents, how buying works) from your website’s pages and the notes below, and links to the page it used. It reads the website again every day. Car prices and availability always come from your live stock, never from web pages.</p>
        {error ? <Notice tone="danger" role="alert">{error} <button className="link-btn" onClick={() => void load()}>Retry</button></Notice> : null}
        {!data && !error ? <ListSkeleton rows={1} title="Loading" /> : null}
        {w && s ? (
          <div className="stack-sm">
            <div className="row-flex" style={{ flexWrap: "wrap" }}><Badge tone={s.tone}>{s.label}</Badge>{w.origin ? <code>{w.origin}</code> : null}</div>
            {w.origin && w.lastSuccessAt ? <span className="muted">{w.pages} page{w.pages === 1 ? "" : "s"}, {w.passages} passages · last read {formatShortDateTime(w.lastSuccessAt)}</span> : null}
            {w.status === "failed" && w.error ? <Notice tone="warn" role="status">{w.error}. The AI keeps using what it read last time.</Notice> : null}
            {!w.origin ? <Notice role="status">No website is linked to this workspace. VandLabs links it when your website is set up; until then the AI answers from the notes below.</Notice> : null}
          </div>
        ) : null}
      </section>
      <section className="card stack" aria-labelledby="kn-notes-h">
        <div className="spread" style={{ flexWrap: "wrap" }}><h2 className="h2" id="kn-notes-h">Notes for the AI</h2><Button variant="primary" onClick={() => setEditing("new")} disabled={!data}>Add note</Button></div>
        <p className="muted">Things customers ask that your website doesn’t say, in your own words: opening hours, holidays, documents to bring, how test drives work, delivery, payment methods. Keep each note to one topic.</p>
        {data && !data.entries.length ? <EmptyState title="No notes yet">Add your opening hours first: it is the question customers ask most.</EmptyState> : null}
        {data?.entries.length ? <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.entries.map((e) => (
            <li key={e.id} className="card stack-sm" style={{ padding: "12px 14px" }}>
              <div className="spread" style={{ flexWrap: "wrap", gap: 8 }}><strong>{e.title}</strong><span className="row-flex"><Button size="sm" onClick={() => setEditing(e)}>Edit</Button><Button size="sm" variant="danger" onClick={() => remove(e)}>Delete</Button></span></div>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{e.content}</p>
              <span className="muted" style={{ fontSize: 13 }}>Updated {formatShortDateTime(e.updatedAt)}{e.createdBy ? ` by ${e.createdBy}` : ""}</span>
            </li>
          ))}
        </ul> : null}
      </section>
      {editing ? <NoteDialog entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(next) => { setEditing(null); setData(next); toast("Saved. The AI uses it from now on."); }} /> : null}
    </>
  );
}

function NoteDialog({ entry, onClose, onSaved }: { entry: KnowledgeEntry | null; onClose: () => void; onSaved: (data: KnowledgeStatus) => void }) {
  const [title, setTitle] = useState(entry?.title ?? ""), [content, setContent] = useState(entry?.content ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErrors({});
    const r = await call<KnowledgeStatus>("/api/settings/knowledge", { method: "POST", body: JSON.stringify({ action: "save", id: entry?.id, title, content }) });
    setBusy(false);
    if (r.ok) { onSaved(r.data); return; }
    setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "The note was not saved." });
  };
  return (
    <Dialog open onClose={onClose} dirty title={entry ? "Edit note" : "Add note"} description="The AI tells customers exactly this. Don’t include prices of specific cars; those come from your stock." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Saving…" onClick={save}>Save</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={errors.title} help="For example “Opening hours” or “Documents to bring”." />
        <TextArea label="What customers should be told" value={content} maxLength={2000} rows={6} onChange={(e) => setContent(e.target.value)} error={errors.content} help={`${content.length}/2000`} />
      </div>
    </Dialog>
  );
}
