# Google-only sign-in

Everyone signs in to the one Intelligence application with **Continue with Google**. Passwords, password resets and authenticator-app codes are no longer part of the product. Each person's Google identity decides which private dealership workspace they open; PostgreSQL row-level security still isolates every dealership.

## How access is granted (nobody gets in by having a Google account)

| Who | How they are approved | What binds on first sign-in |
|---|---|---|
| VandLabs Super Admin | `pnpm intelligence:bootstrap-admin` on the **database owner connection** (the application cannot do this) | Google `sub` + platform administrator grant + the internal "VandLabs" workspace |
| Dealership owner | Super Admin → Add dealership, with the owner's **Google email** | Google `sub` + owner membership of that dealership |
| Staff | Owner → Settings, Team, invite by **Google email** (existing staff feature) | Google `sub` + the invited role and branches |
| Existing password users | Already members | Linked by verified email **only** when Google is authoritative for the address (`@gmail.com`, or a Google Workspace domain matching the `hd` claim). Other addresses need an approval (invite or admin assignment). Platform administrators are never linked by email; they need the bootstrap approval. |

After the first sign-in the account is bound to the Google **subject id** (`sub`). A different Google account with the same email is refused (`conflict`); a renamed Google account keeps working. Approvals are single-use.

Implementation: `intelligence_google_signin` (migration `0024`), `lib/server/google-signin.ts`, `app/api/auth/sso/[provider]/…`.

## Access requests (Google accounts with no access)

A verified Google account that has no access is sent to `/request-access` instead of an error. There it sends its name, business and dealership names, mobile, city, state and an optional note. The email is not typed: it is the Google-verified address, carried in a signed, 30-minute httpOnly cookie set by the callback, so nobody can ask on behalf of an address they did not just prove they control. Asking grants nothing.

Requests appear in the admin console (Overview and Dealerships → **Access requests**). **Approve** (with a fresh Google confirmation) creates the dealership with one branch from the request (names can be corrected) and assigns that Google account as owner; the person then chooses Continue with Google and lands in their new workspace. **Decline** records an optional reason; after three declines in 30 days the same Google account cannot send more. Migration `0025`.

## OpenID Connect checks

- Authorization code flow with **PKCE S256**. The verifier lives only in an httpOnly, `__Host-` cookie; the URL carries the challenge.
- Signed, 10-minute **state** bound to that cookie (a callback from another browser fails), and a **nonce** checked in the ID token.
- The code is exchanged server to server (client secret never reaches the browser). The ID token comes straight from Google's token endpoint over TLS (OIDC Core 3.1.3.7); it must have issuer `accounts.google.com`, our client as the only audience (and `azp` when present), an unexpired `exp`, a sane `iat`, our nonce, a `sub` and `email_verified: true`.
- Redirect URI is fixed: `${APP_ORIGIN}/api/auth/sso/google/callback`. `APP_ORIGIN` wins over request headers.
- Sessions: signed HttpOnly cookie, 8 hours, re-validated against the database on every request (suspension and revocation apply at once). The session records `amr: "google"`.

## Admin console and sensitive changes

- `/admin` shows real dealership data only to a platform administrator whose session came through Google sign-in (this replaces the mandatory authenticator-app gate). Keep **2-Step Verification on the Super Admin's Google account**.
- Every admin change (create dealership, change owner, link a website, plans, suspensions) and owner-sensitive actions (API keys, role escalation, messaging tokens) need a **fresh Google confirmation**: a small Google window with `max_age=300`; the server checks the confirming account is the one bound to this user, for this session, and that `auth_time` is within 5 minutes, then grants 10 minutes.

The confirmation request explicitly asks for the `auth_time` ID token claim. In Google Auth Platform, confirm the OAuth app is published and verified, then enable **Session age claims** under **Settings → Advanced Settings**. If confirmation still fails, filter the production runtime logs for `google_callback_rejected` or `google_reauth_rejected` to see which check failed.

## Dealerships

