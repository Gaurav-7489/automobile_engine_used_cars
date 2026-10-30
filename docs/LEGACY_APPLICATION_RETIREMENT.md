# Legacy application retirement and parity matrix

**Conclusion: retired (30 Oct 2026).** Every feature of `apps/command-center`, `apps/platform` and `apps/web` now lives in `apps/intelligence` (tables below). The three apps, their test suites, the multi-app Cloudflare gateway, admission and notification Workers, and the unused `packages/design-system` were removed from the repository. Their Vercel projects were paused and set to skip builds first; nothing in the database was touched. Revert the retirement commit to restore the code.

Status words: **Migrated** = implemented in Intelligence and covered by an automated test. **Different** = a deliberate change from the legacy behaviour. **Open** = not done.

## command-center → intelligence

| Capability | Status | Where / evidence |
|---|---|---|
| Leads, follow-ups, lead detail, appointments, tasks | Migrated earlier | `/app/leads`; read-model differential tests |
| Inventory, spreadsheet import | Migrated earlier | `/app/inventory`; scoped-command tests |
| Capital / costs | Migrated earlier | `/app/capital`; finance differential tests |
| **Automation rules** | **Migrated** | `/app/automations`, `/api/automations`, migration `0017`; `tests/intelligence-prod/automations.test.ts`. Different: rules create tasks in the same transaction as the lead change; `intents` filter dropped (Intelligence leads have no intent); WhatsApp channel is recorded as held, never sent |
| **Subscriptions and plan limits** | **Migrated** | admin "Plan and access" dialog, settings "Plan and access", `entitlements.test.ts`. Different: no payment is taken; a subscription is recorded against a contract reference |
| **Dead-stock / ageing intelligence** | **Migrated** | `/app/stock-intelligence`, `lib/server/stock-model.ts`; differential test against a plain computation. Different: view counts and publish status are not used (no public showroom), so "promote" and "publish" prompts no longer exist |
| **Acquisition planner** | **Migrated** | `/app/acquisition`; metered against the plan; `acquisition.test.ts`. Not migrated: AI commentary (the `dealer-ai` worker) |
| **Desktop configuration and sign-in** | **Migrated** | `/api/desktop/{config,authorize,token}`, `/desktop/authorize`, rewritten `apps/desktop`; `desktop.test.ts` and Rust rule tests |
| **Business API** `/api/v1/vehicles`, `fuel-prices`, `recommendations`, `ingest` | **Migrated** | `app/api/v1/[resource]`, `lib/server/business-api.ts`, owner key management in Settings → API access, `business-api.test.ts`. Same key format (`vand_…`) and the same commerce record, so keys issued by the legacy platform keep working; same request and response shapes (`data`, `usage`, `version`). Different: calls to the legacy host must be repointed to this app; the response envelope for errors is the platform's standard `{ error: { code, message } }` |
| **Data-source approval and supplier ingest** | **Migrated** | Admin "Plan and access" → Sourcing data sources (migration `0018`, password-confirmed, audited); supplier keys are restricted to one approved source |
| Notifications outbox, readiness page | Partial | `/app/alerts`, `/api/health` |
| Authentication | Different | One sign-in with TOTP; legacy OIDC is not copied |

## platform → intelligence `/admin`

| Capability | Status | Evidence |
|---|---|---|
| Dealerships, onboarding, owner invite | Migrated earlier | admin console |
| **Platform audit viewer** | **Migrated** | admin "Platform audit" tab, `/api/admin/audit` (SECURITY DEFINER, platform admins only) |
| **Feature entitlements** | **Migrated** | per-feature switches stored in `dealer_commerce.payload.features`; navigation, pages, APIs and commands all honour them |
| **Commerce: sources, keys, usage** | **Migrated** | see above |
| Staff management | Partial | members and suspension exist; role editing for staff lives in dealer settings |
| Platform health | Partial | `/api/health` only |

## web → intelligence `/showroom`

| Capability | Status | Where |
|---|---|---|
| Home, inventory with filters, vehicle detail | **Migrated** | `/showroom`, `/showroom/inventory`, `/showroom/vehicles/[slug]` |
| Discover (plain-language search) | **Migrated** | `/showroom/discover`, same deterministic engine (`@vandlabs/data/discovery`). Different: the optional AI summary worker is not called |
| Saved cars, compare | **Migrated** | `/showroom/saved`, `/showroom/compare` (per-browser, nothing sent to a server) |
| Contact | **Different** | `/showroom/contact` explains that enquiries are handled inside dealership workspaces; no public lead form (private-platform decision) |
| Desktop download | **Migrated** | `/install` (Windows, macOS, Linux) |
| Data source | **Different** | sample catalogue only; live tenant stock stays private |

Every user-facing feature of the three legacy apps now has a place in Intelligence. The apps themselves stay in the repository only because the Cloudflare deploy tooling still builds them (see below).

## Retirement checklist (as carried out)

Items 1 and 2 could not be verified from the development environment: anyone still calling the old hosts (for example a supplier using the legacy Business API address) must move to the Intelligence host; their keys keep working there. Items 3 and 4 were replaced by the single-Worker Cloudflare setup. Item 5 was done as described.

### Original list

1. Inventory live consumers of command-center / platform URLs and of the legacy `/api/v1/*` contract (Vercel access logs, supplier keys). Not possible from this environment.
2. Tell every live consumer of the legacy Business API (suppliers, integrations) to switch host; the keys do not change.
3. Cloudflare staging passes the acceptance list in `CLOUDFLARE_MIGRATION_AND_ROLLBACK.md`.
4. Repoint `scripts/cloudflare/*`, `cloudflare.yml`, `playwright.roles.config.ts`, `playwright.auth.config.ts` and `tests/cloudflare/staging.test.ts`, which still build and test the legacy apps.
5. Remove the apps on a branch with a one-step revert. Never delete databases, tenant data or Vercel projects as part of this.

## Vercel inventory (read-only, 29 Oct 2026)

| Project | Notes |
|---|---|
| `vandlabs-automobile-intelligence` | Next.js, latest deployment READY. The target app. |
| `vandlabs-automobile-command` | Next.js, READY, SSO-protected. Legacy. |
| `vandlabs-automobile-platform` | Legacy. |
| `vandlabs-automobile-web` | Public showroom. Out of the target architecture. |
| `automobile_engine_used_cars` | No framework detected, **latest deployment ERROR**. Root-level project, probably redundant. |

The final architecture needs one web project (Intelligence, or its Cloudflare Worker) plus the desktop release pipeline. No project was changed or deleted.
