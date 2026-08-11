# Studio authority Wave 3 build status

Date: 2026-08-11

## Delivered in this build

### TrustIAM

- Extended the existing IAM vertical; no second TrustIAM package was created.
- Added reconciliation observations to `OrganizationProjectionService`.
- Observations require the exact desired version and hash. Stale versions and same-version/different-hash receipts are rejected.
- Successful reconciliation updates status and evidence transactionally through the existing IAM audit/outbox boundary.

### Studio onboarding

- Added idempotent draft creation over the canonical onboarding case table.
- Exposed draft and lifecycle actions for submit, compile, approve/reject, provision, activate, correct, offboard, finish, fail, and cancel.
- Exposed work-item resolution.
- Added a bounded guest-access expiry service and worker handler.
- Composed onboarding routes and the maintenance worker only when both the Studio database and an authenticated provisioning command transport are available.
- Added an unhealthy readiness contribution when the Studio database/schema or required transport is unavailable.

### Metadata authoring

- Corrected validation snapshots to use the exact current change-set lock revision rather than an incorrect revision-plus-one coordinate.
- Hardened optimistic locking by checking the returned advanced lock version.
- Release creation now requires an approved change set and a signed artifact matching the exact valid current revision.
- Preserved the entity-level advisory lock that serializes release numbering across concurrent branches.
- Expanded pre-replacement reference validation across surface sections, flows, lifecycle-operation bindings, policies, and numbering branches.

## Qualification

- IAM: typecheck and build passed; 23 tests passed.
- Studio onboarding: typecheck and build passed; 8 tests passed.
- Metadata authoring: typecheck and build passed; 5 tests passed.
- Platform host: typecheck and build passed; 61 tests passed.

## Remaining acceptance work

- Configure a production authenticated provisioning command transport. Until supplied, onboarding readiness is intentionally unhealthy and routes/jobs are not registered.
- Register and test durable reconciliation/retry handlers for partial target failure and worker-crash replay. The current build registers the guest-expiry handler only.
- Add a tenant-aware schedule source for guest expiry; a handler and job definition alone do not create per-tenant schedules.
- Persist reconciliation receipts, business audit, and local outbox evidence in one explicit Studio tenant transaction.
- Add contract/OpenAPI registration for the onboarding lifecycle routes.
- Run PostgreSQL integration tests for draft replay, complete graph round-trip, invalid replacement rollback, concurrent branch publication, release validation coordinates, guest expiry, and offboarding retention.
- Exercise signed publication activation, failure recovery, and rollback against Studio, Neon, and Mesh in a disposable three-plane environment.

