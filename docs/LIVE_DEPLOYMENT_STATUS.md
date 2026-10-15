# Live deployment status — 12 October 2026

> Historical snapshot. R2 activation and staging migration status have changed.
> Use [the release tracker](RELEASE_TRACKER.md) and
> [isolated staging runbook](CLOUDFLARE_STAGING.md) for current evidence.

## Provisioned and verified

- Cloudflare account: `98f548fdf2e2be84591c6669493f330b`.
- Reserved account subdomain: `vandlabs-automobile.workers.dev`.
- Selected public gateway origin: `https://vandlabs-gateway.vandlabs-automobile.workers.dev`. **Reserved configuration only; the gateway is not deployed.** No purchased domain is required for this initial origin.
- Private `vandlabs-admission` Worker deployed; Durable Object migration `v1` installed. Public workers.dev access and preview URLs disabled. Deployment ID: `78af2f784f5646e7ae58f21bdc0d2465`.
- Neon project: `snowy-pine-80856333`, `VandLabs Automobile Engine`, Singapore `aws-ap-southeast-1`, PostgreSQL 17, database `automobile_engine`, free plan.
- Production branch: `br-autumn-river-b31y3o2m`; staging: `br-dry-resonance-b3zuhmdt`.
- All six migrations committed on both branches. Production organization count is zero; no demo dealership/customer data copied into production.
- SQL-created `vandlabs_runtime` role on both branches: no superuser, BYPASSRLS, CREATEDB, CREATEROLE or INHERIT privileges. Application table grants applied. Runtime passwords generated securely; pooled URLs stored outside version control in a file with mode 0600. They are **not installed as Worker secrets yet**.
- Live staging tests under `SET LOCAL ROLE vandlabs_runtime`: tenant A sees only its organization, insertion for tenant B raises insufficient_privilege, and empty tenant context exposes zero organizations. Only synthetic isolation fixtures are stored in staging. Separate live probes authenticated successfully as `vandlabs_runtime` on both branches using the generated passwords and Neon HTTP driver. Additional password-authenticated HTTP transactions passed tenant A/B reads, empty-context reads, and cross-tenant write rejection. The local WebSocket driver probe failed; Worker runtime connectivity remains a blocking acceptance check.
- Neon Managed Better Auth provisioned on both branches, with the selected production/staging gateway origins trusted. No staff identities or production app sessions configured.

## Account blockers and incomplete release gates

1. Cloudflare R2 API returns error **10042: Please enable R2 through Cloudflare Dashboard**. No buckets exist for this migration. Account activation is required at https://dash.cloudflare.com/98f548fdf2e2be84591c6669493f330b/r2/overview .
2. A Workers paid plan suitable for Next.js SSR has not been verified/activated. The account connector cannot access subscriptions/billing; API authentication succeeds for Workers management. Billing activation must happen in the account dashboard.
3. The Cloudflare connector can manage Workers, but cannot mint a scoped local deployment token. Full deployment can use an appropriately scoped token supplied through a secure secret store; never paste it into chat or commit it.
4. Neon Managed Better Auth uses a different integration from the existing OIDC adapter. It is not an OAuth/OIDC endpoint substitute. Its Next.js SDK currently requires Next >=16 whereas this project is on Next 15.5.27; a tested compatible integration or an existing standards-compatible OIDC provider is still required. Shared development Google/SMTP settings are not production sign-in/email configuration.
5. Resend sender verification/key and notification recipient configuration are absent. No production notifications enabled.
6. Production tenant/dealership identity, staff permissions and inventory must be provisioned with validated identifiers before enabling shared write mode. No existing database export/import or legacy data cutover has been performed.
7. The public apps, gateway and notification Worker are not deployed. Live browser/API/media/auth/notification acceptance and rollback tests remain pending.

## Current cutover decision

**NO CUTOVER.** Existing hosting remains unchanged. Gateway configuration uses the reserved workers.dev origin, demo/read-only mode and `SEO_INDEXABLE=false` until the release gates pass. Remove that staging indexing override only for the verified public production release.

## Required acceptance evidence

- Staff sign-in, refresh, sign-out, role enforcement and revoked/disabled-user rejection.
- Worker runtime connects as the restricted pooled Neon role; public browsing and enquiries persist correctly.
- Private R2 upload authorization, MIME/size limits and public image delivery/cache behavior.
- Rate-limit and concurrency saturation behavior, cache isolation and HTTPS/security headers.
- Resend verified sender, successful outbox delivery and retry/idempotency handling.
- Production routes, canonical URLs, robots/sitemap, mobile layout and measured performance.
- Rollback to the existing host without lost writes; data migration/reconciliation when a source database is identified.
