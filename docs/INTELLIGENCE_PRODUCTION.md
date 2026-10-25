# VandLabs Automobile Intelligence: production runbook

Application root `apps/intelligence`. Independent Vercel project `vandlabs-automobile-intelligence`; it shares the Neon database with Command Center and the public website but deploys on its own.

## Architecture

- Next.js 15 (Node runtime). Pages render from a server-loaded workspace; every change is a named command posted to `POST /api/workspace/commands`, which the server re-executes against the authoritative state inside one tenant-scoped transaction (`pg_advisory_xact_lock` per tenant). The browser applies the same pure rule functions optimistically for instant feedback, then adopts the server's result.
- Tenancy: `app.tenant_id` is set per transaction by `@vandlabs/data` `tenantTransaction`, which refuses to run on a role that is superuser or `BYPASSRLS`. Every table touched has forced row-level security.
- Browser input is untrusted: commands come from a fixed registry (`lib/actions/registry.ts`), patch arguments are reduced to allowed fields, and re-authentication is decided by a signed server cookie, never by the caller.
- Responses are redacted to the member's branches and capabilities (`lib/server/redact.ts`).

## Data mapping

| Intelligence | Shared table | Notes |
|---|---|---|
| Branch | `locations` | id is the location uuid |
| Vehicle | `vehicles` + `stock_costs` + `inventory_history` | id is `stock_id` (`V-1001`); cost split kept in `intelligence_documents`; shared row wins when it changed later |
| Lead and follow-ups | `leads` + `tasks` | `payload.intelligenceId` keeps the display id; website enquiries are imported as `L-<uuid8>` |
| Sale | `intelligence_documents` (`sales`) and, once linked to a lead, `sales` | `sales` is append-only and requires a lead; walk-in sales stay in the Intelligence ledger |
| Staff | `staff_members` | role stored as a valid platform role plus `intelligenceRole` overlay (inventory, finance) |
| Campaigns, price requests, alerts state, policy, saved searches, audit | `intelligence_documents` | tenant-scoped, RLS |
| Invitations, reset links | `intelligence_tokens` | SHA-256 hash only, one-time, expiring |

Migration `0010_intelligence_workspace.sql` is additive (new tables and `SECURITY DEFINER` functions only). Credentials live in `intelligence_users` and are reachable only through those functions.

## Authentication

Email and password; scrypt hashes; five failed attempts lock an account for 15 minutes; per-address and per-client rate limits; signed HttpOnly `__Host-` session cookie (8 h) that is re-validated against the database on every request (disabled users, revoked sessions and role changes take effect immediately). No account can be created without a one-time link: workspace provisioning (`pnpm intelligence:provision`, administrator connection only) prints an owner setup link once; owners invite staff from Settings, Team; owners issue one-time reset links. No mail service is connected, so links are copied and shared by the owner. Multi-factor authentication and SSO are not available in this release.

## Provision a workspace (administrators)

```bash
MIGRATION_DATABASE_URL=... APP_ORIGIN=https://<production-host> \
pnpm intelligence:provision --organization "Legal Name" --dealership "Display Name" \
  --location "Branch|City|State|Phone" --owner-email owner@dealership.example --owner-name "Owner Name"
```

The command refuses to touch an existing organization and never prints or stores a password.

## Environment (web deployment)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | pooled Neon URL for the restricted `vandlabs_runtime` role (never the owner) |
| `SESSION_SECRET` | 32+ random characters |
| `DATABASE_POOL_MAX` | optional; 2 on Vercel by default |
| `BLOB_READ_WRITE_TOKEN` | set by Vercel when the Blob store `vandlabs-intelligence-photos` is connected; enables photo upload |

Do not set `MIGRATION_DATABASE_URL` on the web deployment.

## Release procedure

1. Create a Neon branch of `production` as the backup (name it `pre-intelligence-<date>`).
2. Apply `0010_intelligence_workspace.sql` to `staging`, run `pnpm test:intelligence-prod`, then smoke-test.
3. Apply to `production` (additive; takes seconds) and record it in `schema_migrations`.
4. Deploy the application; check `GET /api/health` (database round trip).
5. Provision the first workspace and sign in with the owner link.

## Rollback

- Application: promote the previous Vercel deployment. Nothing in the schema is required by older deployments.
- Database: `0010` only adds objects. To revert, drop the `intelligence_*` tables and functions after confirming no tenant data is needed, or restore the backup branch. Existing platform tables are never altered.

## Built in (no outside provider)

- **Two-factor login**: Settings, Security. Authenticator-app codes (RFC 6238). Turning it on needs the password; turning it off needs a current code. Migration `0011`.
- **API keys**: Settings, API access (Owner). Read-only `inventory:read` or `leads:read`, scoped to the creator's branches, expiring, revocable, stored as SHA-256 hashes. Endpoints `GET /api/v1/inventory` and `GET /api/v1/leads` with `Authorization: Bearer <key>`; 60 requests a minute per key. Costs and margins are never exposed.
- **Photo upload**: vehicle drawer, Media tab. JPEG/PNG/WebP up to 8 MB, 20 per vehicle, content checked by file signature, written to the shared vehicle `media` so the owned website uses the same set.
- **Plausibility checks** (build review, 25 Oct 2026): warnings need confirmation; asking above 5× landed cost, or zero landed cost on Available, needs an Owner reason, which is audited.

## Needs an outside provider (shown as "Setup required", never simulated)

| Feature | What the owner must supply |
|---|---|
| Market data (Radar, valuations, regional comparison) | A licensed Indian used-car listings/valuation feed: contract, API credentials, coverage and refresh cadence |
| Ad publishing | Meta Business and/or Google Ads account, developer/app approval, an ad account with a spend cap |
| Messaging | WhatsApp Business (Meta Cloud API or a BSP), SMS (DLT-registered sender and templates), email (verified sending domain) |
| Single sign-on | Google Workspace and/or Microsoft Entra OAuth client (client ID, secret, allowed domain) |
| Billing | Razorpay or Stripe account (KYC complete), plan prices, webhook secret |

## Known limits

- Sales recorded without a lead are not mirrored into the shared `sales` table.
- TOTP codes may be reused within their 30-second window.
- Cost fields are visible to every role that can see inventory; branch scope and contact masking are enforced, per-field cost redaction is not.
- Rate limiting is per server instance plus the database account lockout.
- No error-monitoring service is attached; failures are logged as structured JSON to the host's log stream.
