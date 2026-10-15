# Market Intelligence

Internal staff workspace: `/command/market`. JSON read endpoint:
`GET /command/api/dealer/market`. Both require an authenticated server-provisioned
principal with inventory and analytics read capabilities and an active dealership
subscription. Tenant identity comes from that principal, never a query parameter.
Responses are private/no-store under existing HTTP policies. This is internal
dealer intelligence; it does not authorize public data resale.

## Evidence contract

Existing `purchasePrice` is a supplier acquisition quote, not a market asking price.
Importers may explicitly supply this additional field per sourcing vehicle:

```json
{"askingPrice":{"amount":500000,"currency":"INR","observedAt":"2026-10-15T08:00:00Z"}}
```

Amounts are positive integer rupees. Currency must explicitly be INR. The price
observation cannot follow the containing vehicle observation. Existing records
without this field remain valid and contribute no asking-price statistic. There
is no inferred fallback from purchase quotes, expected resale ranges or AI output.
Newer vehicle updates cannot remove an existing price or replace it with older
price evidence; retain the last explicit observation with its original timestamp
until a newer price is available. Withdrawn availability and source permissions
still exclude it. Source timestamps and provider sync success are separate.

## Filters and calculations

Exact case-insensitive make, model, city, source ID, fuel and transmission filters;
minimum/maximum year and asking price; maximum odometer; price freshness window
1–90 days (default seven); page 1–100, 25 records per page. The stored sourcing
capacity remains 2,000 records per tenant. No public API scope or plan definition
is changed. Current active tiers share this internal descriptive workspace;
commercial entitlement differentiation remains a separate release task.

Only available, unexpired vehicle records from active dealer-use agreements are
eligible. Price-specific age is checked separately, and future price evidence is
excluded. Disabled/expired agreements are excluded on every read. Reports show
median, minimum, maximum and interpolated 25th/75th percentiles in INR, city
medians, record counts, source counts, observation range and source attribution.
Sorted percentile index is `(n - 1) * fraction`, with linear interpolation between
neighboring values. Statistics use all filtered eligible records, not merely the
visible page. Filtering by city also narrows the regional table.

Counts are source records, not verified unique physical vehicles. Cross-provider
VIN/registration reconciliation is still required before any unique-vehicle or
market coverage claim. Different models/years/conditions can have different prices;
the workspace warns about mixed make/model/year cohorts and fewer than five
records. Five is a display warning threshold, not statistical certification or
calibrated confidence. City medians are not mix-adjusted valuations.

No verified transaction price, historical price trend, market-wide demand,
turnover estimate, guaranteed margin or arbitrage recommendation is inferred.
Variant, ownership and condition filters await trustworthy canonical provider
fields. Explicit demo source records are labeled fictional; production rejects
demo-source approval. Empty real datasets show missing evidence without fixture
seeding.

## Acceptance

Unit regressions cover price semantics, quartiles, filtering, license expiry,
availability, price freshness, malformed payloads, stale-price rollback and stable
pagination. Repository regressions cover capabilities, subscription state,
PostgreSQL persistence and tenant isolation. Browser acceptance imports isolated
local fixtures, checks an empty quote-only dataset, explicit-price statistics,
filter submission, JSON endpoint and narrow-screen overflow. Staff HTTP checks
include anonymous/forged access to the page and endpoint. Live licensed feed,
production staff login and staging deployment acceptance remain required.
