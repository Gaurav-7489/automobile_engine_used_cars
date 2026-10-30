# VandLabs Automobile Engine

One product, one repository, one web deployment.

| Part | Where | What it is |
|---|---|---|
| Web app | `apps/intelligence` | Sign-in, dealership workspace (`/app`), VandLabs admin console (`/admin`), public sample showroom (`/showroom`), desktop install page (`/install`), Business API (`/api/v1/*`) |
| Desktop app | `apps/desktop` | Tauri client for Windows, macOS and Linux; signs in through the web app |
| Shared code | `packages/contracts`, `packages/data`, `packages/demo-data`, `packages/server-auth` | Types, PostgreSQL access, matching engine, sample catalogue, auth helpers |
| Database | `infra/database/migrations` | PostgreSQL with forced row-level security per tenant |
| AI commentary worker | `infra/cloudflare/dealer-ai` | Standalone Worker kept for the planned AI commentary feature; not deployed |

The former `apps/web`, `apps/command-center` and `apps/platform` were retired after every feature moved into `apps/intelligence`; see `docs/LEGACY_APPLICATION_RETIREMENT.md`.

## Hosting

- **Vercel** (live): project `vandlabs-automobile-intelligence`, root directory `apps/intelligence`, production deploys from `main`.
- **Cloudflare** (staging only, run by hand): the same app as one Worker (`apps/intelligence/wrangler.jsonc`). `pnpm cf:build` builds it; `pnpm cf:deploy` checks settings (`scripts/cloudflare/preflight.mjs`) and deploys. Needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_ORIGIN`, and the secrets `DATABASE_URL` and `SESSION_SECRET`. See `docs/CLOUDFLARE_MIGRATION_AND_ROLLBACK.md`.
- **Desktop installers**: built by `.github/workflows/desktop-release.yml` after the Quality Gate passes on `main`, published to the `desktop-latest` GitHub release. Unsigned until signing certificates are added.

## Develop

```bash
pnpm install
pnpm --filter @vandlabs/intelligence dev     # needs DATABASE_URL, SESSION_SECRET, APP_ORIGIN
```

Local PostgreSQL for browser checks: `scripts/local/pg-up.sh`, then `pnpm db:migrate`.

## Check

```bash
pnpm lint && pnpm typecheck
pnpm test:security test:database test:intelligence test:product test:intelligence-prod test:cloudflare
pnpm build
pnpm test:browser                                                   # sign-in, boundaries, install (Chromium and WebKit)
pnpm exec playwright test -c playwright.local-stack.config.ts      # accessibility, visual, motion, showroom, admin flows (local PostgreSQL)
```

`pnpm qa` runs all of the above except the local-stack suite.

## Documents

- `docs/PRODUCTION_READINESS_REPORT.md`: what is done, verified and still open
- `docs/UX_DESIGN_SYSTEM.md`: themes, glass, motion, showroom, installers
- `docs/SECURITY_AND_RATE_LIMITING.md`, `docs/PERFORMANCE_BASELINE_AND_RESULTS.md`
