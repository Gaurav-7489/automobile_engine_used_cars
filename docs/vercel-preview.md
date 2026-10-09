# Temporary Vercel preview

Vercel is a temporary hosting target explicitly requested by the user. The approved AWS data/authentication architecture remains authoritative.

Three independent Next.js projects share this repository:

| Project | Root | Entry |
|---|---|---|
| vandlabs-automobile-web | apps/web | / |
| vandlabs-automobile-command | apps/command-center | /command |
| vandlabs-automobile-platform | apps/platform | /platform |

Use Node 22 or 24, pnpm 10.17.1, source files outside the app root enabled, frozen install and the app's `pnpm build`. All deployments require Vercel Authentication (`ssoProtection.deploymentType=all`). No custom domains or production promotion are included.

Preview configuration: `DATA_MODE=demo`, `AUTH_MODE=cognito`, `NEXT_PUBLIC_PREVIEW_READ_ONLY=true`. These values contain no secrets. The website labels reference inventory, removes enquiry forms and contact conversion, disables journey recording, and rejects lead/event POSTs with 503 before accepting data. It disallows search indexing. Staff apps retain Cognito authentication and fail closed without configured accounts; Vercel login does not replace staff authorization.

The local file adapter is not shared serverless storage. Do not redirect it to /tmp or claim enquiry persistence. The full connected hosted workflow requires all three projects to use the same TLS PostgreSQL/Aurora database, migrations/role grants, Cognito clients and scoped staff provisioning. Database URLs and credentials belong only in secure server environment configuration. Once configured and verified, remove the browsing-preview flag and use `DATA_MODE=aurora`; retain authenticated staff access.

Local `pnpm demo` remains the fully connected reference demonstration. Native installers require the configured authenticated backend and are not deployed by Vercel.
