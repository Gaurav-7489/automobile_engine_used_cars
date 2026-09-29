# VandLabs Automobile Engine

V0.1 is the production-quality foundation of a reusable multi-tenant Automotive Commerce & Growth Engine for used-car dealerships.

## Applications
- `apps/web` — public dealership experience (port 3000)
- `apps/command-center` — dealership staff operating shell (port 3001)
- `apps/platform` — VandLabs-only platform shell (port 3002)

## Packages
- `@vandlabs/contracts` — canonical domain/repository contracts
- `@vandlabs/design-system` — shared primitives/tokens foundation

## Architecture
UI → application service → repository interface → mock adapter. The UI is intentionally unaware of whether data comes from mocks, REST or AWS. Tenant hierarchy is Organization → Dealership → Location. The Experience Engine is configuration-led: brand, theme, navigation, SEO defaults and entitlements live in typed tenant configuration.

## Local development
```bash
corepack enable
pnpm install
pnpm dev
```
Individual apps can run with `pnpm --filter @vandlabs/web dev`, `@vandlabs/command-center`, or `@vandlabs/platform`.

## Quality commands
```bash
pnpm typecheck
pnpm build
pnpm test:e2e
```

## Future AWS path
Repository interfaces can later be backed by Next.js BFF routes and AWS API Gateway/domain services. Aurora PostgreSQL becomes transactional truth; S3 handles media; Redis and event-driven workers are introduced only where justified. UI contracts should not change because an adapter changes.

## Explicit V0.1 exclusions
No production AWS/Aurora/Cognito, production auth, advanced CRM, AI assistant, advanced analytics, DMS, WhatsApp Business API, finance or valuation APIs, workshop/parts/insurance, customer garage, billing, native apps, full automation engine, or workflow builder.
