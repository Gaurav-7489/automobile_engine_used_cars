# Dealer data API release — 13 October 2026

## Implemented

Dealer-facing product entry; server-backed acquisition planner; three server-owned subscription tiers; platform contract/access provisioning; key issue/one-time display/hash storage/scope/expiry/revocation; tenant-wide monthly and minute quotas; approved source ingestion and canonical HTTPS feed synchronization; separate dealer-use and API-redistribution permissions; vehicle/fuel/recommendation API; source timestamps/expiry; distance/radius/transport/holding/reserve calculations; supplied resale ranges and demand evidence; optional protected Cloudflare AI commentary.

## Verification

- Workspace lint and typecheck pass.
- Web, Command Center, Platform and desktop production builds pass.
- 28 security, 16 database and 5 intelligence tests pass (49 total).
- Local HTTP acceptance: all four dealer pages return 200; scoped key creates; licensed vehicle query succeeds; ₹10 lakh two-car acquisition includes ₹9,11,000 landed/holding estimate; forged tier input is denied; key revocation returns subsequent 401.
- PostgreSQL commerce migration tested in PGlite and applied to the isolated Neon branch `dealer-data-api-20261013` (`br-nameless-grass-b3g5s4pm`) in the existing VandLabs project. Forced tenant RLS policy inspected.
- Protected Cloudflare Worker `vandlabs-dealer-ai` deployed; Workers AI model inference returns 200 through the Cloudflare API. Authenticated Worker HTTP test returns 403 in this environment, so Worker/app commentary acceptance remains incomplete. Preview-only private AI settings are configured for the review branch; production settings are untouched.
- Desktop/mobile Playwright flows are added for plan enforcement and key lifecycle, but browser binaries cannot be downloaded here (truncated ZIP responses). Full browser acceptance is not claimed.

## Paid launch remains blocked

1. Marketplace sources need contracted API credentials and explicit downstream redistribution rights. CarDekho public terms prohibit the proposed website scraping/commercial redistribution route.
2. Paid plan prices, billing account, checkout, renewals, invoices/taxes and webhook reconciliation are not activated. Scoped administrators can provision an actual contracted/manual-invoice subscription, but that is not automated payment collection.
3. Existing hosted app settings are demo-only. Neon Auth is already provisioned, but its current `@neondatabase/auth` 0.6.0-beta Next integration declares Next >=16; this repo uses 15.5.26. A tested authentication integration/compatibility upgrade, trusted domains, staff grants, custom production SMTP/OAuth and logout/refresh acceptance are still required. No auth cutover was attempted.
4. Production connection/tenant/staff configuration, migration rollout, provider data acceptance, load testing, immutable audit export and production app promotion remain distinct release gates.

No fictional provider data is seeded into production. The existing production deployment and domains are not switched by this change. Hosted file-backed previews stay read-only; the fully mutable local demo uses shared atomic state.
