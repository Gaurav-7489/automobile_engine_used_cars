# Licensed provider synchronization

This increment hardens the existing contracted canonical-JSON adapter. It does
not connect a marketplace, create a license, scrape a website or invent listings.
No real provider credentials or live-feed acceptance are included.

## Lifecycle and isolation

The staff API verifies identity and requires `commerce:manage`. An atomic tenant
transaction checks the licensed source's enabled dealer-use agreement and claims
one 60-second lease for that source. An active lease blocks overlapping calls.
Expired leases are recoverable and recorded as interrupted attempts.

The adapter performs one HTTPS GET outside the PostgreSQL transaction, with a
10-second timeout, no redirects, JSON content type and the shared 1 MB JSON body
limit. It supports administrator-approved public DNS endpoints, rejecting IP
literals, local names, URL credentials and unrelated runtime-secret names. These
URL checks do not pin DNS; endpoint approval must include DNS/egress review.

Commit obtains the tenant row lock, checks the exact run ID and lease, rechecks
source permissions and validates the entire batch. Late responses cannot replace
a newer run. Invalid batches and observations older than stored source records
leave the last committed data intact. Sourcing records remain separate from
owned dealership inventory.

Successful calls use a configurable minimum interval of 60–86,400 seconds
(default 60). Failures save an exponential cooldown from 60 seconds to one hour;
provider `Retry-After` seconds/date values are honored within that bound. A caller
before the next attempt receives 429 with `Retry-After`. This is per tenant/source
pacing, not proof of compliance with a provider's account-wide contracted quota.

Each failure category is fixed: configuration, provider authentication, rate
limit, unavailability, invalid payload, agreement or expired lease. No raw provider
body, exception, URL or token is saved to source status/history. The latest 200
finished attempts per tenant are retained in `dealer_commerce.payload`, under its
existing forced RLS and transaction protections. Optional JSON fields let older
commerce rows remain readable; no SQL migration is required.

## Secure configuration

After a contract and canonical field mapping are approved, add these as GitHub
**environment secrets**, not environment variables:

- `VANDLABS_FEEDS_JSON`: endpoint configuration.
- `VANDLABS_FEED_TOKENS_JSON`: a map of approved credential names to provider tokens.

Configuration shape (illustrative, not a real provider endpoint):

```json
[
  {
    "tenantId": "approved-staging-tenant",
    "sourceId": "approved-source-id",
    "url": "https://licensed-provider.example.com/canonical-feed",
    "tokenEnv": "VANDLABS_FEED_TOKEN_APPROVED",
    "minIntervalSeconds": 300
  }
]
```

The token map has the key `VANDLABS_FEED_TOKEN_APPROVED`; set its actual value only
in the secure secret editor. Each tenant/source pair must have exactly one endpoint.
The deployment forwards the token-map secret to the three applications. Separate
individually configured Worker secrets with the same prefix are also supported.
Configuration values are never returned by the source-summary API.

The endpoint emits `docs/examples/sourcing-feed.json`: at most 500 vehicles and
100 fuel observations per batch. Provider-specific adapters must be implemented
against an approved contract and specification. Omitting an existing record does
not mark it sold; a supplier must explicitly send `available:false`.

## Dealer experience

The source page displays available/expired record counts and the oldest/latest
vehicle observation timestamps. These are different from the last successful
provider sync. A sync today does not prove its observations were taken today.
Missing observations and unsuccessful initial syncs remain explicitly empty.

An unsuccessful manual sync refreshes the source status and shows a fixed failure
message and next attempt time. Sync is disabled while running or cooling down;
**Refresh source status** obtains current server status after the wait. Provider
configuration failures never reveal credentials or provider responses to staff.

## Verification and remaining work

Tests use isolated local fixtures and mocked provider HTTP. They exercise success,
concurrency, tenant separation, cooldown/pacing, provider backoff, oversized/invalid
bodies, superseded leases, agreement revocation, endpoint validation, credential
redaction, stale observations and coverage definitions. An embedded PostgreSQL
integration proves sync history survives repository recreation under the restricted
runtime role and is absent from another tenant's row.

Browser coverage exercises a deliberately unconfigured local test source, failure
persistence, disabled retries, refresh and responsive layout without contacting a
provider. The fixtures are never production customers or live listings.

Remaining: approved feed contracts/credentials, live staging tests, provider-wide
quotas, scheduled jobs, incremental cursors, full retention/AI-processing rights,
provider-specific schemas, VIN reconciliation and notification/alert delivery.
Stored retry times do not schedule an automatic background retry. These remain
release-tracker tasks; adapter code is not a licensed live feed.
