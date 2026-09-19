# Webhook API code review — 2026-09-06

Scope: `POST /api/webhooks/:subscriptionId`, its admission service, active-subscription policy lookup, receipt persistence, HTTP middleware ordering, and database constraints. Reviewed the local working tree, preserving existing integration edits.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| High | The route reconstructed JSON when raw bytes were unavailable. Signatures could then be checked against content different from the received body, including a fabricated `{}` for unparsed requests. | Parse raw bytes at the route and fail closed if an earlier parser discarded them. Never reconstruct signed content. |
| Medium | The shared JSON parser's default 256 KB limit rejected deliveries permitted by the subscription's default 1 MB limit. It also parsed JSON before webhook authentication. | Bypass shared JSON parsing for this POST route. Apply a 10 MB raw-body ceiling matching the database's maximum subscription limit, then enforce the subscription's own byte limit before secret resolution. Disable decompression to preserve the signed byte representation. |
| Medium | A 64-character non-ASCII signature passed the string-length check but caused `timingSafeEqual` to throw because byte lengths differed. | Validate hexadecimal syntax and compare decoded, equal-length digest buffers. Malformed signatures return 401. |
| Medium | Valid JSON scalars and null reached a database constraint requiring an object or array, producing server errors. | Reject these payloads with 400 before persistence; retain support for arrays and objects. |
| High | Reusing a delivery key with different signed content returned a successful duplicate receipt, silently discarding the new payload. | Compare the existing receipt's body hash and return 409 on mismatch. Also reject a missing conflict receipt instead of acknowledging an `undefined` receipt ID. |
| Medium | Raw/JSON parser size and encoding errors were converted into generic HTTP 500 responses. | Map recognized size errors to 413 and unsupported encoding errors to 415 in the shared runtime. |

## Verification

- Integration package: 50 tests passed; TypeScript check passed.
- HTTP runtime package: 30 tests passed; production and test TypeScript checks passed.
- Added 22 regression cases covering exact signed bytes, tenant selection, malformed signatures, stale/future timestamps, missing authentication/subscriptions, payload shape, subscription limits, receipt conflicts, duplicate responses, missing raw bodies, invalid IDs, middleware limits, and unsupported compression.
- Scoped whitespace check passed. A whole-workspace check reported an unrelated trailing blank line in `server/packages/platform/workflow/src/in-memory-workflow-repository.ts`.

Persistence tests use a controlled Kysely driver and inspect generated SQL and returned results. No live PostgreSQL concurrency/RLS test or deployed-provider exercise was run. The endpoint acknowledges durable receipt admission; this review does not establish downstream event processing. Sender-provided delivery keys remain deduplication hints and are not covered by the existing timestamp/body HMAC protocol.
