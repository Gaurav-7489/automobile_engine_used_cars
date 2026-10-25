import { BootstraplessSynthesizer, CfnOutput, CfnParameter, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { createStaffIdentity } from "./staff-identity.js";

export class StaffIdentityStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    environmentName: string; publicOrigin: string;
    /**
     * Single sign-in: adds the Automobile Intelligence client (served at <publicOrigin>/intelligence) and, with a
     * Google OAuth client ID, Google as a federated provider. The Google secret is a NoEcho stack parameter.
     */
    intelligence?: boolean; googleClientId?: string;
  }) {
    super(scope, id, { ...props, synthesizer: props.synthesizer ?? new BootstraplessSynthesizer() });
    if (!["staging", "production"].includes(props.environmentName)) throw new Error("Choose staging or production.");
    const origin = new URL(props.publicOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.hostname.endsWith(".invalid") || origin.hostname === "example.com") {
      throw new Error("Provide the real HTTPS gateway origin without credentials or a path.");
    }
    // Pin both applications to the same reviewed gateway origin, never arbitrary redirects.
    this.node.setContext("staffCallbackUrls", ["command", "platform"].map(path => `${origin.origin}/${path}/auth/callback`));
    this.node.setContext("staffLogoutUrls", ["command", "platform"].map(path => `${origin.origin}/${path}/login`));
    let singleSignIn;
    if (props.intelligence || props.googleClientId) {
      // One product address: Intelligence is pinned to the same reviewed gateway origin as the other apps.
      const secret = props.googleClientId ? new CfnParameter(this, "GoogleClientSecret", { type: "String", noEcho: true, description: "Google OAuth client secret. Never commit it." }) : undefined;
      singleSignIn = {
        intelligenceCallbackUrls: [`${origin.origin}/intelligence/api/auth/sso/google/callback`],
        intelligenceLogoutUrls: [`${origin.origin}/intelligence/login`],
        ...(props.googleClientId && secret ? { google: { clientId: props.googleClientId, clientSecret: SecretValue.cfnParameter(secret) } } : {}),
      };
    }
    const { userPool, staffWeb, desktop, domain, intelligence } = createStaffIdentity(this, { environmentName: props.environmentName, requireMfa: true, singleSignIn });
    if (intelligence) new CfnOutput(this, "CognitoIntelligenceClientId", { value: intelligence.userPoolClientId });
    new CfnOutput(this, "StaffUserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "CognitoDomain", { value: domain.baseUrl() });
    new CfnOutput(this, "CognitoClientId", { value: staffWeb.userPoolClientId });
    new CfnOutput(this, "CognitoDesktopClientId", { value: desktop.userPoolClientId });
    // IDs and URLs are configuration, never credentials. No users are provisioned here.
  }
}
