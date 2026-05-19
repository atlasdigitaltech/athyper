# Entity Field Contract

`control.entity_field` is the runtime field contract plus a small amount of
authoring metadata. It should not carry target-level picker behavior, entity
identity rules, search defaults, or schema DDL policy unless a runtime consumer
reads that value directly.

## Runtime Contract

Identity and binding:

- `entity_version_id`
- `name`
- `column_name`
- `label`
- `description`
- `sort_order`

Type:

- `data_type`
- `ui_type`
- `format`
- `unit`
- `cardinality`
- `origin`

Runtime behavior:

- `is_required`
- `is_unique`
- `unique_scope`
- `is_searchable`
- `is_filterable`
- `is_sortable`
- `is_groupable`
- `is_aggregatable`
- `is_read_only`
- `is_computed`
- `is_write_once`
- `is_active`

Value semantics:

- `enum_domain_code`
- `reference_config`
- `money_config`
- `json_config`
- `default_value`
- `validation`

Presentation:

- `group_key`
- `filter_config`
- `ui_hint`

`ui_hint` is only for genuinely field-specific rendering hints. It must not
repeat `group_key`, `filter_config`, or target-level reference picker behavior.

## Reference Contract

Normal references should be compact:

```json
{
  "target_entity": "principal"
}
```

Allowed field-level keys:

- `target_entity`
- `target_field`, only when not `id`
- `display_field`, only when this field overrides the target picker label
- `picker`, only for field-specific picker overrides

Target-level picker defaults live on the referenced entity:

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

`validation.ref_entity` and `reference_config.ref_entity` are legacy aliases.
They are migrated into `reference_config.target_entity` and audited as errors.

## Reserved Or Authoring-Only

These columns are retained for now but are not part of the compiled runtime
contract unless a consumer is explicitly added:

- `lookup_profile`
- `datetime_config`
- `collection_behavior`
- `child_entity_name`
- `child_fk_field`
- `enum_kind`
- `fk_on_delete`
- `fk_on_update`
- `fk_relationship_class`
- `constraints`

Use `control.v_entity_field_contract_audit` to review remaining issues after
seed execution.

For the property-by-property review and cleanup decision matrix, see
`docs/entity-field-property-review.md`.

For the phased implementation plan, see
`docs/entity-field-cleanup-implementation-plan.md`.
