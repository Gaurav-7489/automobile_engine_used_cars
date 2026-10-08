# Recorded stock economics and capital operations

This increment builds on PR #12. It adds operator-verified stock costs, versioned amendments, actual acquisition ageing and recorded capital/contribution views. It does not activate market feeds, an AI provider or a production deployment.

## Permissions and persistence

Production principals must be explicitly provisioned with `capital:read` to receive cost records/history and `capital:write` to save them. Existing inventory/analytics privileges do not grant financial access. Use the existing server-owned Cognito subject registry; do not trust browser headers or JWT role claims. Role-management UI and durable staff provisioning remain separate unfinished scope. The local demonstration owner has both capabilities.

Apply migration `0004_stock_costs.sql` after 0003, then provision the application role. New tables force tenant RLS, enforce tenant-aware vehicle foreign keys and scope queries to authorized dealership/locations. `stock_costs` allows read/insert/update; history allows read/insert only. Both the current record and amendment audit are written together in PostgreSQL or atomic demo state. Audit failure rolls back the cost record.

## Operator workflow

Open Command Center → Capital. Expand **Record costs** for a vehicle. Enter the acquisition date, verified purchase price, recorded reconditioning, transfer and other costs, plus an invoice/internal reference. Explicitly enter zero only where appropriate. Daily holding cost is an optional operator assumption: a blank means unknown, not zero. Verify the figures and confirm authorization before saving. Do not enter account secrets or customer details in invoice-reference fields.

Costs use INR with at most two decimal places. Acquisition dates use the Asia/Kolkata business calendar and must be valid, not future-dated, and not after an existing confirmed sale. Sale confirmation also checks any existing acquisition date. Dates cross the UTC boundary correctly.

Amendments require the current version. Concurrent or repeated saves with an old version return 409 and require refresh/review; they cannot silently overwrite a newer record. The history preserves before/after values, actor, version and timestamp. Sold-stock cost corrections are allowed for authorized finance operators and audited; this does not reverse a sale or reopen inventory.

The Tauri Capital surface reads the same scoped cost records and writes the same API, online only. Its Rust allowlist admits only the specific cost PUT operation. Native compilation is verified by CI; actual installed-client acceptance still requires a shared HTTPS/Cognito backend.

## Evidence and calculations

| Metric | Source and calculation |
| --- | --- |
| Acquisition age | Business-calendar days between recorded acquisition and report day; stops at confirmed sale |
| Cost basis | Purchase + reconditioning + transfer + other recorded costs |
| Recorded active capital | Cost basis of unsold vehicles with cost records |
| Aged capital | Covered unsold stock aged 90+ days; a review bucket, not a predicted loss |
| Holding estimate | Recorded daily assumption × acquisition age; unknown without that assumption |
| Asking spread | Asking price − recorded cost basis |
| Recorded sale contribution | Confirmed sale proceeds − recorded cost basis |

Age bands are disclosed operational defaults: watch 30 days, review 60 days and priority 90 days. These do not predict depreciation or demand. Missing cost records are counted and excluded from aggregate capital rather than valued at zero. Asking spread and contribution exclude unrecorded taxes, financing, overhead and sale expenses; neither is net profit. Holding estimates remain separate from recorded costs/contribution to avoid presenting an assumption as an actual paid expense.

## API

`PUT /command/api/vehicles/{id}/costs` accepts:

```json
{"expectedVersion":0,"record":{"acquiredOn":"2026-06-01","purchasePrice":1000000,"reconditioningCost":25000,"transferCost":5000,"otherCost":0,"dailyHoldingCost":null,"reference":"INTERNAL-REFERENCE"}}
```

Version 0 creates a record; later requests use its current version. Tenant, vehicle ID, version, currency and recording staff/time are server-owned. Unknown/protected record fields are rejected. Errors: 400 invalid values, 401 authentication required, 403 permission/scope denied, 404 unknown scoped stock, 409 stale version. Cost records/history are omitted entirely from snapshots without capital-read permission, including browser and desktop responses.

## Platform honesty

Platform runtime screens no longer invent zero AI spend, zero job failures or storage usage. Persistence/auth mode is labelled configured or demo; configuration is not a live connectivity/recovery certification. Monitoring, market coverage and AI-provider telemetry remain unknown/unconfigured. Local published-stock counts read actual demo state. Production data mode hides the illustrative tenant/onboarding/feature/audit screens until real control-plane services are connected.

## Acceptance and remaining scope

The PR's exact-commit Quality Gate is the release evidence. Tests cover permission isolation, hidden financial payloads, audit rollback, stale writes, date boundaries, holding estimates and capital/contribution calculations; browser tests cover verified entry/amendment and mobile layout. No reference acquisition prices are seeded.

This is a versioned stock-cost register, not a full general ledger: tax/accounting treatment, expense transactions, financing, reversals, configurable age policies, full staff administration and operational control-plane services remain unfinished. Staging still requires the AWS account/identity, approved expected spend, Aurora/Cognito configuration and recovery/customer acceptance.
