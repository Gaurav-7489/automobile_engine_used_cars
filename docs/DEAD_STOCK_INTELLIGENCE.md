# Dead stock intelligence (Model 4)

Status: implemented as deterministic rules with unit tests; Command Center UI and
browser acceptance pending. No live dealership data has been evaluated.

## What it does

`deadStockReport(snapshot, asOf, policy)` in `packages/data/src/dead-stock.ts`
reviews unsold stock for one tenant and returns:

- Age per vehicle, using the recorded acquisition date when a cost record exists,
  otherwise the listing date. The basis (`acquisition`, `listing`, `unknown`) is
  shown on every row. Days follow the Asia/Kolkata calendar.
- Age bands, default 0–30, 31–60, 61–90 and over 90 days. Bands are configurable
  and validated (ascending whole days).
- Per band: vehicle count, recorded capital and cost coverage (for example `2/5`).
  Vehicles without cost records are excluded from capital, never counted as zero.
- Views and enquiries in a lookback window (default 30 days), open enquiries and
  the last recorded price change. Activity from other tenants is ignored.
- Review prompts with the evidence that triggered them:

| Action | Trigger (aged = past the first band) |
|---|---|
| `inspect` | No valid price, no photographs or no valid date |
| `publish` | Aged, available and not published |
| `promote` | Aged, published, fewer views than `minViews` in the window |
| `review_price` | Aged, enough views, zero enquiries, no price change within `priceReviewAfterDays` |
| `follow_up` | Aged with open enquiries |

Sold stock is excluded. Reserved stock is never prompted to publish, promote or
reprice. Every row has `reviewRequired: true`.

## What it deliberately does not do

- It never proposes or changes a price. `review_price` tells staff to compare
  against permitted market evidence first.
- Transfer recommendations are listed as unavailable: no permitted cross-location
  demand evidence is connected.
- A view count alone is not treated as purchase intent.

## Access

`GET /command/api/dead-stock` calls `staffDeadStock(principal)`, which requires
`inventory:read` and `analytics:read`, uses the tenant-scoped staff snapshot and
responds `private, no-store`. API routes bypass the page middleware, so this check
is the route's authorization.

The report only uses evidence the caller's role may see (`access` in the response):

| Role evidence | Effect |
|---|---|
| No `capital:read` (sales, marketing, manager) | `capitalLocked`, `recordedCapital` and `costCoverage` are `null`; ages use the listing date so acquisition dates are not disclosed |
| No `lead:read` (acquisition, marketing) | `enquiries` and `openLeads` are `null`; no `review_price` or `follow_up` prompts |
| Assigned-only sales staff | Counts cover assigned leads only; `follow_up` allowed, `review_price` suppressed |

Withheld evidence is listed under `unavailable`, never reported as zero. Capital is
matched to each vehicle record rather than by id, and `capitalReport` ignores cost
and sale records from another tenant.

## Evidence

`tests/intelligence/dead-stock.test.ts` covers band boundaries by calendar day,
acquisition-vs-listing basis, capital exclusion of missing costs, sold/reserved
handling, each recommendation trigger, recent price changes, the activity window,
other-tenant isolation (activity, costs and reused vehicle ids), role-limited
evidence for owner, sales, acquisition and marketing staff, capability rejection
and policy validation. The CI Quality Gate is the release
evidence; UI and live acceptance remain open.
