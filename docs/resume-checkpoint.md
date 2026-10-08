# Active checkpoint — 8 October 2026

Current branch: `feat/crm-conflict-safety`, based on published capital checkpoint `cc324b215aca3a3712648c1aeffb2cc715a246b6`. PR #13 is ready for review: exact code `7fcbecdd8e952cf55eff6cf2518a50210bf877a0` passed all quality checks and Windows/macOS native packaging. Artifact links are in release-capital-2026-10-08.md. PRs #11–#13 are stacked and unmerged.

Current implementation adds lead/task optimistic versions, sale-closure guards, parent-first task locking, atomic demo lead/audit/automation writes and truthful consent/provider hold outcomes. See crm-conflict-safety.md. Full release CI for this increment must be verified on its published code commit before claiming browser/native acceptance.

Local environment: Node 24.19.0, pnpm 10.17.1 with `/workspace/scratch/1eb9ae4ea85a/pnpm-bin` on PATH. Local browser binaries were unavailable; full browser acceptance runs on GitHub. Never run concurrent builds/dev servers against the same .next output. Development launcher invalidates production output; rebuild before production HTTP auth tests.

Use GitHub create_tree/create_commit/update_ref for publication if shell git push lacks credentials. Inspect remote HEAD and use expected-SHA lease. Source specifications and mandatory repository docs were read; retain locked AWS decisions over the overview's Cloudflare/R2 proposal.

Continue unfinished software scope after release QA: full staff/control-plane administration, accounting/reversals and advanced AI/market gateway/ingestion. External acceptance requires AWS identity/approved budget, private Aurora connectivity, HTTPS app origins and Cognito staff; signed native distribution requires Windows/Apple identities; live providers need configured authorized accounts and licensed sources. Do not request secrets pasted in chat, expose demo auth, invent delivery/market figures or claim the whole ecosystem is complete. No cloud resources or production release have been performed.
