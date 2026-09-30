# Business Partner queue context and target-assignment compilation

## Scope

This change implements the Review & Approval context handoff. It does not activate target enforcement, widen existing grants, provision global stewards or replace exact-release qualification.

## Contract and runtime

The existing published `collectionRelationship` identifies the request/task resource and its registered scope resolver. That metadata remains authoritative. There is no new client-authored ownership policy or permission mapping.

The collection resolver now emits `workContext` on both required and resolved decisions. This additive descriptor DTO has its own strict version:

```json
{
  "schemaVersion": 1,
  "resolver": "platform.document_relationship.v1",
  "requiredCoordinates": ["operatingOrganizationId"]
}
```

Both application and list descriptor parsers retain it. Unknown versions, properties and coordinate keys, and empty requirements are rejected. The scope fingerprint includes the requirement. Old descriptors without the extension remain readable; the UI does not invent missing requirements for them.

The generic list runtime supports a plane-supplied context renderer. Each participating child entity owns its selection instead of inheriting its parent directory filters. Existing adapters without the renderer retain their prior behavior. NEON handles the registered organization requirement through its current server-backed catalog. Selecting a candidate requests a fresh server descriptor; it does not grant permission. Unsupported resolvers/coordinate combinations remain unavailable.

List data and Atlas context are withheld until the descriptor is ready for the selected coordinate. Directory filters are not published as the child's work context. If selection is rejected, the selector remains available to change it. The application error branch no longer needs to leave users at a blank required-context screen.

## Assignment compilation

`compile-business-partner-target-assignments.mjs` refreshes the read-only inventory, validates the recorded proposal assessment and compiles the 21 approved responsibility rows onto exact current principal/group/role/scope bindings. It preserves capability codes, scope targets, propagation, dates, MFA and separation-of-duties requirements. Those conditions still require owning-service execution qualification; this report does not install them.

Missing bindings/capabilities are blocked, never restored. Scope changes are blocked. The other 58 rows are not provisioned: 56 retain legacy access and two remain excluded from the target mapping without revocation.

The current 21 bindings already contain their reviewed capabilities; this compilation needs no additive grants. It does not establish coverage for the new tenant-wide BP capabilities or global stewardship. Those responsibilities require exact named assignment proposals and separate review.

At capture, all 21 rows were before the reviewed start time, `2026-09-11T00:00:00Z` (11 September, 08:00 MYT). The end time is `2026-12-10T00:00:00Z`. No dates were extended or shortened.

Seven table fingerprints differ from the earlier snapshot. Counts changed as follows; counts/hashes do not prove effective permission changes:

| Table           | Earlier | Current |
| --------------- | ------: | ------: |
| role            |      39 |      43 |
| group_role      |     975 |     979 |
| permission      |     125 |     154 |
| group_member    |     314 |     318 |
| scope_target    |      81 |      82 |
| principal_group |     164 |     168 |
| role_permission |     456 |     491 |

All 79 candidate bindings were unchanged. No historical authorization snapshot was restored. Fresh authenticated qualification remains necessary for current permissions, denials, expiry and service decisions.

## Verification

- 33 contract/UI tests: strict DTO parsing, independent child selection, no preselection list request, server re-fetch, rejection and recovery, and existing list behavior.
- 17 NEON resolver tests: declared document relationship, organization selection, incompatible/unauthorized context and directory boundaries.
- 36 Records tests: safe descriptor projection/fingerprints and authorization behavior.
- Four assignment-compiler tests: exact binding retention, missing/revoked authority, scope widening and effective windows.
- NEON list adapter, NEON server plane and Records typechecks passed.

Authenticated browser/API qualification passed after the user refreshed `catl.admin`: one selector, no queue list before selection, 10 returned rows after selecting an existing organization, no inherited parent company filter, unauthorized-organization rejection for descriptor and list APIs, and anonymous rejection. This qualifies queue reads on shared DEV release 18; full target-release command/AI/revocation qualification is separate.

## Evidence

- [Compiled assignments](../../governance/policy/reports/business-partner-target-assignments.compiled.dev.json)
- [Current read-only inventory](../../governance/policy/reports/business-partner-target-assignment-current.dev.json)
- [Original context review](entity-authorization-context-cleanup-20260911.md)

## Deployment

API, worker and NEON web were deployed and healthy. MESH, Studio and scheduler container identities were unchanged. All 13 authorization-table fingerprints were identical before/after deployment and qualification. The CirrusAtlantic BP activation head remains release 18 with the same artifact hash. Rollback restores these deployed services' previous images without restoring grant snapshots.

See the [authenticated deployment receipt](../../governance/policy/reports/business-partner-queue-context.qualified.dev.json) for exact image hashes, checks and rollback location.
