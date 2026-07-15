# Purchase Order — Control-Plane Wiring

End-to-end reference for how `purchase_order` is stitched together across the
`control.*` metadata tables. Companion to
[docs/architecture/p2p.md](./p2p.md); the entities-and-columns semantics live
in [docs/meta-entity/](../meta-entity/).

Whenever a `control.*` seed for PO changes, update this doc in the same PR.

---

## 1. Big-picture chain

```
                    ┌─────────────────────────────────────────────┐
                    │  control.entity                             │
                    │    entity_code = 'purchase_order'           │
                    │    feature_flags {                          │
                    │      is_approvable, has_workflow,           │
                    │      write_facade: 'PurchaseOrderFacade',   │
                    │      backing_source: 'commitment',          │
                    │      trigger_managed_children: [ … ]        │
                    │    }                                        │
                    └───┬───────────────────────────────┬─────────┘
              entity_id │                   entity_name │ (text join)
                        ▼                               │
        ┌──────────────────────────┐                    │
        │  control.entity_version  │                    │
        └───────┬──────────────────┘                    │
                ▼                                       │
   ┌──────────────────────────────────┐                 │
   │  control.entity_field            │  editability,   │
   │    defaults / visibility /       │  cascade,       │
   │    lookup_config                 │  lock_when      │
   └──────────────────────────────────┘                 │
                                                        │
     ┌──────────────────────────────────────────────────┴──────────┐
     ▼                                                             ▼
┌────────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────────┐
│ control.entity_        │   │ control.entity_action_    │   │ control.entity_         │
│ operation              │   │ rule                      │   │ lifecycle_state_mask    │
│   (op dispatch)        │   │   (affordance gate 1)     │   │   (affordance gate 2)   │
└────────────────────────┘   └───────────────────────────┘   └─────────────────────────┘

     ┌───────────────────────────────────────────────────────────┐
     ▼                                                           ▼
┌────────────────────────────┐                    ┌─────────────────────────────┐
│ control.entity_lifecycle   │  ─── binds ───▶    │ control.lifecycle           │
│   entity_name='purchase_   │                    │   code = 'commitment'       │
│   order'                   │                    │   entity_types = [          │
│   lifecycle_id (commitment)│                    │     'commitment',           │
│                            │                    │     'purchase_order'        │
└────────────────────────────┘                    └───┬─────────────────────────┘
                                                     │ lifecycle_id
                                                     ▼
                                       ┌──────────────────────────────┐
                                       │  control.lifecycle_state     │
                                       │    state_flags { is_         │
                                       │    transactable_source, … }  │
                                       └───┬──────────────────────────┘
                                           │ from_state_id / to_state_id
                                           ▼
                                       ┌──────────────────────────────┐
                                       │  control.lifecycle_          │
                                       │  transition                  │
                                       │    operation_code (verb)     │
                                       └───┬──────────────────────────┘
                                           │
                              ┌────────────┴────────────┐
                              ▼                         ▼
             ┌───────────────────────────┐   ┌─────────────────────────────┐
             │ control.lifecycle_        │   │ control.lifecycle_          │
             │ transition_hook           │   │ transition_gate             │
             │   timing (before|after)   │   │   required_operations,      │
             │   action → hook_action_   │   │   workflow_definition_id,   │
             │   registry.action_key     │   │   threshold_rules,          │
             │   contract_role,          │   │   policy_rule               │
             │   safety_level            │   └─────────────────────────────┘
             └───┬───────────────────────┘
                 │ action
                 ▼
             ┌────────────────────────────────────────┐
             │  control.hook_action_registry          │
             │    action_key (unique)                 │
             │    handler_type ∈ {built_in,           │
             │      emit_event, webhook, …}           │
             └────────────────────────────────────────┘
```

---

## 2. Row-by-row inventory

Every PO wiring row lives in a seed file under
`server/db/seed/platform/003_control/`.

