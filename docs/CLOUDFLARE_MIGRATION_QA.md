# Migration verification — 2026-10-12

The verified story is public inventory/enquiry → shared operations/data adapters → staff follow-up, appointment and sale, with Cloudflare deployment packaging and security admission checks. No live account provisioning or DNS cutover was completed.

| Check | Result |
|---|---|
| Frozen-lockfile dependency install | Pass |
| ESLint and all five workspace TypeScript checks | Pass |
| Security regressions including signed OIDC validation | 28 passed |
| PostgreSQL/PGlite persistence, role/RLS, outbox and isolation regressions | 11 passed |
| Evidence, matching and capital regressions | 5 passed |
| Durable admission, rate policy, Neon fail-closed and Resend retry regressions | 6 passed |
| HTTP connected API + staff operations + public SEO crawl | 4 passed |
| HTTP staff anonymous/forged access and redirect regressions | 23 passed |
| OpenNext builds for public, command and platform Workers | Pass on Next 15.5.27 |
| Wrangler dry-run command/platform, gateway and notification bundles | Pass |
| Windows/macOS native installer compilation and installed-device acceptance | Pending; no native Rust toolchain in this container |
| Browser screenshots, mobile visual acceptance and full browser E2E | Blocked here: browser downloads returned truncated archives; existing browser-dependent test could not launch |
| Live Workers requests, Neon database, R2 upload and real Resend delivery | Pending authenticated account setup |
| Local workerd HTTP runtime | Not verified: initial Wrangler interface enumeration failed; a test-only loopback shim allowed startup but requests/runtime harness did not complete successfully |
| Search Console, DNS verification, field Core Web Vitals and earned backlinks | Pending external/account work |

Total completed automated regression cases: 77. This count excludes blocked browser and pending production acceptance. No Lighthouse/field-performance score is claimed.

The staff build exposed a Next file-tracing failure on minified Node middleware. Disabling Next server minification for the two staff apps resolved it; the Cloudflare bundler still packages the Worker. OpenNext emits an experimental Node middleware support warning. Live staff auth and permission-revocation acceptance remains mandatory before promotion.

Cloudflare and Neon URLs opened at sign-in screens. Cloudflare sign-in progressed to the selected Google method through GitHub, but an authenticated dashboard has not been observed. No API token, database connection, sending-domain configuration or Google verification token was available in the execution environment. Existing hosting and records were not removed.
