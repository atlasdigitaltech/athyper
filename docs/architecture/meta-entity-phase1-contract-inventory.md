# Meta Entity Phase 1 — Contract Inventory and Freeze

Status: inventory only  
Runtime behavior changed: no  
Database behavior changed: no  
Inventory date: 2026-07-16

## Purpose

This document freezes the current Meta Entity surface before the contract
cleanup. It identifies the current authorities, writers, readers, duplicate
properties, and hard-coded identity/scope assumptions. Later phases must use
this document as the migration baseline and update it before deleting or
renaming an authority.

The repository was intentionally not normalized in this phase. Existing
working-tree changes are preserved.

## Current worktree freeze

The worktree already contains changes across metadata DDL, metadata seeds,
provisioning, compiler/validator code, records, Neon, IAM, shared packages,
tests, and environment/configuration files. Those changes predate this Phase 1
inventory and must not be overwritten by the contract migration.

For the migration, the following areas are frozen:

| Frozen area | Current entry points | Phase 1 rule |
|---|---|---|
| Entity registry DDL | [control entity DDL](../../server/db/ddl/control/01_tables.sql) | Do not change columns or constraints in this phase |
| Runtime DDL overlay | [runtime contract DDL](../../server/db/ddl/control/01z_entity_runtime_contract.sql) | Record as duplicate; remove only in schema phase |
| Curated entity seed | [040 control entity contract](../../server/db/seed/platform/003_control/040_control_entity_contract.sql) | No ownership changes yet |
| Discovery seed | [040a schema coverage](../../server/db/seed/platform/003_control/040a_control_all_schema_entity_coverage_contract.sql) | No inference changes yet |
| Physical field generator | [042 field contract](../../server/db/seed/platform/003_control/042_control_entity_field_contract.sql) | Treat as intended owner; verify before migration |
| Domain field/metadata seeds | `042c`, `042d`, `042i`, `042p`, `044*`, `046*`, `091*`, `099*`, `100*` | Do not delete or rewrite in Phase 1 |
| Metadata compiler | [entity compiler](../../server/packages/services/metadata/src/entity-compiler.service.ts) | No eligibility behavior changes |
| Descriptor compiler | [descriptor compiler](../../server/packages/services/metadata/src/execution-descriptor/compiler.ts) | No validation behavior changes |
| Records consumers | [descriptor repository](../../server/packages/services/records/repositories/entity-descriptor.repository.ts), mutation/query services | No runtime query changes |
| Neon consumers | [Neon metadata runtime](../../apps/neon/lib/server/meta-entity-runtime.ts) | No route behavior changes |
| Shared contracts | duplicated `api-contracts` and `runtime-contracts` packages | No package deletion in Phase 1 |

The freeze is policy documentation only. It does not prevent normal Git
activity; it defines which changes are out of scope until Phase 2.

## Contract authority matrix

### Entity-level properties

