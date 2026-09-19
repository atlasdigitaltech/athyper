# Business Partner V1 operations

Status: local implementation baseline; production rehearsal required

This runbook covers the native internal Supplier case journey and its
reference-only notifications. It does not authorize direct case, master-data,
outbox or notification-table mutation.

## Signals and thresholds

| Signal                            | Threshold                              | First check                                                         |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Governed mutation p95             | More than 800 ms for 10 minutes        | Break down by operation and status code.                            |
| Governed-case error rate          | More than 1% for 10 minutes            | Correlate API failures with database and dependency health.         |
| Oldest non-terminal case          | More than 24 hours for 15 minutes      | Inspect case status, current work item and assigned owner.          |
| Notification planning failure     | Any retry or dead letter in 10 minutes | Inspect the safe event code, routing rule and template version.     |
| Oldest pending notification       | More than 5 minutes for 5 minutes      | Check planner worker health and notification outbox state.          |
| Notification planning dead letter | Any current row                        | Review the DLQ reason before using the authorized replay operation. |

## Triage

1. Confirm the alert is limited to `business_partner.*` events and note the
   operation, outcome and status-code labels. Never copy protected request or
   evidence payloads into an incident channel.
2. For a stuck case, use the authorized case view to compare its row version,
   current workflow request, work item owner/status/version and latest bounded
   proof. A notification does not own or complete workflow state.
3. For planning failures, confirm the active routing rule and template match
   the accepted matrix. Recipient hints are references; delivery addresses are
   resolved only by Communications at planning time.
4. For materialization failures, establish whether the command was rejected,
   conflicted or replayed. Do not retry with a new idempotency key until the
   stored command evidence has been reviewed.

## Recovery and verification

- Refresh stale browser state and repeat the command only with the current
  expected version and the original idempotency key when replay is intended.
- Reassign or reopen approval work only through the workflow authority.
- Replay failed notification delivery only through the authorized notification
  operations API. Planning dead letters require Communications review of the
  rule/template defect before replay.
- Verify recovery using the case-age, planning-outcome, pending-age and
  dead-letter panels. Retain the sanitized command/test receipt and trace.

Escalate to Master Data for case/materialization authority, Workflow for task
ownership, Communications for routing/template/delivery, and SRE for worker or
database health. Production qualification remains blocked until this runbook is
rehearsed in the target environment and its evidence is retained.
