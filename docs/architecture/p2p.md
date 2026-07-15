# P2P Architecture

Reference for the Procure-to-Pay subsystem: entity chain, lifecycle wiring,
hook contracts, snapshot semantics, idempotency, and posting flow.

This document captures the contracts that hold across the 7 P2P entities so
the runtime, services, and seeds remain coherent. Whenever you change one of
the surfaces below, update this doc in the same PR.

---

## 1. Entity chain

```
purchase_requisition
        â”‚
        â”‚ convert
        â–¼
commitment (purchase_order)  â† purchase_order_confirmation (supplier reply)
        â”‚
        â”‚ dispatch
        â–¼
delivery_note  â”€â”€â†’ receipt          â”€â”€ posts â”€â”€â†’ inventory + GR/IR accrual JE
                   service_sheet    â”€â”€ posts â”€â”€â†’ accrual JE (no inventory)
                       â”‚
                       â–¼
                 purchase_invoice  â”€â”€ posts â”€â”€â†’ AP JE + tax + commitment_fulfillment
                       â”‚
                       â–¼
                 payment_entry     â”€â”€ posts â”€â”€â†’ AP/Bank JE + payment allocation
```

Cross-cutting carriers:
- **`document.pricing_component`** â€” polymorphic line-level price components
- **`document.accounting_distribution`** â€” polymorphic line-level distribution splits
- **`document.schedule_line`** â€” polymorphic delivery / billing-milestone / release-window scheduling

---

## 2. Naming conventions (renames since the original draft)

| Old name | Current name | Why |
|----------|--------------|-----|
| `document.goods_receipt` | `document.receipt` | "Goods receipt" is the legacy SAP term; the unified table also carries asset receipts and is reused for any inbound receipt. |
| `document.goods_receipt_line` | `document.receipt_line` | Mirror the rename. FK column `goods_receipt_id` â†’ `receipt_id`. |
| `document.service_entry_sheet` | `document.service_sheet` | "Entry sheet" was redundant; `service_sheet` matches the natural-key column `service_sheet_number`. |
| `document.service_entry_sheet_line` | `document.service_sheet_line` | FK column `service_entry_sheet_id` â†’ `service_sheet_id`. |
| Polymorphic enum `GOODS_RECEIPT_LINE` | `RECEIPT_LINE` | Sealed enum on `accounting_distribution.source_doc_type`, `pricing_component.source_doc_type`. |
| Polymorphic enum `SERVICE_ENTRY_SHEET_LINE` | `SERVICE_SHEET_LINE` | Sealed enum mirror. |
| Lifecycle code `lc_goods_receipt` | `receipt` | The lifecycle code matches the entity_code directly (no `lc_` prefix for P2P documents). |
| Lifecycle code `lc_service_entry_sheet` | `service_sheet` | Same convention. |
| Constraint prefixes `gr_*` / `grl_*` | `rcp_*` / `rcpl_*` | DB constraint naming follows the new short code. |
| Constraint prefixes `ses_*` / `sesl_*` | `ssh_*` / `sshl_*` | Same convention. |
| `purchase_invoice_line.goods_receipt_line_id` | `purchase_invoice_line.receipt_line_id` | FK column rename. |
| `purchase_invoice_line.ses_line_id` | `purchase_invoice_line.service_sheet_line_id` | FK column rename. |

When grepping for legacy references, the only acceptable hits outside `docs/`
are intentional history comments such as `COMMENT ON TABLE document.receipt IS
'...formerly goods_receipt...'`. Anything else is a missed rename.

---

## 3. Hold Model A

**Single source of truth: `purchase_invoice.status = 'on_hold'`.** The legacy
`is_on_hold boolean` and `hold_reason text` columns have been removed.

Restoration state and the human-readable reason live in
`purchase_invoice.metadata.hold`:

```jsonc
{
  "hold": {
    "previous_status": "approved",    // status before hold; restored on release
    "reason":          "Awaiting procurement exception review",
    "held_at":         "2026-06-20T08:14:22Z",
    "held_by":         "<principal_uuid>",
    "released_at":     "2026-06-21T09:02:11Z",   // set on release
    "released_by":     "<principal_uuid>"        // set on release
  }
}
```

**Rules:**
1. Hold and release are NOT allowed from terminal statuses (`posted`,
   `fully_paid`, `reversed`, `cancelled`) â€” those need amend/reverse flows.
2. `placeInvoiceOnHold(...)` (single writer) sets `status='on_hold'` and
   stamps `metadata.hold.{previous_status, reason, held_at, held_by}` in the
   same UPDATE.
3. `releaseInvoiceHold(...)` restores `status = metadata.hold.previous_status`
   (falls back to `'draft'` if missing) and stamps `released_at` / `released_by`.
4. The API contract still accepts `hold_reason` in the request body â€” it is
   embedded in `metadata.hold.reason`. Don't rename the request field.

**Why a single source of truth:** the old dual-column model drifted (some
rows had `is_on_hold=true` with `status<>'on_hold'`, and vice versa).
Field-security policies, reporting queries, and grid filters all converge on
`status` now.

---

## 4. Universal columns

Every P2P header carries the same versioning + closure columns. Every P2P
line carries `row_version`.

### Headers (7 of them)

```sql
-- Versioning
row_version           bigint     NOT NULL DEFAULT 1,
version_number        int        NOT NULL DEFAULT 1,
previous_version_id   uuid,
is_current_version    boolean    NOT NULL DEFAULT true,
supersedes_at         timestamptz,

-- Closure
terminal_status       text,                                   -- CANCELED | REJECTED | NULL
status_source         text       NOT NULL DEFAULT 'manual',   -- manual | derived | system | terminal
```

Plus on `commitment` and `purchase_invoice`:

```sql
operational_closed_at  timestamptz,    -- fully received / fully delivered
financial_closed_at    timestamptz,    -- fully invoiced / fully paid
```

Plus on `commitment` only:

```sql
order_failure_kind     text,           -- retriable | permanent | NULL
```

### Lines

```sql
row_version  bigint NOT NULL DEFAULT 1,
```

### Rules

- **`terminal_status` is sticky.** Once set, a row cannot be re-derived back
  to an active state. Enforced by the planned `trg_terminal_sticky` trigger.
- **`is_current_version` is atomic.** Flipping requires both the new and old
  rows to be updated in a single statement. The planned
  `trg_supersede_atomic` trigger enforces this.
- **`row_version` enforces optimistic concurrency** on aggregate-root
  documents. Callers that hold a document edit lock must pass
  `expected_row_version` on save; mismatch â†’ 409. PI / PI line / AD already
  have `trg_*_row_version` triggers; the remaining 5 headers + lines acquire
  their triggers in Phase 2 tail.

### Closure semantics

`operational_closed_at` is stamped when receipts/service_sheets fully
consume the commitment (no remaining quantity to fulfill).

`financial_closed_at` is stamped when all linked invoices reach `fully_paid`
or `reversed` and no further payments are expected.

A commitment can be operationally closed but not financially closed (services
delivered but invoice not yet posted) or vice versa (invoice posted but
goods still in transit on a credit-then-receive flow).

---

## 5. `document.schedule_line` contract

Polymorphic schedule carrier â€” mirrors the `pricing_component` pattern.

### Source types

```
source_doc_type IN (PURCHASE_REQUISITION_LINE, COMMITMENT_LINE, PURCHASE_INVOICE_LINE)
```

Receipts and service_sheets do NOT own schedule_lines â€” schedules attach to
the authoring documents (PR / PO / PI) that drive fulfillment.

