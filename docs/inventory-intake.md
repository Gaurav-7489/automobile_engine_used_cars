# Inventory entry, review and CSV import

This increment extends the connected demo on `feat/inventory-ingestion`. It preserves the architecture and the appointments/sales delivery in PR #11. No cloud resources or customer records were changed.

## Staff workflow

Open Command Center → Inventory. Accounts with `inventory:write` can select an assigned dealership/location and expand **Enter a vehicle**. Required fields cover stock identity, make/model/variant, year, INR asking price, mileage, fuel, gearbox, owner count, body style, condition and colours. Finance/exchange flags default false. A public HTTPS image URL is optional for a draft.

**Save draft vehicle** persists a canonical vehicle with a server-generated ID/slug, authenticated tenant, selected authorized location, `available` availability and `draft` publication. The new stock does not appear publicly. Expand **Edit vehicle details** to attach or revise its first image and metadata. The remaining gallery, features/specifications, source and immutable identity fields are preserved. Publication requires imagery and a positive price; use the existing publication control after review. A URL is not proof of image ownership or successful delivery: verify rights and image visibility before publishing.

Sold vehicle details cannot be edited through this workflow. Sales corrections/reversals remain a separate unfinished accounting workflow.

## CSV contract

Download the CSV header template in Inventory. Export Excel as UTF-8 CSV; direct `.xlsx` upload is not implemented. Maximum file size is 250,000 UTF-8 bytes and 200 vehicles. All columns through `interiorColor` are required. `imageUrl`, `financeEligible` and `exchangeEligible` are optional. Optional eligibility cells use exactly `true` or `false`; missing values mean false.

```csv
stockId,make,model,variant,year,price,mileage,fuelType,transmission,ownership,bodyType,condition,exteriorColor,interiorColor,imageUrl,financeEligible,exchangeEligible
OWNED-001,Honda,City,"ZX, Premium",2022,1200000,25000,petrol,automatic,1,Sedan,good,White,Black,,false,false
```

Use decimal prices without currency symbols or grouping commas. Stock IDs use letters/digits/hyphens/underscores and are normalized to uppercase. Duplicate identities are rejected within the batch and against existing tenant stock, including stock at another dealership. Imports never overwrite an existing record or republish sold stock. Edit existing stock through its authorized record instead.

The parser supports quoted commas, escaped quotes, CRLF, embedded newlines and a UTF-8 BOM. It rejects unexpected/duplicate columns, malformed quoting and inconsistent field counts. Formulas are never executed. Validation reports record row and field; one invalid row rejects the whole batch.

**Preview import** checks canonical fields and identities without creating records. Changing CSV contents or destination invalidates the browser preview. **Import drafts** revalidates everything against current records; it commits all rows and their creation audits together. Retrying a committed file reports duplicate identities rather than creating another batch.

## API and persistence

All endpoints resolve a verified staff principal and enforce `inventory:write`, dealership and location scopes:

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /command/api/vehicles` | `{dealershipId, locationId, vehicle}` | 201 with one draft |
| `POST /command/api/vehicles/import` | `{dealershipId, locationId, csv, mode: "preview"}` | 200 with transient preview records; no writes |
| Same endpoint, `mode: "commit"` | Same approved CSV and destination | 201 with committed drafts and batch ID |
| `PUT /command/api/vehicles/{id}` | `{vehicle}` with the same intake fields | 200 with edited metadata; identity/status/source preserved |

Client tenant/ID/slug/publication/source fields are rejected in vehicle input. Request JSON is bounded to 1 MB before parsing. Validation returns 400 and row/field issues, scope denial 403, unknown records 404, and concurrent identity conflicts or sold-record correction attempts 409. No secret-bearing provider URLs are accepted.

PostgreSQL checks location→dealership membership under RLS, serializes new identity creation by tenant, and inserts vehicles plus history in the same transaction. Demo mode uses the existing atomic state transaction. Creation history carries `action: created`, source, batch ID, actor and the canonical record; metadata edits retain before/after records. This uses migration 0003 already introduced in PR #11; no new schema migration is required.

Unit/persistence tests cover CSV edge cases, protected-field rejection, duplicate handling, preview purity, authorization, tenant separation, rollback on audit failure and publication readiness. Browser tests cover entry→edit→publication plus CSV preview/commit on Chromium and mobile WebKit. Check the PR's exact-commit Quality Gate before release; physical device, live Aurora and installed native acceptance remain separate gates.

## Remaining inventory scope

Direct Excel parsing, image upload/storage processing, richer feature/gallery editors, authorized external ingestion/reconciliation, optimistic concurrency for all metadata edits and an acquisition/cost ledger remain unfinished. These CSV/manual operations do not activate market scraping, provider messaging or an AI model.
