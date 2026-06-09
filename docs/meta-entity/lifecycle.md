# Lifecycle Engine

The lifecycle engine governs the state machine of every entity in Athyper. All definitions live in the `control` schema. Runtime evaluation is performed by `@athyper/svc-records` via `lifecycle.route.ts`.

---

## Table Reference

### `control.lifecycle`

Root definition. Platform-global (tenant_id = NULL) or tenant-custom.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `code` | `text` | Unique per tenant (UNIQUE (tenant_id, code) NULLS NOT DISTINCT) |
| `name` | `text` | Display label |
| `description` | `text` | |
| `version_no` | `int` | Incremented on every structural change |
| `is_active` | `bool` | Manual flag; does NOT auto-reflect child state |
| `definition_hash` | `text` | SHA-256 hex of the compiled definition; nulled by trigger when any child (state/transition) changes |
| `config` | `jsonb` | `{ui_color, icon_key, entity_types[], initial_state_code, allow_parallel_instances}` |

**Seeded platform lifecycles (30_lifecycle.sql):**

| Code | Description |
|---|---|
| `lc_active_inactive` | Simple 2-state: Active ↔ Inactive |
| `lc_active_inactive_archived` | 3-state: Active → Inactive → Archived |
| `lc_draft_submitted_approved` | Standard approval: Draft → Submitted → Approved / Rejected |
| `lc_draft_posted` | Finance: Draft → Posted (immutable after posting) |
| `lc_draft_submitted_approved_closed` | Full AP/AR cycle |
| `lc_expedited_approval` | Fast-track: Pending → Approved |
| `lc_pending_fulfilled_cancelled` | Fulfilment lifecycle |
| `lc_open_in_progress_closed` | Support / task lifecycle |
| `lc_scheduled_running_completed` | Job / batch lifecycle |
| `lc_import_staged_validated_applied` | Import execution lifecycle |
| `lc_draft_active` | Minimal: Draft → Active |
| `lc_content_draft_published` | CMS: Draft → Review → Published → Archived |
| `lc_workflow_pending_resolved` | Workflow item lifecycle |
| `lc_open_closed` | Binary open/closed |
| ... | (21 total) |

---

### `control.lifecycle_state`

Each state belongs to exactly one lifecycle.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `lifecycle_id` | `uuid FK` | → `control.lifecycle` |
| `tenant_id` | `uuid` | Mirrors parent lifecycle tenant_id |
| `code` | `text` | Unique within lifecycle (UNIQUE lifecycle_id, code) |
| `name` | `text` | Display label |
| `description` | `text` | |
| `is_initial` | `bool` | Trigger enforces exactly ONE initial state per lifecycle |
| `is_terminal` | `bool` | `guard_terminal_immutability()` trigger blocks field edits once terminal |
| `sort_order` | `smallint` | UI display order |
| `config` | `jsonb` | `{ui_color, icon_key, sla_minutes, require_reason_on_entry}` |

**Constraints:**
- A DB trigger prevents having more than one `is_initial = true` per lifecycle.
- Once a record's lifecycle state is `is_terminal = true`, a DB-level guard blocks any field update on the entity (other than admin override operations).

---

### `control.lifecycle_transition`

Defines the allowed edges in the state machine.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `lifecycle_id` | `uuid FK` | |
| `tenant_id` | `uuid` | |
| `from_state_id` | `uuid FK` | → `lifecycle_state`; must differ from `to_state_id` (no self-loops) |
| `to_state_id` | `uuid FK` | → `lifecycle_state` |
| `operation_code` | `text` | FK → `shared.permission.code`; this permission is checked at authz before the transition is allowed |
| `is_active` | `bool` | Soft-disable a transition without deleting it |
| `config` | `jsonb` | `{require_comment, notify_on_transition, min_time_in_state_minutes}` |

**Unique:** `(lifecycle_id, from_state_id, to_state_id)`

---

### `control.lifecycle_transition_gate`

