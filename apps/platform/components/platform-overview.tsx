import type { Meter, PlatformOverview } from "@vandlabs/data/platform-overview";

const planLabels = [["starter", "Starter"], ["growth", "Growth"], ["scale", "Scale"], ["none", "No plan"]] as const;
const level = (m: Meter) => m.used > m.limit ? "over" : m.ratio >= 0.9 ? "high" : "ok";

function UsageMeter({ meter }: { meter: Meter }) {
  const percent = Math.min(100, Math.round(meter.ratio * 100));
  return <div className="usage-meter" data-level={level(meter)}>
    <span>{meter.label}</span>
    <div role="meter" aria-label={meter.label} aria-valuemin={0} aria-valuemax={meter.limit} aria-valuenow={Math.min(meter.used, meter.limit)} aria-valuetext={`${meter.used} of ${meter.limit}`}><i style={{ width: `${percent}%` }} /></div>
    <b>{meter.used.toLocaleString("en-IN")} / {meter.limit.toLocaleString("en-IN")}</b>
  </div>;
}

export function PlatformOverviewPanels({ overview }: { overview: PlatformOverview }) {
  const total = overview.tenants.length || 1;
  const unavailable = overview.tenants.length > 0 && overview.tenants.every(t => t.state === "unknown");
  return <>
    <section className="overview-grid exec-grid" aria-label="Subscriptions and alerts">
      <article className="panel">
        <div className="panel-head"><h2>Subscriptions</h2><span className="pill demo">Billing not activated</span></div>
        {unavailable ? <p className="muted">Subscription data could not be loaded for this view.</p> : <>
          <div className="plan-bar" role="img" aria-label={planLabels.map(([key, label]) => `${label} ${overview.plans[key]}`).join(", ")}>
            {planLabels.map(([key]) => overview.plans[key] ? <i key={key} data-plan={key} style={{ width: `${(overview.plans[key] / total) * 100}%` }} /> : null)}
          </div>
          <dl className="plan-legend">{planLabels.map(([key, label]) => <div key={key}><dt><i data-plan={key} aria-hidden="true" />{label}</dt><dd>{overview.plans[key]}</dd></div>)}</dl>
          <p className="muted small">{overview.inactive ? `${overview.inactive} subscription${overview.inactive === 1 ? " is" : "s are"} suspended, cancelled or expired.` : "No suspended, cancelled or expired subscriptions."} Revenue is not shown because no billing provider is connected.</p>
        </>}
      </article>
      <article className="panel">
        <div className="panel-head"><h2>Needs attention</h2><span className="pill" data-count={overview.alerts.length}>{overview.alerts.length} open</span></div>
        {overview.alerts.length ? <ul className="alert-list">{overview.alerts.slice(0, 8).map((alert, i) => <li key={i} data-severity={alert.severity}><span className="pill">{alert.severity}</span><p>{alert.message}</p></li>)}</ul>
          : <p className="muted">No open alerts. Every recorded subscription, limit and source is within bounds.</p>}
        {overview.alerts.length > 8 ? <p className="muted small">{overview.alerts.length - 8} more not shown.</p> : null}
      </article>
    </section>
    {overview.tenants.length && !unavailable ? <section className="panel table-panel usage-panel"><h2>Plan usage by dealership group</h2>
      <div className="usage-rows">{overview.tenants.map(t => <article key={t.tenantId} className="usage-row">
        <header><div><strong>{t.organization}</strong><small>{t.reference ?? "No subscription record"}</small></div>
          <span className="pill" data-state={t.state}>{t.plan ? `${t.plan} · ${t.state}` : "no plan"}{t.daysLeft !== null && t.state === "active" ? ` · ${Math.max(t.daysLeft, 0)}d left` : ""}</span></header>
        <div className="usage-meters">{t.meters.map(m => <UsageMeter key={m.key} meter={m} />)}</div>
      </article>)}</div></section> : null}
  </>;
}
