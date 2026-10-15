import { headers } from "next/headers";
import { dealerCommerce } from "@vandlabs/data/commerce";
import { resolvePrincipal } from "../../lib/auth";
import { SourceImport } from "../../components/source-import";
export const dynamic = "force-dynamic";
export default async function Page() {
  const p = await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() })), summary = await (await dealerCommerce()).summary(p);
  return <main className="main"><div className="page-head"><p className="eyebrow">Licensed sourcing network</p><h1>Know where your data comes from.</h1><p className="muted">Source agreements control dealer use and external API redistribution independently.</p></div><section className="panel"><h2>Connected sources</h2>{summary.sources.length ? summary.sources.map(s => <article className="acquisition-option" key={s.id}><h3>{s.name}</h3><p>{s.kind} · {s.usable ? "Dealer use enabled" : "Dealer use unavailable"} · {s.apiUsable ? "External API permitted" : "External API restricted"}</p><p>Agreement: {s.agreement} · expires {s.expiresAt.slice(0, 10)}</p></article>) : <p>No licensed sources have been approved yet.</p>}</section>{summary.canManage && !summary.readOnly ? <SourceImport sources={summary.sources} /> : null}<section className="panel"><h2>Provider coverage</h2><p>CarDekho, CarWale, Cars24 and other marketplaces are not connected automatically. Each provider requires a supported licensed endpoint, credentials and explicit commercial rights. No marketplace scraping is implemented.</p><p>Available coverage: {summary.vehicleCount} sourcing vehicles; {summary.apiVehicleCount} redistributable vehicles. Fuel prices require a source and observation timestamp.</p></section></main>;
}
