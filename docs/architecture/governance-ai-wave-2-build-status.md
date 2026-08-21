# Governance and AI accountability Wave 2 build status

**Started:** 2026-08-11  
**Current slice:** G1 cycle configuration administration  
**API availability:** Conditional on the control-admin route feature flag

## G1 delivered

- A complete cycle-template aggregate covering cycle type, phases, categories, tasks, dependencies, cross-dependencies, and carry-forward rules.
- Deterministic normalization and SHA-256 template hashes.
- Validation for duplicate codes/order, missing phase/category/task references, self/duplicate dependencies, DAG cycles, system-handler requirements, invalid external phases, and carry-forward targets.
- Stable topological task ordering for runtime instantiation.
- Plane-local, permission-checked preview, validate, publish, desired-state apply, latest-revision, and versioned-read APIs under `/api/control-admin/cycle-config`.
- Immutable `control.cycle_template_revision` persistence with monotonically increasing revision numbers and idempotent publication.
- Database mutation guard preventing update/delete of published revisions.
- `governance.cycle_run` pins revision ID, revision number, and template hash through a composite foreign key.
- `platform/control-admin` is the sole owner of `CycleConfigService` and `KyselyCycleTemplateRepository`; governance consumes only `CycleConfigReader` and exposes no cycle-template write routes.
- Studio `control-authoring` publishes signed, complete desired-state revisions. Local application verifies tenant, target plane, template hash, and signature before using a deterministic idempotency key.
- Host composition uses the control-admin service; routes remain disabled unless control-admin APIs are enabled.
- Existing channel-consent registration was converted to the same contract-aware HTTP mechanism.

## Qualification

| Gate | Result |
| --- | --- |
| Control-admin and governance contract typecheck | Pass |
| Control-admin platform typecheck | Pass |
| Control-admin platform tests | Pass: 15 |
| Studio control-authoring typecheck/tests | Pass: 1 |
| Governance/host aggregate typecheck | Blocked by unrelated in-flight moderation and AI knowledge errors; no G1 error reported |
| OpenAPI classification | Pass: 23 contract operations, no unclassified public routes |
| Normalized route manifest | Pass: 971 identities |
| Three-plane DDL manifest model | Pass |
| Live PostgreSQL RLS/publication concurrency | Pending `DATABASE_URL` after database reset |

## Remaining Wave 2 work

- G2: cycle-run/task/deviation/certification execution and finance close-readiness integration.
- G3: legal holds and asynchronous report packs with object-store artifact verification.
- G4: consent revoke/check/history, moderation lifecycle, and removal of direct governance SQL from notification/collaboration composition.
- AI accountability runtime/admission evidence will be added in a later Wave 2 slice after governance execution contracts exist.
