# Connecting a VandLabs website template

A dealership website built from a VandLabs template (first: `Gaurav-7489/templete-one-VLuce`) is linked to its Intelligence workspace **by a VandLabs administrator**: admin console → dealership → Website → a website key shown once, set on the website's deployment as `VANDLABS_API_KEY` (with `VANDLABS_API_URL`). Since Google-only sign-in (docs/GOOGLE_SIGN_IN.md) owners have no Intelligence password, and they never type credentials into their public website.

The older owner-password connect (`POST /api/public/website/connect`) answers 410 unless `LEGACY_PASSWORD_LOGIN=enabled`. Connections it created keep working.

The two products are sold separately. Intelligence works without a website; a website works without Intelligence (see the template's `docs/DEPLOYMENT.md` for website-only operation). This page is only about the optional link.

## Contract (website integration v2)

| Piece | Endpoint | Auth | Notes |
|---|---|---|---|
| Link / relink / unlink (admin) | `POST/DELETE /api/admin/workspaces/{tenant}/websites` | platform administrator, Google session + fresh Google confirmation | Key shown once; relinking revokes the previous key; audited |
| Connect (legacy, owner password) | `POST /api/public/website/connect` | owner email + password | Off (410) unless `LEGACY_PASSWORD_LOGIN=enabled` |
| Link check | `GET /api/v1/website` | website key | Which workspace, renewal date. Also triggers delivery of any pending inventory webhooks |
| Stock | `GET /api/v1/inventory` | website key (`inventory:read` satisfied) | Published, available stock only. No costs or margins |
| Enquiries | `POST /api/v1/website/enquiries` | website key + `Idempotency-Key` | All enquiry types, below |
| Analytics | `POST /api/v1/website/events` | website key | Cookieless counts, below |
| Inventory changes → website | `POST {site}/api/webhooks/inventory` | HMAC signature | Sent by Intelligence after commit |
| Dealer view | `/app/website` (Reports → Website) | session, `reports.view` | Empty state when no website is connected |

The workspace is **always the key's**. Nothing in a request body (a `tenant` field, a stock id from another dealership) can move data into, or read data from, another workspace. A key limited to some branches only records enquiries for cars in those branches; enquiries without a car go to the key's first branch.

### Keys

- Connecting creates (or renews) an API key with the **`website`** scope, named `Website: <host>`, valid a year, with the site's origin stored for webhooks. Only the key's SHA-256 is stored.
- `website` allows: reading published stock, recording website enquiries and analytics. It does **not** allow reading leads.
- Reconnecting the same site with a different key (the website's `WEBSITE_SECRET` was rotated) revokes the site's previous key, so one site has one live key.
- Connections made before v2 are `inventory:read` keys named `Website: …`. They keep working (including for v2 enquiries) and are upgraded to `website` when renewed.
- Revoke from Settings → API, or **Disconnect** on the website's `/connect`. Both are in the audit log. Queued webhooks for a revoked key are dropped, not sent.

### `POST /api/v1/website/enquiries`

Headers: `Authorization: Bearer <website key>`, `Idempotency-Key: <8–80 of A-Z a-z 0-9 _ - :>`.

```json
{
  "type": "vehicle | callback | test_drive | price | sell | visit | general | whatsapp",
  "reference": "VL-ABCDE-12345",
  "name": "Anu Thomas", "phone": "98470 12345", "email": "optional",
  "message": "optional, ≤600 chars",
  "stockId": "required for vehicle, test_drive, price; optional otherwise",
  "appointment": { "date": "YYYY-MM-DD", "time": "Morning | Afternoon | Evening | HH:MM" },
  "sell": { "brand": "Honda", "model": "City", "variant": "", "year": 2019, "km": 42000, "owners": 1, "city": "", "expectedPrice": 650000 },
  "consent": true, "consentAt": "ISO timestamp", "marketing": false,
  "utmSource": "", "utmMedium": "", "utmCampaign": "", "referrer": "google.com", "page": "/collection/..."
}
```

Responses: `201 { ok, reference: "L-1001", duplicate: false, type }` · `200` duplicate (same Idempotency-Key, or the same phone about the same car — or, without a car, the same request type — within a day) · `404` car not published/available/in the key's branches · `422` field errors (`error.fields`) · `401` bad/expired/revoked key · `403` wrong scope · `413` too large · `429` limited (per key 60/min, per address 240/min).

| Type | Becomes |
|---|---|
| vehicle, price | Lead on the car, source Website; price/finance noted |
| callback | Lead (with or without a car), first task "Call the customer back" |
| test_drive, visit | Lead with the **requested** slot recorded in `lead.enquiry.requested` and the note; first task "Confirm the test drive" / "Confirm the showroom visit". Staff schedule the real appointment; a request is never booked automatically |
| sell | Lead with the customer's car in `lead.enquiry.sell` and the note (acquisition enquiry); first task "Arrange an appraisal" |
| general | Lead with Unspecified interest |
| whatsapp | Lead with source WhatsApp — only for a submitted form. A click on a WhatsApp button is analytics, never a lead |

Every enquiry runs through the normal command pipeline: follow-up rules, read model, audit trail and lead emails behave as for a lead staff add. Attribution (UTM, referrer, page) and the consent timestamp are kept on `lead.enquiry`.

### Inventory webhooks

- When a command changes a car that is (or was) on the website, an event is written to `intelligence_webhook_outbox` **in the same transaction**, one per connected website. It is delivered after the commit, retried with backoff (30 s doubling, up to 10 attempts), caught up when the website next checks in (every refresh window) and by the daily job `GET /api/cron/website-webhooks` (Bearer `CRON_SECRET`).
- Payload: `{ id, type: "inventory.changed", occurredAt, vehicles: [{ stockId, changes: ["published" | "unpublished" | "price" | "images" | "reserved" | "sold" | "available" | "details"] }] }`. No prices, costs, margins or customer data; the website re-reads stock through the authenticated API.
- Headers: `X-VandLabs-Event-Id`, `X-VandLabs-Timestamp` (Unix seconds), `X-VandLabs-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>`, where `secret` is the hex SHA-256 of the website key. Receivers must reject timestamps more than 5 minutes off and event ids already processed.
- Targets: production sends only to public `https` origins (no loopback, private, link-local or `.local` hosts). `WEBSITE_WEBHOOKS_ALLOW_LOOPBACK=1` exists for local end-to-end runs only.
- A car is on the website while it is published **and available** with photos and a price (exactly how it is saved). Reserving a car takes it off the website.
- If an event is lost, the website's scheduled refresh (`VANDLABS_REVALIDATE_SECONDS`, default 300) restores consistency.

### Website analytics

`POST /api/v1/website/events` with `{ events: [{ type: "visit" | "vehicle_view" | "whatsapp_click" | "call_click", sid, stockId?, source?, medium?, campaign?, device? }] }` (≤20).

- Stored only as daily counts in `intelligence_website_metrics` (by source, campaign, device, car). No IP address, user agent, name or contact. `sid` is a random per-tab id used only to count a visit or view once; its salted hash lives two days in `intelligence_website_seen`. Aggregates are kept 400 days.
- Views of cars this workspace does not list are ignored, so "most viewed" cannot be polluted.
- **Enquiry figures come from recorded enquiries**, not events, so they cannot be inflated; WhatsApp/call clicks are reported as clicks.
- The website does not count visitors who send Do Not Track or Global Privacy Control, sets no cookies and uses no third-party tracker. Dealers remain responsible for their privacy notice under the DPDP Act 2023 (or their jurisdiction's law); the website's enquiry form records consent and its timestamp.

## Older route

`POST /api/public/enquiry` (vehicle enquiries by `tenant` + `stock`) remains for Intelligence's own listing pages and websites not yet on v2. If a website presents a key there, it must be valid and belong to that dealership (401/403 otherwise).

## Migration and deployment order

Migration `0023_intelligence_website_integration.sql` is additive (new scope value, nullable `site_origin`, four new tables with row-level security, one lookup function replaced with a superset). Deploy Intelligence (run migrations first), then the website. A website on the new version talking to an older Intelligence falls back to the older route for car enquiries and keeps other enquiry types queued until Intelligence is upgraded.

## Same demo cars as the website

`packages/demo-data/src/vluce.ts` is generated from the template's `src/data/vehicles.ts` (25 cars). Load them into a demo workspace:

```
DATABASE_URL=... OWNER_PASSWORD=... pnpm intelligence:load-vluce-demo --owner-email owner@example.com
```

## Tests

- `tests/intelligence-prod/website-integration.test.ts`: every enquiry type, idempotency, same-day dedupe, sold/unpublished refusal, branch-limited keys, cross-tenant isolation, no key / wrong scope / expired / revoked / oversized / malformed requests, webhook signing, tamper and replay rejection, backoff, disconnect, key rotation, analytics dedupe and report.
- `tests/intelligence-prod/website-connect.test.ts`: connect, renew, wrong password, MFA, ownership, disconnect.
- `tests/ecosystem/website-journey.spec.ts` (`playwright.ecosystem.config.ts`): Intelligence + VLuce production builds on PostgreSQL. Dealer publishes → website shows it via webhook → customer enquires on a phone → lead in Intelligence → reserving removes it → late enquiry refused; website-only CRM outage and recovery; unconfigured production site. See `tests/ecosystem/README.md`.
