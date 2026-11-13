# Operating Playbook (Edition 02) → product map

Every product claim in the playbook's Part 1 (module guide), section 1.3 (information flow), 1.5 (vehicle-level marketing),
1.6 (AI engagement), Part 11 (onboarding and health review) and Appendix B (claim control), checked against the product as of
13 November 2026. "Added" means built in this change; everything else already existed.

## The twelve modules

| Module | Playbook claim | Where it is in the product | Status |
|---|---|---|---|
| M01 Vehicle & inventory | One record per car: specs, price, availability, status, purchase and selling details; status used everywhere | Inventory, vehicle record, lifecycle transitions, CSV import | Existed |
| M02 Vehicle-level marketing | A dedicated plan per car (angle, audience, message, channels); dealership reviews, adjusts, approves | Advertising → **Plans per car**; "Start draft from plan" → campaign draft → approval | **Added** |
| M03 AI customer engagement | Answers customers from synced inventory on configured channels; conversation flows into leads; handover to team | Website chat on public car pages, WhatsApp and Instagram (Settings → **Customer messaging**), **Conversations** page | **Added** |
| M04 CRM | Customer record linked to enquiries and conversation history | Leads & customers; the lead shows the conversation that created it | Existed, conversation link **added** |
| M05 Lead management | Status and next step per enquiry; manager view of all open leads | Leads list and pipeline, tasks, automations | Existed |
| M06 Sales management | Sale linked to vehicle, customer and money | Inventory → Sold records the sale; lead → Won links it | Existed |
| M07 Financial management | Revenue and expense information alongside sales | **Revenue & expenses** page: running costs by category and branch next to sales revenue | **Added** |
| M08 Team & employee | People, roles, responsibilities | Settings → Team & roles, role permissions | Existed |
| M09 Branch management | Several locations in one environment | Branches, branch scope on every page | Existed |
| M10 Investor management | Investor records kept organised; no calculations | **Investors** page: records, contributions, repayments, payouts (owner and finance only) | **Added** |
| M11 Business intelligence | Dashboards incl. revenue and expense visibility | Overview, Capital & profit, Revenue & expenses, Assistant | Expenses **added** |
| M12 Reporting & growth | Reports over time, period comparison | Reports (previous period / last year comparison, export, scheduled email) | Existed |

## AI behaviour the playbook asks product to define (V-04)

Fixed in `lib/server/customer-ai.ts` and tested in `tests/intelligence-prod/engagement.test.ts`:

- **Missing detail**: says the record doesn't show it and offers the team. Never guesses.
- **Out-of-date or sold car**: only published, unsold cars are visible to the agent; it says the car is no longer available and offers similar ones. Reserved cars are described as held.
- **Excluded topics**: price negotiation, discounts, finance/EMI/insurance/exchange values, bookings and holds, condition or accident claims.
- **Handover**: the customer asks for a person (or the agent cannot answer) → a lead is created with the car attached and the transcript as its first note, the team is emailed, and the AI stops replying until a team member hands it back.
- **Logging**: every customer, AI and team message is stored per dealership and visible in Conversations and on the lead.
- **No AI key**: the customer gets an acknowledgement and the conversation goes to the team.

## Onboarding and health (Part 11)

- Go-live checks: channel switches are off by default; WhatsApp and Instagram details are verified with Meta before they can be switched on.
- Monthly health review: VandLabs admin console → **Customer health**, five indicators per dealership (data quality, marketing use, AI channels, lead workflow, management engagement) from the last 30 days. Thresholds are starting assumptions, as the playbook says.

## Where the product now goes beyond the playbook (update the playbook)

These are built, so the playbook's "do not promise" lines are out of date. Management should decide how to word them:

1. **Ad execution.** Appendix B says never say "We run your Meta and Google ads", and 1.1 lists "no automatic Meta or Google campaign execution". The product can now publish, pause and resume campaigns on the dealership's own Google Ads and Meta accounts after a person approves the budget. VandLabs still never spends from its own account. Suggested wording: "Once you approve a campaign, VandLabs can publish it to your own Google and Meta ad accounts."
2. **Prices by state** (asking prices across dealers on VandLabs) is close to "marketplace price-gap intelligence", listed as FUTURE. It compares published asking prices only; it is not a valuation.
3. **Market Radar and Buying** already exist behind a licensed feed and a subscription; the playbook lists sourcing and valuation as FUTURE. They stay switched off until a licensed feed is connected.
4. **Staff assistant** (ask about stock, leads, sales, prices) is not mentioned in the playbook.

## Verification register items this change answers

| ID | Answer now available |
|---|---|
| V-02 | Website chat: no third-party cost. WhatsApp: Meta WhatsApp Cloud API number, phone number ID and system-user token. Instagram: professional account linked to a Facebook Page, account ID and token. Meta's own messaging charges apply. |
| V-04 | See "AI behaviour" above. |
| V-05 | Plans use only the car's record (make, model, year, fuel, transmission, km, owners, price, days in stock, enquiries) and the branch city; rules are in `lib/marketing-plan.ts` (`plan-v1.0`). Yes, it runs on any car in the prospect's inventory. |
| V-09 | Revenue = completed sales; costs = landed cost and direct selling cost; expenses = recorded running costs. No tax or accounting. |
| V-12 | Records and recorded totals only; no return or share calculation. |

Still open and not product questions: V-13 (voice), V-14 (chat languages: the agent replies in the customer's language, but quality in Malayalam and Hindi has not been tested), V-15 to V-19 (management).

## Not yet verified against live provider accounts

WhatsApp and Instagram sending and receiving follow Meta's published webhook and messages APIs. The provider documentation could not be fetched from the build environment, and no live Meta account was used. Before going live: register the webhook URL shown in Settings → Customer messaging, set `META_WEBHOOK_VERIFY_TOKEN`, and send one test message on each channel.
