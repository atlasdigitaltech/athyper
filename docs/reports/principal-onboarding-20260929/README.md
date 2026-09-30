# Principal onboarding — 29 September 2026

Implementation and DEV publication are complete. All three entities are **signed and activated on Studio, Neon and Mesh** (nine active deployment heads). Signed-in browser acceptance remains outstanding: the saved DEV browser sessions now return anonymous.

## Entity structure

| Entity | Storage | Standard UI presentation |
| --- | --- | --- |
| `principal` | `master.principal` | Native entity list and record; Overview, Profile, Notifications tabs |
| `principal_profile` | `master.principal_profile` | Optional related one-to-one section, using standard fields and form |
| `principal_notification_preference` | `master.principal_notification_preference` | Parent-scoped standard list, with standard create/read/edit |

All definitions target Studio, Neon and Mesh, and retain independent release histories. The root route after activation is `/app/entity/principal/manage` in each plane. Existing provisioned identity fields are read-only; self-edit covers profile and notification preferences. This does not grant users authority to change identity bindings, roles, principal status or tenant membership.

The integration follows Country: native definition → saved change set → existing publication workflow → compiled runtime artifacts → metadata reader → existing Entity routes and provider → shared list/detail/form. There are no new application pages, entity-specific runtime components, HTTP routes or alternative provider stacks.

Definitions are under `metadata/products/shared/entities/{principal,principal_profile,principal_notification_preference}/definition.json`.

## Shared framework changes

- Business/configuration table products use the existing native authoring repository and governed publication pipeline. Country's reference product path is retained.
- Native field lowering supports explicitly enrolled create/patch operations, immutable fields and metadata validation.
- Published relationship metadata declares a target entity, tenant mapping, immutable join keys and cardinality. Profile is optional one-to-one; Notifications is many.
- The standard detail workspace renders related entities through shared fields/forms and the existing `EntityListRuntime`. Child actions require published and authorized operations.
- Parent scope is resolved on the server by reading the authorized parent. Server-derived predicates remain mandatory when search, filters, sorting, views and pagination change. Create derives the owner from the parent; a client cannot replace the join key.
- Forward publication checks validate active children; reverse checks reject child successors incompatible with an active parent. Plane, fields, operations, unique keys, validated foreign keys and immutable mappings are checked.
- The shared record pipeline supports owner authorization, static dataset predicates and registered transactional mutation policies. Mutation responses project published fields rather than every physical column.
- Notification writes invoke the existing notification-preference service rules for supported channels, consent, locking and invalidation. Internal preference-version records are excluded from the entity dataset. Nullable preferences preserve inheritance.
- Optimistic versions protect both child tables. The shared trigger also increments versions for existing owning-service writes.

These extensions currently qualify the tenant-owned, owner-scoped table profile represented by these entities. They are not a claim that every possible business table is automatically supported.

## Access applied in DEV

- Active human members in existing provisioned tenants receive `entity.principal.self`: three read permissions plus profile/preference edit, all exact-tenant and subject to owner isolation.
- New human plane memberships join the configured default self-service group. Explicitly revoked memberships are not silently restored.
- The existing DEV full-admin roles in Athyper and CirrusAtlantic also receive `common.identity.principal.administer`. It is never part of the default self-service role.
- Admin access remains within the current tenant and plane. No new administrator memberships were created. Publication policies were separately proposed and approved through authenticated platform.admin and platform.owner sessions.
- Provisioning a future tenant must apply the Principal self-access recipe after its tenant scope and provisioning actor exist.

Evidence: [access grants](dev-access.json), [database checks](dev-database-verification.jsonl).

## Persisted drafts

| Entity | Entity identity | Change set |
| --- | --- | --- |
| `principal` | `56ce5954-f394-4b68-8e65-67c439601512` | `ca7b81e3-7245-4d0a-8b92-3107b25930ba` |
| `principal_profile` | `58fa1227-7f15-4f3a-9604-c8b143f00518` | `6f8163c4-2352-440a-a87b-4d36bddd8722` |
| `principal_notification_preference` | `e5ad5406-e9d0-4f47-884f-e3e1830d087b` | `9dcb9002-642e-455e-82e2-00c0edbc17e0` |

Each saved graph reloaded with zero validation issues and compiled for all three target planes. The imported definitions currently contain zero source-defined contract tests; the automated implementation suites below provide the test evidence. `contractTestsPassed: true` in import receipts must not be interpreted as executed source-defined tests.

Draft receipts and unsigned enrollment candidates are in this directory. Candidate policy files are review material, not approvals or signed releases.

## DEV database changes

The existing `server/db/runtime/run-forward-migrations.sh` applied only these selected migrations using temporary manifests and the normal checksum ledger:

- `20260929_entity_owner_access.sql`: all three databases.
- `20260929_table_entity_publication.sql`: Studio only.
- `20260929_identity_operation_projection.sql`: all three databases.
- `20260929_compiled_entity_verification.sql`: all three databases.

