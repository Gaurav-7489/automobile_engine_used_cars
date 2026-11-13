"use client";

import Link from "next/link";
import { toggleTask } from "@/lib/actions";
import type { Lead } from "@/lib/domain";
import { formatTime } from "@/lib/format";
import { Icon } from "../icons";
import { useToast } from "../toast";
import { useRemote } from "../use-remote";
import { useScopedHref, useWorkspace } from "../workspace";

const nextTask = (lead: Lead) => [...lead.tasks].filter((t) => !t.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

function dueLabel(iso: string): { text: string; late: boolean } {
  const due = new Date(iso).getTime();
  const now = Date.now();
  if (due < now) {
    const days = Math.floor((now - due) / 86_400_000);
    return { text: days >= 1 ? `${days}d overdue` : "Overdue", late: true };
  }
  return { text: `Today ${formatTime(iso)}`, late: false };
}

/** Today's follow-ups on the Overview: who to call, about which car, and one tap to mark it done. */
export function FollowUps() {
  const { scope, can, run, mergeRecords } = useWorkspace();
  const href = useScopedHref();
  const toast = useToast();
  const remote = useRemote<{ leads: Lead[]; mine: boolean }>(can("leads.view") ? `/api/follow-ups?branches=${scope.ids.join(",")}` : null, (d) => mergeRecords({ leads: d.leads }));
  if (!can("leads.view")) return null;
  const leads = remote.data?.leads ?? [];

  const done = (lead: Lead, taskId: string) => {
    const r = run((s, a) => toggleTask(s, a, lead.id, taskId));
    if (!r.ok) { toast(r.message, "error"); return; }
    toast(`Done: ${lead.name}.`);
    remote.reload();
  };

  return (
    <section className="card ov-card" aria-labelledby="fu-title">
      <div className="section-title">
        <h2 className="h3" id="fu-title">Follow-ups today{leads.length ? <span className="ov-count">{leads.length}</span> : null}</h2>
        <Link className="accent-text" href={href("/app/leads", { overdue: "1" })}>All</Link>
      </div>
      {!remote.data ? <p className="muted ov-empty">{remote.status === "error" ? "Could not load follow-ups." : "Loading…"}</p> : leads.length === 0 ? (
        <p className="muted ov-empty">No follow-ups due today{remote.data.mine ? " for you" : ""}.</p>
      ) : (
        <ul className="fu-list" aria-label="Follow-ups due">
          {leads.map((lead) => {
            const task = nextTask(lead);
            if (!task) return null;
            const due = dueLabel(task.dueAt);
            const phone = /\d{6,}/.test(lead.contactFull.replace(/\s/g, "")) ? lead.contactFull.replace(/[^\d+]/g, "") : null;
            return (
              <li key={lead.id} className="fu-item">
                <div className="fu-body">
                  <Link className="row-title" href={href(`/app/leads/${lead.id}`)}>{lead.name}</Link>
                  <span className="meta">{task.title}{lead.vehicleId ? ` · ${lead.vehicleId}` : ""}</span>
                </div>
                <span className={`fu-due ${due.late ? "late" : ""}`}>{due.text}</span>
                <div className="fu-actions">
                  {phone && can("leads.contact") ? <a className="icon-btn" href={`tel:${phone}`} aria-label={`Call ${lead.name}`}><Icon name="phone" size={18} /></a> : null}
                  {can("leads.edit") ? <button type="button" className="icon-btn" onClick={() => done(lead, task.id)} aria-label={`Mark "${task.title}" done for ${lead.name}`}><Icon name="check" size={18} /></button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
