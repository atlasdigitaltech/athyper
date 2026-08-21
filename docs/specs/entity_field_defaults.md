# `control.entity_field.defaults` — Consolidated Spec

**Version:** v1.0 (locked) · **Date:** 2026-06-28
**Scope:** Full JSONB grammar for `control.entity_field.defaults`. Single source of truth for the metadata-driven cascade system.
**Status:** Architectural lock. Implementations: `@athyper/cascade` package + `server/packages/services/records/source-change-validation.ts` + `apps/neon/app/api/runtime/v1/resolvers/[code]/route.ts`.

This spec consolidates two cascade concerns that share one storage column:

| Concern | Block | Direction | Trigger |
|---|---|---|---|
| Parent-row inheritance | `default_value_source`, `override_detection`, `on_parent_change`, `ui_affordance` | Header → Line (cross-row) | Line create / parent edit |
| Same-row field dependency | `on_source_change` | Source field → Target field (same row) | Source field change in edit session |

Both blocks live side-by-side on the **target** `entity_field` row.

---

## 1. Full storage grammar

```jsonc
{
  // ── Parent-row inheritance (existing) ────────────────────────────────────
  "default_value_source": {
    "kind": "parent_field" | "tenant_config" | "supplier_config" | "static",
    "parent_entity": "<entity_code>",
    "parent_field":  "<field_name>",
    "static_value":  <any>,
    "config_key":    "<dotted.path>",
    "apply_on":      ["create" | "reset"]
  },
  "override_detection": {
    "compare_to":                "parent.<field>",
    "label_when_inherited":      "<text>",
    "label_when_overridden":     "<text>",
    "label_when_inherited_null": "<text>"
  } | null,
  "on_parent_change": "preserve" | "prompt" | "inherit" | "recompute",
  "ui_affordance": {
    "show_reset_to_default": <boolean>,
    "show_inheritance_chip": <boolean>,
    "chip_position":         "field_label" | "field_value" | "none"
  },

  // ── Same-row field dependency (NEW) ──────────────────────────────────────
  "on_source_change": [
    {
      "sources":  ["<field_name>", ...],
      "action":   "clear" | "rederive" | "refilter" | "validate" | "warn" | "lock",
      "layers":   ["client_on_change" | "bff_on_load_hydrate" | "server_on_save", ...],
      "when":     { "source_changed": <bool>, "source_value_in": [...], ... },
      "resolver": "<resolver_code>",                  // when action="rederive"
      "mode":     "always" | "if_empty_or_derived",   // when action="rederive"
      "message":  "<UI text>"
    }
  ]
}
```

---

## 2. Target ownership rule (locked)

The owning `entity_field` row IS the target.

- In **storage**, rules live on the target field's `defaults.on_source_change`. The JSON does not carry a `target` key (it would always equal the owning field).
- In **evaluator output**, every emitted intent carries `target` explicitly for debugging / CI / server error payloads.

```ts
interface SourceChangeIntent {
  target: string;       // ALWAYS present in output
  sources: string[];
  action: OnSourceChangeAction;
  reason: "source_changed" | "source_value_blank" | "target_stale" | "target_locked";
  resolver?: string;
  mode?: RederiveMode;
  message?: string;
}
```

---

## 3. Action vocabulary

| Action | Effect | Mutates value? | Notes |
|---|---|---|---|
| `clear` | Set target to `null` | Yes | Immediate on client; conditional on server (§5) |
| `rederive` | Run resolver → set target | Yes | Honors `mode` (§4) |
| `refilter` | Validate target still passes `dependent_filter`; clear if not | Conditional | Bridges to `lookup_config.dependent_filter` |
| `validate` | Mark invalid; never mutate | No | Always 422 on server save |
| `warn` | Mark "needs review"; never mutate | No | Client + BFF only; server ignores |
| `lock` | Make target read-only | No | + 422 on server if target submitted |

---

## 4. Rederive provenance & `mode`

Client tracks per-field provenance:

```ts
type FieldProvenance = "unset" | "user_input" | "derived" | "loaded";
```

| State | Set when |
|---|---|
| `unset` | Initial load, no value present |
| `loaded` | Initial load, value present from DB |
| `user_input` | User typed/selected in this session |
| `derived` | A `rederive` rule set the value in this session |

Modes:

| Mode | Behavior |
|---|---|
| `if_empty_or_derived` (default) | Rederive only when current provenance ∈ {`unset`, `derived`} or current value is null |
| `always` | Rederive regardless of provenance — use sparingly |

**Server has no provenance.** Server-side `rederive`:
- If target is null/omitted in PATCH → fill via resolver.
- If target is in PATCH with a value → honor user submission as-is.

**Companion `warn` rule pattern.** When a rederive uses `if_empty_or_derived` and the source changes while target is `user_input`, the recommended pattern is a second rule:

```jsonc
[
  { "action": "rederive", "mode": "if_empty_or_derived", "resolver": "...", "sources": ["supplier_id"] },
  { "action": "warn", "sources": ["supplier_id"], "when": { "target_was_user_overridden": true } }
]
```

