# Master data raw API review — 2026-09-06

Reviewed the local checkout's six routes in `server/packages/services/master-data/src/master-data-routes.ts`, their shared service implementation, normalization, contracts, and the common master DDL and Neon verification triggers. Unrelated working-tree changes were preserved.

## Confirmed findings and fixes

| Priority | Finding | Fix |
| --- | --- | --- |
| P2 | Optional strings of the wrong type were silently dropped. For example, a malformed `effectiveUntil` became an immediate deactivation; repeated `asOf` parameters became a current-time query. | Reject malformed optional strings and timestamps with 400. |
| P2 | Effective dates and profile query dates accepted arbitrary strings, ambiguous local dates, and impossible calendar dates. UUID database coordinates accepted arbitrary path strings. | Validate timezone-bearing ISO timestamps including calendar days; validate owner/contact/address-link UUID paths before service calls. Keep timestamp validation in services for direct callers. |
| P2 | Address bodies were cast to a TypeScript interface without runtime validation. String, null, and nonfinite coordinates bypassed numeric range checks; nonstring address text threw incidental TypeErrors. | Validate address text types and finite numeric coordinates, preserving range and paired-coordinate checks. Return explicit domain errors. |
| P2 | Both deactivate endpoints required a JSON body even though their only field is optional and the service defaults it to the current time. | Accept an omitted body; continue rejecting explicit nonobject bodies. |
| P2 | All TypeErrors, including errors from services or context extraction, became 400 responses containing the internal exception message. | Use explicit request-validation errors and forward unexpected failures to the server error handler. |
| P2 | Verification checked the injected verifier's boolean result but did not itself enforce `issuedAt`/`expiresAt`. A signature-only verifier could accept expired or future-issued evidence. | Check evidence timestamps against one captured server instant before signature verification and mutation. |

## Route coverage

- Both deactivation routes: authentication, optional body, timestamp and ID parsing, write authorization, tenant-scoped repository calls, missing-target handling, transaction-scoped effects.
- Verification: authentication, ID/boolean/evidence parsing, authorization, signature rejection, evidence time window, transaction-scoped effects.
- Both creation routes: authentication, owner coordinates, field parsing, normalization, metadata/owner lookup, duplicate flow, transaction-scoped effects.
- Profile: authentication, owner coordinates and `asOf`, all three read permissions, metadata/owner lookup, tenant/owner/time arguments to both repository queries.

## Integration limitations and remaining work

Host registration was added on 2026-09-07. `registerServices` mounts all six routes using host IAM and verified request context. It now defaults to `KyselyMasterDataRepository` and constructs services with metadata, authorization, exact-plane transactions, audit, and outbox. Repository and verifier overrides remain available through `ServiceRegistrationDependencies.masterData`.

The five operations that do not verify evidence can now use PostgreSQL without a provider adapter. The verification operation returns `503 MASTER_DATA_VERIFIER_UNAVAILABLE` until a trusted verifier is supplied. If neither metadata nor database configuration exists, all routes return authenticated `503 MASTER_DATA_UNAVAILABLE`.

Host testing also exposed an IAM resource-coordinate mismatch: `entityCode` without `operationKey` invokes an incomplete descriptor-operation binding. Owner-scoped master operations now pass `ownerEntityCode`, tenant ID, owner type ID, and owner ID as resource coordinates.

### PostgreSQL repository implementation

- Every operation uses only the passed transaction. There is no repository-owned pool, independent transaction, or plane fallback.
- Owner lookup resolves quoted storage identifiers from active, tenant-accessible `control.owner_type` rows, requires the requested entity code to match the registry code, and checks tenant-scoped backing records. Database owner/purpose triggers remain enforced.
- Reads, updates, and joins explicitly scope tenant IDs. Address linking cannot select another tenant's address.
- Owner advisory transaction locks serialize contact/address-link creation and period closure. Contact checks cover overlapping bounded periods as well as open periods; database unique indexes and address primary exclusion constraints remain authoritative.
- Canonical-address creation locks by tenant and normalized hash, then rechecks for an existing active address without changing its audit fields.
- Deactivation closes an interval and preserves history. Repeated closure at the same endpoint is permitted; extending an already closed interval returns 409. Invalid ranges return 400. Profiles use half-open intervals: start inclusive, end exclusive.
- Addresses require `countryCode`, matching the NOT NULL/FK constraints. Address-link dates are derived from the supplied instant's UTC calendar date and returned at UTC midnight; contacts retain timestamp precision to JavaScript milliseconds. An address link's end date must be later than its start date, so same-day closure returns 400. This preserves the existing database model rather than silently changing it to timestamp storage.
- Verification writes provider, signature, and JSON evidence together, and clears `verified_at` on unverification. Existing signed-evidence triggers remain enabled.
- Expected database uniqueness/exclusion errors map to 409, foreign-key errors to 422, and invalid values/ranges to 400, without returning SQL details.

### Live database evidence

Eight integration tests passed in a disposable PostgreSQL 16.13 container with the actual common master tables and Neon owner registry, constraints, indexes, relevant owner/normalization/verification triggers, and tenant RLS policies. Tests cover owner/entity/tenant mismatch, historical boundaries, verification/unverification, duplicate and primary races, canonical address deduplication, timezone-independent address mapping, error translation, and rollback of a real outbox test-table write and contact insert after audit failure. RLS is exercised under a non-owner role with a different tenant context.

This is a focused DDL integration fixture, not a full application deployment: it uses minimal tenant/country/owner fixtures, test implementations of shared tenant-context functions and UUID generation, and a test effect table in place of the production audit/outbox tables. Tests use real PostgreSQL transactions and constraints. Production database bootstrap, all-plane grants, and provider signature validation remain outside these checks.

Reproduce against an empty disposable PostgreSQL database with `ATHYPER_MASTER_DATA_DB_TESTS=true` and `ATHYPER_MASTER_DATA_TEST_DATABASE_URL` set, then run the package's `src/__tests__/master-data-repository.postgres.test.ts` test. The suite installs schemas and a test role, so do not point it at an application database. It is skipped in normal unit-test runs.

The production Ed25519 verifier and target-aware contract were added on 2026-09-07. Host configuration uses `MASTER_DATA_VERIFICATION_KEYS_JSON`; missing keys still produce 503. Evidence is bound to verified tenant/plane context, the locked contact ID/channel/value, requested state, and signed envelope fields. PostgreSQL now rejects concurrent reused or older evidence within the mutation transaction. See [provider verification protocol](master-data-provider-verification.md) for the exact signing format, trust configuration, replay policy, rollout requirements, and remaining external provider setup.

## Validation

Added HTTP tests using an actual Express listener and service regression tests covering guards, input failures, evidence timing, and effect propagation. Ran the complete master-data package test suite, package source/test typechecks, and diff whitespace checks. See the completion message for final counts.
