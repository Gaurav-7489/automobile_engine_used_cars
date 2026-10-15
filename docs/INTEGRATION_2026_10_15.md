# Cloudflare / Neon and dealership commerce integration

The integration preserves both original feature branches and brings their changes
into one reviewable branch. Main and existing deployments remain unchanged until
quality and release gates pass. Original PRs are not force-pushed or discarded.

## Reconciliation

Four textual conflicts were resolved by retaining both implementations:
README deployment/product sections, public CSS improvements, notification/commerce
SQL grants and shared data-package exports. Auto-merges were reviewed for auth,
HTTP error handling, application navigation and dependencies.

Semantic corrections:

- Commerce repository selection now sends Neon to shared PostgreSQL; previously
  it incorrectly selected the local-only demo repository.
- Synthetic source approval is forbidden in both shared database modes.
- Cloudflare-hosted demonstration summaries are read-only, and the common demo
  writer rejects hosted mutations rather than attempting filesystem persistence.
- Fresh runtime-role provisioning grants commerce access. Migration 0008 repairs
  existing Neon runtime roles without rewriting already-applied migration 0007.
- Cloudflare deployment configuration propagates the optional dealer-AI endpoint,
  service token and licensed feed configuration through server secrets.

## Database verification

All migrations pass against embedded PostgreSQL. Commerce tests switch to a
non-superuser/non-BYPASSRLS `vandlabs_runtime` role and verify durable reads,
revocation and tenant separation. Migration 0008 was applied only to the isolated
`dealer-data-api-20261013` Neon branch in this increment. Catalog checks confirm
SELECT/INSERT/UPDATE, forced RLS, no DELETE and no BYPASSRLS. An empty tenant
context sees zero rows. This does not prove cross-tenant visibility with populated
live commerce records or a deployed Worker connection.

Production/staging migration rollout is intentionally separate from code review.
Use `pnpm db:migrate` with a direct migration-role URL, then the pooled restricted
runtime URL for all apps. Do not use the older staging `vandlabs_app` role: its
catalog entry has BYPASSRLS and application transactions reject it.

## Validation and release decision

See [release tracker](RELEASE_TRACKER.md) for exact local test results and missing
acceptance. Local browser downloads failed; CI must supply actual browser results.
Cloudflare packaging and native installers are separate gates from Next builds.

The reference video was inspected; advertising intelligence is part of the target
alongside market, inventory and profit intelligence. No licensed feed, payment
collection, production identity, full copilot or production readiness is claimed.
