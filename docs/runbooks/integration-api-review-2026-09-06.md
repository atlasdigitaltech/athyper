# Integration API review — 2026-09-06

Reviewed the local implementation of all eight requested `/api/integration` routes, their repository queries, invocation planning, job publication, delivery execution, and the HTTP adapter. Existing unrelated workspace edits were preserved.

## Confirmed bugs fixed

| Severity | Finding | Correction |
| --- | --- | --- |
| High | Delivery creation and replay used colon-containing custom job IDs, rejected by installed BullMQ. | Deterministic IDs now use hyphens. |
| High | Delivery GET and create responses exposed the invocation plan's credential reference and secret-bearing headers; endpoint GET exposed those headers too. | Remove credential references and redact authorization, API key, cookie, signature, token, and secret headers in response copies. Internal delivery plans remain intact. |
| High | DLQ replay reset attempt_count to zero, colliding with the immutable `(tenant_id, delivery_id, attempt)` evidence constraint. | Preserve lifetime attempt numbers; use the queue execution attempt for retry exhaustion and backoff. |
| High | Reusing a semantic key with a different payload silently returned the original delivery. | Atomic SQL conflict handling compares payload hashes and returns 409 on mismatch. |
| Medium | Payload validation only checked top-level required fields and types, accepting invalid nested objects, enums, and extra properties. | Use Ajv JSON Schema validation without coercion or mutation. Format annotations are not validated. Avoid retaining fresh database schema objects indefinitely. |
| Medium | Expected payload, endpoint-state, and test-operation errors lacked HTTP status codes and became 500 responses. Invalid configured URLs threw unclassified exceptions. | Explicit 409, 413, and 422 domain statuses; classify malformed URLs and schemas. |
| Medium | Secret resolution occurred outside the delivery failure handler, leaving no attempt evidence or delivery retry/DLQ transition on failure. | Resolve credentials inside the classified attempt failure boundary. |
| Low | Uppercase valid connection UUIDs failed endpoint ownership comparison. | Normalize validated UUIDs and compare normalized connection identifiers. |
| Low | Repeated or malformed categoryCode query parameters silently removed the filter. | Reject malformed supplied filters with 400. |

## Verification

- Integration service: **29 tests passed**; TypeScript check passed.
- HTTP adapter: **7 tests passed**, **1 real-provider test skipped**.
- HTTP regressions exercise all eight routes' authentication and permission gates, tenant context, missing resources, UUIDs, category filters, response redaction, payload/schema/size validation, connection ownership, and replay publication.
- Repository tests compile and inspect PostgreSQL queries and exercise conflict/replay handling through a recording Kysely driver. They do not execute against live PostgreSQL.
- Worker regression verifies credential failure evidence, preserved attempt numbering, and a fresh replay retry budget.

## Operational boundaries

No live provider, PostgreSQL, or Redis end-to-end test was run. Database persistence and queue publication remain separate operations: if publication fails, retrying the request uses the same persisted delivery/replay and deterministic queue ID. This review does not establish automatic recovery without a caller retry. Existing append-mostly DLQ storage permits one recorded replay per delivery; repeated replay requests reuse that receipt.
