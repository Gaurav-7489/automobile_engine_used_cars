# VandLabs Dealer Subscription Intelligence

## Product direction

The paying subscriber is a used-car dealer, dealership owner, stock buyer or dealership group. VandLabs helps them allocate acquisition capital, choose stock, compare sourcing locations and manage resale risk. A retail customer buying a personal car is not the subscription audience. The tenant public website remains an optional retail sales channel.

## Core journey

Dealership login → active subscription → available capital → dealership location / sourcing radius → one-car or multi-car strategy → evidence-backed ranked options → inspection / human approval → acquisition → inventory → resale → measured results.

For ₹10 lakh available capital, first deduct the dealer’s reserve and include purchase, reconditioning, transport and other known charges. Compare a single car with two-car portfolios within the remaining amount. “Best” means best for a selected objective and available evidence, not a universally best car or guaranteed return.

## Three proposed plans

| Plan | Acquisition scope | Proposed capability |
| --- | --- | --- |
| Starter | Local, one car | Budget fit, landed costs, explanations |
| Growth | Cross-city, one or two cars | Portfolio comparisons, market and demand evidence |
| Scale | Multiple dealership locations | Capital allocation, team controls, integrations |

Exactly three plans. Names and feature allocation are provisional. Subscription prices, billing cycle, usage quotas and commercial terms require a business decision. All live plans should expose assistive AI with plan-specific coverage and usage, rather than ungrounded model predictions.

## Recommendation contract

Inputs: tenant and permitted locations, available INR capital, reserve, sourcing radius, desired car count, inventory mix, risk preference, holding horizon and goal. Candidates must come from authorized supplier listings or verified dealer submissions. Record source, timestamp, ownership/condition evidence, quoted purchase price, route-specific transport, preparation and fees, comparable resale transactions and local demand coverage. Missing evidence remains unknown.

Rank feasible portfolios with documented versioned rules. Show total landed cost, remaining capital, resale range, gross contribution range, demand evidence, confidence, estimated time-to-sell only where supported, and why each choice ranks. Include cross-state registration/tax and vehicle-condition review. AI explains the structured result; it must not invent prices, availability, condition or profit. Human approval precedes any purchase.

## Access and billing requirements

Persist tenant-scoped subscription, plan, status, billing period, provider customer/subscription IDs and usage records. Verify signed billing webhooks with idempotency, replay protection and cancellation/expiry handling. Every protected recommendation API must authenticate staff, resolve the active tenant, enforce RBAC and active subscription entitlements, meter usage atomically and apply rate/concurrency limits. Never accept a browser-selected tier as authority. No purchase or checkout happens in this update.

## Implemented scope and remaining work

This change introduces dealer workspace navigation, three proposed plan cards and an explicit-demo-only acquisition planner. The deterministic planner compares fictional single-car or two-car combinations, includes preparation/transport/reserve, filters Starter locally and ranks by illustrative margin or demand. Production renders an unavailable state. No live model, sourcing feed, payment provider, entitlement enforcement or subscription provisioning is implemented. Existing staff authentication is retained.

Next: decide pricing/quotas; integrate verified sourcing and market data; implement subscription storage and billing; build server-side entitlement/metering; evaluate recommendation quality with actual resale outcomes; ship confidence and freshness indicators; validate tenant isolation and subscription lifecycle end to end.
