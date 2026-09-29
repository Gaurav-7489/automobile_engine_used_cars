# Codex Runtime Hardening Brief — V1.1

Use this as the copy-paste task for the post-V1 Codex review.

## Goal

Audit and harden the existing VandLabs Automobile Engine **without redesigning the product or expanding V1 scope**.

The V1 Proof-of-Engine is already feature complete. This pass is for runtime correctness, integration correctness, browser behavior, accessibility, security hygiene and maintainability.

## Repository

Branch to inspect:

`v1.1-runtime-hardening`

Do not work directly on `main`.

## First action

Run the complete gate before changing code:

```bash
corepack enable
pnpm install
pnpm qa
```

Then run all three apps locally and inspect them in the browser:

```bash
pnpm dev
```

- Public experience: http://127.0.0.1:3000
- Command Center: http://127.0.0.1:3001/command
- Platform Control Center: http://127.0.0.1:3002/platform

## Review order

1. Fix real TypeScript, ESLint, Next.js build or hydration issues.
2. Verify Next.js `basePath` routing for Command Center and Platform Control.
3. Verify the full public customer loop:
   - homepage
   - inventory search/filter/sort
   - compare
   - vehicle detail
   - WhatsApp/call actions
   - enquiry/test-drive/finance/exchange forms
4. Verify the cross-app lead flow:
   - submit lead through public BFF
   - confirm it is persisted in `.demo-runtime/leads.json`
   - confirm it appears in Command Center
   - confirm lead profile preserves vehicle, source, campaign, intent and consent context
5. Verify API behavior:
   - `/api/health`
   - `/api/vehicles`
   - `/api/vehicles/[slug]`
   - `/api/leads`
   - `/api/events`
6. Verify responsive behavior on desktop and mobile for all three apps.
7. Check horizontal overflow, broken sticky elements, inaccessible controls and contrast.
8. Check keyboard navigation, focus visibility, labels, heading order, table semantics and touch targets.
9. Verify metadata, canonical vehicle URLs, sitemap, robots and JSON-LD.
10. Check console/network errors and broken internal links.
11. Check for unnecessary client JavaScript, avoidable re-renders and obvious performance regressions.
12. Review demo-only persistence/security boundaries so nothing is presented as production-safe when it is not.

## Architecture rules

Do not:

- replace the monorepo architecture
- switch frameworks
- add a database just to satisfy the review
- add Supabase/Firebase as a shortcut
- couple UI directly to AWS
- introduce workshop, spare parts, insurance, customer garage or native apps into V1
- invent AI predictions or business metrics
- weaken lint/type rules to make checks pass
- remove tests simply because they fail

Preserve:

`UI → application service → repository interface → adapter`

Production infrastructure stays behind the contracts.

## Business-data rules

Deterministic records remain authoritative for:

- vehicle identity
- price
- mileage
- availability
- specifications
- customer identity
- lead stage
- permissions/consent
- recorded outcomes

AI must not fabricate these values.

## Required browser matrix

At minimum:

- Chromium desktop
- Chromium mobile / iPhone-sized viewport
- Safari desktop manual check on macOS
- iPhone Safari manual check
- Firefox desktop manual check

## Deliverable

Make fixes in small logical commits.

When finished, provide:

1. issues found, grouped by severity
2. files changed
3. why each change was required
4. commands/tests run
5. remaining production-only gaps
6. confirmation whether `pnpm qa` is fully green
7. confirmation that the public lead can be opened in Command Center
8. confirmation that no cross-app routing/basePath bug remains

Do not merge to `main` until the review branch is green.
