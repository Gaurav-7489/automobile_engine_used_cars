# Inventory entry, review and spreadsheet import

Inventory intake supports individual entry and reviewed CSV/Excel batch imports. The original entry workflow shipped in PR #12; direct Excel support and the spreadsheet review workflow shipped in PR #21. Both preserve the canonical vehicle model and appointments/sales behavior. Shared cloud activation remains a separate gate.

## Staff workflow

Open Command Center → Inventory. Accounts with `inventory:write` can select an assigned dealership/location and expand **Enter a vehicle**. Required fields cover stock identity, make/model/variant, year, INR asking price, mileage, fuel, gearbox, owner count, body style, condition and colours. Finance/exchange flags default false. A public HTTPS image URL is optional for a draft.

**Save draft vehicle** persists a canonical vehicle with a server-generated ID/slug, authenticated tenant, selected authorized location, `available` availability and `draft` publication. The new stock does not appear publicly. Expand **Edit vehicle details** to attach or revise its first image and metadata. The remaining gallery, features/specifications, source and immutable identity fields are preserved. Publication requires imagery and a positive price; use the existing publication control after review. A URL is not proof of image ownership or successful delivery: verify rights and image visibility before publishing.

Sold vehicle details cannot be edited through this workflow. Sales corrections/reversals remain a separate unfinished accounting workflow.

## CSV contract

Download the CSV header template in Inventory. Excel can also be uploaded directly as `.xlsx`; its workbook contract is described below. Maximum file size is 250,000 UTF-8 bytes and 200 vehicles. All columns through `interiorColor` are required. `imageUrl`, `financeEligible` and `exchangeEligible` are optional. Optional eligibility cells use exactly `true` or `false`; missing values mean false.

```csv
stockId,make,model,variant,year,price,mileage,fuelType,transmission,ownership,bodyType,condition,exteriorColor,interiorColor,imageUrl,financeEligible,exchangeEligible
OWNED-001,Honda,City,"ZX, Premium",2022,1200000,25000,petrol,automatic,1,Sedan,good,White,Black,,false,false
```

Use decimal prices without currency symbols or grouping commas. Stock IDs use letters/digits/hyphens/underscores and are normalized to uppercase. Duplicate identities are rejected within the batch and against existing tenant stock, including stock at another dealership. Imports never overwrite an existing record or republish sold stock. Edit existing stock through its authorized record instead.

The parser supports quoted commas, escaped quotes, CRLF, embedded newlines and a UTF-8 BOM. It rejects unexpected/duplicate columns, malformed quoting and inconsistent field counts. Formulas are never executed. Validation reports record row and field; one invalid row rejects the whole batch.

**Preview import** checks canonical fields and identities without creating records. Changing file contents or destination invalidates the browser preview and review acknowledgement. **Import drafts** revalidates everything against current records; it commits all rows and their creation audits together. Retrying a committed file reports duplicate identities rather than creating another batch.

## API and persistence

