# Automobile Engine Delivery Roadmap

The original implementation stages are retained so agents can see how the repository reached the V1 Proof-of-Engine.

| Stage | Status | Outcome |
| --- | --- | --- |
| V0.1 | Implemented | Foundation: pnpm/Turborepo, three Next.js apps, typed contracts, tenancy/config foundation, seeded vehicles, basic routes and quality tooling. |
| V0.2 | Implemented | Premium reusable dealership experience, shared header/footer, responsive public shell and Experience Engine configuration. |
| V0.3 | Implemented | Inventory Hub experience with search, filters, sort, compare and richer vehicle details. |
| V0.4 | Implemented | Conversion engine: WhatsApp/call tracking, structured enquiry/test-drive/finance/exchange intent, source/campaign context and BFF contracts. |
| V0.5 | Implemented | Automotive CRM / Sales OS: lead inbox/profile, pipeline, customers, tasks and appointments. |
| V0.6 | Implemented | Intelligence Command Center with acquisition, vehicle-demand, funnel and operational evidence. |
| V0.7 | Implemented | Platform Control Center: hierarchy, onboarding, entitlements, flags, integrations, health and audit foundations. |
| V0.8 | Implemented; QA pending | Accessibility/responsive/SEO/error-state polish, persisted local demo lead flow and expanded Playwright coverage. |
| V0.9 | Implemented; infrastructure deferred by design | Stable BFF/OpenAPI/event contracts plus documented AWS-native migration path. |
| V1.0 | Feature pass complete; Codex/runtime QA pending | Full reference Proof-of-Engine loop from discovery to conversion, lead operations, reporting and platform controls. |

## V1 boundary

V1 is the used-car Automotive Commerce & Growth Engine. Workshop/service, spare-parts operations, customer garage, insurance, billing, native mobile apps, advanced AI sales assistant, deep DMS/CRM integrations, full lender/valuation integrations and full self-service SaaS onboarding remain future modules.

## Release rule

A stage marked **Implemented** means the feature/contracts are in the repository. It does **not** mean the build/browser QA is certified. Run `docs/launch-qa.md` with Codex before treating V1 as deployable.
