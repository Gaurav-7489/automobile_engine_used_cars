# Verified staff access

Command Center and VandLabs Platform now verify Cognito **access** tokens at the
application boundary. The signature, expiry, issuer, token use and app client are
checked by `aws-jwt-verify`. Client-supplied `x-vandlabs-*` identity headers are
ignored. Middleware protects staff HTML and RSC requests; mutation handlers also
verify identity and authorize the actual resource independently.

## Modes

- `AUTH_MODE=demo`: explicit reference/demo identity. Required when running the
  built reference apps with `next start`. Never enable this on a real staff origin.
- `AUTH_MODE=cognito`: verified identity and server-provisioned permissions.
- Missing auth mode defaults to demo only outside production, without Aurora.
  Unknown modes and missing production mode fail closed with 503.
- Demo identity is rejected when `DATA_MODE=aurora`.

The shared PostgreSQL adapter and browser sign-in/refresh/logout flow are now implemented. See `production-runtime.md` for deployment configuration. No AWS deployment or live account acceptance has been performed.

## Cognito configuration

Supply these through server deployment configuration, never `NEXT_PUBLIC_*`:

```text
AUTH_MODE=cognito
COGNITO_USER_POOL_ID=<deployed-user-pool-id>
COGNITO_CLIENT_ID=<allowed-staff-app-client-id>
AUTH_PRINCIPALS_JSON=<server-owned-provisioning-registry>
```

The registry maps verified Cognito `sub` values to tenant, dealership, location
and capability grants. Example shape (identifiers must match the active data):

```json
{
  "<cognito-sub>": {
    "tenantId": "<tenant-id>",
    "dealershipIds": ["<dealership-id>"],
    "locationIds": ["<location-id>"],
    "capabilities": ["inventory:read", "lead:read", "lead:write", "task:write", "analytics:read"]
  }
}
```

`platform:admin` is a separate explicit cross-dealership administrative grant.
An authenticated subject missing from the registry receives 403. Missing or
invalid registry configuration receives 503. The registry is a bootstrap
provisioning boundary; replace it with an authorized server-side membership
repository when production data is implemented. Changes currently require a
server configuration update/restart.

Clients may provide `Authorization: Bearer <access-token>`. The future browser
login callback may set `__Host-vandlabs-access-token` with `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/` and no Domain. The verified `/auth/callback` endpoint issues this cookie.
Cookie-authenticated mutations additionally require a matching Origin; bearer
requests support desktop/API clients without a browser Origin. An invalid
Authorization header never falls back to a valid session cookie.

No production credentials are embedded in a browser or desktop build. Verification
uses the Cognito public JWKS endpoint; tokens are never logged by this adapter.

## Authorization coverage

- Lead updates: `lead:write` plus lead tenant, dealership and optional location.
- Follow-up creation/completion/reopening: `task:write` plus the associated lead's
  scope. Task tenant must match its lead; audit actor is the verified subject.
- Staff pages: read capabilities plus the configured deployment tenant/dealership; shared repositories filter permitted locations and records.
- Platform pages: `platform:admin`.

Auth errors return generic 401/403 responses. Staff page responses are private and
not cacheable. Staff API handlers remain independently protected if middleware
is bypassed; future endpoints must follow the same rule.

## Verification

```bash
pnpm test:security
pnpm build
pnpm test:e2e
pnpm test:auth:e2e
```

Security unit tests use generated RSA keys and signed JWTs with locally cached
public JWKS, including wrong signature/client/issuer/expiry/token-use cases and
negative scope tests. HTTP tests start the built apps in Cognito mode and prove
anonymous and forged-header requests cannot read staff pages or mutate leads/tasks.
No live AWS account is required for these regression tests.
