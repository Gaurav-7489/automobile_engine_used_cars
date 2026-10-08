# Shared runtime, login and desktop

The website, browser Command Center and native desktop client now share one
PostgreSQL data adapter. `DATA_MODE=aurora` selects PostgreSQL; `demo` retains the
reference adapter. There is no automatic production fallback to demo files.

## Implemented data flow

- Published inventory is queried at request time, including newly published slugs.
- Website enquiries create a durable lead and evaluate follow-up rules in the same
  transaction. Journey events are persisted in the same tenant database.
- Staff snapshots read vehicles, leads, tasks, appointments, activity, journey
  evidence and automation records under verified tenant/dealership/location scope.
- Lead updates, task scheduling/completion and associated audit records are atomic.
- `inventory:write` can change price, publication and availability through the
  staff API. Native “mark sold” changes the availability read by the website.
- A partial unique index protects successful automation runs from duplicate tasks.
- Every transaction checks the database role and sets transaction-local tenant
  context. Superuser/BYPASSRLS roles are rejected. Composite foreign keys prevent
  cross-tenant parent links; RLS is forced for operational tables.

The current production automation adapter creates internal tasks. WhatsApp rules
are held; no message delivery or provider connection is claimed. Staff provisioning
still uses a server-owned subject-to-scope registry, not self-service onboarding.
The Platform control-plane screens remain reference administration interfaces;
they are protected by login but are not production provisioning/billing services.

## Configure AWS and PostgreSQL

1. Deploy the CDK stack in staging with real `staffCallbackUrls`, `staffLogoutUrls`
   and a globally unique `cognitoDomainPrefix`. Production synthesis rejects the
   placeholder domains. No stack was deployed from this workspace.
2. Provide a TLS-verified migration/admin URL and run `pnpm db:migrate` from an
   execution environment with private Aurora network access.
3. Set `APPLICATION_DATABASE_SECRET_ARN` to the new application secret and run
   `pnpm db:provision-role` under an identity allowed to read that secret. This
   creates/configures `vandlabs_app` without superuser/BYPASSRLS grants. The master
   database secret must not be used by the application.
4. Load authorized real dealership records/configuration. For an **empty staging
   database only**, `ALLOW_REFERENCE_SEED=true pnpm db:seed` imports the reference
   dataset and writes a secret-free UUID config to `.runtime/tenant-config.json`.
   Reference seed deliberately refuses a non-empty database.
5. Configure server `TENANT_CONFIG_JSON` with the correct UUID identifiers and
   deployment branding/domain/contact data. Configure the staff registry with
   matching scopes. Use `.env.example` as the variable reference.
6. Set `DATABASE_SECRET_ARN` to the **application-role** secret, plus host, database,
   region and the RDS root CA file. Grant least-privilege Secrets Manager access.
   TLS verification is enabled. `DATABASE_TLS=off` is local-development only.
7. Deploy the Next.js apps on a Node runtime with private database connectivity,
   HTTPS origins and outbound access to Cognito JWKS/token endpoints.

Migrations run under an advisory lock and an applied-migration ledger. Do not
change existing migrations after application. Back up existing data before an
upgrade; the tenant-link migration rejects inconsistent parent relationships.
The first tenant backfill assumes an organization belongs to one tenant.

## Browser sign-in

Both staff apps expose login, callback, refresh and POST logout endpoints. The
login redirect uses a random state and S256 PKCE; encrypted flow cookies expire in
10 minutes. Callback verifies state and redeems the code, then verifies the access
token and staff provisioning before issuing cookies. Tokens are never in URLs.

Access cookies and encrypted refresh cookies use Secure, HttpOnly, SameSite=Lax
and `__Host-` constraints. Use separate HTTPS origins for the two staff apps to
avoid cookie collisions. `SESSION_SECRET` is 32 random bytes in base64, held in
server secrets configuration. Navigation to an expired session uses refresh;
unauthenticated browser navigation reaches the login page. API requests return
401/403 and never redirect a desktop client into HTML.

Configure exact callbacks and logout URLs for each deployment. Set
`COGNITO_CLIENT_ID` to the web client. `COGNITO_CLIENT_IDS` lists allowed web and
desktop client IDs from the same pool. Real staff accounts must be provisioned in
Cognito and in `AUTH_PRINCIPALS_JSON`. Do not put these server settings in a public
build. No live Cognito account/sign-in was available in this workspace.

## Desktop application

`apps/desktop` is a standalone React/Tauri 2 client with Today, Inventory, Leads,
Follow-ups, stage changes, task scheduling/completion and availability editing.
Its assets are bundled locally, and it calls the same staff API.

Sign-in opens the system browser and uses S256 PKCE with a loopback callback at
`http://localhost:43821/callback`. Register that exact URL on the public Cognito
desktop client. The loopback listener binds only 127.0.0.1, validates state and
expires after 3 minutes. Token exchange and API requests happen in Rust. Refresh
credentials are stored in Windows Credential Manager/macOS Keychain, bound to
API origin, Cognito domain and client ID. JavaScript receives data, not tokens.
Connection settings are public identifiers saved locally. Only HTTPS origins are
accepted; API methods and paths are allowlisted. No AWS/database secrets ship in
an installer. The application is online only.

The `Desktop installers` workflow builds Windows x64 NSIS `.exe` and macOS
universal `.app`/`.dmg` on their native runners, and uploads installers as Actions
artifacts. Builds are unsigned development installers until signing certificates
and Apple notarization credentials are configured. No silent auto-updater is
implemented; install a newly approved release to update.

## Verification

`pnpm test:database` runs the migrations and repository operations against an
embedded real PostgreSQL engine, including RLS, scopes, duplicate automation,
transaction-local context, sold availability, and rollback after audit failure.
It does not certify Aurora networking/TLS/backup operations.

`pnpm test:security` covers JWT validation and the browser flow's state,
PKCE, encryption, safe return paths and cookie policy. Staff denial tests and
reference API/UI regressions run separately. Native Rust tests and installer
compilation run on Windows/macOS in the desktop workflow.

Production acceptance still requires the configured deployment: real sign-in,
website enquiry to shared database to staff/desktop snapshot, mark sold to website,
backup restore, secret rotation, and signed distribution as appropriate.

## Appointment and sale extension

Apply migration `0003_sales_inventory_history.sql` before deploying this release. Existing application roles receive read/insert grants during migration; a newly provisioned role receives the same grants via `pnpm db:provision-role`. Sales and inventory history force tenant RLS, use tenant-aware foreign keys and allow append-only application writes. Staff snapshots additionally restrict by dealership/location.

Visit scheduling creates an internal reminder task and lead activity. Confirmed sale requires both lead and inventory write capabilities, serializes on the lead/vehicle, records a positive INR amount and non-future sale time, marks Won, archives sold inventory and completes its open tasks in one transaction. Retries of identical sale details return the same record; changed details conflict. An ordinary inventory update cannot reopen a confirmed sale. No external marketplace delisting, finance approval, accounting margin or provider delivery is implied.
