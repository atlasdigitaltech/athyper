# Entity Field Cleanup Implementation Plan

This plan implements the cleanup decisions from
`docs/entity-field-property-review.md`.

The goal is to make `control.entity_field` a clear runtime field contract while
moving authoring, schema, relationship, and target-level UI metadata to the
right owners.

## Outcomes

After cleanup:

- The compiled `EntityField` contract exposes every runtime-visible property
  intentionally.
- Field-level `reference_config` is compact and only carries target plus true
  field overrides.
- `validation` contains validation only.
- `ui_hint` contains field-specific rendering hints only.
- Relationship and physical FK behavior is not duplicated inside field rows.
- Reserved/authoring-only columns are audited so they do not become accidental
  runtime dependencies.

## Phase 0: Baseline And Audit

Purpose: get hard counts before changing more behavior.

Actions:

1. Run the schema migration that creates `control.v_entity_field_contract_audit`.
2. Capture audit counts by issue type:
   - `legacy_validation_ref_entity`
   - `legacy_reference_config_ref_entity`
   - `ui_hint_runtime_duplicate`
   - `repeated_reference_picker_blob`
   - `reserved_authoring_column_non_null`
3. Add focused audit queries for runtime gaps:
   - `unique_scope IS NOT NULL`
   - `json_config IS NOT NULL`
   - `visibility IS NOT NULL`
   - `editability IS NOT NULL`
   - `enum_config IS NOT NULL`
   - `constraints IS NOT NULL`
4. Export before/after counts into a local cleanup note or migration log.

Files:

- `server/db/seed/010_platform/999_schema_migrations/20260518_entity_field_contract_cleanup.sql`
- `docs/entity-field-property-review.md`

Validation:

- Migration runs idempotently.
- Audit view returns rows without failing on null or malformed JSON.

## Phase 1: Wire Explicit Runtime Gaps

Purpose: if a property affects runtime behavior, compile it deliberately.

### 1A. Add `unique_scope`

Decision:

- Keep `unique_scope` as runtime contract because scoped uniqueness affects
  validation, authoring, and user feedback.

Implementation:

1. Add `unique_scope: z.string().nullable().optional()` to
   `EntityFieldSchema`.
2. Add `unique_scope` to `CompiledField`.
3. Ensure `mapField` includes it in:
   - `server/src/foundation/metadata/entity-compiler.service.ts`
   - `server/framework/runtime/services/metadata/routes/compiled-entity.route.ts`
4. Add UI/server validation interpretation:
   - `global`: unique across platform/global domain
   - `tenant`: unique within tenant
   - `entity_instance`: unique within owning entity instance or parent context

Validation:

- API contract typecheck.
- Runtime server typecheck.
- Add or update validation tests once uniqueness enforcement path is located.

### 1B. Add `json_config`

Decision:

- Compile `json_config` if JSON editors, import/export, or route helpers need
  schema/options at runtime.

Implementation:

1. Add `json_config: z.record(z.string(), z.unknown()).nullable().optional()`
   to `EntityFieldSchema`.
2. Add `json_config` to `CompiledField`.
3. Include it in compiler and HTTP metadata route `mapField`.
4. Update JSON field renderer, importer, or validator to read compiled
   metadata instead of querying `control.entity_field` directly where possible.

Validation:

- API contract typecheck.
- Runtime server typecheck.
- Smoke one entity with `data_type = 'json'`.

### 1C. Decide And Wire `visibility`

Decision gate:

- If `visibility` is field-level runtime behavior, compile it.
- If it is flow/section visibility, migrate it to `entity_flow_section` or
  display config and reserve the column.

Preferred implementation:

1. Define a compact contract:

   ```json
   {
     "surfaces": ["list", "detail", "form"],
     "hidden_when": { "field": "status", "op": "eq", "value": "archived" }
   }
   ```

2. Add `visibility` to `EntityFieldSchema` only after shape is stable.
3. Use it in list column selection, detail rendering, and form rendering from
   the same compiled field metadata.

Validation:

- Verify hidden fields do not render in list/detail/form.
- Verify hidden fields are still preserved in record payloads when needed.

### 1D. Decide And Wire `editability`

Decision gate:

- If the only cases are read-only, computed, and write-once, migrate to flags.
- If status/permission/surface-specific edit rules are needed, compile
  `editability`.

Preferred implementation:

