# Automobile Engine — Source-of-truth completion register

Date: 2026-10-08
Status: **NOT COMPLETE / NOT PRODUCTION CERTIFIED**
Sources: user's *75 Locked Product + Architecture Decisions* (Decisions 01–75), *VandLabs Used-Car AI Ecosystem Master Blueprint* (October 2026, 56 sections), and current code/docs as reviewed. This register documents what can be grounded from repository evidence; it is not a successful test report.

## Contract: what must be shipped

- The core first release is **Automotive Commerce & Growth Engine**, not workshop ERP, generic vehicle garage or parts marketplace (75 Decisions 47–51, 56, 72).
- Core operational proof: Inventory → Discovery → VDP → Enquiry → Lead → Qualification → Follow-up → Appointment/Test Drive → Sale/Outcome → Reporting (Blueprint §§02, 16, 37–40, 49).
- Strong tenant isolation and scoped staff permissions are non-negotiable (Decisions 19, 55, 65, 70, 74; Blueprint §§32, 34–36).
- AI recommendations are assistive with evidence and human review. No invented stock, finance approval, valuation, prediction or external integration (Decisions 52–54; Blueprint §§13–15, 17–21, 28).
- Live market data must come from permissioned/licensed APIs/feeds (Blueprint §31). No unauthorized marketplace scraping.
- Windows/macOS native apps must use the same secured online source of truth as staff/browser, without embedded secrets (see `docs/production-runtime.md`).

## Evidence-based gap register (not a count of finished features)

| Workstream | Repo evidence | Remaining acceptance gap |
| --- | --- | --- |
| Public website / inventory / VDP | `apps/web`, V1 E2E in `tests/e2e/smoke.spec.ts` | Rerun browser/mobile QA for current commit, inspect media, UX, performance, SEO |
| Enquiry/attribution | BFF / lead and event E2E smoke tests | Demonstrate real end-to-end lead persistence and consent rules under deployed staging |
| CRM / follow-ups / automation | `apps/command-center`, lead/task tests; `docs/roadmap.md` V1.5–V2 | Confirm roles, no duplicate follow-ups, full stage transitions and dealer workflows in live environment |
| PostgreSQL tenant persistence | `docs/production-runtime.md`, migrations, RLS and embedded-DB tests | Deploy staging database; migrate; verify real connectivity, cross-tenant denial, backup/restore |
| Staff identity | Cognito auth flow and security tests per `docs/staff-authentication.md` | Provision test staff; verify actual Cognito login, refresh, logout, permissions and MFA policy |
| Native Windows/macOS | `apps/desktop`, `.github/workflows/desktop-build.yml` | Confirm OS-runner tests/artifact builds; install and exercise real authenticated client; signing/notarization later |
| Platform control | `apps/platform` reference screens, admin access gates | Real tenant provisioning, roles administration, billing and operational support are not production services |
| Intelligence / capital | `/command/intelligence`: deterministic stock validation, task briefing, price history and exact matching | Verified acquisition/cost register implemented in PR #13; full accounting ledger, provider-backed AI and licensed market intelligence remain unfinished; record age remains distinct from acquisition age |
| Market Radar / external data | Integration contracts & reference adapters in V2.5 | Obtain licensed feeds, approvals and credentials; add ingest normalization, reconciliation and freshness checks |
| External channels | Internal automation tasks only per `docs/production-runtime.md` | Provider-approved WhatsApp/SMS/email integrations, consent and delivery receipts; no fake send claims |
| Deployment / operations | AWS CDK and QA workflow | Deploy isolated staging; domains/HTTPS/WAF/secrets/observability/alerts/backups; incident rollback drills |

## Delivery order and hard acceptance gates

### Release D0 — reproducible reference demo
- `pnpm install --frozen-lockfile`; `node scripts/start-demo.mjs --check`; `pnpm demo`.
- Quality Gate GREEN on exact commit (lint, typecheck, security, embedded PostgreSQL, build, Playwright desktop, auth E2E, CDK synthesis).
- Presenter walkthrough confirms a *new* public enquiry appears in staff app with chosen vehicle and journey context; stage, note, follow-up and outcome persist.
- Record SHA, run URL and screenshots. Reference data must be labeled demo.

### Release D1 — authenticated shared staging
- Deploy AWS staging CDK stack and secure staff origins; use `AUTH_MODE=cognito` and `DATA_MODE=aurora` only after verified setup. No demo auth on internet-accessible staff apps.
- Provision test dealer and staff scopes; transactional RLS enforced.
- Execute same vehicle enquiry in browser and open it in native desktop app. Mark a vehicle sold in desktop and verify website availability; retry and tenancy tests.
- Rehearse database restore, integration failure, expired login and bad network conditions.