### Schedule kinds

```
schedule_kind IN (delivery, billing_milestone, release_window)
```

- `delivery` â€” physical or service delivery date (default for PR/PO)
- `billing_milestone` â€” invoice-issued-at date (used by milestone-billed POs)
- `release_window` â€” open window for blanket POs / framework agreements

### Writer contract

A single service â€”
`server/packages/services/business/p2p/schedule-line.service.ts` (Phase 2
tail) â€” owns all writes. No DB triggers create schedule_lines.

**Creation triggers** (calls from the writer service):

| Event | Action |
|-------|--------|
| PR line insert | 1 schedule_line, `kind='delivery'`, derived from `required_by_date` |
| Commitment line insert (post-PR conversion) | Copy from PR schedules, or buyer-authored if new PO |
| PI line insert (non-PO flow only) | Synthesize `kind='billing_milestone'` from invoice line date |

**Supersession** (`is_current_version = false` on the old row, new row with
`previous_version_id` pointing back):

| Event | Action |
|-------|--------|
| POC amendment accepted | Mark prior PO schedule_lines superseded; write new versions |
| PI amendment published | Same pattern on PI schedule_lines |

**Retirement** (`terminal_status='CANCELED'`, `is_current_version` stays
true on the retired row so historical reads still find it):

| Event | Action |
|-------|--------|
| PO cancel / short_close | Retire remaining open schedule_lines for the affected commitment lines |
| PI reverse | No retirement â€” history preserved |

### Read contract (PO approve dispatcher)

```sql
WHERE source_doc_type    = 'COMMITMENT_LINE'
  AND source_doc_id      = :commitment_id
  AND source_line_id     = :commitment_line_id
  AND is_current_version = true
  AND terminal_status    IS NULL
```

The PO-approve hook (`ledger.materialize_commitment_schedule`) iterates these
rows to write `ledger.commitment_schedule` and seed `commitment_fulfillment(0)`.

### Fulfillment cache

`fulfilled_quantity` is a trigger-synced cache. Source of truth is the sum of
linked downstream lines (`receipt_line.received_quantity` +
`service_sheet_line.quantity` + `purchase_invoice_line.quantity` filtered by
`source_doc_type + source_line_id`). The planned `trg_schedule_line_fulfilled`
trigger recomputes on downstream line insert/update.

`fulfillment_status` is derived from `fulfilled_quantity`:
- `open` â€” `fulfilled_quantity = 0`
- `partial` â€” `0 < fulfilled_quantity < scheduled_quantity`
- `fulfilled` â€” `fulfilled_quantity >= scheduled_quantity`
- `closed` â€” manually closed (e.g. short_close)
- `cancelled` â€” retired

---

## 6. `snapshot.document_snapshot` contract

Generic append-only snapshot of the full document graph at lifecycle gate
events. Powers point-in-time audit, "what did this PI look like when it was
approved?", amendment baselines, and tamper detection via hash chain.

### Schema highlights

```sql
entity_type             text,        -- 'purchase_invoice' | 'commitment' | ...
entity_id               uuid,
gate_event              text,        -- transition.event_code or 'manual'
gate_event_kind         text,        -- sealed enum (below)
activity_log_id         uuid,        -- linked log.activity_log row (no FK)
header_json             jsonb,
lines_json              jsonb,
components_json         jsonb,
distributions_json      jsonb,
schedules_json          jsonb,
related_json            jsonb,
payload_hash            text,        -- sha256 of canonical payload
previous_snapshot_id    uuid,
chain_seq               int
```

Partitioned by `captured_at` with a DEFAULT partition (mirrors
`log.activity_log`). Append-only via `trg_document_snapshot_immutable`.

### Capture matrix (when each transition fires `snapshot.capture`)

| Entity | Transition | `gate_event_kind` |
|--------|-----------|-------------------|
| PR | draft â†’ pending_approval | `authoring_lock` |
| PR | pending_approval â†’ approved | `commitment` |
| PR | approved â†’ partially_converted | `commitment` |
| PO | draft â†’ pending_approval | `authoring_lock` |
| PO | pending_approval â†’ approved | `commitment` |
| PO | approved â†’ sent_to_supplier | `commitment` |
| POC | received â†’ confirmed | `commitment` |
| POC | received â†’ changes_proposed | `amendment_baseline` |
| POC | changes_proposed â†’ changes_accepted | `amendment_baseline` |
| DN | in_transit â†’ arrived | `fulfillment` |
| receipt | approved â†’ posted | `financial_post` |
| receipt | posted â†’ reversed | `reversal` |
| service_sheet | draft â†’ pending_acceptance | `authoring_lock` |
| service_sheet | accepted â†’ pending_approval | `authoring_lock` |
| service_sheet | approved â†’ posted | `financial_post` |
| service_sheet | posted â†’ reversed | `reversal` |
| PI | draft â†’ pending_approval | `authoring_lock` |
| PI | pending_approval â†’ approved | `commitment` |
| PI | approved â†’ posted | `financial_post` |
| PI | posted â†’ reversed | `reversal` |

### Hash chain integrity

Each snapshot links to its predecessor via `previous_snapshot_id` +
`chain_seq`. The `payload_hash` is SHA-256 of the canonical JSON
(`jsonb_build_object` with sorted keys). `snapshot.fn_verify_chain(...)` walks
the chain and emits `chain_ok=false` rows where `previous_snapshot_id` doesn't
match the prior `chain_seq.id`.

### View

`snapshot.v_p2p_audit_timeline` â€” `LEFT JOIN log.activity_log` â†’
`snapshot.document_snapshot` on `activity_log_id`. Activity log is the spine;
not every activity produces a snapshot (notifications, comments) but every
snapshot has an originating activity.

---

## 7. Idempotency contract (`control.lifecycle_transition_execution`)

Posting transitions fire multiple hook handlers. Each handler MUST be
idempotent â€” retries (API/client retry, webhook replay, worker re-delivery)
cannot double-post or duplicate notifications.

### Execution token

```
token = sha256_hex(transition_id || ':' || source_doc_id || ':' || event_seq)
```

Same transition fired twice for the same revision yields the same token.

### Handler protocol

