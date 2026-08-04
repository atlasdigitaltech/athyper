# Meta Entity Phase 2 DDL review

Status: **approved and implemented on 2026-08-02**.

This document defines the normalized property model for the second Meta Entity
DDL wave. It is subordinate to `ENTITY-DDL-BUILD-PLAN.md` and does not reopen
the Phase 1 decisions for Entity identity, change sets, immutable revisions,
audit evidence, or releases.

## Assessment outcome

The existing eight-table blocker is directionally correct, but should not be
implemented exactly as listed.

1. The legacy model mixes intrinsic field semantics, physical storage,
   presentation, search, relations, authorization, cache behavior, and
   publication state in the same rows and JSON documents.
2. The clean-room authoring contract still reflects three of those duplicates:
   `required` duplicates cardinality, `queryable` overlaps normalized search
   and later surface query bindings, and the reference `typeConfig` repeats the
   relation target.
3. `metadata.entity_relation` alone cannot model composite-key joins or
   polymorphic targets without another field-mapping JSON property.
4. Phase 2 should therefore contain **ten tables**, adding
   `metadata.entity_relation_target` and
   `metadata.entity_relation_field`. This is the only proposed inventory change.

The ten-table model was approved and implemented. Composite and polymorphic
relation mappings are normalized rather than embedded in JSON.

## Property ownership rules

Every candidate property is assigned to exactly one of these categories:

| Category | Meaning |
|---|---|
| Canonical | Mutable normalized authoring property in `metadata.*` |
| Binding | A normalized relationship row, never an ID/key array in JSON |
| Derived | Calculated by validation/compilation or exposed by a view |
| Surface-owned | Presentation and interaction property deferred to Phase 3 |
| Runtime-only | Mutable execution state in `runtime_meta.*`, never authored here |
| Evidence | Meaningful action in `audit.audit_log` |
| Artifact | Immutable JSON in a revision, release projection, or compiled artifact |
| Removed | Legacy duplicate, hidden precedence rule, or unbounded property bag |

The graph is the sole editable source. JSON is allowed only in the four strict,
discriminated field specifications described below and in immutable artifacts.
No `.passthrough()` object becomes a database contract.

## Proposed inventory and cardinality

| Table | Scope | Cardinality |
|---|---|---|
| `metadata.entity_class_profile` | Platform-global seeded reference | One row per Entity class |
| `metadata.entity_runtime_profile` | Change-set authored | Exactly one per change set |
| `metadata.entity_field` | Change-set authored | Zero or more per change set |
| `metadata.entity_key` | Change-set authored | Zero or more per change set |
| `metadata.entity_key_field` | Binding | One or more fields per key |
| `metadata.entity_search_profile` | Change-set authored | Zero or more per change set |
| `metadata.entity_search_field` | Binding | One or more fields per search profile |
| `metadata.entity_relation` | Change-set authored | Zero or more relation headers |
| `metadata.entity_relation_target` | Binding | One or more targets per relation |
| `metadata.entity_relation_field` | Binding | One or more field pairs per target |

All change-set-owned rows carry `id`, nullable `tenant_id`, `entity_id`,
`change_set_id`, `created_at`, `created_by`, `updated_at`, and `updated_by`.
The database verifies that tenant and Entity scope match the parent change set.

## 1. `metadata.entity_class_profile`

Purpose: immutable platform defaults and validation posture for the six
canonical classes: `business`, `configuration`, `reference`, `process`,
`projection`, and `technical`.

Recommended columns:

| Property | Contract |
|---|---|
| `entity_class` | Primary key using `metadata.entity_class_d` |
| `profile_version` | Positive integer; allows deterministic seed evolution |
| `fallback_name` | Human-readable Admin fallback, not a runtime surface label |
| `description` | Semantic explanation of the class |
| `default_backing_kind` | `table`, `view`, `materialized_view`, `external`, or `virtual` |
| `default_api_exposure` | `none`, `catalog_only`, or `api` |
| `default_read_mode` | `none`, `generic`, `facade`, or `projection` |
| `default_write_mode` | `none`, `generic`, `facade`, or `append_only` |
| `default_concurrency_mode` | `none`, `optimistic`, or `append_only` |
| `default_change_policy` | `locked`, `controlled`, or `extensible` |
| `created_at`, `created_by` | Seed provenance |

