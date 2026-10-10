# Spreadsheet inventory intake delivery — 10 October 2026

[PR #21](https://github.com/Gaurav-7489/automobile_engine_used_cars/pull/21) is merged into `main` at software commit `037c7cab0cd98c1ef350da3cb6765f0d37d07f8d`. Its full tree `d9a1c29a2b56c9270349fc578f7c34605ef58b24` matches accepted candidate `d0e29f0647fe4cca2dfa14e64ca2e7dbd01af466`. Later evidence commits change documentation only.

## Delivered behavior

Command Center → Inventory now accepts direct `.xlsx` workbooks and UTF-8 CSV. Staff can download generated Excel/CSV templates, use Excel dropdowns and its separate Guide, see row/field validation errors, download a redacted error report and inspect the full batch before acknowledging review and importing drafts. Changing file or destination clears preview and acknowledgement. The file input has an explicit accessible label and separate help text. The workflow was inspected on desktop and mobile.

Imports use the existing canonical preview/commit API, stock uniqueness checks, authorized destination scopes and atomic records/audits. New vehicles remain unpublished drafts; source metadata distinguishes `xlsx` and `csv`. Preview makes no writes. Publication remains a separate existing action. Existing CSV/native callers remain compatible and no new database migration is required.

Excel parsing is isolated in server-side package subpaths. It bounds compressed files, ZIP entries/expansion, actual decompressed bytes, XML depth/nodes/strings, worksheet positions and vehicle count. It never evaluates formulas, resolves XML entities, follows workbook links, fetches URLs or extracts files. Formula, macro, embedded object, external workbook relationship, hidden inventory row/column, merged cell, date/time/error cell and unsupported content are rejected. Numeric identity cells are rejected to preserve leading zeros. Date checks include inherited/default styles. Authenticated destination permissions are checked before decompression. The template route requires inventory read access, returns private/no-store attachments and contains no dealer/customer data.

See [inventory intake contract](inventory-intake.md), [OpenAPI](openapi.yaml) and the parser regressions for exact limits and fields. S3 media processing and licensed-source reconciliation remain outside this increment.

## Acceptance evidence

[Candidate Quality Gate 38047866346](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38047866346) passed every step:

- 86 Chromium desktop/mobile WebKit browser/API cases.
- 23 staff HTTP permission/configuration cases.
- 27 security, 10 database/parser and 5 intelligence regressions.
- Lint, all four application typechecks/builds and AWS/CDK synthesis.

Browser cases cover Excel template → invalid row → unchanged snapshot → reviewed commit → source/audit → separate publication, duplicate/scope/ambiguous-file rejection and file/location preview invalidation. Parser regressions include Unicode, shared/rich text, leading-zero IDs, renamed workbook relationships, booleans, formulas, macros, links, date styles, malformed XML, hidden/extra data and forged ZIP directory sizes. An independent openpyxl 3.1.5 template open/save/parse round trip also passed.

Browser artifact `11668142844` has archive SHA256 `4636b538eb9f0a786d310e9743c7a750e077f005f78d03503d70bfa04346cf01`. Its archive checksum was verified and desktop/mobile intake/review screenshots were visually inspected.

[Native candidate run 38047866343](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38047866343) passed Windows x64 and universal macOS packaging, with three Rust regressions on each OS. These are unsigned development distributions; no signing/notarization or installed live-backend acceptance is implied. Native intake UI remains CSV/manual; this increment adds Excel to Command Center.

Merged-main [Quality Gate 38048490987](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38048490987), attempt 2, passed every step on the identical software tree. Attempt 1 had two transient duplicate-element strict-locator failures on public inventory load/reload; all Excel workflow cases passed. The failure snapshots exposed one accessible inventory and the retry passed without a source change. This successful rerun is recorded explicitly rather than treating the first attempt as green.

The successful main rerun browser archive is artifact `11668292753`, SHA256 `1d399c2972344ae3348b873d752346df4aeeb6e2a285485b0e69e234a0c0f7be`. This is distinct from the first failed attempt's archive. Candidate screenshot inspection above supplies visual acceptance.

The successful main gate triggered [automatic development release run 38049096394](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38049096394), still in progress at this checkpoint. New installer publication is not claimed until that run publishes a verified source-bound release; existing published development downloads remain available.

## Deployment and smoke checks

All three deployments below are READY from the software merge. Stable public/main-preview URLs resolve to those deployment IDs and source commit.

| Surface | Deployment | URL |
| --- | --- | --- |
| Public website, production | `dpl_39k5bWcbv9bjzbY3XdWixmS8FmMk` | https://vandlabs-automobile-web.vercel.app/ |
| Dealer Command Center, protected preview | `dpl_95UWNKhrqmaH6ydRootQ2ZzvDnCX` | https://vandlabs-automobile-command-git-main-gaurav-7489s-projects.vercel.app/command |
| Platform, protected preview | `dpl_9LkS5kZ3uctUXHRMdYJC9WiqpUD7` | https://vandlabs-automobile-platform-git-main-gaurav-7489s-projects.vercel.app/platform |

Authenticated Vercel HTTP checks returned 200 for public home/inventory/contact/download/health and both staff login pages. Public reference notices and disabled contact fieldsets are retained. Staff login pages explicitly report missing sign-in configuration. All projects retain SSO protection for all deployments. A deployment-only ignored-build override permitted the authorized refresh; no persistent protection or environment settings were changed.

The protected template URL smoke fetch could not complete through the Vercel helper: it reported authentication required after redirect. This is not evidence that the application template endpoint was reached. Its anonymous and forged-access rejection is established by the accepted staff HTTP tests; successful authenticated downloads and imports are established by browser/API tests against the connected demo.

## Remaining activation and completion gates

Hosted inventory writes and customer enquiries remain inactive until the shared AWS/Aurora/Cognito/tenant/Redis configuration is connected and real-tenant acceptance passes. Do not enable isolated serverless file persistence or weaken staff permissions/SSO to make the preview appear live. Follow [shared staging setup](shared-staging-setup.md).

The full ecosystem remains **NOT COMPLETE / NOT PRODUCTION CERTIFIED**. Open gates include live cloud operation/restore/monitoring, S3/media, licensed feeds/provider messaging, AI activation, accounting/reversals, SaaS billing/entitlements/offboarding/support and native signing/notarization/installed HTTPS-Cognito acceptance. The original locked AWS architecture and archived specification sources remain authoritative.