1. Build `executionToken` from the transition's `(transition_id,
   source_doc_id, event_seq)`.
2. Call `claimHookExecution(db, {executionToken, hookActionKey, ...})`.
   - Returns `{ id }` â†’ proceed.
   - Returns `null` â†’ another firing already claimed this hook; no-op.
3. Do the work.
4. On success: `markHookCompleted(db, id, payloadHash?, durationMs?)`.
5. On error: `markHookFailed(db, id, errorCode, errorMessage, durationMs?)`.

### Token allocation per transition

`event_seq` is bumped when the SAME transition genuinely fires again on the
SAME source doc (e.g. reverse â†’ re-approve cycle). The runtime maintains
this counter; transitions on the document use `event_seq=1` by default.

### The single allowed control table

`control.lifecycle_transition_execution` is the **one documented exception**
to the "no new control tables" lock. It is durable (audit history depends on
it), tenant-scoped, RLS-protected, and indexed for source-doc audit / failed
inspection / principal recent / stuck-handler sweep.

### Single-source GL helper

`postJournalGl({tenantId, jeId, executionToken, transitionId,
sourceDocType, sourceDocId})` in
`server/packages/services/business/ledger/post-journal-gl.service.ts` is the
ONLY call site for `ledger.upsert_gl_balance`. Verified by Phase 10's
`verify-gl-single-source.ts`.

---

## 8. Three-way match contract

Three-way match aligns invoice â†” commitment line â†” receipt line by quantity
and price. Driven by `purchase_invoice_line.match_type` set on intake:

- `three_way` â€” PO + receipt + invoice (full chain; default for `po_based`)
- `two_way` â€” PO + invoice only (used when GR-based IV is off on the
  commitment, or when the commitment's `commitment_procurement.gr_based_iv` is
  false)
- `no_match` â€” informational only (non_po / one_time_supplier)
- `evaluated_receipt` â€” invoice synthesised from receipts (no supplier invoice)

### Resolution

`fn_pi_three_way_match` reads:
- `commitment_line.confirmed_qty/price` (after POC) or
  `commitment_line.quantity/unit_price` (before POC)
- `receipt_line.received_quantity` aggregated by `commitment_line_id`
- `service_sheet_line.quantity` for service portions
- `control.match_tolerance_config` with fallback chain
  supplier â†’ company_code â†’ tenant â†’ global

Returns `MATCHED` | `EXCEPTION` | `OVERRIDDEN` (when a user with
`PI.MATCH_OVERRIDE` permission acknowledged the variance).

### Exception handling

`EXCEPTION` puts the PI into `status='on_hold'` (Hold Model A) and records
the variance details in `document.match_exception` keyed by
`invoice_match_case`. The hold reason is `metadata.hold.reason = '<variance
summary>'`.

Release from match-exception hold: review the variance, either accept it
(creates a `PI.MATCH_OVERRIDE` audit entry and releases hold) or
amend/reject the invoice.

---

## 9. Lifecycle + hook wiring

See seed files in `server/db/seed/platform/003_control/`:

| File | Purpose |
|------|---------|
| `030_control_lifecycle_contract.sql` | PI, PO, JE, PE lifecycles (pre-existing) |
| `030z_p2p_parity_lifecycles.sql` | PR, POC, DN, receipt, service_sheet lifecycles |
| `045_control_entity_lifecycle_contract.sql` | entity â†” lifecycle bindings |
| `070_hook_action_registry.sql` | base + P2P hook actions (`snapshot.capture`, `transaction_flow.dispatch`, `ledger.*`, etc.) |
| `070z_p2p_transition_hooks.sql` | `activity_log.write` + `snapshot.capture` + `transaction_flow.dispatch` + `notification.publish` wired per transition |
| `070z2_p2p_workflow_start_hooks.sql` | BEFORE-hook `workflow.start` on submit transitions |

### Standard wiring per transition

```
BEFORE sort 5   workflow.start                  required  (approval gates only)
AFTER  sort 10  activity_log.write              required  (every transition)
AFTER  sort 20  snapshot.capture                required  (per capture matrix)
AFTER  sort 30  transaction_flow.dispatch       required  (posting transitions only)
AFTER  sort 60  notification.publish            narrowable (every transition)
```

`activity_log.write` and `snapshot.capture` are `contract` role + `required`
safety level â€” they cannot be overridden or suppressed.

`notification.publish` is `extension` role + `narrowable` â€” tenants can
restrict the audience or disable per route.

`transaction_flow.dispatch` config carries `{event_code, flow_code}` and the
dispatcher (Phase 5.3) looks up `transaction_flow_template` to find the
imperative handler. The handler then invokes `ledger.materialize_gl_balance`,
`ledger.commitment_consume`, `ledger.budget_consume`, etc. via the
idempotency-guarded helpers.

---

## 10. Posting flow (the canonical PR â†’ payment journey)

This is the path Section 11 of the master plan describes. Step letters
reference the plan.

### Aâ€“B: PR draft â†’ pending_approval

- BEFORE: `workflow.start` (creates `document.workflow_request` from
  `purchase_requisition_approval` definition). Gate blocks until workflow
  reaches APPROVED.
- AFTER: `activity_log.write`, `snapshot.capture(authoring_lock)`,
  `notification.publish` â†’ in_app/email to requester (ack) + assignee
  (action via the workflow stage rule).

### C: PR approve

- AFTER: `transaction_flow.dispatch(ORDER_CREATION, PO_BASED)` â†’
  `ledger.budget_reserve` (writes `budget_transaction(RESERVE)`, bumps
  `budget_balance.reserved_amount`).
- `snapshot.capture(commitment)`.
- Notification: `p2p.pr.approved` template (lifecycle.changed).

### Dâ€“E: Buyer converts PR â†’ PO; submits PO

- PR line `converted_quantity` is bumped by the conversion service.
- PO transitions draft â†’ pending_approval; `workflow.start` fires.

### F: PO approve

- `transaction_flow.dispatch(ORDER_APPROVAL, PO_BASED)`:
  - `ledger.materialize_commitment_schedule` â€” iterates current schedule_lines
    and writes `ledger.commitment_schedule` rows.
  - `ledger.commitment_consume(kind=ZERO)` â€” seeds
    `commitment_fulfillment(0)` baseline.
  - `ledger.budget_commit` â€” transfers from PR-reserved to PO-committed.
- Policy gate: `budget_check` (synchronous; reads `budget_check_config`).
- Notification: `p2p.po.approved`.

### Gâ€“H: Place order; supplier confirms (POC)

- Buyer transitions PO `approved` â†’ `sent_to_supplier`; emits the order
  packet to the mesh / EDI / email.
- Supplier replies through the mesh plane â†’ POC `received` â†’ `confirmed`
  (auto if within tolerance) or `changes_proposed` (manual buyer
  adjudication).
- Accepting changes writes `commitment_line.confirmed_qty/price/date`.

### I: DN flow

- `draft â†’ in_transit â†’ arrived â†’ partially_receipted | fully_receipted`.
- No ledger writes â€” DN is informational.
- Mark-arrived fires `snapshot.capture(fulfillment)`.

### Jâ€“K: Post receipt / service_sheet

- `approved â†’ posted` triggers `transaction_flow.dispatch(FULFILLMENT,
  PO_BASED)` for receipts or `FULFILLMENT, SERVICES` for service_sheets.
- Ledger writes (same TX):
  - JE via `buildJeLinesFromProfile` (Dr Inventory/Expense, Cr GR-IR
    Clearing).
  - `postJournalGl(...)` materialises `gl_balance` per journal_line (R6
    single-source).
  - For receipts: `inventory_movement(RECEIPT)`, `inventory_balance` upsert,
    `inventory_valuation_layer`.
  - `commitment_consume(kind=GRN | SES)`.
  - `commitment_line.received_quantity` is trigger-synced from
    `receipt_line` aggregates.
- `snapshot.capture(financial_post)`.

### Lâ€“O: PI intake â†’ submit â†’ approve â†’ post

- L: Intake (email/portal/EDI) hits `control.intake_idempotency` to suppress
  duplicates.
