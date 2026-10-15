# Dealership intelligence release tracker

Updated 15 October 2026. This is an evidence ledger, not a completion percentage.
The target is a B2B dealership subscription platform; the public vehicle storefront
is an optional distribution surface. No commercial production launch is claimed.

## Current baseline

- Main at audit: `2ef125750cd069f1981418ec9adc2d7bd922a571`.
- PR #23: open/draft, head `82690e9ae892957b0efef87df233a9ca0bb84747`.
- PR #24: open, head `27264996977a00acf5080a710e7d9152a744f10a`.
- Integration merged to main via PR #25 as `5d5da91ea60f22e95f6b67c81a82a9abd53fffcf`.
- Integration branch: `integration/dealership-cloudflare-neon-20261015`.
- Existing Vercel main deployment statuses: all three successful; this is build/
  hosting evidence, not authenticated production acceptance.
- Cloudflare: admission and dealer-AI Workers exist; full app/gateway cutover has
  not occurred. Billing/subscription API access returns authentication error.
- R2: eight buckets: four media/cache buckets each for production and staging. Production template buckets created
  successfully in APAC on 15 October. A synthetic storage API upload/read/delete passed. All four buckets have r2.dev disabled and no custom domains; app-authenticated upload/download acceptance remains pending.
- Neon: production, staging and isolated dealer-data-api branches exist. All
  operational tables inspected use forced RLS. Production/staging lacked the
  commerce migration at audit. The isolated branch and staging now have commerce
  and the runtime role grant correction through migration 0008. Production is not migrated by this integration work.
- Production runtime role: `vandlabs_runtime`, without superuser/BYPASSRLS.
  Staging also has an older `vandlabs_app` role with BYPASSRLS: never use it as
  an application credential. Runtime transactions explicitly reject such roles.

## Ordered delivery

| # | Task | Status | Evidence / remaining acceptance |
|---|---|---|---|
| 1 | Repository, cloud and deployment audit | Complete | Baseline above; video inspected |
| 2 | Reconcile PRs #23 and #24 | Complete | PR #25 merged as 5d5da91 after Quality Gate #101 and Cloudflare packaging #4 passed |
| 3 | Workers and R2 | In progress | Eight private buckets; storage API probe passed; PR #26 isolates staging deployment; billing not readable; apps not deployed |
| 4 | Three apps on pooled Neon | In progress | Staging migrated through 0008 and runtime RLS checked; live Worker transactions not accepted |
| 5 | Staff auth, MFA, RBAC and tenant isolation | Blocked | OIDC/Cognito foundation and denial tests; no accepted production staff identity/MFA setup |
| 6 | Real dealership onboarding | Not started | Validated CLI provisioning exists; real details and complete registration/invitation workflow required |
| 7 | Licensed data integrations | In progress | Source-bound ingestion and rights gates exist; no contracted feed; scheduled sync, history and richer rights lifecycle remain |
| 8 | Market Intelligence | Not started | Sourcing/API search exists; full comparable analytics, distributions and trends remain |
| 9 | AI Acquisition Planner | In progress | Budget/location/cost planner and three tier gates exist; licensed feed and live AI service acceptance missing |
| 10 | Profit and Capital | In progress | Owned-stock cost/sale evidence exists; full requested cost taxonomy and capital views need acceptance |
| 11 | Command Center | In progress | Existing operating modules retained; target role-aware information architecture remains |
| 12 | Inventory, CRM and sales | In progress | Persistent workflows and regression suites exist; production end-to-end acceptance pending |
| 13 | AI Dealership Copilot | Not started | Acquisition commentary is not the requested full copilot |
| 14 | Three subscriptions | In progress | Starter/Growth/Scale acquisition/API caps; seat/location/inventory/AI/report/automation limits incomplete |
| 15 | Payments and billing webhooks | Blocked | Processor onboarding, commercial prices and tax decisions required; no automatic collection |
| 16 | Commercial API | In progress | Scoped hashed keys, expiry/revocation, supplier binding and tenant quotas; deployment and redistribution contracts missing |
| 17 | Premium UI/UX | Not started | Reference inspected; current interfaces retained; redesign follows foundational gates |
| 18 | Desktop installers and updates | In progress | Native CI exists; this integration's platform builds, installation, signing and live backend acceptance pending |
| 19 | Storage, Resend, monitoring, backups | In progress | R2 buckets exist; sender/keys, storage workflows, delivery and restore acceptance pending |
| 20 | Full security/load/browser QA | In progress | Local results below; browser archive download failed; CI must run browsers; live/load acceptance pending |
| 21 | Domains, SEO and compliance | Blocked | Public SEO foundation retained; domain and business approvals pending; private pages remain noindex |
| 22 | Staging and release candidate | Not started | Requires integrated CI and configured staff/data environment |
| 23 | Approved production cutover | Blocked | No cutover before live acceptance and owner approval |
| 24 | Final documentation | In progress | This tracker and integration record; existing runbooks retained; final manuals/reports follow verified workflows |