These values are **defaults**, copied explicitly into a newly created runtime
profile. They are not inherited dynamically after authoring. This eliminates
class/entity/platform precedence and makes a revision self-contained.

Do not restore `valid_governance_levels`, `security_tiers`,
`compliance_profile`, `field_flag_rules`, `expected_system_columns`, default
tabs/layout, or `cache_policy` here. Authorization belongs to `authz`, policy
rules to `control.policy_*`, audit disposition to the audit contract, UI
defaults to surfaces, cache tuning to compiled/runtime configuration, and
required-field checks to versioned validators/test cases.

## 2. `metadata.entity_runtime_profile`

Purpose: the Entity's authored storage and execution contract. It replaces
runtime/storage columns formerly spread across `control.entity`,
`entity_version_contract`, and editable contract JSON.

Recommended columns:

| Property | Contract |
|---|---|
| `profile_key` | Fixed logical key `default` in Phase 2 |
| `backing_kind` | `table`, `view`, `materialized_view`, `external`, or `virtual` |
| `storage_plane` | Nullable `athyper`, `neon`, or `mesh`; required for physical/external backing |
| `storage_schema` | Nullable safe SQL identifier; conditionally required |
| `storage_object` | Nullable safe SQL identifier; conditionally required |
| `api_exposure` | `none`, `catalog_only`, or `api` |
| `read_mode` | `none`, `generic`, `facade`, or `projection` |
| `write_mode` | `none`, `generic`, `facade`, or `append_only` |
| `read_handler_key` | Required only for facade reads |
| `write_handler_key` | Required only for facade writes |
| `create_mode` | `form_only`, `early_draft`, `direct`, or `source_document` |
| `concurrency_mode` | `none`, `optimistic`, or `append_only` |
| `record_version_field_key` | Required only for optimistic concurrency |
| `tenant_field_key` | Nullable stable field key used for row tenancy |
| `soft_delete_field_key` | Nullable stable field key; absence means no generic soft delete |
| `draft_ttl_hours` | Nullable positive integer, valid only for early-draft creation |
| audit pair | Standard creation/update provenance |

The primary key is defined by `entity_key(kind = 'primary')`; it is not copied
onto this profile. Search settings belong to search profiles. Data retention,
PII, permission, lifecycle, numbering, cache, display, compilation hashes,
readiness, and publication state do not belong here.

Derived values include `runtime_enabled`, effective class defaults, descriptor
readiness, and generic CRUD eligibility. They must be returned as read-only
validation/preview output, not persisted as additional booleans.

## 3. `metadata.entity_field`

Purpose: stable intrinsic value and storage semantics for one field inside a
change set.

Recommended columns:

| Property | Contract |
|---|---|
| `field_key` | Stable lower-snake logical key, unique in the change set |
| `description` | Optional semantic documentation; not a UI label/help string |
| `data_type` | Controlled domain: string, text, integer, bigint, decimal, boolean, uuid, date, datetime, json, enum, reference, money |
| `type_config` | Strict discriminated object whose `kind` equals `data_type` |
| `cardinality` | `one`, `zero_or_one`, or `many`; sole null/collection owner |
| `value_origin` | `stored`, `computed`, `projected`, or `runtime` |
| `write_mode` | `mutable`, `write_once`, `read_only`, or `computed` |
| `storage_path` | Nullable physical column/path; required for stored/projected values |
| `default_spec` | Nullable strict discriminated default-source contract |
| `computation_spec` | Nullable strict expression/handler contract; required for computed values |
| `validation_spec` | Nullable strict business/runtime validation contract |
| `status` | `active` or `deprecated` |
| `replacement_field_key` | Optional field key, required before planned removal |
| `deprecated_since_release_no` | Nullable positive release coordinate |
| `planned_removal_release_no` | Nullable and greater than the deprecation coordinate |
| audit pair | Standard creation/update provenance |

Strict JSON boundaries:

- `type_config` describes only the value representation. A reference config
  contains its scalar identifier type, not target Entity/field coordinates.
- `default_spec` supports controlled sources such as static, current time,
  principal, tenant context, parent field, or registered resolver. It contains
  no UI chip/label behavior.
- `computation_spec` supports a registered expression language or handler key;
  raw SQL and arbitrary executable code are forbidden.