1. Define a compact contract:

   ```json
   {
     "create": true,
     "update": false,
     "editable_in_status": ["draft"],
     "requires_permission": "field.override"
   }
   ```

2. Add it to `EntityFieldSchema`.
3. Wire `useEntityEditState` and form renderers to consume it.
4. Keep `is_readonly`, `is_computed`, and `is_write_once` as fast-path flags.

Validation:

- New record: create-editable fields are editable.
- Existing record: write-once and update-disabled fields are locked.
- Status-specific fields unlock only in allowed statuses.

## Phase 2: Purify `validation`

Purpose: make `validation` mean validation only.

Actions:

1. Keep the current migration that moves legacy reference metadata from
   `validation` into `reference_config`.
2. Add a stronger audit:
   - flag any `validation` key in `('ref_entity', 'target_field',
     'display_field', 'picker', 'label_field', 'code_field')`.
3. Update seed files that still insert reference metadata into `validation`.
4. Confirm the compiler keeps the compatibility fallback temporarily:
   `validation.ref_entity` can still be normalized into `reference_config`.
5. After seed cleanup, remove fallback in a separate breaking cleanup pass.

Validation:

- `control.v_entity_field_contract_audit` has zero
  `legacy_validation_ref_entity` rows.
- Existing reference pickers still render.

## Phase 3: Compact `reference_config`

Purpose: target-level picker behavior belongs on the target entity, not every
source field.

Actions:

1. Keep target-level picker profiles in `control.entity.display_config`:

   ```json
   {
     "reference_picker": {
       "label_field": "name",
       "code_field": "code",
       "navigation_field": "code",
       "show_code": true,
       "show_view_action": true
     }
   }
   ```

2. Keep source field config minimal:

   ```json
   {
     "target_entity": "principal"
   }
   ```

3. Allow source field overrides only for:
   - dependent filters
   - unusual display or target field
   - custom picker mode
   - field-specific description/code visibility
4. Update seed SQL that emits full picker blobs.
5. Add a repeat-blob audit threshold so repeated picker JSON cannot grow again.

Validation:

- Audit has zero repeated full picker blobs except intentional overrides.
- Entity picker still resolves labels, codes, navigation, and view action.

## Phase 4: Shrink `ui_hint`

Purpose: make `ui_hint` a narrow field-specific rendering bag.

Allowed examples:

- placeholder
- icon
- help text
- mask
- field-local renderer option
- i18n key

Disallowed examples:

- `group_key`
- `filter`
- reference picker defaults
- entity display defaults
- readonly flags duplicated from `is_read_only`

Actions:

1. Continue backfilling `group_key` and `filter_config` out of `ui_hint`.
2. Add audit keys for known duplicates:
   - `ui_hint.group_key`
   - `ui_hint.filter`
   - `ui_hint.reference_picker`
   - `ui_hint.picker`
   - `ui_hint.readOnly`
   - `ui_hint.read_only`
3. Update seed files so new field rows use direct columns.
4. Keep compiler fallbacks for one migration cycle.
5. Remove fallback once audit is clean.

Validation:

- Filter UI still groups fields correctly.
- Form grouping still works from `group_key`.
- No new seed inserts duplicate group/filter hints.

## Phase 5: Move Relationship And FK Metadata Out Of Field Rows

Purpose: stop treating fields as relationship descriptors.

Columns to reserve/migrate:

- `fk_target_entity_id`
- `fk_target_field`
- `fk_on_delete`
- `fk_on_update`
- `fk_relationship_class`
- `child_entity_name`
- `child_fk_field`
- `collection_behavior`

Preferred owners:

- Physical FK policy: DDL or introspection.
- Logical relationship behavior: `control.entity_relation`.
- Repeater/singleton UI: `control.entity_flow_section`.

Actions:

1. Audit non-null usage by entity and field.
2. For relationship behavior used by UI, create or update
   `control.entity_relation` rows.
3. For flow collection behavior, move to `entity_flow_section`.
4. Leave the old columns in place but mark reserve-only in docs and audit.
5. Block new seed usage unless a migration note explains why.

Validation:

- Detail tabs and child collections still render.
- Record copy and route helpers still resolve relations from the intended
  owner.

## Phase 6: Enum Cleanup

Purpose: make enum metadata consistent.

Actions:

