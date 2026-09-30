# Governance API review — 2026-09-06

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

Reviewed and fixed the local implementations of all 27 requested `/api/governance` routes, including their services, repository queries, route contracts, host composition, and relevant PostgreSQL constraints. This review used the current workspace source; it did not verify the deployed development API or compare the workspace with the remote branch.

## Confirmed findings and fixes

| Priority | Finding and concrete impact | Fix |
| --- | --- | --- |
| P1 | `cycle_deviation_carry_idempotency_uq` used `UNIQUE NULLS NOT DISTINCT`. A second ordinary deviation in a tenant violated uniqueness because both carry keys were null. Carry-forward inserts could fail for the same reason. | Ordinary uniqueness now permits multiple null keys while preserving uniqueness for actual carry keys. Added a forward migration to all three plane manifests. Reproduced the failure and verified the fix in isolated PostgreSQL 16. |
| P1 | Governance domain exceptions reached the HTTP runtime as ordinary errors. Permission denials, missing records, invalid commands, and state conflicts became 500 responses. | Both route modules translate known errors to 400/403/404/409/503 `HttpError`s. Known duplicate-code and owner foreign-key failures are translated without exposing SQL. Unexpected errors remain 500s. |
| P1 | Legal-hold operations read state, edited manifests, and called retention adapters without a shared lock/transaction. Activation could race with manifest edits; failed active-hold additions remained persisted and could not be retried because duplicate detection rejected them. | Added required repository `withHoldLock`, implemented using a tenant-filtered PostgreSQL row lock. Existing-hold mutations run their reads, writes, and adapter calls inside this transaction. Failed database changes roll back; release reuses the transaction. |
| P1 | Finance could return `{ready:false,reasons:[]}`, but readiness inferred success from an empty reasons list. Completion/certification could proceed despite failed finance readiness. | A failed finance decision always contributes a blocking reason. |
| P1 | Readiness omitted active child cycles, allowing parent certification while child work remained active. | Active children now make readiness false and block certification. |
| P1 | Consent requests could inject `evidence.expiresAt` independently of the validated expiry field. Point-in-time reads trusted that evidence, allowing conflicting expiry behavior or invalid-date failures. | Removed the reserved evidence field from user evidence and populated it only from the validated command expiry. |
| P1 | Consent projection upserts ignored different events with equal effective timestamps. A later revocation could be present in history while the projection still reported consent granted. | Equal-time projection updates use the same `(created_at,id)` event ordering as history lookup. Executed the production upsert SQL against isolated PostgreSQL to verify that the newest event wins and an older event cannot overwrite it. |
| P2 | Optional numeric/object/null fields were silently discarded, numeric strings and booleans were coerced into template versions, and JavaScript accepted ambiguous or rolled-over dates. | Optional fields are validated when supplied; versions must be positive safe integer JSON numbers; timestamps require an explicit timezone and valid calendar date. Invalid payloads return 400 before service calls. |
| P2 | Claim/start and legal-hold activate/release handlers supported omitted bodies, but their route contracts rejected bodyless requests. Cycle creation/deviation/certification handlers emitted undocumented 201 responses, which failed response-contract enforcement. | Optional-body contracts now match handler behavior; cycle contracts include creation, not-found, and availability responses. |
| P2 | Run creation replay compared only type/code/template version. A reused key with different dates, name, owner, parent, schedule, or data silently replayed the earlier request. Concurrent first uses of a key did not lock an existing row and could race. | Replay compares the full exposed creation payload. PostgreSQL acquires transaction advisory locks for tenant-scoped run and carry keys before lookup. |
| P2 | Run code, certification type code, and period checks did not match database constraints. Invalid codes, an end without a start, or inverted ranges reached persistence. | Service validation checks the database code formats, period ordering/start requirement, and schedule ordering. |
| P2 | All dependency edges initially blocked tasks, including advisory and finish-to-finish edges. Completion did not recheck prerequisites. Reopening a predecessor left successors ready or allowed evidence to be invalidated beneath active/completed successors. | Only hard finish-to-start edges block starting; hard edges are checked at completion. Reopening relocks ready successors and rejects invalidation of dependent active/completed work. |
| P2 | Deviation decisions and certification actions could mutate cancelled/completed cycles. Carry-forward accepted its own source run. Certification rejection did not enforce creator separation when a different person submitted it. | Added lifecycle and source/target guards and consistent creator/submitter separation. Deviation/certification loads lock their run; deviation writes verify that a row was affected. |
| P2 | Consent expiry validation used the real clock while persistence used the injected clock, producing different effective-time decisions. Push tokens were normalized like phone numbers, causing distinct tokens such as `token-a` and `tokena` to collide. | Validation and writes share one effective timestamp; push-token punctuation is preserved. |
| P2 | Signed report-download URLs could outlive report expiry. Download responses also lacked explicit cache prevention. | URL lifetime is capped at remaining report validity, checked after integrity verification; download responses use `Cache-Control: no-store`. |

