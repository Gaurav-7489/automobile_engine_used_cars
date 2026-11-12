# Assistant, prices by state, ad accounts and Google sign-in

Four additions to the dealership workspace (`apps/intelligence`). Each one is off until its keys are set, and says so on screen.

## Assistant (`/app/assistant`)

A chat that answers questions about the dealership in plain words: ageing stock, a car's price and enquiries, lead stages and
overdue follow-ups, monthly sales, campaigns, and asking prices by state. It can also draft ad text, posts and customer messages.

- Model: Claude (`claude-opus-5-5`, override with `ASSISTANT_MODEL`), called from the server with `ANTHROPIC_API_KEY`.
  Refused requests fall back on the server (`fallbacks: "default"`).
- It reads through six fixed lookups (`lib/server/assistant.ts`) that use the same tenant- and branch-scoped queries as the pages.
  A lookup is offered only if the member's role may see that data (sales staff get no finance summary, costs only for roles
  with capital access), and the role is checked again when the lookup runs.
- Read-only. Customer names, phone numbers and emails are never sent to the model. Conversations are not stored.
- Limits: 30 questions per person per 10 minutes, 6 lookups per answer. Can be switched off per dealership (`assistant` feature).

## Prices by state (`/app/state-prices`)

Typical (median), lowest and highest asking price for a make and model in each state, and the difference against the
dealership's own state. Source: every car dealerships have published on VandLabs (the same set as `/cars`). Asking prices, not
sale prices; a state with under five cars is marked "few". Database functions `intelligence_state_prices` and
`intelligence_state_price_models` (migration `0021`) return aggregates only.

## Advertising accounts (Advertising page)

Owners and managers connect **Google Ads** (Search ads) and **Facebook and Instagram** (one Meta ad account plus the
dealership's Facebook Page and its Instagram account) through each provider's own consent screen. Tokens are encrypted
(AES-256-GCM) before they are stored in `intelligence_ad_connections`, are tenant-isolated by row-level security, and are
deleted on Disconnect.

Publishing an approved campaign now creates it for real:

- Google: one atomic `googleAds:mutate` request: budget, Search campaign with the approved end date, city targeting, ad group,
  phrase keywords and a responsive search ad linking to the car's page with UTM tags.
- Meta: campaign (traffic), ad set (city radius, Facebook and Instagram placements, approved dates), creative from the car's
  first photo, and the ad. Everything is created paused and switched on last; if any step fails, what was created is deleted.
- Daily budget = the channel's 30-day budget / 30, never above the approved daily limit. If one platform refuses, the other is
  paused and the campaign returns to Approved with the reason in its history. Pause and Resume act on both platforms.

**Not yet verified against live accounts.** The requests follow the providers' published APIs, and the tests check the
request shapes with mocked responses, but the provider documentation could not be fetched from the build environment and no
live account was used. Before relying on it: confirm `GOOGLE_ADS_API_VERSION` and `META_API_VERSION` are current, get the
Google Ads developer token approved for standard access, get Meta App Review for `ads_management`, and watch the first launch
on each platform in its own ads manager. Spend reporting (clicks, leads) is not pulled from the platforms yet.

## Google sign-in

"Continue with Google" on `/login` (OpenID Connect, authorisation-code flow, signed state + nonce bound to a cookie). It never
creates accounts: the Google-verified email must already belong to an invited member. Accounts with two-factor login must use
their password and code, so Google cannot bypass two-factor.

## Setup

See the bottom of `.env.example` for every variable and the redirect URIs to register. Run `pnpm db:migrate` for `0021`.
Tests: `tests/intelligence-prod/growth.test.ts`.
