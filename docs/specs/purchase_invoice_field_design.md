# Purchase Invoice — Field-Level Design Spec (Canonical)

**Scope:** `document.purchase_invoice`, `document.purchase_invoice_line`, `document.accounting_distribution`.
**Authority:** This is the single source of truth for field-level visibility, editability, validity, computed-field policy, and cross-entity invariants for the AP module. The implementation seeds live under `server/db/seed/platform/003_control/042_entity_field_rules_*.sql`. The CI verifier `server/scripts/verify-field-rules.ts` enforces this spec at gate time.

---

## 1  Locked architectural decisions

| Decision | Choice |
|---|---|
| Field-rule storage | `control.entity_field.editability` (jsonb), `control.entity_field.visibility` (legacy), `control.entity_field.ui_hint.display.visible_when` (forward-compat). `is_computed` (boolean) and `is_read_only` (boolean) supplement. |
| Predicate vocabulary | `editable_in_status: text[]` (allowed status values). `visible_when`/`when`: ad-hoc predicate `{field, eq/ne/value/isNull/notNull}`. JSON-logic upgrade is phase-2 (only needed when compound conditions appear). |
| Status source for child entities | `purchase_invoice_line` ⇒ parent `purchase_invoice.status`. `accounting_distribution` ⇒ parent `purchase_invoice.status` (when `source_doc_type='PURCHASE_INVOICE_LINE'`). Resolved by `fetchRecordStatus` in records.route.ts. |
| Server enforcement | `isEntityFieldWritable(rule, action, recordStatus)` returns typed reason. Only `FIELD_LOCKED_BY_STATUS` raises 400; other reasons (`FIELD_COMPUTED`, `FIELD_READ_ONLY`, `FIELD_NOT_REGISTERED`, etc.) silently drop for back-compat with forms. |
| Computed-field policy | Engine-maintained or DB-generated columns are flagged `is_computed=true`. Inbound PATCH values for these fields are silently dropped; the engine/trigger/GENERATED expression is the only writer. |
| Snapshot policy | Party / address / bank captured BEFORE any non-draft status transition. Sourced from `master.business_partner`, `master.v_business_partner_address` (purpose='remittance' preferred), `master.v_business_partner_bank_account` (purpose='disbursement' preferred). Tax snapshot is phase-2 (jurisdiction-driven). |
| Hold model | **Model A** — `status='on_hold'` is authoritative; `is_on_hold` column dropped; restoration state in `metadata.hold.previous_status`. |
| Optimistic concurrency | `purchase_invoice.row_version` (bigint, trigger-incremented). PATCH callers send `expected_row_version`; server returns `409 VERSION_CONFLICT` with `current_version` on mismatch. |
| Cross-entity invariants | `validatePurchaseInvoiceInvariants(piId, ctx)` runs pre-submit and pre-post. Aggregates all violations into a single `422 INVOICE_INVARIANT_VIOLATION` response. |

---

## 2  Field matrix — Purchase Invoice (header)

Status lifecycle (from `pi_status_chk`): `draft`, `pending_approval`, `approved`, `posted`, `partially_paid`, `fully_paid`, `on_hold`, `reversed`, `cancelled`, `rejected`.

### 2.1  Identity, source, supplier

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `document_no` (col `invoice_number`) | system-generated at create | — | always | Auto: `PI-{YYYYMM}-{rand6}` |
| `fiscal_document_number` | draft, rejected | — | always | External legal reference |
| `description` | draft, rejected, pending_approval | — | always | Invoice name |
| `invoice_source` | draft | — | always | po_based / contract_based / non_po / one_time_supplier |
| `invoice_type` | draft | — | always | standard / credit_note / debit_note / advance / retention_release / proforma / self_billed / down_payment / final |
| `company_code_id` | draft | — | always | Drives chart + tax setup |
| `supplier_id` | draft | — | always | After submit: display switches to snapshot |
| `supplier_invoice_number` | draft, rejected | — | always | Vendor's number; duplicate detection |
| `supplier_invoice_date` | draft, rejected | — | always | Vendor's date |
| `commitment_id` | draft, rejected | — | always | Required when source ∈ (po_based, contract_based) |