- M: Submit fires `workflow.start` and policy gates:
  - `p2p.budget_gate`
  - `p2p.three_way_match_required` â†’ `fn_pi_three_way_match`
  - `p2p.period_open`
  - `p2p.sod_no_self_approval`
  - EXCEPTION â†’ Hold Model A (status='on_hold', metadata.hold.reason='match
    exception').
- N: Approve fires `snapshot.capture(commitment)`.
- O: Post fires `transaction_flow.dispatch(INVOICE_MATCHED, PO_BASED)`:
  - `buildJeLinesFromProfile` writes JE + journal_line +
    `accounting_distribution`.
  - `postJournalGl(...)` materialises GL.
  - `ledger.tax_post` â†’ `tax_calculation` + `tax_credit_movement`.
  - `commitment_consume(kind=INVOICE)`.
  - `ledger.budget_consume`.
  - `commitment_schedule.remaining_amount -=` (line-level proportional).
  - `trg_pi_freeze_bp_snapshot` freezes supplier party/address/bank.
  - `operational_closed_at` set if commitment fully_received;
    `financial_closed_at` set if fully_invoiced.
  - `snapshot.capture(financial_post)`.

### P: Payment

- `payment.draft â†’ approved â†’ posted` runs through `payment-posting.service`.
- `transaction_flow.dispatch(SETTLEMENT, PO_BASED)`:
  - JE (Dr AP / Cr Bank).
  - `postJournalGl(...)`.
  - `commitment_consume(kind=PAYMENT)`.
  - `ledger.budget_consume(ACTUAL_FROM_CONSUME)`.
- PI `payment_status` recomputed from `ap_payment_allocation`.
- `fully_paid` confirms `financial_closed_at`.

---

## 11. Permission naming convention

Two tiers in `shared.permission`:

| Style | Use | Example |
|-------|-----|---------|
| Lowercase verb (`approve`, `cancel`, `convert`) | `entity_operation.permission_code` â€” bound to UI affordance buttons | `submit`, `dispatch`, `mark_arrived` |
| `lowercase.dotted` (`ap.override_tax_mode`) | Cross-cutting domain overrides | `ap.promote_proforma` |
| `UPPERCASE.DOTTED` (`PR.APPROVE`, `RECEIPT.POST`) | `entity_action_rule.required_permission` â€” capability gates per (entity Ã— status Ã— action) | `PI.MATCH_OVERRIDE`, `SERVICE_SHEET.POST` |
| `MODULE.RESOURCE.ACTION` (`JOBS.BOARD.VIEW`) | Platform-admin permissions for control-plane UIs | `IAM.PARAMETER.MANAGE` |

The UPPERCASE entity-action codes were added in Phase 4 (`017_permission.sql`)
specifically for `required_permission` references on action rules. Never gate
with `isAdmin` or role-claim shortcuts; always route through the persona â†’
group â†’ role â†’ permission chain.

---

## 12. Verification gates

Phase 10 lands these scripts. Each is part of CI:

| Script | What it checks |
|--------|----------------|
| `verify-p2p-lifecycle.ts` | Every (entity Ã— transition) row has an `activity_log.write` + `snapshot.capture` (per matrix) + the right ledger hooks |
| `verify-snapshot-chain.ts` | `snapshot.fn_verify_chain` returns no `chain_ok=false` rows for any entity |
| `verify-no-orphan-je.ts` | Every posted `journal_entry` has at least one corresponding `gl_balance` row |
| `verify-gl-single-source.ts` | `ledger.upsert_gl_balance` is only called from `post-journal-gl.service.ts` |
| `verify-permissions.ts` | Every `entity_action_rule.required_permission` and every `entity_operation.permission_code` resolves to a `shared.permission` row |
| `verify-flow-coverage.ts` | Every `transaction_flow_template.event_code` referenced from a transition hook has a dispatcher handler |
| `verify-idempotency.ts` | Simulates duplicate hook fires for each posting transition; asserts ledger / balance row counts unchanged |
| `verify-schedule-line-versioning.ts` | After POC amendment: only one `is_current_version=true` row per `(source_doc_type, source_line_id)`; sum of `scheduled_quantity` of current versions equals the commitment line quantity |
| `verify-hold-model.ts` | `is_on_hold` column does not exist; no source file outside this doc references it |

Smoke test: PR â†’ PO â†’ POC â†’ receipt â†’ service_sheet â†’ PI â†’ match â†’ post â†’
payment must run end-to-end on a freshly-reset DB.

---

## 13. Open / deferred items

- **Schedule-line writer service** â€”
  `server/packages/services/business/p2p/schedule-line.service.ts` and the
  `trg_schedule_line_fulfilled` trigger are pending (Phase 2 tail).
- **Posting services and dispatcher** â€”
  `receipt-posting.service.ts`, `service-sheet-posting.service.ts`,
  `commitment-approve.service.ts`, `transaction-flow-dispatcher.service.ts`
  are pending (Phase 5.2 / 5.3 / 5.4). Existing
  `invoice-posting.service.ts` and `payment-posting.service.ts` need to
  switch to `postJournalGl` (Phase 5.4).
- **POC, DN, receipt, service_sheet UI** â€” Phase 9 object pages + list
  pages. Includes `field_group / field_group_member` + `entity_flow /
  step / section / field` for the 5 new entities.
- **PI intake_idempotency wiring** â€” runtime configuration on
  `entity_flow_section`; recommend treating as tenant onboarding.
- **Push / SMS / WhatsApp notification channels** â€” explicitly v2.
- **Event-specific notification templates** (e.g. `p2p.pi.match_exception`,
  `p2p.receipt.quality_held`) â€” generic `<entity>.lifecycle.changed`
  template covers the 80% case; add specifics as use cases surface.

---

## 14. Memory references

The session that built this subsystem captured several gotchas as memory
entries; consult these when extending:

- `feedback_session_cookie_name_mismatch` â€” auth cookie name
- `feedback_seed_sql_gotchas` â€” BOM, unscoped `code='X'` predicates,
  tenant_subscription enum
- `project_entity_operation_taxonomy` â€” canonical op-codes + UI labels
- `feedback_entity_slug_naming` â€” underscores in entity slugs
- `feedback_supplier_vs_vendor_naming` â€” supplier is canonical
- `project_pi_field_hardening` â€” Hold Model A, BP snapshot freeze, hold
  metadata
- `feedback_auth_group_member_append_only` â€” gating belongs on
  `auth_group_role`, not `auth_group_member.expires_at`

---

## 15. Hardening sprint â€” June 2026

Migration-style note for the P2P data-integrity + form-discipline batch
landed across PRs Aâ€“E2 + the helper-extraction refactor + the strict
fiscal-period mode rollout. Everything below is in `main` and applied to
the live tenant DB; re-running the seed reproduces it identically.

### Schema integrity

- **36 referential FKs added to `document/03_constraints.sql`** covering
  the full P2P graph. Three groups, all using composite `(tenant_id, id)`
  references for tenant isolation:
  - Â§6.A Parent header â†’ line (7 FKs, `ON DELETE CASCADE`) â€” commitment,
    commitment_procurement, PR_line, POC_line, DN_line, receipt_line,
    service_sheet_line.
  - Â§6.B Upstream chain (16 FKs, `ON DELETE RESTRICT`) â€” commitment_-
    procurement.requisition_id, POC.commitment_id, DN.commitment_id,
    receipt.commitment_id + delivery_note_id, receipt_line.commitment_-
    line_id + delivery_note_line_id, service_sheet.commitment_id, PI.
    commitment_id, PI_line.commitment_line_id + receipt_line_id + service_-
    sheet_line_id.
  - Â§6.C Version + reversal self-FKs (13 FKs, `SET NULL` for
    previous_version_id / renewed_from_id, `RESTRICT` for reversal_of_id /
    reversed_by_id).
- Preflight script `server/scripts/p2p-fk-preflight.ts` ships with
  `--guard` (orphan-only gate) and `--enforce` (orphan + full coverage
  gate). `--enforce` returns 0 on the current DB (36/36 PRESENT).

### Concurrency

- **16 `row_version` triggers** total across `document/*` aggregate
  roots. Now covers every P2P physical table that carries a `row_version`
  column: receipt + line, service_sheet + line, PR + line, POC + line,
  DN + line, commitment + line, in addition to the pre-existing PI +
  PI_line + accounting_distribution triggers. `purchase_order` is a view
  over `commitment` + `commitment_procurement`; PO writes increment the
  underlying `commitment.row_version` via `trg_cmt_row_version`. Triggers
  use the shared `shared.trg_increment_row_version` function.

### Shared defaults helper

- New `server/packages/services/business/p2p/resolve-document-defaults.ts`
  is the single anchor for the three system-field resolutions used by
  generic CRUD + every from-commitment service:
  - `resolveCompanyAndBaseCurrency` â€” first active company_code if no
    hint; functional currency via the company_code row.
  - `resolveFiscalPeriod` â€” looks up `master.fiscal_period`; **defaults
    to strict mode** (returns `{ok: false, reason: 'fiscal_period_missing'}`
    when no row covers the document date). Opt in to the Gregorian
    fallback via `mode: 'permissive'`.
  - `allocateDocumentNumber` â€” calls `control.next_entity_number`, falls
    back to `${prefix}-YYYYMM-XXXXXX` on null/exception.
- Inline duplicates removed from `records.route.ts` and
  `line-source.route.ts`. Local `nextConfiguredEntityNumber` helper
  deleted (zero callers).
- Pure policy functions (`applyFiscalPeriodPolicy`,
  `buildFallbackDocumentNumber`) exported for unit tests in
  `business/__tests__/resolve-document-defaults.test.ts`.

### Strict fiscal-period default â€” behaviour change

The receipt / service_sheet / purchase_requisition path in
`records.route.ts` and the receipt-from-commitment / service-sheet-from-
commitment routes in `line-source.route.ts` now return **HTTP 422
`FISCAL_PERIOD_MISSING`** when no `master.fiscal_period` row covers the
document date, instead of warning-and-silently-using the Gregorian month.
This is the safer default for non-Gregorian tenants (4-4-5, 13-period
retail, non-January start, lunar) where the previous fallback could
mis-bucket GL postings.

Tenants on a Gregorian Jan-Dec calendar that relied on the implicit
fallback need to seed `master.fiscal_period` rows for every transactable
date. The AUDIT NOTE at the top of `resolve-document-defaults.ts`
captures the policy.

### From-commitment write paths

- `business/p2p/receipt-from-commitment.service.ts` â€” atomic header +
  receipt_line write with FOR UPDATE remaining-quantity gate. Exposed
  via `POST /api/p2p/receipts/from-commitment`.
- `business/p2p/service-sheet-from-commitment.service.ts` â€” same shape
  for SES. Exposed via `POST /api/p2p/service-sheets/from-commitment`.
- Both routes use the shared defaults helper and 422 cleanly on missing
  fiscal_period.

### Test coverage added

- `__tests__/resolve-document-defaults.test.ts` â€” 14 unit tests covering
  strict / permissive modes, Gregorian boundary cases, warn-log
  assertions, fallback document-number format.
- `__tests__/receipt-from-commitment.test.ts` â€” 7 unit tests for input
  validation paths (no lines, duplicate ids, qty signs).
- `__tests__/service-sheet-from-commitment.test.ts` â€” 11 unit tests
  including the inverted-period and completion-pct range guards.
- `__tests__/receipt-from-commitment.integration.test.ts` â€” 4 live-DB
  tests for the happy path + over-receipt + commitment-not-found + line-
  not-on-commitment. Runs when `DATABASE_URL` is set; skipped otherwise.

### Form discipline

- 5 P2P entities (receipt, service_sheet, POC, DN, PR) now ship with
  `descriptorSurfaceShell: true, groupedForms: true` in
  `apps/neon/lib/server/meta-entity-runtime.ts` and grouped field
  configuration in `042_control_entity_field_contract.sql`. System fields (fiscal_year,
  posting_date, *_number, base_currency_code, lifecycle / versioning
  columns, etc.) are hidden on create surfaces via
  `editability.editableOnCreate=false`; user-input fields carry an
  explicit `group_key` (general / receiving / period / addresses /
  logistics / dimensions / notes).

### Rollback summary

- FKs: `DROP CONSTRAINT` by name (36 statements).
- Triggers: `DROP TRIGGER` by name (13 statements, the 3 pre-existing
  PI/PIL/AD triggers stay).
- Helper extraction: revert the two route files + `business/index.ts`
  re-export, delete `resolve-document-defaults.ts`.
- Strict fiscal-period default: pass `mode: 'permissive'` at the two
  call sites to restore prior behaviour.
- Shell + discipline: disable the entity through compiled runtime metadata +
  the per-entity `editability` / `group_key` UPDATE blocks; next reseed
  reverts.

### Plan 5 â€” Terminal-state mutation guards

Closes the data-integrity loop opened by the FK + row_version batches:
once a P2P document is in a terminal status, generic UPDATE paths
(records.route, raw SQL via admin tools, jobs/workers) cannot rewrite
its fields. The action dispatcher remains the only legitimate path for
state changes from terminal â€” the guard's
`IF OLD.status IS DISTINCT FROM NEW.status THEN RETURN NEW` short-circuit
lets reverse / reopen lifecycle transitions through.

**6 new functions + 6 new triggers** in `document/05_functions.sql` and
`document/06_triggers.sql` covering commitment, purchase_requisition,
purchase_order_confirmation, delivery_note, receipt, service_sheet
(mirrors the pre-existing `trg_pi_immutability_guard` shape). Per-entity
terminal vocabulary:

| Entity | Terminal statuses |
|---|---|
| commitment                    | `closed`, `cancelled`, `expired` |
| purchase_requisition          | `rejected`, `fully_converted`, `closed`, `cancelled` |
| purchase_order_confirmation   | `rejected`, `cancelled`, `changes_rejected` |
| delivery_note                 | `fully_receipted`, `returned`, `cancelled` |
| receipt                       | `posted`, `reversed`, `cancelled` |
| service_sheet                 | `posted`, `reversed`, `cancelled` |
| _(plus universal flag)_       | `terminal_status IS NOT NULL` (CANCELED / REJECTED) |

Each trigger uses a `WHEN` clause filtering to the entity's terminal
vocabulary, so the function body only runs on terminal rows â€” non-
terminal UPDATEs incur zero overhead. Raises `SQLSTATE P0001` with a
message naming the entity, id, and terminal status for observability.

Integration coverage: 6 tests in
`business/__tests__/p2p-immutability-guards.integration.test.ts` â€”
asserts the P0001 raise on field-edit attempts, confirms status-only
transitions still pass, and exercises the `terminal_status` branch
independently.

Rollback: `DROP TRIGGER` by name (6 statements); functions can stay or
be dropped separately.

### invoice-from-receipt â€” 3-way match composer

Closes the P2P 3-way match loop (PO â†’ Receipt â†’ Invoice). Mirrors the
receipt-from-commitment and service-sheet-from-commitment services in
shape and reuses the same shared defaults helper, but with a richer
per-line gate because multiple invoices may consume the same receipt
line over time.

**New service**:
[business/p2p/invoice-from-receipt.service.ts](../../server/packages/services/business/p2p/invoice-from-receipt.service.ts) â€”
single-TX create of a `purchase_invoice` header + N `purchase_invoice_-
line` rows back-referenced to `receipt_line` via the
`pil_receipt_line_fk` FK. Each PI line carries the originating
`receipt_line_id` and `commitment_line_id` for downstream match-
exception detection.

**Remaining-to-invoice gate**: per receipt line, the inner SELECT
aggregates `SUM(pil.quantity)` from existing PI lines whose parent
invoice is not `cancelled` / `reversed` / `rejected`, then enforces
`requested_qty <= accepted_quantity - already_invoiced` inside the same
TX with `FOR UPDATE OF rcpl`. So concurrent invoices against the same
receipt line cannot double-consume.

**New route**: `POST /api/p2p/invoices/from-receipt` registered in
[line-source.route.ts](../../server/packages/services/records/routes/line-source.route.ts).
Resolves company_code + base_currency + fiscal_period (strict) +
invoice_number via the shared helpers, then delegates to the service.
422 `RECEIPT_NOT_POSTED` / 422 `QUANTITY_OVER_REMAINING` / 404
`RECEIPT_NOT_FOUND` / 422 `RECEIPT_LINES_NOT_FOUND` flow back with
field-level error maps.

**PI header defaults**: the service relies on the table's existing
column defaults â€” `invoice_source='po_based'`, `invoice_type='standard'`,
`match_type='three_way'`, `match_status='unmatched'`, `tax_mode='exclusive'`,
`received_date=CURRENT_DATE` â€” so the create payload only carries the
differentiated fields. Supplier identity and commitment_id are
inherited from the receipt.

**Test coverage**:
- 11 unit tests in
  `business/__tests__/invoice-from-receipt.test.ts` for input
  validation paths (missing supplier invoice number/date, no lines,
  duplicate receipt line ids, qty signs, unit-price overrides).
- 5 integration tests in
  `business/__tests__/invoice-from-receipt.integration.test.ts` â€”
  happy path with FK-back-reference assertions, second-invoice-
  against-same-line subtracting first invoice's quantity (proves the
  `already_invoiced` aggregation), draft-receipt rejection,
  receipt-not-found, line-not-on-receipt.