| Property or concept | Current physical authority | Current secondary authorities/readers | Current status | Target authority |
|---|---|---|---|---|
| Stable entity identity | `control.entity.id`, `entity_code`, `slug` | `entity_version`, relations, operations, lifecycle, route parameters | duplicated by name/code usage | `EntityCatalogContract.identity` |
| Metadata ownership scope | `control.entity.tenant_id` | RLS, seed joins, publish state, version rows | frequently confused with row tenant scope | `EntityCatalogContract.provenance.scope` |
| Entity class | `control.entity.entity_class` | `control.entity_class_profile`, UI class checks, seed naming conventions, docs | explicit column plus inferred behavior | `EntityCatalogContract.classification.entityClass`; profile is rules only |
| Ownership model | `control.entity.ownership_model` | tenant provisioning and physical naming rules | explicit but mixed with metadata scope | `EntityCatalogContract.classification.ownershipModel` |
| Entity kind | `control.entity.kind` | compiler/route code and seeds | overlapping classification | retain only if distinct semantics are documented |
| Physical backing | `control.entity.backing_type` | `table_schema`, `table_name`, discovery logic, view alias seeds | declaration and physical fact can drift | declared contract verified by physical inspector |
| Runtime eligibility | `control.entity.runtime_enabled` | `records_api_disabled`, `generic_runtime_disabled`, field `runtime_enabled`, snapshot existence, compiler filters | duplicate eligibility authority | `api_exposure` plus capabilities; compatibility only for `runtime_enabled` |
| Read capability | `control.entity.read_capability` | class profile, route checks, descriptor validation, UI/Neon | explicit but not universally consumed | `EntityExecutionContract.capabilities.read` |
| Write capability | `control.entity.write_capability` | mutation guards, class checks, operation handlers, UI | explicit but not universally consumed | `EntityExecutionContract.capabilities.write` |
| Technical primary key | `control.entity.primary_key` | `identity_config.primary_key_field`, descriptor compiler, repository, UI, hard-coded `id` | duplicate and fallback-prone | `EntityStorageContract.primaryKey`; physical PK is verified |
| Physical tenant column | `control.entity.tenant_column` | descriptor compiler, records repository, mutation code, raw SQL | often confused with `entity.tenant_id` | `EntityStorageContract.tenantColumn: string \| null` |
| Business/natural identity | `control.entity.identity_config` JSON | numbering, UI, domain seeds, descriptor tests | contains competing technical identity keys | keep business identity only; remove technical PK duplicate |
| Physical relation | `table_schema`, `table_name`, `backing_type` | `information_schema` queries, discovery seed, graph validator | multiple readers | physical inspector plus verified declaration |
| Lifecycle status | `control.entity.status`, generated `is_active` | effective version status, publish state, compiler filters | entity and version lifecycle overlap | registry lifecycle + version lifecycle with explicit precedence |
| Effective version | `control.entity_version.status`, publish state pointer | compiler, compliance, Studio | no single graph-level assertion before all consumers | one effective version per scope, graph validator authoritative |
| Published version | `control.entity_publish_state.published_version_id` | snapshot lookup and Studio approval | tied to execution assumptions | separate catalog/execution publication pointers |
| Governance | `governance_level`, `security_tier`, `mutability` | class profile and policies | typed columns plus profile defaults | contract fields with profile validation |
| Mapping mode | `mapping_mode`, discriminator columns | discovery and physical mapping | explicit but not centralized | physical mapping section |
| Display metadata | labels, `display_config`, icon/color | surfaces, UI, API schema, metadata client | duplicate presentation paths | catalog presentation plus normalized surfaces |
| Search metadata | `search_config`, field search flags | Neon/UI query builders | split between entity and field | catalog search contract |
| Policy | `data_policy`, `entity_policy`, field security policy | IAM, records, routes, workflow | several policy authorities | references in contract; policy tables remain normalized |
| Operations | `control.entity_operation` | workflow, action dispatcher, UI, route registries | handler/capability coupling is implicit | operation contract validates capability |
| Relations | `control.entity_relation`, field `reference_config` | graph validator, Neon, records resolver, seeds | relation metadata split | relation contract with explicit source/target keys |
| Field activity | `entity_field.is_active` | seed assertions and readers | lifecycle meaning | catalog field lifecycle |
| Field runtime eligibility | `entity_field.runtime_enabled` | compiler, records repository, API field selection | overlaps activity and API visibility | field catalog visibility + field API exposure |
| Projection mapping | `entity_field.projection_alias_of` | projection alias seed and validator | new explicit property, multiple field writers remain | projection field mapping |
| Field editability | `is_read_only`, `is_write_once`, `editability` JSON, capability checks | UI/runtime forms/mutation guards | duplicate semantics | field write contract |
| Field presentation | field labels, `ui_hint`, group key, surfaces | UI and API metadata schemas | duplicated layout sources | catalog presentation/surface contract |
| Compilation artifact | `snapshot.entity_compiled` | metadata route, compliance, Neon, descriptor provider | artifact mixes catalog and execution | separate catalog and execution artifacts |

### Current schema anchors

The primary registry is defined in
[control/01_tables.sql](../../server/db/ddl/control/01_tables.sql), with
the entity table beginning around line 1729. The Prisma mirror is the
`entity` model in
[schema.prisma](../../server/packages/adapters/db/src/prisma/schema.prisma).

The current registry includes identity, classification, runtime flags,
storage identity, physical binding, labels, display JSON, lifecycle,
governance, policy JSON, partitioning, external source, and audit fields in
one table. Phase 2 must decide which of these remain typed registry facts and
which move into a versioned contract.

