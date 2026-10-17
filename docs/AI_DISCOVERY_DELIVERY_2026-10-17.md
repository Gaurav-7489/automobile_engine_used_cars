# AI discovery and reels — delivery record, 17 October 2026

Branch `feat/ai-discovery-reels`, based on `fix/live-readiness` (`2d1476b`, itself two commits ahead of
`main` at `36af239`). This record covers the public discovery transformation and the current-state audit.
It does not certify a production launch. See [LIVE_READINESS.md](LIVE_READINESS.md) for the gated rollout.

## Current-state implementation matrix (audit on 17 October 2026)

| Area | State | Evidence / gap |
|---|---|---|
| Three Next.js apps (web, Command Center, Platform) | Implemented, verified locally and in CI | Builds, 100+ browser cases; reference data only |
| Tenant isolation (forced RLS, restricted runtime role) | Implemented and verified | Database suite on embedded PostgreSQL; staging live probes recorded in the release tracker |
| Staff auth, MFA, RBAC | Implemented, unverified live | Cognito/OIDC code and HTTP regressions; no staff identity provider account exists yet |
| Inventory, CSV/XLSX intake, publication, sold delisting | Implemented and verified (reference) | Existing suites; live Neon writes not accepted |
| Lead funnel (enquiry → tasks → visits → sale) | Implemented and verified (reference) | connected-journey suite; live acceptance pending |
| Dealer intelligence modules, acquisition planner, market evidence | Partially implemented | Deterministic modules exist; licensed feeds absent, several modules (campaign, copilot) incomplete |
| Commercial API keys, quotas, provider rights | Implemented, unverified live | Hashed scoped keys and tier caps; no paying customer or redistribution contract |
| Dealer AI Worker | Deployed (`vandlabs-dealer-ai`), unverified end to end | Live anonymous POST returns 401 as designed; no app Worker deployed to call it |
| Public AI discovery + reels | **Implemented and verified locally in this branch** | See below |
| Cloudflare app/gateway Workers | **Not deployed** | Account lists only `vandlabs-dealer-ai` and `vandlabs-admission`; both gateway URLs return 404 |
| R2 | Provisioned, unverified from apps | Eight private buckets exist |
| Neon | Provisioned; production unmigrated past 0006 | Migrations 0007–0009 pending per runbook; connector not authorised in this session |
| Resend, payments, licensed marketplace feeds | Blocked | Owner credentials, prices, tax and contracts required |
| Public website hosting | Vercel reference preview only | `vandlabs-automobile-web.vercel.app` serves the older read-only demo (`persistence: demo-adapter`) |

Pending branches at audit: PR #35 (role boundaries) is contained in PR #36 (capital evidence); both
passed CI. Draft PR #37 and `fix/live-readiness` implement Dealer AI token rotation incompatibly
(`SERVICE_TOKEN_NEXT` vs `SERVICE_TOKEN_ALTERNATE`) and both edit `deploy.mjs`, `cloudflare.yml` and the
Worker; this branch extends the `fix/live-readiness` design. Reconcile #37's separate hardening (production
deploys only from `main`, API token scoped to the deploy step) before merging it — do not merge both as-is.

## What this branch delivers

**Discovery engine** (`packages/data/src/discovery.ts`, pure and browser-safe):
- Parses Indian buyer phrasing: lakh/crore/₹ amounts, ranges, "around", bare "under 10" = ₹10 lakh,
  kilometres vs price disambiguation, model years and ages, ownership, seats/family size, fuel and
  transmission (with negation: "not diesel", "no BMW"), body styles, makes/models (common words like
  "City" count only beside their make), 45 Indian cities plus Delhi NCR/Tricity, colours, condition,
  features, sort orders and qualitative needs (mileage, reliability, family, first-time buyer…).
- Conversation: each turn refines the last; "any budget", "only automatic", "start over" etc. are
  explicit turns, so the URL holds the whole conversation and back/forward replays it.
- Hard filters before ranking. Only published, available cars are offered; sold cars never appear;
  reserved matches are counted and disclosed. A car whose value is unknown for a stated requirement
  (no price, no recorded seats) is hidden and reported, never guessed.
