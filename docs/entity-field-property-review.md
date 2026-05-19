# Entity Field Property Review

This review classifies every `control.entity_field` property by runtime
contract ownership, current wiring, and cleanup direction.

Status legend:

- `Runtime`: part of the field contract or directly used by runtime services.
- `Runtime gap`: should become part of the contract or be deliberately moved.
- `Storage`: needed for DB scoping, lifecycle, audit, or provisioning, but not
  part of the compiled field payload.
- `Authoring`: useful while designing or generating fields, but not runtime UI.
- `Reserve`: keep temporarily while we migrate or confirm no consumers remain.

## Current Runtime Surface

The primary compiled field contract is `EntityFieldSchema` in
`packages/shared/data/api-contracts/src/schemas/metadata.ts`.

Runtime paths currently read `control.entity_field` through:

- `server/src/foundation/metadata/entity-compiler.service.ts`
- `server/framework/runtime/services/metadata/routes/compiled-entity.route.ts`
- `server/framework/runtime/services/metadata/routes/entity-flow.route.ts`
- `server/framework/runtime/services/records/copy-record.service.ts`
- `packages/shared/data/metadata-client/src/compiled-reader.ts`
- `packages/shared/runtime/entity-runtime/src/metadata/fieldSemantics.ts`

## Property Matrix

| Property | Status | Current wiring | Decision | Cleanup action |
| --- | --- | --- | --- | --- |
| `id` | Runtime | Compiled as field identity. | Keep. | No cleanup. |
| `tenant_id` | Storage | Used for tenant/custom-field scoping, not compiled. | Keep storage-only. | Do not expose to UI field metadata. |
| `entity_version_id` | Storage | Used to bind fields to effective entity versions. | Keep storage/query-only. | Do not expose unless diagnostics need it. |
| `name` | Runtime | Compiled and used as logical field key. | Keep. | Treat as immutable after publication. |
| `column_name` | Runtime | Compiled and used for physical record binding. | Keep. | Keep empty only for non-persisted or not-yet-provisioned custom fields. |
| `label` | Runtime | Compiled for UI display. | Keep. | Prefer explicit label over UI-specific label in `ui_hint`. |
| `description` | Runtime | Compiled for help/metadata. | Keep. | Keep field-specific only. Entity-level help belongs elsewhere. |
| `data_type` | Runtime | Compiled and validated by contract. | Keep. | Continue lookup validation. |
| `ui_type` | Runtime | Compiled for renderer selection. | Keep. | Normalize values to a small renderer vocabulary. |
| `format` | Runtime | Compiled as a formatting hint. | Keep. | Use for date/number/string format rather than adding more config blobs. |
| `unit` | Runtime | Compiled as unit hint. | Keep. | Keep simple text/code; richer unit behavior belongs in domain config. |
| `cardinality` | Runtime | Compiled. | Keep. | Use `one`, `zero_or_one`, `many` consistently. |
| `origin` | Runtime | Compiled and used by runtime/provisioning semantics. | Keep. | Confirm custom fields use the intended origin vocabulary. |
| `is_required` | Runtime | Compiled and used by validation/form behavior. | Keep. | No cleanup. |
| `is_unique` | Runtime | Compiled. | Keep. | Pair with `unique_scope` when uniqueness is not global. |
| `unique_scope` | Runtime gap | DDL/Prisma only; not in compiled `EntityFieldSchema`. | Wire next. | Add to API schema/compiler if UI/server validation needs scoped uniqueness. |
| `is_searchable` | Runtime | Compiled. | Keep. | No cleanup. |
| `is_filterable` | Runtime | Compiled. | Keep. | No cleanup. |
| `is_sortable` | Runtime | Compiled. | Keep. | No cleanup. |
| `is_groupable` | Runtime | Compiled. | Keep. | No cleanup. |
| `is_aggregatable` | Runtime | Compiled. | Keep. | No cleanup. |
| `is_read_only` | Runtime | Compiled as `is_readonly`. | Keep. | Preserve API alias for compatibility; avoid adding a second client name. |
| `is_deprecated` | Storage | Copy service reads it; compiled descriptors filter active rows only. | Keep lifecycle-only. | Decide whether deprecated active fields should remain visible but warned. |
| `is_computed` | Runtime | Compiled; copy/runtime semantics exclude it from copy. | Keep. | Ensure form edit state treats computed fields as non-editable. |
| `is_write_once` | Runtime | Compiled; copy/runtime semantics exclude it from copy. | Keep. | Wire create-versus-update editability consistently in UI. |
| `is_active` | Storage | Used to filter compiled fields and copy metadata. | Keep query-only. | No cleanup. |
| `compute_mode` | Authoring | DDL/Prisma only. | Keep server-only. | Use only with compute evaluator; do not expose expressions to UI. |
| `compute_expr` | Authoring | DDL/Prisma only. | Keep server-only. | Audit once compute evaluator is finalized. |
| `enum_config` | Reserve | Seeded in older files; not compiled. | Migrate to `enum_domain_code` where possible. | Keep only for intentional inline enums or add explicit compiler support. |
| `enum_domain_code` | Runtime | Compiled. | Keep preferred enum contract. | Continue migrating inline enums to lookup domains. |
| `enum_kind` | Reserve | DDL/Prisma only. | Deprecate/reserve. | Remove from new seed usage. |
| `reference_config` | Runtime | Compiled and normalized with target picker profiles. | Keep compact. | Field-level config should contain target plus true overrides only. |
| `fk_target_entity_id` | Reserve | DDL/Prisma only. | Move to schema/relationship ownership. | Prefer `control.entity_relation` or DDL introspection for physical FK policy. |
| `fk_target_field` | Reserve | DDL/Prisma only. | Reserve schema-only. | Runtime reference target field belongs in `reference_config.target_field`. |
| `fk_on_delete` | Reserve | DDL/Prisma only. | Schema-only. | Keep out of UI metadata. |
| `fk_on_update` | Reserve | DDL/Prisma only. | Schema-only. | Keep out of UI metadata. |
| `fk_relationship_class` | Reserve | DDL/Prisma only. | Move to relationship descriptor. | Use `control.entity_relation` for relationship behavior. |
| `json_config` | Runtime gap | Server route helpers read it; not compiled. | Wire or narrow. | Add to compiled contract for JSON editors/imports, or document as server-only. |
| `money_config` | Runtime | Compiled. | Keep. | Use for currency/precision semantics. |
| `datetime_config` | Reserve | DDL/Prisma only. | Deprecate unless a date widget needs it. | Move useful pieces into `format`, `unit`, or explicit UI config. |
| `group_key` | Runtime | Compiled; fallback remains from legacy `ui_hint.group_key`. | Keep. | Continue removing duplicate `ui_hint.group_key`. |
| `filter_config` | Runtime | Compiled; fallback remains from legacy `ui_hint.filter`. | Keep. | Continue removing duplicate `ui_hint.filter`. |
| `ui_hint` | Runtime | Compiled as a small field-specific bag. | Keep narrow. | Audit and remove target-level picker, group, filter, and display defaults. |
| `visibility` | Runtime gap | Flow child fields select it; standard descriptor does not compile it. | Decide and wire. | If field-level visibility is real, add contract and UI consumer; otherwise move to flow sections/display config. |
| `editability` | Runtime gap | Seeded in governed coverage; not compiled. | Wire next or fold into behavior flags. | Add explicit create/update/status edit rules to contract, or migrate to `is_read_only`/`is_write_once`. |
| `lookup_config` | Runtime | Compiled. | Keep. | Use for dependent lookup behavior and option sourcing. |
| `lookup_profile` | Reserve | DDL/Prisma only. | Deprecate/reserve. | Migrate reusable behavior into lookup registry or `lookup_config`. |
| `child_entity_name` | Reserve | DDL/Prisma only. | Move out of field. | Use `entity_relation` or `entity_flow_section` for child collections. |
| `child_fk_field` | Reserve | DDL/Prisma only. | Move out of field. | Use relationship descriptors. |
| `collection_behavior` | Reserve | DDL/Prisma only. | Move out of field. | Put collection UI behavior on relation or flow section. |
| `validation` | Runtime | Compiled as `validation_rules` only when it is true validation. | Keep validation-only. | Remove legacy `ref_entity`, `target_field`, and display metadata. |
| `constraints` | Reserve | DDL/Prisma only. | Merge or deprecate. | Move runtime checks to `validation`; physical checks belong in DDL. |
| `default_value` | Runtime | Compiled; copy service can use it. | Keep. | Validate shape per `data_type`. |
| `provisioned_at` | Authoring | DDL/Prisma only. | Keep provisioning-only. | Not part of runtime contract. |
| `provisioned_by` | Authoring | DDL/Prisma only. | Keep provisioning-only. | Not part of runtime contract. |
| `applies_to_classes` | Authoring | Canonical rows only. | Keep canonical-only. | Do not copy to version-field runtime rows unless needed. |
| `synonym_cluster` | Authoring | Canonical dictionary metadata. | Keep authoring-only. | Keep out of compiled field contract. |
| `is_required_default` | Authoring | Canonical defaulting metadata. | Keep authoring-only. | Apply during field generation, not runtime rendering. |
| `is_filterable_default` | Authoring | Canonical defaulting metadata. | Keep authoring-only. | Apply during field generation, not runtime rendering. |
| `sort_order` | Runtime | Compiled and used for UI ordering. | Keep. | No cleanup. |
| `created_at` | Storage | Audit only. | Keep storage-only. | No cleanup. |
| `created_by` | Storage | Audit only. | Keep storage-only. | No cleanup. |
| `updated_at` | Storage | Audit only. | Keep storage-only. | No cleanup. |
| `updated_by` | Storage | Audit only. | Keep storage-only. | No cleanup. |

