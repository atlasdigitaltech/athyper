# Employee 360 post-v1 hardening — local build note

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

**Status (2026-09-22):** An additive post-v1 increment is locally working. It extends the read experience and the schema foundation; the remaining actions below are still backlog work, not implied by the new sections.

This is the first hardening snapshot. See the [transaction follow-up](stage-1-employee-360-transaction-follow-up.md) for education/prior-employment editing and approved-request offboarding work completed afterward.

## Delivered

- Added tenant-scoped, dated `person_address_use`, `person_identity_document`, `person_emergency_contact`, `person_education`, `person_prior_employment` and `person_health_profile` tables. Address and contact date ranges have overlap constraints, education/employment dates are checked, and only one active health profile is allowed per person. Sensitive values use tokens or protected content references. Generic runtime access is read-only and tenant RLS is forced.
- Employee 360 Profile now loads education and prior employment through independent, permission-scoped section endpoints. Synthetic local fixtures cover both. The Personal & contact tab offers explicit, purpose-bound reveals for dated addresses and emergency contacts, passport/statutory identity, and health profile. Health has a separate `neon.workforce.health.read` permission. Token resolution occurs server-side; normal detail and section payloads contain no protected values. Reveals are audited in the new `person_sensitive_access_audit` table and cleared from browser state at expiry.
- Team now traverses active reporting assignments recursively to depth 16, guards cycles, deduplicates employees and applies company filtering on each edge. The view distinguishes direct from deeper reports. Vacant positions and matrix relationships are separate organization features.
- Onboarding and offboarding case DDL now supplies the lifecycle/version columns expected by existing code. Direct offboarding locks the selected employment, supports idempotent replay, and does not end the flattened employee record or request IAM deprovisioning when another active employment remains. A database constraint rejects an offboarding case whose employment belongs to another employee.
- The Employee 360 comment query now restricts private comments to their author and excludes deleted/archived comments.

## Verification

- The additive DDL was applied to the local Neon database without resetting existing data. Migration-layout validation passes. Constraint existence and a rollback-only lifecycle SQL test pass.
- Contract, master-data service and Workforce UI typechecks pass. The master-data suite reports 446 passed / 25 pre-existing skipped tests; Workforce UI reports 7 passed.
- Runtime-role database probes pass for the seven Employee 360 section query shapes, recursive direct/indirect reports and direct offboarding. A rollback-only protected-evidence probe reads employment/compliance/health records and confirms three audit rows.
- A rollback-only comment probe confirms that another principal receives the public comment but not the private comment.
- The authenticated browser verifier loads the Profile fixtures for the allowed actor, confirms the protected endpoint stays idle before reveal, and confirms the denied actor makes no Workforce request and receives 403 on direct relay access.

## Remaining work

- Add governed create/edit/retire APIs and UI for the structured personal records, including validation, version checks, audit and country-specific document rules. The new tables and reveals are a read foundation, not employee self-service editing.
- Publish and admit the Employee entity in the governed collaboration capability before adding comment/attachment mutations or download actions. The local compiled entity contract currently covers Business Partner, not Employee; no working-looking actions have been added to Employee 360.
- Reconcile the approved workforce-request materialization path for offboarding, including case creation, multi-employment projection and IAM intent. The direct offboarding path is covered by the local probe; request-driven offboarding is not.
- Add biography and any scoped health-note content workflow, plus vacant-position and matrix reporting views, when their record and permission contracts are ready.

These items do not block the Employee 360/pay-cycle demonstration.
