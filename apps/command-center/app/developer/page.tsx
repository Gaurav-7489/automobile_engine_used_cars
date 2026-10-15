import { headers } from "next/headers";
import { dealerCommerce } from "@vandlabs/data/commerce";
import { resolvePrincipal } from "../../lib/auth";
import { BusinessApiManager } from "../../components/business-api-manager";
export const dynamic = "force-dynamic";
export default async function Page() {
  const p = await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() })), summary = await (await dealerCommerce()).summary(p);
  return <main className="main"><div className="page-head"><p className="eyebrow">VandLabs business API</p><h1>Your intelligence. Connected.</h1><p className="muted">Give authorized business integrations access to your licensed vehicle, fuel and acquisition data.</p></div><BusinessApiManager keys={summary.keys} sources={summary.sources.filter(s => s.usable).map(s => ({ id: s.id, name: s.name }))} canManage={summary.canManage} readOnly={summary.readOnly} /><section className="panel"><h2>API quick start</h2><p>Use your Command Center origin with these routes and the Authorization header. Calls are server-to-server; never place keys in browser bundles.</p><pre className="api-example">{`GET /command/api/v1/vehicles?city=Kochi&limit=25&offset=0
GET /command/api/v1/fuel-prices?city=Kochi
GET /command/api/v1/vehicles?latitude=9.9312&longitude=76.2673&radiusKm=100&maxPrice=1000000
POST /command/api/v1/recommendations
POST /command/api/v1/ingest (source-bound supplier key)
Authorization: Bearer <your-api-key>`}</pre><p>{summary.apiVehicleCount} available vehicles currently have valid redistribution rights. Private CRM records and seller contacts are not part of this API.</p><p>Responses: 401 invalid key, 402 inactive subscription, 403 scope/plan denied, 429 rate/quota reached. Supplier ingestion accepts the canonical feed schema, upserts by sourceRecordId and requires an active source agreement. Full request schema is in docs/business-api.yaml.</p></section></main>;
}
