# Platform and staff operations

The Platform now reads organization/dealership/location records and stock, lead, open-task and recorded-sale counts from the same PostgreSQL adapter used by the public website and Command Center. In local reference mode it reads the same atomic runtime state. It no longer displays a fixture-only registry or invented privileged audit rows.

`/platform/api/snapshot` requires verified `platform:admin`. The server-owned principal's `platformTenantIds` is an explicit list of permitted tenant UUIDs; absent that field, only the principal's own `tenantId` is allowed. Each organization is queried through its own transaction-local RLS context. Platform admin is not a database BYPASSRLS role and does not silently impersonate an owner. Its snapshot contains counts and staff-access audit, not customer conversations/contact details.

## Persistent staff access

Apply migration `0005_platform_staff.sql` and application-role grants. `/platform/staff` can grant/edit/disable access for an existing Cognito subject; it does not create Cognito identities. POST `/platform/api/staff` accepts `{tenantId, member, expectedVersion}`. The member contains `userId`, `displayName`, `role`, dealership/location lists and `enabled`.

Role templates are owner, manager, sales and viewer. Owner includes capital-read/write; other templates do not. Sales can operate only leads whose `assignedTo` equals the verified Cognito subject, and cannot reassign itself or another lead. Related tasks, appointments, activities and sales follow the same lead filter. The browser owner selector uses the persisted staff directory. Viewer has read capabilities and cannot mutate business records. These templates are deliberately small; marketing-only, inventory-only, temporary support and finer approvals remain future work.

Staff updates serialize competing first grants and amendments with a tenant+subject transaction lock. `expectedVersion` 0 creates a grant; subsequent writes require the current version. Stale writes receive 409. Grant and audit writes commit together; audit failure rolls back the access change. The application role cannot update/delete `platform_audit`. This is append-only at the application-role boundary, not a claim against a database administrator. Self-access changes are rejected.

## Enable the database registry

Use `AUTH_REGISTRY_MODE=database` on both staff apps. The Command Center resolves the verified subject against the active server-configured tenant's `staff_members` on every request. Disabled/missing grants are denied even if an old ordinary grant remains in `AUTH_PRINCIPALS_JSON`. The database lookup never receives an unverified subject or tenant scope from a browser header.

Keep only explicitly authorized platform bootstrap administrators in `AUTH_PRINCIPALS_JSON`; their platform scopes remain server-owned. Configure the same bootstrap account for initial platform sign-in, then grant dealership staff through the Platform. Bootstrap admins are a separate administrative trust boundary: remove their environment grant to revoke that access. An ordinary persisted role cannot grant `platform:admin`.

Existing deployments can retain `AUTH_REGISTRY_MODE=environment` (the default) while migrating. In that mode staff grants are stored/audited but the environment registry remains authoritative. Switch registry mode only after all necessary staff are granted and tested.

## Readiness and limits

`/platform/health` and `/platform/onboarding` show configuration presence. The protected `/platform/api/readiness` and `/command/api/readiness` also execute actual scoped database reads and return 503 when configuration/connection checks fail. Checks expose key names and generic reasons, not credentials. A green configuration screen does not prove Cognito MFA, installed desktop acceptance, backup recovery or external providers.

Tenant creation is currently a controlled migration-admin command: `pnpm db:provision-tenant /approved/tenant.json`. This atomically creates the hierarchy and internal first-response/qualified-follow-up rules and refuses overwrite. Automated cloud/domain onboarding, runtime plan/flag mutation, billing, offboarding and support impersonation are not shipped.
