import Link from "next/link";
import { headers } from "next/headers";
import { dataMode } from "@vandlabs/data";
import { buildPipeline, pipelinePolicy, type Attention } from "@vandlabs/data/pipeline";
import { commandData } from "../../lib/data";
import { resolvePrincipal } from "../../lib/auth";
import { money, shortDateTime } from "../../lib/format";
import { KpiBand, type Kpi } from "../../components/cockpit/ui";
import { StageMove } from "../../components/stage-move";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales pipeline | Command Center" };

const flagText: Record<Attention, string> = { first_response_overdue: "First reply overdue", task_overdue: "Follow-up overdue", no_next_step: "No next step", stale: `Stuck ${pipelinePolicy.staleDays}+ days` };

export default async function Page({ searchParams }: { searchParams: Promise<{ owner?: string; focus?: string }> }) {
  const request = new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() });
  const [data, principal, query] = await Promise.all([commandData(), resolvePrincipal(request), searchParams]);
  const now = new Date(), demo = dataMode() === "demo", canWrite = principal.capabilities.includes("lead:write");
  const all = buildPipeline({ leads: data.leads, tasks: data.tasks, appointments: data.appointments, activities: data.activities, vehicles: data.vehicles }, now);
  const owner = query.owner && (query.owner === "unassigned" || all.owners.includes(query.owner)) ? query.owner : undefined, attention = query.focus === "attention";
  const view = owner || attention ? buildPipeline({ leads: data.leads, tasks: data.tasks, appointments: data.appointments, activities: data.activities, vehicles: data.vehicles }, now, { owner, attention }) : all;
  const t = all.totals;
  const kpis: Kpi[] = [
    { label: "Open leads", value: String(t.open), detail: `${all.closed.map(c => `${c.total} ${c.label.toLowerCase()}`).join(" · ")}` },
    { label: "Need attention", value: String(t.needingAttention), detail: t.needingAttention ? "Overdue, no next step or stuck in a stage" : "Every open lead has a next step", href: t.needingAttention ? `/pipeline?focus=attention${owner ? `&owner=${owner}` : ""}` : undefined, linkLabel: "Show only these" },
    { label: "First reply overdue", value: String(t.uncontacted), detail: "New leads waiting past the first-response window" },
    { label: "No next step", value: String(t.noNextStep), detail: `${t.overdueTasks} with an overdue follow-up · ${t.stale} stuck ${pipelinePolicy.staleDays}+ days` },
  ];
  const href = (next: { owner?: string; focus?: string }) => { const q = new URLSearchParams(Object.entries({ owner: next.owner ?? owner, focus: next.focus === "" ? undefined : next.focus ?? (attention ? "attention" : undefined) }).filter((e): e is [string, string] => Boolean(e[1]))).toString(); return `/pipeline${q ? `?${q}` : ""}`; };

  return <main className="main">
    <header className="ck-head"><div><p className="eyebrow">Sales pipeline</p><h1>Every lead, one next step.</h1>
      <p className="muted">Open leads by stage with how long they have waited and what happens next. Flags are rules over recorded times, not predictions.</p></div>
      <span className="ck-source" data-mode={demo ? "demo" : "live"}>{demo ? "Demonstration data — fictional records" : "Connected operations"}</span></header>
    <KpiBand kpis={kpis} label="Pipeline headline figures" />

    <section className="panel" style={{ marginTop: 12 }} aria-labelledby="pl-filter-title">
      <h2 id="pl-filter-title" className="sr-only">Filter the board</h2>
      <nav className="ck-filters" aria-label="Filter by owner"><Link href={href({ owner: "" })} aria-current={!owner ? "page" : undefined}>Everyone</Link>
        {all.owners.map(o => <Link key={o} href={href({ owner: o })} aria-current={owner === o ? "page" : undefined}>{o}</Link>)}
        <Link href={href({ owner: "unassigned" })} aria-current={owner === "unassigned" ? "page" : undefined}>Unassigned</Link></nav>
      <nav className="ck-filters" aria-label="Filter by attention"><Link href={href({ focus: "" })} aria-current={!attention ? "page" : undefined}>All leads</Link><Link href={href({ focus: "attention" })} aria-current={attention ? "page" : undefined}>Needs attention</Link></nav>
    </section>

    <div className="pl-board" role="group" aria-label="Pipeline stages" tabIndex={0}>
      {view.columns.map(column => <section className="pl-col" key={column.stage} aria-labelledby={`pl-${column.stage}`}>
        <header><h2 id={`pl-${column.stage}`}>{column.label}</h2><span aria-label={`${column.total} leads`}>{column.total}</span></header>
        <p className="pl-sum">{column.askingValue ? `${money(column.askingValue)} asking` : "—"}</p>
        {column.cards.length ? <ul>{column.cards.map(card => <li key={card.leadId} className="pl-card" data-flag={card.attention[0]}>
          <Link href={`/leads/${card.leadId}`}><strong>{card.name}</strong></Link>
          <span>{card.vehicle ?? "General enquiry"}{card.askingPrice ? ` · ${money(card.askingPrice)}` : ""}</span>
          <span>{card.waitingHours !== null ? `Waiting ${card.waitingHours} h` : `${card.daysInStage} ${card.daysInStage === 1 ? "day" : "days"} in stage`} · {card.owner ?? "Unassigned"}</span>
          <span className="pl-next" data-overdue={card.next?.overdue || undefined}>{card.next ? `${card.next.kind === "visit" ? "Visit" : "Next"}: ${card.next.title} · ${shortDateTime(card.next.at)}${card.next.overdue ? " (overdue)" : ""}` : "No next step planned"}</span>
          {card.attention.length ? <ul className="pl-flags" aria-label={`Flags for ${card.name}`}>{card.attention.map(f => <li key={f}>{flagText[f]}</li>)}</ul> : null}
          {canWrite ? <StageMove leadId={card.leadId} name={card.name} stage={card.stage} version={card.version} /> : null}
        </li>)}</ul> : <p className="ck-empty">{attention || owner ? "No lead matches." : "No leads in this stage."}</p>}
        {column.total > column.shown ? <p className="ck-note">{column.total - column.shown} more not shown. Filter by owner to see them.</p> : null}
      </section>)}
    </div>
    <p className="ck-note">Won needs a verified sale: open the lead and record it there. Lost and nurture close a lead from the stage menu.</p>
    <section className="panel" aria-labelledby="pl-closed-title" style={{ marginTop: 12 }}>
      <h2 id="pl-closed-title">Closed</h2>
      <dl className="ck-stats">{all.closed.map(c => <div key={c.stage}><dt>{c.label}</dt><dd>{c.total}</dd></div>)}</dl>
    </section>
  </main>;
}