| Table | Rows for `purchase_order` | Seed file | Notes |
|---|---:|---|---|
| `control.entity` | 1 | `040_control_entity_contract.sql:43` | `entity_code='purchase_order'`, `table_name='purchase_order'` (view over `document.commitment`), `feature_flags` sets `write_facade='PurchaseOrderFacade'`, `backing_source='commitment'`, `is_approvable=true`, `has_workflow=true`, `has_lines=true`, `auto_number=true` |
| `control.lifecycle` | 1 (bound) | `030_control_lifecycle_contract.sql:1687` | `code='commitment'`, `entity_types=['commitment','purchase_order']` |
| `control.lifecycle` (retired) | 1 | `030_control_lifecycle_contract.sql:1467, 1773` | Standalone `code='purchase_order'` lifecycle marked `is_active=false` with `config.retired_by='commitment'`. **States/transitions still exist** — see §5 gap #1 |
| `control.lifecycle_state` (commitment) | 10 | `030:1695-1738` | `draft, pending_approval, approved, active, partially_fulfilled, fully_fulfilled, suspended, closed, expired, cancelled` |
| `control.lifecycle_transition` (commitment) | 18 | `030:1744-1770` | Includes the supplier-facing `approved -> active` transition through `PO.PLACE_ORDER` |
| `control.entity_lifecycle` | 1 | `045_control_entity_lifecycle_contract.sql:300-305` | Binds `entity_name='purchase_order'` → commitment lifecycle |
| `control.entity_field` | ~40 | `042c_commitment_contract.sql`, `042i_po_purchase_order_contract.sql` | Field editability, cascade defaults, visibility rules |
| `control.entity_operation` | **17** | `044_control_entity_operation_contract.sql:7293-7311` | Includes qualified `PO.PLACE_ORDER`, which dispatches to the generic lifecycle path as `place_order` |
| `control.entity_action_rule` | 66 | `046j_po_action_rule_contract.sql:22-106` | Affordance gate 1 — covers all 10 commitment-lifecycle states, including Place Order from approved |
| `control.entity_lifecycle_state_mask` | 10 | `046i_po_state_mask_contract.sql:23-74` | Affordance gate 2 — `can_edit`/`can_delete` per state |
| `control.lifecycle_transition_hook` | activity and notification on every commitment transition; material snapshots | `072p_p2p_runtime_contract.sql:916-1080` | PO activity, snapshot, and notification hooks resolve through the active commitment lifecycle; stale copies on the retired PO lifecycle are deactivated idempotently. |
| `control.hook_action_registry` | 3 (referenced) | `070_control_hook_action_registry_contract.sql:182, 191, 294` | `activity_log.write` (built_in / contract / required), `snapshot.capture` (built_in / contract / required), `notification.publish` (built_in / extension / narrowable) |
| `control.seed_contract_assertions` | 1 (PO-specific) | `100_control_seed_contract_assertions.sql:261-278` | Asserts PO binds only to `commitment` lifecycle, not any other |

---

## 3. Snapshot capture matrix

`072p_p2p_runtime_contract.sql:975-978` declares the PO-specific
`snapshot.capture` transitions:

| from_state | to_state | gate_event_kind |
|---|---|---|
| `draft` | `pending_approval` | `authoring_lock` |
| `pending_approval` | `approved` | `commitment` |
| `approved` | `active` | `commitment` |

The lifecycle lookup key for these rows is `commitment`; the runtime dispatcher
still supplies `sourceDocType='purchase_order'`, so snapshots retain the PO
entity identity. The `approved → active` snapshot records the exact commercial
basis placed with the supplier.

---

## 4. Join keys (this is the important table)