Implementation is concentrated in [routes](../../server/packages/platform/governance/src/routes/), [cycle execution](../../server/packages/platform/governance/src/cycles/), [compliance](../../server/packages/platform/governance/src/compliance/), and [consent](../../server/packages/platform/governance/src/consent/).

## Route coverage

| Requested family | Count | Reviewed behavior |
| --- | ---: | --- |
| Channel consent record | 1 | Authorization, subject/channel validation, effective/expiry times, evidence, hashing, transactional event/projection/audit/outbox writes |
| Cycle-run create/transition/readiness | 3 | Idempotency, published template selection, parent constraints, periods, readiness, terminal transitions |
| Task claim/start/complete/block/waive/reopen | 6 | Ownership checks, status transitions, evidence, dependencies, cycle mutability |
| Deviation create/resolve/waive/carry-forward | 4 | Run/task association, permissions, terminal state, carry provenance, idempotency, database uniqueness |
| Certification create/submit/certify/reject | 4 | Reviewer separation, evidence snapshot, readiness, lifecycle, immutable approval |
| Legal-hold create/get/activate/release/add/remove resource | 6 | Permissions, tenant filters, manifest constraints, time validation, retention integration, mutation serialization |
| Report-pack request/get/download | 3 | Permissions, pinned source revision, durable job/recovery behavior, immutable storage, artifact hash, supersession, expiry |

All 27 routes have HTTP success and missing-authentication tests using the real HTTP runtime with response-contract enforcement. Additional tests exercise rejected payloads, error translation, service permission denial before repository access, dependency and lifecycle regressions, and persistence query boundaries. Existing exact-plane isolation and integrity tests remain passing.

## Validation

- Governance package: **97 tests passed**, including **72 added tests**.
- Governance contracts: **1 test passed**.
- Platform-host governance plane-boundary suite: **2 tests passed**.
- Governance source/test, governance contract, and platform-host TypeScript checks passed.
- Scoped `git diff --check` passed.
- `node server/db/scripts/tests/integration/governance-deviation-idempotency.mjs` passed. It creates/removes a disposable PostgreSQL 16 container, reproduces the old deviation constraint failure, verifies the migration and fresh DDL, and exercises production consent upsert SQL with equal effective timestamps. It does not connect to an application database.

The PostgreSQL test uses a minimal schema with stand-ins for unrelated dependencies, not a fully provisioned application database. Repository query tests inspect generated SQL; they do not establish correctness of every concurrent interleaving. External retention adapters and object-storage providers were not exercised end to end. Retention adapters must remain idempotent for retries after partial external side effects, as required by their existing contract.

## Deployment

Apply [20260906_governance_deviation_idempotency.sql](sql-ddl-consolidation.md) through the normal forward-migration runner on Studio, Neon, and Mesh. Each plane manifest includes it. The migration preserves rows and replaces the uniqueness constraint, with bounded lock and statement timeouts.

Deploy the governance service and contract changes together: alternative `LegalHoldRepository` implementations must implement `withHoldLock`. Request validation intentionally tightens malformed inputs that were previously ignored/coerced. Existing application databases and deployed services were not changed by this review.