---

## 5. Action × Layer matrix

| Action | client_on_change | bff_on_load_hydrate | server_on_save |
|---|---|---|---|
| `clear` | Immediate (target → null) | n/a | See §6 |
| `rederive` | Resolver call, honor mode | n/a | Fill only when target null/omitted |
| `refilter` | Re-validate; clear if invalid | Flag as stale; surface disabled | 422 unless target null/omitted |
| `validate` | Set `fieldErrors[target]` | Flag stale in `_dependency_warnings` | Always 422 |
| `warn` | Set `fieldWarnings[target]` | Flag in `_dependency_warnings` | Ignored |
| `lock` | Render read-only | Render read-only | 422 if target changed |

A rule's `layers` array MUST contain at least one layer. Rules without `client_on_change` will not run in the form runtime. Rules without `server_on_save` will not run in PATCH validation.

---

## 6. Server stale-submit behavior (deterministic, no flags)

| Scenario | Action | Server behavior |
|---|---|---|
| Source changes; target NOT in payload, current row has stale target | `clear` | Auto-clear. 200 + `_meta.cleared_fields` |
| Source changes; target IN payload with stale value | `clear` | **422 `FIELD_DEPENDENCY_STALE`** |
| Source changes; target IN payload with valid value | `clear` | Accept |
| Source changes; target unset | `rederive` | Fill via resolver. 200 + `_meta.derived_fields` |
| Source changes; target IN payload (any value) | `rederive` | Honor submission |
| Target fails `dependent_filter` post-merge | `refilter` | If target IN payload: **422 `FIELD_DEPENDENCY_REFILTER_FAIL`**; else auto-clear |
| Any | `validate` | **422 `FIELD_DEPENDENCY_INVALID`** |
| Source matches lock-trigger AND target in payload | `lock` | **422 `FIELD_LOCKED`** |
| Any | `warn` | Ignored on server |

Error payload schema:

```jsonc
{
  "error": "FIELD_DEPENDENCY_STALE" | "FIELD_DEPENDENCY_REFILTER_FAIL"
         | "FIELD_DEPENDENCY_INVALID" | "FIELD_LOCKED",
  "fields": {
    "<target>": {
      "action":  "<action>",
      "sources": ["<source>", ...],
      "reason":  "<reason>",
      "message": "<text>"
    }
  }
}
```

---

## 7. `when` predicate vocabulary

```ts
interface OnSourceChangeWhen {
  source_changed?:             boolean;     // source new !== old
  source_value_in?:            unknown[] | null;
  source_value_not_in?:        unknown[];
  target_was_user_overridden?: boolean;     // client only; uses provenance
  status_in?:                  string[];    // gate on row.status
}
```

Empty `when` ≡ `{ source_changed: true }` (the most common case).

`target_was_user_overridden` is silently ignored on server (no provenance).

---

## 8. Cycle rules (CI-enforced)

1. Build directed graph per entity: edge `target → source` for every source in every rule.
2. **No cycle allowed** in mutation-class rules (`clear`, `rederive`, `refilter`, `lock`).
3. **`warn` and `validate` rules are exempt** from cycle constraints (they read but don't mutate).
4. **Same-pass single trigger.** Derived outputs of one evaluation pass do NOT re-enter the rule queue. The evaluator emits intents based on the inbound `changedFields` set only.

Enforced by `server/scripts/verify-cascade-rule-coverage.ts` (Phase 7 extension).

---

## 9. Pairing with `lookup_config.dependent_filter`

`dependent_filter` answers "which options are available." `on_source_change` answers "what happens to the currently selected value." CI enforces a **pairing rule**:

For every `entity_field` row with `lookup_config->'dependent_filter'` IS NOT NULL, there MUST be an `on_source_change` rule whose `sources` includes the `dependent_filter.source_field`. Otherwise stale-value behavior is undeclared and the verifier fails.

---

## 10. Compiler & runtime delivery

- The metadata compiler ([`server/packages/services/metadata/src/entity-compiler.service.ts`]) projects the full `defaults` JSONB onto `MetaEntityField.defaults` so it reaches the runtime descriptor.
- Runtime consumers (`runtime-canvas`, `content-ui/object-page`) read `defaults` per field and pass them into `evaluateSourceChange` (from `@athyper/cascade`).

---

## 11. Reserved fields & forward compatibility

The following JSONB keys are reserved for future use. Implementations MUST ignore unknown keys (forward-compatible):

| Key | Reserved for |
|---|---|
| `on_source_change[].priority` | Rule ordering when multiple rules fire on the same change |
| `on_source_change[].debounce_ms` | Client throttling of resolver calls |
| `on_source_change[].condition` | Generalised JsonLogic predicate (today's `when` is the narrow form) |

---

## 12. Related specs

- [purchase_invoice_field_design.md §4](./purchase_invoice_field_design.md) — original parent-row cascade spec; this doc supersedes the JSONB grammar section.
- [source-change-resolver-registry.md](./source-change-resolver-registry.md) — typed resolver code registry + security model.
