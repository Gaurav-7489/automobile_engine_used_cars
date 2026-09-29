# V1 Proof-of-Engine — Feature Pass Status

Version: **1.0.0-proof-of-engine**

This repository has completed the planned V0.1 → V0.9 implementation pass and now contains the V1 reference MVP across the three product surfaces.

## Implemented product loop

```text
DISCOVER
  → EVALUATE
  → ENQUIRE
  → QUALIFY
  → VISIT / TEST DRIVE
  → SALE / OUTCOME
  → LEARN / OPTIMIZE
```

The reference implementation now connects:

- public dealership experience
- canonical vehicle Inventory Hub
- search / filter / compare
- vehicle details and SEO
- WhatsApp / phone handoff
- enquiry / test-drive / finance / exchange intent
- first-party journey context
- local persisted demo lead creation
- automotive lead inbox / profile / pipeline
- tasks and appointments
- evidence-based intelligence
- tenant hierarchy and configuration
- entitlements and feature rollout
- managed onboarding foundations
- Integration Hub registry
- health and audit foundations
- BFF/OpenAPI/event contracts
- documented AWS-native production path

## Important status distinction

**Feature pass: complete.**

**Runtime certification: pending Codex/local QA.**

The branch must still pass `pnpm qa` and the browser/architecture review in `docs/launch-qa.md`. Any compile, lint, browser or integration issue found there should be fixed before merging/deploying.

## Production infrastructure still intentionally deferred

The V1 MVP does not claim live production Cognito, Aurora, S3 media pipeline, Redis/OpenSearch, WAF, queues, observability, secrets management or disaster recovery. Those are the next infrastructure phase after contract stability and MVP QA.

The product boundary also continues to exclude workshop/service, spare parts, customer garage, insurance, billing, native apps, advanced AI sales assistant, deep DMS/CRM integrations, full WhatsApp Business automation, lender APIs, automated valuation and self-service SaaS onboarding.
