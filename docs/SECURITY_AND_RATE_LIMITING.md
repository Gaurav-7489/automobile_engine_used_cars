# Security and rate limiting

## Password confirmation (step-up)

See the audit, finding 1. Summary: dedicated one-user functions; own counter and lockout; refused during sign-in lock; no workspace selection; disabled = wrong password; generic errors; grant bound to user + session + scope, 10 minutes; two-factor still required for every admin request. The runtime role cannot select from `intelligence_users` directly (tested).

## Shared rate limiter

Migration `0014`: `intelligence_rate_limits` (RLS forced, no runtime access) and `intelligence_rate_hit(key_hash, limit, window_seconds)`, an atomic fixed-window counter. Keys are SHA-256 hashed in the app, so no email or address is stored. Expired rows are cleaned up opportunistically. If the database cannot be reached the in-process limiter answers, so an outage neither disables limiting nor locks everyone out; a structured `rate_limit_store_unavailable` log is written. Responses are standard 429 with `Retry-After` and a `retry_after` body field.

| Endpoint | Limit |
|---|---|
| Login | 8 / 10 min per address+email, 40 / 10 min per address |
| Reauth | 8 / 10 min per address+user (plus 5-failure confirmation pause) |
| Two-factor changes | 10 / 10 min |
| Token redeem / info | 10 / 30 per 10 min |
| Admin create dealership | 20 / hour per admin |
| Admin suspend/restore | 30 / 10 min per admin |
| Owner re-invite | 10 / hour per admin |
| Owner reset link | 10 / hour per user |
| API-key changes | 10 / hour per user |
| Vehicle photos | 60 / 10 min per user |
| Workspace commands | 240 / min per user |
| Public demo/access forms | 8 / 10 min per address |
| `/api/v1/*` | 120 / min per address, 60 / min per key |

Not covered: search and AI endpoints (not present in Intelligence), per-tenant quotas, data export, and the other apps' limiters. Cloudflare/Vercel edge rules would be a useful outer layer; none were configured. `clientKey` trusts the first `x-forwarded-for` entry, which is correct on Vercel (the platform overwrites it) but must be re-checked on any other host.

## Verified

`tests/intelligence-prod/rate-limit.test.ts` (counting, Retry-After, window rollover, hashed keys, runtime role has no table access, argument validation, outage fallback). Browser test exercised the limiter incidentally (test logins hit the per-address limit).

## Not done

No penetration test, dependency audit, CSRF re-audit (existing `sameOrigin` checks were left in place and are present on every new route), file-content validation review, or RLS audit of the legacy apps.
