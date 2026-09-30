# Runtime command administration review

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The runtime command routes and service now enforce bounded command contracts, requester-owned replays, reviewed-preview binding, and typed HTTP responses. Runtime commands remain gated and require the application's explicit executor. No live migration, flag change or deployment was performed for this work.

## Workflow and HTTP behavior

All routes authenticate. Preview/submission require `control.runtime_command.manage`; decisions require `control.runtime_command.approve`; history requires `control.runtime_history.read`. The host selects a store for the verified plane, and service checks prevent cross-tenant/plane approval exposure and cross-principal replay.

Preview returns current/proposed JSON, a deterministic structural diff, risk, warnings and the approval requirement. High/critical risk requires approval. Unknown command kinds default to high risk unless an executor explicitly classifies them; invalid risk values fail with 503 instead of bypassing approval. The executor owns supported kinds and payload semantics.

Submission returns 202 for `approval_required` or a historical `pending` record, and a typed terminal response otherwise. New concurrent duplicates wait for the transaction and replay its committed result; lock timeout returns 409. Approval never invokes the executor. Self-review is forbidden; another permitted principal records one terminal decision. The original requester resubmits the same command with `approvalId` to execute. A pending/rejected request cannot be bypassed by a later reduction in risk.

Commands are bound to command ID, tenant, plane, idempotency key, kind, normalized reason, payload and expected version. Stored actor ownership is checked independently. Replays authorize and validate the request, then return stored terminal/pending results without rerunning preview. Executions are not automatically retried. New failed transactions leave no claim or effects; an explicit retry with the same key can execute after rollback. Historical pending/failed records from the earlier protocol remain blocked for reconciliation.

Approvals additionally persist a hash of current values, proposed values, risk and warnings. Any difference requires another review and a new command/idempotency key; a matching command payload alone is insufficient. Executors must still enforce resource versions atomically at apply time, since preview-to-apply races remain possible.

History returns an array, default limit 50, maximum 200. Query limits must be canonical positive decimal strings; arrays, exponents, fractions, unknown query fields and out-of-range values are rejected. In-memory evidence uses defensive deep copies/freeze. PostgreSQL evidence remains append-only, with tenant/plane hash-chain serialization.

## Persistence changes and deployment

`KyselyRuntimeCommandStore.appendSubmission` now serializes each tenant/idempotency key with a transaction advisory lock. It checks fingerprint, actor and plane before inserting any outcome, including different outcome rows. It accepts only initial approval/pending states, approval-to-pending, and pending-to-applied/failed transitions. Concurrent duplicate requests/claims cannot execute twice through this claim protocol.

Migration `20260916_runtime_approval_preview.sql`, registered in all three plane manifests, adds nullable `preview_fingerprint` to immutable approval requests. Fresh-install DDL matches. Apply schema before application code. Repository health checks require the new column.

Existing approval evidence is preserved without inventing a preview hash from today's configuration. An old approval lacking a hash cannot execute through the new service; submit a new command with a new idempotency key and obtain a new review. Already completed submissions can still replay. Deploy all executor-serving instances consistently so older instances cannot bypass the new check.

## Atomic executor and ledger coordination

The coordination gap is now closed for transactional database effects. `RuntimeCommandStore.atomic` owns one database transaction around each submission or approval decision. Transaction-bound store methods reuse that transaction instead of opening nested independent transactions. Request creation, its submission and history commit together; approval decisions and their history commit together; claims, executor effects, outbox inserts, applied results and history commit together.

`RuntimeCommandExecutor` now requires `effects: "transactional"`. Apply receives `transaction`; PostgreSQL executors must write through `transaction.database`. The service also passes that transaction into the execution preview. Executors must enforce expected resource versions in their updates. No production executors are currently registered; the host still requires explicit application registration before enabling this surface. The marker is an integration contract, not a sandbox: an executor that uses an unrelated connection or sends HTTP directly violates it.

PostgreSQL verifies the physical plane and sets verified tenant/principal context inside the transaction. A transaction advisory lock is acquired before reading the command's state. Duplicate requests therefore wait and replay the committed result, or receive 409 on lock timeout/deadlock/serialization failure. No retry occurs automatically. A lost response after a successful commit can be recovered using the same idempotency key. Never replace that key merely because the response was lost.

Executor errors, invalid results, history failures and commit-time constraint errors abort the whole transaction. New aborted commands do not persist a `failed` row, because a separately committed failure row would break this boundary. An explicit retry after rollback can run again. Old pending/failed rows remain unchanged and require reconciliation; this work does not assume their external effects were rolled back.

Remote effects must be represented by an outbox row written through the supplied transaction. A worker delivers after commit with its own delivery idempotency protocol. The command result then represents durable enqueue, not confirmed delivery. This transaction does not make arbitrary HTTP/email/provider effects exactly once and the implementation does not permit a nontransactional executor mode.

The in-memory store serializes callbacks and restores its ledger snapshot on error for tests. It cannot roll back arbitrary JavaScript side effects and is not a production database substitute.

The separate feature, rounding, connector and other administration mutation routes do not automatically use this approval workflow.

## Verification

Service and HTTP tests cover the full preview/request/review/resubmit flow, no execution on approval, pending HTTP 202, self/foreign review, requester-owned replay, changed preview rejection, legacy approvals, concurrent claims/decisions, malformed commands and history limits, failure replay, and immutable nested evidence.

Twelve real PostgreSQL cases pass against each fresh-install and migrated ledger schema (24 executions): concurrent approval requests and execution claims, competing decisions, conflicting fingerprints, requester/tenant isolation, immutable chained history, atomic effects/outbox writes, executor/history/commit failures, approval-evidence rollback and physical-plane rejection. These use the actual four ops ledger tables/triggers with a restricted test role in disposable databases, not a deployed authentication/browser flow or a full-plane RLS rehearsal.

Run only against an empty disposable database:

```sh
ATHYPER_RUNTIME_COMMAND_DB_TESTS=true \
ATHYPER_RUNTIME_COMMAND_TEST_DATABASE_URL="$DISPOSABLE_RUNTIME_DATABASE_URL" \
ATHYPER_RUNTIME_COMMAND_TEST_MIGRATION=true \
pnpm --filter @athyper/server-platform-control-admin exec vitest run src/runtime-command.postgres.test.ts
```

Omit the migration variable for fresh-install coverage. Use a different empty database for each run.


Atomic-coordination verification: the 740-test unit suite passed, plus the added executor-contract rejection test; 12 PostgreSQL tests passed on each of fresh and migrated schemas; control-admin source/test and host TypeScript checks passed. The change needs no additional schema beyond the previously prepared `20260916_runtime_approval_preview.sql`. No live deployment was performed for this follow-up.
