# Dealer staff roles and page boundaries

Staff role names are persisted by platform-scoped administrators. Identity
provider claims and caller headers cannot grant a role. Every verified request
resolves server-owned provisioning; the production database registry remains the
authority for enabled status, tenant, dealership and location permissions.

| Role | Inventory | CRM | Market | Acquisition | Cost records | API administration |
|---|---|---|---|---|---|---|
| Owner | Read/write | Read/write | Read | Plan | Read/write | Manage |
| Manager | Read/write | Read/write | Read | No | No | No |
| Salesperson (`sales`) | Read | Assigned leads | Read | No | No | No |
| Acquisition manager (`acquisition`) | Read/write | No | Read | Plan | Read only through scoped snapshots | No |
| Marketing | Read | No | Read | No | No | No |
| Viewer | Read | Read | Read | No | No | No |

These preserve existing role capabilities and add conservative acquisition and
marketing roles. Marketing campaign-specific aggregate reports and a separate
acquisition financial dashboard remain product work. The CRM/capital page still
requires its relevant CRM permissions; a role's limited cost-read capability is
not a grant to see sales/customer records. Financial writes are owner-only under
the current role definitions. Market/planner still require active subscriptions.

VandLabs super administration is a separately provisioned `platform:admin`
capability with explicit platform tenant scope. It is intentionally not assignable
as a dealership role or derived from an arbitrary JWT role claim. Administrators
cannot grant dealer roles outside their authorized tenants or overwrite a
bootstrap administrator through the dealer staff editor.

## Defense in depth

`command-access.ts` defines navigation and page policy. Middleware checks it on
entry, including decoded/nested paths. Server pages also check their capabilities;
hiding navigation alone is not authorization. Staff without CRM permission land
on Acquisition (with capital-read) or Market, rather than the CRM overview.
Unknown sections still reach the application's 404 handling.

Owned-record snapshots require inventory and analytics access, then independently
exclude leads and all related tasks, activities, appointments, sales, automation
runs and rules without lead-read. Both PostgreSQL and local adapters enforce this.
Financial costs and cost history retain their separate capital-read boundary.
Staff directories are not loaded without lead-read. API mutation handlers retain
capability, record version, tenant/dealership/location and assignment checks.
Salespeople remain limited to assigned leads and cannot reassign their own scope.

## Verification and limits

Security unit tests exercise menu/page agreement, least privilege, landing paths,
encoded URLs and existing salesperson restrictions. PostgreSQL regressions verify
persisted roles, cross-tenant denial and snapshot/mutation restrictions. Local
snapshot regressions also exclude CRM records without permission.

The signed-role HTTP/browser suite uses an ephemeral RSA key, an HTTPS JWKS fixture
and a locally trusted test certificate. TLS verification is not disabled in the
application and no test authentication bypass is introduced. Its environment
registry and demo owned-record adapter are isolated acceptance fixtures, not
production configuration. Browser cases inspect actual role navigation; HTTP
cases reject privilege-spoofing headers, private pages and lead mutations while
allowing restricted inventory snapshots. An unknown signed subject is denied.
This suite does not establish real Cognito MFA, production database/provider
connectivity or complete operational role acceptance. Those remain staging gates.
