# Dealer Command Center redesign — status and evidence

Branch `claude/modest-mccarthy-di0s4a`, PR #39 (unmerged). Everything here runs on demonstration data labelled as such;
nothing was verified against production Neon, a real Google sign-in or a deployed Vercel/Cloudflare environment.

## Modules

| # | Module | Route | Engine (tested) | Persistence | Server authorization |
|---|--------|-------|-----------------|-------------|----------------------|
| 1 | Executive dashboard | `/` | `packages/data/src/cockpit.ts` | reads existing records | role-filtered snapshot; costs/leads absent, never zero |
| 2 | Market Opportunity Radar | `/market` | `market.ts` (confidence, freshness, regional deltas) | commerce state (existing) | `inventory:read` + `analytics:read` + Growth/Scale feature gate |
| 3 | AI Acquisition Planner | `/acquisition` | `commerce-rules.ts recommend()` (risk tolerance, per-option risk) | commerce state (existing) | `capital:read`; plan car-count and AI quota enforced server-side |
| 4 | Inventory Intelligence + approvals | `/inventory` | `dead-stock.ts`, `price-approval.ts` | **new** `price_change_requests` (migration 0010) and demo runtime file | request: `inventory:write`; decide: `capital:write`, never your own request |
| 5 | Capital & Profit | `/capital` | `capital-insights.ts` | existing cost records | `capital:read` (+ `lead:read` per command-access) |
| 6 | Sales pipeline | `/pipeline` | `pipeline.ts` | existing lead PATCH with version check | `lead:read` / `lead:write` |
| 7 | Alerts and Action Center | `/actions` | `cockpit.ts` actions | existing task completion | `task:write` to resolve |

Rules are documented in code and asserted in tests; none of them predicts demand, price or buyer intent.

## Behaviour worth knowing

- **Approvals:** a price cut below recorded cost, or larger than 10%, by someone without `capital:write` is refused (409) and must be raised as a request. The owner can always change a price directly. One pending request per vehicle (database unique index). Approving a request whose vehicle changed since it was raised closes it as *stale* and applies nothing. People without capital access never see cost-based reasons.
- **Migration 0010 is not applied anywhere.** Neon staging writes remain blocked and no production migration was run. Until it is applied, the production snapshot returns no requests and request/decision calls fail with an explicit "needs migration 0010" conflict instead of breaking the page.
- Missing costs, resale ranges, demand scores and enquiry data are shown as unknown, never as zero.

## Verification (sandbox, Chromium; no WebKit available locally)

- Unit/integration: security 42, database 57 (PGlite), intelligence 68, cloudflare 28 — all passing.
- Browser, desktop and phone-size Chromium: 193 passed, 3 skipped. Signed-role suite (real JWTs): 8 passed, including the manager-requests / owner-decides path.
- Automated WCAG 2.1 A/AA (axe-core) is clean on overview, actions, market, capital, pipeline, inventory and planner.
- CI runs the same suite with real WebKit for the mobile project. It found problems Chromium did not (full-page screenshots over 32,767 device pixels on long mobile pages; a 54 px horizontal overflow in the planner on WebKit). Both were addressed by folding extra planner options, capping the new inventory table at five rows, and clipping chart overflow; the WebKit overflow fix is **unverified until CI passes**.
- Known flake: `crm-conflicts.spec.ts` (mobile) failed once in CI and passed on re-run.

## Screenshots

`docs/evidence/command-center/`: overview, actions, market, capital, planner, inventory and pipeline, desktop and mobile
(Chromium rendering; `pipeline-board-*` and `planner-*` are element crops).

## Not done / owner actions

- Real Google sign-in, Vercel `AUTH_MODE=google` configuration, Neon credential rotation (compromised credential remains a release blocker), and the stray Vercel project (no root directory — fails every deployment) are outstanding and need the repository owner.
- Desktop Google sign-in is not implemented.
- Old `[section]` inventory/pipeline/capital renderers remain in the tree but are bypassed by the new routes.
- PR #39 must stay unmerged until OAuth, Vercel production configuration, security and release checks are verified.
