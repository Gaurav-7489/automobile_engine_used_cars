# Connecting a VandLabs website template

A dealership website built from a VandLabs template (first: `Gaurav-7489/templete-one-VLuce`) connects to its Intelligence workspace when the **owner signs in on the website's `/connect` page** with their Intelligence email and password. No keys are copied.

| Piece | Where |
|---|---|
| Sign-in and link | `POST /api/public/website/connect` → `lib/server/website-connect.ts` |
| Link check for the website | `GET /api/v1/website` (Bearer key, `inventory:read`) |
| Stock feed | `GET /api/v1/inventory`, now also body type, colours, description, features, categories, registration state (never the number), headline specifications and a featured flag when recorded |
| Enquiries | existing `POST /api/public/enquiry` |
| Managing it | Settings → API: the link is a key named `Website: <host>` with a **Website** label; revoke to disconnect |

Rules: same email/password checks, lockout and rate limits as the sign-in page; owners only (`settings.keys`); requests carrying cookies are refused; the key is read-only; only its SHA-256 is stored; a key already used by another workspace is refused (409); connect, renew and disconnect are written to the audit log. Tests: `tests/intelligence-prod/website-connect.test.ts`.

## Same demo cars as the website

`packages/demo-data/src/vluce.ts` is generated from the template's `src/data/vehicles.ts` (25 cars). Load them into a demo workspace:

```
DATABASE_URL=... OWNER_PASSWORD=... pnpm intelligence:load-vluce-demo --owner-email owner@example.com
```

Cars go through the normal command pipeline, get their photos and listing details, and the 23 available or reserved ones are published; the 2 "arriving soon" stay in preparation. Running it again skips cars already loaded. Costs are illustrative (90% of asking).

## Known limit

`/api/public/enquiry` limits enquiries per client address (6 per 10 minutes). Enquiries relayed by a website's server can share one address, so a busy connected website could hit that limit. The website also limits each visitor itself. Worth keying that limit per website key in a follow-up.
