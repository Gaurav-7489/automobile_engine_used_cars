import { CfnOutput, Duration, RemovalPolicy, Stack, aws_cognito as cognito } from "aws-cdk-lib";

// Keep constructs at their original stack scope to preserve existing logical IDs.
export function createStaffIdentity(scope: Stack, props: { environmentName: string; requireMfa?: boolean }) {
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
    const staffWeb = userPool.addClient("StaffWebClient", {
      generateSecret: false,
      ...(props.requireMfa ? { accessTokenValidity: Duration.minutes(15), idTokenValidity: Duration.minutes(15), refreshTokenValidity: Duration.days(7), enableTokenRevocation: true } : {}),
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: callbacks, logoutUrls: logouts },
    });
    const desktop = userPool.addClient("StaffDesktopClient", {
      generateSecret: false,
      ...(props.requireMfa ? { accessTokenValidity: Duration.minutes(15), idTokenValidity: Duration.minutes(15), refreshTokenValidity: Duration.days(7), enableTokenRevocation: true } : {}), preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: ["http://localhost:43821/callback"] },
    });
    const domain = userPool.addDomain("StaffSignInDomain", { cognitoDomain: { domainPrefix: scope.node.tryGetContext("cognitoDomainPrefix") ?? `vandlabs-engine-${props.environmentName}-${scope.account}` } });
    new CfnOutput(scope, "StaffWebClientId", { value: staffWeb.userPoolClientId });
    new CfnOutput(scope, "StaffDesktopClientId", { value: desktop.userPoolClientId });
    new CfnOutput(scope, "StaffSignInUrl", { value: domain.baseUrl() });

    return { userPool, staffWeb, desktop, domain };
}