1. Prefer `enum_domain_code`.
2. Keep `enum_config` only for intentionally inline enums.
3. Remove or reserve `enum_kind`.
4. Add audit categories:
   - enum field with `enum_config` but no documented inline reason
   - enum field with both enum config and domain code
   - enum field with neither config nor domain code
5. Update older seed files that still insert inline enum config by default.

Validation:

- `ef_enum_xor_chk` remains satisfied.
- Enum renderers still load options.

## Phase 7: Constraints Cleanup

Purpose: avoid having three places for rule enforcement.

Decision:

- Runtime validation belongs in `validation`.
- Physical DB constraints belong in DDL.
- Authoring-only constraints should move to generation templates or docs.

Actions:

1. Audit `constraints IS NOT NULL`.
2. Classify each row:
   - runtime validation rule
   - physical DB constraint
   - authoring hint
3. Move runtime rules into `validation`.
4. Move physical rules into DDL or migration files.
5. Reserve `constraints` once audit is clean.

Validation:

- Form validation still catches user-facing issues.
- DB constraints still protect persisted data.

## Phase 8: Compiler And Contract Hardening

Purpose: make the compiler the only source of runtime truth.

Actions:

1. Update `EntityFieldSchema` to include only intended runtime fields.
2. Ensure `CompiledField` matches the schema exactly.
3. Ensure HTTP compiled descriptor route matches the compiler.
4. Ensure flow route field projection uses the same normalization helpers.
5. Add tests that compare compiled field keys against a documented allowlist.
6. Add a lint/audit script for field metadata smells.

Validation commands:

- `pnpm.cmd --filter @athyper/api-contracts typecheck`
- `pnpm.cmd --filter @athyper/runtime-server typecheck`
- `pnpm.cmd --filter @athyper/metadata-client typecheck`
- `pnpm.cmd --filter @athyper/entity-runtime typecheck`
- `pnpm.cmd --filter @athyper/adapter-db exec prisma validate`

## Phase 9: Seed Cleanup

Purpose: stop reintroducing noise.

Actions:

1. Update seed writers and patch files in:
   - `server/db/seed/010_platform/004_entity_engine/035_version_fields`
   - `server/db/seed/010_platform/005_domain_registrations`
   - `server/db/seed/010_platform/999_schema_migrations`
2. Replace duplicated picker blobs with target-level profiles.
3. Replace `validation.ref_entity` with `reference_config.target_entity`.
4. Move `ui_hint.group_key` and `ui_hint.filter` to direct columns.
5. Remove new uses of reserve-only columns.

Validation:

- Full seed can run locally.
- Audit row count decreases to expected intentional exceptions.

## Phase 10: Removal Window

Purpose: remove compatibility paths after the data is clean.

Only after audits are clean:

1. Remove compiler fallback from `validation.ref_entity`.
2. Remove compiler fallback from `ui_hint.group_key`.
3. Remove compiler fallback from `ui_hint.filter`.
4. Make repeated full picker blobs an audit failure.
5. Optionally add DB checks for object-shaped JSON where appropriate.

Validation:

- Full app typecheck passes.
- Targeted UI smoke passes for list, detail, create, edit, flow, and picker.

## Execution Order

Recommended order for the next implementation pass:

1. Wire `unique_scope` and `json_config`.
2. Decide and wire `editability`.
3. Decide and wire `visibility`.
4. Strengthen audits for `validation`, `ui_hint`, and reserved columns.
5. Clean seed writers.
6. Run full seed and capture audit counts.
7. Remove compatibility fallbacks only after the audit is clean.

## Risks

- Existing UI may rely on undocumented `ui_hint` keys.
- Flow-specific field behavior may currently be mixed with standard entity
  metadata.
- Some route helpers still query `control.entity_field` directly and may bypass
  compiled metadata.
- Older seed files may recreate noisy metadata after a cleanup migration.

## Done Criteria

The cleanup is complete when:

- `control.v_entity_field_contract_audit` returns zero unexpected rows.
- `EntityFieldSchema`, `CompiledField`, and route `mapField` outputs match.
- UI form/list/detail/flow rendering reads the same compiled field contract.
- `reference_config` is compact across repeated target entities.
- `validation` no longer contains reference metadata.
- `ui_hint` no longer duplicates first-class columns.
- Reserved columns are either empty, migrated, or explicitly documented as
  authoring-only.
