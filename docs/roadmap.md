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
| V0.8 | Implemented; QA certified | Accessibility/responsive/SEO/error-state polish, persisted local demo lead flow and expanded Playwright coverage. |
| V0.9 | Implemented; infrastructure deferred by design | Stable BFF/OpenAPI/event contracts plus documented AWS-native migration path. |
| V1.0 | Feature pass and local runtime QA complete | Full reference Proof-of-Engine loop from discovery to conversion, lead operations, reporting and platform controls. |
| V1.5 | Feature pass complete; runtime QA pending | Operational depth: persisted stage/owner/note changes, lead activity history, follow-up scheduling, task completion/reopen controls, funnel progression and next-action/overdue reporting are implemented. |

## V1 boundary

V1 is the used-car Automotive Commerce & Growth Engine. Workshop/service, spare-parts operations, customer garage, insurance, billing, native mobile apps, advanced AI sales assistant, deep DMS/CRM integrations, full lender/valuation integrations and full self-service SaaS onboarding remain future modules.

## Release rule

A stage marked **Implemented** means the feature/contracts are in the repository. V1 local runtime QA was certified on 2026-09-30; production deployment still depends on the deployment-specific controls in `docs/launch-qa.md`.


## Next dependency-ordered releases

- **V2 — Automation + attribution (feature pass complete; CI verification pending):** deterministic lead-created and stage-change follow-up rules, consent boundaries, duplicate protection, persisted automation audit runs, persisted first-party journey events, reusable campaign templates and Command Center evidence are implemented.
- **V2.5 — Integrations + advanced reporting (foundation implemented):** normalized CRM/DMS adapter contracts, explicit field-authority maps, reconciliation evidence and descriptive campaign outcome reporting are implemented. Real vendor connectivity remains gated on verified provider APIs, credentials and field-authority approval.
- **V3 — AI + inventory intelligence:** inventory health/economics first, then guarded assistant, matching, rescue and dealer copilot. Gate: structured truth, sufficient history, consent and tool guardrails.
- **V3.1+ — Market/depreciation/predictive intelligence:** only after licensed/permissioned market coverage and enough historical outcomes exist. No nationwide scraping or predictive claims without evidence.

## Ecosystem continuation — verified staff access

Cognito access-token verification, server-owned staff provisioning, Command Center
and Platform page guards, and independent lead/task mutation scope checks are
implemented. Demo mode must be explicit on built staff applications. Partial
location scopes are denied on the aggregate reference screens until scoped
production repositories are available.

Validation: lint, typecheck and all three production builds pass; 13 security unit
tests, 13 staff HTTP denial tests and 12 reference API regression cases pass.
Full browser smoke verification remains pending CI because this environment's
Chromium archive download failed. Login/refresh UX, live Cognito acceptance and
Aurora repositories/deployment remain pending. See `staff-authentication.md`.
