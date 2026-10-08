import Link from "next/link";
import {
  runtimeHealth,
  integrationAdapters,
  referenceUsage,
  tenantRegistry,
} from "../lib/data";

export const dynamic="force-dynamic";
export default function Page() {
  if(process.env.DATA_MODE==="aurora")return <main><h1>Platform services awaiting configuration</h1><p>A live tenant registry, provisioning and telemetry service are not connected. Reference records are hidden in production data mode.</p></main>;
  const healthSignals=runtimeHealth(),platformUsage=referenceUsage();
  const tenant = tenantRegistry[0];
  return (
    <main>
      <div className="hero">
        <div>
          <p className="eyebrow">VandLabs-only operating plane</p>
          <h1>The network, clearly.</h1>
          <p className="lede">
            Tenant onboarding, entitlements, release controls, integration health
            and support access remain separate from dealership operations.
          </p>
        </div>
        <div className="status-card">
          <span className="status-dot" />
          <strong>{tenant.status}</strong>
          <small>{tenant.organization} · {tenant.region}</small>
        </div>
      </div>

      <section className="metrics">
        <article><span>Reference tenants</span><strong>{platformUsage.tenants}</strong></article>
        <article><span>Dealerships</span><strong>{platformUsage.dealerships}</strong></article>
        <article><span>Locations</span><strong>{platformUsage.locations}</strong></article>
        <article><span>Published vehicles</span><strong>{platformUsage.publishedVehicles}</strong></article>
        <article><span>Failed jobs</span><strong>Unknown</strong></article>
        <article><span>AI cost</span><strong>Unknown</strong></article>
      </section>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">Tenant registry</p><h2>Reference dealership</h2></div><Link href="/dealerships">Open →</Link></div>
          <dl className="key-values">
            <div><dt>Organization</dt><dd>{tenant.organization}</dd></div>
            <div><dt>Dealership</dt><dd>{tenant.dealership}</dd></div>
            <div><dt>Custom domain</dt><dd>{tenant.domain}</dd></div>
            <div><dt>Commercial package</dt><dd>{tenant.package}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">System health</p><h2>Current boundaries</h2></div><Link href="/health">Details →</Link></div>
          <div className="stack">
            {healthSignals.slice(0, 4).map((item) => (
              <div className="row" key={item.system}>
                <div><strong>{item.system}</strong><small>{item.detail}</small></div>
                <span className={"pill " + item.status}>{item.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide">
          <div className="panel-head"><div><p className="eyebrow">Integration Hub</p><h2>Normalized adapters</h2></div><Link href="/integrations">Registry →</Link></div>
          <div className="adapter-grid">
            {integrationAdapters.map((adapter) => (
              <article key={adapter.name}>
                <span>{adapter.category}</span>
                <strong>{adapter.name}</strong>
                <small>{adapter.mode}</small>
                <em className={"pill " + adapter.status.replaceAll(" ", "-")}>{adapter.status}</em>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
