# Entity DDL build plan

Status: **locked for DDL implementation on 2026-08-02**.

Implementation progress:

- **Phase 1 completed on 2026-08-02.** Added the Athyper-only `metadata`
  schema, stable Entity identity, mutable change sets, immutable hash-chained
  `snapshot.entity_contract_revision`, append-only Entity releases, derived
  publication status, fixed-search-path functions, transition/immutability
  triggers, indexes, foreign keys, forced RLS, policies, grants, and manifest
  ordering.
- The complete Athyper fresh-database manifest and a rollback-only
  create/checkpoint/review/approve/publish lifecycle were executed successfully
  on PostgreSQL 16.13 in an isolated disposable database.
- Canonical audit identifiers and correlations are present. Entity audit-event
  catalog entries and transactional runtime writers remain deferred with seeds
  and runtime wiring; no audit contract was weakened to complete Phase 1.
- **Phase 2 clean-room foundation started on 2026-08-02.** Added isolated
  authoring contracts, the headless `@athyper/meta-entity-runtime`, the themed
  `@athyper/meta-entity-studio-ui`, the new Admin `/setup/entity-studio` route,
  an independent empty seed-pack manifest, and automated legacy-boundary/theme
  policy checks. The existing legacy Studio remains untouched.
- **Phase 2 property review approved on 2026-08-02.** The normalized
  columns, legacy-property disposition, DDL invariants, and Studio ownership map
  are documented in `META-ENTITY-PHASE-2-DDL-REVIEW.md`, including the two
  approved relation binding tables required for composite and polymorphic
  relations.
- **Phase 2 DDL and clean contracts completed on 2026-08-02.** The approved
  ten-table graph, strict property validators, one-lock transaction token,
  deferred integrity checks, indexes, triggers, forced RLS, grants, and manifest
  ordering are implemented. A complete Athyper fresh build and rollback-only
  Phase 2 graph/RLS smoke test pass on PostgreSQL 16.13. P2.6 server/API wiring
  is the next unfinished activity.

This plan is the authority for the Entity DDL wave. Runtime service wiring, UI
wiring, seeds, live-data migration, Prisma, and Kysely generation are later
waves. A change to an ownership rule or table inventory below requires an
explicit design review before implementation continues.

For the repository-level completion matrix, including table-by-table and Studio
status, see `META-ENTITY-IMPLEMENTATION-STATUS.md`.

## Authority and plane placement

- Athyper is the only Entity authoring, validation, compilation, and release
  authority.
- Athyper alone installs `metadata.*` and `snapshot.entity_contract_revision`.
- Athyper, Neon, and Mesh install the common immutable
  `runtime_meta.entity_contract` and `runtime_meta.entity_descriptor`
  projections. Athyper uses them for preview/Admin runtime; they are never an
  authoring source.
- `runtime_meta.entity_number_counter` is installed only in a plane that
  executes numbering, initially Neon unless a concrete Athyper or Mesh use case
  is approved.
- Cross-database foreign keys are forbidden. Projection trust uses preserved
  IDs, schema versions, hashes, signatures when present, and publication
  receipts.

## Revision, snapshot, audit, and release model

`metadata.entity_version` is not part of the target. Its responsibilities are
split so that mutable editing, immutable revision history, evidence, and a
published business version cannot be confused.

| Question | Owner |
|---|---|
| What is currently being edited or reviewed? | `metadata.entity_change_set` |
| What did the normalized graph look like at a checkpoint? | `snapshot.entity_contract_revision` |
| Who performed a meaningful change or workflow transition? | `audit.audit_log` |
| Which approved revision became an official version? | `metadata.entity_release` |
| What does one local plane execute? | `runtime_meta.entity_contract` and `runtime_meta.entity_descriptor` |

### `metadata.entity_change_set`

A change set is a mutable authoring workspace anchored to one Entity and one
base release. It owns no duplicate contract JSON.

Required properties:

- `id`, `tenant_id`, `entity_id`, `change_set_code`, `branch_code`
- `base_release_id`, `parent_change_set_id`
- `status`: `draft`, `in_review`, `approved`, `rejected`, `abandoned`, `published`
- `lock_version` for optimistic concurrency
- `title`, `change_summary`, `change_reason_code`, `ticket_reference`
- submit/review/approval/rejection timestamps and principals
- standard create/update audit pairs