Optional guards that sit in front of a transition. A gate can require a workflow to be completed before the transition fires.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `transition_id` | `uuid FK` | → `control.lifecycle_transition` |
| `tenant_id` | `uuid` | |
| `gate_type` | `text` | `policy` / `workflow` / `script` |
| `workflow_definition_id` | `uuid FK` | When set, the Workflow Engine evaluates + creates a request; transition is deferred until the request resolves `approved` |
| `policy_id` | `uuid FK` | When set, the Policy Engine evaluates; `deny` blocks the transition |
| `conditions` | `jsonb` | JSONLogic — gate only activates when this expression is true |
| `priority` | `smallint` | Evaluation order when multiple gates exist for a transition |

---

### `control.entity_lifecycle`

Binds lifecycle definitions to entity types. Supports conditional binding and priority-based resolution.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `entity_name` | `text` | FK to entity registry (e.g. `journal_entry`, `supplier`) |
| `lifecycle_id` | `uuid FK` | → `control.lifecycle` |
| `conditions` | `jsonb` | JSONLogic; NULL = always applies |
| `priority` | `smallint` | Lower number = evaluated first; first match wins |

**Unique:** `(tenant_id, entity_name, lifecycle_id) NULLS NOT DISTINCT`

---

## Runtime API

**Route:** `GET /api/records/:entity/:id/lifecycle`

**Service:** `@athyper/svc-records / lifecycle.route.ts`

**Response shape:**
```json
{
  "lifecycle_code": "lc_draft_submitted_approved",
  "current_state": { "code": "submitted", "name": "Submitted", "is_terminal": false },
  "states": [ { "code": "draft", "is_initial": true }, ... ],
  "terminal_states": ["rejected", "approved"],
  "transitions": [
    {
      "from": "submitted",
      "to": "approved",
      "operation_code": "JOURNAL_ENTRY.APPROVE",
      "config": { "require_comment": false }
    }
  ],
  "steps": [ /* ordered history of state changes */ ]
}
```

---

## Lifecycle Resolution Logic

At runtime, when the engine needs the lifecycle for a record:

1. Query `control.entity_lifecycle` WHERE `entity_name = :entity` AND (`tenant_id = :tenantId` OR `tenant_id IS NULL`)
2. Filter rows where `conditions IS NULL` OR JSONLogic evaluates to `true` against the record payload
3. Order by `priority ASC`, take first match
4. Load the resolved `lifecycle_id` → fetch states and transitions

**Tenant override:** A tenant binding (`tenant_id IS NOT NULL`) always wins over a platform-global binding for the same entity, regardless of priority.

---

## State Change Execution Flow

```
Actor calls POST /api/records/:entity/:id/action/:operation_code
        │
        ▼
1. Resolve active lifecycle for the record
2. Find transition WHERE from_state = current_state AND operation_code = :op
3. Check transition.is_active = true
4. Evaluate transition gates (policy / workflow)
        │
        ├── Gate type = workflow → create workflow_request (deferred transition)
        └── Gate type = policy → evaluate; deny → 422 Forbidden
5. Check shared.permission (authz) for operation_code
6. Check transition.config.min_time_in_state_minutes
7. Insert log.activity_log entry
8. UPDATE entity SET status = to_state.code
9. Emit outbox event (topic = lifecycle)
```

---

## Terminal State Immutability

A DB trigger (`guard_terminal_immutability`) fires BEFORE UPDATE on all DOCUMENT-class tables. If the current row's lifecycle state is `is_terminal = true`, the trigger raises an exception unless the operation carries an admin override context flag in the session variable `app.override_terminal_guard`.

This means: once a `journal_entry` is `posted`, no field can be changed without an explicit admin override — not even by a background worker.

---

## Related Docs

- [Overview](./overview.md)
- [Workflow Engine](./workflow.md)
- [Policy Engine](./policy.md)
- [Entity Operations](./entity-operations.md)
