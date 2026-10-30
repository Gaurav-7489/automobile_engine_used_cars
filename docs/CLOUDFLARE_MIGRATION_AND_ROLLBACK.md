# Cloudflare migration and rollback

Status: **configuration and build verified; nothing deployed.** Vercel remains the live host. Do not switch the live domain without approval.

## Target

| Concern | Choice |
|---|---|
| Web and API | One Worker, `vandlabs-app`, built from `apps/intelligence` with OpenNext (`pnpm --filter @vandlabs/intelligence cf:build`, config in `wrangler.jsonc`) |
| Database | Neon Postgres, pooled application-role URL as the Worker secret `DATABASE_URL` (the existing `packages/data` rule for Cloudflare). Forced row-level security is unchanged |
| Files | R2: `vandlabs-vehicle-media` (photos), `vandlabs-app-cache` (Next incremental cache) |
| Rate limiting | The application limiter (`hitShared`, shared in the database) stays as the correctness layer. Add Cloudflare WAF rate-limiting rules in front of `/api/auth/*`, `/api/desktop/token` and `/api/workspace/commands` as the abuse layer |
| Scheduled and queued work | Not built. Candidates: read-model reindex, expired-token cleanup, notification outbox. Today these run on demand |
| AI | Not used by the migrated features |
| Desktop | Unchanged: same origin, same APIs; `APP_ORIGIN` must be the final HTTPS origin |

## What was checked here

- `opennextjs-cloudflare build` succeeds and `wrangler deploy --dry-run` accepts the bundle: **9.7 MiB total, 1.76 MiB gzipped**, under the Workers limits.
- **The adapter refuses Next.js 15.5.27** as "not supported by the Next.js team" and only builds with `--dangerouslyUseUnsupportedNextVersion` (the build above used it). The same applies to the existing legacy apps. Decide between upgrading Next.js or accepting that flag before production; it is not set in any script.
- Runtime APIs used: `node:crypto` only (supported under `nodejs_compat`), `pg` over TCP (supported), middleware (supported by the adapter).

## What was not checked (needs a Cloudflare account and staging)

- A running Worker: cold start, CPU time of scrypt sign-in and of the first read-model backfill (about 4 s of database work at 10,000 vehicles locally), `pg` connection behaviour against Neon from Workers.
- R2 binding use for photos, WAF rules, Queues, observability.
- Everything about latency from a real Cloudflare location.

## Acceptance checklist for staging

1. Create resources (not done): Worker `vandlabs-app`, R2 buckets, Worker secrets `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `APP_ORIGIN` var set to the staging origin.
2. Apply migrations `0013` to `0017` to the staging Neon branch (additive; no existing table is altered).
3. Run `cf:build`, `cf:deploy` to staging only.
4. Run `tests/local-stack/*.spec.ts` against staging with a synthetic tenant on a staging branch (never production records).
5. Verify: sign-in with TOTP, admin dealership creation with password re-confirmation, a staff role restricted to one branch, tenant isolation (two tenants), desktop sign-in end to end, 429 behaviour, p95 of the read APIs from two regions.
6. Compare error rates for a week before any traffic moves.

## Cutover and rollback

Cutover (needs approval): lower DNS TTL, point the hostname at the Worker, keep the Vercel project unchanged and deployable. Because both hosts use the same Neon database and the same `SESSION_SECRET`, sessions survive either way.

Rollback: repoint DNS to Vercel (TTL minutes). No data migration is involved, so there is nothing to undo in the database. Migrations `0013` to `0017` are additive and safe to leave in place; the previous release ignores the new tables and columns.

## Reindexing the read model

The first request after migration backfills a dealership's read model (4.2 s at 10,000 vehicles locally). Run `pnpm exec tsx scripts/perf/bench-sync.ts` against a staging copy to measure, and schedule a warm-up call per tenant before cutover.


## Single-Worker setup (30 Oct 2026)

The multi-app gateway, admission and notification Workers were removed with the legacy apps. Cloudflare now hosts one Worker, `vandlabs-app` (`apps/intelligence/wrangler.jsonc`). `pnpm cf:deploy` runs a read-only preflight (`scripts/cloudflare/preflight.mjs`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_ORIGIN`, secrets `DATABASE_URL` and `SESSION_SECRET`), builds, deploys, and uploads the secrets with `wrangler secret bulk`.

**Blocked on a decision:** `@opennextjs/cloudflare` refuses Next.js 15.5.27 without its unsupported-version override flag. Either approve that override for staging or move to a Next.js version the adapter supports. Until then `pnpm cf:build` fails and the Cloudflare workflow only runs the configuration tests. Vercel is unaffected.