### 2.2  Dates

| Field | Editable In | Visible | Notes |
|---|---|---|---|
| `invoice_date` (col `document_date`) | draft, rejected | always | Document date |
| `posting_date` | draft, rejected | always | Drives period + FX |
| `received_date` | draft, rejected | always | Operational audit |
| `baseline_date` | draft, rejected | always | Payment-term anchor |
| `due_date` | draft, rejected, pending_approval | always | Can be deferred during approval |

### 2.3  Currency & FX

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `currency_code` | draft | — | always | 3-char ISO |
| `base_currency_code` | draft | — | always | Company functional currency |
| `exchange_rate` | draft, rejected | — | when `currency_code != base_currency_code` (UX hint) | Required when foreign currency |

### 2.4  Amounts

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `discount_amount` | draft, rejected | — | always | ≥ 0 |
| `freight_amount` | draft, rejected | — | always | ≥ 0 |
| `misc_charges_amount` | draft, rejected | — | always | ≥ 0 |
| `total_amount` (label "Gross Amount") | — | ✓ (trigger) | always | SUM of line gross |
| `net_amount` (col `subtotal_amount`) | — | ✓ (trigger) | always | SUM of line net |
| `tax_amount` | — | ✓ (trigger) | always | SUM of line tax |
| `withholding_tax_amount` | draft, rejected | — | always | Header-level WHT override |
| `payable_amount` | — | ✓ (GENERATED) | always | `total_amount − WHT` |
| `paid_amount` | — | ✓ (service) | always | Payment posting writes |
| `outstanding_amount` | — | ✓ (GENERATED) | always | `total − WHT − advance − retention − paid` |
| `advance_deduction_amount` | draft, rejected | — | when `commitment_id IS NOT NULL` | ≥ 0 |
| `retention_amount` | draft, rejected | — | always | ≥ 0 |
| `retention_pct` | draft, rejected | — | when `retention_amount IS NOT NULL` | 0..100 |

### 2.5  Tax

| Field | Editable In | Visible | Notes |
|---|---|---|---|
| `tax_mode` | draft, rejected | always | Drives tax engine |
| `tax_mode_source` | draft, rejected | when `tax_mode IS NOT NULL` | Explains derivation |

### 2.6  Matching, reversal, hold

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `match_type` | draft, rejected | — | always | three_way / two_way / no_match / evaluated_receipt |
| `match_status` | — | ✓ (service) | always | unmatched / partially_matched / fully_matched / match_exception |
| `is_reversal` | draft | — | always | Boolean |
| `reversal_of_id` | draft | — | when `is_reversal=true` | Target invoice (must be posted) |
| `hold_reason` | **on_hold only** | — | when `status='on_hold'` | Required while on hold |

### 2.7  Dimensions

| Field | Editable In | Notes |
|---|---|---|
| `cost_center_id` | draft, rejected | Header default for line postings |
| `profit_center_id` | draft, rejected | Header default for line postings |
| `project_id` | draft, rejected | Header default for line postings |
| `site_id` | draft, rejected | Header default for line postings |
| `budget_allocation_id` | draft, rejected | Drives budget consumption |
| `budget_check_result` | — (computed by engine) | passed / warned / override / blocked / exempt |

### 2.8  Fiscal scope

| Field | Editable In | Notes |
|---|---|---|
| `fiscal_year` | draft, rejected | Derived from posting_date in app |
| `period_number` | draft, rejected | 1..16 (adjustment periods) |

### 2.9  Annotations, audit, system

