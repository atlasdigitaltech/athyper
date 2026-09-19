# Notification Operations code review — 2026-09-06

Scope: POST /api/operations/notifications/deliveries/{id}/replay and GET /api/operations/notifications/deliveries/{id}/timeline, including service authorization, SQL persistence, transaction boundaries, delivery workers, provider callbacks, and HTTP error handling.

## Confirmed findings and fixes

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Replay consulted the tenant-wide outbox before checking delivery visibility in the requested plane. A matching key could return a receipt for an invisible delivery. | Resolve and lock the tenant/plane-scoped delivery before looking up the receipt. |
| High | Concurrent same-key requests checked receipts before acquiring the delivery lock. The waiting request could see the new pending state and return 409 instead of a duplicate receipt. | Read the receipt after the delivery lock, before validating replayable status. Restrict the row lock to the delivery. |
| High | Replay retained the previous provider external ID. A delayed callback matching that ID could apply an old outcome to the requeued delivery. | Clear external_id atomically when requeuing. The SES callback repository matches this ID both during lookup and under its update lock. |
| Medium | Operations errors carried statusCode but did not extend the HTTP runtime's HttpError; permission denials, missing replay targets, and state conflicts became 500 responses. | Make NotificationOperationsError extend HttpError. Replay-key validation also returns an explicit 400. Shared route validators now return HttpError as part of concurrent notification route work. |
| Medium | A header-only replay failed because the route required a JSON object before reading Idempotency-Key. | Permit an absent body; continue rejecting malformed supplied bodies. |
| Medium | UUID letter casing changed the replay event key even though PostgreSQL resolves both forms to the same delivery. | Construct the event key from the canonical UUID returned by PostgreSQL. |
| Medium | Timeline omitted sent_at and could advertise a scheduled retry when the attempt budget was exhausted. | Include a sent event and require remaining attempts before emitting retry_scheduled. |

## Verification

Regression tests cover authentication, authorization without repository access, HTTP 400/403/404/409 handling, header-only replay, 202/200 receipt semantics, unexpected errors remaining 500, delivery visibility before receipt lookup, canonical replay keys, receipt lookup after locking, replayable and non-replayable states, provider correlation reset, timeline ordering, retry exhaustion, and subscriber error redaction.

Repository tests compile real PostgreSQL SQL through Kysely with deterministic driver responses. They verify query ordering and scope parameters; they do not exercise live PostgreSQL locking, RLS, or provider delivery. A live simultaneous-replay test and a delayed-provider-callback test remain integration validation work.

The existing outbox remains the replay receipt store; this change does not introduce a separate long-lived idempotency ledger. Timeline data remains a projection of delivery timestamps and attempt logs, rather than a complete replay/provider-event audit history.

Other in-progress workspace changes were preserved.

Validation results: notification package tests passed (14 files, 161 tests). Production TypeScript checking passed. Package test typechecking reported TS2554 in the concurrently edited src/__tests__/preference-outbox.test.ts (line 31 at validation time: expected two arguments, received one). Diff whitespace checks passed for the changed operations and route files.
