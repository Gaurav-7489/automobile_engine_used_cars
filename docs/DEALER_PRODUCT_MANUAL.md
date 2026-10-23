# Dealership product manual — current implementation

This guide describes implemented workflows, not commercial launch certification.
Use isolated staging for acceptance. Hosted demonstration mode is read-only;
its fictional records are not stock available to purchase or live market prices.
The current primary workspace is `/command`; `/platform` is the separate VandLabs
administration surface. Staff dashboards remain private and excluded from indexing.

## Sign-in and access

An administrator must provision the dealership hierarchy and exact identity-provider
subject in the staff registry. Identity-provider registration alone grants no
organization access. Complete the configured MFA challenge during sign-in. If the
login says the provider is not connected, follow `GOOGLE_SIGN_IN_SETUP.md`; demo
identity must never be enabled against the shared PostgreSQL environment.

Current named dealer roles are owner, manager, salesperson (`sales`), acquisition
manager (`acquisition`), marketing and viewer.
Owners have commercial/financial controls; managers operate inventory and CRM;
salespeople are restricted to their assigned leads; viewers cannot mutate records.
Acquisition managers can maintain inventory and plan acquisitions without CRM or
financial-write access. Marketing users have read-only inventory and market access
without CRM, acquisition costs or API administration. These conservative defaults
can be reviewed against real dealership duties. Navigation and page permissions
share a policy; unsupported links are hidden and direct access is denied. Staff
without CRM access land on acquisition or market instead of the CRM overview. Platform administration is separately
server-provisioned and tenant-scoped; it is not a selectable dealer role.

Use Sign out to end the application session. If access is removed by an
administrator, protected requests recheck the persisted registry. Token/session
expiry, MFA, refresh, disabled-user behavior and provider revocation must still be
accepted against the actual staging provider before commercial onboarding.

## Daily operations

Open Overview for current inventory, leads, appointments and tasks. These are
records in your authorized dealership/location scope. Dashboard zeros are not
proof that a market has no demand. Analytics and intelligence use the evidence
actually collected; missing acquisition dates, costs and market observations must
remain unknown rather than being estimated silently.

## Inventory intake and maintenance

Import the supported Excel or CSV template from Inventory. Review validation
issues and the preview before committing. Canonical stock identity and tenancy
are protected. Duplicate identities, malformed amounts, formulas and unsafe media
are rejected; see `inventory-intake.md` for columns and spreadsheet boundaries.

On mobile, expand Manage inventory for a vehicle's controls. Edit details or price,
then save. A stale record version produces a conflict: refresh and review the
other change before retrying. Changing vehicle status does not replace the
approved sale-record workflow. Record sold outcomes through the lead-to-sale
flow so inventory and sales evidence stay consistent. Review inventory history
for attribution and reconcile external provider records separately from owned stock.

## Leads, follow-up and sales

Open Leads, inspect the vehicle and enquiry context, qualify the lead, assign its
owner and record internal notes. Use tasks for follow-ups and appointments for
visits or test drives. Complete or reschedule the corresponding record rather
than creating duplicate open work. Pipeline changes are persisted with activity
history and version checks.

Confirm a sale through the sales workflow with its actual amount and date.
A won/sold outcome is a business record, not an AI prediction. A confirmed sale
requires an approved reversal/correction to reopen; do not work around it by
editing a stage or stock status. WhatsApp links are human handoffs; automated
provider messaging is not certified. Marketing consent and platform permissions
must be respected before communication.

## Profit and capital

Owners with financial permission can enter purchase, reconditioning, transfer,
other costs, acquisition date, a supporting reference and an optional daily
holding-cost assumption. Unknown holding cost is different from zero. Corrections
are versioned and audited. Acquisition must not follow the recorded sale date.