| Field | Editable In | Computed | Notes |
|---|---|---|---|
| `notes` | draft, rejected, pending_approval, approved, on_hold | — | Operational notes |
| `tags` | draft, rejected, pending_approval, approved, on_hold | — | Operational tags |
| `line_count` | — | ✓ (trigger) | Maintained by trg_pil_sync_header |
| `is_active` | — | ✓ (GENERATED) | `status IN (draft, pending_approval, approved, posted, partially_paid, on_hold)` |
| `row_version` | system (PATCH `expected_row_version` only) | ✓ (trigger) | Optimistic concurrency |
| `workflow_request_id`, `approved_at`, `approved_by`, `posted_at`, `posted_by`, `ap_je_id`, `status_changed_at`, `status_changed_by` | system | — | Maintained by workflow / posting flows |
| `is_credit_note` | (deprecated) | — | Use `invoice_type='credit_note'` instead |
| `is_on_hold` | (dropped, Model A) | — | Use `status='on_hold'` instead |

---

## 3  Field matrix — Purchase Invoice Line

Editability gated on parent invoice status (`fetchRecordStatus` JOINs `purchase_invoice` via `purchase_invoice_id`).

| Field | Editable In (parent status) | Computed | Visible |
|---|---|---|---|
| `purchase_invoice_id` | draft | — | always |
| `line_no` | draft | — | always |
| `item_id` | draft, rejected | — | always |
| `item_description` | draft, rejected | — | always |
| `procurement_type` | draft, rejected | — | always |
| `commodity_category_id` | draft, rejected | — | always |
| `business_intent_id` | draft, rejected | — | always |
| `unspsc_code` | draft, rejected | — | always |
| `hs_code` | draft, rejected | — | always |
| `uom_code` | draft, rejected | — | always |
| `quantity` | draft, rejected | — | always |
| `unit_price` | draft, rejected | — | always |
| `price_unit` | draft, rejected | — | always |
| `discount_pct` | draft, rejected | — | always |
| `discount_amount` | draft, rejected | — | always |
| `net_amount` | — | ✓ (DB-GENERATED) | always |
| `gross_amount` | — | ✓ (engine-maintained) | always |
| `tax_amount` | draft, rejected | — | always |
| `withholding_tax_amount` | draft, rejected | — | always |
| `retention_pct` | draft, rejected | — | when `retention_amount IS NOT NULL` |
| `retention_amount` | draft, rejected | — | always |
| `cost_center_id` | draft, rejected | — | always |
| `profit_center_id` | draft, rejected | — | always |
| `project_id` | draft, rejected | — | always |
| `site_id` | draft, rejected | — | always |
| `is_asset` | draft, rejected | — | always |
| `asset_category_id` | draft, rejected | — | when `is_asset=true` |
| `match_status` | — | ✓ (service) | always |
| `matched_quantity` | — | ✓ (service) | always |

---

## 4  Field matrix — Accounting Distribution

Editability gated on parent invoice status (`source_doc_type='PURCHASE_INVOICE_LINE'` ⇒ `source_doc_id` is the parent header id).

