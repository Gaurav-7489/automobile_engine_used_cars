# Production readiness report

## Done and verified

- Dedicated password confirmation (unit + real-PostgreSQL browser test).
- End-to-end dealership creation → owner activation → private workspace, on a real PostgreSQL 16 with the application role (no RLS bypass): passes.
- Shared rate limiting on sensitive endpoints (unit tested).
- 16 → 6 database statements per workspace page render.
- Lint, typecheck, security, database, intelligence, product, intelligence-prod (8), cloudflare suites pass; `next build` passes.

## Not done (be explicit)

- Legacy apps not retired; parity gaps listed in `LEGACY_APPLICATION_RETIREMENT.md`.
- No hosted performance measurements, Lighthouse, INP or memory profiling; no before/after screenshots (only after).
- Full-app redesign, light theme, 21st.dev/Skiper UI components: not done.
- Playwright suites for web/command-center/platform, accessibility audit, load tests, tenant-isolation tests for two dealerships in a browser (database-level isolation is covered by existing tests).
- Whole-tenant read per page (audit finding 5).

## Deploy

1. Apply migrations `0013` and `0014` with the migration role (`pnpm db:migrate`). Both are additive (two columns, one table, three functions). The function grants target `vandlabs_app`/`vandlabs_runtime` if they exist.
2. Deploy the application. No new environment variables.
3. Smoke test: `/api/health`, admin sign-in with authenticator code, Add dealership.

## Roll back

Redeploy the previous build. The old build ignores the new columns, table and functions, so the migrations can stay. If they must go: `DROP FUNCTION intelligence_rate_hit(text,integer,integer), intelligence_reauth_state(uuid), intelligence_record_reauth(uuid,boolean); DROP TABLE intelligence_rate_limits; ALTER TABLE intelligence_users DROP COLUMN reauth_failed_attempts, DROP COLUMN reauth_locked_until;` (the old build's reauth keeps working because it only uses sign-in functions).

## External dependencies

Hosted database latency figures, Vercel/Cloudflare access logs for retirement decisions, licence review for any third-party UI source, authenticator enrolment for each platform admin.
