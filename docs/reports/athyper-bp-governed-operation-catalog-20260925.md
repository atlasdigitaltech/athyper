# BP governed-operation catalog reconciliation — DEV, 2026-09-25

Publication direction update: the catalog repair remains valid, but paired native
adoption is superseded by the [compiled-only cutover](compiled-only-runtime-cutover-20260925.md).
Do not use the historical paired candidate for activation.

## Outcome

Restored the four missing permission definitions in `athyper_neon`. Their owning
services still enforce these dedicated gates; they are not retired read aliases.
No permissions were assigned to users or roles. No release was approved or
activated, and activation-head fingerprints remained unchanged.

| Operation | Exact allowed scopes | Catalog risk | Separation of duties |
| --- | --- | --- | --- |
| `import` | Tenant | Low | No |
| `export` | Tenant | Low | No |
| `configure_company` | Operating organization, company code | Medium | No |
| `qualification_company` | Operating organization, company code | Critical | Yes |

All codes retain the `neon.relationship.bp_target.` prefix. Definitions match
`governance/policy/reviews/business-partner-reset-runtime-catalog.proposal.dev.json`.
They are published entity-operation permissions, non-shareable, non-delegable and
non-overridable. Existing catalog MFA flags remain false; downstream service
checks are unchanged. Catalog restoration is not an authorization grant or proof
that a particular actor can execute an operation.

## Implementation

- `server/db/ddl/planes/neon/authz/27_partner_governed_operation_permissions.sql`
  inserts absent definitions and exact scope bindings. Existing incompatible
  definitions cause an explicit drift error, never an automatic widening.
- `tooling/scripts/local-dev/reconcile-bp-operation-catalog.mts` limits execution
  to the DEV container, verifies idempotence, and checks role-permission and
  activation-head fingerprints in the same transaction. `--check` rolls back;
  `--apply` commits. Both were run successfully.
- The adoption worker now checks resolver-required catalog scopes for every
  native operation, not only permission existence.

SQL SHA-256: `ad211d3a0d015aada93b1336eaf09b377d09bb6eea03eb6eb28e43cd26c8ed62`.

## Verification

- Catalog regression tests: 2 passed.
- Action, qualification, bound-import, import and export runtime tests: 13 passed.
- Platform-host source typecheck passed.
- DEV transactional idempotence and unchanged-grant/head checks passed.
- Two transactional negative checks changed the expected risk/scope contracts
  in memory; both were rejected with `BP_GOVERNED_OPERATION_CATALOG_DRIFT`.
  Neither negative check changed persisted catalog data.
- Actual signed-runtime candidate preflight returned `status: qualified`,
  `readCatalogVerified: 21`, `unresolvedOperations: []`,
  `readyForApproval: true`, `activationChanged: false`.

Candidate: `f8fbe4ccbbae56efe7de7fe9dd7f930449722584b2b41e58eb0aef5670594b0e`.
Candidate bytes were not changed by this catalog reconciliation.

## Remaining deployment steps

Durable approval, fresh deployment signing, dispatch and signed-in Athyper
verification remain separate steps. The replacement candidate is still admitted
only for preflight by the DEV launcher. This result clears the four catalog
blockers; it does not claim end-to-end workflow execution or tenant activation.
