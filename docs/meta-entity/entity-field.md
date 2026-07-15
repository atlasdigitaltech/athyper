# Entity Field Definition â€” `control.entity_field`

`control.entity_field` is the single store for every field definition in the platform â€” canonical standard fields, version-specific fields, and tenant custom fields. Seeded in `server/db/seed/platform/003_control/042_control_entity_field_contract.sql`.

---

## Three Roles of `entity_field`

The same table serves three distinct roles, discriminated by `entity_version_id` and `origin`:

| Role | `entity_version_id` | `origin` | `column_name` prefix | Description |
|---|---|---|---|---|
| **Canonical / standard field** | `IS NULL` | `system` or `standard` | any | Global field dictionary â€” shared across entity classes. Replaces `control.entity_canonical_field`. |
| **Version-specific field** | `IS NOT NULL` | any | any | Field on a specific entity version. Compiled into the runtime descriptor. |
| **Custom tenant field** | `IS NOT NULL` | `business` | `cus_` | Tenant-provisioned column added by `ALTER TABLE ADD COLUMN`. Replaces `control.field_extension`. |

> **Partial unique indexes** (not inline constraints) enforce name uniqueness per role:
> - `ef_canonical_name_uidx` â€” unique `name` where `entity_version_id IS NULL`
> - `ef_version_name_uidx` â€” unique `(entity_version_id, name)` where `entity_version_id IS NOT NULL`
> Both defined in `server/db/ddl/07_indexes/016_entity_engine.sql`.

---

## Table: `control.entity_field` â€” All Columns

### Identity

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid PK` | `shared.uuidv7()` | |
| `tenant_id` | `uuid` | `NULL` | `NULL` for canonical/standard fields; NOT NULL for tenant-scoped fields |
| `entity_version_id` | `uuid` | `NULL` | Discriminator â€” `NULL` = canonical field; `NOT NULL` = version field |

---

### Field Identity

| Column | Type | Default | Notes |
|---|---|---|---|
| `name` | `text NOT NULL` | â€” | Logical field name (e.g. `document_no`, `supplier_id`) |
| `column_name` | `text NOT NULL` | `''` | Physical DB column name (empty for virtual/computed fields) |
| `label` | `text` | â€” | Display label shown in form headers and grid columns |
| `description` | `text` | â€” | Admin description in Metadata Studio |

---

### Data Type

| Column | Type | Notes |
|---|---|---|
| `data_type` | `text NOT NULL` | See [Field Data Types](#field-data-types) |
| `ui_type` | `text` | Overrides data_type for UI rendering (e.g. force `textarea` for a `text` column) |
| `format` | `text` | Type-specific format hint (e.g. `date-iso`, `currency`, `percent`) |
| `unit` | `text` | Unit label displayed alongside the value (e.g. `kg`, `%`) |

---

### Cardinality & Origin

| Column | Type | Default | Allowed Values |
|---|---|---|---|
| `cardinality` | `text NOT NULL` | `one` | `one` Â· `many` Â· `zero_or_one` |
| `origin` | `text NOT NULL` | `business` | `system` Â· `standard` Â· `business` |

**Origin semantics:**
- `system` â€” injected by the platform engine (e.g. `tenant_id`, `status`, `created_at`)
- `standard` â€” canonical cross-entity field (e.g. `description`, `reference_no`)
- `business` â€” entity-specific business field; custom tenant fields use `business` with `cus_` column prefix

---

### Behaviour Flags

Auto-set by `trg_field_flag_defaults` from `entity_class_profile.field_flag_rules` on INSERT. Can be manually overridden.

| Flag | Type | Default | Description |
|---|---|---|---|
| `is_required` | `boolean` | `false` | Field is mandatory on create/edit |
| `is_unique` | `boolean` | `false` | Value must be unique (with `unique_scope`) |
| `unique_scope` | `text` | `NULL` | `global` Â· `tenant` Â· `entity_instance` (required when `is_unique = true`) |
| `is_searchable` | `boolean` | `false` | Included in full-text search index |
| `is_filterable` | `boolean` | `false` | Exposed in the filter drawer |
| `is_sortable` | `boolean` | `false` | Sortable in grid columns |
| `is_groupable` | `boolean` | `false` | Available for GROUP BY analytics |
| `is_aggregatable` | `boolean` | `false` | Available for SUM/COUNT aggregation |
| `is_read_only` | `boolean` | `false` | Always displayed but never editable |
| `is_deprecated` | `boolean` | `false` | Hidden from UI; still accessible via API |
| `is_computed` | `boolean` | `false` | Value is derived â€” must have `compute_mode` |
| `is_write_once` | `boolean` | `false` | Can only be written on CREATE; immutable after |
| `is_active` | `boolean` | `true` | Manual active flag (not GENERATED) |

**Mutual exclusivity constraints:**
- `is_write_once` and `is_read_only` cannot both be `true`
- `is_computed` and `is_write_once` cannot both be `true`

---

### Computed Field Columns

| Column | Type | Notes |
|---|---|---|
| `compute_mode` | `text` | Required when `is_computed = true` (e.g. `formula`, `aggregate`, `derived`) |
| `compute_expr` | `jsonb` | Expression definition consumed by the compute engine |

---

### Naming Conventions (enforced by CHECK)

| Pattern | Enforced Rule |
|---|---|
| `boolean` fields | `name` must match `^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)` |
| `_id` suffix fields | `data_type` must be `uuid`, `reference`, `uuid_array`, or `uuid[]` |
| Custom tenant fields | `column_name` must match `^cus_[a-z][a-z0-9_]*$` |
| `column_name` | Must match `^[a-z][a-z0-9_]*$` (or empty string for virtual fields) |

---

### Canonical Field Columns (entity_version_id IS NULL rows only)

| Column | Type | Default | Notes |
|---|---|---|---|
| `applies_to_classes` | `text[]` | `{}` | Which entity classes this canonical field applies to |
| `synonym_cluster` | `text` | â€” | Cluster identifier for field synonyms (e.g. `name_cluster`) |
| `is_required_default` | `boolean` | `false` | Default `is_required` when this canonical field is added to an entity |
| `is_filterable_default` | `boolean` | `false` | Default `is_filterable` when added to an entity |

---

### Custom Field Provisioning (origin='business' rows)

| Column | Type | Notes |
|---|---|---|
| `provisioned_at` | `timestamptz` | Set when `ALTER TABLE ADD COLUMN` executes |
| `provisioned_by` | `uuid` | Principal who triggered provisioning |

---

### Ordering

| Column | Type | Default | Notes |
|---|---|---|---|
| `sort_order` | `smallint` | `0` | Display order within a field group or form section |
| `group_key` | `text` | â€” | FK to `control.field_group.group_key`; format `^[a-z][a-z0-9_]*$` |

---

### Audit Columns

| Column | Type | Notes |
|---|---|---|
| `created_at` | `timestamptz NOT NULL` | `DEFAULT now()` |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` | `timestamptz` | |
| `updated_by` | `uuid` | |

