# Meta Entity implementation status

Status date: **2026-08-08**

> Runtime cutover update: the normalized authoring graph remains Athyper-only.
> All three planes now install the same immutable `runtime_meta.entity_contract`
> and plane-local `runtime_meta.entity_descriptor` projection contract. Entity
> releases are staged with their projection, verified, and atomically activated
> with the local release head. Rollback and offline reads use that same local
> activation boundary. The same transaction now stages and activates the
> normalized `authz.entity_operation_binding` plus child scope coordinates.
> Mesh's earlier private projection DDL has been retired.

This report distinguishes repository implementation from design intent. A table
listed in a plan is not considered complete unless its target DDL exists in the
new manifest with the required constraints, functions/triggers, RLS, and grants.
A visible Studio tab is not considered complete unless it is connected to the
canonical service and persists the normalized model.

## Status legend

| Status | Meaning |
|---|---|
| Complete DDL | Target object and its database protections exist in the new layer |
| Complete DDL + seed | Target object is protected and has an independently verified canonical seed contract |
| Partial | Some target-shaped implementation exists, but the agreed contract or coverage is incomplete |
| Foundation only | Package/UI structure exists but has no canonical persistence |
| Design ready | Property ownership is documented; no DDL exists |
| Not started | No target implementation exists |

## Executive status

| Area | Current state | Practical meaning |
|---|---|---|
| Phase 1 authoring foundation | Complete DDL | Stable Entity identity, change sets, immutable revisions, releases, and publication head exist |
| Entity audit integration | Complete for authoring | Dedicated sealed event contract plus same-transaction checkpoint/workflow/release writers are implemented |
| Phase 2 normalized graph | Complete DDL + seed | All ten approved tables and protections exist; seven published examples plus one editable draft exercise the model |
| Phase 3 surfaces/operations | Complete DDL + service + seed | Normalized surfaces, sections, field bindings, operations, plane permissions, and presentation bindings are authoritative in Athyper |
| Phase 4 flow/policy/tests | Complete DDL + service + seed | Flows, policy bindings, operation scope, lifecycle/numbering composition, contract fixtures, and immutable test evidence are implemented |
| Runtime projections | Complete DDL + consumer | Common contract/descriptor DDL is installed by every plane; activation, rollback, offline serving, and immutable guards share one local boundary |
| Plane-local authorization authority | Complete common DDL | Athyper, Neon, and Mesh install one common table/protection stack; authority rows remain local and are never bidirectionally replicated |
| Clean authoring contracts | Complete for Phase 2 DDL | DTOs align with runtime profiles, fields, keys, search, and normalized relation targets/mappings |
| Clean server service/API | Complete for Phase 2 | Isolated catalog/change-set/graph/checkpoint/diff/workflow API is registered; no legacy metadata imports |
| Independent seeds | P2.7 complete | Ten-file guarded pack has class profiles, exact permissions, seven releases, one draft, assertions, and immutable receipts |
| Admin Studio | P2.8 implemented / authority-gated | Canonical catalog and Phase 2 editors load through the Admin relay; role assignment is required for an app-role smoke |

## Revision, snapshot, audit, and release model

| Planned owner | DDL status | Runtime status | Notes |
|---|---|---|---|
| `metadata.entity_change_set` | **Complete DDL** | Connected to clean API | One-lock graph saves and guarded review transitions are implemented |
| `snapshot.entity_contract_revision` | **Complete DDL** | Connected to clean API | Deterministic logical-contract checkpoints, hash chaining, history, and semantic path diffs are implemented |
| `audit.audit_log` | **Complete common DDL / Entity integration complete** | Connected | Sealed `metadata_entity_authoring_event` contract and transactional writers cover create/checkpoint/review/release events |
| `metadata.entity_release` | **Complete DDL** | Connected to clean API | Publish, contract-verified rollback, and contract-preserving retirement are implemented |
| `metadata.entity_publication_status` | **Complete view** | Not connected | Correctly derives latest publication head; compilation and delivery state are intentionally absent |
| `snapshot.compiled_artifact` | **Partial relative to Entity plan** | Not connected | Existing Athyper artifact table references tenant-only `snapshot.entity_snapshot_identity`, not nullable-tenant `snapshot.entity_contract_revision`; global Entity compilation is therefore not yet represented by this table |
| `runtime_meta.entity_contract` | **Complete common DDL** | Connected to publication consumer | Portable nullable-tenant contract, release/revision and signature coordinates, immutable content, and activation status are installed in Athyper, Neon, and Mesh |
| `runtime_meta.entity_descriptor` | **Complete common DDL** | Connected to publication consumer | Athyper activates `admin_preview`; Neon and Mesh activate `entity_runtime`; only one descriptor head is active per Entity/plane/kind |
| `authz.entity_operation_binding` | **Complete common DDL** | Connected to publication consumer | One operation/permission row per applied release; staged, verified, activated, retired, and restored atomically with its descriptor |
| `authz.entity_operation_scope_binding` | **Complete common DDL** | Connected to normalized evaluator | Child-only typed scope coordinates; operation identity, permission, release, plane, and lifecycle are not duplicated |

