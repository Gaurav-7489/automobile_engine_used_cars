# Performance baseline and results

## Conditions

Production build (`next build && next start`), headless Chromium via Playwright, PostgreSQL 16 on the same machine with TLS, a freshly provisioned **empty** tenant. Database latency is effectively zero here, so these numbers show application cost, not what users on a hosted database see. No Lighthouse run against the Vercel deployment was possible (no network access to it), so nothing below is a field or production claim.

## What was wrong (measured)

Statements for one `GET /app/overview` render, counted with `log_statement = all`:

| | Before | After |
|---|---|---|
| Statements | 16 | 6 |
| Sequential round trips on the critical path | 15 | 5 |

Before: session check, BEGIN, role check, set tenant, ten workspace reads (one connection runs them one at a time even under `Promise.all`), COMMIT, then the admin check afterwards. After: the ten reads are one statement returning JSON arrays; tenant setup and role check share a statement; the admin check runs in parallel. With a database round trip of *r* ms, server time on the database path falls from roughly 15·r to 5·r (e.g. at 40 ms: about 600 ms → 200 ms). That figure is arithmetic from the measured statement counts, not a measured end-to-end result.

Other findings: per-route JS is already small (102 kB shared, 138 B–11.4 kB per page, ≤155 kB first load), so bundle size was not the cause of lag.

## Measured on the local stack (after changes)

Owner session, 1440×900 and 390×844, four pages each:

| Metric | Result |
|---|---|
| TTFB (HTML) | 17–28 ms |
| LCP | 56–100 ms |
| CLS | 0 on all pages |
| Long tasks | none |
| Horizontal overflow | none |
| Client navigation Overview → Inventory | 116 ms desktop, 68 ms mobile |

No "before" run exists for these (they were taken after the changes), so no before/after improvement is claimed for them. Re-measure on the hosted stack and on a realistically sized tenant before quoting them.

## Not done

- INP, hydration, memory, React profiling, database `EXPLAIN ANALYZE` on large data, Lighthouse on production.
- Per-page data loading (finding 5 in the audit) is the next large win.
