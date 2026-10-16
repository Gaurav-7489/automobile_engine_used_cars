# Infrastructure audit and controlled release plan — 16 October 2026

**Release decision: BLOCKED. End-to-end production acceptance has not passed.**

Audited repository baseline: `36af2394e94aecb99b3f7df88a463b2ab010958f`.
This is a point-in-time inspection, not a claim that account state will remain unchanged.
No production deploy, migration, credential rotation, DNS change, billing change,
identity provisioning or provider secret write was performed during this audit.

## Hosting authority and observed state

The current target is Cloudflare Workers (gateway plus three private app Workers),
Neon PostgreSQL and private R2. `docs/CLOUDFLARE_STAGING.md`, the generated Wrangler
configuration and `.github/workflows/cloudflare.yml` define this target. Historical
Aurora instructions are not the current cutover plan. Cognito remains a supported
identity-only option; generic OIDC is also supported. Neon Better Auth is not a
substitute for an OIDC authorization server without an implemented integration.

| Component | Verified state | Consequence |
|---|---|---|
| Cloudflare account | `98f548fdf2e2be84591c6669493f330b` | Matches repository account configuration |
| Deployed Workers | Only `vandlabs-admission` and `vandlabs-dealer-ai` | No Cloudflare gateway or application stack to accept |
| Dealer AI bindings | `AI` (AI binding), `SERVICE_TOKEN` (write-only secret) | Secret presence does not establish successful calls |
| Vercel | Three projects have ready preview builds; inspected web production attempts for current/recent main commits are canceled | Preserve the existing reference site; do not promote previews or delete projects |
| Vercel access | Staff projects have Vercel SSO protection; web does not | Hosting protection and application staff authorization are separate checks |
| Vercel AI variables | Only Command Center preview branch `feat/dealer-subscription-acquisition` has the endpoint and sensitive token | Does not configure main previews, production, or Cloudflare |
| Neon production | Branch `br-autumn-river-b31y3o2m`, migrations 0001–0006 | Missing 0007 commerce schema and 0008 runtime grants |
| Neon staging | Branch `br-dry-resonance-b3zuhmdt`, migrations 0001–0008 | Schema current; two organizations, no staff or vehicles |
| Production data | Zero organizations, staff, vehicles and Neon Auth users | Real tenant and identity onboarding is required |
| Runtime DB role | `vandlabs_runtime` can log in, is not superuser, cannot bypass RLS | Role shape is appropriate; this does not prove app connectivity |
| Production RLS | All 18 business tables have ENABLE and FORCE RLS with a policy | Migration bookkeeping is not a tenant business table; live isolation with two populated tenants remains untested |
| R2 | Four production and four staging buckets exist | Creation/activation is unnecessary |
| Media bucket exposure | Both staging/production r2.dev access disabled; no custom bucket domains | Keep private; verify authorized uploads and approved gateway reads after deployment |
| Workers subscription | Billing inspection denied by connected API | Paid-plan status unverified; do not broaden tokens or enable billing to make an optional check pass |

The owner reports six Vercel Preview/Production GitHub environments and one
`cloudflare-staging` environment, with a secret only in staging. The connected
GitHub plugin has no environment-secret read/write API. That count and those
secret names could not be independently verified here. GitHub environment names
alone do not select runtime hosting. The Cloudflare workflow consumes
`cloudflare-staging` or `cloudflare-production`, not the six Vercel environments.

A runtime-role SELECT through the Neon connector succeeded and exposed no
organizations without tenant context. Its `pg_stat_ssl` value was false on that
connector's database-side session; this is not evidence of a verified-TLS
application connection. The application requires verified TLS and pooled Neon
connections. The application connection probe remains mandatory.

## Dealer AI caller and secret placement

Required endpoint value:
`https://vandlabs-dealer-ai.vandlabs-automobile.workers.dev/explain`.
The bare origin is not the endpoint.

| Service | AI configuration |
|---|---|
| Dealer AI Worker | `AI` binding, `SERVICE_TOKEN`; temporary `SERVICE_TOKEN_NEXT` only during approved rotation |
| Command Center server | `DEALER_AI_URL` and `DEALER_AI_SERVICE_TOKEN` |
| Public web, Platform, gateway, admission and notifications | No Dealer AI token required |
| GitHub Cloudflare environment | Endpoint as variable; token as secret, only if that environment is authorized to call that Worker |
| Retained Vercel branch preview | Existing branch-scoped sensitive token; update only if that preview remains an authorized caller |

Call chain: Command Center `POST /command/api/dealer/recommendations` →
`commerceService.dealerRecommendations` → `explainAcquisition` → Worker `/explain`.
The business API's deterministic recommendations and Platform subscription/source
administration do not call the AI helper. No token belongs in a `NEXT_PUBLIC_*`
variable, browser bundle, repository file, chat message or test artifact.

## Changes prepared in this branch

- Deployment secret selection now confines Dealer AI and licensed-feed secrets to
  Command Center. Resend credentials remain with the dedicated notification Worker.
  Filtering future uploads does not delete already installed secrets; inspect and
  approve any cleanup separately. Current absent Cloudflare apps need no cleanup.
- Preflight and deployment reject partially configured AI integration, a bare
  origin instead of `/explain`, credential-bearing/query URLs, and malformed
  service tokens. Omitting both AI values keeps optional AI disabled.
- The Cloudflare build job now also runs lint, security, database and intelligence
  tests before building. PR jobs do not receive deployment secrets. Main push
  remains read-only preflight; deployment remains manual. Production preflight
  now also rejects dispatches from non-main refs before loading production secrets.
  The Cloudflare deployment token is scoped to the deploy step rather than install/build.
