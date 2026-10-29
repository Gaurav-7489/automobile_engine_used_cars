# Engineering audit, October 2026

Branch `claude/gifted-euler-7xp1hf`, starting at `c97c720` (merge of PR #40). Environment: Node 22.22, pnpm 10.17.1, PostgreSQL 16 (local, TLS on), production `next build`.

## Baseline before changes

| Check | Result |
|---|---|
| `pnpm typecheck` | pass (6/6 packages) |
| `pnpm lint` | pass |
| `test:security` / `test:database` / `test:intelligence` / `test:product` / `test:intelligence-prod` / `test:cloudflare` | 39 / 35 / 30 / 12 / 6 / 25 passing, 0 failing |
| `next build` (intelligence) | pass; shared first-load JS 102 kB, heaviest page 155 kB |

Not run in this session: the Playwright suites for `apps/web`, `apps/command-center` and `apps/platform` (they need their own demo servers), desktop builds, and anything against the real Neon/Vercel deployment (no credentials here).

## Map

- `apps/intelligence`: unified entry (login, role-based workspace, `/admin`, install page; showroom served behind the same origin). 145 TS files.
- `apps/web` public showroom; `apps/command-center` and `apps/platform` legacy staff apps (OIDC); `apps/desktop` Tauri shell.
- `packages/`: contracts, data (Postgres pool, tenant transactions), demo-data, design-system, server-auth.
- Migrations `0001`–`0012` existed; `0013` (reauth) and `0014` (rate limits) are added here. Both are additive.
- CI: `quality.yml`, `cloudflare.yml`, `desktop-*.yml`, `staff-identity.yml`.

## Findings

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | P1 | `POST /api/auth/reauth` called `signIn()`: password confirmation also performed membership selection, advanced or reset the **sign-in** lockout counter, accepted any `mfa_required` as proof, and reported "locked" as "wrong password". Grant cookie was bound only to the user, not the session. | **Fixed** (see below) |
| 2 | P2 | One workspace page render issued 16 sequential database statements (measured via `log_statement=all`). Ten were one `Promise.all` that a single connection still runs one at a time. | **Fixed**: 6 statements, 5 on the critical path |
| 3 | P2 | Rate limits were in-process maps: ineffective across serverless instances and restarts. | **Fixed for Intelligence** (shared DB limiter) |
| 4 | P2 | Photo upload, owner reset link, API-key changes, admin user suspension and owner re-invite had no rate limit. | **Fixed** |
| 5 | P2 | Every `/app` page load reads the whole tenant (all vehicles, leads, sales, tasks). Fine at current size; will not scale. | Open. Needs pagination/selective loading per page |
| 6 | P2 | Legacy apps (`command-center`, `platform`) still hold capabilities Intelligence lacks. | Open, see `LEGACY_APPLICATION_RETIREMENT.md` |
| 7 | P2 | Other apps still use their own in-memory limiters (not audited in depth here). | Open |
| 8 | P3 | `/api/health` swallowed the database error, which made a TLS misconfiguration undiagnosable. | Fixed: structured log line, no secrets |
| 9 | P3 | Mobile KPI card: info icon overlapped the label ("Est. gross at asking"). | Fixed |
| 10 | P3 | On phones the primary call-to-action in page heads is not full width (`.primary-cta` rule does not reach the wrapper). | Open, cosmetic |

### Finding 1 detail

- Root cause: `apps/intelligence/app/api/auth/reauth/route.ts` → `signIn()` in `lib/server/identity.ts`.
- Reproduce (before): with a two-factor account, wrong passwords incremented `failed_attempts` toward the 15-minute **login** lock; a locked account saw "That password is not correct".
- Fix: `reauthenticate(userId, password)` plus migration `0013`: `intelligence_reauth_state(uuid)` and `intelligence_record_reauth(uuid, boolean)` (SECURITY DEFINER, fixed search_path, granted to the runtime role only). It verifies the signed-in user's own hash, keeps its own counter (`reauth_failed_attempts`, five failures pause confirmation for ten minutes), is also refused while a sign-in lock is active, never selects a membership, treats disabled accounts as a wrong password, and burns equal time for unknown or locked cases. Grant: signed cookie `{sub, sid = session issue time, scope: "step-up", exp}` for 10 minutes; `hasRecentReauth` requires the same user **and** the same session. Two-factor is unchanged: `adminAccess()` still requires an enabled authenticator on every admin request.
- UI: `GET /api/auth/reauth` reports a held grant; admin dialogs then skip the password field and only ask again if the server returns `reauth_required`.
- Verification: unit tests in `tests/intelligence-prod/admin.test.ts` (wrong/empty/oversize/malformed id/other person's password, separate lockout, sign-in unaffected, disabled, sign-in lock, runtime role cannot read hashes); browser test `tests/local-stack/dealership-creation.spec.ts` against real PostgreSQL covers admin sign-in with TOTP → Add dealership → wrong password rejected → create → link → reload shows it → second dialog needs no password → owner activates → owner reaches workspace → owner gets 404 on `/admin`.

### Requested dealership-creation scenarios

| Scenario | Evidence |
|---|---|
| Correct / incorrect password, locked, disabled | unit tests; E2E for correct/incorrect |
| Missing admin permission, missing 2FA | existing `admin.test.ts` and `/admin` gate; E2E confirms owner gets 404 |
| Invalid input, duplicate organization | existing `validateWorkspace` and duplicate tests |
| Expired grant | server returns `reauth_required`; dialog re-shows the field (code path, not browser-tested) |
| Double click | button is `aria-disabled` while loading and ignores clicks (existing `Button`); not separately stress-tested |
| Partial creation on failure | provisioning is one `intelligence_admin_provision` call, so it is atomic by construction; no failure-injection test was written |
| Network interruption, DB unavailable | not tested in a browser; API returns a generic retry message |
| Owner invite expiry, multiple memberships | existing identity tests |
| Expired session | middleware redirect, existing tests |
