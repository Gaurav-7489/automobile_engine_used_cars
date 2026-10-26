# Subscription entitlements (Starter, Growth, Scale)

Plan limits live in one place: `packages/contracts/src/entitlements.ts` (`planEntitlements`), alongside the API quotas in
`commercePlans`. The numbers are **provisional product decisions, not prices**; no billing is active. Clients only display
limits (`GET summary` returns `entitlements`); every check below runs on the server.

| Limit | Starter | Growth | Scale | Enforced where |
|---|---|---|---|---|
| Staff seats (enabled users) | 3 | 10 | 40 | `saveStaff` (PostgreSQL transaction + demo store), tenant-wide advisory lock |
| Locations | 1 | 3 | 15 | on plan assignment/change (`provision`): a plan that cannot hold current usage is refused |
| Unsold vehicles | 50 | 250 | 2,000 | `createInventoryBatch` (including previews), sold vehicles free capacity |
| AI commentary requests / month | 50 | 500 | 5,000 | `dealerRecommendations`; the deterministic report is always returned |
| API requests / month, per minute, keys | 100 / 15 / 1 | 2,000 / 60 / 5 | 20,000 / 120 / 20 | existing API meter (unchanged) |
| Two-car planning, cross-city sourcing | no / no | yes / yes | yes / yes | existing `recommend` gate (unchanged) |
| Market intelligence, licensed feed sync | no | yes | yes | `marketIntelligence`, `providerSync` |
| Storage | 1 GB | 10 GB | 100 GB | **declared only**: no upload path meters bytes yet |

## Behaviour
- **No subscription record:** Starter limits and no paid features (onboarding does not depend on ordering).
- **Suspended, cancelled or expired:** existing records stay readable; adding seats, stock or paid features returns 402.
  Disabling users and suspending are never blocked.
- **Over a limit:** 409 for capacity (seats, stock, plan cannot hold usage), 403 when the plan lacks a feature.
- **Downgrades:** refused with the exact overages until usage fits. Locations are only added through tenant provisioning today,
  so they are checked at plan change rather than on creation.
- **Bootstrap admins** listed in `AUTH_PRINCIPALS_JSON` are not database staff and do not consume seats.
- **Environments without migration 0007** (no `dealer_commerce` table) read as unsubscribed instead of failing.

## Not included
Paid billing, invoicing, webhooks and proration are not implemented or activated. Storage is not enforced.