- Dealer AI supports a temporary second valid credential without removing the
  current credential. Comparisons remain timing-safe. Missing/invalid primary
  configuration fails closed. Tests cover overlap, promotion, revocation, request
  size, inference failures and secret distribution. Wrangler dry run passed.
- Vercel documentation now points to the current Cloudflare/Neon target.

## Credential rotation: approval required before live execution

Neither Cloudflare's write-only secret metadata nor Vercel's sensitive-variable
metadata makes the current value recoverable through the exposed APIs. Do not
attempt to print it or replace it blindly. No replacement credential has been
created or installed yet: generate it as part of the approved rotation transaction
once secure destinations and authorized caller scopes are confirmed.

1. Confirm the authorized callers, intended environment and selected Worker
   version. Inventory current deployment IDs for rollback. Do not copy the
   production Worker credential into staging; use a separate staging Worker/token
   if staging AI is enabled. Otherwise omit both staging AI variables.
2. Deploy the reviewed overlap-capable Worker preserving its current `AI` and
   `SERVICE_TOKEN` bindings. This changes live code and requires approval.
3. Generate 32 cryptographically random bytes encoded as unpadded base64url
   (43 characters) inside the secure execution boundary. Do not put the value in
   command arguments, logs, git, chat or downloadable reports. Install it as
   `SERVICE_TOKEN_NEXT` using the authenticated Cloudflare secret API.
4. Securely install that same new value in the authorized Command Center runtime
   and its matching deployment secret store. Preserve preview branch scoping.
   The GitHub plugin in this session cannot write environment secrets; an
   authorized administrator/API connection must perform that step securely.
5. Probe the new token with an invalid report to establish authenticated handler
   access without paid inference. Verify the old token still authenticates.
   Then obtain approval for a bounded real inference check if it can incur usage.
   Rebuild/redeploy the authorized caller and test a complete recommendation.
6. After successful caller rollout and old deployment/request drain, promote the
   new value to `SERVICE_TOKEN`, verify, then remove `SERVICE_TOKEN_NEXT`.
   Verify that the old token gets 401 and the new token works. Preserve an
   approved secure rollback path through the drain window.

Do not start this sequence while a required secure destination or endpoint is
unavailable. Current direct probes receive HTTP 403, Cloudflare error **1010**,
before the Worker's expected 401. Diagnose the exact account/security rule with
provider evidence; do not disable authentication or broad firewall protections.

## Tests and observations

| Check | Result |
|---|---|
| Frozen dependency installation | Passed; lockfile unchanged |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed (5 tasks) |
| `pnpm build` | Passed (5 tasks, including all three apps) |
| `pnpm test:security` | 30/30 passed |
| `pnpm test:database` | 33/33 passed; local PostgreSQL-compatible regression fixtures, not live acceptance |
| `pnpm test:intelligence` | 10/10 passed |
| `pnpm test:cloudflare` | 22/22 passed after these changes (18 existing + 4 new) |
| `pnpm test:auth:e2e` | 25/25 passed against built local staff HTTP servers |
| `pnpm cf:build` | Passed for web, Command Center and Platform; no deployment |
| Workflow YAML parse / production gate / token scope | Passed |
| Dealer AI `wrangler deploy --dry-run` | Passed; no deployment or model invocation |
| `pnpm test:e2e` | 22 HTTP/API tests passed; 94 browser cases failed to launch because executables were missing after a truncated/non-ZIP browser download. Not an acceptance pass |
| Current main GitHub Quality Gate | Run 38706765519 passed, including browser tests; historical evidence for baseline only |
| Cloudflare PR workflow inspection | Run 38707394530 built successfully; preflight/deploy skipped. A green PR build is not a deployment |
| Public Vercel reference URL | GET `/` returns 200 |
| Staff Vercel main preview URLs | Return 401 with no-store and noindex; this establishes hosting protection only |
| Dealer AI public probes | Root, missing token and invalid token each return 403/error 1010; Worker auth/inference not verified |
| Live DB/R2/app/identity acceptance | Blocked by missing app deployment, tenant, staff identity and secure environment configuration |

## Release actions remaining

1. Review and merge the infrastructure fixes after CI; merging does not authorize
   a production deploy. Confirm Workers billing status without enabling purchases.
2. Configure an MFA-capable supported OIDC/Cognito provider. Create approved staff
   accounts and server-owned tenant/capability assignments. Neon Auth exists but
   production contains no users and the app has no implemented Better Auth adapter.
3. Securely populate `cloudflare-staging`: account/origin variables; pooled staging
   restricted `DATABASE_URL`, approved `TENANT_CONFIG_JSON`, unique `SESSION_SECRET`,
   selected identity settings and database registry mode. Exact identity variable
   names are in the workflow and `STAFF_IDENTITY_SETUP.md`. No invented staff.
4. Deploy isolated staging after required CI and identity setup. Verify the
   database through the actual Worker transport; upload/read approved R2 media;
   test lead → qualification → follow-up → appointment → sale, staff MFA/session
   renewal/revocation, scoped business API keys, quotas, CSRF, rate/concurrency
   limits, two populated tenants, backups and rollback. Use licensed feed rights
   and approved test recipients. Keep optional AI/notifications disabled until ready.
5. Approve production migrations **0007 and 0008 only**, tenant/staff provisioning,
   a separate production secret set, production target/origin and deployment.
   Apply migrations using a direct migration connection, runtime with pooled role.
   Repeat acceptance before any DNS/domain cutover or enabling public indexing.
6. Approve the Dealer AI rotation described above after error 1010 is resolved and
   secure caller destinations are available. Do not revoke the old token early.

No production readiness claim is justified until these live acceptance checks pass.
