# Automobile Engine Architecture — V0.1

Domain-driven modular monorepo. Tenant hierarchy: VandLabs → Organization / Dealer Group → Dealership / Brand → Location.

Domains: Platform Core, Experience, Vehicle Commerce, Growth, CRM, Communication, Intelligence, Automation, Integration Hub, AI Platform.

Data boundary: UI → application service → repository interface → mock adapter. Later adapters connect through Next.js BFF → AWS API Gateway → domain services → Aurora PostgreSQL / Redis / S3 without rewriting UI.

V0.1 intentionally excludes production AWS, Cognito, production database, advanced CRM/AI/integrations, workshop, parts, insurance, billing and native apps.