Then the authenticated DEV provisioning connection applied `metadata/products/shared/access/principal-self-access.sql` and the existing-full-admin grant recipe. No unrelated pending migrations were run.

Evidence: [migration output](dev-migrations.txt), [target storage qualification](dev-target-qualification.json). The latter uses the actual saved drafts and installed target databases. Runtime handler/capability gates were stubbed only in that storage probe and are covered separately by unit tests; this is not a completed publication qualification receipt.

## Publication completed

Independent password/OTP-authenticated platform.admin proposal and platform.owner approval completed for all three version-1 policies. Existing author/publisher workload execution then released, compiled, signed and dispatched the reviewed definitions. Both children activated before Principal; the root qualified against their active contracts.

| Entity | Source release | Release number | Active targets |
| --- | --- | --- | --- |
| `principal_profile` | `9f06d37d-2d34-4ff7-8f29-b6beb71497a1` | 1 | Studio, Neon, Mesh |
| `principal_notification_preference` | `dde41bc0-c1f4-43b3-9048-70817779df2a` | 1 | Studio, Neon, Mesh |
| `principal` | `d450f7e8-2d71-4abd-8b1f-82f6ab8148bc` | 1 | Studio, Neon, Mesh |

Evidence: [active heads, hashes and verification evidence](active-releases.json), entity-specific `*-policy-proposed.json`, `*-policy-active.json` and `*-execution.json` receipts.

Publication exposed three shared integration defects, corrected without changing approved definitions or bypassing approval/signature gates:

1. Native field-write lowering now accepts explicit field policies when persisted operations omit the optional fieldKeys hint. Existing operation-kind and write-policy checks remain required.
2. Operation projection admits the published identity capabilities with exact owner, tenant, plane, storage and operation matching. Migration `20260929_identity_operation_projection.sql` applied on all three planes. Rollback tests used all six compiled child artifacts and denied invalid owner/storage/plane/scope/permission variants.
3. Release verification now checks compiled entities through their immutable payload projection; legacy entity-runtime publications still require contract/descriptor projection. Migration `20260929_compiled_entity_verification.sql` applied on all three planes. Twenty-one rollback scenarios cover success and missing payload, invalid signature, hash, plane, schema, and absent legacy descriptor.

Existing failed jobs were retained. The normal dead-letter replay mechanism retried compilation and activation after each fix. No release head, approval or signed artifact was manually inserted. Retry receipts and migration logs are retained here.

Standard Entity entry points:

- https://studio.dev.athyper.test/app/entity/principal/manage
- https://neon.dev.athyper.test/app/entity/principal/manage
- https://mesh.dev.athyper.test/app/entity/principal/manage

No separate Principal application route was added. The read-only root links to the metadata-defined Profile and Notifications tabs.

Browser acceptance is pending fresh ordinary application sessions. All checked saved owner/general sessions returned anonymous ([session checks](browser-session-checks.json)); the first Studio render also encountered a transient session-store 503 before subsequent session checks returned anonymous. Control-plane publication approval sessions do not authenticate ordinary application pages. No successful list/detail rendering or live browser edit is claimed. Verify list, profile creation/edit, notification creation/edit, owner/admin isolation, stale versions and locked scope in the authenticated UI.

## Verification

- Records: 44 focused tests passed, including locked parent creation, replay after admin revocation, field admission, list/query contracts and owner adapter enforcement.
- Native authoring/publication workflow: 26 tests passed.
- Notification owning-service integration: 6 tests passed.
- Relationship presentation contract: 3 tests passed.
- Identity permission catalog: 2 tests passed.
- Native field write lowering: 3 tests passed, including canonical persisted operations without optional field hints.
- Host publication, Country lowering, handler registry, policy enrollment and relationship compatibility: 42 tests passed.
- TypeScript checks passed for metadata, publication, authoring, records, platform host and shared form/detail.
- Actual PostgreSQL rollback probes passed on all three planes before and after migrations: self-read/create, denial of another owner, authorized admin update, stale-version rejection, cross-tenant denial, marker reset and new-user self defaults.

Broader existing checks remain red outside this change:

- Metadata layout: missing `metadata/products/mdg/entities/business_partner_commodity_capability/core.json`.
- Migration layout: existing `20260926_compiled_runtime_publication_source.sql` plane mismatch and unclassified `20260928_capability_profile_authoring.sql`.
- Existing authorization SQL source assertion expects a binding expression in `common/authz/04_functions.sql`.
- Existing Business Partner related-presentation test expects an unavailable action label to be absent; the existing renderer shows a disabled action with a reason. The renderer is unchanged from this task's starting snapshot; the publication operation-admission function was enhanced separately during activation.

These failures were not hidden or repaired by changing unrelated application behavior. No blanket full-repository green result is claimed.

[Task file inventory](files.txt). Unrelated existing work was preserved; no commit was created.