| Field | Editable In (parent status) | Computed | Visible | Notes |
|---|---|---|---|---|
| `source_doc_type` | system (immutable) | — | always | Polymorphic discriminator |
| `source_doc_id` | system (immutable) | — | always | Parent header id |
| `source_line_id` | system (immutable) | — | always | Parent line id |
| `distribution_no` | system (sequence) | — | always | ≥ 1 |
| `distribution_basis` | draft, rejected | — | always | PERCENT / AMOUNT / QUANTITY |
| `split_pct` | draft, rejected | — | when `distribution_basis='PERCENT'` | Required for PERCENT |
| `split_amount` | draft, rejected | — | when `distribution_basis='AMOUNT'` | Required for AMOUNT |
| `split_quantity` | draft, rejected | — | when `distribution_basis='QUANTITY'` | Required for QUANTITY |
| `distributed_amount` | — | ✓ (engine-maintained) | always | basis × line amount |
| `currency_code` | system (inherits from line) | — | always | |
| `account_source` | draft, rejected | — | always | POSTING_ROLE / FIXED / FROM_INTENT / FROM_CATEGORY |
| `posting_role_code` | draft, rejected | — | when `account_source='POSTING_ROLE'` | |
| `gl_account_id` | draft, rejected | — | when `account_source='FIXED'` | |
| `account_code` | draft, rejected | — | when `account_source='FIXED'` | Alternate to gl_account_id |
| `account_lookup_key` | system (engine input) | — | when policy enables | |
| `account_fallback` | system (engine input) | — | when policy enables | |
| `business_intent_id` | draft, rejected | — | always | Required when `account_source='FROM_INTENT'` |
| `commodity_category_id` | draft, rejected | — | always | Required when `account_source='FROM_CATEGORY'` |
| `cost_center_id`, `profit_center_id`, `project_id`, `site_id` | draft, rejected | — | always | |
| `is_capex` | draft, rejected | — | always | |
| `asset_class_id` | draft, rejected | — | when `is_capex=true` | |
| `budget_check_result` | — | ✓ (service) | when `budget_allocation_id IS NOT NULL` | |
| `tax_treatment_override` | draft, rejected | — | always | Optional enum |
| `description` | draft, rejected, on_hold | — | always | Annotative |

---

## 5  Cross-entity invariants

Enforced by `validatePurchaseInvoiceInvariants(db, tenantId, invoiceId, ctx)`. All violations are aggregated into a single response.

| # | Code | Rule | Phases |
|---|---|---|---|
| 1 | `HEADER_SUBTOTAL_DRIFT` | `header.subtotal_amount ≈ SUM(line.net_amount)` within ±0.01 | submit, approve, post |
| 2 | `HEADER_TOTAL_DRIFT` | `header.total_amount ≈ SUM(line.gross_amount)` within ±0.01 | submit, approve, post |
| 3 | `AD_SPLIT_PERCENT_NOT_100` | per source line, `SUM(split_pct)=100` ±0.01 | submit, approve, post |
| 3 | `AD_SPLIT_AMOUNT_MISMATCH` | per source line, `SUM(split_amount)=line.net_amount` ±0.01 | submit, approve, post |
| 3 | `AD_SPLIT_QUANTITY_MISMATCH` | per source line, `SUM(split_quantity)=line.quantity` ±0.01 | submit, approve, post |
| 4 | `ASSET_LINE_AD_MISSING_CAPEX` | `line.is_asset=true ⇒ every AD row for that line has is_capex=true AND asset_class_id NOT NULL` | submit, approve, post |
| 5 | `REVERSAL_OF_NOT_POSTED` | `is_reversal=true ⇒ reversal_of_id NOT NULL AND target.is_posted=true` | submit, approve, post |
| 6 | `PO_COMMITMENT_REQUIRED` | `invoice_source IN (po_based, contract_based) ⇒ commitment_id NOT NULL` (DDL also enforces) | submit, approve, post |
| 7 | `PARTY_SNAPSHOT_MISSING` | `status NOT IN (draft, rejected) ⇒ invoice_party_snapshot row exists` | approve, post |
| 8 | `APPROVAL_AUDIT_PAIR_MISMATCH` | `(approved_at IS NULL) = (approved_by IS NULL)` | submit, approve, post |

The wire-in points:
- `handleSubmitForApproval` — phase=`submit`, runs before snapshot capture and status change.
- `handlePostInvoice` — phase=`post`, runs after status check, before GL JE construction.
- Approve phase invariants ride along on the submit response path (auto-approve / self-approve) because no separate approve handler exists; the equivalent is the snapshot-existence check at post time.

---

## 6  Server enforcement contract

### 6.1  Field write rejection

`isEntityFieldWritable(rule, action, recordStatus)` returns:

