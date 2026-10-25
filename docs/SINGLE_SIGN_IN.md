# Single sign-in with Google

One Google identity, one staff account, every VandLabs app.

## How it works

- **Cognito is the only identity provider.** Google is added to the existing staff user pool as a federated provider. Command Center, Platform and Automobile Intelligence each have their own Cognito app client; the desktop client stays on Cognito-only sign-in (with MFA).
- **One canonical account.** The `intelligence_users` row (a uuid that is also `staff_members.user_id`) is the person. Migration `0011_federated_identity.sql` adds `identity_links`, which ties a Cognito subject (for example a Google login) to that account.
- **Linking rule (invited and existing users only).** On first sign-in, Cognito must report `email_verified=true`, and that email must belong to an enabled, non-disabled member. The link is then permanent: later sign-ins use the subject, so a changed email claim cannot re-link or take over another account. Unknown addresses are refused and **no account is ever created**.
- **Invitations.** An invitation link (`/join/<token>`) can be accepted with Google, but only by the address it was issued to. The account gets an unguessable password nobody sees; owners can still issue a reset link.
- **Revocation.** Disabling the account in Intelligence (or removing the membership) stops Google sign-in and the Command Center lookup on the next request.
- **Passwords still work** in Intelligence until the owner decides to retire them.

Single sign-on across apps comes from the Cognito hosted-UI session: after signing in at one app, opening another app redirects through Cognito and returns without asking again (until the hosted session expires).

## Scope and known limits

- Command Center uses the link automatically (`lookupLinkedPrincipal`). **Platform** still authorizes platform administrators by their bootstrap Cognito subject; Google does not grant platform access.
- Cognito MFA does not apply to Google sign-ins; Google's own 2-step verification does. Require 2SV in your Google Workspace if you need it.
- The desktop app keeps its Cognito-only sign-in; it is not changed.

## ACTION REQUIRED FROM OWNER

I cannot create these for you, and secrets must never be pasted in chat.

1. **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
   - Authorized redirect URI: `https://<your-cognito-domain>/oauth2/idpresponse` (the `CognitoDomain` stack output).
   - Note the client ID and client secret.
2. **Deploy the identity stack** with Google enabled (the secret is a NoEcho CloudFormation parameter, never in the template):

   ```bash
   cd infra/aws
   npm run identity:synth -- -c environment=staging -c publicOrigin=https://<gateway> \
     -c googleClientId=<client-id>
   ```
   Create/update the `VandLabsStaffIdentity-staging` stack with that template and enter `GoogleClientSecret` when prompted. New outputs: `CognitoIntelligenceClientId`. The Intelligence client's callback is pinned to `https://<gateway>/intelligence/api/auth/sso/google/callback` (one product address). Use `-c intelligence=true` instead of a Google client ID to add only the Intelligence client.
3. **Apply migration 0011** to staging, then production (additive, seconds; same procedure as 0010 in `INTELLIGENCE_PRODUCTION.md`).
4. **Automobile Intelligence environment** (Worker secrets and variables; `pnpm cf:configure` sets `APP_ORIGIN`):

   | Variable | Value |
   |---|---|
   | `APP_ORIGIN` | `https://<gateway>`, the one product address (also used at runtime) |
   | `COGNITO_DOMAIN` | the hosted sign-in domain (`CognitoDomain` output) |
   | `INTELLIGENCE_COGNITO_CLIENT_ID` | `CognitoIntelligenceClientId` output |

   Without all three, the "Continue with Google" button is simply not shown.
5. **Command Center** needs `AUTH_REGISTRY_MODE=database` (already the shared-database setting) and the existing Cognito variables; no new variables. Cross-section links need no configuration: every section is on the same address.

Nothing here has been provisioned or tested against real Google or Cognito: the automated tests use an in-process PostgreSQL and a stand-in for the Cognito endpoints.
