import { notFound } from "next/navigation";
import { integrationAdaptersV25, reconciliationRuns, tenantConfig } from "@vandlabs/demo-data";
import {
  auditEvents,
  featureFlags,
  healthSignals,
  integrationAdapters,
  onboardingSteps,
  platformUsage,
  tenantRegistry,
} from "../../lib/data";

const valid = new Set([
  "dealerships",
  "organizations",
  "onboarding",
  "health",
  "integrations",
  "features",
  "audit",
]);

function PageHead({ label, title, body }: { label: string; title: string; body: string }) {
  return <div className="page-head"><p className="eyebrow">{label}</p><h1>{title}</h1><p className="lede">{body}</p></div>;
}

function Dealerships() {
  return <>
    <PageHead label="Tenant registry" title="Dealerships" body="Shared platform records stay scoped by organization, dealership and location without creating dealership-specific code forks." />
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Dealership</th><th>Organization</th><th>Locations</th><th>Domain</th><th>Package</th><th>Status</th></tr></thead><tbody>
      {tenantRegistry.map((tenant) => <tr key={tenant.tenantId}><td><strong>{tenant.dealership}</strong><small>{tenant.tenantId}</small></td><td>{tenant.organization}</td><td>{tenant.locations}</td><td>{tenant.domain}</td><td>{tenant.package}</td><td><span className={"pill " + tenant.status}>{tenant.status}</span></td></tr>)}
    </tbody></table></div></section>
  </>;
}

function Organizations() {
  return <>
    <PageHead label="Hierarchy" title="Organizations & scopes" body="The reference model is Organization / Dealer Group → Dealership / Brand → Location, with roll-up and scope-down behavior." />
    <div className="hierarchy">
      <section className="node root"><span>Organization</span><strong>{tenantConfig.organization.name}</strong><small>{tenantConfig.organization.id}</small></section>
      {tenantConfig.organization.dealerships.map((dealer) => <div key={dealer.id} className="branch"><section className="node"><span>Dealership / Brand</span><strong>{dealer.name}</strong><small>{dealer.id}</small></section><div className="location-grid">{dealer.locations.map((location) => <section className="node location" key={location.id}><span>Location</span><strong>{location.name}</strong><small>{location.city} · {location.id}</small></section>)}</div></div>)}
    </div>
    <p className="note">Permissions, inventory, leads, analytics and reporting can scope to organization, dealership, location, salesperson, vehicle and campaign.</p>
  </>;
}

function Onboarding() {
  return <>
    <PageHead label="Managed provisioning" title="Onboarding" body="VandLabs controls onboarding while the platform provisions repeatable tenant capabilities and launch QA." />
    <section className="panel checklist">
      {onboardingSteps.map(([name, state, detail], index) => <div className="check-row" key={name}><span className="step">{String(index + 1).padStart(2, "0")}</span><div><strong>{name}</strong><small>{detail}</small></div><span className={"pill " + state}>{state}</span></div>)}
    </section>
  </>;
}

function Health() {
  return <>
    <PageHead label="Observability foundation" title="Platform health" body="The V1 reference surface separates real demo health from infrastructure that is intentionally not connected yet." />
    <div className="card-grid">
      {healthSignals.map((item) => <article className="panel" key={item.system}><span className={"pill " + item.status}>{item.status}</span><h2>{item.system}</h2><p>{item.detail}</p></article>)}
    </div>
    <section className="panel usage"><p className="eyebrow">Usage signals</p><div><span>Storage estimate</span><strong>{platformUsage.storageGb} GB</strong></div><div><span>AI spend</span><strong>₹{platformUsage.aiCost}</strong></div><div><span>Failed jobs</span><strong>{platformUsage.failedJobs}</strong></div></section>
  </>;
}

function Integrations() {
  return <>
    <PageHead label="VandLabs Integration Hub" title="Adapters, not vendor coupling" body="Core modules speak normalized contracts. DMS, messaging, acquisition, finance and valuation providers plug in behind those boundaries." />
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Adapter</th><th>Category</th><th>Status</th><th>Mode</th></tr></thead><tbody>
      {integrationAdapters.map((adapter) => <tr key={adapter.name}><td><strong>{adapter.name}</strong></td><td>{adapter.category}</td><td><span className={"pill " + adapter.status.replaceAll(" ", "-")}>{adapter.status}</span></td><td>{adapter.mode}</td></tr>)}
    </tbody></table></div></section>
    <div className="two-col">
      <section className="panel">
        <p className="eyebrow">V2.5 normalized contracts</p>
        <h2>Field authority</h2>
        <div className="stack">
          {integrationAdaptersV25.map((adapter) => (
            <div className="row" key={adapter.id}>
              <div>
                <strong>{adapter.name}</strong>
                <small>{adapter.category} · {adapter.direction} · {Object.keys(adapter.fieldAuthority).length} mapped fields</small>
              </div>
              <span className={"pill " + adapter.status.replaceAll("_", "-")}>{adapter.status.replaceAll("_", " ")}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <p className="eyebrow">Reconciliation evidence</p>
        <h2>Recent runs</h2>
        <div className="stack">
          {reconciliationRuns.map((run) => (
            <div className="row" key={run.id}>
              <div>
                <strong>{run.status}</strong>
                <small>{run.read} read · {run.updated} updated · {run.conflicts} conflicts · {run.failed} failed</small>
              </div>
              <span className={"pill " + run.status}>{run.status}</span>
            </div>
          ))}
        </div>
        <p className="note inner">Reference evidence does not claim a live external DMS or CRM connection.</p>
      </section>
    </div>
    <p className="note">n8n can later power unusual dealership workflows and rapid experiments, but core business logic does not depend on it.</p>
  </>;
}

function Features() {
  return <>
    <PageHead label="Feature control" title="Rollout & entitlements" body="Feature flags control release exposure. Entitlements control purchased or allowed capabilities. Commercial packages are bundles, not code forks." />
    <div className="two-col">
      <section className="panel"><p className="eyebrow">Rollout flags</p><div className="stack">{featureFlags.map((flag) => <div className="row" key={flag.key}><div><strong>{flag.key}</strong><small>{flag.owner} · {flag.rollout}</small></div><span className={"pill " + flag.state}>{flag.state}</span></div>)}</div></section>
      <section className="panel"><p className="eyebrow">Tenant entitlements</p><h2>Apex Select · Growth</h2><div className="chips">{tenantConfig.entitlements.map((item) => <span key={item}>{item}</span>)}</div><p className="note inner">The package can change without changing the dealership codebase.</p></section>
    </div>
  </>;
}

function Audit() {
  return <>
    <PageHead label="Audited support" title="Privileged activity" body="VandLabs support access is controlled, temporary in production, and recorded as a platform concern." />
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Scope</th><th>Result</th></tr></thead><tbody>
      {auditEvents.map((event) => <tr key={event.at + event.action}><td>{new Date(event.at).toLocaleString("en-IN")}</td><td>{event.actor}</td><td><code>{event.action}</code></td><td>{event.scope}</td><td>{event.result}</td></tr>)}
    </tbody></table></div></section>
  </>;
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!valid.has(section)) notFound();
  return <main>
    {section === "dealerships" ? <Dealerships /> : null}
    {section === "organizations" ? <Organizations /> : null}
    {section === "onboarding" ? <Onboarding /> : null}
    {section === "health" ? <Health /> : null}
    {section === "integrations" ? <Integrations /> : null}
    {section === "features" ? <Features /> : null}
    {section === "audit" ? <Audit /> : null}
  </main>;
}
