# Workflow API review — 2026-09-06

Reviewed the local implementation of all seven requested routes, the workflow service, both repository adapters, contracts, database schema definitions, and platform-host composition. Changes are applied locally.

## Confirmed findings and fixes

| Severity | Routes | Finding | Fix |
| --- | --- | --- | --- |
| High | POST work-items | Client payloads could provide `eligibility_evidence`, which repository authorization treats as candidate membership, or forge workflow revision/request associations. | Reject server-managed payload fields at the public route boundary. Trusted internal workflow producers can still provide resolution evidence. |
| High | All mutation routes | Idempotency keys were recorded as metadata/event keys without mutation deduplication. Repeated creation inserted duplicate items; successful actions could not be replayed. | Use the existing transactional `event.command_execution` store. Fingerprint command input and actor, replay recorded results, return 409 for changed input, and commit receipts with mutation/audit/outbox. Scope event keys to actor, item and event type. |
| High | claim/complete/cancel | Invalid supplied row versions became `undefined`, causing the service to use the current version and bypass the caller's concurrency precondition. | Reject malformed, nonpositive and unsafe versions. Preserve optional versions for the existing dedicated routes; generic actions still require a version and key. |
| High | Action routes | Action policy evaluation ignored pinned versions and enforced observation-only denials. | Check evaluated policy revisions, limit checks to authorization/precondition/validation stages, and enforce only enforced bindings. |
| High | Action routes | Another eligible candidate could complete or cancel an item already claimed by someone else. Completion also bypassed future availability. | Add claimant ownership and availability checks to the atomic SQL update and in-memory implementation. |
| Medium | GET inbox; action routes | Team assignments and unclaimed candidate assignments were absent from the inbox; team members could not claim team work. | Apply tenant-scoped current team membership and candidate eligibility to inbox data/count and actions. Guard malformed candidate arrays before SQL expansion. |
| Medium | GET inbox | Invalid cursors were silently ignored or accepted with values that would fail PostgreSQL casts. Pagination truncated microseconds through JavaScript Date, potentially skipping rows. A full final page advertised an unnecessary next page. | Share strict cursor validation, preserve database microseconds in the cursor, and use a one-row lookahead. |
| Medium | Creation/actions/inbox | Optional fields, payloads and outcomes of the wrong type were silently dropped. Repeated query parameters and coercible nondecimal limits were accepted or ignored. | Reject malformed fields, objects, query shapes and limits with 400. |
| Medium | Mutation routes | Foreign-key/check/uniqueness failures escaped as server errors. | Map them to 422/400/409 responses with generic messages. |
| Low | GET request context | Unsupported context persistence looked like a nonexistent request. Uppercase UUID input could miss payload-linked items. | Return 503 for an unsupported repository operation; normalize UUID case for payload matching. |
| Low | Action persistence | State changes did not update the explicit status-change/update timestamps and actor fields. | Maintain these fields in the atomic update. |

## Validation

- Workflow package: **65 tests passed** across six test files, including 50 added regression cases.
- Workflow source and test TypeScript checks passed.
- Platform-host suite: **127 passed, 1 skipped**. Its workflow vertical exercises authenticated route registration and repeated keyed action handling.
- Platform-host TypeScript check passed.
- Diff whitespace check passed for changed workflow and host files.

Regression coverage includes all seven authentication boundaries, HTTP parsing/error mapping, concurrent duplicate creates, successful action replay, key/fingerprint conflicts, receipt rollback, policy versions/enforcement, candidate/team ownership, scheduling, pagination, PostgreSQL query compilation and context query tenant scoping.

## Operational and review limits

The PostgreSQL repository tests compile and inspect queries and simulate returned rows; they do not execute against a live database. Live RLS, database grants, concurrent receipt locking and production inbox query plans remain deployment validation items. No remote API was mutated or deployment performed.

The production host uses the existing command-execution adapter/table; no migration is introduced. Custom service hosts that send idempotency keys must provide a `commandExecutions` store (or `workflowCommandExecutions` in platform-host dependencies). An absent store now returns 503 instead of pretending to honor the key. Existing requests made before receipts were introduced cannot be reconstructed for replay.

Request-context reads retain the existing tenant-wide `workflow.work_item.read` permission contract. This review does not infer a new participant-only or source-entity-specific permission model. Likewise, generic approve/reject still complete a work item according to the existing repository contract; they do not introduce a new workflow-stage/domain-command orchestration path.

Unrelated pre-existing workspace changes were preserved.