## Athyper authoring inventory: table-by-table

### Phase 1 - identity and revision foundation

| Object | Status | Completed | Still missing |
|---|---|---|---|
| `metadata.entity` | **Complete DDL** | Stable scoped identity plus clean catalog/create API | Real seeds and Studio connection |
| `metadata.entity_change_set` | **Complete DDL** | Mutable workspace plus one-lock CRUD/review service | Real seeds and Studio connection |
| `snapshot.entity_contract_revision` | **Complete DDL** | Immutable logical checkpoint, serializer, history/diff API, audit evidence | Studio history/diff experience |
| `metadata.entity_release` | **Complete DDL** | Publish/rollback/retire service with audit/outbox transaction | Studio release experience |
| `metadata.entity_publication_status` | **Complete view** | Latest release/publication projection | Compiler and plane delivery joins |

Phase 1 was previously fresh-built and lifecycle-smoke-tested on an isolated
PostgreSQL 16.13 database. That proves the DDL lifecycle, not end-user Studio
functionality.

### Phase 2 - class, runtime, fields, keys, search, and relations

| Object | Status | Decision state | Required before complete |
|---|---|---|---|
| `metadata.entity_class_profile` | **Complete DDL + seed** | Six immutable copied-default profiles; no dynamic inheritance | Studio copy/reset UX |
| `metadata.entity_runtime_profile` | **Complete DDL + service + seed** | Sole storage/execution/concurrency owner | Studio editor |
| `metadata.entity_field` | **Complete DDL + service + seed** | Intrinsic field contract with four strict specifications | Studio editor |
| `metadata.entity_key` | **Complete DDL + service + seed** | Sole identity/uniqueness owner and one-primary invariant | Studio editor |
| `metadata.entity_key_field` | **Complete DDL + service + seed** | Ordered normalized key membership | Studio editor |
| `metadata.entity_search_profile` | **Complete DDL + service + seed** | Provider-neutral search behavior and one-default invariant | Studio editor |
| `metadata.entity_search_field` | **Complete DDL + service + seed** | Ordered weighted field membership and match validation | Studio editor |
| `metadata.entity_relation` | **Complete DDL + service + seed** | Normal, aggregate-child, and polymorphic relation behavior | Studio editor |
| `metadata.entity_relation_target` | **Complete DDL + service + seed** | Normal and polymorphic targets | Studio editor |
| `metadata.entity_relation_field` | **Complete DDL + service + seed** | Composite field mappings | Studio editor |

All Phase 2 tables now exist in the new `metadata` DDL. The full Athyper
manifest fresh-builds successfully on PostgreSQL 16.13. A rollback-only smoke
test verifies the ten-table catalog, fixed search paths, forced RLS,
write-token/stale-lock enforcement, strict field properties, normalized graph
validation, one lock increment for a multi-row save, and cross-tenant denial.
The clean CRUD/API, history, checkpoint, and workflow integration pass an
app-role smoke against a fresh database. P2.7 adds seven published example
baselines and one editable Business Partner draft. Studio connectivity remains
unfinished.

### Phase 3 - surfaces and operations

| Object | Status | Target responsibility |
|---|---|---|
| `metadata.entity_surface` | **Complete DDL + service + seed** | Surface identity, mode, kind, placement |
| `metadata.entity_surface_section` | **Complete DDL + service + seed** | Section hierarchy/layout |
| `metadata.entity_surface_field_binding` | **Complete DDL + service + seed** | Sole field presentation/interaction owner |
| `metadata.entity_operation` | **Complete DDL + service + seed** | Stable operation and server execution contract |
| `metadata.entity_operation_permission` | **Complete DDL + service + seed** | Plane-aware permission binding independent of UI placement |
| `metadata.entity_surface_operation` | **Complete DDL + service + seed** | Optional operation placement and UI interaction |
| `metadata.entity_operation_rule` | **Complete DDL + service + seed** | Lifecycle/plane capability restrictions |

