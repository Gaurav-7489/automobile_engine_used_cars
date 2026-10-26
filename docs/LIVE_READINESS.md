# Live readiness runbook: migrations, deploy, identity, Dealer AI, acceptance

Status: code prepared and tested locally on 17 October 2026. Nothing in this runbook
has been run against live Cloudflare, Neon or AWS. Staging goes first; production
follows only after staging acceptance passes and the owner approves each step that
cannot be undone.

Secret values never go in chat, commits, shell history or logs. Use the GitHub
environment secret store, a mode-0600 file outside the repository, or piped input.

## 1. Neon migrations 0007, 0008 and 0009

`pnpm db:migrate` applies **every** pending file in order: it cannot apply only some.
Use the direct (non-`-pooler`) admin connection as `MIGRATION_DATABASE_URL`, run it
from the repository root, and clear `DATABASE_HOST`, `DATABASE_NAME` and `DATABASE_PORT`.

0009 fixes a defect in 0007. `dealer_commerce` referenced `organizations(id)`, but the
application writes the tenant id, so a tenant whose organization id differs (the
documented template does) could never save commerce state. 0009:

- adds `UNIQUE (tenant_id)` on `organizations` (provisioning already allows one
  organization per tenant; the migration fails and rolls back if data disagrees),
- re-points the foreign key to `organizations(tenant_id)`,
- revokes `dealer_commerce` from any `vandlabs_app`/`vandlabs_runtime` role that is
  superuser or `BYPASSRLS` (staging's legacy `vandlabs_app`), and grants it to the
  restricted runtime role otherwise.

Per branch, staging first:

1. Read-only check: `SELECT name FROM schema_migrations ORDER BY name;` and
   `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'vandlabs_%';`
2. If `schema_migrations` is missing or incomplete while the 0001–0006 objects exist,
   **stop**. A replay fails at 0001. Backfill the rows for verified files only, with owner approval.
3. Create a Neon backup branch (e.g. `pre-0009-2026-10-17`) and record the restore point.
4. `MIGRATION_DATABASE_URL=<direct admin URL> pnpm db:migrate`. Staging prints only
   0009. Production prints 0007, 0008 and 0009.
5. Confirm no role that bypasses RLS can touch commerce rows, and the runtime role can:
   `SELECT g.grantee, g.privilege_type, r.rolbypassrls OR r.rolsuper AS bypass FROM information_schema.role_table_grants g JOIN pg_roles r ON r.rolname=g.grantee WHERE g.table_name='dealer_commerce' AND g.grantee <> (SELECT tableowner FROM pg_tables WHERE tablename='dealer_commerce');`
   Expect SELECT/INSERT/UPDATE for `vandlabs_runtime` (and for `vandlabs_app` only where it
   is a restricted role, as on Aurora) and no row with `bypass = true`.
6. Production has no organizations yet, so the deploy probe fails until the tenant
   is provisioned: `MIGRATION_DATABASE_URL=… pnpm db:provision-tenant <approved.json>`.
7. Gate: `DATA_MODE=neon HOSTING_PROVIDER=cloudflare NEXT_PUBLIC_PREVIEW_READ_ONLY=false TENANT_CONFIG_JSON=… DATABASE_URL=<pooled runtime URL> pnpm deployment:doctor web --probe`.

`db:provision-role` always resets the runtime password. Use it only together with
updating every `DATABASE_URL` secret.

Rollback: there are no down migrations. Restore the backup branch, after first
rolling back any Worker version that writes commerce state.

## 2. Staff sign-in (Google), tenant and runtime secrets (owner)

Follow [GOOGLE_SIGN_IN_SETUP.md](GOOGLE_SIGN_IN_SETUP.md): create a Google OAuth web client with the exact
redirect URIs, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL` (pooled,
user `vandlabs_runtime`), `TENANT_CONFIG_JSON` (its `seo.canonicalBase` must equal `CF_PUBLIC_ORIGIN`),
`DEALER_AI_SERVICE_TOKEN`, `AUTH_REGISTRY_MODE=database` and `AUTH_PRINCIPALS_JSON` (first admin, keyed by
Google email). `CLOUDFLARE_ACCOUNT_ID`, `CF_PUBLIC_ORIGIN` and `AUTH_MODE=google` are environment variables.

## 3. Deploy the gateway and apps

Actions → *Cloudflare build and deploy* → `target=staging`, `deploy=false` (preflight
only), then `deploy=true`. `cf:deploy` now deploys, in order: admission, the
environment's own Dealer AI Worker (`vandlabs-staging-dealer-ai`) with its tokens, the
three apps, then the gateway. `DEALER_AI_URL` and the AI token go only to Command Center.
If an environment was ever deployed by the earlier script, which sent them to every app, remove
the old copies once: `pnpm exec wrangler secret delete DEALER_AI_SERVICE_TOKEN --name <prefix>-web`
(and `DEALER_AI_URL`, and the same for `<prefix>-platform`), then rotate the token.

Rollback: `wrangler rollback <version> --name <worker>` (gateway first). On a first
deploy, disable the gateway's workers.dev route instead.

## 4. Dealer AI 403 / error 1010 and credential rotation

**Cause.** The Worker never returns 403; a wrong token gets 401. Error 1010 is
Cloudflare's edge rejecting the client signature before the Worker runs, and the
caller sent no `User-Agent`. An egress proxy on the original test machine is the
alternative explanation. Cloudflare Security → Events for the 13 October request
settles which.

**Fix in code.**

- Command Center calls the Worker through the `DEALER_AI` service binding, which never
  crosses the public edge. `DEALER_AI_URL` remains for non-Cloudflare hosts.
- The caller used `redirect: "error"`, which workerd rejects with a TypeError, so on
  Cloudflare every AI call failed before it was sent and showed as "unavailable".
  It now uses `redirect: "manual"`.
- The URL path sends `User-Agent: VandLabs-CommandCenter/1.0 (+dealer-ai)` and logs
  the status and `cf-ray` (never the token) when the call fails.
- Each environment gets its own Worker. Its workers.dev URL is off unless the
  GitHub variable `DEALER_AI_PUBLIC=true` is set. Keep it set on production only
  while the Vercel preview still uses `DEALER_AI_URL`.

**Rotation without downtime.** Tokens are 32 random bytes as base64url (43 characters):
`node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))"`,
piped straight into the secret store.

