# Automobile Engine Architecture — V0.1

## Monorepo
pnpm + Turborepo coordinates three Next.js applications and shared packages.

## Applications
Public Experience is server-renderable and SEO-oriented. Command Center is the dealership operating shell. Platform Control Center is the separate VandLabs network-management shell.

## Tenant model
VandLabs → Organization / Dealer Group → Dealership / Brand → Location. Public experience identity is read from typed tenant configuration rather than scattered brand strings.

## Vehicle model
Canonical Vehicle owns identity, tenant/dealership/location keys, commercial facts, specifications, media, lifecycle status, source metadata and finance/exchange eligibility.

## Repository abstraction
UI → Application Service → Repository Interface → Mock Adapter. VehicleRepository, TenantRepository, LeadRepository and AnalyticsRepository define the current boundary. API/AWS adapters can replace mocks later without teaching components about infrastructure.

## Experience Engine
V0.1 provides typed brand, theme, typography, navigation, SEO defaults, feature entitlements and experience switches. This is intentionally not a page builder.

## Command Center
Routes cover overview, leads, inventory, customers, pipeline, appointments, analytics and settings. These are professional shells only; V0.1 does not implement a full CRM.

## Platform Control Center
Routes cover overview, dealerships, organizations, onboarding, health, integrations and features. Demonstration information models VandLabs operating a network without implementing production tenant management.

## SEO
Public routes remain server-renderable. The vehicle route generates metadata. Robots and sitemap endpoints exist, with platform/command areas excluded from crawling. Structured-data helpers are the next safe enhancement once a real canonical production domain is configured.

## Loading and failure
The public app uses contextual skeletons, a route error boundary, empty inventory state and explicit not-found handling. Staff surfaces retain immediate application shells.

## Performance and accessibility
Server Components remain the default. Client JS is limited to the public error retry boundary. Layouts use responsive grids, minimum touch targets, focus-visible styling and reduced-motion support. Media placeholders avoid layout shift until a production media source is attached.

## Testing
Playwright smoke coverage targets homepage, inventory, vehicle detail, compare, contact, invalid vehicle, responsive overflow, Command Center and Platform Control Center. TypeScript/build commands run through Turborepo.

## Future AWS integration
Planned adapter path: Next.js BFF → AWS API Gateway → domain services → Aurora PostgreSQL/S3/Redis/event workers. AWS is intentionally not provisioned in V0.1.

## Not in V0.1
Production AWS/auth/database, advanced CRM, AI, advanced analytics, DMS/messaging/finance/valuation integrations, workshop, parts, insurance, customer garage, billing, native apps, full automation engine and workflow builder.