### Phase 4 - flow, lifecycle, numbering, policy, authz, and verification

| Object | Status | Target responsibility |
|---|---|---|
| `metadata.entity_flow` | **Complete DDL + service + seed** | Flow identity and trigger context |
| `metadata.entity_flow_step` | **Complete DDL + service + seed** | Ordered steps referencing surfaces |
| `metadata.entity_lifecycle_binding` | **Complete DDL + service + seed** | Immutable lifecycle revision binding |
| `metadata.entity_lifecycle_operation_binding` | **Complete DDL + service + seed** | Operation-to-transition mapping |
| `metadata.entity_numbering_binding` | **Complete DDL + service + seed** | Entity field/operation binding to canonical numbering policy coordinates |
| `metadata.entity_policy_binding` | **Complete DDL + service + seed** | Entity-to-canonical-policy binding |
| `metadata.entity_field_policy_binding` | **Complete DDL + service + seed** | Field-to-canonical-policy binding |
| `metadata.entity_operation_scope_binding` | **Complete DDL + compiler** | Authored typed extraction compiled into plane-local `authz` projection rows |
| `metadata.entity_contract_test_case` | **Complete DDL + runner** | Version-aware validation/compiler fixture with immutable snapshot results |

### Runtime projections

| Plane/object | Status | Gap |
|---|---|---|
| Athyper `runtime_meta.entity_contract` | **Complete DDL + consumer** | Local signed release contract used by the Admin preview head |
| Neon `runtime_meta.entity_contract` | **Complete DDL + consumer** | Local signed release contract used by the Neon runtime head |
| Mesh `runtime_meta.entity_contract` | **Complete DDL + migrated consumer** | Common shape replaces the private Mesh table while preserving the document-envelope trust coordinate |
| Athyper `runtime_meta.entity_descriptor` | **Complete DDL + consumer** | `admin_preview` compilation semantics; verification is signature-gated and authorization bindings are not emitted |
| Neon `runtime_meta.entity_descriptor` | **Complete DDL + consumer** | `entity_runtime` descriptor plus normalized authorization artifact |
| Mesh `runtime_meta.entity_descriptor` | **Complete DDL + consumer** | `entity_runtime` descriptor plus normalized authorization artifact |
| `runtime_meta.entity_number_counter` | **Complete common DDL** | Plane-local mutable numbering state; use remains restricted to approved allocation services |

### Authorization distribution boundary

All planes install the same common DDL for `permission`, `plane_membership`,
`scope_target`, `role`, `role_permission`, `principal_group`, `group_member`,
`group_role`, `deny_rule`, `delegation`, `delegation_grant`, `override`,
`record_acl`, and `trusted_device`. This is schema convergence, not shared row
ownership. Tenant membership, assignments, exceptions, ACLs, delegations, and
device trust remain authoritative in the plane that enforces them.

Athyper publication distributes only immutable compiler output: the Entity
contract/descriptor and its operation-to-permission/scope projection. The
consumer resolves canonical permission codes against its local published
permission catalog and rejects the entire stage when a permission is missing
or has the wrong kind. Athyper retains explicit non-executable `admin_preview`
semantics, so it installs the common tables and lifecycle consumer but does not
emit executable operation-scope rows for Admin previews.

No runtime authorization decision performs a cross-database join. Each plane
serves from its last active local release head when Athyper is offline. Local
role/grant changes remain independent of metadata release activation.

Projection lifecycle certification covers clean manifest installation, shape,
immutability, atomic activation, successor replacement, rollback, offline local
reads, forced RLS, grants, and the Mesh document-envelope FK. Publication retry
after local activation is idempotent so a failed Athyper acknowledgement does
not restage or mutate runtime content.

## Studio implementation status

The new route is
`apps/admin/app/(shell)/setup/entity-studio/page.tsx`. It composes the isolated
client controller, clean runtime client, and themed Studio UI. It does not
import or invoke the legacy metadata Studio.

