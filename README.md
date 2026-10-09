# VandLabs Automobile Engine

VandLabs Automobile Engine is a reusable, multi-tenant Automotive Commerce & Growth Engine for used-car dealerships. The V1 Proof-of-Engine connects the dealership experience, canonical vehicle inventory, conversion intent, first-party journey context, automotive lead operations, reporting, platform controls and future AWS integration boundaries.

## Current V1 reference applications

- `apps/web` — public dealership experience on port 3000.
- `apps/command-center` — dealership Growth / Sales OS on port 3001 under `/command`.
- `apps/desktop` — native Windows/macOS client and installer builds.
- `apps/platform` — VandLabs Platform Control Center on port 3002 under `/platform`.

The reference tenant is **Apex Select Cars**, backed by shared typed demo data. Public enquiries and operations are written atomically to `.demo-runtime/state.json` so the local demo can show a newly created lead in Command Center without a production database.

## What V1 proves

The reference path demonstrates:

1. Premium responsive dealership experience and custom tenant configuration.
2. Canonical used-vehicle inventory with search, filters, compare and vehicle details.
3. WhatsApp, call, enquiry, test-drive, finance and exchange intent.
4. First-party source / campaign / vehicle journey context.
5. Structured lead creation through a Next.js BFF contract.
6. Automotive lead inbox, lead profile, pipeline, tasks, appointments and test-drive context.
7. Evidence-based acquisition, vehicle-demand and operational intelligence.
8. Organization → dealership → location hierarchy, entitlements, rollout flags, onboarding, integration registry and audit foundations.
9. Stable HTTP/domain contracts that can be connected to AWS without teaching the UI about infrastructure.

## Local development

```bash
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install --frozen-lockfile
pnpm demo
```

Open:

- Public Experience: http://127.0.0.1:3000
- Command Center: http://127.0.0.1:3001/command
- Platform Control Center: http://127.0.0.1:3002/platform

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm test:security
pnpm test:auth:e2e

# all gates in sequence
pnpm qa
```

The connected reference demo has passed Chromium/mobile WebKit QA on the release branch. Production deployment still requires the infrastructure, security and operational controls listed in `docs/launch-qa.md`.

## Architecture

The UI depends on typed domain/application contracts rather than a database vendor:

```text
Experience / Command / Platform
        ↓
application services
        ↓
repository + HTTP contracts
        ↓
demo adapter today
        ↓
Next.js BFF → API Gateway → domain services → Aurora/S3/cache/events later
```

See:

- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/openapi.yaml`
- `docs/event-spec.md`
- `docs/aws-integration.md`
- `docs/launch-qa.md`
- `docs/production-tenant-isolation.md`
- `docs/staff-authentication.md` — verified Cognito staff access and bootstrap provisioning
- `infra/aws/` — deployable CDK production foundation

## Deliberate V1 exclusions

V1 does **not** include workshop/service operations, spare-parts operations, customer garage, insurance, billing, native mobile apps, advanced AI sales assistant, full DMS/CRM integrations, full WhatsApp Business automation, lender APIs, automated exchange valuation or full self-service SaaS onboarding.

AI remains assistive rather than authoritative; vehicle facts, attribution evidence and business outcomes are deterministic records.

Built reference apps require explicit `AUTH_MODE=demo` when launched manually. For Cognito access, configure the server variables in `docs/staff-authentication.md`; browser login/refresh and Aurora repositories are implemented; live use requires deployment configuration.

## Shared production runtime

See `docs/production-runtime.md` for PostgreSQL migrations, application-role provisioning, Cognito login and desktop configuration. `DATA_MODE=aurora` uses shared PostgreSQL records; `demo` is explicit reference mode. Live deployment requires AWS/network/domain configuration. Native installer artifacts are built by `.github/workflows/desktop-build.yml`.

See `docs/release-2026-10-08.md` for the connected-demo release, pull instructions, exact test evidence and separate desktop/staging/production completion states.

Inventory entry and CSV preview/import: see [inventory-intake.md](docs/inventory-intake.md).

Verified stock-cost and capital operations: [capital-operations.md](docs/capital-operations.md).

All four increments (PRs #11–#14) are merged into `main`. See the [main delivery report](docs/main-delivery-2026-10-08.md) for fresh main QA, native downloads, pull instructions and remaining acceptance requirements.

Historical CRM consistency increment: [`feat/crm-conflict-safety`, PR #14](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/14). See [release evidence and local installation](docs/release-crm-2026-10-08.md) for exact commits, checks and independent acceptance gaps.

## Current connected Platform increment

The Platform now reads the same stock/lead/task/sale state as the other apps and manages persisted staff permissions with audit and assigned-lead restrictions. All five supplied specifications are archived in [docs/specifications](docs/specifications/README.md).

- [9 October delivery and remaining scope](docs/release-2026-10-09.md)
- [Connect all three hosted apps](docs/shared-staging-setup.md)
- [Platform and persistent staff access](docs/platform-staff-operations.md)

The Vercel deployments remain protected browse-only previews until shared Aurora connectivity and Cognito settings are supplied and accepted. A successful build is not a live-backend certification.

Final merged evidence, installers, all five source documents and refreshed preview targets: [9 October main delivery](docs/main-delivery-2026-10-09.md).