- 5 wire-level tests in
  `apps/neon/app/api/relay/[...path]/__tests__/p2p-invoices-from-receipt.test.ts`
  covering the BFF relay forwarding (401, happy 201, 422 passthrough,
  502 on upstream failure).

**Rollback**: delete the service file + the route handler block + the
`invoice-from-receipt` exports from `business/index.ts`. No DDL.

### payment-from-invoice â€” auto-pay composer (closes the chain)

Closes the P2P chain end-to-end (PO â†’ Receipt â†’ PI â†’ **Payment**). User
selects one or more approved/posted invoices for a single supplier,
supplies per-allocation amounts (+ optional discount, withholding tax,
advance recovery, retention deductions), and the service writes a draft
payment_entry + N payment_entry_allocation rows atomically.

**New service**:
[business/ap/payment-from-invoice.service.ts](../../server/packages/services/business/ap/payment-from-invoice.service.ts)
â€” single-TX create with three guard layers:

1. **Per-row validation** (no allocations, duplicate invoiceId, allocated
   > 0, deductions â‰¥ 0, sum-of-deductions â‰¤ allocated â€” matches the DB
   `(((discount + wht) + adv_recovery) + retention) <= allocated` CHECK).
2. **Cross-row invariants** inside the TX: all chosen invoices must
   share the same `supplier_id` (one payment = one supplier) and the
   same `currency_code` (payment_entry has a single currency_code
   column). Surface 422 `MULTIPLE_SUPPLIERS` / 422 `MULTIPLE_CURRENCIES`.