### Release D2 — customer-ready pilot
- Record consent/retention policies, real dealership data approval, lead response ownership, source attribution and truthful reports.
- QA on Chrome/Safari/Firefox/iPhone/Android, accessibility, loading/SEO and security.
- Explicit user approval before release to a customer domain.

### Release D3 — advanced intelligence
- Inventory quality/aging/capital: deterministic formulas first, transaction audit history, source/confidence badges, human approval of price changes.
- Matching, lead rescue, grounded conversational support: controlled pilots with permissions, retrieval evidence, error thresholds and human handoff.
- Market comparisons/radar: enabled **only after** approved source coverage and comparable normalization; no scraping or fabricated market values.

## Release tracking template

For each gate, record: `commit_sha`, `CI_run_url`, `environment`, `date`, `test_result`, `evidence`, `open_defects`, `owner`, `release_decision`.

**Current state (8 October 2026):** connected demo code `fe023bab294f39265726619b018dd3dee6f303bb` passed [Quality Gate 37736586479](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37736586479): 52 Chromium/mobile WebKit cases, 14 staff HTTP denial cases, local security/PostgreSQL/evidence checks, builds and staging synthesis. PR #11 adds persisted appointments, verified sale records, atomic stock withdrawal and inventory evidence. Full ecosystem and deployed staging are not complete. See `release-2026-10-08.md` for exact scope and open implementation work.

## Scope and decision rule

Respect all 75 decisions. Separate **implemented** from **tested** and **deployed**. Feature development should not skip D0 and D1 acceptance. The 94-page Blueprint expands beyond the locked V1 boundary; implement its advanced modules as staged products, not as unproven features inside the demo.

## Inventory intake increment

`feat/inventory-ingestion` adds canonical draft entry, detail/image editing, CSV validation/preview/atomic insertion and creation/update audit evidence. Exact PR checks govern acceptance. Direct XLSX, external reconciliation and complete economic/administration modules remain unfinished; see `inventory-intake.md`.

## Verified capital increment

`feat/capital-operations` adds role-scoped stock costs, versioned amendments, acquisition ageing, recorded active/aged capital, holding assumptions and sale contribution evidence, plus shared native cost operations. Migration 0004 and explicit capital permissions are required. Platform telemetry now distinguishes configuration from health and hides reference control-plane data in production. General ledger, full staff/control-plane administration, AI/market providers and deployed staging remain open; see `capital-operations.md`.

## CRM consistency increment

`feat/crm-conflict-safety` adds lead/task version checks in both clients, atomic demo enquiry/lead/audit/task/automation writes, sale-closed task guards and parent-first task locking. Consent and provider holds are distinct. Exact-commit PR checks determine acceptance; see `crm-conflict-safety.md`.

CRM code `24d277222faead4c7f4f506d02d58aedf89d7ec6` passed [Quality Gate 37795985929](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985929) with 62 browser and 14 auth cases, plus [Windows/macOS packaging 37795985649](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985649). See [release evidence](release-crm-2026-10-08.md). No staging or production certification is implied.

## Merged main delivery — 8 October 2026

PRs #11–#14 are merged into main at software commit `de24fa90afe85af992f022081fcc361e9e4cb7be`. Fresh [main Quality Gate 37804149388](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37804149388) passed all checks (62 browser, 14 auth HTTP, 18 security, 4 database/demo/CSV, 5 intelligence, builds and AWS/CDK). Native tests and packaging passed at an identical full tree. See [main delivery report](main-delivery-2026-10-08.md). The older increment reports are historical; staging, installed native acceptance and full ecosystem/production completion remain open.

## Connected Platform increment — 9 October 2026

Durable Platform hierarchy/operational counts, staff grants with immediate database-registry revocation, role/scope controls, assigned-lead salesperson restrictions, version conflicts and atomic platform audit are now implemented. Migration 0005 and application-role grants are mandatory. Real-tenant hierarchy/internal-rule provisioning is an atomic migration-admin command; full cloud onboarding/billing/offboarding remain open. Verified TLS, serverless pool controls, readiness APIs and a redacted CLI doctor are included. Five complete shared source documents are archived with hashes under specifications/.

Local lint/typecheck, four builds, 23 security, 6 database/provisioning and 5 intelligence regressions passed. Full exact-revision browser/native CI acceptance and publication are recorded in the current checkpoint. Vercel lacks shared database/Cognito/tenant settings; AWS identity/connectivity and real live acceptance remain external blockers. The full ecosystem is not complete. See release-2026-10-09.md and shared-staging-setup.md.
