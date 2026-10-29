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

## Phase 2: page-specific loading, measured on realistic synthetic dealerships

Synthetic tenants were seeded only into the local test database (`scripts/perf/seed-synthetic.ts`; never production). Same machine and conditions as above, so database latency is near zero. "Old approach" is the whole-workspace read that `/app` used to perform on every page (`scripts/perf/bench-state.ts`); "now" is the median of each page's own query over the read model (`scripts/perf/bench-queries.ts`).

| Dealership | Old approach: time / JSON sent to the browser | Inventory page 1 | Leads page 1 | Overview KPIs | Sales page 1 | Funnel |
|---|---|---|---|---|---|---|
| 500 vehicles, 1,500 leads, 100 sales | 243 ms / 2.1 MB | 5.4 ms | 3.4 ms | 2.4 ms | 3.2 ms | 2.6 ms |
| 2,000 / 6,003 / 400 | 815 ms / 8.3 MB | 11.2 ms | 5.2 ms | 2.8 ms | 4.1 ms | 5.6 ms |
| 10,000 / 30,000 / 2,000 | 4,308 ms / 41.7 MB | 41.3 ms | 19.7 ms | 13.2 ms | 12.4 ms | 28.7 ms |

What changed: the shell (`/api/workspace`) no longer carries vehicles, leads, sales, events or alerts; each page fetches one server-filtered, server-sorted, server-paged slice (`/api/inventory`, `/api/leads`, `/api/sales`, `/api/overview`, `/api/capital`, `/api/reports`, `/api/alerts`, `/api/stock-intelligence`). Commands run against only the records they name (46 differential cases verify identical results to the full read) and return only the records they changed. Derived index tables hold typed columns for filtering and sorting; they are rebuilt only for rows that changed.

Correctness: every figure above the pages show is checked against the unchanged full-read code (`tests/intelligence-prod/read-model.test.ts`, `scoped-commands.test.ts`, `stock-intelligence.test.ts`). Cross-record totals (landed capital, realized profit, funnel, ageing) come from SQL aggregates that tests compare with the original JavaScript.

### Known limits
- First request after migration backfills the read model: 4.2 s at 10,000 vehicles. Warm it per tenant before cutover.
- The freshness check costs about 141 ms at 10,000 vehicles on every read.
- Alert derivation is in JavaScript and cached 15 s per server instance; the cache is not shared across instances.
- Overview and capital payloads cap detail rows (60 or 15 per category); ledger export fetches all pages.
- These are local, near-zero-latency numbers. They are not production, Lighthouse or INP results, and none are claimed.

### How to measure production yourself (no production access was available here)
1. Pick a staging copy of a real dealership's data (a Neon branch), never the live database.
2. Sign in as an owner in Chrome, open DevTools Performance with CPU 4x slowdown and "Slow 4G", record: load `/app/overview`, then navigate to Inventory, scroll, filter, open a vehicle.
3. Read LCP, CLS and INP from the Performance Insights panel, or run `npx lighthouse https://<staging>/app/overview --only-categories=performance --preset=desktop` with a saved authenticated cookie (`--extra-headers`).
4. In the Network tab record bytes of `/api/workspace` (should be tens of KB) and of each page API, and the `Server-Timing: app;dur=` header every page API returns.
5. Repeat on the Cloudflare staging Worker and compare.

## Not done
- INP, hydration cost, memory and React profiling; `EXPLAIN ANALYZE` on production-sized data; Lighthouse on any hosted environment.
