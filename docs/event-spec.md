# VandLabs Automobile Engine — V1 Event Specification

The event layer connects acquisition and vehicle discovery to lead creation and downstream outcomes without pretending that attribution is more certain than the recorded evidence.

## Core identifiers

Every production event should include the identifiers that are actually known:

- `tenant_id`
- `organization_id`
- `dealership_id`
- `location_id` when relevant
- `session_id`
- `vehicle_id` when relevant
- `lead_id` once identity exists
- `source`, `medium`, `campaign`, `term`, `content` when permitted and known
- `occurred_at`
- `schema_version`

Do not invent missing identifiers.

## V1 customer journey events

| Event | When it fires | Important context |
| --- | --- | --- |
| `page_view` | Public route viewed | path, session, permitted acquisition context |
| `inventory_search` | Search/filter state is meaningfully changed | query/filters, result count |
| `vehicle_view` | Vehicle detail viewed | vehicle_id |
| `compare` | Vehicle shortlist is compared | selected vehicle ids |
| `whatsapp_click` | WhatsApp handoff is invoked | vehicle_id when present |
| `call_click` | Phone handoff is invoked | vehicle_id when present |
| `lead_created` | General/enquiry lead accepted | lead_id, vehicle_id, source |
| `test_drive_requested` | Test-drive intent accepted | lead_id, vehicle_id |
| `finance_interest` | Finance intent accepted | lead_id, vehicle_id |
| `exchange_interest` | Exchange intent accepted | lead_id, vehicle_id |

## Attribution views

Store multiple views rather than collapsing the journey into one false answer:

- `first_touch`
- `last_touch`
- `lead_creation_source`
- `campaign_assisted`
- `vehicle_interest_history`
- `offline_outcome`

CAC, ROAS and revenue attribution must stay unavailable until cost data and trustworthy downstream outcomes are connected.

## Privacy

Only collect fields needed for business and product operations. Marketing/WhatsApp consent is separate from transactional follow-up. Production retention must be defined independently for leads/customers, analytics, logs, media and backups.
