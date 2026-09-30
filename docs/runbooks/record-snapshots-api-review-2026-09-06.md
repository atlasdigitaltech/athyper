# Record snapshots API review — 2026-09-06

Reviewed the workspace implementation of all four routes in `server/packages/services/records/src/snapshots/snapshot-routes.ts`, its service and PostgreSQL repository, the normal record query/mutation boundaries, and the snapshot DDL and triggers. Fixes are applied locally.

| Priority | Confirmed finding | Fix |
| --- | --- | --- |
| P1 | Capture computed a JavaScript hash and compact JSON byte count, but the database trigger requires a different evidence envelope and PostgreSQL JSONB text encoding. Inserts fail trigger validation. | Compute the hash with `snapshot.fn_compute_entity_snapshot_hash` and the size with PostgreSQL `octet_length(jsonb::text)` in the capture transaction. |
| P1 | Snapshot query and comparison returned historical fields without the underlying entity's record/field read authorization. | Require the published entity read permission with tenant/entity/record coordinates and project payloads to currently readable fields. Reject missing or remapped entity metadata. |
| P1 | Restore serialized mutation failures as HTTP 200. Snapshot domain exceptions also bypassed the `HttpError` translation used by normal record routes. | Reuse the normal record mutation response mapper and translate `RecordServiceError` to `HttpError`. Conflicts, denials, missing records, validation failures and locks retain their HTTP error status. |
| P2 | Comparison authorized only `fromSnapshotId`. | Validate and authorize both snapshot resources before invoking comparison. |
| P2 | Capture accepted unsupported enums and wrong option types; malformed dates threw `RangeError`; invalid validity ranges and event identifiers reached database constraints. Non-UUID correlation IDs reached a UUID cast. | Validate capture options, calendar dates, timezones, validity ordering, enum values, event syntax and correlation UUIDs before persistence. |
| P2 | Restore accepted non-decimal or unsafe versions through `Number()`, while the integer header contract rejected quoted versions before the handler. | Accept decimal positive safe integers, optionally enclosed in paired quotes. Missing/invalid restore preconditions produce 428. |
| P2 | Restore could apply a historical payload to an entity whose storage mapping or payload contract changed. | Reject mismatched storage coordinates, contract hashes and unsupported payload schema versions before patching. |
| P2 | Replay depended only on payload equality, silently discarding changes to retention, validity, source version, capture event and other evidence metadata. | Compare capture metadata as well as the normalized JSON payload; delivery correlation and actor changes do not prevent replay. |
| P2 | JavaScript Date values differed from persisted JSON strings, and row timestamp conversion could discard milliseconds. | Normalize payloads through JSON before comparison/persistence and preserve Date precision when decoding rows. |
| P2 | Snapshot responses lacked explicit private-data cache prevention and route contracts omitted permission/error metadata. | Set `Cache-Control: no-store` and declare permissions and applicable error responses. |

## Validation

- PASS: Records package TypeScript checks, including test compilation.
- PASS: Records package Vitest suite: 155 tests passed; the two opt-in database tests were skipped here and passed separately. Coverage includes HTTP authentication, validation, permission denials, error mapping, service authorization, restore compatibility, replay and repository SQL tests.
- PASS: Two real PostgreSQL integration tests in an isolated temporary database using the repository snapshot domains, identity/payload tables, hash function and validation/immutability triggers. They cover concurrent capture, replay, tenant-qualified reads, wrong-plane rejection, Unicode/nested/Date payloads, evidence hash and byte count, timestamp round trips and retention changes. The temporary database was removed afterward.

- Host-wide TypeScript check is blocked by unrelated policy package errors: `policy-route-contracts.ts` and `policy-routes.ts` cannot resolve `@athyper/server-runtime-http`, with resulting implicit-any handler errors. No snapshot-related compiler errors were reported.

The isolated database checks do not certify deployed role grants/RLS configuration or a running HTTP deployment. Snapshot payloads returned by reads/comparison are now permission-filtered; the evidence hash continues to describe the complete stored payload. Restore requires a matching published payload contract; no migration of older snapshots is attempted. Capture continues to snapshot the caller's authorized record projection.
