# Dealership intelligence release tracker

Updated 15 October 2026. This is an evidence ledger, not a completion percentage.
The target is a B2B dealership subscription platform; the public vehicle storefront
is an optional distribution surface. No commercial production launch is claimed.

## Current baseline

- Main at audit: `2ef125750cd069f1981418ec9adc2d7bd922a571`.
- PR #23: open/draft, head `82690e9ae892957b0efef87df233a9ca0bb84747`.
- PR #24: open, head `27264996977a00acf5080a710e7d9152a744f10a`.
- Integration branch: `integration/dealership-cloudflare-neon-20261015`.
- Existing Vercel main deployment statuses: all three successful; this is build/
  hosting evidence, not authenticated production acceptance.
- Cloudflare: admission and dealer-AI Workers exist; full app/gateway cutover has
  not occurred. Billing/subscription API access returns authentication error.
- R2: vehicle-media plus web, command-center and platform cache buckets created
  successfully in APAC on 15 October. Upload/download acceptance remains pending.
- Neon: production, staging and isolated dealer-data-api branches exist. All
  operational tables inspected use forced RLS. Production/staging lacked the
  commerce migration at audit. The isolated branch has commerce and the runtime
  role grant correction. Production is not migrated by this integration work.
- Production runtime role: `vandlabs_runtime`, without superuser/BYPASSRLS.
  Staging also has an older `vandlabs_app` role with BYPASSRLS: never use it as
  an application credential. Runtime transactions explicitly reject such roles.

## Ordered delivery

| # | Task | Status | Evidence / remaining acceptance |
|---|---|---|---|
| 1 | Repository, cloud and deployment audit | Complete | Baseline above; video inspected |
| 2 | Reconcile PRs #23 and #24 | In progress | Four text conflicts resolved; Neon commerce routing, role grants and hosted demo safeguards fixed; CI pending |
| 3 | Workers and R2 | In progress | Four buckets created; Workers billing not readable; apps not deployed |
| 4 | Three apps on pooled Neon | In progress | Shared adapter supports Neon; commerce corrected; live Worker transactions not accepted |
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
| Cloudflare/runtime tests | 8 passed |
| Production builds | Five tasks passed: three Next apps, desktop frontend, Cloudflare typecheck |
| Staff authentication HTTP regressions | 23 passed |
| Browser scenarios | Not run locally: Chromium download returned truncated archives |
| Cloudflare OpenNext packages | Running; result recorded in integration report/CI |
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