---

## Field Data Types

Source: `control.lookup_value WHERE domain_code = 'entity_field.data_type'`

| Value | DB Type | Renderer |
|---|---|---|
| `string` | `text` / `varchar` | Text input |
| `text` | `text` (long) | Textarea |
| `integer` | `int4` | Number input |
| `bigint` | `int8` | Number input |
| `decimal` / `numeric` | `numeric` | Number input with precision |
| `boolean` | `bool` | Checkbox |
| `uuid` | `uuid` | UUID display / reference picker |
| `date` | `date` | Date picker |
| `datetime` / `timestamptz` | `timestamptz` | Date-time picker |
| `json` / `jsonb` | `jsonb` | JSON editor |
| `enum` | `text` | Select / combobox |
| `reference` | `uuid` (FK) | Reference picker |
| `money` | `numeric` | Money input with currency |
| `tsvector` | `tsvector` | Search vector (not editable) |
| `text_array` | `text[]` | Multi-value text chips |
| `uuid_array` | `uuid[]` | Multi-reference picker |
| `int_array` | `int[]` | Multi-value integers |
| `jsonb_array` | `jsonb[]` | Array of JSON objects |
| `lifecycle_state` | `text` | Lifecycle badge |

---

## JSONB Config Properties

Each JSONB column has a contract definition in `packages/shared/data-integration/api-contracts/src/schemas/field-contract-registry-core.ts` and a Zod schema in `packages/shared/data-integration/api-contracts/src/schemas/metadata.ts`.

---

### `reference_config` â€” Reference / FK Target

Owner: `value_semantics` Â· Compile target: `client_stripped`

Used when `data_type = 'reference'` or `data_type = 'uuid'` with a FK target.