- Never widens budget or location. Zero results explain the blocking requirement ("Prices here start at
  ₹31.9 lakh…") and offer opt-in relaxations as tappable follow-ups.
- Deterministic, explainable ranking with requirement/strength/caveat explanations. Fuel economy is
  quoted only when recorded; otherwise ranking uses fuel type as a disclosed guide. Performance, safety,
  resale, boot space and "near me" are reported as unsupported, not invented.
- Phone numbers and emails typed into search are stripped before use.

**Public website** (`apps/web`): original VandLabs Auto identity (split-chevron mark, Plus Jakarta Sans,
warm white, restrained red), Autoza-inspired hero with the AI composer as the primary action, recorded
facts as floating bubbles, colour swatches from recorded paint names, and a floating featured-car card.
Navigation: Home, Discover, Saved Cars, Contact; inventory, compare, download and dealer pages remain.
`/discover` pairs the conversation (thread, understood chips with one-tap removal, notices, suggestions,
follow-up composer) with a vertical one-car-per-screen reel: windowed rendering (±2 cars), cursor
pagination, lazy images with a tiny blurred backdrop, at most one mounted video (muted, paused off-screen,
no autoplay under reduced motion), keyboard (↑/↓/PgUp/PgDn/j/k), URL-restored position, save, share,
WhatsApp, call, enquire, test drive and details. Saved Cars, Privacy and Terms pages were added.

**Dealer connection**: an enquiry from a reel can carry the buyer's search ("share my search", on by
default and visible). The server re-derives requirements, rank and summary from current stock and stores
them on the lead payload (no migration); Command Center shows "What they searched for" on the lead.

**Optional Consumer Search AI**: `/discover` on the Dealer AI Worker with its own token (route-scoped:
the dealer token cannot call it and vice versa), a `DISCOVERY_AI` service binding on the web Worker only,
and deploy/workflow wiring. Off unless `DISCOVERY_AI_ENABLED=true`. Output that introduces numbers,
unseen makes, links or guarantees is discarded; failures fall back to the rule-based reply.

## Verification (local, 17 October 2026)

All on this branch's final working tree, demo data, `TZ=UTC` (see the IST note in the tracker).

| Check | Result |
|---|---|
| Lint / TypeScript (5 packages) / production builds (5 tasks) | Passed |
| Security | 36 passed (adds 3 AI-guard cases) |
| Database / provider | 35 passed |
| Intelligence | 20 passed (adds 10 discovery-engine cases; replaces the superseded 3-case showroom search test) |
| Cloudflare / runtime / deploy scripts | 23 passed (adds route-scoped AI credential and deploy-token cases) |
| Browser (Chromium desktop + WebKit iPhone 13) | 125 passed, 3 skipped by design (keyboard-only, phone-only and one pre-existing mobile-only case) |
| Staff HTTP | 25 passed |
| Web Worker packaging | `opennextjs-cloudflare build` and `wrangler deploy --dry-run` passed; bindings show `DISCOVERY_AI` and no `DEALER_AI`; 2.0 MB gzip |

Visual review: desktop (1440×900) and iPhone 13 screenshots of the home page and `/discover` were
inspected. Review found and fixed: the desktop pill navigation rendering on phones, hero text clipped on
phones while `scrollWidth` still passed (a new test now checks element bounds), the headline's
accessible name, and a budget suggestion drawn from cars that didn't meet the buyer's other requirements.

Not verified here: any deployed environment, real dealership data, the AI summary against Workers AI
(only mocked), video playback with real vehicle footage, and CI on GitHub for this branch.

## Not done / blocked (owner action required)

1. Deploy: Workers paid plan verification, staging secrets (database, tenant, session, identity),
   then the gated workflow in LIVE_READINESS.md. No app or gateway Worker exists yet.
2. Neon: migrations 0007–0009 on production; the Neon connector needs authorising in claude.ai settings.
3. Real dealership onboarding and real inventory/photos; until then the site shows a labelled reference
   showroom with editorial photos.
4. Discovery AI: create a distinct 43-character `DISCOVERY_AI_SERVICE_TOKEN` secret and set
   `DISCOVERY_AI_ENABLED=true` per environment after reviewing AI-processing rights for dealer listings.
5. Vehicle video ingestion (uploads accept WebP/AVIF photos only); the reel already plays authorised
   video media when present.
6. Legal review of the Privacy and Terms pages (operator entity, retention periods, grievance contact).
7. Search sessions are not persisted server-side; only `inventory_search` events (no text) and shared
   enquiry context are stored. Aggregated search-demand intelligence would need a migration.
8. Engine CPU is ~1 ms per request for the reference catalog and ~14 ms for 2,000 cars × 4 turns; large
   catalogs should move hard filters into SQL.