| Linkage | Column path | Kind |
|---|---|---|
| Entity → hooks via lifecycle | `control.entity.entity_code` → `control.lifecycle.entity_types[]` | Text array containment, **not** a FK — validated by seed assertions |
| Entity → operations / action_rules / state_masks | `entity_name` / `entity_code` (text) | Text join, **not** a FK — cross-checked by C-series assertions in `042c_commitment_contract.sql` |
| Entity → fields | `control.entity.id` → `entity_version.entity_id` → `entity_field.entity_version_id` | Proper FK chain |
| Entity → lifecycle | `control.entity_lifecycle.entity_name` (text) + `.lifecycle_id` (FK) | Hybrid |
| Hook action vocabulary | `lifecycle_transition_hook.action` → `hook_action_registry.action_key` | Text join — **no FK, no trigger** (see §5 gap #2) |
| Transition → hook | `lifecycle_transition_hook.transition_id` → `lifecycle_transition.id` | Proper FK (`lth_transition_fk`, `03_constraints.sql:158`) |
| State → transition | `lifecycle_transition.from_state_id` / `to_state_id` → `lifecycle_state.id` | Proper FK |

---

## 5. Known gaps (as of 2026-07-13)

### Gap 1 — PO hook migration to commitment lifecycle  🟢 **RESOLVED**

`072p_p2p_runtime_contract.sql` scopes PO hooks to the active aggregate
lifecycle:

```sql
WHERE lc.code IN (
    'purchase_requisition', 'purchase_order_confirmation', 'delivery_note',
    'receipt', 'service_sheet', 'purchase_invoice', 'commitment'
)
```

Activity, snapshot, and notification hooks now resolve through the active
`commitment` lifecycle. The retired standalone PO copies are deactivated.
`PO.PLACE_ORDER` connects the approved affordance to the `approved → active`
transition, and seed assertions verify the operation, transition, action rule,
and canonical hooks as one contract.

### Gap 2 — `trg_lth_action_registry_guard` trigger doesn't exist  🔴 **CRITICAL**

The comment on `control.lifecycle_transition_hook.action`
(`server/db/ddl/control/01_tables.sql:805-807`) and the load-order note in
`072p_p2p_runtime_contract.sql:900-902` both claim:

> References `control.hook_action_registry.action_key`. Validated by
> `trg_lth_action_registry_guard` trigger on INSERT/UPDATE.

Grepping the entire repo (`server/db/**`, all DDL and seed) returns **zero**
`CREATE TRIGGER` statements matching that name. The `action` column is a bare
`text NOT NULL` with a single blank-check constraint (`lth_action_chk`).
There is also no foreign key from `lifecycle_transition_hook.action` to
`hook_action_registry.action_key`.

**Fix**: either add the trigger in `server/db/ddl/control/06_triggers.sql`
(lookup `NEW.action` in `control.hook_action_registry` and raise on miss), or
add a plain FK from `lifecycle_transition_hook.action` to
`hook_action_registry.action_key` (since `action_key` is unique). Prefer the
FK — cheaper and deterministic.

### Gap 3 — Facade only implements `create`  🟡

`server/packages/services/records/routes/write-facade.registry.ts:40-44`
registers `PurchaseOrderFacade` with a `create` action only.
`server/packages/services/business/p2p/purchase_order/purchase-order-facade.service.ts`
defines the `PurchaseOrderFacadeOutcome` and `createPurchaseOrderViaFacade`
but no `update`/`submit`/`approve`/etc. paths.

The `write_facade` feature-flag in `control.entity` reads as though the
facade owns all writes, but today the generic dispatcher still handles every
non-create operation. If the intent is facade-owned writes, extend the
registry and add facade methods. If not, document the create-only scope in
the entity registration comment.

### Gap 4 — Diagram row counts drift  🟢 (informational)

The original diagram claimed "~14 entity_operation rows" and "~64
entity_action_rule rows". The DDL now seeds **17** and **66** respectively.
The extras are the P2P chain operations (`create_receipt`,
`create_service_sheet`, `add_line`, `edit_line`, `close_line`, `cancel_line`,
`revise`) plus `PO.PLACE_ORDER`, added after the diagram was drafted. Not a bug — update the
diagram.

---

## 6. Runtime request flow (unchanged from the diagram)

`POST /records/purchase_order/:id/op/submit`:

1. Records route resolves `control.entity` by `entity_code='purchase_order'`.
2. Finds the operation via `control.entity_operation` on
   `entity_name='purchase_order' AND permission_code='submit'`.
3. Resolves the lifecycle via `control.entity_lifecycle` →
   `control.lifecycle` with `code='commitment'`.
4. Runs the state-machine step through `control.lifecycle_transition`
   (from=`draft`, to=`pending_approval`).
5. Evaluates the gate at `control.lifecycle_transition_gate` —
   `required_operations`, `conditions`, `threshold_rules`.
6. Fires `before` hooks in `control.lifecycle_transition_hook` ordered by
   `sort_order`.
7. Applies the state change.
8. Fires `after` hooks — `activity_log.write` → `log.activity_log`,
   `notification.publish` → `event.outbox`, `snapshot.capture` per matrix.
9. Client `useDocumentAffordance` re-reads `entity_action_rule` +
   `entity_lifecycle_state_mask` for the new status to refresh buttons.

Step 8 is where gap #1 bites — with today's seed, none of the after-hooks
resolve for PO because they were attached to the wrong lifecycle.

Every hook definition lives in `control.*` tables; nothing is hard-coded in
application code except the generic dispatcher that reads these tables and
executes them.
