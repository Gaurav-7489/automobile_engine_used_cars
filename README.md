# VandLabs Automobile Engine

VandLabs Automobile Engine is a reusable, multi-tenant Automotive Commerce & Growth Engine for used-car dealerships. The V1 Proof-of-Engine connects the dealership experience, canonical vehicle inventory, conversion intent, first-party journey context, automotive lead operations, reporting, platform controls and future AWS integration boundaries.

## Current V1 reference applications

- `apps/web` — public dealership experience on port 3000.
- `apps/command-center` — dealership Growth / Sales OS on port 3001 under `/command`.
- `apps/platform` — VandLabs Platform Control Center on port 3002 under `/platform`.

The reference tenant is **Apex Select Cars**, backed by shared typed demo data. Public enquiries are written to `.demo-runtime/leads.json` so the local demo can show a newly created lead in Command Center without a production database.

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
pnpm install
pnpm dev
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

# all gates in sequence
pnpm qa
```

The feature pass is intentionally separated from final Codex/browser QA. A green build and Playwright pass must be confirmed before calling a deployment production-ready.

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

## Deliberate V1 exclusions

V1 does **not** include workshop/service operations, spare-parts operations, customer garage, insurance, billing, native mobile apps, advanced AI sales assistant, full DMS/CRM integrations, full WhatsApp Business automation, lender APIs, automated exchange valuation or full self-service SaaS onboarding.

AI remains assistive rather than authoritative; vehicle facts, attribution evidence and business outcomes are deterministic records.