## Local checks on the integrated working tree

| Check | Actual result |
|---|---|
| Demo launcher preflight | Passed |
| Lint | Passed |
| TypeScript | Passed, five configured package checks |
| Security tests | 29 passed |
| Embedded PostgreSQL/database tests | 19 passed |
| Intelligence tests | 5 passed |
| Cloudflare/runtime tests | 9 passed, including deployment-script execution |
| Production builds | Five tasks passed: three Next apps, desktop frontend, Cloudflare typecheck |
| Staff authentication HTTP regressions | 23 passed |
| Browser scenarios | 104 passed in GitHub Quality Gate #100; local Chromium download returned truncated archives |
| Cloudflare OpenNext packages | All three built locally; remote Cloudflare packaging check recorded in PR #25 |
| Native installers | Not tested locally |

Tests cover reference/embedded environments unless explicitly marked live. They do
not establish production MFA, payment collection, marketplace coverage or native
installation. Never add historical test counts to these totals.

## Reference video acceptance scope

The supplied 41-second video was retrieved and sampled throughout its duration.
It uses cream backgrounds, condensed bold headings, forest-green surfaces and lime
accents. Its figures and screens are explicitly illustrative. Product areas include
market comparisons, stock/inventory analysis, advertising intelligence (spend,
enquiries and cost per enquiry), profit/contribution breakdowns and an adaptable
multi-dealership platform. Currency examples are illustrative, not pricing rules.
Add campaign analytics to acceptance; do not present these figures as live data.

## Remote CI evidence

