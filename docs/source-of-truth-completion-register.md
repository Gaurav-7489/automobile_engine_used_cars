# Automobile Engine — Source-of-truth completion register

Date: 2026-10-10
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
| Public website / inventory / VDP | `apps/web`, connected discovery E2E, V1 smoke and distribution/responsive cases | 82 current-revision browser/API cases passed; inspect actual dealership media, broader browsers, accessibility, performance and SEO |
| Enquiry/attribution | BFF / lead and event E2E smoke tests | Demonstrate real end-to-end lead persistence and consent rules under deployed staging |
| CRM / follow-ups / automation | `apps/command-center`, lead/task tests; `docs/roadmap.md` V1.5–V2 | Confirm roles, no duplicate follow-ups, full stage transitions and dealer workflows in live environment |
| PostgreSQL tenant persistence | `docs/production-runtime.md`, migrations, RLS and embedded-DB tests | Deploy staging database; migrate; verify real connectivity, cross-tenant denial, backup/restore |
| Staff identity | Cognito access verification, persistent scoped grants, assigned-only sales access and immediate database-registry revocation | Provision test staff; verify actual Cognito login, refresh, logout, permissions and MFA policy |
| Native Windows/macOS | Shared native workspace, HTTPS discovery, OS-runner regression/packaging checks and automatic source-bound development release pipeline | Both native packages and three Rust regressions per OS passed; install and exercise a real authenticated client; signing/notarization and live discovery acceptance remain open |
| Platform control | Shared hierarchy/counts, persisted staff administration, version conflicts and atomic append-only audit; validated real-tenant provisioning CLI | Live cloud provisioning and acceptance, full role/approval policy, billing/offboarding and operational support services |
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

PR #16 merged the 9 October increment at `60e54d03640a8c4d53e57af97020c8c54848427b`. Its full tree matches final candidate `732a70f293fa484e5d04b43a24d8829eddba38c4`, which passed Quality Gate 37885410416 and native packaging 37885410463. See [9 October delivery](main-delivery-2026-10-09.md). Later checkpoint edits are documentation only.

## Premium experience and desktop distribution increment — 9 October 2026

PR #17 merged at `6fbcc2fb985bb1d77f48848dc8b3faa767bd75a2`. Main Quality Gate 37903295767 passed 72 browser/API and 22 auth HTTP cases, 27 security, 6 database/provisioning and 5 intelligence regressions, four builds and AWS/CDK synthesis. Candidate native run 37902240161 passed both OS installers and three Rust tests per OS. The photographic public showroom, redesigned staff/desktop surfaces, workspace discovery, bounded public requests, shared Redis limiter adapter and automatic development release pipeline are implemented. Three refreshed protected previews are READY. Detailed evidence and release state are in [premium-experience-distribution.md](premium-experience-distribution.md).

Production Aurora/Cognito/Redis settings and live acceptance are still absent. The limiter's mocked-provider checks do not establish a deployed Redis service. Development installers are unsigned; signing/notarization, installed real-backend acceptance and the advanced blueprint gaps above remain open.

## Creative public website increment — 10 October 2026

PR #18 adds a colour-led showroom, keyboard-accessible featured-car selector, original Skiper/21st-inspired CSS interactions and footer/preview-role accessibility fixes. Candidate Quality Gate 38024643071 passed all 74 browser/API cases, including keyboard selection and footer contrast, plus 22 auth HTTP and the existing security/database/build checks. Its full tree matches software merge `9de26cca8865a2c007e12719423684e7ea1e30d1`. The main public preview is refreshed with existing SSO retained. See [creative delivery](creative-showroom-2026-10-10.md). Live backend activation, full accessibility/load acceptance and the advanced blueprint gaps remain open.

## Minimal showroom refinement — 10 October 2026

PR #19 implements the latest Apple-inspired direction, superseding the earlier bright colour system. Tested candidate `5d418c4eeba2a42ad338def57b35992b2d44d49e` and software merge `4b8df8b59ab0f4f13f5ad5756a0d8fadb7908930` share full tree `79556511f69f95b028cccfeb27ef24a06576b212`. Quality Gate 38031729368 passed 74 browser/API and 22 staff HTTP cases, lint, all four application typechecks/builds, security/database/intelligence checks and AWS/CDK synthesis. Desktop/mobile evidence was inspected. Only the public web visual system changed; shared live backend and broader production gaps remain open. See [minimal showroom delivery](apple-minimal-showroom-2026-10-10.md).

## Connected public experience — 10 October 2026

PR #20 adds tenant-scoped browser shortlist state across public pages, URL-restored inventory tools, interactive differences-only comparison, complete validated shortlist-to-lead handoff, contextual contact intents, accessible vehicle photography and an interactive desktop product tour. The Apple-inspired palette is retained with restrained original Skiper/21st-inspired motion and reduced-motion support. Tested candidate `ffee4f66337f899a42f7ad73b51e947abb69f1dc` and software merge `163f34828816e4d2b0349641c7845b0b22f9ddc5` share full tree `d6b11e3fd7a6cc827375414ca48fdf199a9531c2`. Quality Gate 38035412278 passed all 82 browser/API, 22 staff HTTP and existing security/database/intelligence/build/CDK checks. Desktop/mobile evidence was inspected.

Production deployment `dpl_FvooM1B8mLiB5TQTbA52ns341xQL` is READY at https://vandlabs-automobile-web.vercel.app/ from this software merge. Six authenticated page checks returned 200; contact/vehicle forms retain the disabled read-only state, and existing SSO is preserved. The hosted reference website is published; shared live backend operation and installed native acceptance remain open. See [connected public experience](connected-public-experience-2026-10-10.md). Full ecosystem status remains NOT COMPLETE / NOT PRODUCTION CERTIFIED.