| Key | Type | Description |
|---|---|---|
| `target_entity` | `string` | `entity_code` of the referenced entity |
| `target_field` | `string` | FK target column (default: `id`) |
| `display_field` | `string` | Field shown as display text after selection |
| `label_field` | `string` | Primary label in picker rows (commonly `name`) |
| `code_field` | `string` | Secondary code line in picker rows (commonly `code`) |
| `description_field` | `string` | Descriptive text line in picker rows |
| `navigation_field` | `string` | Field used to build `/app/{entity}/{id}` URL |
| `record_id_field` | `string` | Backward-compatible alias for `navigation_field` |
| `show_code` | `boolean` | Show code alongside label in picker |
| `show_description` | `boolean` | Show description in picker rows |
| `show_view_action` | `boolean` | Show "View record" action in picker |
| `picker` | `object` | Extended picker config (see below) |

**Picker sub-config:**
```json
{
  "variant": "advanced",
  "density": "compact",
  "page_size": 20,
  "default_search_mode": "server",
  "show_recently_used": true,
  "recent_limit": 5,
  "tree": {
    "enabled": true,
    "parent_field": "parent_id",
    "value_field": "id",
    "level_field": "level"
  }
}
```

**Aliases recognized by compiler:** `ref_entity`, `ref_hint`, `entity`, `entity_code`, `targetEntity`, `refEntity`

---

### `enum_config` â€” Inline Enum Values (Grandfathered)

Owner: `value_semantics` Â· Phase: `grandfathered` Â· New authoring should use `enum_domain_code`.

```json
{ "values": ["DRAFT", "SUBMITTED", "APPROVED"], "options": [{"value": "DRAFT", "label": "Draft"}] }
```

**Preferred approach:** set `enum_domain_code` to a `control.lookup_domain.code` instead of embedding values inline.

### `enum_domain_code` â€” Lookup Domain Reference

Text FK to `control.lookup_domain(code)`. Mutually exclusive with `enum_config` â€” CHECK constraint `ef_enum_xor_chk` enforces this.

---

### FK Reference Columns (structured FK metadata)

| Column | Type | Notes |
|---|---|---|
| `fk_target_entity_id` | `uuid` | FK to `control.entity.id` for the referenced entity |
| `fk_target_field` | `text` | Target column name |
| `fk_on_delete` | `text` | `restrict` Â· `cascade` Â· `set_null` Â· `set_default` Â· `no_action` |
| `fk_on_update` | `text` | Same values as `fk_on_delete` |
| `fk_relationship_class` | `text` | Relationship category hint for UI graph rendering |

---

### `money_config` â€” Monetary Value Semantics

Owner: `value_semantics` Â· Compile target: `client_stripped`

Used when `data_type = 'money'`.

| Key | Type | Description |
|---|---|---|
| `currency_source` | `string` | `field` Â· `header` Â· `constant` Â· `tenant` Â· `system` |
| `currency_field` | `string` | Field on the same record holding the currency code (when `currency_source = 'field'`) |
| `currency_code` | `string` | Fixed ISO 4217 code (when `currency_source = 'constant'`) |
| `currency_code_position` | `string` | `prefix` Â· `suffix` Â· `hidden` |
| `minor_units` | `number` | Decimal places for this currency (0â€“6) |
| `fallback_minor_units` | `number` | Used when currency not resolved |

---

### `filter_config` â€” Filter Drawer Integration

Owner: `presentation` Â· Compile target: `client`

Drives the filter panel in `runtime-list`.

| Key | Type | Description |
|---|---|---|
| `section_key` | `string` | Filter drawer section key |
| `section_label` | `string` | Filter section display label |
| `section_order` | `number` | Sort order within the filter drawer |
| `kind` | `string` | Filter control kind: `range`, `select`, `date_range`, `text` |
| `control_type` | `string` | UI control: `checkbox_group`, `radio`, `combobox`, `date_range_picker` |
| `operators` | `string[]` | Available operators: `eq`, `in`, `lt`, `gt`, `between`, `like` |
| `placeholder` | `string` | Input placeholder text |
| `quick_filter` | `boolean` | Show as a quick-access chip above the main list |
| `quick_label` | `string` | Quick filter chip label |
| `quick_order` | `number` | Quick filter chip sort order |
| `value_label_map` | `{[value]: label}` | Maps raw values to display labels for enum fields |

---

### `ui_hint` â€” Display Hints

Owner: `presentation` Â· Compile target: `client_stripped`

Controls visual presentation in forms, grids, and read-only views.

