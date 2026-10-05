# Production Tenant Isolation Contract

Every production request must resolve an authenticated principal to an explicit tenant scope before accessing operational data.

## Required claims

Staff identity resolves to:

- `user_id`
- `tenant_id`
- permitted `dealership_ids`
- permitted `location_ids`
- capabilities / role

The browser never supplies an authoritative tenant identifier. Server authorization derives scope from verified identity and rejects mismatches.

## Database rules

Every operational and derived table carries `tenant_id`. PostgreSQL row-level security is enabled for tenant-owned tables and uses a transaction-local `app.tenant_id` set by the authenticated service layer.

Example policy:

```sql
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;

CREATE POLICY leads_tenant_isolation ON leads
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

RLS is defense in depth, not a replacement for service authorization.

## Other isolation boundaries

- S3 object keys start with `tenants/{tenant_id}/...`.
- Cache keys include tenant ID.
- Queue/event payloads include tenant ID and are validated by consumers.
- Integration credentials are tenant-scoped secrets.
- Audit records include actor, tenant, capability, action and result.
- Cross-tenant analytics require explicitly permissioned/de-identified aggregation.

## Release tests

Production promotion must include negative tests proving Tenant A cannot read, mutate, enumerate, export or infer Tenant B records across HTTP, database, storage, caches and asynchronous jobs.

## Verified identity boundary

See `staff-authentication.md`. Staff tokens are verified in the application; incoming identity headers are never accepted as proof. Mutation authorization now includes location scope. The current schema and reference adapters do not constitute a deployed, tested production isolation system.
