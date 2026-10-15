# Staff identity for Cloudflare and Neon

The owner confirmed on 15 October 2026 that no staff identity provider account is
configured. The prepared path uses the existing Cognito adapter and an isolated
identity-only stack. Nothing has been provisioned in AWS by this change.

## What is prepared

The shared Cognito definitions are extracted from the historical AWS stack without
changing its logical IDs or synthesized template. The new identity-only entry point
creates one user pool, two public OAuth clients and a hosted sign-in domain. It
does not create Aurora, VPC/NAT, EC2, S3 media, queues or WAF resources. The console
may store the uploaded CloudFormation template in its own S3 template bucket.

The identity-only profile requires TOTP authenticator MFA in staging and production,
disables public signup and SMS MFA, requires a strong password, retains the pool
and enables deletion protection. It uses Cognito Lite, the classic hosted UI,
authorization-code flows with the application's existing PKCE handling, 15-minute
access tokens, seven-day refresh tokens and provider token revocation. This is
not proof of a working login or instantaneous access-token revocation. The server
registry still authorizes every staff subject and tenant scope.

## ACTION REQUIRED FROM OWNER

Service: AWS account and Amazon Cognito. This connection cannot create an AWS
account or authorize account billing. Do not send AWS credentials or passwords in
chat. The template is concrete and reviewable before any resources are created.

1. Sign in to your company AWS account, or complete account registration if you
   do not have one. Use the Mumbai region (`ap-south-1`).
2. Open https://ap-south-1.console.aws.amazon.com/cloudformation/home?region=ap-south-1
   and choose **Create stack → With new resources (standard)**.
3. Select **Choose an existing template → Upload a template file** and upload
   `infra/aws/templates/staff-identity-staging.json` from this repository.
4. Set the stack name to `VandLabsStaffIdentity-staging`. Review the template's
   four Cognito resources and their required MFA configuration, then submit.
   There are no passwords, users or credentials embedded in this template.
5. Wait for `CREATE_COMPLETE`. In **Outputs**, obtain the pool ID, hosted domain
   and client IDs. Set GitHub `cloudflare-staging` variable `AUTH_MODE=cognito`.
6. Add environment secrets using these output mappings:

| GitHub environment secret | CloudFormation output |
|---|---|
| `COGNITO_USER_POOL_ID` | `StaffUserPoolId` |
| `COGNITO_DOMAIN` | `CognitoDomain` |
| `COGNITO_CLIENT_ID` | `CognitoClientId` |
| `COGNITO_DESKTOP_CLIENT_ID` | `CognitoDesktopClientId` |

The deployment derives the accepted web/desktop client-ID list when both are
present. An explicitly configured `COGNITO_CLIENT_IDS` overrides that list.
OIDC secrets are not required in Cognito mode. The default remains OIDC for
existing installations; selecting `demo` in shared mode is rejected.

AWS currently documents a 10,000 monthly-active-user free tier for eligible direct
or social sign-ins on Lite/Essentials. Usage, eligibility, optional services and
AWS billing still need review; this is not an assurance of a zero bill.
See https://aws.amazon.com/cognito/pricing/ and
https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html.

## Remaining secure application configuration

In the same GitHub environment, add variables `CLOUDFLARE_ACCOUNT_ID` and
`CF_PUBLIC_ORIGIN` from `CLOUDFLARE_STAGING.md`. Add secrets `DATABASE_URL` using
the pooled **staging** `vandlabs_runtime` connection, `SESSION_SECRET` containing
32 random bytes encoded as base64, and the approved staging `TENANT_CONFIG_JSON`.
Never use the older BYPASSRLS role or copy production secrets into staging.

Provision an approved staging staff user, register their exact Cognito subject
with tenant/dealership/location capabilities, and complete authenticator MFA.
User creation/invitation must use an approved real staff identity; no users or
emails are created/sent by this template. A provider account alone does not grant
platform administrator access. Then run the manual Cloudflare workflow with
target `staging` and deployment enabled, and inspect the doctor/database probe.

## Reproduce and test without deploying

From `infra/aws`:

```sh
npm ci --ignore-scripts
npm run build
npm run test:identity
npm run identity:synth -- -c environment=staging -c region=ap-south-1 -c publicOrigin=https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev
```

The identity entry point uses a bootstrapless synthesizer because it has no
deployment assets. Do not run the historical full AWS deployment for this
Cloudflare/Neon environment. CI synthesizes/tests but never deploys this stack.
Production requires a separate stack, actual production origin and accepted
release; the staging template must not be reused for production.

## Live acceptance still required

Test login and TOTP enrollment, PKCE/state rejection, refresh and expiry, logout,
disabled staff, tenant isolation, web/desktop client handling and negative role
checks. The initial template is only configuration evidence. Email recovery,
delivery quotas and real staff onboarding require verification in the account.
