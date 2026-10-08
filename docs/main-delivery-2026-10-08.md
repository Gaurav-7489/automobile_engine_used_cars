# VandLabs Automobile Engine — Main delivery report

8 October 2026. **All four development increments are merged into `main`.** This report certifies the scope tested below; the full ecosystem and production deployment remain incomplete.

## Repository and merge record

Previous main: `dbee80f13133ddbf3b8e93f00cae9a316e190156`.
Tested merged software commit: **`de24fa90afe85af992f022081fcc361e9e4cb7be`**.
Full merged tree: `4b1f82ab332f08285e751c146e203c00e0130c1a`, identical to PR #14 head `2c5ea42dacf3468f177149fafcc29d8e66cdac0b`. Subsequent delivery documentation changes no application code. Across the software delivery, 84 files changed with 2,196 insertions and 366 deletions.

| Merged PR | Delivered scope | Merge commit |
|---|---|---|
| [#11](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/11) | Connected demo, appointments, verified sales and inventory evidence | `72f79044e241e0a998c052d45bd2485e4e8b40f5` |
| [#12](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/12) | Canonical draft stock, CSV preview/import and publication guards | `a9f8d43c22010d95f1bc31c19031b51863c90597` |
| [#13](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/13) | Verified stock costs, capital operations, inventory versions and truthful diagnostics | `bc3cebd6cfb2e6785a0321a8d762e5e698dd12e7` |
| [#14](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/14) | CRM optimistic versions, atomic demo workflows, task locking and provider holds | `de24fa90afe85af992f022081fcc361e9e4cb7be` |

Normal merges preserve history. Expected-head checks protected publication; no force push or unrelated overwrite was used.

## Implemented and verified

Customer enquiries retain vehicle and source context, create persisted leads and internal first-response tasks, and feed staff ownership, notes, stages and reporting. Appointments/test drives and verified sales persist. Recording a verified sale withdraws the vehicle and closes open follow-ups atomically.

Inventory operations include manual draft creation, canonical metadata/images, validation, duplicate checks, CSV preview and atomic import, availability/publication guards and audited changes. Capital operations record verified acquisition costs and amendments, acquisition ageing, covered active/aged capital, explicit holding assumptions and recorded sales contribution. These figures do not substitute invented market profitability for missing cost evidence.

Browser and desktop clients send expected versions for inventory, leads and tasks. Stale changes receive HTTP 409. Tenant-scoped authorization, explicit capital permissions, forced PostgreSQL RLS and transaction audit records protect operational data. Demo enquiry/lead/audit/automation writes are atomic. Consent holds and unconfigured messaging-provider holds are distinct; no unsupported message delivery is claimed.

Detailed implementation: [inventory intake](inventory-intake.md), [capital operations](capital-operations.md), [CRM consistency](crm-conflict-safety.md), [production runtime](production-runtime.md).

## Test evidence

**Fresh main Quality Gate [37804149388](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37804149388) passed at software commit `de24fa90afe85af992f022081fcc361e9e4cb7be`.** Job `113403880528` completed successfully; its logs confirm the counts below.

| Command/check | Result on merged main |
|---|---|
| Frozen dependency install and demo preflight | Passed |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test:security` | 18 passed, zero failures |
| `pnpm test:database` | 4 passed, zero failures; persistence, demo atomicity and CSV regressions |
| `pnpm test:intelligence` | 5 passed, zero failures |
| `pnpm build` | Four applications built successfully |
| `pnpm test:e2e` | 62 passed; Chromium and mobile WebKit |
| `pnpm test:auth:e2e` | 14 passed; staff HTTP access |
| AWS infrastructure build and CDK synthesis | Passed; no cloud deployment |

GitHub quality environment: Ubuntu, Node 22, pnpm 10.17.1. Local verification used Linux, Node 24.19.0 and pnpm 10.17.1. The three-app demo returned HTTP 200; a synthetic enquiry created real active-adapter lead/task records, staff edits persisted, and stale lead/task edits returned 409. Demo shutdown released all ports.

Database regressions use embedded PostgreSQL/PGlite rather than a deployed Aurora cluster. WebKit mobile tests emulate devices. Local browser download was unavailable; complete browser acceptance ran in GitHub Actions. CDK synthesis proves template generation, not deployed recovery/monitoring certification.

## Windows and macOS artifacts

[Native build run 37797373869](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37797373869) passed Rust tests and Tauri packaging on native Windows/macOS runners at `2c5ea42dacf3468f177149fafcc29d8e66cdac0b`, whose complete tree matches merged main software. [Quality Gate 37797374150](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37797374150) also passed that revision.

- [Windows x64 NSIS .exe artifact archive](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37797373869/artifacts/11559737221)
- [Universal macOS .dmg artifact archive](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37797373869/artifacts/11558913314)

Extract the matching archive and install on the target OS. These are **unsigned development installers**. Installed-client acceptance against a real shared HTTPS/Cognito backend, Windows signing and Apple signing/notarization remain open. Configure the Command Center HTTPS origin, Cognito domain and desktop client ID; credentials use the OS credential store. Never embed database/cloud secrets in client settings.

## Pull and run

Preserve unrelated local edits before switching branches. Use Node 22 or later.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install --frozen-lockfile
pnpm demo
```

| Application | Local URL |
|---|---|
| Dealership website | http://127.0.0.1:3000 |
| Dealer Command Center | http://127.0.0.1:3001/command |
| Capital operations | http://127.0.0.1:3001/command/capital |
| VandLabs Platform | http://127.0.0.1:3002/platform |

Keep the launcher terminal open; stop with Ctrl+C. Reference authentication must remain on loopback. Use synthetic demonstration data. Native staff operations require the configured shared authenticated backend.

Before shared-backend rollout, apply migrations **0003 and 0004** and provision application-role grants following production-runtime.md. Grant explicit capital-read/write permissions. Deploy matching APIs and clients together: inventory/lead/task mutations require `expectedVersion`.

## Independent acceptance states

| Area | Current status |
|---|---|
| Connected reference demo | Local launch and automated customer-to-dealer workflows verified |
| Core operations | Expanded and tested; entire product specification remains open |
| Desktop | Native tests/packaging passed; installed shared-backend acceptance open |
| Staging | AWS templates synthesized; no deployed staging acceptance |
| Intelligence | Deterministic evidence and capital tested; advanced AI/market open |
| Platform administration | Runtime diagnostics delivered; durable control plane unfinished |
| Production | Not deployed or certified |

External dependencies: AWS identity/account and approved spend; private Aurora connectivity; HTTPS origins and Cognito staff configuration; signing/notarization identities; authorized messaging/AI providers and licensed market sources. Secrets must be supplied through secure account/environment configuration, never pasted into chat.

Unfinished software includes full staff/tenant/entitlement/onboarding/support administration, accounting and sale reversals, direct XLSX/media/external reconciliation scope, advanced AI Gateway/evaluations and market ingestion/analysis. Continue these as tested increments against the locked specification. See [completion register](source-of-truth-completion-register.md).

No production deployment, cloud resource creation, destructive live-data operation or consequential real-customer action was performed.
