# Legacy application retirement

**Conclusion: nothing is retired in this change.** `apps/command-center` and `apps/platform` still provide capabilities Intelligence does not, and the desktop app and Cloudflare scripts depend on them. This document is the parity matrix and the plan. The matrix comes from reading routes, components and keyword searches, not from exercising each feature; confirm each "missing" item with the product owner before building it.

## Dependencies found

- Root scripts `cf:build`, and the `cloudflare.yml` workflow build `web`, `command-center` and `platform`.
- `playwright.roles.config.ts`, `playwright.auth.config.ts`, `tests/cloudflare/staging.test.ts` and `scripts/cloudflare/*` reference them.
- `apps/desktop` consumes `GET /api/desktop-config` from command-center.

## command-center → intelligence

| Capability | command-center | intelligence | Gap |
|---|---|---|---|
| Leads, follow-ups, lead detail | yes | yes (`/app/leads`) | verify field parity |
| Appointments, tasks | yes | yes (state + commands) | verify |
| Inventory + spreadsheet import/template | yes (`/api/vehicles/import`, template) | inventory page with import | verify spreadsheet format parity |
| Capital / costs | yes | yes (`/app/capital`) | none found |
| Market / acquisition | yes | `/app/market`, `/app/pricing` | verify |
| Sales pipeline view, customers view | yes | leads & customers combined | verify |
| **Automation rules** (`automation`) | yes | **no** (`automation_*` tables exist, no UI) | **missing** |
| **Subscriptions** (`subscription-controls`) | yes | **no** | **missing** |
| **Dead-stock intelligence** (`api/dead-stock`) | yes | no equivalent endpoint | **missing** |
| **Business API** (`/api/v1/vehicles`, `fuel-prices`, `recommendations`, `ingest`) | yes | `/api/v1/inventory`, `/api/v1/leads` only | **different contract; clients must be inventoried** |
| Notifications outbox, readiness | yes | `/app/alerts`, `/api/health` | partial |
| Desktop config for Tauri app | yes | no | **blocks desktop** |
| Authentication | OIDC staff roles | one sign-in, own users, TOTP | model differs; do not merge silently |

## platform → intelligence `/admin`

| Capability | platform | intelligence | Gap |
|---|---|---|---|
| Dealerships / tenants, onboarding | yes | workspace list + create + owner invite | covered |
| People and access (staff) | yes (`staff-manager`) | members + suspend | partial |
| Commerce / subscriptions | yes (`commerce-manager`) | no | **missing** |
| Audit log | yes | audit written to `platform_audit`; no viewer in admin | **missing viewer** |
| Integrations, feature entitlements | yes | no | **missing** |
| Health / readiness | yes | `/api/health` only | partial |

## Plan

1. Decide which "missing" rows are still wanted; port those to Intelligence behind roles (automation, subscriptions/commerce, dead stock, audit viewer, feature entitlements, desktop config).
2. Inventory live consumers of `command-center`/`platform` URLs and `/api/v1/*` keys (Vercel/Cloudflare access logs).
3. Repoint desktop and `cf:*` scripts, then remove the apps on a branch with a one-step revert (the apps stay in git history; do not delete databases or tenant data).
4. Keep `apps/web` as a separate build behind the unified origin; that already works and keeps dealer JS off the public site.
