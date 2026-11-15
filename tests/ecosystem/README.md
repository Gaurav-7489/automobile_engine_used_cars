# Ecosystem journey (Intelligence + VLuce website)

Runs against production builds of both products on a local PostgreSQL. It starts nothing itself.

| Port | Process |
|---|---|
| 5544 | PostgreSQL 16 (`scripts/local/pg-up.sh`), databases `vl` (Intelligence), `vluce_a`, `vluce_b` |
| 3003 | Intelligence (`next start`), role `vandlabs_runtime`, `WEBSITE_WEBHOOKS_ALLOW_LOOPBACK=1` |
| 3100 | VLuce, connected (`VANDLABS_API_URL=http://127.0.0.1:3003`, `WEBSITE_SECRET`, `DATABASE_URL=…/vluce_a`) |
| 3101 | VLuce, website only (`LEAD_WEBHOOK_URL=http://127.0.0.1:3200/hook`, `DATABASE_URL=…/vluce_b`, `CRON_SECRET`, `LEADS_ADMIN_TOKEN`) |
| 3102 | VLuce, production with nothing configured |
| 3200 | A mock CRM (`/hook` records, `/down` and `/up` simulate an outage, `/received` lists) |

1. `scripts/local/pg-up.sh`; create the databases; create role `vandlabs_runtime`; `pnpm db:migrate` with `MIGRATION_DATABASE_URL`; apply `infra/database/application-role.sql` grants to `vandlabs_runtime`.
2. Provision a workspace with `scripts/intelligence/provision-workspace.ts` (owner `owner@delta.example`) and keep the one-time link.
3. Start the processes above, then:

```
JOIN_URL=<owner setup link> npx playwright test --config playwright.ecosystem.config.ts --trace off
```

The spec resets this local stack's rate-limit tables before signing in, because repeated runs correctly trip the shared limits.
Photos are attached on the shared vehicle record (the media upload path needs blob storage, not configured locally).