3. **Per-invoice remaining-to-pay gate**: aggregates
   `SUM(pea.allocated_amount)` from existing non-voided / non-reversed /
   non-cancelled `payment_entry` rows that already allocate against the
   invoice; rejects new allocations where `allocated > payable_amount -
   already_allocated`. `FOR UPDATE OF pi` makes concurrent payments
   against the same invoice serializable, so two parallel from-invoice
   calls can't double-consume the same payable balance.

**Status gate**: only `approved | posted | partially_paid` invoices are
payable. `draft`, `pending_approval`, `proforma`, `on_hold`,
`fully_paid`, and any non-null `terminal_status` return 422
`INVOICE_NOT_PAYABLE`.

**New route**: `POST /api/p2p/payments/from-invoice` registered in
[line-source.route.ts](../../server/packages/services/records/routes/line-source.route.ts).
Resolves company_code + base_currency + fiscal_period (strict) +
payment_number via the shared helpers, then delegates to the service.
The service in turn resolves `payment_method_id` (first active for the
tenant when not supplied) and `supplier_name` (from `master.supplier_-
app_index` â€” `purchase_invoice` doesn't carry the denormalised name).

**payment_entry header defaults reused from the table schema**:
`payment_type='standard'`, `status='draft'`, `document_date` mirrored to
`posting_date` and `value_date` when only one date is supplied,
`payment_amount = SUM(allocations.allocatedAmount)`.

**Test coverage**:
- 9 unit tests in
  `business/__tests__/payment-from-invoice.test.ts` for validation
  paths (no allocations, dup invoiceId, qty signs, deduction signs,
  deductions-exceed-allocated CHECK preview).
- 6 integration tests in
  `business/__tests__/payment-from-invoice.integration.test.ts` â€”
  single-invoice happy path, multi-invoice happy path for one supplier,
  second-payment-against-same-PI subtracting first payment's
  allocation (proves `already_allocated` aggregation), MULTIPLE_SUPPLIERS
  invariant, draft PI rejection, INVOICES_NOT_FOUND.
- 5 wire-level tests in
  `apps/neon/app/api/relay/[...path]/__tests__/p2p-payments-from-invoice.test.ts`
  covering BFF relay forwarding for the happy path + the
  MULTIPLE_SUPPLIERS / ALLOCATION_OVER_REMAINING / 502 negatives.

**P2P chain â€” fully wired from-X services**:

| Hop | Service | Route |
|---|---|---|
| PO â†’ Receipt   | `createReceiptFromCommitment`      | `POST /api/p2p/receipts/from-commitment` |
| PO â†’ SES       | `createServiceSheetFromCommitment` | `POST /api/p2p/service-sheets/from-commitment` |
| Receipt â†’ PI   | `createInvoiceFromReceipt`         | `POST /api/p2p/invoices/from-receipt` |
| **PI â†’ PMT**   | **`createPaymentFromInvoice`**     | **`POST /api/p2p/payments/from-invoice`** |

All four services use the shared `resolve-document-defaults` helper.
Four atomic writes, four FOR UPDATE remaining-quantity gates, four
sets of unit + integration + wire-level tests.

**Rollback**: delete the service file + the route handler block + the
`payment-from-invoice` exports from `business/index.ts`. No DDL.

### UI prefill â€” receipt-from-commitment + notification outbox

The `POST /api/p2p/.../from-X` endpoints now have a UI entry point and
each fires a notification outbox event on success. Together these turn
the from-X services from internal API into a user-facing flow with the
hook for downstream push notification consumers.

**Prefill page**: [apps/neon/app/(shell)/p2p/receipt-from-commitment/](../../apps/neon/app/(shell)/p2p/receipt-from-commitment/)
â€” two files:
- `page.tsx` (server component): reads `?commitmentId=`, loads the
  commitment header via the existing `getMetaEntityRecordDetail("purchase_order", id)`
  helper, fetches the open commitment lines via the BFF using a new
  `?commitmentId=` filter on `/api/p2p/open-po-lines`, then mounts the
  client form.
- `ReceiptFromCommitmentForm.tsx` (client component): renders a PO
  summary card + a line-acceptance grid (accepted qty, rejected qty,
  reject reason per line) + receipt date + notes + a Submit button.
  Submits to `POST /api/relay/p2p/receipts/from-commitment` and on 201
  navigates to `/app/receipt/<receiptId>`. Field-level errors from the
  server (`fieldErrors[<commitmentLineId>]`) render inline on the
  offending row.

**Entry point**: `purchase_order` now has a `create_receipt` operation
in `control.entity_operation` (`DETAIL` surface, `PRIMARY` placement,
`NAVIGATE` handler with `/p2p/receipt-from-commitment?commitmentId={id}`).
A new permission `create_receipt` was seeded in
`shared.permission` to satisfy the `eo_permission_fk` constraint, plus
three sibling permissions (`create_service_sheet`, `create_invoice`,
`create_payment`) for the parallel prefill pages when they ship.

**Open-PO-lines filter**: added `commitmentId` query param to
`GET /api/p2p/open-po-lines` so the prefill page can narrow to a single
commitment. Backward compatible â€” empty filter returns all open lines
for the tenant.

**Notification outbox** â€” all four from-X services now emit a
`notification` outbox event inside the create TX (atomic with the
business write; emit failure rolls back the create):

| Service | event_type | aggregate_type / id |
|---|---|---|
| `createReceiptFromCommitment`      | `p2p.receipt.created_from_commitment`         | `commitment` / `commitmentId` |
| `createServiceSheetFromCommitment` | `p2p.service_sheet.created_from_commitment`   | `commitment` / `commitmentId` |
| `createInvoiceFromReceipt`         | `p2p.invoice.created_from_receipt`            | `receipt` / `receiptId` |
| `createPaymentFromInvoice`         | `p2p.payment.created_from_invoice`            | `purchase_invoice` / first allocation invoice id |

Payload includes the new document's id + number, the source aggregate's
id, lines/allocations written, and document_date. Downstream consumers
(notification worker, SSE bridge) subscribe to the `notification` topic
and fan out per-user push/inbox entries based on the `entity_type` +
`actor_id`.

**Rollback**:
- UI: delete `apps/neon/app/(shell)/p2p/receipt-from-commitment/` and
  the `create_receipt` row in `control.entity_operation`.
- Notification emits: drop the `await emitOutboxEvent(trx, ...)` block
  from each of the four `business/p2p/*-from-*.service.ts` files.
- `commitmentId` filter on `/api/p2p/open-po-lines`: revert the SQL
  predicate; clients ignoring the filter are unaffected.

**Sister pages still to wire** (same template, ~1.5h each):
- `/p2p/service-sheet-from-commitment` â€” entry point on PO detail
- `/p2p/invoice-from-receipt` â€” entry point on Receipt detail
- `/p2p/payment-from-invoice` â€” entry point on Invoice detail (multi-select source)

**Downstream consumer still to wire**:
- A `notification` topic worker that turns outbox rows into
  `document.notification_message` / `document.notification_recipient`
  rows + fans out via SSE / push channels. The emit side is now
  production-ready; the consumer side is a separate scope.

### Three sister prefill pages + notification consumer

Completes the UI prefill set and wires the notification fan-out end-to-end.

**Three new prefill pages** (same template as receipt-from-commitment):
- [/p2p/service-sheet-from-commitment](../../apps/neon/app/(shell)/p2p/service-sheet-from-commitment/)
  â€” quantity per line + service-period dates; POST
  `/api/relay/p2p/service-sheets/from-commitment`.
- [/p2p/invoice-from-receipt](../../apps/neon/app/(shell)/p2p/invoice-from-receipt/)
  â€” supplier invoice number/date + per-line quantity (optional unit
  price override); POST `/api/relay/p2p/invoices/from-receipt`.
- [/p2p/payment-from-invoice](../../apps/neon/app/(shell)/p2p/payment-from-invoice/)
  â€” multi-select grid of invoices for the seed invoice's supplier
  with per-allocation amount + deductions; POST
  `/api/relay/p2p/payments/from-invoice`. Cross-currency invariant
  surfaced as a UI warning before submit.

**New BFF endpoints**:
- `GET /api/p2p/open-receipt-lines?receiptId=<id>` â€” `?receiptId=`
  filter added so the invoice-from-receipt page narrows to one
  receipt's lines.
- `GET /api/p2p/open-invoices?seedInvoiceId=<id>` â€” new endpoint
  returning approved/posted/partially_paid invoices for the seed
  invoice's supplier with `payableAmount`, `alreadyAllocated`,
  `remainingAmount`. Filters out fully-allocated invoices server-side
  so the picker only ever shows actionable rows.

**Entry-point operations on `control.entity_operation`**:

| Source detail page | Permission code | Handler target |
|---|---|---|
| purchase_order   | `create_receipt`       | `/p2p/receipt-from-commitment?commitmentId={id}` |
| purchase_order   | `create_service_sheet` | `/p2p/service-sheet-from-commitment?commitmentId={id}` |
| receipt          | `create_invoice`       | `/p2p/invoice-from-receipt?receiptId={id}` |
| purchase_invoice | `create_payment`       | `/p2p/payment-from-invoice?seedInvoiceId={id}` |

Four new `shared.permission` rows (`create_receipt`,
`create_service_sheet`, `create_invoice`, `create_payment`) seeded to
satisfy `eo_permission_fk`. All four entry points applied to the live
DB so they appear in the action bar immediately after a hard refresh.

**Notification consumer**:
- `DRAIN_TOPICS` in [jobs.types.ts](../../server/packages/services/jobs/jobs.types.ts) extended with `"notification"`.
- New handler [p2p-notification-outbox.handler.ts](../../server/packages/services/jobs/handlers/p2p-notification-outbox.handler.ts)
  â€” converts `event.outbox WHERE topic='notification'` rows into
  `event.notification_message` rows. Resolves recipients per
  event_type (commitment.requested_by + commitment_procurement.buyer_id
  for receipt/SES; receipt.created_by + upstream PO requester for
  invoice; invoice.created_by for payment). Defaults all P2P events to
  `in_app` channel; payments additionally fan out to `email` for
  cross-system audit trail.
- Registered in [bootstrap.ts](../../server/src/kernel/bootstrap.ts)
  `topicHandlers` map. The existing notification worker
  (`jobs:notifications`) picks up the new messages on its sweep cycle
  and creates `event.notification_delivery` rows per recipient.

**SSE client consumer**:
- New [NotificationStreamClient.tsx](../../apps/neon/app/(shell)/NotificationStreamClient.tsx)
  â€” mounted in [(shell)/layout.tsx](../../apps/neon/app/(shell)/layout.tsx)
  so every authenticated route gets live notifications. Subscribes to
  the pre-existing `GET /api/relay/platform/notifications/stream`
  endpoint, parses `notification:new` events, and shows a toast (via
  the existing `ToastProvider`) with an "Open" action that navigates
  to `/app/<entity_type>/<entity_id>`.
- High-priority notifications use the `warning` toast intent; normal
  ones use `info`. Toast duration 6 s.
- EventSource handles reconnection natively. Auth flows through the
  same `/api/relay/*` BFF as every other call â€” no extra wiring.

**End-to-end flow** (one chain):
```
User clicks "Create Receipt" on PO detail page
  â†’ /p2p/receipt-from-commitment?commitmentId=X
  â†’ form submit â†’ POST /api/relay/p2p/receipts/from-commitment
  â†’ svc-business createReceiptFromCommitment (atomic):
        INSERT receipt + receipt_line
        INSERT event.outbox (topic='notification',
                              event_type='p2p.receipt.created_from_commitment')
  â†’ COMMIT
  â†’ domain-outbox worker drains notification topic
  â†’ p2p-notification-outbox.handler resolves recipients
        (commitment.requested_by + buyer + actor)
  â†’ INSERT event.notification_message
  â†’ notification worker sweeps
  â†’ INSERT event.notification_delivery rows (one per recipient Ã— channel)
  â†’ SSE /api/relay/platform/notifications/stream polls deliveries
  â†’ NotificationStreamClient receives notification:new event
  â†’ toast pops: "Receipt RCP-202606-XYZ created"
        with "Open" action â†’ /app/receipt/<id>
```

**Files this batch (totals)**:
- 6 new page + form files under `apps/neon/app/(shell)/p2p/` (3 pages Ã— 2 files)
- 1 new client component: `NotificationStreamClient.tsx`
- 1 new server handler: `p2p-notification-outbox.handler.ts`
- 1 new BFF endpoint: `GET /api/p2p/open-invoices` (plus `?receiptId=` on open-receipt-lines)
- 4 new entity_operation rows + 4 new permission rows
- `DRAIN_TOPICS` extended with `"notification"`
- `bootstrap.ts` registers the new topic handler

**Rollback**:
- UI prefill: delete the three new folders under
  `apps/neon/app/(shell)/p2p/` and the three corresponding rows in
  `control.entity_operation` (and the permissions if their grants are
  not also wanted).
- Notification consumer: remove `"notification"` from `DRAIN_TOPICS`,
  drop the handler import + registration in `bootstrap.ts`, delete
  `p2p-notification-outbox.handler.ts`. Outbox events accumulate
  unconsumed (status='pending') but are harmless.
- SSE client: remove the `<NotificationStreamClient />` mount in the
  shell layout and delete the component file. The platform SSE
  endpoint itself is shared with other consumers and stays.

## Changelog â€” Smoke, badge, and the upstream end of the chain (2026-06-21)

Follow-up to the prior batch that wired the three sister prefill pages and
the notification consumer. This batch closes the loop:

**1. End-to-end smoke test**.
`server/scripts/p2p-notification-smoke.ts` injects a synthetic outbox row
into `event.outbox`, invokes `createP2pNotificationOutboxHandler` directly
against the live DB, and asserts a `notification_message` row is produced
with the correct event_code, template_key, subject, channels, and
recipient_id (filters SYSTEM_ACTOR). Re-invokes the handler to confirm
idempotency. 11/11 assertions pass.

Run:
```
DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:6432/athyper_neon \
  npx tsx server/scripts/p2p-notification-smoke.ts
```

**2. Handler integration tests**. `server/packages/services/jobs/__tests__/
p2p-notification-outbox.handler.integration.test.ts` covers all five
supported event types (after adding the new commitment-from-requisition
event below), idempotency, unknown-event silent skip, missing-aggregate
fallback to actor_id, SYSTEM_ACTOR_ID filtering. Tenant seed uses random
UUIDs with full cleanup in `afterAll`. 9/9 tests pass.

**3. Unread-count badge consumer**. `NotificationStreamClient.tsx` becomes
`NotificationStreamProvider` â€” a context provider that subscribes to BOTH
`notification:new` (toast) AND `notification:count` (state). The bell
badge in `Topbar.notificationCount` reads from the provider via
`useNotificationStream()`. `AppShellClient` wraps `PlaneShell` with the
provider and a thin `ShellWithNotificationCount` reads count + forwards to
PlaneShell. `PlaneShell` gained a new `notificationCount` prop forwarded
to `Topbar`.

**4. Upstream end of the chain â€” commitment-from-requisition**.

- New service: `server/packages/services/business/p2p/
  commitment-from-requisition.service.ts` â€” atomic create of
  `document.commitment` (PURCHASE_ORDER) + `commitment_procurement`
  (supplier + buyer link) + `commitment_line` rows from an approved PR.
  FOR UPDATE on `purchase_requisition_line`; per-line `quantity <=
  remaining_quantity` gate; UPDATE bumps PR-line `converted_quantity` and
  status, PR-header `converted_po_count` + `is_fully_converted`.
- New BFF endpoint: `GET /api/p2p/open-requisition-lines?requisitionId=`
  returns open PR lines for the picker grid.
- New BFF endpoint: `POST /api/p2p/commitments/from-requisition` mirrors
  the receipt-from-commitment handler shape (resolveCompanyAndBaseCurrency
  + resolveFiscalPeriod + allocateDocumentNumber + delegate to service).
- New UI: `apps/neon/app/(shell)/p2p/commitment-from-requisition/{page,
  CommitmentFromRequisitionForm}.tsx`. PR summary + supplier picker
  (defaults to PR's suggested_supplier_id) + line-selection grid with
  optional per-line unitPrice override + requiredByDate.
- New permission: `create_commitment` ("Create Purchase Order from PR")
  + entity_operation NAVIGATE row on `purchase_requisition` with
  handler_target `/p2p/commitment-from-requisition?requisitionId={id}`.
  The pre-existing `flow:convert_to_po` modal op was moved to OVERFLOW.
- New event_type: `p2p.commitment.created_from_requisition` registered in
  the topic handler â€” template_key=`p2p.commitment.created`, channels=
  `[in_app]`, subject=`"Purchase Order PO-XYZ created"`, recipients=
  `[purchase_requisition.requested_by, actor]`.
- Service integration tests: `server/packages/services/business/__tests__/
  commitment-from-requisition.integration.test.ts` â€” 6 tests covering
  happy path + PR bookkeeping, full-conversion â†’ `is_fully_converted=true`
  + `status='fully_converted'`, over-quantity, draft-PR NOT_CONVERTIBLE,
  random-id NOT_FOUND, inactive-supplier 422.

**Files this batch**:
- 1 new server smoke script: `server/scripts/p2p-notification-smoke.ts`
- 1 new handler integration test (svc-jobs)
- 1 new service integration test (svc-business)
- 1 new business service + 1 line in `business/index.ts`
- 2 new endpoints + 1 new route handler in svc-records
- 1 rewritten `NotificationStreamClient.tsx` â†’ `NotificationStreamProvider`
- `AppShellClient.tsx` rewired around provider; `PlaneShell` gains
  `notificationCount` prop
- 1 new UI page + form for commitment-from-requisition
- 1 new permission + 1 new entity_operation row (both seeded + applied
  to live DB)
- `p2p-notification-outbox.handler.ts` extended with the new event type

**Rollback**:
- commitment-from-requisition (UI + service): delete the new page folder
  + service + the `create_commitment` permission + entity_operation row
  in `control.entity_operation`. Restore the original
  `flow:convert_to_po` placement to PRIMARY if needed.
- Notification new event type: remove the `p2p.commitment.created_from_
  requisition` entries from TEMPLATE_KEY_MAP, DEFAULT_CHANNELS,
  subjectForEvent, and the resolveRecipients switch.
- Unread-count badge: revert `NotificationStreamClient.tsx` to its
  pre-batch form (no provider), restore the standalone
  `<NotificationStreamClient />` mount in shell layout, and drop the
  `notificationCount` prop from `PlaneShell` + `AppShellClient`. The
  bell badge will simply show 0 again.
- Smoke script + integration tests: delete the three new test files.
  Pure read-only against the live DB (cleanup in `afterAll`) â€” no
  rollback needed beyond file removal.


