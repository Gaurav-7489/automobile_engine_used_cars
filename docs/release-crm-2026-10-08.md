# CRM consistency release — 8 October 2026

## Repository and verified code

[PR #14](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/14), branch `feat/crm-conflict-safety`, builds on capital PR #13, inventory intake PR #12 and connected demo PR #11. These are reviewable, unmerged changes. Main was not overwritten.

Exact code commit: `24d277222faead4c7f4f506d02d58aedf89d7ec6`.
Code tree: `58c06ebad783fb2138df99eeadebe09cf20693be`.

[Quality Gate 37795985929](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985929) passed on GitHub Ubuntu / Node 22 / pnpm 10.17.1:

| Check | Result |
| --- | --- |
| Lint and typecheck | Passed |
| Security regressions | 18 passed |
| Database, demo and CSV regressions | 4 passed |
| Inventory/capital intelligence | 5 passed |
| Website, Command Center, Platform and desktop asset builds | All four passed |
| Chromium and mobile WebKit browser suite | 62 passed |
| Staff authentication HTTP suite | 14 passed |
| AWS TypeScript and staging CDK synthesis | Passed; no deployment |

[Browser evidence](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985929/artifacts/11559175582) belongs to this exact code commit. Mobile WebKit uses device emulation, not physical-device acceptance. Database tests use PGlite and do not certify deployed Aurora networking, backup recovery or live Cognito accounts.

Local Linux / Node 24.19.0 passed lint, typecheck, security/database/intelligence, all four builds and 14 HTTP authentication tests. Full browser acceptance ran on GitHub because local browser binaries were unavailable. Local `pnpm demo` verification started all three apps, created a synthetic enquiry with its first-response task, persisted the current lead/task changes, rejected stale changes with HTTP 409 and released all ports on shutdown. Later evidence-only commits do not change application code.

## Changes and business behavior

Two staff screens can no longer silently overwrite each other's lead notes, stage or ownership. Lead and follow-up PATCH require the snapshot's `expectedVersion`; legacy records start at 0. Missing/malformed versions return 400; stale versions return 409 without writes. The browser preserves the unsaved note draft and provides an explicit reload/review action. Desktop submits the same record versions and supports Refresh after a rejected action.

Confirmed sales advance lead/stock versions and version each newly closed task. Sale-closed tasks retain `closedBySaleId` and cannot be reopened by ordinary task operations. Previously completed work retains its state; separately created aftercare tasks remain separate operations.

PostgreSQL follow-up mutations lock the parent lead before the task, matching sale confirmation. Audit failures roll back mutations. Demo enquiries, lead updates, automation runs, tasks and audits now commit in one atomic state replacement. An automation failure rolls the entire operation back. The legacy website automation exports delegate to this shared implementation.

Missing consent and unconfigured providers are distinct outcomes. WhatsApp rules with missing required consent record `skipped_consent`; other WhatsApp rules record `skipped_provider` while delivery is unavailable. Neither creates a delivery task or claims a message was sent. Duplicate internal task prevention remains tenant/lead/rule/trigger scoped.

See [CRM operations](crm-conflict-safety.md), [architecture](architecture.md), [capital operations](capital-operations.md) and [inventory intake](inventory-intake.md).

## Run the latest local demonstration

From an existing checkout, preserve unrelated local edits before switching:

```bash
git fetch origin
git switch --track origin/feat/crm-conflict-safety
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install --frozen-lockfile
pnpm demo
```

If the branch already exists locally, use `git switch feat/crm-conflict-safety` and `git pull --ff-only origin feat/crm-conflict-safety` instead of creating it again.

Website: `http://127.0.0.1:3000`. Command Center: `http://127.0.0.1:3001/command`. Platform: `http://127.0.0.1:3002/platform`. Capital: `/command/capital`. Use synthetic reference data; demo authentication remains loopback-only. Stop with Ctrl+C.

No new database migration is required by this increment; versions and sale-closure evidence live in existing payloads. The preceding capital increment requires migration 0004 and explicit finance capability grants. Deploy matching API/browser/native clients together; older clients omit required lead/task versions and receive 400.

## Independent acceptance

| Area | Status |
| --- | --- |
| Connected reference demo | Automated customer-to-dealer-to-sale workflow passed |
| Core operations | Inventory/intake, CRM tasks/visits/sales, scopes, costs and consistency tests passed; full product scope remains open |
| Desktop | Shared authenticated APIs implemented; native compilation/packaging evidence recorded below; installed shared-backend acceptance still required |
| Staging | Infrastructure synthesis passed; not deployed |
| Intelligence | Deterministic matching/evidence and recorded capital tested; advanced provider AI/market modules unfinished |
| Platform administration | Protected runtime diagnostics; durable staff/tenant/entitlement/onboarding/support administration unfinished |
| Production | Not deployed or certified |

External dependencies remain AWS identity/account and approved expected spend, shared HTTPS/private Aurora/Cognito configuration, signing/notarization identities and authorized provider/licensed market connections. Full administration, accounting/reversals and advanced intelligence also remain unfinished software scope. No production/customer action or cloud resource creation was performed.

## Native artifacts

[Desktop run 37795985649](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985649) passed Windows/macOS typecheck, asset builds, Rust regression tests and Tauri installer packaging at `24d277222faead4c7f4f506d02d58aedf89d7ec6`.

- [Windows x64 NSIS .exe](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985649/artifacts/11558931587)
- [Universal macOS .dmg](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37795985649/artifacts/11559296269)

These are unsigned development installers. Extract the GitHub artifact archive and install on the matching operating system. Configure the shared Command Center HTTPS origin, Cognito domain and desktop client ID. No cloud/database secret belongs in the client. Installed-client authentication/workflow acceptance and production signing/notarization remain unverified.
