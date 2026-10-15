# Isolated Cloudflare staging

This increment prepares separate deployment stacks. It does not claim a deployed
staging app, staff login or production acceptance. Four dedicated staging R2
buckets were created in APAC and their r2.dev public access is disabled.

`CF_ENVIRONMENT` accepts `staging` or `production` and defaults to staging.
`pnpm cf:configure` rewrites names, self-references, service bindings, admission
bindings and media/cache bucket names consistently. Re-running it switches from
one target to the other without accumulating prefixes. `pnpm cf:deploy` provisions
only the buckets named by those generated configs.

| Resource | Staging | Production |
|---|---|---|
| Gateway | vandlabs-staging-gateway | vandlabs-gateway |
| Website | vandlabs-staging-web | vandlabs-web |
| Command Center | vandlabs-staging-command-center | vandlabs-command-center |
| Platform | vandlabs-staging-platform | vandlabs-platform |
| Admission coordinator | vandlabs-staging-admission | vandlabs-admission |
| Notification cron | vandlabs-staging-notifications | vandlabs-notifications |
| Vehicle media | vandlabs-staging-vehicle-media | vandlabs-vehicle-media |
| Cache buckets | vandlabs-staging-{app}-cache | vandlabs-{app}-cache |
| Neon branch | staging / br-dry-resonance-b3zuhmdt | production / br-autumn-river-b31y3o2m |
| GitHub protected environment | cloudflare-staging | cloudflare-production |

Do not reuse production database connections, session-encryption keys or provider
credentials in staging. Use only staging fixtures and approved test recipients.
The optional dealer-AI endpoint/token is environment-specific configuration too;
it must not silently point staging at production data or usage budgets.

## Owner setup that cannot be supplied by this connection

1. Open Cloudflare account `98f548fdf2e2be84591c6669493f330b` and verify the
   Workers subscription. R2 is already enabled; no additional activation is needed.
2. In Account API tokens, create an account-scoped deployment token using the
   Edit Cloudflare Workers template. Include permissions for Worker scripts,
   bindings/assets and R2 storage management required by Wrangler/OpenNext.
   Use only this account. Account read may be needed for Wrangler discovery;
   custom-domain route permissions are only needed when a custom domain is used.
3. In repository Settings → Environments, create `cloudflare-staging` with a
   required reviewer. Add `CLOUDFLARE_API_TOKEN` as an environment secret.
   Add `CLOUDFLARE_ACCOUNT_ID` as an environment variable with the account above.
4. Set environment variable `CF_PUBLIC_ORIGIN` to
   `https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev`.
   This is a configured target, not an already deployed URL.
5. Configure secrets `DATABASE_URL` (pooled staging vandlabs_runtime connection),
   `TENANT_CONFIG_JSON`, `SESSION_SECRET`, `AUTH_PRINCIPALS_JSON`, and the OIDC
   values referenced in `.github/workflows/cloudflare.yml`. Obtain them through
   the services' secure configuration interfaces; do not place them in chat or git.
6. Configure an MFA-capable staff identity provider. Existing generic OIDC and
   Cognito adapters remain; Neon Managed Better Auth is not interchangeable with
   OIDC and was not substituted. Real staff subject IDs must be explicitly
   authorized in the server registry before login is accepted.
7. Leave notifications disabled until Resend sender/recipients are verified.
   Configure feed and AI credentials only for approved test integrations.

The official Workers pricing, R2 pricing and GitHub token guidance are:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## Deploy after configuration and CI

Run the Cloudflare build and deploy workflow manually, select `target=staging`
and `deploy=true`, and approve the protected environment. Staging deployment can
use a reviewed release branch; production deployment is restricted to main.
Production still requires separate owner cutover approval.

The workflow defaults to staging and forces public indexing off. Generating
staging configuration with `SEO_INDEXABLE=true` is rejected. Production indexing
also defaults off; public indexing is enabled only as a separately reviewed
release decision. Authenticated surfaces retain their noindex rules.

A subprocess regression builds temporary configs for staging → production →
staging and verifies all bindings, private surfaces and buckets. It rejects an
unknown environment and attempts to index staging. This is configuration evidence,
not live environment acceptance.

## Acceptance before launch

- Prove Cloudflare Workers use the restricted staging pooled role.
- Exercise staff login, MFA, refresh, logout, revoked staff and cross-tenant denial.
- Submit an enquiry, import stock, record costs and complete a sale across apps.
- Test the authenticated R2 app route, private assets and public approved photos.
- Test notification delivery/retries with approved staging recipients.
- Run rate/concurrency tests safely in staging, browser QA and rollback.
- Keep Vercel and production DNS unchanged until these checks are accepted.
