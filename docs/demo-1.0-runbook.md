# Demo 1.0 — operator runbook

**Purpose:** Present a reliable, truthful end-to-end Apex Select Cars reference demo. This is a **local reference demonstration**, not evidence of a live AWS or production rollout.

## Gate 1 — certify current main

From GitHub Actions, select **Quality Gate → Run workflow → main**. Check that the run succeeds: lint, typecheck, security tests, embedded PostgreSQL tests, production builds, Playwright desktop smoke, Cognito-mode staff HTTP authorization regressions, and AWS CDK synthesis.

Desktop installer verification is separate: **Desktop installers → Run workflow → main**, on Windows/macOS runners. Inspect uploaded NSIS `.exe` and macOS `.dmg` artifacts and the native tests. Unsigned installers are for demonstration only and may trigger OS warnings; no installed binary is considered certified until opened and tested.

A successful GitHub Action is a test signal, **not** proof the application has been deployed or integrated with a live provider.

## Gate 2 — start the local reference demo

Prerequisites: Node 22, Corepack, pnpm 10.17.1; free ports 3000, 3001, 3002. From repository root:

```bash
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install --frozen-lockfile
AUTH_MODE=demo DATA_MODE=demo pnpm dev
```

- Public website: http://127.0.0.1:3000
- Command Center: http://127.0.0.1:3001/command
- VandLabs Platform: http://127.0.0.1:3002/platform

Never use `AUTH_MODE=demo` on a real staff-facing public deployment. Demo writes use a local reference adapter, not the live Aurora database.

## Gate 3 — 7-minute presentation story

1. Introduce **Apex Select Cars** as a clearly labeled reference dealership; do not present sample data as verified real-market listings.
2. Open inventory, search/filter, choose a vehicle, and show the vehicle detail with conversion paths.
3. Submit a **test-drive or finance enquiry** with a distinct name and valid demonstration contact details; avoid collecting actual client personal information.
4. Open Command Center → Leads. Confirm the same enquiry appears with vehicle, intent and available attribution context.
5. Open the new lead. Update its stage, assign an owner, save a note, schedule a follow-up, complete/reopen the task. Confirm state persists across navigation/reload.
6. Open Analytics and Automation. Explain that first-party events, rules and report counts are derived from recorded reference data. Do not claim WhatsApp messages were sent.
7. Open Platform and explain multi-dealership configuration, integration/reconciliation foundations and permissions. Do not claim real vendor connectors or self-service onboarding are active.

## Gate 4 — desktop / multi-client acceptance (requires configured staging)

The native Tauri app calls the *same staff API* as the browser. To demonstrate cross-client live persistence, deploy a staging Node/Aurora/PostgreSQL runtime with TLS, register real Cognito browser and desktop OAuth clients, provision staff scopes, and configure HTTPS endpoints as described in `docs/production-runtime.md`. Do not point desktop at the local JSON reference adapter and call it shared cloud persistence.

Demonstrate: (a) browser enquiry appears in desktop Leads; (b) marking a vehicle sold in desktop changes public inventory availability; (c) denied staff scope cannot mutate restricted resources.

## Release decision

**PASS** only after the checked revision's Quality Gate succeeds and the human presenter confirms the seven-step reference story. Record the checked commit SHA, GitHub Action URLs, browser/OS version, any failed steps, and whether the run was demo-only or live staging.

**DO NOT LABEL AS LIVE** until deployed Cognito login, HTTPS origins, Aurora migrations/isolation, shared mutations, backup/restore and security acceptance are independently verified. Installer builds alone do not imply signed or notarized distribution.

## Known deliberate exclusions

No live WhatsApp send, full DMS/CRM vendor sync, advanced AI salesperson, lender APIs or production billing. The current production automation adapter creates internal tasks; WhatsApp provider delivery is not connected.