All endpoints resolve a verified staff principal and enforce `inventory:write`, dealership and location scopes:

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /command/api/vehicles` | `{dealershipId, locationId, vehicle}` | 201 with one draft |
| `POST /command/api/vehicles/import` | `{dealershipId, locationId, csv, mode: "preview"}` | 200 with transient preview records; no writes |
| Same endpoint, `mode: "commit"` | Same reviewed file and destination | 201 with committed drafts and batch ID |
| `PUT /command/api/vehicles/{id}` | `{vehicle, expectedVersion}` with the same intake fields | 200 with edited metadata; identity/status/source preserved |

Client tenant/ID/slug/publication/source fields are rejected in vehicle input. Request JSON is bounded to 1 MB before parsing. Validation returns 400 and row/field issues, scope denial 403, unknown records 404, and concurrent identity conflicts or sold-record correction attempts 409. Embedded URL credentials, local/IP hosts and common secret query parameter names are rejected. Use a publicly served image URL; do not put provider credentials in image fields.

PostgreSQL checks location→dealership membership under RLS, serializes new identity creation by tenant, and inserts vehicles plus history in the same transaction. Demo mode uses the existing atomic state transaction. Creation history carries `action: created`, source, batch ID, actor and the canonical record; metadata edits retain before/after records. This uses migration 0003 already introduced in PR #11; no new schema migration is required.

Unit/persistence tests cover CSV edge cases, protected-field rejection, duplicate handling, preview purity, authorization, tenant separation, rollback on audit failure and publication readiness. Browser tests cover entry→edit→publication plus CSV preview/commit on Chromium and mobile WebKit. Check the PR's exact-commit Quality Gate before release; physical device, live Aurora and installed native acceptance remain separate gates.

## Remaining inventory scope

Image upload/storage processing, richer feature/gallery editors, authorized external ingestion/reconciliation, a full accounting ledger remain unfinished. These CSV/manual operations do not activate market scraping, provider messaging or an AI model.

Inventory PUT/PATCH now require `expectedVersion` from the scoped snapshot (`version ?? 0` for legacy records). Drafts start at version 0; metadata, price/publication updates and confirmed sales increment it. Missing versions return 400; stale edits return 409 without writes. Refresh and review before retrying. Browser and desktop clients submit the current version. Deploy the bundled clients with this API change. See [capital operations](capital-operations.md) for verified acquisition costs.


## Excel and spreadsheet review — 10 October 2026

Command Center → Inventory → **Import Excel or CSV** accepts `.xlsx` directly, as well as pasted/uploaded UTF-8 CSV. Both formats retain the 250 KB file / 200 vehicle limit. Downloadable templates are generated from the same canonical column names. Excel provides an empty **Inventory** worksheet, text-formatted stock IDs, field dropdowns and a separate **Guide** containing examples and required/optional rules. The guide is never imported.

Select an assigned destination, upload the file, then **Preview import**. Preview shows every vehicle field, the chosen worksheet/location, total asking price and unpublished draft state. Validation errors retain worksheet/CSV row numbers and offer a download containing only row, field and instructions. No source vehicle values are copied into the error report. The user checks the review acknowledgement before adding drafts; changing file contents or destination clears the preview and approval. The acknowledgement is a browser review aid, not a new server authorization boundary. Server-side commit still validates the full batch against current stock and permissions.

Send exactly one of `csv` (text) or `xlsx` (base64 file bytes) to the existing import endpoint. Destination permissions are checked before Excel decompression. Responses add `format` and, for Excel, `worksheet`; saved vehicles/creation audits retain `source: xlsx`. Existing CSV/native callers remain compatible. The protected `GET /command/api/vehicles/template?format=xlsx|csv` requires inventory read access and returns an attachment with private/no-store caching. It contains no dealership/customer data.

Excel intake reads the visible worksheet named **Inventory**, or the only visible sheet. Supported values are UTF-8 XML inline/shared/rich text, finite canonical numbers and boolean eligibility cells. Stock IDs must be text to preserve exact identities and leading zeros. Formulas, macro content, embedded objects, linked workbooks, hidden Inventory rows/columns, merged cells, date/time or error cells, unsupported cell types, extra non-template columns, malformed archives/XML and entity declarations are rejected. Nothing is evaluated, fetched or extracted to disk. Sparse rows retain their actual row position; blank rows inside the data fail ordinary required-field validation. Price/mileage strings reject currency symbols, units, hexadecimal coercion and invalid numbers.

Archives are read lazily with validated entry sizes: at most 80 entries, 2 MB per expanded part and 4 MB total. Actual decompressed bytes are also counted. XML depth, nodes, row positions, columns and shared-string/value sizes are bounded independently. Parser/template dependencies are isolated behind server-only package subpaths and add no Excel runtime to the public website or staff browser bundle.

Accepted candidate [Quality Gate 38047866346](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38047866346) passed all 86 browser/API cases, 23 staff HTTP cases, 27 security, 10 database/parser and 5 intelligence regressions, lint, four builds/typechecks and AWS/CDK synthesis. Both native packaging jobs passed [run 38047866343](https://github.com/Gaurav-7489/automobile_engine_used_cars/actions/runs/38047866343). Desktop/mobile browser evidence was inspected, and an independent openpyxl save/load round trip passed. Release/deployment state is recorded in [spreadsheet intake delivery](spreadsheet-intake-2026-10-10.md). The parser/database tests include Unicode, rich/shared text, booleans, leading-zero stock IDs, renamed worksheet relationships, invalid rows, archive limits, formulas/macros/links, date styles and malformed/hidden/extra data. Browser cases add Excel template→error→preview→commit→publication, retry/scope protection and preview invalidation on file/location changes. The real-cloud configuration and installed native acceptance gates remain open. This increment introduces no new schema migration and does not enable hosted writes.