Mode/surface-specific layout should be authored in
`control.entity_field_surface`, not as new `ui_hint` keys. Keep `ui_hint` for
field-local hints that are valid across modes, such as placeholder, tooltip,
input mode, prefix/suffix, and copy behavior. During migration,
`ui_hint.display.hide_in` remains a compatibility input that the compiler can
project into surface-specific field visibility.

| Key | Type | Description |
|---|---|---|
| `display.hide_in` | `string[]` | Contexts to hide the field: `list`, `detail`, `form` |
| `display.visible_when` | `JSONLogic` | Dynamic visibility condition (JSONLogic expression) |
| `copy.behavior` | `string` | Copy-on-new behavior: `always`, `never`, `prompt` |
| `placeholder` | `string` | Input placeholder text |
| `tooltip` | `string` | Tooltip text shown on hover |
| `rows` | `number` | Textarea row count |
| `variant` | `string` | Input variant (e.g. `outline`, `ghost`) |
| `input_mode` | `string` | HTML `inputmode` attribute: `numeric`, `decimal`, `tel`, `email` |
| `pattern` | `string` | Input mask pattern |
| `icon` | `string` | Leading icon key |
| `prefix` | `string` | Prefix label (e.g. `$`, `+`) |
| `suffix` | `string` | Suffix label (e.g. `kg`, `%`) |
| `hide_label` | `boolean` | Suppress the field label in form layout |
| `autocomplete` | `string` | HTML `autocomplete` attribute |

**Deprecated keys** (normalized at compile time, removed during migration):
- `filter` â†’ `filter_config`
- `copy_behavior` â†’ `ui_hint.copy.behavior`
- `group_key` â†’ top-level `group_key` column
- `visible_when` â†’ `ui_hint.display.visible_when`

---

### `visibility` â€” Dynamic Visibility Rules

Owner: `presentation` Â· Compile target: `client`

JSONLogic expression evaluated against the current record state to show/hide the field.

```json
{ "and": [{ "!": [{ "var": "is_intercompany" }] }] }
```

Evaluated by `packages/shared/runtime-domain/runtime-shared/src/meta-entity/field-visibility.ts`.

---

### `editability` â€” Edit Rules

Owner: `authorization` Â· Compile target: `client`

| Key | Type | Description |
|---|---|---|
| `editable` | `boolean` | Master editable toggle |
| `editable_in` | `string[]` | Editing surfaces: `form`, `inline`, `bulk` |
| `editable_when.status_in` | `string[]` | Record statuses in which the field is editable |

```json
{ "editable": true, "editable_in": ["form"], "editable_when": { "status_in": ["DRAFT", "RETURNED"] } }
```

Also enforced server-side by `server/packages/services/records/routes/entity-mutation-guard.ts`.

---

### `lookup_config` â€” Lookup Behavior

Owner: `lookup` Â· Compile target: `client_stripped`

Controls static filters and dependent (cascading) lookups for `reference` and `enum` fields.

| Key | Type | Description |
|---|---|---|
| `filters` | `object` | Static filter applied to every lookup request: `{"is_active": true}` |
| `dependent_filter.source_field` | `string` | Field on the same record whose value drives the filter |
| `dependent_filter.target_field` | `string` | Field on the target entity to filter by |
| `dependent_filter.empty_behavior` | `string` | `none` (return nothing) Â· `all` (return all) when source is empty |
| `dependent_filter.through_entity` | `string` | Intermediate entity for a join-based dependent filter |
| `value_case` | `string` | `preserve` Â· `upper` Â· `lower` |
| `value_label_map` | `{[value]: label}` | Display label overrides for specific values |

**Deprecated aliases:** `depends_on` â†’ `dependent_filter`, `dependency` â†’ `dependent_filter`

