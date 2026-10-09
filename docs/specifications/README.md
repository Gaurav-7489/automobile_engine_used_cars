# Authoritative source documents

The five documents shared for Automobile Engine are preserved here as complete, searchable text extracts. `manifest.json` records each original PDF filename, its SHA-256 hash and the extract hash. The source PDFs remain the supplied originals; text extracts preserve requirements, not page design.

| Source | Repository extract | Purpose |
|---|---|---|
| Automobile Engine 75 Decisions v2 | [75-locked-decisions.txt](75-locked-decisions.txt) | Locked architecture and V1 boundary |
| Automobile Engine Master Specification | [master-specification.txt](master-specification.txt) | Core product and engineering contract |
| Used-Car AI Ecosystem Master Blueprint | [master-blueprint.txt](master-blueprint.txt) | Full staged ecosystem, acceptance and business scope |
| VandLabs used car system | [digital-growth-strategy.txt](digital-growth-strategy.txt) | Original digital growth/commercial baseline |
| Used-Car AI Ecosystem Overview | [ecosystem-overview.txt](ecosystem-overview.txt) | Connected web, native and platform product direction |

Use the 75 locked decisions and master specification for architecture/V1. The blueprint's Supabase alternative and overview's Cloudflare/R2 proposal do not supersede the locked Aurora/Cognito/S3 AWS baseline without an explicit revised decision. The blueprint describes proposed future modules as well as the pilot; preserving a requirement does not certify its implementation or deployment.

Current implementation and deployment gaps: [completion register](../source-of-truth-completion-register.md). Setup: [shared staging](../shared-staging-setup.md). Release scope: [9 October delivery](../release-2026-10-09.md).