Only draft or rejected change sets are editable. Approved and published change
sets are immutable. More than one branch may exist, but only one open change
set per `(tenant_id, entity_id, branch_code)` is permitted.

All normalized authoring rows are keyed by `change_set_id`. Logical keys such
as `field_key`, `relation_key`, `surface_key`, and `operation_key` remain stable
when a change set is cloned from a previous release.

### `snapshot.entity_contract_revision`

This is an Athyper-only immutable checkpoint, separate from the generic
tenant-only business-record snapshot model.

Required properties:

- `id`, nullable `tenant_id`, `entity_id`, `change_set_id`, `revision_no`
- `parent_revision_id`, `base_release_id`
- `contract_schema_code`, `contract_schema_version`
- `contract_json`, `contract_hash`, `payload_size_bytes`
- `changed_paths`, `compatibility_level`, validation status and diagnostics
- `audit_event_id`, `correlation_id`, `captured_at`, `captured_by`

The payload is generated from normalized `metadata.*` rows. It is never edited
or patched in place. A new checkpoint creates a new revision and hash-chain
entry. Global definitions use `tenant_id = NULL`; tenant definitions use their
real tenant ID.

### `audit.audit_log`

Audit is evidence, not the revision store. It records meaningful saves and
workflow transitions using hashes and coordinates rather than copying the full
contract payload.

Required event families:

- `entity.change_set.created`, `entity.change_set.checkpointed`
- `entity.change_set.submitted`, `approved`, `rejected`, `abandoned`
- `entity.release.published`, `retired`, `rollback_requested`
- `entity.release.compiled`, `projection_delivered`, `projection_failed`

Audit context carries `entity_id`, `change_set_id`, revision/release IDs,
before/after hashes, changed paths, reason, ticket, target plane, and
correlation. UI keystrokes are not individual audit events; an explicit or
debounced durable checkpoint is the evidence boundary.

### `metadata.entity_release`

An append-only official publication referencing exactly one approved snapshot
revision.

Required properties:

- `id`, nullable `tenant_id`, `entity_id`, `change_set_id`, `revision_id`
- monotonic `release_no`, optional display `version_label`
- `contract_schema_code`, `contract_schema_version`, `contract_hash`
- `compatibility_level`: `backward_compatible`, `conditional`, `breaking`
- `target_planes`, `minimum_runtime_version`
- optional `signature_algorithm`, `signing_key_id`, `contract_signature`
- `published_at`, `published_by`, reason/ticket/correlation coordinates
- retirement and replacement release coordinates

The contract JSON remains in the referenced snapshot; it is not duplicated in
the release row. `snapshot.compiled_artifact` references the release revision
and stores immutable base/overlay/plane build outputs.

## Final Athyper authoring inventory

### Identity and editing

- `metadata.entity`
- `metadata.entity_change_set`
- `metadata.entity_class_profile`
- `metadata.entity_runtime_profile`

`metadata.entity` owns stable identity only: tenant scope, module, entity code,
class, and ownership model. Labels, presentation, storage, execution, search,
policy, and version status do not belong on this table.

### Intrinsic fields, keys, search, and relations

- `metadata.entity_field`
- `metadata.entity_key`
- `metadata.entity_key_field`
- `metadata.entity_search_profile`
- `metadata.entity_search_field`
- `metadata.entity_relation`

`entity_field` owns intrinsic value/write/query semantics only. `type_config`
is the single discriminated value contract. `default_spec` replaces
`default_value` plus `defaults`; `validation_spec` is runtime/business
validation and does not copy PostgreSQL constraints. Search membership and key
membership are normalized bindings, not repeated field booleans or JSON arrays.

### Surfaces and operations

- `metadata.entity_surface`
- `metadata.entity_surface_section`
- `metadata.entity_surface_field`
- `metadata.entity_operation`
- `metadata.entity_surface_operation`
- `metadata.entity_operation_rule`

