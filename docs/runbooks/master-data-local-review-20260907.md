# Master-data local code review, second pass

Scope: all six `/api/master` routes in the current working checkout, service validation, canonical authorization, PostgreSQL adapter, target-aware Ed25519 verification, local ownership challenges, and production-style host composition running in local development. QA/staging/production remain open and deferred. This review does not qualify real provider delivery.

## Confirmed findings and fixes

### P1: Missing verification scope resolver fell back to a weaker check

`services.ts` and `local-contact-challenge.ts` accepted a missing `authorizeVerification` callback and invoked the permission authorizer with only `contactId`. That omitted the trusted operating-organization coordinates needed for scoped authority. The local host currently supplies the callback, so this was a service-composition vulnerability, not a demonstrated bypass in the deployed host.

Both paths now fail with `503 MASTER_DATA_AUTHORITY_UNAVAILABLE` if trusted verification authority is absent. Regression tests assert denial before repository verification reads/writes and before challenge delivery. Existing permissions alone cannot compensate for a missing resolver.

### P1: Verification did not stabilize all authority inputs

The verification resolver locked assignment writes and the contact row, but did not lock the owner registry or organization status. An organization could become inactive, or a registry entry could change, while a verification transaction retained a decision based on the earlier state. It also lacked the registry tenant-column constraints checked by the other routes.

Verification now uses `resolveMasterDataAuthorityTarget`, sharing registry, business-partner, organization and assignment locks and registry validation with the other five routes. It retains its dedicated verification capability and does not acquire unrelated read/write capabilities. Existing verification scope error semantics are preserved where applicable.

PostgreSQL tests hold a verification transaction open and demonstrate that assignment insertion, organization-status updates and registry-status updates cannot proceed until it finishes. Cross-tenant and ambiguous-owner scope cases still reject.

### P2: UUID casing split advisory-lock identities

PostgreSQL treats uppercase and lowercase UUID strings as the same identifier. The repository hashed their original strings for owner and address-deduplication advisory locks, allowing equivalent coordinates to acquire different locks. In particular, bounded effective-period conflicts depend on serialized repository checks, beyond current-row unique indexes.

Lock coordinates now lowercase UUIDs before hashing. A PostgreSQL regression holds a bounded-primary write open and submits another write with uppercase tenant/owner UUIDs; the second transaction must wait on the same lock rather than enter the conflict check independently. Existing duplicate/primary concurrent-write tests continue to pass.

## Validation

- 89 route/service/signature/local-challenge-route tests passed.
- 22 disposable PostgreSQL tests passed, including new lock and missing-authority regressions, historical reads, tenant isolation, concurrency, replay, and atomic challenge/contact/audit/outbox rollback.
- 17 host authority, master-data registration and verification-route tests passed.
- Master-data TypeScript package build passed.
- All 65 deployed authenticated six-route checks passed. Mailpit confirmation and replay checks passed for both CirrusAtlantic users; both Athyper users were denied. Runtime health is healthy with zero pending deliveries.
- Results are retained in [the acceptance receipt](master-data-launch/local-second-review-acceptance-20260907.json).

The PostgreSQL fixture uses an isolated database and selected production DDL. It is not a complete environment migration or production RLS certificate. Browser acceptance uses the existing development SSO helper and selected actors, not password/MFA enrollment.

## Local deployment

The initial local image used an older runtime base and failed startup after concurrent control-administration configuration changes. The corrected image derives from the newer `control-admin-local-20260907` runtime and replaces only the four reviewed master-data JavaScript modules. The persistent local deployment profile pins the resulting immutable image. The newer control-administration flags and dependencies are preserved. No local signing key or IAM grant was changed by this review.

## Remaining limitations

The same-day cancellation limitation identified in this review is resolved by the subsequent [local address-link cancellation change](local-address-cancellation.md). Cancellation preserves the original interval and records a terminal usage state; established links still use end-dating.

Authority locks are deliberately table-wide for the low-volume local pilot. They protect correctness but can delay unrelated owner/organization writes. High-volume qualification needs a concurrency/scaling design before replacing them.

QA/staging/production setup, keys, grants, accountable owners, real inbox/device delivery and external alerting remain deferred or unqualified as recorded in the environment release tracker.