The current capital report shows recorded cost basis, stock age, capital aged
90+ days, asking spread and recorded sale contribution. Asking spread compares an
asking price with recorded cost; it is unrealized. Sale contribution compares the
recorded sale with recorded cost; it excludes unrecorded taxes, financing,
overhead and selling expenses. Neither is net profit. Holding estimates are shown
separately. The complete requested expense taxonomy, cash ledger and capital
allocation reporting remain additional release work.

## Source agreements and imports

VandLabs platform administrators approve sources against actual agreements.
Dealer use, AI processing and external API redistribution are independent rights.
AI processing defaults to denied, including legacy source records. Source expiry
or disablement stops its records from participating in applicable reads.

Authorized dealer operators can import sourcing records and request a configured
licensed-provider sync. Source screens show coverage, original observation dates,
sync success/failure and the next permitted retry. A successful sync is not proof
that its observations are recent. Configuration failures require an administrator;
repeated clicks cannot bypass retry pacing. See `PROVIDER_SYNC.md` for secure
configuration, leases, retry behavior and remaining scheduling limitations.

## Market Intelligence

Open Market for explicitly supplied asking-price evidence. Expand filters to
select make/model/year, city, fuel, transmission, odometer, source, price range
and observation age. Submit Compare asking prices. Statistics use the complete
filtered eligible record set, while evidence cards are paginated in groups of 25.

Read source count, record count and observation dates alongside the median and
middle 50% range. Source records are not verified unique physical vehicles.
A mixed model/year cohort or small sample cannot support a reliable valuation.
Regional medians are not adjusted for vehicle mix. Purchase quotes and projected
resale prices never substitute for asking prices. Without explicit price evidence,
the screen stays empty. See `MARKET_INTELLIGENCE.md` for formulas and limitations.

## Acquisition Planner

Enter available capital, a cash reserve, city/coordinates, search radius, vehicle
count and fuel preferences. Review transport and holding assumptions explicitly.
Starter supports one-car planning; Growth and Scale support up to two and broader
cross-city scenarios under the current entitlement definitions. Do not interpret
these current limits as a complete commercial plan schedule.

Options show source observations, landed-plus-holding estimates, unallocated
capital and supplier-evidenced resale/contribution ranges. Unknown resale or
source demand remains unknown. Straight-line transport is an assumption, not a
road quotation. Confirm condition, ownership, availability, taxes and quotations
before negotiating. There is no autonomous purchase or guaranteed return.

Optional AI commentary supplements the structured calculations. It is restricted
unless all sources in the transmitted options explicitly allow AI processing.
An unavailable AI service does not remove the deterministic report. A complete
cross-module conversational dealership copilot is not implemented yet.

## Subscription and commercial API

Subscription screens display the active contracted plan and usage. A platform
administrator can provision contracted access; this does not charge a card.
Local demo plan switching is disabled in shared environments. Payment collection,
pricing approval, invoices, failed-payment lifecycle and billing webhooks remain
blocked by processor/business setup and implementation.

An authorized owner can issue a scoped, expiring API key. Copy its plaintext once
into the consuming application's secret store. Do not send it through chat,
commit it to git or place it in a public browser bundle. Revoke unused/compromised
keys and issue replacements. Requests share tenant-wide quotas: more keys do not
multiply the allowance. Supplier ingestion keys are restricted to their approved
source. Other dealers' private records are never an API catalog. Only records
with explicit redistribution rights can appear in applicable external reads.
See `dealer-data-api.md` and `business-api.yaml`.

## Desktop and support

Windows/macOS packaging is tested in CI. Published development artifacts do not
establish installation, code signing, updater or live backend acceptance. Use
only the source-bound releases accepted by the download service; production
installer rollout remains gated by physical installation and signing checks.

When reporting a failure, record the route, approximate time and request ID where
shown. Do not include credentials, customer documents, session cookies or API keys.
For conflicts, refresh and reconcile; for 429 responses, respect Retry-After; for
provider failures, inspect the source status without exposing provider secrets.