Super Admin → **Add dealership**: business name, dealership name, owner name, **owner's Google email**, branches. No link, password or email service. The owner opens the app, chooses Continue with Google with that account, and lands in their workspace. Before they sign in, **Change owner** corrects the email.

## Websites

Super Admin → dealership → **Website** → enter the site's address → a website key is shown once. On the website's own Vercel project set:

```
VANDLABS_API_URL=https://vandlabs-automobile-intelligence.vercel.app
VANDLABS_API_KEY=<the key shown once>
```

and redeploy it. Owners never type a password into their public website. Existing website connections keep working. Unlinking stops the website at once. (Template change: `Gaurav-7489/templete-one-VLuce`, branch `feat/admin-linked-connection`.)

## Environment variables (Vercel → automobile intelligence project → Settings → Environment Variables)

| Variable | Value | Environments |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud project `white-proxy-512104-n3` | Production, Preview |
| `GOOGLE_CLIENT_SECRET` | its client secret (mark **Sensitive**) | Production, Preview |
| `APP_ORIGIN` | `https://vandlabs-automobile-intelligence.vercel.app` (Production); the preview's own URL for a preview test | each |
| `SESSION_SECRET` | existing value, 32+ characters — **do not change** (changing it signs everyone out) | unchanged |
| `LEGACY_PASSWORD_LOGIN` | `enabled` only during the migration window or a rollback; otherwise **unset** | Production |

Google Cloud → APIs & Services → Credentials → the OAuth client → **Authorized redirect URIs** must contain exactly `https://vandlabs-automobile-intelligence.vercel.app/api/auth/sso/google/callback` (add a preview URL only for a preview test). The OAuth consent screen must be **In production** (or list the test users) for owners' Gmail accounts to sign in.

## Rollout (no data is deleted at any step)

1. Back up: create a Neon branch of production.
2. Run migrations on production: `MIGRATION_DATABASE_URL=… pnpm db:migrate` (0023 if not yet applied, then 0024; both additive).
3. Set the environment variables above with `LEGACY_PASSWORD_LOGIN=enabled`, deploy.
4. Bootstrap the Super Admin (owner connection):
   `MIGRATION_DATABASE_URL=… pnpm intelligence:bootstrap-admin --email vandlabsstudio@gmail.com --name "VandLabs Studio" --by "<your name>"`
5. Open the app, Continue with Google as `vandlabsstudio@gmail.com` → you must land on `/admin` with "Signed in with Google".
6. Add a test dealership with a second Google account as owner; sign in with it in a private window → it lands in that dealership only; `/admin` is "not found" for it.
7. Check an existing member: Continue with Google with their Gmail address opens their workspace.
8. Check suspension (admin → People → Suspend) signs them out; sign-out works; an unassigned Google account is refused.
9. Remove `LEGACY_PASSWORD_LOGIN` and redeploy. Admin → System shows "Legacy password sign-in: Off".

**Rollback**: set `LEGACY_PASSWORD_LOGIN=enabled` and redeploy (password sign-in, invitation passwords and the website password connect work again; Google sign-in keeps working), or promote the previous deployment. 0024 only adds a column, a table and functions; older deployments ignore them.

## Tests

- `tests/intelligence-prod/google-auth.test.ts` (PostgreSQL via PGlite): ID-token checks, PKCE/state, bootstrap is owner-only and one-time, binding by `sub`, conflicts, owner activation, reassignment, unknown-account rejection, existing-member linking rules, invitations, suspension, tenant isolation, step-up, admin website linking.
- `tests/google-auth/*.spec.ts` (`playwright.auth.config.ts`, production build on PostgreSQL 16): Google-only login page (desktop and mobile, axe), the authorization request (PKCE S256, nonce, state, redirect URI), forged callbacks, legacy endpoints off, admin/owner/legacy-session behaviour, sign-out. See `tests/google-auth/README.md`.
- These do **not** sign in to a real Google account. Live sign-in must be checked in staging (steps 5–8 above).
