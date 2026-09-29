# AWS Integration Path — after the MVP contract freeze

The V1 Proof-of-Engine deliberately proves product behavior against stable contracts before provisioning production AWS. The UI must not be rewritten when infrastructure changes.

## Target request path

```text
Route53 / DNS
  → AWS WAF
  → CloudFront
  → Next.js experience / BFF
  → API Gateway
  → domain services
  → Aurora PostgreSQL

Supporting services:
  S3 + CloudFront       media and files
  ElastiCache / Redis   justified hot caches
  SQS                   durable asynchronous work
  EventBridge           domain/integration events
  Lambda / workers      async processing
  Cognito               staff/admin authentication foundation
  CloudWatch + OTel     logs, metrics and traces
  KMS / Secrets Manager encryption and secrets
  OpenSearch            later, only when search scale/features justify it
```

## Migration sequence

1. **Freeze the typed contracts.** Keep the canonical `Vehicle`, `Lead`, tenant hierarchy and event vocabulary stable enough for adapters.
2. **Add OpenAPI-backed BFF clients.** Existing `/api/*` routes are the reference HTTP boundary.
3. **Provision identity first.** Cognito + MFA for privileged staff, capability-based RBAC and server authorization.
4. **Provision Aurora PostgreSQL.** Organization/dealership/location ownership, vehicle records, leads, tasks, appointments and audit data become transactional truth.
5. **Move media to S3 + CloudFront.** Use signed upload URLs, immutable delivery caching and responsive transformed outputs.
6. **Introduce async infrastructure.** SQS + EventBridge + workers for notifications, media, webhooks, integrations, analytics and later AI jobs.
7. **Connect observability.** OpenTelemetry traces/log correlation, CloudWatch dashboards/alarms and business-flow failure monitoring.
8. **Add integration adapters.** DMS/CRM, Meta/Google, messaging, finance and valuation providers stay behind normalized contracts.
9. **Add Redis/OpenSearch only with evidence.** Do not pay operational complexity before latency/search requirements justify it.
10. **Harden recovery and deployment.** CDK/TypeScript, PITR, versioned S3, restore testing, safe migrations, feature flags and rollback.

## Production security gates

- WAF and rate limiting
- MFA for privileged staff
- least-privilege IAM
- capability + scope authorization on every protected action
- tenant-scoped database/cache/search/storage access
- signed object access
- encryption at rest/in transit
- Secrets Manager/KMS
- CSP/security headers
- audit logs for privileged actions
- automated cross-tenant isolation tests
- dependency/security scanning

## Why AWS is not connected in the MVP branch

The product specification requires AWS-native production direction **after** frontend/domain contracts are stable. The current local adapter makes the full reference workflow demoable without spending time debugging cloud infrastructure before the product loop is complete.
