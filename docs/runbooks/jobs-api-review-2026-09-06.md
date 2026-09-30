**Jobs API review and fixes — 2026-09-06**

Reviewed the current workspace implementation of all 12 `/api/jobs/admin` operations: queues, executions, dead letters, cancel, retry, replay, schedule listing, creation, update, preview, deactivation, and audit history. This is a source and automated-test review, not verification of the deployed development host or the remote GitHub branch.

The review traced route validation and authorization, tenant coordinates, service calls, PostgreSQL repositories and constraints, BullMQ lifecycle events, cancellation messaging, and persistent schedule reconciliation. The earlier schedule identity, cleanup, validation, catalog, retry-budget, and cross-process cancellation fixes remain in place.

| Priority | Confirmed defect | Implemented fix and evidence |
| --- | --- | --- |
| P1 | BullMQ IDs are unique within a queue, while execution keys are unique within a tenant. Two queues generating ID `1` could update the same execution. | Added a separate queue-qualified `JobEnvelope.executionKey`, used consistently at enqueue, start, and terminal persistence. Handler-facing idempotency keys remain unchanged. A compatibility lookup reuses matching legacy job-ID rows, scoped by tenant and queue. Tests cover identical IDs in different queues and existing versus new execution rows. |
| P1 | Retry publishes before its audit transaction. A fast worker could finish another failed attempt before `recordCommand` set the execution back to `retrying`, clearing the new failure evidence. | The source attempt is loaded and passed to command persistence. The status update requires that attempt to remain unchanged. Compiled-SQL tests verify this guard and tenant scoping. |
| P1 | Cancellation's acknowledgement timeout began only after Redis initialization. A connection that never became ready could leave the request and shutdown waiting indefinitely. | The deadline now includes initialization. Shutdown force-closes connections without awaiting readiness. Failed initial subscriptions can be retried. Tests cover unavailable initialization, cleanup, and recovery. |
| P2 | Retry of completed, active, or queued jobs propagated BullMQ state errors as HTTP 500. Concurrent retry requests had the same problem. | Unsupported states and races return `applied: false`, using the existing HTTP 409 contract. Infrastructure failures continue to propagate. |
| P2 | Replay always used the same deduplication key, so another replay could return the retained previous job without executing. It also discarded stored subject and payload-schema metadata. | Each replay command gets a new enqueue key and carries the stored subject and schema into the replacement. Tests verify distinct replay options and metadata preservation. |
| P2 | Missing schedule updates/deactivations, duplicate schedule codes, and already-inactive deactivations could return HTTP 500. | Missing schedules now return typed 404 responses; the specific schedule-code uniqueness constraint maps to 409. Deactivating an already-inactive schedule succeeds without duplicate audit evidence. Repository and HTTP tests verify these cases. |
| P2 | Preview coerced strings and arrays to numbers, ignored falsey optional inputs, and could produce an empty successful preview for NaN. Query coercion also accepted ambiguous inputs. | Added explicit positive-integer count validation, explicit optional-field handling, timezone validation, and strict query/UUID input types. Valid preview counts above 20 retain the existing cap. |
| P2 | Malformed JSON failed in Express before Jobs route validation and became HTTP 500. | The shared HTTP error handler maps the parser's specific `entity.parse.failed` error to HTTP 400 `INVALID_JSON`. Jobs endpoint tests verify this while unexpected errors retain HTTP 500. |

Implementation references:

- [Jobs routes](../../server/packages/platform/jobs/src/job-admin-routes.ts)
- [BullMQ execution and control runtime](../../server/packages/runtime/jobs/src/bullmq-job-runtime.ts)
- [Cancellation transport](../../server/packages/runtime/jobs/src/job-cancellation.ts)
- [Administration service](../../server/packages/services/jobs/src/administration.ts)
- [PostgreSQL repositories](../../server/packages/services/jobs/src/kysely-job-repositories.ts)
- [Cron preview](../../server/packages/services/jobs/src/cron-preview.ts)
- [HTTP error handling](../../server/packages/runtime/http/src/http-runtime.ts)

Validation completed: 170 tests passed across Jobs contracts, runtime, scheduling, services, platform routes, and HTTP runtime. Typechecking passed for those six packages and the platform host. `git diff --check` passed. Repository tests execute compiled Kysely SQL through a deterministic test driver; cancellation tests use a simulated Redis broker. No live PostgreSQL/Redis integration or deployment was performed.

Existing historical duplicate rows, including rows from the original raw semantic-key mismatch, were not merged or deleted. Compatibility lookup covers matching legacy job-ID executions. Replay now treats each request as an independent command; HTTP request idempotency is not implemented. Redis publication and PostgreSQL command recording remain separate operations, so this review does not establish atomic delivery or exactly-once execution. Cancellation remains cooperative: handlers must honor their abort signal to stop ongoing work.