- `validation_spec` expresses business validation not already guaranteed by
  data type/cardinality/key membership. It must not copy physical PostgreSQL
  constraints.

Remove `required` because cardinality already owns it. Remove `is_unique`
because keys own uniqueness. Remove searchable/filterable/sortable/groupable/
aggregatable/queryable flags because search and later query/surface bindings own
usage. Remove label, UI type, format, group, sort order, visibility,
editability, lookup, renderer, picker, and collection presentation because
surface-field bindings own them. Remove FK target fields because relations own
them. Remove primary amount/currency booleans and unbounded semantic-role bags;
introduce a normalized role binding only when a concrete compiler consumer is
approved.

## 4. `metadata.entity_key`

Purpose: one named identity or uniqueness contract.

Recommended columns:

| Property | Contract |
|---|---|
| `key_key` | Stable logical key |
| `key_kind` | `primary`, `natural`, `alternate`, or `idempotency` |
| `uniqueness_scope` | `global` or `tenant` |
| `null_semantics` | `not_allowed`, `nulls_distinct`, or `nulls_not_distinct` |
| `status` and deprecation coordinates | Same lifecycle pattern as fields |
| audit pair | Standard creation/update provenance |

There is at most one active primary key. Primary-key fields are cardinality
`one`, stored, and not computed. Field membership is never an array on this
table.

## 5. `metadata.entity_key_field`

Purpose: ordered key-to-field membership.

Recommended columns: `entity_key_id`, `entity_field_id`, `position`, plus the
standard scope and audit pair. Enforce unique field membership per key and
unique positive position per key. Sort direction, display order, and field
copies are not properties of uniqueness.

## 6. `metadata.entity_search_profile`

Purpose: a provider-neutral searchable document/query contract.

Recommended columns:

| Property | Contract |
|---|---|
| `search_key` | Stable logical key, for example `default` or `supplier_lookup` |
| `search_kind` | `keyword`, `full_text`, or `hybrid` |
| `query_operator` | `and` or `or` |
| `minimum_query_length` | Positive bounded integer |
| `language_code` | Nullable BCP-47/default language coordinate |
| `normalization_mode` | `none`, `casefold`, or `casefold_unaccent` |
| `is_default` | One default profile at most per change set |
| `status` and deprecation coordinates | Same lifecycle pattern |
| audit pair | Standard creation/update provenance |

Provider analyzers, indexes, vector dimensions, and engine-specific settings
belong to plane compilation artifacts, not the authoring graph. Result columns,
labels, filters, sort controls, and page size belong to later surface/query
design.

## 7. `metadata.entity_search_field`

Purpose: ordered, weighted search-profile membership.

Recommended columns: `entity_search_profile_id`, `entity_field_id`, `position`,
`match_mode` (`exact`, `prefix`, `contains`, `full_text`), and `weight` as a
bounded positive numeric value. Enforce one binding per field/profile and one
position per profile. A compiler validates that match mode is compatible with
the field type. No field-level `is_searchable` or profile-level field/rank JSON
is retained.

## 8. `metadata.entity_relation`

Purpose: stable relation identity and behavior shared by all of its targets.

Recommended columns:

| Property | Contract |
|---|---|
| `relation_key` | Stable logical key |
| `relation_kind` | `one_to_one`, `many_to_one`, `one_to_many`, or `many_to_many` |
| `resolution_kind` | `foreign_key`, `logical`, or `polymorphic` |
| `ownership_mode` | `reference`, `aggregate_child`, or `shared`; aggregate ownership is valid from either the parent or child navigation direction and does not imply physical `ON DELETE CASCADE` |
| `mutation_mode` | `read_only`, `source_owned`, `target_owned`, or `coordinated` |
| `on_delete` | `restrict`, `cascade`, `set_null`, or `no_action` |
| `on_update` | `restrict`, `cascade`, or `no_action` |
| `inverse_relation_key` | Optional logical inverse; compiler validates reciprocity |
| `status` and deprecation coordinates | Same lifecycle pattern |
| audit pair | Standard creation/update provenance |

Do not store record-filter JSON, UI behavior, mutation permissions, source or
target field names, discriminator properties, or target Entity names here.
Authorization is bound to operations; UI relation rendering is surface-owned.
A many-to-many junction is modeled as its own Entity with two relations rather
than an embedded junction property bag.