`entity_surface_field` is the sole owner of per-surface visibility, input mode,
required-mode strengthening, ordering, section, grid position/span, density,
label/help/placeholder overrides, renderer/editor keys and their strictly typed
configuration, picker/filter presentation, and visibility/editability/required
conditions. It may restrict intrinsic field behavior but never weaken server
validation or grant authorization.

`entity_operation` owns permission and server execution. UI placement,
interaction target, label/icon, confirmation, and selection presentation belong
to `entity_surface_operation`. Lifecycle/plane capability restrictions belong
to `entity_operation_rule`.

### Flow, lifecycle, numbering, and policy composition

- `metadata.entity_flow`
- `metadata.entity_flow_step`
- `metadata.entity_lifecycle_binding`
- `metadata.entity_numbering_policy`
- `metadata.entity_policy_binding`
- `metadata.entity_field_policy_binding`
- `authz.entity_operation_scope_binding`

Each flow step references a surface. There is no second flow-owned section or
field-layout graph. Lifecycle bindings reference an immutable lifecycle
definition revision; the Entity model does not redefine states and transitions.
Policy bindings reference canonical `control.policy_definition` rows rather
than embedding another rule body.

### Revision, release, and verification

- `snapshot.entity_contract_revision`
- `metadata.entity_release`
- `metadata.entity_contract_test_case`
- `metadata.entity_publication_status` (view)
- existing `snapshot.compiled_artifact`, linked to the approved revision/release

Contract test cases are version-aware fixtures with input context, expected
validation/compilation outcome, expected diagnostic codes, and status. Test
execution results are artifacts, not mutable columns on the test definition.

## Common runtime projections

### `runtime_meta.entity_contract`

Immutable portable release projection installed in all three planes:

- local ID plus preserved `entity_id`, `release_id`, and revision ID
- nullable `tenant_id`, `entity_code`, `release_no`
- contract schema code/version and contract hash
- canonical contract JSON
- publication/signature coordinates
- published/received timestamps and projection status

### `runtime_meta.entity_descriptor`

Immutable plane-specific compiler output:

- preserved Entity/release coordinates and local `plane_code`
- descriptor kind/schema version
- source contract hash, compiled hash, compiled JSON
- compiler version and compatibility level
- generated/received timestamps
- activation status, activation/retirement timestamps

Only one active descriptor is allowed per tenant, Entity, plane, and descriptor
kind. Activation changes create audit evidence; compiled JSON is immutable.

## Removed legacy structures

- `control.entity_version` and `control.entity_version_contract`
- runtime/storage/search/policy/concurrency properties on `control.entity`
- editable `entity_version.contract_document`
- `control.entity_publish_state`; replaced by the derived status view
- `control.entity_contract_transition`; replaced by canonical audit events
- `control.entity_action_rule` and `entity_lifecycle_state_mask`; replaced by
  operation rules plus the lifecycle revision
- `field_group` and `field_group_member`; replaced by surface sections/bindings
- `entity_flow_section` and `entity_flow_field`; flow steps reference surfaces
- `entity_numbering_counter`; moved to `runtime_meta`
- embedded `entity_policy` and `field_security_policy` bodies; replaced by bindings
- `entity_scope_binding`; moved to `authz`
- `polymorphic_child_binding`; represented by canonical relations
- every transitional `*_v2` column
- `reference_config`, `money_config`, `enum_config`, and `datetime_config`;
  replaced by strict `type_config`
- field-owned UI/config property bags; replaced by surface-field bindings
- legacy Mesh authoring/catalog tables; Mesh consumes runtime projections only

## Advanced capabilities included in the initial DDL

- Branched change sets with stable logical child keys and optimistic locking.
- Immutable hash-chained checkpoints and exact rollback source revisions.
- Semantic changed-path capture and compatibility classification.
- Dry-run validation/compilation before review or publication.
- Release targeting by plane and minimum runtime version.
- Optional signed contracts without making signing mandatory for local/demo use.
- Contract test cases for validation, compilation, permission, and plane-projection
  expectations.
- Field/relation deprecation metadata: replacement key, deprecation release, and
  planned removal release.
- Dependency and impact views derived from keys, relations, surfaces, flows,
  lifecycle bindings, policy bindings, and runtime-profile references.
