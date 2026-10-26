# Temporary Vercel preview

Vercel is a temporary hosting target explicitly requested by the user. The approved stack is Neon (data), Cloudflare (Workers/R2) and Google sign-in (staff); see `GOOGLE_SIGN_IN_SETUP.md`.

Three independent Next.js projects share this repository:

| Project | Root | Entry |
|---|---|---|
| vandlabs-automobile-web | apps/web | / |
| vandlabs-automobile-command | apps/command-center | /command |
| vandlabs-automobile-platform | apps/platform | /platform |

Use Node 22 or 24, pnpm 10.17.1, source files outside the app root enabled, frozen install and the app's `pnpm build`. All deployments require Vercel Authentication (`ssoProtection.deploymentType=all`). No custom domains or production promotion are included.

Preview configuration: `DATA_MODE=demo`, `AUTH_MODE=google` (the legacy `cognito` value is now rejected), `NEXT_PUBLIC_PREVIEW_READ_ONLY=true`. These values contain no secrets. The website labels reference inventory, removes enquiry forms and contact conversion, disables journey recording, and rejects lead/event POSTs with 503 before accepting data. It disallows search indexing. Staff apps retain Google authentication and fail closed without configured accounts; Vercel login does not replace staff authorization.

The local file adapter is not shared serverless storage. Do not redirect it to /tmp or claim enquiry persistence. The full connected hosted workflow requires all three projects to use the same TLS Neon PostgreSQL database, migrations/role grants, Google OAuth client and scoped staff provisioning. Database URLs and credentials belong only in secure server environment configuration. Once configured and verified, remove the browsing-preview flag and use `DATA_MODE=neon`; retain authenticated staff access.

Local `pnpm demo` remains the fully connected reference demonstration. Native installers require the configured authenticated backend and are not deployed by Vercel.

## Staff login routing correction

Next.js removes the configured `basePath` from `NextURL.pathname` inside middleware. Both staff middleware handlers normalize the path before checking login/auth exclusions and constructing return URLs. Missing staff configuration now displays an explicit setup message on the public login page instead of offering an unusable sign-in action. The login page exposes no operational records or credentials; staff/API authorization remains mandatory.

Hosted operations are blocked until the projects receive their common database configuration and each staff origin receives `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` and matching `AUTH_PRINCIPALS_JSON`. These settings must be configured securely by an authorized administrator. Sign-in session keys and database credentials must not appear in chat or client bundles. Automatic production Git builds are skipped during this preview-only phase; explicit preview deployments remain enabled.

## Environment requirements per Vercel project (Google sign-in)

Set in Vercel > Project > Settings > Environment Variables. Secret values are never committed or pasted into chat.

| Variable | web | command | platform | Notes |
|---|---|---|---|---|
| `AUTH_MODE` | `demo` or `google` | `google` | `google` | `cognito` is rejected |
| `DATA_MODE` | `demo` until staging passes, then `neon` | same | same | all three must match |
| `APP_ORIGIN` | n/a | `https://vandlabs-automobile-command.vercel.app` | `https://vandlabs-automobile-platform.vercel.app` | exact origin, HTTPS |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | n/a | yes (secret) | yes (secret) | same OAuth web client, redirect URIs `<origin>/command/auth/callback` and `<origin>/platform/auth/callback` |
| `SESSION_SECRET` | n/a | yes (secret) | yes (secret) | `openssl rand -base64 32`; use different values per app |
| `AUTH_REGISTRY_MODE`, `AUTH_PRINCIPALS_JSON` | n/a | yes | yes | first admin keyed by Google email |
| `DATABASE_URL`, `TENANT_CONFIG_JSON` | yes | yes | yes | pooled restricted `vandlabs_runtime` URL; never the rotated-out exposed credential |
| `UPSTASH_REDIS_REST_URL/TOKEN` | yes | n/a | n/a | public writes need a shared limiter off Cloudflare |
| `NEXT_PUBLIC_PREVIEW_READ_ONLY` | `true` until acceptance | `true` until acceptance | `true` until acceptance | rebuild after changing |

## Duplicate failing project `automobile_engine_used_cars`

Diagnosis from the repository (build logs could not be read; the Vercel connector returned 403 for this team):
- The three real projects use roots `apps/web`, `apps/command-center`, `apps/platform` (table above). The failing project has no root directory (it builds the repo root), and there is no `vercel.json`.
- The root `package.json` build is `turbo build`, which emits `.next` inside each app folder and nothing at the repo root, so a root-level Vercel project has no output to serve and fails on every commit.
- It first appeared after the 16 Oct audit (PR #37 shows only the three real projects).

Recommended correction, not applied (no project is deleted automatically): in Vercel, either delete this project, or set its Root Directory to exactly one app folder, or set Settings > Git > Ignored Build Step to skip it. Check `Settings > Git > Production Branch = main` on the three real projects. This document previously noted production Git builds are skipped during the preview phase, so merging to `main` may not redeploy production until that setting is changed deliberately.
