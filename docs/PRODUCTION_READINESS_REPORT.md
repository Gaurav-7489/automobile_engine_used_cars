# Production readiness report

Nothing here has been deployed or run against production. All measurements are from a local PostgreSQL 16, a local production build and synthetic data.

## Implemented and tested

| Area | Evidence |
|---|---|
| Password re-confirmation for dealership creation | `tests/intelligence-prod/admin.test.ts`, browser test `tests/local-stack/dealership-creation.spec.ts` |
| Page-specific loading, server paging/filter/sort, scoped commands, delta responses | read-model, scoped-command and workflow tests (differential against the unchanged full read); numbers in `PERFORMANCE_BASELINE_AND_RESULTS.md` |
| Automations | `automations.test.ts` (2) |
| Stock / ageing intelligence | `stock-intelligence.test.ts` |
| Subscriptions, feature entitlements, platform audit viewer | `entitlements.test.ts` (3) |
| Acquisition planner (metered) | `acquisition.test.ts` |
| Desktop sign-in (PKCE, bearer sessions) and client | `desktop.test.ts` (2); Rust rule tests (4, run in an isolated crate because the Tauri GUI libraries are not installable here) |
| Private platform: root redirect, no public surface, route aliases | `tests/unified/ecosystem.spec.ts` (desktop project passes), `tests/product-ui` |
| Shared rate limiting | `rate-limit.test.ts` |
| Dark/light graphite-emerald UI, interaction system | `UX_DESIGN_SYSTEM.md` |
| WCAG 2.2 AA automated checks, mobile overflow, visual regression | `tests/local-stack/accessibility.spec.ts`: 24 of 24 pass |
| Cloudflare Worker config and bundle | `wrangler.jsonc`, `open-next.config.ts`; build and `wrangler deploy --dry-run` succeed (1.76 MiB gzipped) |

Suites run on this branch: lint (0 errors, 27 pre-existing-style unused-import warnings), typecheck, security 39/39, database 35/35, intelligence 30/30, product 11/11, intelligence-prod 19/19, cloudflare 25/25.

## Not verified (needs live environments)

- Anything on Vercel or Cloudflare: no deployment was made or measured. Hosted latency, Lighthouse, INP, memory.
- The Tauri desktop binary was not built or run (GUI libraries unavailable); its protocol is covered by server tests and its pure rules by Rust unit tests. A manual sign-in on Windows/macOS is required.
- WebKit/mobile-Safari projects (browser not installed here); older Playwright suites for web/command-center/platform were not re-run.
- Manual accessibility review with a screen reader, keyboard-only walkthrough, forced colours and zoom.
- Penetration test; dependency audit.
- Neon-specific behaviour (pooler, `pg` from Workers).

## Incomplete capabilities

- Business API `/api/v1/vehicles|fuel-prices|recommendations|ingest` and supplier ingest/data-source management (legacy apps still own them).
- AI commentary on acquisition results.
- Plan-to-feature tiering (a product decision): features are switched per dealership, plans carry usage limits only.
- Scheduled jobs (reindex, cleanup) and Queues are not built; the read model backfills on first request (4.2 s at 10,000 vehicles).
- Desktop: no refresh token (re-approve every 8 h), no offline mode, covers Today, Inventory, Leads and Stock ageing only.
- Legacy apps are not retired (see `LEGACY_APPLICATION_RETIREMENT.md`). Next.js 15.5.27 is rejected by the Cloudflare adapter without an override flag.

## Deploy (when approved)

1. Apply migrations `0013` to `0017` with the migration role (`pnpm db:migrate`). All are additive; grants target the non-bypass `vandlabs_runtime` role.
2. Deploy to staging first (Vercel preview or the Cloudflare Worker); no new required environment variables for Vercel. `APP_ORIGIN` must be the final HTTPS origin for desktop sign-in.
3. Smoke test: `/api/health`, admin sign-in with authenticator code, Add dealership, `/api/desktop/config`.
4. Warm each dealership's read model once.

## Roll back

Redeploy the previous build; it ignores the new tables and functions, so migrations can stay. Cloudflare: repoint DNS to the Vercel project (`CLOUDFLARE_MIGRATION_AND_ROLLBACK.md`).
