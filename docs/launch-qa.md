# V1 Launch / Codex QA Checklist

This file separates **feature-complete MVP work** from **runtime-certified production readiness**.

## Latest local certification

Certified on **2026-09-30** against the V1 Proof-of-Engine reference tenant:

- `pnpm lint` passed.
- `pnpm typecheck` passed across all workspace applications.
- `pnpm build` passed for Public Experience, Command Center and Platform Control Center.
- `pnpm test:e2e` passed 24 desktop/mobile checks.
- Visual checks passed for public discovery/conversion and both operational control surfaces.
- Mobile overflow checks passed for the public homepage and Command Center data tables.

This local certification does not waive the deployment-specific production blockers below.

## Required local gates

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

Or:

```bash
pnpm qa
```

## Codex review pass

Codex should inspect and fix, in this order:

1. TypeScript/build errors across all three apps and shared packages.
2. ESLint errors; do not weaken rules only to make the gate green.
3. Next.js basePath behavior for Command Center and Platform Control Center.
4. Public navigation, inventory filters, compare state, vehicle 404s and conversion forms.
5. The public enquiry → `.demo-runtime/leads.json` → Command Center lead flow.
6. API contracts: health, vehicles, lead creation and journey events.
7. Desktop/mobile layouts, horizontal overflow, keyboard focus and reduced-motion behavior.
8. SEO metadata, canonical paths, sitemap/robots and JSON-LD validity.
9. Accessibility: heading order, labels, touch targets, semantic tables and contrast.
10. Console/network errors and broken links.
11. Performance regressions and unnecessary client JavaScript.
12. Security review of demo-only behavior before any public deployment.

## Browser matrix

Minimum:

- Chrome desktop
- Safari desktop
- Chrome Android-sized viewport
- iPhone Safari-sized viewport
- Firefox desktop

## Data integrity checks

- Vehicle facts originate from the canonical inventory fixture/repository.
- Unknown vehicle slug returns a real 404.
- Search/filter/compare never invents vehicles.
- Lead requests preserve selected vehicle and permitted acquisition context.
- Newly created local-demo leads can be opened in Command Center.
- Analytics labels seeded/demo evidence clearly; no fabricated CAC/ROAS.
- Customer accounts are not required for browsing/enquiry.
- Workshop/parts/insurance/customer-garage features do not leak into V1 core.

## Production blockers

Do not call the system production-ready until the following are implemented or explicitly accepted as deployment-specific gaps:

- production authentication and authorization
- durable production database
- tenant isolation enforcement
- real media pipeline/storage
- rate limiting / WAF / abuse controls
- secrets management
- observability/alerting
- backup/recovery plan
- privacy/retention policy
- real domain + consent configuration
- CI/CD quality gates and rollback strategy

The current branch is a **complete Proof-of-Engine MVP feature pass**, not a claim that these production infrastructure gates are already live.
