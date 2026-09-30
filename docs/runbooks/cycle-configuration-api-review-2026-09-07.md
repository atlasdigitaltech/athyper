# Cycle configuration API review — 2026-09-07

Scope: preview, validate, publish, signed desired-state apply, latest revision read, and explicit revision read under `/api/control-admin/cycle-config`.

## Fixed behavior

- Added shared nested request schemas and service validation before normalization/hashing. Invalid identifiers, missing fields, invalid enums, incorrect booleans, non-JSON policy values, numeric bounds, oversized arrays, and malformed signed envelopes fail intentionally with 400 instead of incidental server errors.
- Expected latest versions remain optional, matching the existing service contract. When supplied, they must be nonnegative integer numbers; `null`, booleans, strings, and fractional values are rejected. Explicit read versions must be positive decimal integers within the database integer range.
- All six route contracts declare their read/manage permission. Known permission, target, signature, not-found, repository-unavailable, and idempotency errors now use the HTTP runtime's error class.
- Both publication routes return HTTP 409 when persistence returns `kind: version_conflict`, retaining the expected and actual versions in the response.
- Signed revisions validate schema identity, revision number, hash/signature fields, and a parseable issued-at value before signature verification. The existing target, hash, and verifier checks remain in place. The signed request is copied before asynchronous processing.
- Template normalization produces an independent snapshot. Mutating the original input after preview no longer changes its returned template while leaving its hash stale.
- Duplicate and self-referencing cross-cycle edges are rejected. Invalid task graphs with self-dependencies, missing references, or duplicate identifiers no longer return misleading task orderings.
- External phase lookup selects the latest tenant/cycle revision before looking for the phase. A phase removed from the latest revision is no longer accepted because it existed historically.

## Compatibility

Template UUIDs use canonical lowercase UUID strings. Request envelopes and template records reject unknown fields; policy/schema/applicability objects retain their extensible JSON content. Required names and codes are nonblank bounded strings. Readiness is 0–100, target hours and carry counts are positive, and ordering/version numbers fit the database integer range. Collections have explicit size caps in the shared schemas.

For optimistic concurrency, callers should pass `expectedLatestVersion` (zero for the first revision). Omitting it retains the existing repository behavior of publishing against the locked latest revision. Existing replay lookup still precedes version comparison, so retrying the same idempotency key and content can return the original revision despite an old expected version.

The existing hash serialization and desired-state idempotency-key format were preserved for accepted templates. No migration, signing-key configuration, or deployment flag was changed.

## Validation and limits

- Control-admin package: 349 tests passed, including 74 new cycle service, HTTP, and SQL repository tests. Production and test TypeScript checks passed.
- Control-admin contract package: 2 tests passed; production and test TypeScript checks passed.
- HTTP tests cover all six routes, permissions, malformed nested input, signed envelopes, optional expected versions, version-conflict responses, and read coordinates.
- Repository tests execute the actual Kysely repository through a scripted database driver. They check tenant scoping, parent-row locking, replay-before-version ordering, conflicting idempotency keys, rollback paths, insert-only revision writes, and latest-phase query construction. They do not prove PostgreSQL concurrency or deployed database behavior.
- Full cross-cycle graph validation across separately stored templates, live signature-key integration, and concurrent changes to external template references were not exercised. Existing business-cycle instances are outside this API's scope.
