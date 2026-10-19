# Branch audit — 19 October 2026

Method: `git fetch --prune`, then per branch: commits ahead/behind `origin/main` (`751758f`), `git cherry`
(patch-level uniqueness, so squash/rebase copies are detected), and a file-tree comparison against `main`.
This establishes *what is not already in `main`*. It is not a line-by-line behavioural review of every branch,
and no branch has been deleted, merged blindly or rewritten.

44 remote branches = `main` (1) + this consolidation branch (1) + 31 already integrated (29 with zero commits ahead,
plus 2 whose only commit is a merge/duplicate already in `main`) + 10 superseded historical branches + 1 open hardening branch (#37).

## A. Ready to integrate
| Branch | PR | Notes |
|---|---|---|
| `claude/modest-mccarthy-di0s4a` | #39 | Google sign-in, AWS removal, plus ported deployment hardening from #37. Lint, typecheck, build, 42 security / 35 database / 30 intelligence / 28 Cloudflare tests and the Chromium auth suite pass; Quality Gate, Cloudflare packaging and Desktop installers pass in CI. |

## B. Requires reconciliation
| Branch | PR | Disposition |
|---|---|---|
| `fix/production-infrastructure-handoff` | #37 (draft) | Compatible parts ported into #39: production deploys only from `main` (preflight), Cloudflare API token scoped to the deploy step, full test suite in the build job, licensed-feed credentials limited to Command Center (new `service-config.mjs` + test). **Not ported:** `SERVICE_TOKEN_NEXT` rotation (main already implements `SERVICE_TOKEN_ALTERNATE`; the two schemes are incompatible), `dealerAIConfiguration` preflight, and `docs/INFRASTRUCTURE_AUDIT_2026-10-16.md` (review before porting). Keep #37 open until the owner decides. |

## C. Already integrated (no unique patches; contained in or patch-equivalent to `main`)
- `codex/cloudflare-neon-migration`
- `deploy/vercel-preview`
- `feat/ai-discovery-reels`
- `feat/apple-minimal-showroom`
- `feat/capital-operations`
- `feat/connected-modern-pages`
- `feat/creative-colour-showroom`
- `feat/crm-conflict-safety`
- `feat/dead-stock-intelligence`
- `feat/dealer-subscription-acquisition`
- `feat/demo-connected-sales`
- `feat/excel-inventory-review`
- `feat/frontend-usability-review`
- `feat/inventory-ingestion`
- `feat/market-price-evidence`
- `feat/premium-experience-distribution`
- `feat/provider-sync-reliability`
- `feat/shared-platform-staff-2026-10-09`
- `fix/capital-report-evidence`
- `fix/live-readiness`
- `fix/mobile-inventory-disclosure`
- `fix/navigation-hydration`
- `fix/workspace-sidebar-reachability`
- `infra/cloudflare-deployment-preflight`
- `infra/cloudflare-isolated-staging`
- `infra/staff-identity-only`
- `integration/dealership-cloudflare-neon-20261015`
- `security/command-center-fail-closed`
- `security/provider-ai-rights`
- `fix/command-center-lead-auth` (1 commit, patch-equivalent in `main`)
- `security/dealer-role-boundaries` (1 commit, the merge of PR #36, which `main` already contains)

## D. Superseded (unique commits, but no file content absent from `main` other than files `main` deliberately removed)
These form the original Oct 3–5 lineage that `main` was built from. Each is 119–121 commits behind.
| Branch | Notes |
|---|---|
| `mvp-v1-proof-of-engine`, `v1.1-runtime-hardening` (PR #2), `v1.5-operations-reporting`, `v2-automation-attribution`, `v2.5-integrations-reporting`, `production-foundation`, `production-app-wiring` | Only differences: `apps/platform/lib/data.ts` and `apps/web/app/loading.tsx` (removed from `main` on purpose) and `docs/codex-runtime-hardening.md` (v1.1 only). They also carry the removed `infra/aws` stack. |
| `production-data-auth-adapter`, `feat/verified-staff-access` (PR #9) | Cognito token verification; superseded by the Google implementation (#39) and the verified-staff work already in `main`. |
| `feat/ecosystem-runtime` | 4 commits from 5 Oct; only `apps/platform/lib/data.ts` absent from `main`. |

## E. Unsafe or incomplete
None identified by this method. Any branch in D would reintroduce AWS/Cognito code if merged; do not merge them.

## Recommendations (all need owner approval; nothing done)
1. Close PRs #2 and #9 as superseded; keep #37 open until its remaining items are decided.
2. Delete the 31 fully integrated branches and the D branches if tidiness is wanted (they remain recoverable from `main` history for C; D branches should be tagged first).
3. Protect `main`: require pull requests, require `Quality Gate` and `Cloudflare build and deploy`, block force-push and deletion. Repository settings are not changeable with the tools in this session.