## 9. `metadata.entity_relation_target` (recommended addition)

Purpose: one concrete target variant of a relation.

Recommended columns: `relation_target_key`, `entity_relation_id`,
`target_entity_id`, `target_key_key`, optional `discriminator_value`,
`is_default`, and standard scope/audit columns.

Non-polymorphic relations require exactly one target and no discriminator.
Polymorphic relations require unique discriminator values and at most one
default target. `target_key_key` is a stable logical coordinate; validation
resolves it against the target Entity's compatible release rather than creating
an impossible cross-change-set FK.

## 10. `metadata.entity_relation_field` (recommended addition)

Purpose: ordered source-to-target field mapping for a relation target.

Recommended columns: `entity_relation_target_id`, `source_field_id`,
`target_field_key`, and `position`, plus standard scope/audit columns. Enforce
unique source field and unique position within a target. The number and order
of mappings must match the selected target key. This supports composite keys
without `source_fields`/`target_fields` arrays or JSON.

## Legacy property disposition

| Legacy property family | Final owner/decision |
|---|---|
| `entity_version_contract` storage/API/concurrency columns | `metadata.entity_runtime_profile` |
| `runtime_enabled`, readiness, compile hashes | Derived view/artifact state |
| `identity_config.primary_key/business_key/natural_key` | Entity keys and key-field bindings |
| `search_config.fields/rank` and `is_searchable` | Search profiles and search-field bindings |
| field `is_required` plus cardinality | Cardinality only |
| field `is_unique` plus `unique_scope` | Keys only |
| field read-only/computed/write-once booleans | One `write_mode` plus `value_origin` |
| `reference_config` and field FK target columns | Relation target/field bindings |
| `enum_config`, `money_config`, `datetime_config`, `json_config` | Strict `type_config` |
| `default_value` plus `defaults` | Strict `default_spec` |
| `compute_expr` | Strict `computation_spec` |
| `validation` plus `constraints` | Strict `validation_spec`, without DB-constraint copies |
| label, format, UI type/hints, visibility, editability, lookup/filter config | Phase 3 surface-field binding |
| field group/order/grid properties | Phase 3 surface section and field binding |
| class security/compliance/audit rules | Authz, policy, and canonical audit contracts |
| class cache/list/UI defaults | Compiled runtime tuning and Phase 3 surfaces |
| relation `record_filter` and `ui_behavior` | Policy/query binding and surface binding |
| relation mutation permissions | Entity operations and authz scope bindings |
| arbitrary `metadata`, `config`, and `.passthrough()` objects | Removed from the canonical graph |

## Cross-table invariants and DDL mechanics

The implementation must provide these invariants before service wiring begins:

1. Composite FKs include tenant scope wherever both sides are tenant-aware.
2. A child row's `tenant_id`, `entity_id`, and `change_set_id` must match its
   parent graph; global and tenant rows cannot be mixed.
3. Logical keys use lower snake case and `UNIQUE NULLS NOT DISTINCT` tenant
   semantics.
4. Only `draft` and `rejected` change sets are editable. Review, approved,
   abandoned, and published graphs are sealed.
5. A transaction calls one compare-and-advance function with the expected
   `lock_version` before any graph mutation. Row triggers must not increment the
   change-set lock once per affected child row.
6. All mutable tables enforce create/update audit pairs and a shared updated-at
   trigger. Seed-only class profiles reject application update/delete.
7. Forced RLS allows platform definitions plus the current tenant for reads,
   permits tenant writes only to that tenant's editable graph, and reserves
   global writes for the Admin/platform role.
8. Cross-row checks that cannot be expressed as `CHECK` constraints run through
   fixed-search-path invoker functions and deferred constraint triggers where
   transaction ordering requires them.
9. Deleting draft graph rows is allowed only after dependency validation.
   Published history survives in immutable revisions; releases are never
   rewritten.
10. The canonical serializer sorts every collection by logical key/position so
    the same graph always generates the same contract hash.

## Studio layout mapped to this model

Use a persistent shell rather than separate disconnected forms:

```text
Entity catalog | Entity / change set header / lock / workflow actions
---------------+----------------------------------------------------
               | Overview | Fields | Keys | Search | Relations
Entity filters |----------------------------------------------------
and selection  | Main editor                 | Context inspector
               |                             | Effective + derived
---------------+----------------------------------------------------
Problems / dependency impact / checkpoint diff drawer
```

