# Main delivery — 9 October 2026

[PR #16](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/16) is merged into main at `60e54d03640a8c4d53e57af97020c8c54848427b`. The merge tree `d4fa1594605cf1c9feddb655716b82a5b2d3dfaf` is identical to tested candidate `732a70f293fa484e5d04b43a24d8829eddba38c4`. Subsequent checkpoint commits update documentation only. All recovered specifications and the operating guides are in the repository.

## Changes

Platform now reads the same organization hierarchy and stock/lead/task/sale records as the website and Command Center. Persistent staff grants have role, tenant, dealership and location scopes; salespeople see assigned leads only. Authentication checks database grants on every verified request, so disabling a grant overrides stale ordinary environment permissions. Grant changes use version conflicts and atomic append-only audit. Platform bootstrap administration is separately server-owned.

Deployment fixes preserve staff base paths and show an explicit missing-sign-in state. Hosted reference previews reject operational writes. Readiness endpoints and a redacted doctor distinguish configuration from actual tenant reads. PostgreSQL connections verify TLS, prevent SSL URL overrides and bound pool/timeouts. Real-tenant provisioning validates UUID hierarchy/configuration and refuses overwrite. Production Cognito MFA is required in CDK.

## Verified results

[Quality Gate 37885410416](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37885410416) and [installer run 37885410463](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37885410463) passed on the exact candidate above.

| Check | Result |
|---|---|
| Lint and types | Passed |
| Security | 23 passed |
| PostgreSQL/reference/provisioning | 6 passed |
| Intelligence | 5 passed |
| Web, Command, Platform and desktop frontend builds | 4 passed |
| Desktop Chromium and mobile WebKit browser/API cases | 68 passed |
| Anonymous/forged staff HTTP denial and base-path regressions | 22 passed |
| AWS TypeScript and staging CDK synthesis | Passed; no cloud resources created |
| Windows/macOS Rust | 2 tests passed per OS |
| Windows NSIS and universal macOS packaging | Passed |

The database tests use PGlite, not a live Aurora cluster. Installer packaging does not establish installed HTTPS/Cognito acceptance, signing or notarization.

## Downloads

- [Windows installer artifact](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37885410463/artifacts/11595899313) — SHA-256 of artifact ZIP: `80786836cbd413031563ac82834b50e164ead2060c6823bcf95650040efbd6b5`.
- [Universal macOS artifact](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37885410463/artifacts/11596690054) — SHA-256 of artifact ZIP: `dcf917814c4a461e6f56880f8553262f25f2a14aa73e638f887e2f33f93bd21d`.
- [Browser evidence](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/37885410416/artifacts/11596261584).

GitHub artifact downloads require repository access and expire on 7 January 2027. These are development distributions.

## Protected preview targets

Refreshed from the merged source. Build status and logs are available in the corresponding Vercel project; access protection is retained. No promotion to an operational customer release is claimed.

| App | Preview |
|---|---|
| Website | https://vandlabs-automobile-2vkzfl978-gaurav-7489s-projects.vercel.app/ |
| Command Center | https://vandlabs-automobile-command-jl17jt29q-gaurav-7489s-projects.vercel.app/command |
| Platform | https://vandlabs-automobile-platform-75pla7ei5-gaurav-7489s-projects.vercel.app/platform |

## Documentation

| Source or guide | Location |
|---|---|
| Full master blueprint | [specifications/master-blueprint.txt](specifications/master-blueprint.txt) |
| 75 locked decisions | [specifications/75-locked-decisions.txt](specifications/75-locked-decisions.txt) |
| Used car digital growth system | [specifications/digital-growth-strategy.txt](specifications/digital-growth-strategy.txt) |
| Master specification | [specifications/master-specification.txt](specifications/master-specification.txt) |
| Ecosystem overview | [specifications/ecosystem-overview.txt](specifications/ecosystem-overview.txt) |
| Original/extracted file hashes | [specifications/manifest.json](specifications/manifest.json) |
| Shared deployed runtime setup | [shared-staging-setup.md](shared-staging-setup.md) |
| Staff administration | [platform-staff-operations.md](platform-staff-operations.md) |
| Real dealership config shape | [tenant-config.example.json](tenant-config.example.json) |
| API contracts | [openapi.yaml](openapi.yaml) |
| Delivered and remaining scope | [release-2026-10-09.md](release-2026-10-09.md) |

## Remaining activation and ecosystem work

Inspection found only preview settings on the three Vercel projects. Shared database/network, tenant, Cognito, sessions and staff provisioning are absent. There is no AWS identity or database connection in this session. A connection string alone cannot reach the private Aurora VPC. Follow the setup guide in an authorized cloud environment, then prove new enquiry, assignment/revocation, confirmed sale, public delisting and native access against the same HTTPS backend.

Full cloud operations/restore/monitoring, installed signed distribution, media/XLSX, messaging and licensed feeds, AI Gateway/grounded assistants, accounting/reversals, billing/offboarding/support, runtime entitlements and finer approval policies remain unfinished. The complete blueprint and live shared-data acceptance are not certified by this delivery.
