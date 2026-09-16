# P7 — Supplier onboarding communications

Status: accepted in local DEV. Fresh Basic, Standard and Enhanced activation notices passed; temporary P7 grants were revoked. P8/P9 and follow-ups B/C remain separate.

## Runtime ownership

The existing committed outbox, notification planner, message/delivery ledger, inbox publisher and captured channel transport own delivery. The supplier adapter selects a single canonical source per milestone. Generic BP and workflow events for the selected attempt do not produce competing notices. Ordinary non-process notifications retain their existing routing.

| Notice | Committed source | Recipient and readiness |
| --- | --- | --- |
| Submission | `entity.case.submitted` | Requester |
| Actionable level | `workflow.work_item.created` | Current eligible assignee; active level and attempt |
| Reminder | `workflow.work_item.reminder` | Current eligible assignee; same open work item/level/attempt |
| SLA attention | `workflow.work_item.escalated` / `workflow.work_item.sla_breached` | Current assignee or recorded escalation recipient with current case access; voting ownership does not change |
| Correction requested | `entity.case.return` | Requester; current returned attempt; authorized request contains the reason |
| Final decision | `process.document.ready` for `decision_document` | Requester/authorized run owner; exact decision snapshot and attachment version |
| Activation confirmation | `process.document.ready` for `activation_confirmation` | Requester/authorized run owner; exact materialization snapshot and attachment version |
| Operational attention | Terminal render failure, fifth committed gate failure, or terminal delivery failure | Configured operations owner with current case access |

Sixteen versioned channel templates and thirteen routing/ingress rules are canonical NEON definitions. The tenant pilot configuration pins the authenticated application origin, operations owner and enablement cutoff. Installation does not backfill old milestones.

Canonical event IDs bind the attempt, milestone and task/document; reminders also bind their scheduled occurrence. Existing ledger uniqueness deduplicates replay. Submission lookup uses the original outbox timestamp in PostgreSQL, preserving microseconds. A JavaScript timestamp must not retarget an event to another attempt.

## Recipient and artifact checks

Planning resolves the recipient's current identity and permission snapshot under that recipient's database context, restoring the actor context afterward. Delivery repeats access, current attempt/level/task, preference, contact destination and external-channel consent checks. Stale deliveries become `cancelled`, with a suppression reason and attempt evidence; they do not publish an inbox item or call transport.

The host composes a real `NotificationAttachmentAccessPolicy` backed by the process-document owner. It requires an exact pinned artifact version and current recipient authorization. Pilot messages use authenticated request links containing attempt/task/document coordinates and omit document attachments. Current process-document download APIs continue to authorize the artifact. P8 owns displaying and explaining historical link coordinates in the screen; stale attempt/task links block task actions and require explicit navigation to the current request. The screen does not yet provide a historical document-view experience.

Email preferences and consent are respected. Process-bound notices deliver immediately rather than entering digests that could lose their attempt binding. The self-service `POST /api/notifications/preferences/email-consent` accepts only `{consented:boolean}`. The server resolves the authenticated principal's current email; callers cannot supply another subject or destination. The existing consent service writes its ledger, outbox and audit evidence. No administrative grants were added.

## Failure and reminder behavior

SLA maintenance may update only its reminder/breach bookkeeping on process-owned work items; process coordinates and reviewer evidence remain immutable. Escalation can notify another authorized reader without reassigning the voting task. Reminder times are projected from the pinned SLA schedule.

Terminal delivery failure and its operational outbox event commit together. A message produces at most one operational failure notice and an operational-notice failure does not recursively create another. No communication handler writes a case decision, materialization or activation outcome. Persistent gate failures also emit committed evidence. Resolved document failures suppress obsolete operational attention.

## Local qualification

- Notification HTTP/planning/delivery suites: 88 passed, including authenticated self-consent and rejection of subject overrides.
- Existing SLA unit suite: 2 passed; attachment-resolver suite: 2 passed. Total: **92 tests**.
- Real PostgreSQL rollback checks cover microsecond submission lookup, one message on replay, reminder replay, closed-task suppression, preserved voting ownership, exact document coordinates, changed recipient/artifact access, one operational event and unchanged case status/version after terminal delivery failure.
- DEV `catl.admin` and `catl.owner` contact fixtures use the addresses explicitly supplied by the user. They do not assert verified identity. Each principal recorded email consent through their own authenticated session.
- Basic, Standard and Enhanced submission, all 13 task decisions, and final-decision notices passed through the owning APIs and real document rendering/storage. A returned-request notice also passed. **23 captured emails** match delivery ID, recipient, attempt and authenticated URL, with no duplicate delivery coordinates.
- Both principals opened inbox notices and the request through the owning APIs in NEON. Stale attempt links display an explicit current-request action instead of task commands.
- All three fresh P7 suppliers were qualified and activated through owning APIs. Their activation confirmations were rendered, scanned, downloaded and hash-verified; completion and rendering replay returned the same results. Each activation produced exactly one inbox notice and one Mailpit capture with the exact attempt, run, snapshot, document job and attachment version.
- The activation fixtures use explicitly recorded upstream risk assessments, as in P6. Company, qualification, activation and closure outcomes were produced by their owning APIs.
- All three temporary P7 role assignments were revoked. Notice access and pinned links were rechecked after revocation. See [DEV access receipt](internal-supplier-onboarding-p7-dev-access-proposal.md).

See [P7 evidence](internal-supplier-onboarding-p7-evidence.json). Reports are in `governance/policy/reports/supplier-onboarding-communications-*.dev.json`, with consent/contact receipts in `supplier-communications-dev-*.json`. Initial failed qualification attempts remain in the ledger and `supplier-onboarding-communications-initial.dev.json`.

## Reproduction

Run the canonical installer, build notifications/workflow/host and NEON, and deploy the local services with `deploy-supplier-process-selection.mjs`. The deployment helper bounds Docker overlay depth by exporting/importing a running DEV base with its configuration; earlier image receipts remain available. No migration scripts are used.

Use `qualify-supplier-onboarding-communications-db.mts`, `qualify-supplier-onboarding-communications-live.mts --resume`, and `qualify-supplier-communications-capture.mjs`. `sweep-supplier-communications-dev.mjs` enqueues the existing notification jobs and asserts local capture mode; it does not introduce another dispatcher. Live qualification requires current reviewer MFA. A new fresh activation fixture run requires separately authorized activation permissions; the P6 and P7 temporary grants are now revoked. The completed activation notices can be checked with `qualify-supplier-communications-activation-notices.mts` without restoring those grants.