1. Set `DEALER_AI_SERVICE_TOKEN_ALTERNATE` = new token. Deploy. The Worker accepts old and new.
2. Swap: `DEALER_AI_SERVICE_TOKEN` = new, `DEALER_AI_SERVICE_TOKEN_ALTERNATE` = old.
   Update the token in any non-Cloudflare host that still calls the URL. Deploy.
3. Delete `DEALER_AI_SERVICE_TOKEN_ALTERNATE`. Deploy. The Worker's alternate becomes
   `retired`, which can never match.

The first production deploy replaces the hand-set `SERVICE_TOKEN` on
`vandlabs-dealer-ai` with the GitHub secret. Use a **new** value there, so that
deploy is the rotation. Then update or remove the Vercel preview's copy.

## 5. Live acceptance

`pnpm test:live` runs read-only checks against a deployed gateway; it never writes.

```
LIVE_BASE_URL=https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev pnpm test:live
```

- Anonymous: health reports PostgreSQL with writes on; robots excludes staff
  surfaces; staff APIs return 401 to anonymous and forged-header requests; staff pages
  redirect to sign-in; mutations reject forged identity.
- `LIVE_DEALER_AI_URL` (only when the AI URL is public; the full endpoint including
  `/explain`): a service client gets 401, not 403/1010.
- Staff sessions: sign in through the hosted UI with TOTP and save the session with
  `npx playwright codegen --save-storage=/secure/command.json "$LIVE_BASE_URL/command/login"`
  (separately for `/platform`). Then set `LIVE_COMMAND_STATE`, `LIVE_PLATFORM_STATE`
  and `LIVE_TENANT_ID`. Each staff test loads its app page first, which refreshes the
  15-minute access cookie, so a saved session works until its refresh token expires. Readiness must report verified tenant-isolated reads, and
  snapshots must ignore forged tenant headers. Delete the session files afterwards.

The write journey (enquiry → task → visit → sale → delisting) and the AI commentary
call stay a manual checklist on staging, using owner-approved synthetic records.
