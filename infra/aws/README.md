# Production Foundation

This directory is the deployable AWS foundation for Automobile Engine. It is intentionally separated from the demo adapters.

## What this provisions

The first production stack establishes the security and durability boundaries required before real dealership data is accepted:

- Cognito staff identity with MFA-capable user pool.
- Aurora PostgreSQL Serverless v2 in isolated subnets.
- S3 media storage with public access blocked, versioning and encryption.
- SQS work queue plus dead-letter queue.
- EventBridge application event bus.
- Secrets Manager database credentials.
- CloudWatch log group and baseline alarms.
- AWS WAF web ACL foundation.
- KMS customer-managed key used by production data services.

The application is **not production-ready merely because this stack exists**. API Gateway/domain services, application authorization middleware, database migrations/RLS, deployment domains, provider credentials, backup restore drills and environment-specific acceptance still have to be completed.

## Deploy

Prerequisites: AWS CLI credentials and AWS CDK v2.

```bash
cd infra/aws
npm install
npx cdk bootstrap
npx cdk diff -c environment=staging
npx cdk deploy -c environment=staging
```

Use separate AWS accounts for production where possible. Never commit provider credentials or database passwords.