- Localization-ready label/help keys with required fallback text; translation
  storage remains outside the Entity model.
- Publication readiness view derived from revision validation, test results,
  compiled artifacts, and plane receipts.

## Explicitly deferred

- Runtime and UI rewiring, compatibility endpoint removal, and v2/v2.1 adapter cleanup.
- Prisma/Kysely regeneration.
- Reference seeds and migration of live/demo Entity rows.
- Physical tenant-table provisioning and destructive schema evolution automation.
- Real-time CRDT/co-editing; the initial contract is branch plus optimistic lock.
- Marketplace/package distribution beyond the release and signature coordinates.

## Phase 2 clean-room runtime and seed boundary

Phase 2 is a clean implementation. Existing legacy Meta Entity runtime code,
contracts, routes, UI components, and `control.entity_*` seeds are read-only
historical evidence and are not dependencies of the target implementation.

New ownership is physically separated:

- `packages/shared/data-integration/meta-entity-authoring-contracts` owns the
  canonical transport and editor contracts for `metadata.*` only.
- `packages/products/admin/meta-entity-runtime` owns headless Admin authoring
  state, commands, optimistic concurrency, validation, diff, and API
  orchestration. It has no React or Next.js dependency.
- `packages/products/admin/meta-entity-studio-ui` owns the accessible React
  Studio workspace and depends on the clean runtime package.
- `server/packages/services/meta-entity-authoring` owns the canonical Athyper
  repositories, transactions, audit coordinates, and HTTP handlers.
- `server/db/seed/meta-entity` is an independently executed seed pack with its
  own manifest and ledger identity. It is not discovered by the legacy seed
  runner and cannot be imported by runtime packages.

The Admin application becomes composition only. It may import the new Studio UI
package, but the new packages must not import from the existing
`apps/admin/app/(shell)/setup/metadata` implementation.

CI must reject new-package references to legacy contracts and storage,
including `control.entity_*`, `control.field_group*`, `control.entity_version*`,
`MetaEntityContractV2`, `MetaEntityContractV21`, and the existing legacy Studio
routes. There are no fallback reads, compatibility adapters, dual writes, or
seed copies between the old and new implementations.

## Build order and gates

1. Add Athyper `metadata` schema, domains, stable Entity identity, change sets,
   revision snapshots, and audit/release coordinates.
2. Add runtime profile, intrinsic fields, keys, search bindings, and relations.
3. Add surfaces, operations, simplified flows, lifecycle, numbering, policy,
   and authorization-scope bindings.
4. Add contract tests, compilation linkage, derived dependency/readiness views,
   release readiness verification, and transactional audit/outbox hooks.
5. Add common runtime contract/descriptor projections to Athyper, Neon, and Mesh;
   add numbering counters only to approved execution planes.
6. Add constraints, indexes, fixed-search-path functions, triggers, forced RLS,
   policies, grants, and audit-pair enforcement.
7. Run fresh PostgreSQL builds for all three manifests and catalog checks for
   columns/domains, PKs, composite tenancy, constraints, indexes, RLS/policies,
   functions, triggers, immutable relations, and forbidden legacy names.
8. Freeze Entity DDL. Only then begin runtime service/compiler cleanup and the
   later UI/Studio wiring design.

## Non-negotiable invariants

- One editable relational authoring graph; JSON is generated only as an immutable
  snapshot/release/runtime artifact.
- Audit is evidence, snapshot is revision history, release is official version,
  and runtime projections are derived execution inputs.
- No property has two writable owners or fallback precedence.
- Stable logical keys survive revisions and releases.
- An approved snapshot hash must equal the graph hash at publication time.
- Published snapshots, releases, compiled artifacts, contracts, and descriptors
  are immutable.
- UI conditions can restrict behavior but cannot grant permission or weaken
  intrinsic/server validation.
- Global and tenant definitions have explicit, checked scope semantics and
  forced RLS; child scope must match the parent change set.
- Publication, audit evidence, compiled artifacts, and projection outbox writes
  occur transactionally.
- Every function has an explicit trusted `search_path`; no Entity authoring
  function is `SECURITY DEFINER` without a documented need and revoked PUBLIC
  execution.
