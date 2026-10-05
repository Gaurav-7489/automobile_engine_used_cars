import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_cognito as cognito,
  aws_ec2 as ec2,
  aws_events as events,
  aws_kms as kms,
  aws_logs as logs,
  aws_rds as rds,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sqs as sqs,
  aws_wafv2 as wafv2,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface AutomobileEngineStackProps extends StackProps {
  environmentName: string;
}

export class AutomobileEngineStack extends Stack {
  constructor(scope: Construct, id: string, props: AutomobileEngineStackProps) {
    super(scope, id, props);
    const production = props.environmentName === "production";

    const key = new kms.Key(this, "DataKey", {
      enableKeyRotation: true,
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      alias: `alias/automobile-engine-${props.environmentName}`,
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: production ? 2 : 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "application", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    const dbCredentials = new secretsmanager.Secret(this, "DatabaseCredentials", {
      encryptionKey: key,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "automobile_engine" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
    });

    const appCredentials = new secretsmanager.Secret(this, "ApplicationDatabaseCredentials", {
      encryptionKey: key,
      generateSecretString: { secretStringTemplate: JSON.stringify({ username: "vandlabs_app" }), generateStringKey: "password", excludePunctuation: true },
    });
    new CfnOutput(this, "ApplicationDatabaseSecretArn", { value: appCredentials.secretArn });

    const database = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      readers: production ? [rds.ClusterInstance.serverlessV2("reader")] : [],
      serverlessV2MinCapacity: production ? 1 : 0.5,
      serverlessV2MaxCapacity: production ? 8 : 2,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      storageEncryptionKey: key,
      backup: { retention: Duration.days(production ? 35 : 7) },
      deletionProtection: production,
      removalPolicy: production ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
    });

    const media = new s3.Bucket(this, "Media", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      enforceSSL: true,
      versioned: true,
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(90) }],
    });

    const deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
      retentionPeriod: Duration.days(14),
    });

    const workQueue = new sqs.Queue(this, "WorkQueue", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
    });

    const eventBus = new events.EventBus(this, "EventBus", {
      eventBusName: `automobile-engine-${props.environmentName}`,
    });

    const userPool = new cognito.UserPool(this, "StaffUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const callbacks: string[] = this.node.tryGetContext("staffCallbackUrls") ?? ["https://operations.example.invalid/command/auth/callback", "https://platform.example.invalid/platform/auth/callback"];
    const logouts: string[] = this.node.tryGetContext("staffLogoutUrls") ?? ["https://operations.example.invalid/command/login", "https://platform.example.invalid/platform/login"];
    if (production && [...callbacks, ...logouts].some(url => url.includes("example.invalid"))) throw new Error("Production Cognito requires real callback/logout URLs.");
    const staffWeb = userPool.addClient("StaffWebClient", {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: callbacks, logoutUrls: logouts },
    });
    const desktop = userPool.addClient("StaffDesktopClient", {
      generateSecret: false, preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: ["http://localhost:43821/callback"] },
    });
    const domain = userPool.addDomain("StaffSignInDomain", { cognitoDomain: { domainPrefix: this.node.tryGetContext("cognitoDomainPrefix") ?? `vandlabs-engine-${props.environmentName}-${this.account}` } });
    new CfnOutput(this, "StaffWebClientId", { value: staffWeb.userPoolClientId });
    new CfnOutput(this, "StaffDesktopClientId", { value: desktop.userPoolClientId });
    new CfnOutput(this, "StaffSignInUrl", { value: domain.baseUrl() });

    new logs.LogGroup(this, "ApplicationLogs", {
      retention: production ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
      encryptionKey: key,
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    new wafv2.CfnWebACL(this, "WebAcl", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `automobile-engine-${props.environmentName}`,
        sampledRequestsEnabled: true,
      },
      rules: [{
        name: "AWSManagedCommonRules",
        priority: 10,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesCommonRuleSet",
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "managed-common-rules",
          sampledRequestsEnabled: true,
        },
      }],
    });

    new CfnOutput(this, "DatabaseSecretArn", { value: dbCredentials.secretArn });
    new CfnOutput(this, "DatabaseEndpoint", { value: database.clusterEndpoint.hostname });
    new CfnOutput(this, "MediaBucketName", { value: media.bucketName });
    new CfnOutput(this, "WorkQueueUrl", { value: workQueue.queueUrl });
    new CfnOutput(this, "EventBusName", { value: eventBus.eventBusName });
    new CfnOutput(this, "StaffUserPoolId", { value: userPool.userPoolId });
  }
}
