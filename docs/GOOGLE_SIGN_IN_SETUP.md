# Staff sign-in with Google (no AWS)

Stack: **Neon** (Postgres), **Cloudflare** (Workers, R2), optional **Vercel** previews, **Google OAuth** for staff.

## How it works
1. Staff open `/command` or `/platform` and are sent to Google (authorization code + PKCE).
2. The server exchanges the code (with the client secret) and verifies Google's signed **ID token**:
   issuer `accounts.google.com`, audience = your client ID, `email_verified = true`, and (optionally) your Workspace domain.
3. The verified, lower-cased **email is the staff identity**. Permissions come only from the server-owned registry
   (`AUTH_PRINCIPALS_JSON` for the first admin, then the database registry at `/platform/staff`) — never from the token.
4. Cookies are `__Host-`, HttpOnly, Secure. The ID token lasts up to 1 hour and is silently refreshed with Google's refresh token.

## One-time setup (owner)
1. Google Cloud Console → APIs & Services → **OAuth consent screen** (Internal for a Workspace, else External + test users).
2. **Credentials → Create OAuth client ID → Web application.**
   Authorised redirect URIs (exact):
   - `<APP_ORIGIN>/command/auth/callback`
   - `<APP_ORIGIN>/platform/auth/callback`
3. In the `cloudflare-staging` / production GitHub environment set:
   - variables: `AUTH_MODE=google`, optional `GOOGLE_ALLOWED_DOMAIN`
   - secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (`openssl rand -base64 32`), `DATABASE_URL`
     (pooled Neon `vandlabs_runtime`), `TENANT_CONFIG_JSON`, `AUTH_PRINCIPALS_JSON`, `AUTH_REGISTRY_MODE=database`
4. First admin, keyed by their Google email:
   `{"you@gmail.com":{"tenantId":"…","dealershipIds":["…"],"locationIds":["…"],"capabilities":["inventory:read","inventory:write","lead:read","lead:write","task:write","analytics:read","platform:admin"],"platformTenantIds":["…"]}}`
5. Deploy, sign in, then grant colleagues at `/platform/staff` by Google email.

## Notes
- The desktop app does not yet support Google sign-in (Google uses several endpoint origins; the desktop client accepts one). Desktop access stays disabled until that is added.
- Generic OIDC (`AUTH_MODE=oidc`) remains available for another provider.
- `DATA_MODE=aurora` is a legacy alias for shared Postgres; use `DATA_MODE=neon`.