| Outcome | When | API behavior |
|---|---|---|
| `{ writable: true }` | passes all checks | field included in UPDATE |
| `{ writable: false, reason: 'FIELD_NOT_REGISTERED' }` | field absent from `entity_field` | silent drop (back-compat) |
| `{ writable: false, reason: 'FIELD_READ_ONLY' }` | `is_read_only=true` | silent drop |
| `{ writable: false, reason: 'FIELD_COMPUTED' }` | `is_computed=true` | silent drop |
| `{ writable: false, reason: 'FIELD_WRITE_ONCE' }` | `is_write_once=true` on UPDATE | silent drop |
| `{ writable: false, reason: 'FIELD_SYSTEM_MANAGED' }` | in `SYSTEM_WRITE_COLUMNS` | silent drop |
| `{ writable: false, reason: 'FIELD_SYSTEM_ORIGIN' }` | `origin='system'` (except status) | silent drop |
| `{ writable: false, reason: 'FIELD_NOT_EDITABLE' }` | `editability.editable=false` or empty `editable_in` | silent drop |
| `{ writable: false, reason: 'FIELD_LOCKED_BY_STATUS' }` | `editable_in_status` does not include current status | **400** `FIELD_NOT_EDITABLE` with `fields: [{field, reason}]` |

### 6.2  Optimistic concurrency

PATCH callers MUST send `expected_row_version` (number) at the top-level body. Server returns `409 VERSION_CONFLICT { current_version }` on mismatch.

### 6.3  Invariant rejection

`POST /api/records/purchase_invoice/{id}/action/submit` (and any other path triggering submit) returns `422 INVOICE_INVARIANT_VIOLATION { violations: [{code, message, details}] }` when invariants fail.

---

## 7  How to add a new field rule

1. **Add the entity_field row** to `042_entity_field.sql` (in the appropriate INSERT block).
2. **Add the rule** to `042_entity_field_rules_purchase_invoice.sql` (header rules), or `042_entity_field_rules_pi_line_and_ad.sql` (line/AD rules).
3. **For `is_computed=true` fields**: also set `compute_mode` (CHECK constraint `ef_computed_chk` enforces non-null). Use:
   - `'generated'` — PostgreSQL GENERATED ALWAYS AS STORED columns
   - `'trigger'`   — maintained by a DB trigger function
   - `'service'`   — maintained by application service code
   Also confirm the column is NOT flagged `is_write_once=true` (constraint `ef_computed_writeonce_chk`).
4. **Update the matrix tables** in this document (sections 2–4).
5. **Run** `npx tsx server/scripts/verify-field-rules.ts` against a local DB to confirm coverage and validity.
6. **Update the threshold** in `verify-field-rules.ts` (`COVERAGE_THRESHOLDS`) if the new field changes the expected minimum count, and add the `table.column` to `TRIGGER_OR_SERVICE_MAINTAINED` if it's not GENERATED.

---

## 8  Audit & diagnostics

| Resource | Purpose |
|---|---|
| `control.v_entity_field_contract_audit` | Per-field flags: missing rules, legacy keys, suspected unflagged computed fields. |
| `control.v_entity_field_rule_coverage` | Per-entity counts of editable / visible / computed coverage. |
| `server/scripts/verify-field-rules.ts` | CI gate. Run against staging before promoting to prod. |

---

## 9  Phase-2 / deferred items

| Item | Reason for deferral |
|---|---|
| JSON-logic predicate vocabulary (`E_EDIT`, `E_PO_SRC`, etc.) | Current ad-hoc shape suffices for AP; upgrade only when compound conditions surface. |
| `invoice_tax_snapshot` population | Jurisdiction-specific; phase-2 by DDL comment. |
| One-time-supplier snapshot from invoice metadata | Out of scope for v1; supplier_id NULL invoices skip with warning. |
| Cross-field `visible_when` (e.g. `currency_code != base_currency_code`) | Evaluator supports field-vs-value only; cross-field comparison is phase-2. |
| Non-PI source types for AD parent-status lookup (COMMITMENT_LINE, GR, SES, PR) | Sprint 1 covered PI only; other AP/P2P modules wire in their own sprints. |