Commit `f1326e5` passed the Quality Gate, including 104 Chromium/mobile WebKit
scenarios and 23 authentication HTTP scenarios.
[Quality Gate #100](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38682350963) and
[Quality Gate #101](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38682811225).
The deployment-script/preflight follow-up at `69b9c7a` also passed Quality Gate
#101 (104 browser, 23 auth HTTP, 9 Cloudflare regressions) and Cloudflare packaging
#4. Integration merged to main as `5d5da91`. Native regression tests passed on
Windows/macOS; installer packaging/installation remain separate acceptance.

PR #26 adds isolated staging/protected deployment configuration. Its 10 local
Cloudflare/runtime/script tests and lint pass. Four dedicated APAC staging R2
buckets were created and their public r2.dev access is disabled.

Staging live checks confirm migrations through 0008, commerce runtime grants,
no DELETE/BYPASSRLS privileges, zero rows without tenant context and rejected
cross-tenant commerce inserts. No production commerce records were created.

## Owner dependencies

1. Verify Workers plan in Cloudflare dashboard. Connected API credentials cannot
   inspect billing. Do not change paid subscriptions through automation.
2. Configure a scoped deployment token in GitHub's protected
   `cloudflare-production` environment; never send secret values in chat.
3. Select/configure production staff identity and MFA. Neon Managed Better Auth
   being provisioned does not make it a standards-compatible OIDC provider.
4. Supply approved dealership identity, locations and authorized staff subjects.
5. Approve licensed provider contracts separately for dealer analytics, retention,
   AI processing and commercial redistribution; configure feed secrets securely.
6. Choose payment processor, approved plan prices/taxes and sandbox account.
7. Verify Resend sender DNS and configure its API key/approved recipients securely.
8. Supply production domain approval and native signing credentials when those
   phases are reached.

No secrets, credentials or customer records belong in this tracker.

## Known diagnostic requiring follow-up

The two accepted browser runs emitted Next server AbortError/unhandledRejection
messages while all scenarios passed. Root cause is not established; clean live
logs are still part of staging acceptance. The premium UI redesign, full market
analytics and production business acceptance are not completed by reconciliation.


## Deployment preparation follow-up, 15 October 2026

- PR #26 merged as `3dc231c2704a2025eca6d9271dd1716a4618ac4e` after
  Quality Gate #104 and Cloudflare build #6 succeeded on its exact head.
- Owner screenshot confirms `CLOUDFLARE_API_TOKEN` is now an environment secret
  in `cloudflare-staging`; the mistaken environment variable has been removed.
  The screenshot does not prove token validity or replacement/revocation.
- Live Cloudflare read: account usage model is `standard`; only admission and
  dealer-AI scripts exist. Subscription listing still denies the connector.
  Usage model does not prove a paid Workers subscription.
- Added a read-only GitHub-environment preflight to test token listing access and
  report missing runtime configuration without exposing values. Main pushes run
  preflight only; application deployment remains manual and gated.
- Local Cloudflare tests: 16 passed, lint passed. Live preflight result pending;
  no app deployment, staff MFA, billing, data-feed or launch acceptance is claimed.


## Verified staging credential check and identity preparation

- PR #27 merged at `2dbe9984b2894cc7ef36c0d0c3170631bf798b5c` after
  Quality Gate #107 and Cloudflare build #8 both passed on `54542a3`.
- Live staging preflight run `38692240172`: Worker-script listing **passed**,
  R2-bucket listing **passed**, billing **unverified**. Deployment was correctly
  skipped because runtime configuration is absent. It reports missing database,
  tenant, session and OIDC secrets plus account/origin variables; see job summary.
  This proves the saved token is usable for those reads, not deployment/edit access.
- Owner confirmed there is no staff identity provider account yet. Prepared an
  identity-only Cognito deployment using shared existing definitions: required
  TOTP MFA, no public signup, Lite plan, short access tokens, retained pool and
  code/PKCE public clients. Added Cognito selection/secret forwarding for Cloudflare
  while retaining the existing OIDC default. No account resources or users created.
- Local: 18 Cloudflare/runtime tests, 2 identity template tests, AWS TypeScript and
  application lint passed. Identity synthesis exports four Cognito resources with
  no bootstrap parameters. The historical full AWS template is byte-structure
  equivalent before/after extraction in an offline synthesis comparison.
- Windows and macOS native tests/installer packaging both succeeded in run
  `38682811192`; signing, actual installation and live backend acceptance remain.
- Owner action: review/upload the staging identity template in company AWS Mumbai,
  configure its output IDs/domain securely, and supply the remaining staging app
  configuration. Product launch, billing/data contracts and live QA remain open.


## Accepted identity/configuration increment

PR #28 merged as `c99c368f673183c8a0b13a154b358ac34d12b9bb` after all three
checks passed on `f83d96d513ba0475d14016e4df5af6f2cb4290ed`:

- Quality Gate #109, run `38692731347`: lint, TypeScript, builds, 29 security,
  19 database, 5 intelligence, 104 browser, 23 staff HTTP and 18 Cloudflare tests
  passed (zero failures in those recorded suites).
- Cloudflare build #10, run `38692731545`: packaging passed; no app deployment.
- Staff identity infrastructure #1, run `38692731281`: AWS TypeScript, 2 template
  security tests and identity-only synthesis passed; no AWS deployment.

**Release remains blocked.** The live saved-token preflight proved Worker/R2 read
access, but the required runtime settings are missing and billing remains
unverified. Owner must authorize the staff identity account/template, configure
staging variables/secrets, and complete live acceptance. Production DNS and the
existing Vercel preview have not been switched. Billing collection, licensed
feeds, remaining product modules and the full launch definition of done remain
open; this increment is not a commercially accepted release.


## Resume after power outage: mobile inventory regression

An earlier main push (`2dbe998`, run `38692239999`) failed one of 104 browser
cases: mobile inventory editing attempted to fill a hidden price field after a
one-time disclosure visibility check. The PR suites had passed; this intermittent
main failure is recorded separately and is not silently treated as green.

The inventory disclosure now remains disabled until its React handler is mounted.
The persistence scenario explicitly waits for the mobile control and confirms
expansion before editing. A new mobile scenario delays JavaScript and verifies
that the server-rendered control cannot accept a premature click, then releases
scripts and proves the first enabled click reveals the form. No retries or timeout
increases are used to hide the failure. Browser CI acceptance is pending.