| Initial Studio sequence | Status | What exists | What does not exist |
|---|---|---|---|
| 1. Entity catalog | **P2.8 implemented** | Canonical catalog load, Business Partner preference, search, selection, loading/error/empty states | New-Entity wizard waits for a module-coordinate API |
| 1. Persistent change-set header | **P2.8 implemented** | Change-set selection, status/branch/lock, dirty state, refresh guard, optimistic conflict recovery | New change-set wizard is a later convenience flow |
| 2. Overview/runtime profile editor | **P2.8 implemented** | All runtime properties, storage constraints, handler/concurrency conditions, immutable class-profile display and explicit default copy | Live app-role smoke |
| 3. Fields table | **P2.8 implemented** | Real rows, add/edit/delete safety, usage counts, dependency navigation | Large-catalog virtualization if evidence requires it |
| 3. Typed field inspector | **P2.8 implemented** | Structured type configuration plus default/computation/validation contracts and deprecation metadata | Live app-role smoke |
| 4. Keys editor | **P2.8 implemented** | Key CRUD, lifecycle properties, ordered field bindings, dependency navigation | Live app-role smoke |
| 4. Search editor | **P2.8 implemented** | Profile CRUD, default selection, normalization, weighted ordered bindings, lifecycle properties | Live app-role smoke |
| 5. Relations table | **P2.8 implemented** | Relation CRUD, target/discriminator/default controls, mappings and dependency navigation | Live app-role smoke |
| 5. Relations diagram | **Partial** | Synchronized compact source-edge-target topology | Interactive spatial graph is a later usability enhancement |
| 6. Validation/problems drawer | **P2.8 implemented** | Persist-then-validate flow, diagnostics, severity counts, section/object navigation | Live app-role smoke |
| 7. Checkpoint history | **Placeholder** | History tab | Revision query, timeline, checkpoint creation |
| 7. Semantic diff | **Not started** | No diff component | Revision selection, path-aware diff, compatibility explanation |
| 8. Review workflow | **P2.9 pending** | Validation is wired; service commands already exist | Checkpoint, reason/ticket forms, approval/rejection actions, authorization experience |
| 8. Publication workflow | **Not started** | No publish UI | Readiness gate, target-plane selection, publish/rollback/retire actions |
| 9. Surface designer | **Not started / Phase 3** | No target tables or UI | Sections, bindings, drag/drop layout, conditions, operations |
| 9. Live UI preview | **Not started / Phase 3** | No preview | Compiler descriptor, sample context, responsive/runtime preview |

## Clean-room package status

| Package/component | Status | Current capability |
|---|---|---|
| `@athyper/meta-entity-authoring-contracts` | **Phase 2 contract complete** | DDL-aligned runtime-profile, field, key, search, relation/target/mapping, command/result, diagnostic, and snapshot types |
| `@athyper/meta-entity-runtime` | **P2.8 implemented** | Typed authoring client, catalog/change-set loading, draft preference, graph assembly, optimistic save, validation, class-default copy, reducer/selectors |
| `@athyper/meta-entity-studio-ui` | **P2.8 implemented** | Themed accessible catalog plus runtime-profile, typed-field, key, search, relation/target/mapping editors; problems navigation and conflict/read-only states |
| Admin `/setup/entity-studio` composition | **P2.8 implemented** | Authenticated relay loader, Entity/change-set selection, dirty guards, save/validate orchestration | App-role smoke waits for canonical permission assignment |
| `server/packages/services/meta-entity-authoring` | **Phase 2 service complete** | Isolated repository/service/routes for catalog, graph save, validation, checkpoints, diffs, review, publish, rollback, and retire |
| `server/db/seed/meta-entity` | **P2.7 complete** | Independent guarded/ledgered pack; class profiles, exact permissions, seven published baselines, and one editable draft | Role assignment and functional Studio consumption |

The clean-room boundary itself is complete: the new packages are separate from
the legacy Studio, and the UI theme-utility policy is present. This is packaging
and architecture completion, not functional Studio completion.

## What can begin now

The next executable milestone is **P2.9 checkpoint, diff, review, and
publication experience**. Before treating P2.8 as operationally certified,
assign the six exact permissions through the active canonical Admin authority
and run the app-role browser/API smoke against the seven P2.7 examples.

The six exact permissions now exist in the target `authz` catalog, but role
assignment and the broader canonical authorization-runtime cutover remain
separate authority work. The API must continue to fail closed until the active
Admin authority grants those exact capabilities; the seed pack never grants
itself access.

The proposed next-phase execution sequence and gates are documented in
`META-ENTITY-PHASE-2-ACTIVITY-SUMMARY.md`.
