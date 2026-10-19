import Link from "next/link";
import { cockpitPolicy, type ActionCategory } from "@vandlabs/data/cockpit";
import { dataMode } from "@vandlabs/data";
import { cockpitData } from "../../lib/cockpit";
import { ActionList, KpiBand, type Kpi } from "../../components/cockpit/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Action Center | Command Center" };

const categories: { key: ActionCategory | "all"; label: string }[] = [
  { key: "all", label: "All" }, { key: "follow_up", label: "Follow-ups" }, { key: "task", label: "Tasks" }, { key: "appointment", label: "Visits" },
  { key: "stock", label: "Stock" }, { key: "costs", label: "Costs" }, { key: "plan", label: "Plan" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { cockpit, access, canResolve } = await cockpitData();
  const requested = (await searchParams).category;
  const active = categories.find(c => c.key === requested)?.key ?? "all";
  const visible = active === "all" ? cockpit.actions : cockpit.actions.filter(a => a.category === active);
  const count = (key: ActionCategory | "all") => key === "all" ? cockpit.actions.length : cockpit.actions.filter(a => a.category === key).length;
  const bySeverity = (s: string) => cockpit.actions.filter(a => a.severity === s).length;
  const kpis: Kpi[] = [
    { label: "Critical", value: String(bySeverity("critical")), detail: `Waiting ${cockpitPolicy.criticalHours}+ hours` },
    { label: "High", value: String(bySeverity("high")), detail: `First response over ${cockpitPolicy.firstResponseHours} hours, overdue tasks, unrecorded visits, priority stock` },
    { label: "Medium", value: String(bySeverity("medium")), detail: "Aged stock to review, missing cost records" },
    { label: "Info", value: String(bySeverity("info")), detail: "Plan usage nearing its limit" },
  ];
  return <main className="main">
    <header className="ck-head">
      <div><p className="eyebrow">Action Center</p><h1>What needs you now.</h1>
        <p className="muted">Ordered by severity, then by how long each item has waited. {access.leads ? "" : "Your role does not include customer records, so only stock, cost and plan actions are shown."}</p></div>
      <span className="ck-source" data-mode={dataMode() === "demo" ? "demo" : "live"}>{dataMode() === "demo" ? "Demonstration data — fictional records" : "Connected operations"}</span>
    </header>
    <KpiBand kpis={kpis} label="Actions by severity" />
    <section className="panel" style={{ marginTop: 12 }} aria-labelledby="ck-all-title">
      <div className="panel-head"><div><h2 id="ck-all-title">{active === "all" ? "All open actions" : categories.find(c => c.key === active)!.label}</h2><p>{visible.length} {visible.length === 1 ? "item" : "items"} · as of {new Date(cockpit.asOf).toISOString().slice(0, 16).replace("T", " ")} UTC</p></div></div>
      <nav className="ck-filters" aria-label="Filter actions by type">
        {categories.map(c => <Link key={c.key} href={c.key === "all" ? "/actions" : `/actions?category=${c.key}`} aria-current={active === c.key ? "page" : undefined}>{c.label} <span>{count(c.key)}</span></Link>)}
      </nav>
      <ActionList actions={visible} canResolve={canResolve} emptyText={active === "all" ? undefined : "Nothing of this type needs action."} />
      <p className="ck-note">Actions are computed from your records every time this page loads. Completing a task resolves it here immediately; other items clear when the underlying record is updated (a lead contacted, a visit outcome recorded, a vehicle published or repriced, a cost entered). Nothing is dismissed or hidden without a change in the data.</p>
    </section>
  </main>;
}