## Highest Value Cleanup Cuts

1. Wire the explicit runtime gaps:
   `unique_scope`, `json_config`, `visibility`, and `editability`.
2. Keep `validation` pure:
   remove reference metadata and use only validation rules.
3. Keep `reference_config` compact:
   target entity plus field-specific overrides only.
4. Move physical FK and collection behavior out of `entity_field`:
   use `control.entity_relation`, DDL introspection, or flow sections.
5. Shrink `ui_hint`:
   allow only local field rendering hints, not group/filter/reference defaults.

## Recommended Contract Shape

The durable field contract should be:

- Identity and binding:
  `id`, `name`, `column_name`, `label`, `description`, `sort_order`
- Type:
  `data_type`, `ui_type`, `format`, `unit`, `cardinality`, `origin`
- Behavior:
  `is_required`, `is_unique`, `unique_scope`, `is_searchable`,
  `is_filterable`, `is_sortable`, `is_groupable`, `is_aggregatable`,
  `is_readonly`, `is_computed`, `is_write_once`
- Value semantics:
  `enum_domain_code`, `reference_config`, `money_config`, `json_config`,
  `default_value`, `validation_rules`
- Presentation and interaction:
  `group_key`, `filter_config`, `lookup_config`, `ui_hint`, and explicit
  `visibility` or `editability` only if the UI consumes them uniformly

Everything else should be storage, authoring, relationship, or provisioning
metadata and should stay out of the compiled runtime payload.

Implementation sequencing for these improvements is captured in
`docs/entity-field-cleanup-implementation-plan.md`.
