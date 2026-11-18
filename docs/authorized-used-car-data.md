# Authorized used-car market data integration

## What this adds

- Migration `0023_authorized_market_observations.sql` introduces a source registry, historical/current external listing observations and a read-only security-definer projection.
- `GET /api/market/listings` now reads actual, enabled, unexpired and dealer-use-authorized observations. Authentication and `market.view` are required. It does not invent estimates, comparables or demand signals.
- `packages/data/scripts/import-market-csv.mjs` validates and upserts a contract-authorized CSV feed atomically.
- This is **not an OLX API integration**, does not obtain OLX data, and does not populate production automatically.
- Marketplace vehicle records (`/cars`) stay separate; they come from dealership-owned published inventory.

## Requirements

1. Obtain a feed directly from the dealer/data supplier with written permission for commercial analytics and appropriate privacy/data-retention rights. **Do not use an OLX scrape or third-party scrape without rights.**
2. Apply migration 0023 using the existing migration procedure and a database administrator role, after backup and staging verification.
3. Use a separate privileged operator connection only for importing. Runtime roles should only have EXECUTE on the read projection.
4. Place your authorized CSV somewhere outside Git. Never commit vehicle-owner personal details, credentials, contracts or private feeds to a public repository.

## CSV columns

Header (order can vary):

```csv
external_id,make,model,variant,year,fuel,transmission,km,owners,city,state,asking_price_inr,source_url,observed_at
```

- Required: `external_id`, `make`, `model`, `city`, `observed_at`.
- Optional: variant, year, fuel, transmission, km, owners, state, asking_price_inr, source_url.
- Asking prices are in whole INR, not lakhs or paise. `observed_at` should be ISO 8601 with timezone. Only HTTPS source URLs are accepted.
- CSV supports quoted values, commas and newlines. Each file must have unique external IDs. Subsequent imports update the same `(source_id, external_id)`.
- No personal contact fields, registration numbers, private photos or addresses are imported.

## Run (operator only)

```bash
export MARKET_IMPORT_DATABASE_URL='postgresql://<operator-connection-from-your-secret-manager>'
node packages/data/scripts/import-market-csv.mjs \
  --csv /secure/path/authorized-cars.csv \
  --source-id partner_kochi_01 \
  --source-name 'Partner Kochi 01' \
  --agreement 'internal-contract-reference' \
  --expires-at 2027-12-31T23:59:59Z \
  --confirm-licensed-dealer-use
unset MARKET_IMPORT_DATABASE_URL
```

A source is visible only while enabled, dealer-use-authorized and before agreement expiry. To suspend a source immediately, an authorized database operator must set `enabled=false` in `intelligence_market_sources`.

## Check

After importing into staging, sign in as a user with `market.view` and call:

```text
GET /api/market/listings?make=Maruti%20Suzuki&city=Kochi&limit=25&cursor=0
```

Response contains `data.listings`, `data.total` and `data.next_cursor`. No records returns `setup_required`. The endpoint is read-only and never creates inventory, dealer leads or a buying decision.

## Still to do before production UI is data-backed

- Acquire a real authorized feed and confirm its coverage, update schedule, provenance and deletion obligations.
- Configure the import operator connection and run migration 0023 on staging/production through normal change controls.
- Update the current Market UI integration/connection gate to use the live API rather than the demo workspace fixture and its `feed-a` status; this change intentionally does not disguise demo data as live records.
- Wire individual listing details, regional aggregated statistics and source freshness/expiry alerts; those existing API/UI surfaces still need implementation and must use licensed observations only.
- Add integration tests against PostgreSQL before releasing the functionality to dealers.

**Do not claim VandLabs has 292,351 OLX cars or live OLX access.** Those figures appeared on OLX's own site; no listing dataset was transferred to VandLabs in this change.
