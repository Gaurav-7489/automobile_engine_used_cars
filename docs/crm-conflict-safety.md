# Lead and follow-up consistency

Lead PATCH and task PATCH require `expectedVersion` from the scoped snapshot. Legacy records have version 0. Successful edits advance the version; stale writes return 409, missing/malformed versions return 400. Deploy browser, desktop and API changes together. Versions are persisted in existing JSON payloads; no schema migration is needed.

The browser keeps the user's note draft when a conflict occurs, disables another save and offers an explicit reload to review the current record. Copy any unsaved text before reloading. Desktop displays the API error and uses Refresh to retrieve current records; failed writes are not automatically replayed.

PostgreSQL checks versions under row locks and rolls back audit failures. Follow-up operations lock the parent lead before the task, matching sale confirmation's lock order. Sale confirmation increments the lead version and each newly closed task version, and marks those tasks with `closedBySaleId`. An ordinary task update cannot reopen a sale-closed task. Tasks already completed before the sale retain their state/version; new aftercare tasks remain separate recorded work.

The demo adapter now commits enquiry/lead changes, internal tasks, automation runs and audit records in one atomic state replacement. A failed automation calculation rolls the entire operation back. Duplicate automation remains guarded per tenant/lead/rule/trigger. No configured provider delivery exists: WhatsApp rules with missing consent record `skipped_consent`; otherwise held provider actions record `skipped_provider` and create no internal task pretending to be delivery. No message delivery is claimed.

Tests cover two browser editors, stale and missing versions, PostgreSQL audit rollback, demo automation rollback, sale-closed follow-ups and consent/provider distinctions. Exact-commit CI determines release acceptance. These changes do not implement full staff provisioning, a sale-reversal accounting workflow, external messaging or production staging.
