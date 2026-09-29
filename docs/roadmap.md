# Automobile Engine delivery roadmap

The build is intentionally staged so the first reference dealership grows from a stable platform foundation into the complete V1 Proof-of-Engine.

| Stage | Outcome |
| --- | --- |
| V0.1 | Foundation: pnpm/Turborepo, three Next.js apps, typed contracts, tenancy/config foundation, seeded vehicles, basic public routes, staff/platform shells, SEO/error/testing baseline. |
| V0.2 | Dealership Experience: complete premium public shell, reusable navigation/footer, brand-led homepage, trust/content modules and stronger responsive presentation. |
| V0.3 | Inventory & Discovery: canonical Inventory Hub surfaced through search, filters, sort, compare and richer vehicle detail/specification pages. |
| V0.4 | Conversion Engine: WhatsApp/call/enquiry/test-drive/finance/exchange intent, source/UTM journey context, vehicle-level conversion events and contract-first lead capture. |
| V0.5 | CRM & Sales OS: lead inbox/profile, opinionated automotive pipeline, tasks, appointments, test-drive workflow and customer context. |
| V0.6 | Intelligence Command Center: business/acquisition/vehicle-demand/funnel/operations views using only seeded or recorded evidence. |
| V0.7 | Platform Control Center: organization/dealership/location scopes, onboarding, entitlements, feature flags, integration health and audited support foundations. |
| V0.8 | Production polish: accessibility, responsive behavior, SEO/structured data, loading/error states, event naming, test coverage and launch QA. |
| V0.9 | AWS-ready integration boundary: BFF/API contracts, OpenAPI, health endpoints and documented API Gateway/Aurora/S3/EventBridge/SQS/Cognito/CDK path without coupling UI to infrastructure. |
| V1.0 | Proof-of-Engine feature complete: the reference path works from acquisition/discovery through conversion, lead operations and trustworthy reporting on the shared multi-tenant architecture. |

## V1 boundary

V1 is the used-car Automotive Commerce & Growth Engine. Workshop/service, spare-parts operations, customer garage, insurance, billing, native mobile apps, advanced AI sales assistant, deep DMS/CRM integrations, full lender/valuation integrations and full self-service SaaS onboarding remain future modules.

## Release rule

The UI must continue to depend on typed domain/application contracts rather than a specific database or vendor. Deterministic business data is authoritative, customer browsing/enquiry does not require an account, and AI remains assistive rather than consequential.
