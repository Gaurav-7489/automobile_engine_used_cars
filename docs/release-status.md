# Historical V1 Proof-of-Engine release notes

Current delivery and live blockers: [9 October release](release-2026-10-09.md) and [completion register](source-of-truth-completion-register.md). The certification counts and boundaries below describe the September reference release, not the current product or production acceptance.

Version: **1.0.0-proof-of-engine**

This repository has completed the planned V0.1 → V0.9 implementation pass and local runtime certification for the V1 reference MVP across the three product surfaces.

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

**Local runtime certification: complete as of 2026-09-30.**

`pnpm qa` passes lint, typecheck, production builds for all three applications, and 24 desktop/mobile Playwright checks. Visual QA covered the public home, inventory, vehicle detail and contact experiences plus the Command Center and Platform Control Center. The certification also verifies no page-level horizontal overflow at mobile widths, including wide operational tables that scroll within their own container.

## Production infrastructure still intentionally deferred

The V1 MVP does not claim live production Cognito, Aurora, S3 media pipeline, Redis/OpenSearch, WAF, queues, observability, secrets management or disaster recovery. Those are the next infrastructure phase after contract stability and MVP QA.

The product boundary also continues to exclude workshop/service, spare parts, customer garage, insurance, billing, native apps, advanced AI sales assistant, deep DMS/CRM integrations, full WhatsApp Business automation, lender APIs, automated valuation and self-service SaaS onboarding.

## Post-V1 operational depth

The first V1.5 operational slice is complete: dealership staff can update pipeline stage, assign a salesperson, record internal context, schedule and complete follow-up tasks, and review the resulting lead activity trail. Current funnel reporting resolves runtime updates over seeded records so operational edits do not inflate lead totals.

The V1.5 slice passed the full `pnpm qa` gate on 2026-09-30: lint, typecheck, all production builds, and 26 desktop/mobile Playwright checks. The updated lead workspace was also visually inspected at 1440px and 390px with no page-level horizontal overflow.