## Seed ownership inventory

The current graph does not have one owner per property. The following files
write entity rows or field rows and therefore require explicit ownership
decisions before replacement:

### Entity-row writers

- `040_control_entity_contract.sql`
- `040a_control_all_schema_entity_coverage_contract.sql`
- `042_control_entity_field_contract.sql`
- `042c_commitment_contract.sql`
- `042d_ap_purchase_invoice_contract.sql`
- `042i_po_purchase_order_contract.sql`
- `042j_document_create_flow_contract.sql`
- `042p_p2p_foundation_contract.sql`
- `043_control_entity_relation_contract.sql`
- `044_control_entity_operation_contract.sql`
- `044b_site_warehouse_contract.sql`
- `046_control_entity_flow_contract.sql`
- `091_control_print_contract.sql`
- `095_control_three_plane_runtime_contract.sql`
- `099_sourcing_meta_entity_contract.sql`
- `100_sales_meta_entity_contract.sql`

### Field-row writers

- `042_control_entity_field_contract.sql`
- `042c_commitment_contract.sql`
- `042d_ap_purchase_invoice_contract.sql`
- `042e_control_projection_alias_contract.sql`
- `042i_po_purchase_order_contract.sql`
- `042p_p2p_foundation_contract.sql`
- `043_control_entity_relation_contract.sql`
- `044_control_entity_operation_contract.sql`
- `044b_site_warehouse_contract.sql`
- `045_control_entity_field_data_type_normalization_contract.sql`
- `046_control_entity_flow_contract.sql`
- `091_control_print_contract.sql`
- `099b_control_runtime_contract_repair.sql`

This list is the Phase 1 replacement boundary. A future seed contract must
make `040`/`040a` the only entity registry owners and `042` the only physical
column field generator. Domain files may patch metadata by stable keys but
must not create competing physical fields.

## Consumer inventory

### Server metadata and API

- `server/packages/services/metadata/src/entity-compiler.service.ts`
- `server/packages/services/metadata/src/metadata-graph-validator.ts`
- `server/packages/services/metadata/src/entity-compliance.ts`
- `server/packages/services/metadata/src/execution-descriptor/compiler.ts`
- `server/packages/services/metadata/src/execution-descriptor/contract.ts`
- `server/packages/services/metadata/src/execution-descriptor/validation.ts`
- `server/packages/services/metadata/routes/compiled-entity.route.ts`
- `server/packages/services/metadata/routes/studio-version.route.ts`
- `server/packages/services/metadata/routes/metadata-admin.route.ts`
- `server/src/runtimes/api.ts`
- `server/db/scripts/provision.ts`

### Records and shared runtime services

- `server/packages/services/records/repositories/entity-descriptor.repository.ts`
- `server/packages/services/records/mutation/entity-mutation.service.ts`
- `server/packages/services/records/query/entity-query.service.ts`
- `server/packages/services/records/query/entity-query.kysely.ts`
- `server/packages/services/records/routes/entity-mutation-guard.ts`
- `server/packages/services/records/routes/records.route.ts`
- `server/packages/services/records/write-descriptor.service.ts`
- `server/packages/services/shared/write-descriptor.service.ts`
- reference-label, copy-record, source-change, export, bulk, and action-dispatcher services

### Neon and UI

- `apps/neon/lib/server/meta-entity-runtime.ts`
- `apps/neon/lib/server/meta-entity-records.ts`
- `apps/neon/lib/server/document-open-projections.ts`
- `apps/neon/lib/server/meta-entity-write-validation.ts`
- `apps/neon/lib/server/runtime-descriptor-parity.ts`
- `apps/neon/app/(shell)/app/[entity]/page.tsx`
- `apps/neon/app/(shell)/app/[entity]/[id]/page.tsx`
- `apps/neon/app/api/runtime/v1/entities/[entity]/route.ts`
- Admin Studio metadata pages under `apps/admin/app/(shell)/setup/metadata`
- Deprecated runtime UI under `packages/product-deprecated/runtime-ui`

### Shared package duplication

The following four files are byte-identical copies of the API metadata schema
(`SHA-256: E7FF1FB91A522551DC424E279C6B1C03FC18FBB2F8CEE4DDD0D1AF0D82748366`):