### Persistent header

Show Entity code, class, ownership, tenant/global badge, active branch, base
release, change-set status, lock version, validation status, unsaved state, and
checkpoint/submit/review actions. Publication and compatibility are derived
from revision/release state, not editable profile properties.

### Overview tab

- **Identity card:** read-only stable Entity identity.
- **Class defaults card:** selected class profile values and their copied,
  explicit runtime-profile values. A reset action copies a default; there is no
  invisible inheritance.
- **Storage card:** backing kind, plane, schema/object with conditional fields.
- **Execution card:** API exposure, read/write modes and handler keys.
- **Creation/concurrency card:** create mode, draft TTL, concurrency mode,
  version/tenant/delete field references.
- **Effective contract rail:** read-only generic CRUD eligibility and compiler
  consequences.

### Fields tab

The center table shows field key, type, cardinality, origin/write mode, storage
path, lifecycle state, and dependency counts. Selecting a row opens a typed
inspector with Value, Storage, Default, Computation, Validation, and Deprecation
sections. Key/search/relation membership is shown as navigation links, never as
editable duplicate switches. Presentation properties are intentionally absent
until the Phase 3 Surface Designer.

### Keys tab

A master/detail list shows kind, uniqueness scope, null semantics, ordered field
chips, and validation state. Reordering edits `entity_key_field.position`.
Primary-key and compatibility problems appear immediately.

### Search tab

The left side lists profiles; the editor groups query semantics separately from
ordered field bindings. Each binding edits match mode and weight. A read-only
preview explains the provider-neutral search document and any plane compiler
limitations.

### Relations tab

Provide synchronized table and diagram modes. The relation inspector has
Behavior, Targets, Field mapping, Ownership/mutation, and Deprecation sections.
Normal relations show one target. Polymorphic relations show target variants
and discriminators. Composite mappings are edited as rows, never comma-separated
keys. Selecting a diagram edge opens the same inspector, so the diagram is not
a second property owner.

### Problems and history

The bottom drawer groups diagnostics by property path and severity, supports
click-through to the owning tab/row, and distinguishes local validation from
cross-Entity dependency impact. History shows immutable checkpoints and
semantic diffs. `audit.audit_log` supplies actor/workflow evidence;
`snapshot.entity_contract_revision` supplies the exact before/after graph.

## Implementation sequence after approval

1. Approve the ten-table inventory and the property-disposition matrix.
2. Add Phase 2 domains, tables, comments, and composite tenancy constraints.
3. Add indexes, editable-graph guards, deferred graph validators, update
   triggers, RLS/policies, grants, and fixed search paths.
4. Add deterministic graph serialization and a schema-only checkpoint smoke
   test; do not add service or legacy compatibility wiring.
5. Update the clean authoring contracts to remove `required`, `queryable`, and
   relation targets from field `typeConfig`, then add DTOs for all normalized
   bindings.
6. Build the canonical service and transaction boundary with one optimistic
   lock advance per save operation.
7. Populate the independent Meta Entity seed pack with class profiles and real
   reference Entity graphs. Do not copy legacy seeds.
8. Complete Studio editors, diagnostics, checkpoint diff, review, and
   publication workflow. Phase 3 then adds surfaces and live UI preview.

## Review acceptance checklist

- [ ] Approve adding `entity_relation_target` and `entity_relation_field`.
- [ ] Confirm class profiles are immutable seeded defaults, not live inheritance.
- [ ] Confirm cardinality is the sole required/nullability property.
- [ ] Confirm keys are the sole uniqueness/identity owner.
- [ ] Confirm search membership is normalized and generic query/UI flags wait
      for a concrete surface/query binding.
- [ ] Confirm reference target coordinates live only in relations.
- [ ] Confirm strict field specification JSON is limited to type, default,
      computation, and validation semantics.
- [ ] Confirm labels/layout/renderer/visibility/editability remain Phase 3
      surface properties.
- [ ] Confirm storage is initially one authoritative plane per runtime profile;
      multi-plane releases receive compiled projections, not duplicate authoring
      profiles.
- [ ] Confirm no runtime service, CRUD API, or seed migration starts before the
      Phase 2 DDL fresh-build gate passes.
