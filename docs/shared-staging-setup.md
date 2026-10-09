# Connect the three deployed apps

The three Vercel projects currently have only browse-preview settings. They have no shared database, tenant or Cognito settings. File-backed `.demo-runtime` cannot be shared between independent serverless projects; no `/tmp` workaround is valid.

## Deployment targets

| Surface | Vercel project | App root | Entry |
|---|---|---|---|
| Public website | vandlabs-automobile-web | apps/web | / |
| Dealer operations | vandlabs-automobile-command | apps/command-center | /command |
| VandLabs administration | vandlabs-automobile-platform | apps/platform | /platform |

Preserve the approved AWS Cognito/Aurora architecture. The repository's Aurora cluster is private. Ordinary Vercel functions cannot reach that isolated VPC simply because a URL is configured. Establish approved private connectivity, or deploy the Node application runtime inside AWS with private database access. The target API Gateway/domain-service topology remains a separate implementation milestone; there is no existing proxy to enable by setting an environment variable. Do not expose the database publicly to make a preview appear connected.

Official private networking guidance: https://vercel.com/docs/networking/secure-compute and https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/USER_VPC.html. Account feature/spend approval and network setup are external dependencies.

## Database preparation

From an authorized migration environment with database network access:

```bash
pnpm db:migrate
pnpm db:provision-role
pnpm db:provision-tenant /absolute/path/to/approved-tenant.json
```

Supply `MIGRATION_DATABASE_URL` and `APPLICATION_DATABASE_SECRET_ARN` through secure execution configuration. The application role must be `NOSUPERUSER NOBYPASSRLS`, with forced RLS and all five migrations. Migration/provisioning helpers use verified TLS. Do not use migration/master credentials in the deployed apps.

The real-tenant configuration includes UUID tenant, organization, dealership and location identifiers; matching organization links; approved branding/contact/HTTPS canonical origin; navigation; entitlements; experience settings. `db:provision-tenant` validates the hierarchy, refuses an existing tenant and rolls back incomplete provisioning. It creates no fake stock/leads. Use [tenant-config.example.json](tenant-config.example.json) as a shape reference; replace all example business details before use. For an explicitly empty *reference staging* database only, the separate `ALLOW_REFERENCE_SEED=true pnpm db:seed` retains the synthetic seed path.

## Server environment matrix

| Setting | Public | Command Center | Platform |
|---|---|---|---|
| DATA_MODE | aurora | aurora | aurora |
| TENANT_CONFIG_JSON | same approved config | same approved config | same approved config |
| Database connection | same application role/database | same application role/database | same application role/database |
| AUTH_MODE | cognito recommended | cognito | cognito |
| NEXT_PUBLIC_PREVIEW_READ_ONLY | false after acceptance | false after acceptance | false after acceptance |
| APP_ORIGIN | optional | exact Command HTTPS origin | exact Platform HTTPS origin |
| Cognito pool/domain/client(s) | not used for anonymous enquiries | configured | configured |
| SESSION_SECRET | not needed | separate secure session key | separate secure session key |
| AUTH_REGISTRY_MODE | not needed | database | database |
| AUTH_PRINCIPALS_JSON | not needed | bootstrap only if needed | authorized platform bootstrap administrators |

Choose either `DATABASE_URL` or the Secrets Manager application secret with `DATABASE_HOST`, `DATABASE_NAME`, `AWS_REGION` and authorized server AWS identity. On Vercel a plain Secrets Manager ARN does not provide AWS credentials. Use a reviewed least-privilege runtime identity; never place AWS credentials in public build variables.

`DATABASE_SSL_CA` accepts the trusted CA PEM from server configuration where a local CA file is unavailable; `DATABASE_SSL_CA_FILE` remains supported. TLS always verifies the peer. URL `ssl*` parameters are removed before passing the URL to pg so they cannot override the explicit CA/verification. `DATABASE_POOL_MAX` defaults to 2 on Vercel and 10 elsewhere; use pooling/proxy and actual load measurements to tune it. Connection and statement timeouts are bounded.

Cognito must register the exact callbacks `COMMAND_ORIGIN/command/auth/callback` and `PLATFORM_ORIGIN/platform/auth/callback`, plus the matching login logout URLs. Native client callback: `http://localhost:43821/callback`. Use separate staff HTTPS origins to avoid session cookie collisions. Production CDK requires MFA. Populate the platform bootstrap registry with verified subjects and explicit `platformTenantIds`, then grant real staff using `/platform/staff`.

Example bootstrap *shape*, not usable identity:

```json
{"verified-admin-sub":{"tenantId":"tenant-uuid","dealershipIds":[],"locationIds":[],"capabilities":["platform:admin"],"platformTenantIds":["tenant-uuid"]}}
```

Configure secrets directly in the secure project/account environment. No secret values belong in chat, Git, logs, screenshots or desktop settings. Rebuild all three apps after environment changes; public preview flags are built into the client bundle.

## Connection acceptance

```bash
pnpm deployment:doctor web
pnpm deployment:doctor command --probe
pnpm deployment:doctor platform --probe
```

Standalone scripts inherit process environment; they do not automatically load Next.js `.env.local`. For local development, Node 22 supports an explicit env file before the script: `node --env-file=/secure/staging.env --import tsx scripts/deployment/doctor.ts command --probe`. The doctor emits configuration states and generic failures, never secret values.

Then sign into both staff apps and inspect their protected readiness endpoints. A new synthetic website enquiry must appear in Command Center, increment Platform lead counts and create an internal first-response task. Assign it to a persisted salesperson and prove other/unassigned leads are inaccessible. Disable that staff grant and prove the next API request is denied. Confirm a verified sale and prove public stock availability and Platform counts agree. Repeat using the installed desktop client against the same HTTPS backend.

Finally verify approved inventory/contact content, consent, mobile/browser behavior, actual Cognito MFA/refresh/logout, backup restore and monitoring. Only then remove preview restrictions and approve the pilot release. Current Vercel pages remain browse-only until this setup and acceptance are completed.
