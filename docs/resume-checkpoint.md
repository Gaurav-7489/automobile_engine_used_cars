# Active checkpoint — 9 October 2026

The user authorized completing fixes, retrieving the shared specifications and pushing all work to main. Earlier session deployment authorization covers refreshed protected Vercel previews. Do not remove SSO or enable writes against isolated serverless files.

The candidate includes deployment branch `372d0dcdbd91c934cb0b735ba35cb688449981e5` and the persistent Platform/staff/shared-runtime work documented in [release-2026-10-09.md](release-2026-10-09.md). All five supplied PDFs have full archived extracts with hashes in [specifications/](specifications/). Locked AWS decisions remain authoritative. The complete blueprint is not shipped.

Local checks: pinned pnpm 10.17.1, lint/typecheck, four frontend builds, 23 security, 6 database/provisioning, 5 intelligence tests, AWS TypeScript build and staging CDK synth. Browser downloads were blocked locally. Hosted browser/native and exact publication identifiers must be recorded after release verification.

Three Vercel projects contain browse-only preview settings and no shared backend/Cognito configuration. There is no AWS identity or database connection in this session. See [shared-staging-setup.md](shared-staging-setup.md) for migrations, role, real tenant provisioning, safe network and identity setup, and acceptance. Never request secrets pasted in chat, fabricate stock/providers or claim live acceptance from local tests.

Use GitHub create_tree/create_commit/PR tools when shell push lacks credentials. Check remote head and preserve concurrent user changes. Avoid concurrent builds/dev servers against the same .next output. Full staff policies, AWS domain deployment/restore/monitoring, signed installed native acceptance, media/XLSX, providers/feeds, AI gateway and advanced business/market modules remain unfinished.
