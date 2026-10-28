# Unified Automobile application

The user-facing entry point is `https://vandlabs-automobile-intelligence.vercel.app`.
The public showroom, dealer workspace and platform administration use this origin.
Role selection is automatic after login; users cannot choose extra permissions.

| Route | Surface | Authentication |
|---|---|---|
| `/`, `/inventory`, `/discover`, `/vehicles/:slug` | Public showroom | None |
| `/login`, `/join/:token` | Shared identity and invitations | Existing Intelligence identity |
| `/app/*` | Dealer workspace | Membership, role and branch |
| `/admin` | VandLabs administration | Platform admin plus two-factor authentication |
| `/for-dealers` | Intelligence product information | None |
| `/install`, `/manifest.webmanifest` | Installable desktop/mobile web app | Same account as browser |

## Implementation and deployment

Intelligence owns the outer origin, authentication, private APIs and app manifest.
An explicit allowlist in `apps/intelligence/lib/showroom-routing.ts` routes public
pages and public APIs to the separately built showroom. `SHOWROOM_ORIGIN` must be
an HTTPS origin; local development also permits `http://127.0.0.1:<port>`.
Keep it distinct from the outer origin to avoid a rewrite loop.

The public zone has `/showroom-assets` as its asset prefix. Public chunks, styles
and fonts are routed independently from Intelligence's `/_next` assets. Links
between zones use full document navigation so styles and router state cannot mix.
Public analytics uses `/api/showroom/events`; the existing private `/api/events`
endpoint retains its own schema and authentication behavior.

Deploy the showroom first. Configure its production `SITE_ORIGIN`, `APP_ORIGIN`
and `UNIFIED_APP_ORIGIN` as the outer origin; `DEALER_WORKSPACE_URL` as the outer
origin plus `/login`. Preserve its existing data mode and read-only settings.
Pin Intelligence's production `SHOWROOM_ORIGIN` to that tested showroom deployment,
then deploy Intelligence. Rollback is the previous Intelligence deployment; no
database migration or credential change is needed for this increment.

The installed application is a progressive web app. It opens `/login` in a
standalone window and uses the same server session and permissions. There is no
offline cache of private records. The older Tauri installers remain development
artifacts tied to the legacy Cognito flow; `/download` directs current users to
the installable web app and explicitly identifies that legacy limitation.

## Verification

- Build and typecheck both Next apps; lint changed source and tests.
- Run `pnpm test:intelligence-prod` for real-schema identity, admin and tenant isolation.
- Run `pnpm test:product` for public/private routing and manifest coverage.
- Build Intelligence with `SHOWROOM_ORIGIN=http://127.0.0.1:3000`, then run
  `pnpm exec playwright test --config playwright.unified.config.ts`.
- The unified browser suite checks desktop/mobile navigation, isolated assets,
  icons, authentication redirects, protected APIs and preserved public write protection.

## Remaining product work

One address does not certify completion of the full ecosystem blueprint. The
current public showroom is a read-only sample deployment, not a live stock feed
for every dealership. Live tenant-specific storefront mapping and protected
public enquiry ingestion still need implementation/activation. Licensed market
data, external ad publishing, messaging, billing and external SSO need their
providers. Native installer authentication, signing and installed-device testing
remain separate from the working web-app installation path. See
`INTELLIGENCE_PRODUCTION.md` for the live workspace's limits and provider setup.
