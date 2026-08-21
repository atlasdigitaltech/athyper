# Entity Flow Engine

Entity flows define the named, versioned intake experiences (forms / wizards) for entering or editing entity records. Each flow is bound to an `entity_version`, scoped by `trigger_context`, and composed of ordered steps — each step containing a set of fields with per-field rendering behavior.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.entity_flow` | Named, versioned intake experience bound to an entity_version |
| `control.entity_flow_step` | Ordered stages within a flow |
| `control.entity_flow_field` | Per-step, per-field rendering behavior |

---

## `control.entity_flow`

Root record for a named flow. `ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global; tenant row overrides for same `flow_code` |
| `entity_version_id` | `uuid NOT NULL` | FK → `control.entity_version` ON DELETE CASCADE |
| `flow_code` | `text NOT NULL` | Format: `^[a-z][a-z0-9_]*$` |
| `label` | `text NOT NULL` | Display name |
| `description` | `text` | |
| `icon_key` | `text` | Icon from `@athyper/icons` |
| `trigger_context` | `text NOT NULL` | When this flow is invoked (see below) |
| `is_default` | `bool NOT NULL DEFAULT false` | Exactly one active default per `(entity_version, trigger_context, tenant)` scope |
| `config` | `jsonb NOT NULL DEFAULT '{}'` | Cross-step concerns (see below) |
| `version_no` | `int NOT NULL DEFAULT 1` | `>= 1` |
| `status` | `text NOT NULL DEFAULT 'draft'` | `draft` / `active` / `superseded` / `archived` |
| `effective_from` | `timestamptz` | |
| `effective_to` | `timestamptz` | |
| `supersedes_flow_id` | `uuid` | FK → self; history chain when versioned |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, entity_version_id, flow_code, version_no) NULLS NOT DISTINCT`

### Trigger Contexts

| Value | Description |
|---|---|
| `new` | Creating a new record |
| `edit` | Editing an existing record |
| `approve` | Approval action intake |
| `duplicate` | Duplicating a record |
| `read_only` | View-only presentation |
| `clone` | Cloning to a new record |

### `config` JSONB

The `config` object carries cross-step concerns. Common keys:

| Key | Type | Description |
|---|---|---|
| `summary_panel` | `object` | Configuration for the sidebar summary panel shown alongside steps |
| `input_modes` | `string[]` | Supported edit modes for this flow |
| `dedup_index_binding` | `string` | Field path used for duplicate detection |
| `assist_rules` | `object[]` | Atlas AI assist rules scoped to this flow |
| `layout` | `object` | Overall layout options (sidebar position, step indicator style) |

---

## `control.entity_flow_step`

Ordered stages within a flow. Each step groups related fields for one screen/panel. `ARCHETYPE=A;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | |
| `flow_id` | `uuid NOT NULL` | FK → `control.entity_flow` ON DELETE CASCADE |
| `step_key` | `text NOT NULL` | Format: `^[a-z][a-z0-9_]*$`; unique within flow |
| `label` | `text NOT NULL` | Step title shown in the step indicator |
| `description` | `text` | |
| `icon_key` | `text` | |
| `sort_order` | `smallint NOT NULL` | Unique within flow (DEFERRABLE INITIALLY DEFERRED for reordering) |
| `skip_when` | `jsonb` | JSONLogic over the in-progress draft; step skipped when truthy |
| `advance_rule` | `jsonb NOT NULL DEFAULT '{}'` | Gates progression: `{required_fields: string[], predicate?: JSONLogic}` |
| `layout_hint` | `text NOT NULL DEFAULT 'two_column'` | `two_column` / `single_column` / `summary_side` / `line_editor` / `grid` / `card` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(flow_id, step_key)` and `(flow_id, sort_order)` (deferrable)

**Index:** `(flow_id, sort_order)` for ordered rendering

---

## `control.entity_flow_field`

Per-flow, per-step rendering behavior for a canonical field. `ARCHETYPE=A;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | |
| `flow_step_id` | `uuid NOT NULL` | FK → `control.entity_flow_step` ON DELETE CASCADE |
| `entity_field_id` | `uuid NOT NULL` | FK → `control.entity_field` ON DELETE CASCADE |
| `mode` | `text NOT NULL` | Render role (see below) |
| `derivation_mode` | `text` | `derived_locked` / `derived_overrideable` / `manual` — NULL for pure manual fields |
| `visible_when` | `jsonb` | JSONLogic over in-progress draft; NULL = always visible |
| `required_when` | `jsonb` | JSONLogic; NULL = use base field requirement |
| `default_source` | `text` | Where to pre-fill from (e.g. `user_profile.company_code_id`) |
| `derive_expression` | `text` | Formula/expression for derivation modes |
| `override_permission` | `text` | Permission code required to override a derived value; validated against `shared.permission` |
| `override_requires_note` | `bool NOT NULL DEFAULT false` | Requires a reason note when overriding |
| `summary_role` | `text` | How field appears in summary panels (see below) |
| `ui_variant` | `text` | Optional UI variant key (e.g. `compact`, `inline`) |
| `format` | `text` | Override display format string |
| `span` | `smallint NOT NULL DEFAULT 1` | Column span: `1`, `2`, or `3` |
| `help_text` | `text` | Tooltip / help content |
| `placeholder` | `text` | Input placeholder |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | Display order within step |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(flow_step_id, entity_field_id)`

**Indexes:**
- `(flow_step_id, sort_order)` — ordered rendering
- `(entity_field_id)` — reverse lookup of all flows using a field
- `(flow_step_id, mode, sort_order)` — mode-filtered rendering

### Mode Values

| Value | Description |
|---|---|
| `required` | Field is mandatory in this step |
| `editable` | Field is editable but optional |
| `readonly` | Displayed but not editable |
| `hidden` | Not rendered in this step |
| `summary_only` | Shown only in the summary panel, not the main form |
| `chip` | Rendered as a compact chip/badge (useful for status, amount) |

### Derivation Mode

Three-state model governing AI-assist and formula-derived fields:

| Value | Behavior |
|---|---|
| `derived_locked` | Derived by system; user cannot override |
| `derived_overrideable` | Derived but user can override with `override_permission` |
| `manual` | Standard user input; no derivation |

**Constraint:** When `derivation_mode` is `derived_locked` or `derived_overrideable`, `derive_expression` MUST be set. `override_permission` is only valid with `derived_overrideable`.

### Summary Role

| Value | Description |
|---|---|
| `total` | Primary total amount |
| `subtotal` | Subtotal row |
| `addition` | Additive line (e.g. fees) |
| `deduction` | Deductive line (e.g. discounts) |
| `line_badge` | Status badge in line view |
| `warning` | Highlighted warning value |
| `meta` | Metadata field in summary header |

---

## DB-Level Integrity Triggers

### `trg_flow_field_validate_perm`

Fires `BEFORE INSERT OR UPDATE OF override_permission` on `entity_flow_field`. Verifies that `override_permission` maps to an active `shared.permission.code`. Raises `foreign_key_violation` if not found.

### `trg_flow_field_one_writer`

Fires `BEFORE INSERT OR UPDATE` on `entity_flow_field`. Enforces that only **one step per flow** may hold `mode IN ('required', 'editable')` for a given field. Raises `unique_violation` if a duplicate write-capable binding exists elsewhere in the same flow. Use `readonly` or `chip` in other steps that need to display the field.

---

## Resolution at Runtime

When the canvas loads a flow:

1. Resolve active flow for `(entity_version_id, trigger_context, tenant_id)` — exact tenant match first, then platform default.
2. Load `entity_flow_step` rows ordered by `sort_order`.
3. For each step, load `entity_flow_field` rows ordered by `sort_order`.
4. Evaluate `skip_when` JSONLogic against current draft — skip hidden steps.
5. Evaluate `visible_when` / `required_when` against current draft — dynamic field visibility.
6. Derive values for `derivation_mode IN ('derived_locked', 'derived_overrideable')` fields using `derive_expression`.
7. Check `advance_rule.required_fields` before allowing step progression.

---

## Related Docs

- [Entity Definition](./entity.md)
- [Entity Field Definition](./entity-field.md)
- [Lifecycle Engine](./lifecycle.md)
- [Overview](./overview.md)