- `packages/shared/business-domain/api-contracts/src/schemas/metadata.ts`
- `packages/shared/data-integration/api-contracts/src/schemas/metadata.ts`
- `packages/shared/runtime-domain/api-contracts/src/schemas/metadata.ts`
- `packages/shared/ui-platform/api-contracts/src/schemas/metadata.ts`

The following four runtime compiler files are byte-identical
(`SHA-256: D6E5F5AE7C2803D70A72D0BC9444B4CCE09419884E75F9E8C10B433014A991E2`):

- `packages/shared/business-domain/runtime-contracts/src/compiler.ts`
- `packages/shared/platform-auth/runtime-contracts/src/compiler.ts`
- `packages/shared/runtime-domain/runtime-contracts/src/compiler.ts`
- `packages/shared/ui-platform/runtime-contracts/src/compiler.ts`

Phase 1 records these as duplicate authorities. Phase 2 must select canonical
packages, migrate imports, and only then remove the copies.

## Hard-coded identity assumptions

The following assumption classes are present and must be removed in a later
phase. They are intentionally not changed now.

| Assumption | Representative locations | Required future replacement |
|---|---|---|
| Technical key defaults to `id` | records/query helpers, reference resolvers, UI field semantics, descriptor tests | `EntityStorageContract.primaryKey` |
| `identity_config.primary_key_field` is technical identity | API metadata schema and field contract registry | business identity only; technical key is typed storage contract |
| Every entity has an `id` field | class profiles, compiler tests, seed assertions, UI fallback logic | catalog permits natural/composite keys; execution validates support |
| Relation target key defaults to `id` | reference and relation resolvers | relation contract declares source and target keys |
| View/projection key is inferred | projection readers and route helpers | explicit logical key and alias contract |
| Generic CRUD is available for runtime entities | records route and mutation services | write capability determines behavior |

## Hard-coded tenant and scope assumptions

Not every `tenant_id` occurrence is a metadata bug. Many business tables
correctly require tenant scope. The Phase 1 inventory separates the unsafe
metadata assumptions from legitimate domain SQL.

### Metadata assumptions requiring migration

- `control.entity.tenant_id IS NULL` is used as a platform-registry selector;
  this is metadata ownership, not physical row scope.
- Runtime/compiler queries filter entity rows by `runtime_enabled` rather
  than selecting an explicit API contract.
- Field readers filter `entity_field.runtime_enabled` as though it means both
  field lifecycle and API exposure.
- Descriptor and mutation paths assume a tenant predicate unless a narrow
  exception is present.
- Snapshot tables require tenant identity even for platform catalog artifacts.
- Relation loading requests execution descriptors for every target.

### Legitimate tenant-scoped domain SQL

The following classes of SQL should not be mechanically removed:

- Business tables whose physical schema has a required `tenant_id`.
- IAM membership, organization, permission, and session tables.
- Tenant-owned documents and ledger rows.
- RLS policies enforcing tenant isolation.
- Test fixtures that intentionally create tenant-scoped records.

The later migration must use the compiled storage contract only for dynamic
entity access. Static domain SQL remains governed by its own schema contract.

## Freeze acceptance criteria

Phase 1 is complete when:

- Every current entity property has one recorded physical source and all known readers.
- Every entity-row writer and field-row writer is listed.
- Duplicate properties are marked with a target authority.
- Shared duplicate contract packages are identified by content hash.
- Identity fallback locations are recorded.
- Metadata tenant-scope assumptions are distinguished from valid business tenant SQL.
- No compiler, route, seed, DDL, Prisma, or runtime behavior was changed for inventory purposes.
- Phase 2 begins only after this matrix is reviewed and the target authority names are accepted.

## Next phase gate

Phase 2 may begin with the canonical schema design and seed replacement plan:

1. Decide whether the versioned contract is a typed extension of
   `entity_version` or a one-to-one `entity_version_contract` table.
2. Decide whether `snapshot.entity_compiled` becomes the catalog artifact or
   is replaced by separate catalog and execution snapshot tables.
3. Approve the replacement seed sequence.
4. Select canonical shared API and runtime contract packages.
5. Add compatibility adapters before removing `runtime_enabled`, technical
   `identity_config` keys, or duplicate package copies.
