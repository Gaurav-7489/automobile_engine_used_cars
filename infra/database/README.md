# Shared PostgreSQL persistence

Migrations and the shared adapter are implemented in `packages/data`. Run `pnpm db:migrate` with a migration/admin URL, then `pnpm db:provision-role` using the application-role secret. Runtime transactions reject superuser/BYPASSRLS roles and set tenant context transaction-locally. See `docs/production-runtime.md` for deployment, seed and acceptance requirements.
