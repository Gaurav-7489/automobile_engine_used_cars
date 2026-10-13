# Dealer acquisition and business API operations

The paying user is a dealership professional acquiring stock for resale. The tenant retail showroom is a sales channel; `/dealer` is the public product entry, `/command/acquisition` is the subscriber planner, `/command/developer` manages business API keys, `/command/data-sources` imports authorized data, and `/platform/commerce` controls commercial access and source rights.

## Working path

1. Run `pnpm demo` locally. Explicit `AUTH_MODE=demo` and `DATA_MODE=demo` create a seven-day Growth demonstration subscription and fictional sourcing/fuel records. The local store is atomic and shared across all three apps.
2. Open `/command/subscriptions`, choose a demo tier and then `/command/acquisition`. Enter capital, reserve, city/coordinates, radius, strategy and cost assumptions. Submission calls the backend; browser-supplied tier fields do not control access.
3. In `/command/developer`, create a named, expiring key with required read scopes. Save the one-time secret. Call the routes in `business-api.yaml`; revoking the key prevents subsequent access immediately.
4. In `/platform/commerce`, an authorized administrator provisions a contracted subscription and approves dealer-use/redistribution rights for a source. Each operation is audited.
5. In `/command/data-sources`, import normalized JSON against that source or synchronize a server-configured licensed feed. Validation applies to the whole batch before it commits; re-importing a source record updates it rather than duplicating it. Mark sold/withdrawn records `available:false`; incremental omission does not mean a record is sold.

Hosted file-backed previews are explicitly read-only. Production never seeds fictional sourcing data or self-selectable subscriptions. A production staff identity, tenant configuration, database connection and source agreement are prerequisites for live operations.

## Plans and access

Starter: local city, one car, 100 monthly requests, 15 requests/minute, one active key. Growth: cross-city, one/two cars, 2,000 monthly requests, 60/minute, five keys. Scale: cross-city, one/two cars, 20,000 monthly requests, 120/minute, twenty keys. These are initial product limits, not negotiated prices. All keys and dealer planner calls share the tenant allowance. Quotas reset by UTC calendar month; minute windows use UTC as well. Expired, suspended or cancelled subscriptions fail closed.

Only the server-provisioned `commerce:manage` capability can manage keys and ingestion. Owner roles receive this capability; viewer/sales roles do not. Subscription and source approvals require `platform:admin` and an explicit `platformTenantIds` scope. The provision route accepts a contract/invoice reference; it does not charge money. Automated checkout, taxes, renewal collection and payment reconciliation need the chosen billing provider to be installed before they are implemented.

## Data and provider rights

No CarDekho, CarWale, Cars24, OLX or other marketplace feed is connected merely because its name is listed. Website access is not an API or redistribution license. CarDekho's public terms restrict automated extraction, commercial reuse and resale of website content: https://www.cardekho.com/info/terms_and_condition. Obtain written partner terms and a supported endpoint; confirm allowed fields, geography, freshness, caching, attribution, deletion, derived intelligence and downstream API sale rights.

A source record contains independent `dealerUse` and `redistribute` flags, enabled state, agreement reference and expiry. Every retrieval rechecks these flags, including fuel observations and recommendation inputs. Removing redistribution permission removes records from the external API immediately. The API never reads CRM leads, customer conversations, staff records or seller-contact fields. Internal evidence notes are omitted from vehicle responses and replaced with generic source attribution in external recommendations.

`VANDLABS_FEEDS_JSON` is server-only configuration: an array of `{tenantId,sourceId,url,tokenEnv}`. Each URL is a contracted HTTPS JSON endpoint, not a user-supplied URL or HTML scraper. Its token is read from the named server secret. Redirects are rejected, timeout is 10 seconds, response limit is 1 MB. The endpoint must emit the canonical format in `docs/examples/sourcing-feed.json`; provider-specific schema adapters must be written against the contracted provider specification. Do not assume undocumented marketplace URLs support this format. Imports allow 500 vehicle records and 100 fuel observations per batch.

## Calculations and evidence

Landed estimate = supplier purchase + preparation + transfer fees + straight-line distance × entered transport rate + entered daily holding × holding days. Reserve stays outside the acquisition allowance. Radius uses haversine distance, not road distance. The city field controls Starter's local matching. Confirm city/coordinates, road quotations, cross-state taxes and vehicle identity/condition before buying.

Rank by the lower supplied resale contribution estimate or average supplied demand score. Missing resale/demand evidence stays null and ranks after known values. Source scores are not VandLabs-trained demand predictions. Petrol/diesel ownership fuel estimates use source mileage, timestamped local price and the entered annual kilometres. Hybrid/electric running costs remain unknown without dedicated consumption inputs. No guaranteed net profit, predicted sale date or invented inspection result is shown.

Distinct source record IDs may still describe the same physical car across suppliers. Until VIN/verified identity reconciliation is integrated, inspect supplier identities and never treat record-level deduplication as a physical-vehicle guarantee.

## PostgreSQL and security

Apply `0007_dealer_commerce.sql` through `pnpm db:migrate` using the direct admin connection. Application traffic uses the existing `pg` driver and a restricted `vandlabs_app` role. `DATA_MODE=aurora` means shared PostgreSQL here and also works against Neon; it is retained for compatibility rather than selecting an AWS-only database.

The `dealer_commerce` row uses forced tenant RLS. Transaction-local tenant context and a row lock serialize each tenant's key/plan/source/quota mutations. Secrets are 32-byte random values, stored only as SHA-256 hashes; the token carries a tenant identifier so authentication does not require a cross-tenant key lookup. Expiry, revocation and scope are checked on each request. Bodies, batches, candidates, key count and audit histories are bounded. Reads are private/no-store. Monthly and minute usage is checked inside the same locked transaction as retrieval.

This first implementation caps 2,000 sourcing records and 50 sources per tenant, scans at most 200 eligible candidates for two-car portfolios, and retains the latest 500 audit events. The document-row lock is a deliberate bounded first release, not a benchmarked high-throughput data warehouse. Before large data subscriptions, normalize high-volume records, add cursor paging and indexed geo filtering, export immutable audits, and load-test the contracted concurrency. Add platform edge/WAF admission for unauthenticated traffic; authenticated DB quotas do not replace DDoS controls.

## Cloudflare AI commentary

`infra/cloudflare/dealer-ai` provides a protected Workers AI service using an AI binding and secret `SERVICE_TOKEN`. `DEALER_AI_URL` and `DEALER_AI_SERVICE_TOKEN` are private app-server variables. The app sends only the top structured options and assumptions, never customer records or source secrets. A missing/failed service preserves deterministic results and declares AI unavailable. Model output is commentary requiring verification; it cannot alter the calculated stock prices or ranking. Model inference consumes the Cloudflare account's allowance and may incur charges beyond it.

The service was deployed as `vandlabs-dealer-ai` on the connected Cloudflare account. Model inference was separately verified through the Cloudflare API. Authenticated worker HTTP acceptance and full app commentary acceptance are recorded separately; deployment alone does not prove the full path. Production staff authentication, pricing/billing, licensed feeds and the production app release still require completion before paid launch.
