# Capital operations release — 8 October 2026

## Delivery and exact tested revision

[PR #13](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/13) builds on [inventory intake PR #12](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/12) and [connected demo PR #11](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/11). These branches are reviewable and unmerged; main has not been overwritten.

Code commit: `7fcbecdd8e952cf55eff6cf2518a50210bf877a0`.
Tree: `2208b37033b46530504762eb7deef435c00f6db2`.

[Quality Gate 37743133276](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37743133276) passed: lint, typecheck, 18 security cases, 3 database/CSV cases, 5 intelligence cases, four application builds, **60 Chromium/mobile WebKit cases**, 14 staff HTTP access cases, AWS infrastructure build and staging CDK synthesis. Environment: GitHub Ubuntu, Node 22, pnpm 10.17.1. WebKit mobile emulation is not physical-device acceptance. PostgreSQL tests use PGlite and do not certify Aurora networking/backup recovery.

[Browser evidence](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37743133276/artifacts/11534756609) includes screenshots and test output. Local Linux/Node 24.19.0 passed lint, typecheck, security/database/intelligence, all four builds and 14 HTTP auth cases. `pnpm demo` returned HTTP 200 from website, Capital and Platform health; the scoped snapshot returned 14 reference vehicles and cost arrays. A subsequent launcher preflight confirmed all three ports released after shutdown.

Report-only commits after this revision do not change tested application code.

## Implemented result

- Canonical manual draft entry and CSV preview/atomic import, normalized duplicate rejection, full detail editing, publication imagery validation and inventory audits from PR #12.
- Browser and native price/publication/availability updates and browser metadata edits require the current stock version. Missing versions return 400; stale edits return 409 without changing records. Confirmed sales advance the stock version too.
- Operators record verified purchase/reconditioning/transfer/other costs, acquisition dates, reference evidence and optional daily holding assumptions. Before/after amendments preserve actor/time/version and commit atomically with current records.
- Explicit finance capabilities and forced RLS protect cost records; other accounts receive no financial payload in snapshots. The desktop uses the same authenticated online API.
- Acquisition ageing stops at confirmed sale. Covered active/aged capital, asking spread, holding assumptions and recorded contribution derive from real entered costs. Missing records are unknown and counted. Contribution is not net profit; assumptions are not actual paid expenses.
- Platform configuration screens label missing monitoring, AI and market telemetry. Production mode hides illustrative tenant/onboarding/audit administration until real control-plane services exist.

## Install and operate

Use Node 22+ and pnpm 10.17.1. From an existing checkout with unrelated work safely committed or stashed:

```bash
git fetch origin
git switch feat/capital-operations
# If absent locally: git switch --track origin/feat/capital-operations
git pull --ff-only origin feat/capital-operations
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:3000`, `http://127.0.0.1:3001/command` and `http://127.0.0.1:3002/platform`. Capital is at `/command/capital`. Use synthetic data only for the reference demonstration; demo authentication stays on loopback. Stop with Ctrl+C.

For PostgreSQL, apply migration 0004 after 0003 and provision the application-role grants. Configure explicit capital permissions in the server-owned principal registry. Deploy the matching web/native clients with the required inventory `expectedVersion` API change. See [capital operations](capital-operations.md), [inventory intake](inventory-intake.md) and [shared runtime setup](production-runtime.md).

## Independent acceptance status

| Area | Verified delivery | Still required |
| --- | --- | --- |
| Reference demo | Connected enquiry → lead → tasks/visit → verified sale → stock withdrawal/reporting; browser and local launcher checks pass | Human presentation acceptance |
| Core platform | Persisted inventory/intake, lead operations, internal task automation, financial record scopes/audits and stale-write protection | Full staff administration, full accounting/reversal lifecycle, broader operational acceptance |
| Desktop | Shared API and secure native credential architecture; compile/packaging evidence below | Installed-client login and workflow against shared HTTPS/Cognito backend; production signing/notarization |
| Staging | Infrastructure builds and synthesizes | AWS identity/approved spend, secure app hosting/origins, Aurora/Cognito configuration, monitoring and restore drills |
| Intelligence | Evidence-based stock/matching/briefing and recorded capital formulas tested | Provider-backed AI Gateway, evaluations/usage, licensed market ingestion and advanced decision support |
| VandLabs Platform | Protected runtime diagnostics with explicit configuration limits | Durable tenant/staff/entitlement/onboarding/support control plane |
| Production | Not certified or deployed | Staging acceptance, security/recovery/performance/customer acceptance and explicit release approval |

Cloud/backend configuration, signing identities and provider/data agreements are external dependencies. Staff/control-plane administration, full accounting and advanced AI/market workflows are unfinished software scope, not merely missing credentials. No cloud resources, production release or real customer actions were performed.

## Native packaging verified on resume

[Native run 37743133252](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37743133252) passed Windows/macOS typecheck, builds, Rust tests and Tauri packaging at the exact code revision above.

- [Windows NSIS .exe](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37743133252/artifacts/11535112756)
- [Universal macOS .dmg](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37743133252/artifacts/11534489256)

Both are unsigned development distributions. Extract the artifact archive, then install. Shared HTTPS/Cognito backend acceptance and signing/notarization are still required. PR #13 is ready for review. Documentation checkpoint cc324b2 also passed Quality Gate 37743710599 and Desktop installers 37743710598.
