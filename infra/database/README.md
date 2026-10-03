# Production persistence wiring

The production schema lives in `infra/database/migrations`.

Application repository selection is intentionally environment-driven:

- local/demo: existing `@vandlabs/demo-data` repositories and `.demo-runtime`
- production: Aurora PostgreSQL repository adapter with a transaction-scoped tenant context

The production adapter must start every tenant-owned transaction by setting `app.tenant_id` from the verified authenticated principal before querying tenant-owned tables. It must never accept an authoritative tenant ID from browser input.

## Required environment

- `AUTH_MODE=cognito`
- `DATA_MODE=aurora`
- database connection details sourced from Secrets Manager
- verified Cognito JWT claims mapped to user/tenant/dealership/location/capability scope

The current wiring phase adds the schema/RLS and server authorization boundaries while retaining demo mode. The next adapter step replaces file persistence only when a real Aurora endpoint and secret are available.