> **Pairing rule:** every field with `dependent_filter` MUST declare an
> `on_source_change` rule in `defaults` covering the same `source_field`.
> CI-enforced by `server/scripts/verify-cascade-rule-coverage.ts`. See
> [`defaults`](#defaults--cascade-and-on_source_change) below.

---

### `defaults` â€” Cascade and `on_source_change`

Owner: `cascade` Â· Compile target: `client`

Drives the cascade system: parent-row inheritance (header â†’ line), same-row
field dependencies (`on_source_change`), and UI override-detection labels.
Consumed by `@athyper/cascade` in the form runtime and the BFF projection.

Full grammar: [docs/specs/entity_field_defaults.md](../specs/entity_field_defaults.md).

| Key | Type | Description |
|---|---|---|
| `default_value_source` | `object` | Parent-row default fill (kind: `parent_field` \| `tenant_config` \| `supplier_config` \| `static`) |
| `override_detection` | `object` | UI label config (`compare_to`, `label_when_inherited`, `label_when_overridden`) |
| `on_parent_change` | `string` | Parent-row change behavior: `preserve` Â· `prompt` Â· `inherit` Â· `recompute` |
| `on_source_change` | `array` | Same-row field-dependency rules (see below) |
| `ui_affordance` | `object` | `show_reset_to_default`, `show_inheritance_chip`, `chip_position` |

#### `on_source_change[]` â€” Same-row field dependency rules

| Key | Type | Description |
|---|---|---|
| `sources` | `string[]` | Source field names on the same row that trigger this rule |
| `action` | `string` | `clear` Â· `rederive` Â· `refilter` Â· `validate` Â· `warn` Â· `lock` |
| `layers` | `string[]` | One or more of `client_on_change`, `bff_on_load_hydrate`, `server_on_save` |
| `when` | `object` | Optional predicate: `source_changed`, `source_value_in`, `target_was_user_overridden`, `status_in` |
| `resolver` | `string` | Required when `action="rederive"` â€” typed code (see [resolver registry](../specs/source-change-resolver-registry.md)) |
| `mode` | `string` | For `rederive`: `if_empty_or_derived` (default) \| `always` |
| `message` | `string` | UI text for warn/error surfacing |

The owning `entity_field` row IS the target â€” there is no `target` key in
storage. The pure evaluator (`@athyper/cascade/source-change`) emits intents
with an explicit `target` for caller convenience.

**Action Ã— layer matrix** and **stale-submit behavior** are defined in
[entity_field_defaults.md Â§5â€“Â§6](../specs/entity_field_defaults.md). The
server enforces Â§6 deterministically â€” no config flags.

**Example (PI Remit-To address, clear-on-supplier-change):**

```jsonc
{
  "on_source_change": [
    {
      "sources": ["supplier_id"],
      "action":  "clear",
      "layers":  ["client_on_change", "server_on_save"],
      "message": "Cleared because supplier changed"
    }
  ]
}
```

**Example (rederive + warn-if-overridden pair for payment term):**

```jsonc
{
  "on_source_change": [
    {
      "sources":  ["supplier_id"],
      "action":   "rederive",
      "mode":     "if_empty_or_derived",
      "resolver": "supplier.default_payment_term",
      "layers":   ["client_on_change"]
    },
    {
      "sources": ["supplier_id"],
      "action":  "warn",
      "layers":  ["client_on_change"],
      "when":    { "target_was_user_overridden": true },
      "message": "Supplier changed â€” verify payment term"
    }
  ]
}
```

---

### `validation` â€” Scalar Validation Rules

Owner: `validation` Â· Compile target: `client`

| Key | Type | Description |
|---|---|---|
| `max_length` | `number` | Maximum character count for string fields |
| `min_length` | `number` | Minimum character count |
| `min_value` | `number` | Minimum numeric value |
| `max_value` | `number` | Maximum numeric value |
| `pattern` | `string` | Regex pattern the value must match |
| `allowed_values` | `any[]` | Whitelist of permitted values |
| `cross_field` | `object[]` | Cross-field validation rules (JSONLogic) |

---

### `constraints` â€” DB-Level Constraints

Owner: `validation` Â· Compile target: `client`

| Key | Type | Description |
|---|---|---|
| `max_length` | `number` | DB VARCHAR max length |
| `min_value` / `max_value` | `number` | CHECK constraint range |
| `pattern` | `string` | CHECK constraint regex |
| `unique` | `boolean` | UNIQUE constraint |
| `not_null` | `boolean` | NOT NULL constraint |
| `check` | `string` | Raw SQL CHECK expression |

---

### `default_value`

Owner: `value_semantics` Â· Compile target: `client`

Type-aware default value for new records. Can be any JSON value matching the field's `data_type`. Rendered by the edit form as the pre-filled value on new-record creation.

---

### `json_config` â€” JSON/JSONB Shape Hints

Used for `data_type = 'json'` or `'jsonb'` fields. Documents the expected shape for the JSON editor.

---

### `datetime_config` â€” Date/Time Display Config

Used for `data_type = 'date'`, `'datetime'`, or `'timestamptz'` fields. Controls timezone display, relative labels, calendar constraints.

---

### Collection Fields (cardinality = 'many')

| Column | Type | Notes |
|---|---|---|
| `child_entity_name` | `text` | `entity_code` of the child entity for inline collections |
| `child_fk_field` | `text` | FK field on the child entity pointing to this record |
| `collection_behavior` | `jsonb` | Collection display hints: `{display_mode: "table", can_create: true, can_delete: true}` |

---

## Runtime Field Contract â€” `MetaEntityField`

Produced at compile time and served from the descriptor cache.

```ts
{
  key:              string,       // Unique field identifier (= name)
  name:             string,       // Logical field name
  columnName:       string,       // Physical DB column name
  label:            string,       // Display label
  dataType:         string,       // See Field Data Types
  uiType?:          string,
  format?:          string,
  unit?:            string,
  cardinality?:     string,
  origin?:          string,
  groupKey?:        string,
  order:            number,
  isRequired:       boolean,
  isUnique:         boolean,
  isSearchable:     boolean,
  isFilterable:     boolean,
  isSortable:       boolean,
  isGroupable:      boolean,
  isAggregatable:   boolean,
  isPii?:           boolean,
  isReadOnly:       boolean,
  isComputed:       boolean,
  isWriteOnce:      boolean,
  enumDomainCode?:  string,
  referenceEntity?: string,
  childEntityName?: string,
  childFkField?:    string,
  lookupConfig?:    object,
  lookupProfile?:   object,
  referenceConfig?: object,
  filterConfig?:    object,
  optionSource?:    MetaEntityOptionSource,
  editor?:          MetaEntityFieldEditor,
  display?:         MetaEntityFieldDisplay,
  visibility?:      object,
  editability?:     object,
  validation?:      object,
  constraints?:     object,
  defaultValue?:    unknown,
}
```

### `optionSource` â€” Dynamic Option Resolution

Discriminated union on `kind`:

| Kind | When Used | Key Fields |
|---|---|---|
| `none` | No options | â€” |
| `static` | Inline options array | `options: [{value, label}]` |
| `lookup` | Lookup domain dropdown | `domainCode`, `valueField`, `ownershipMode` |
| `reference` | FK reference picker | `entity`, `valueField`, `labelField`, `scopeMode` |

### `editor` â€” Edit Control Config

```ts
{
  control: "text" | "textarea" | "number" | "checkbox" | "date" | "datetime"
         | "select" | "combobox" | "reference_picker" | "json",
  optionSource?: MetaEntityOptionSource,
  allowClear?: boolean,
  placeholder?: string,
}
```

### `display` â€” Read-Only Renderer Config

```ts
{
  renderer: "text" | "boolean" | "date" | "datetime" | "number"
           | "money" | "json" | "lookup_label" | "reference_label",
  fallback?: "blank" | "dash" | "raw_value",
  format?: "label" | "code_label" | "label_code" | "code",
  valueField?: string,
  labelField?: string,
}
```

---

## Table: `control.field_group`

Logical UI sections that group canonical fields into form panels. Renamed from `control.entity_field_group`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `group_key` | `text PK` | â€” | Format `^[a-z][a-z0-9_]*$` (e.g. `identity`, `financial`, `governance`) |
| `label` | `text NOT NULL` | â€” | Section heading |
| `description` | `text` | â€” | Admin description |
| `applies_to_classes` | `text[]` | `{}` | Which entity classes use this group |
| `sort_order` | `smallint` | `0` | Section order in the form |
| `columns` | `smallint` | `3` | Field grid column count: `1`, `2`, or `3` |
| `page_span` | `text` | `half` | Print mode: `half` (participates in left/right split) Â· `full` (spans the page) |

**Consumed by:** `FieldsRenderer` (form layout) and `EntityPrintTemplate` (print layout).

---

## Table: `control.field_group_member`

Assigns canonical fields (`entity_version_id IS NULL`) to field group sections.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `group_key` | `text NOT NULL` | FK to `control.field_group` |
| `entity_field_id` | `uuid NOT NULL` | FK to canonical `control.entity_field` row |
| `is_required` | `boolean` | Whether the field is required in this group context |
| `sort_order` | `smallint` | Sort order within the group |

**Unique:** `(group_key, entity_field_id)`

---

## Table: `control.entity_relation`

FK/join relationship declarations per entity version. Renamed from `association.relation`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid PK` | | |
| `tenant_id` | `uuid` | | `NULL` = platform-global |
| `entity_version_id` | `uuid NOT NULL` | | FK to the owning entity version |
| `name` | `text NOT NULL` | | Relation identifier (unique per version) |
| `relation_kind` | `text NOT NULL` | | `belongs_to` Â· `has_many` Â· `m2m` |
| `target_entity` | `text NOT NULL` | | `entity_code` of the related entity |
| `fk_field` | `text` | | FK column on this entity (for `belongs_to`) or on the target (for `has_many`) |
| `target_key` | `text NOT NULL` | `id` | Column on the target entity the FK points to |
| `on_delete` | `text NOT NULL` | `restrict` | `restrict` Â· `cascade` Â· `set_null` Â· `set_default` Â· `no_action` |
| `ui_behavior` | `jsonb` | `{}` | Runtime display hints: `{display_mode: "table", can_navigate: true}` |
| `created_at`, `created_by`, `updated_at`, `updated_by` | standard | |

**Unique:** `(entity_version_id, name)`

### Relation Kinds

| Kind | Description |
|---|---|
| `belongs_to` | Many-to-one: this entity holds the FK (e.g. `journal_line.journal_entry_id â†’ journal_entry`) |
| `has_many` | One-to-many: target entity holds the FK (e.g. `journal_entry â†’ journal_line`) |
| `m2m` | Many-to-many via a junction table |

---

## Table: `control.entity_policy`

Access, audit, and retention policy per entity (or entity version). Moved from `association.entity_policy`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid PK` | | |
| `tenant_id` | `uuid NOT NULL` | | |
| `entity_id` | `uuid NOT NULL` | | FK to `control.entity` |
| `entity_version_id` | `uuid` | `NULL` | `NULL` = applies to all versions |
| `access_mode` | `text NOT NULL` | `default_deny` | `default_deny` Â· `default_allow` Â· `explicit` |
| `company_scope_mode` | `text NOT NULL` | `none` | Row-scope axis: `none` Â· `single` Â· `subtree` Â· `full` |
| `audit_mode` | `text NOT NULL` | `enabled` | `enabled` Â· `disabled` Â· `sampling` |
| `retention_policy` | `jsonb` | `{}` | `{retention_days: 2555, legal_hold_eligible: true}` |
| `default_filters` | `jsonb` | `{}` | Default query filters applied to all reads: `{"is_active": true}` |
| `cache_flags` | `jsonb` | `{}` | Cache control hints: `{ttl_seconds: 300, vary_by_company: true}` |
| `field_scope_eval_order` | `text NOT NULL` | `row_first` | Row-field policy composition order (see below) |
| `extended_scope` | `jsonb` | `{}` | Additional scope axes: `{department_ids: [], project_ids: []}` |
| `created_at`, `created_by`, `updated_at`, `updated_by` | standard | |

**Unique:** `(tenant_id, entity_id, entity_version_id) NULLS NOT DISTINCT`

### Field Scope Evaluation Order

Controls composition when both row-scope (`company_scope_mode`) and field-security policies apply:

| Value | Behaviour |
|---|---|
| `row_first` | Row predicate filters the result set first, then field masking is applied to surviving rows |
| `field_first` | Field masking nulls columns first, then row predicate runs (use when masked fields drive row visibility) |
| `parallel` | Both predicates evaluated independently and ANDed (safe only when they operate on disjoint columns) |

---

## Table: `control.field_security_policy`

PII classification and field-level masking policies. Applied after row-level filtering.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid PK` | | |
| `tenant_id` | `uuid NOT NULL` | | |
| `entity_id` | `uuid NOT NULL` | | FK to `control.entity` |
| `field_path` | `text NOT NULL` | | Field name or JSON path (e.g. `tax_id`, `address.line1`) |
| `policy_type` | `text NOT NULL` | | `read` Â· `write` Â· `mask` Â· `redact` |
| `role_list` | `text[]` | `{}` | Roles exempt from masking |
| `abac_condition` | `jsonb` | | Attribute-based condition (JSONLogic) |
| `mask_strategy` | `text NOT NULL` | `null` | See below |
| `mask_config` | `jsonb` | `{}` | Strategy-specific config |
| `scope` | `text NOT NULL` | `global` | `global` Â· `module` Â· `tenant` |
| `scope_ref` | `text` | | Scope reference value |
| `priority` | `smallint` | `100` | Lower fires first when multiple policies match |
| `pii_classification` | `text` | | `none` Â· `quasi` Â· `direct` Â· `sensitive` Â· `special_category` |
| `privacy_metadata` | `jsonb` | `{}` | GDPR/regulatory metadata for compliance reporting |
| `version` | `integer` | `1` | Policy version for audit trail |
| `is_active` | `boolean` | `true` | Manual active flag |

### Mask Strategies

| Strategy | Behaviour |
|---|---|
| `null` | Return `NULL` for masked principals |
| `partial` | Return only last 4 characters (e.g. `****1234`) |
| `hash` | Return SHA-256 hash of the value |
| `encrypt` | Return AES-256 encrypted value |
| `tokenise` | Replace with a stable, consistent token |

---

## Table: `control.overlay`

Tenant customisation sets applied on top of a base entity version to produce a tenant-specific entity shape.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid PK` | | |
| `tenant_id` | `uuid NOT NULL` | | |
| `overlay_key` | `text NOT NULL` | | Stable identifier per tenant: `(tenant_id, overlay_key)` UNIQUE |
| `description` | `text` | | |
| `base_entity_id` | `uuid NOT NULL` | | FK to base `control.entity` |
| `base_version_id` | `uuid` | | Target base version (`NULL` = latest effective) |
| `priority` | `integer` | `100` | Stacking precedence when multiple overlays apply |
| `conflict_mode` | `text` | `fail` | `fail` Â· `overwrite` Â· `merge` |
| `version` | `integer` | `1` | Internal version counter |
| `is_active` | `boolean` | `true` | |

### Table: `control.overlay_change`

Individual operations within an overlay, applied in `change_order` sequence.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `overlay_id` | `uuid NOT NULL` | FK to `control.overlay` |
| `change_order` | `integer NOT NULL` | Deterministic application order; UNIQUE with `overlay_id` |
| `kind` | `text NOT NULL` | Operation kind (see below) |
| `path` | `text NOT NULL` | Field name or JSON path being modified |
| `value` | `jsonb` | New value (object); `NULL` for `removeField` |

**Change kinds:**

| Kind | Description |
|---|---|
| `addField` | Add a new field to the entity shape |
| `removeField` | Remove an existing field |
| `modifyField` | Update field properties (label, validation, flags) |
| `tweakPolicy` | Modify entity or field policy config |
| `overrideValidation` | Override validation rules for a field |
| `overrideUi` | Override UI hints (visibility, editability, placeholder) |
| `addIndex` | Add a new composite index |
| `removeIndex` | Remove an existing index |
| `tweakRelation` | Modify a relation definition |

---

## Property Contract Registry

Every JSONB property on `control.entity` and `control.entity_field` is governed by a `PropertyContractDefinition`:

```ts
interface PropertyContractDefinition {
  property:         string;        // JSONB column name
  scope:            "entity" | "entity_field";
  owner:            "presentation" | "authorization" | "identity"
                  | "search" | "governance" | "validation"
                  | "value_semantics" | "lookup" | "server_only";
  phase:            "active" | "controlled" | "grandfathered"
                  | "deprecated" | "reserved" | "server_only";
  compileTarget:    "client" | "client_stripped" | "server_only" | "omit";
  unknownKeyPolicy: "reject" | "warn" | "allow";
  allowedKeys:      string[];
  aliases:          string[];
  deprecatedKeys:   { key, reason, migratesTo, phase }[];
  uiControl:        UiControl;
  uiLabel:          string;
  uiDescription:    string;
  uiTab:            string;
  migration?:       { target_property, key_mappings, phase, blocking, notes };
  runtimeConsumers: string[];
}
```

`compileTarget` determines what is included in the compiled descriptor served to clients:
- `client` â€” included in full
- `client_stripped` â€” included but sensitive keys stripped before serialization
- `server_only` â€” never sent to client
- `omit` â€” not compiled into the descriptor

---

## Seed Files

| Seed File | Coverage |
|---|---|
| `003_control/040_control_entity_contract.sql` | All ~111 system entity registrations |
| `003_control/042_control_entity_field_contract.sql` | Schema-derived field registrations + curated overrides |
| `003_control/042c_entity_field_data_type_fix.sql` | Data type corrections |
| `003_control/045_control_entity_field_data_type_normalization_contract.sql` | Normalization pass |
| `003_control/049_entity_flow_field.sql` | Flow engine field registrations |
| `003_control/010_control_entity_class_profile_contract.sql` | 11 class profiles with `field_flag_rules` |

---

## Related Docs

- [Overview](./overview.md)
- [Entity Definition](./entity.md)
- [Lifecycle Engine](./lifecycle.md)
- [Policy Engine](./policy.md)
- [Entity Operations](./entity-operations.md)


