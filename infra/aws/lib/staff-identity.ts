import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, aws_cognito as cognito } from "aws-cdk-lib";

// Keep constructs at their original stack scope to preserve existing logical IDs.
export function createStaffIdentity(scope: Stack, props: {
  environmentName: string; requireMfa?: boolean;
  /** Single sign-in: an additional app client for Automobile Intelligence and Google as a federated provider. Omitted = unchanged template. */
  singleSignIn?: { intelligenceCallbackUrls: string[]; intelligenceLogoutUrls: string[]; google?: { clientId: string; clientSecret: SecretValue } };
}) {
    const production = props.environmentName === "production";
    const userPool = new cognito.UserPool(scope, "StaffUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: props.requireMfa || production ? cognito.Mfa.REQUIRED : cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: props.requireMfa || production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      ...(props.requireMfa ? { deletionProtection: true, featurePlan: cognito.FeaturePlan.LITE } : {}),
    });

    const callbacks: string[] = scope.node.tryGetContext("staffCallbackUrls") ?? ["https://operations.example.invalid/command/auth/callback", "https://platform.example.invalid/platform/auth/callback"];
    const logouts: string[] = scope.node.tryGetContext("staffLogoutUrls") ?? ["https://operations.example.invalid/command/login", "https://platform.example.invalid/platform/login"];
    if ((production || props.requireMfa) && [...callbacks, ...logouts].some(url => url.includes("example.invalid"))) throw new Error("Production Cognito requires real callback/logout URLs.");
    const sso = props.singleSignIn;
    // Google signs people in; Cognito still issues every token and the apps still authorize against their own staff registry.
    const google = sso?.google ? new cognito.UserPoolIdentityProviderGoogle(scope, "StaffGoogleProvider", {
      userPool, clientId: sso.google.clientId, clientSecretValue: sso.google.clientSecret, scopes: ["openid", "email", "profile"],
      attributeMapping: { email: cognito.ProviderAttribute.GOOGLE_EMAIL, fullname: cognito.ProviderAttribute.GOOGLE_NAME },
    }) : undefined;
    const identityProviders = google ? [cognito.UserPoolClientIdentityProvider.COGNITO, cognito.UserPoolClientIdentityProvider.GOOGLE] : undefined;
    const staffWeb = userPool.addClient("StaffWebClient", {
      generateSecret: false,
      ...(identityProviders ? { supportedIdentityProviders: identityProviders } : {}),
      ...(props.requireMfa ? { accessTokenValidity: Duration.minutes(15), idTokenValidity: Duration.minutes(15), refreshTokenValidity: Duration.days(7), enableTokenRevocation: true } : {}),
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: callbacks, logoutUrls: logouts },
    });
    if (google) staffWeb.node.addDependency(google);
    const intelligence = sso ? userPool.addClient("StaffIntelligenceClient", {
      generateSecret: false,
      ...(props.requireMfa ? { accessTokenValidity: Duration.minutes(15), idTokenValidity: Duration.minutes(15), refreshTokenValidity: Duration.days(7), enableTokenRevocation: true } : {}),
      preventUserExistenceErrors: true,
      ...(identityProviders ? { supportedIdentityProviders: identityProviders } : {}),
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: sso.intelligenceCallbackUrls, logoutUrls: sso.intelligenceLogoutUrls },
    }) : undefined;
    if (intelligence && google) intelligence.node.addDependency(google);
    const desktop = userPool.addClient("StaffDesktopClient", {
      generateSecret: false,
      // The native client stays on Cognito sign-in (with MFA); CDK would otherwise enable every registered provider.
      ...(google ? { supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO] } : {}),
      ...(props.requireMfa ? { accessTokenValidity: Duration.minutes(15), idTokenValidity: Duration.minutes(15), refreshTokenValidity: Duration.days(7), enableTokenRevocation: true } : {}), preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: ["http://localhost:43821/callback"] },
    });
    const domain = userPool.addDomain("StaffSignInDomain", { cognitoDomain: { domainPrefix: scope.node.tryGetContext("cognitoDomainPrefix") ?? `vandlabs-engine-${props.environmentName}-${scope.account}` } });
    new CfnOutput(scope, "StaffWebClientId", { value: staffWeb.userPoolClientId });
    new CfnOutput(scope, "StaffDesktopClientId", { value: desktop.userPoolClientId });
    new CfnOutput(scope, "StaffSignInUrl", { value: domain.baseUrl() });

    if (intelligence) new CfnOutput(scope, "StaffIntelligenceClientId", { value: intelligence.userPoolClientId });

    return { userPool, staffWeb, desktop, domain, intelligence };
}
