# Notification raw API review — 2026-09-06

Scope: the nine requested `/api/notifications` raw routes, their preference service/store, inbox and push SQL, subscriber timeline ownership filtering, SSE lifecycle, HTTP error handling, and host composition. Review used the local `stack-v2-foundation` checkout. Unrelated and concurrent workspace edits were preserved; notification operations changes made concurrently were included in the combined validation but are not attributed to this review.

## Findings fixed

| Priority | Finding | Correction |
| --- | --- | --- |
| P2 | Raw-route input helpers throw `TypeError`, which the runtime classifies as 500. This affects IDs, query parameters, preference bodies and push subscription fields. | Request validators now raise explicit HTTP 400 errors. Preference capability, consent and duplicate-item validation also return 400. Internal repository TypeErrors remain 500. Required web keys and mobile tokens are checked before persistence. |
| P2 | Cursor decoding silently falls back to page one for malformed data; decoded but invalid UUIDs/timestamps can reach PostgreSQL casts. Query arrays are coerced or ignored. | Validate the scalar base64url cursor, payload shape, UUID and timestamp before repository access. Reject invalid calendar dates, oversized cursors, repeated scalar parameters and non-decimal limits. |
| P2 | Stale preference versions return 500; If-Match accepts weak tags, mismatched quotes and unsafe integers. | Stale versions return 412. Accept quoted strong numeric tags and the existing bare numeric form, checking safe integer range. Invalid or missing versions return 400. |
| P2 | Preference replacement commits before a separate invalidation-outbox transaction. Failure or a stalled publisher can produce a failed/hanging response after a successful mutation, and lose invalidation. | The PostgreSQL store writes invalidation inside the replacement transaction. Outbox failure propagates to the coordinator for rollback. Additional post-commit publication is best effort and does not hold the HTTP response open; the existing outbox uniqueness rule deduplicates it. |
| P2 | SSE cleanup uses the incoming request close event instead of the outgoing response lifecycle. Synchronous delivery/abort during subscription setup can leak a subscription and heartbeat. | Bind disconnect cleanup to response close. Install abort handling before writes/subscription setup and release subscriptions returned after synchronous closure. |

## Route coverage

| Route | Review and regression coverage |
| --- | --- |
| POST `/{id}/read` | Authentication, UUID rejection before persistence; existing scoped persistence and rejected/stalled fan-out tests retained. |
| GET `/deliveries/{id}/timeline` | Authentication, UUID validation, principal restriction and missing result; SQL filters tenant, message plane and recipient. Concurrent operations suite covers additional timeline behavior. |
| GET `/inbox` | Authentication, verified scope, limit/unread parsing, malformed and valid cursors, internal error classification. |
| GET `/preferences` | Authentication, verified scope and version ETag. |
| PATCH `/preferences` | Authentication, strong version parsing, stale-version response, committed-update publication behavior and transactional outbox path. |
| POST `/preferences/preview` | Authentication, malformed/duplicate payloads; existing capability and consent preview tests retained. |
| POST `/push-subscriptions` | Authentication, required platform credentials, wrong field types, existing snake_case aliases and verified scope despite spoofed body fields. |
| DELETE `/push-subscriptions/{id}` | Authentication, invalid IDs and scoped deactivation. Missing subscriptions intentionally retain idempotent 204 behavior. |
| GET `/stream` | Authentication, live HTTP disconnect cleanup, scoped event delivery and synchronous setup cleanup. |

## Validation and limits

Final validation: **161 notification tests passed**, including concurrently added operations tests; **18 host notification composition/adapter tests passed**. Notification production and test TypeScript checks passed. `git diff --check` passed. Transaction tests compile actual Kysely SQL and verify transaction boundaries and error propagation with a dummy driver; they do not exercise PostgreSQL rollback, RLS, constraints, or concurrent transactions. No authenticated development mutations, provider sends or deployment were performed.

The SSE contract remains tenant/principal scoped across planes, as defined by the existing shared event interface. This review does not introduce a new plane-scoped event protocol, durable SSE replay, or backpressure limits. Push credential validation checks required fields, not provider acceptance or cryptographic key validity. Custom preference stores must supply their own durable invalidation guarantee; the atomic outbox guarantee applies to the production PostgreSQL store.
