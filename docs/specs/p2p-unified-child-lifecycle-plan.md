# P2P Unified Child Lifecycle Plan

**Date:** 2026-06-22  
**Scope:** purchase requisition, purchase order/commitment, receipt, service sheet, purchase invoice, and their AD/PC/SL child carriers.  
**Decision:** one parent document lifecycle controls child editability; AD, PC, and SL use consistent business actions.

---

## 1. Target Decision

Use one lifecycle rule across P2P documents:

```text
Header status controls header, lines, AD, PC, and SL.
```

For business users and APIs, child tables should behave consistently:

```text
Draft-like parent status:
  AD = replace accounting distributions
  PC = replace pricing components
  SL = replace schedule lines

Review / approval / posted / terminal parent status:
  AD = read-only
  PC = read-only
  SL = read-only
```

Only internal storage may differ:

```text
AD = replace draft rows, freeze posted accounting snapshot
PC = replace draft rows, freeze with parent; use generic audit/snapshot for history
SL = replace draft rows; preserve prior version only if downstream references exist
```

Do not expose words like `supersede`, `superseded`, or `version chain` to business users for PC. Use `replace`, `change`, `save`, and `history`.

---

## 2. Unified Status Groups

Do not force all documents to use identical status names. Instead, map existing statuses into common editability groups.

| Group | Meaning | Child behavior |
|---|---|---|
| `editable` | Maker is preparing the document. | AD/PC/SL can be replaced through approved commands. |
| `review` | Document is submitted for acceptance or approval. | Child records read-only except allowed review metadata corrections. |
| `approved_not_posted` | Business approval complete; posting/conversion not done. | Child records read-only; posting/conversion service may finalize snapshots. |
| `active_or_posted` | Document has operational or accounting effect. | Child records immutable; downstream processes may read them. |
| `terminal` | Document is closed, cancelled, reversed, expired, fully converted, or rejected without reopen. | Child records immutable. |

Recommended status mapping:

| Document | Editable | Review | Approved not posted | Active / posted | Terminal |
|---|---|---|---|---|---|
| Purchase requisition | `draft`, reopened `rejected` | `pending_approval` | `approved` | `partially_converted`, `fully_converted` | `closed`, `cancelled` |
| Purchase order / commitment | `draft` | `pending_approval` | `approved` | `active`, `partially_fulfilled`, `fully_fulfilled` | `closed`, `cancelled`, `expired`, `suspended` |
| Receipt | `draft` | `pending_approval` | `approved` | `posted` | `reversed`, `cancelled` |
| Service sheet | `draft` | `pending_acceptance`, `pending_approval` | `accepted`, `approved` | `posted` | `reversed`, `cancelled` |
| Purchase invoice | `draft`, reopened `rejected` | `pending_approval` | `approved` | `posted`, `partially_paid`, `fully_paid`, `on_hold` | `reversed`, `cancelled` |

Policy notes:

- `rejected` should not automatically mean editable. Prefer an explicit `reopen_to_draft` or `request_revision` transition.
- `on_hold` is not edit mode. It pauses processing; it should not reopen child edits.
- Approver corrections must be allowlisted and audited. Accounting, pricing, tax, schedule, and posting-impacting date changes should normally return the document to draft/revision.

---

## 3. Document-by-Document Child Ownership

### 3.1 Purchase requisition

Header/line:

```text
document.purchase_requisition
document.purchase_requisition_line
```

Child source type:

```text
PURCHASE_REQUISITION_LINE
```

Recommended child behavior:

| Child | Applies? | Draft action | Freeze point | Notes |
|---|---|---|---|---|
| AD | yes | Replace distributions. | PR approval. | Used for pre-encumbrance/budget intent. |
| PC | yes, if PR pricing/tax terms are enabled | Replace pricing components. | PR approval. | Keep simple; no PC lifecycle. |
| SL | yes | Replace schedule lines. | PR approval/conversion. | Required-by schedule can copy to PO during conversion. |

Conversion rule:

```text
PR approval freezes child intent.
PO conversion copies current PR line, AD, PC, and SL values into commitment context where required.
```

### 3.2 Purchase order / commitment

Header/line:

```text
document.commitment
document.commitment_line
```

Child source type:

```text
COMMITMENT_LINE
```

Recommended child behavior:

| Child | Applies? | Draft action | Freeze point | Notes |
|---|---|---|---|---|
| AD | yes | Replace distributions. | PO approval/activation. | Used for encumbrance and future posting basis. |
| PC | yes | Replace pricing components. | PO approval/activation. | Discounts, charges, tax/withholding/retention terms if PO-level terms are modeled in PC. |
| SL | yes | Replace schedule lines until approved. | PO approval/activation. | After downstream receipt/service/invoice references exist, schedule changes require amendment/version preservation. |

Amendment rule:

```text
Once PO is active or partially fulfilled, do not edit original child rows directly.
Use a PO amendment flow that produces new effective child values.
```

For SL specifically:

```text
If schedule has no downstream reference: replace.
If schedule has receipt/service/invoice references: create revised schedule and keep old schedule for audit.
```

### 3.3 Receipt

Header/line:

```text
document.receipt
document.receipt_line
```

Child source type:

```text
RECEIPT_LINE
```

Recommended child behavior:

| Child | Applies? | Draft action | Freeze point | Notes |
|---|---|---|---|---|
| AD | yes | Replace distributions if receipt carries posting split. | Receipt posting. | Used for inventory/accrual/accounting snapshot where required. |
| PC | yes, only if receipt-side charges/tax adjustments are enabled | Replace pricing components. | Receipt posting. | Keep rare; most pricing should originate PO/PI. |
| SL | no as owner | n/a | n/a | Receipt consumes PO schedule; it should reference schedule/fulfillment, not own schedule lines. |

Receipt schedule rule:

```text
Receipt lines should consume current commitment schedule lines.
They should not create their own schedule_line rows unless a future business requirement proves receipt-owned schedules are needed.
```

### 3.4 Service sheet

Header/line:

```text
document.service_sheet
document.service_sheet_line
```

Child source type:

```text
SERVICE_SHEET_LINE
```

Recommended child behavior:

| Child | Applies? | Draft action | Freeze point | Notes |
|---|---|---|---|---|
| AD | yes | Replace distributions. | Service sheet posting. | Used for service accrual/expense accounting. |
| PC | yes, if service-side tax/retention/withholding is captured here | Replace pricing components. | Acceptance/approval/posting depending policy. | Keep consistent with PI/PO PC behavior. |
| SL | no as owner by default | n/a | n/a | Service sheet consumes PO/service schedule or milestone. |

Service schedule rule:

```text
Service sheet lines may reference commitment schedule/milestone lines.
They should not own schedule_line rows unless the service sheet itself becomes an authoring document for future service milestones.
```

### 3.5 Purchase invoice

Header/line:

```text
document.purchase_invoice
document.purchase_invoice_line
```

Child source type:

```text
PURCHASE_INVOICE_LINE
```

Recommended child behavior:

| Child | Applies? | Draft action | Freeze point | Notes |
|---|---|---|---|---|
| AD | yes | Replace distributions. | PI posting. | Final AD rows become accounting snapshot. |
| PC | yes | Replace pricing components. | PI approval/posting. | Discounts, charges, tax, withholding, retention. |
| SL | yes for non-PO or invoice-authored milestones | Replace schedule lines while draft. | PI approval/posting. | PO-based PI usually references upstream PO/receipt/service schedules instead of owning new schedules. |

Invoice rule:

```text
PI owns AD and PC.
PI owns SL only when invoice itself defines billing milestones or delivery/payment schedule.
PO-based PI should prefer references to PO/receipt/service schedule history.
```

---

## 4. Consistent Child Commands

Replace generic child `PATCH` with parent-gated commands.

All commands should share this shape:

```text
saveChild(parent_document_id, line_id, rows, expected_parent_row_version, actor, reason?)
```

Recommended commands:

| Child | Command | Behavior |
|---|---|---|
| AD | `saveAccountingDistributions(source, rows)` | Replace all current draft AD rows for the source line. |
| PC | `savePricingComponents(source, rows)` | Replace all current draft PC rows for the source header/line. |
| SL | `saveScheduleLines(source, rows)` | Replace draft SL rows; preserve old schedule only when referenced. |

Command rules:

1. Check parent status group first.
2. Deny child edit unless parent is `editable`.
3. Require parent `expected_row_version`.
4. Write one audit event at the document level.
5. Recalculate derived totals and validation flags.
6. Return the refreshed document child projection.

---

## 5. Required DDL Changes

### 5.1 Standard child audit envelope

Ensure AD, PC, and SL all carry:

```sql
metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
created_at  timestamptz NOT NULL DEFAULT now(),
created_by  uuid        NOT NULL,
updated_at  timestamptz,
updated_by  uuid,
row_version bigint      NOT NULL DEFAULT 1
```

Specific changes:

| Table | Change |
|---|---|
| `accounting_distribution` | Add `tags`; confirm `row_version` trigger. |
| `pricing_component` | Keep `tags`; confirm `row_version` trigger. |
| `schedule_line` | Add `tags`; confirm `row_version` trigger. |

### 5.2 Remove PC lifecycle vocabulary

Target design:

```text
PC does not need a special lifecycle.
PC rows are current editable child rows until parent freezes.
```

Migration work:

| Area | Change |
|---|---|
| DDL | Stop adding new PC replacement-chain columns. If existing `superseded_*` columns remain, mark internal/deprecated. |
| Triggers | Retire `supersede-only` update behavior when the new save command is ready. |
| Indexes | Remove active-row dependency on `superseded_by_id IS NULL` after compatibility period. |
| Views | Expose `v_current_pricing_component` without business-facing supersede vocabulary. |
| Audit | Use generic audit/document snapshot for previous draft pricing values. |

Compatibility option:

```text
Phase 1 may keep existing superseded_* physical columns.
Phase 2 stops writing them for normal draft replacement.
Phase 3 removes or hides them after data migration.
```

### 5.3 Rename SL technical vocabulary

Target business/API vocabulary:

```text
replace schedule
revise schedule
schedule history
```

DDL recommendation:

| Existing / old name | Target |
|---|---|
| `supersedes_at` | `revised_at` |
| `status='superseded'` | `status='revised'` or keep internal only |
| `supersedeSchedulesForLine` | `saveScheduleLines` / `reviseScheduleLines` |

### 5.4 Current child views

Create or standardize:

```sql
document.v_current_accounting_distribution
document.v_current_pricing_component
document.v_current_schedule_line
```

View contract:

| View | Rule |
|---|---|
| AD | Current rows for source line under parent status gate. |
| PC | Current rows for source document/line. |
| SL | `is_current_version = true AND terminal_status IS NULL`. |

Consumers must use views/resolvers instead of ad hoc filters.

---

## 6. Service/API Changes

### 6.1 Retire PC supersede endpoints

Current code has API/routes/helpers that expose `supersede`. Replace them.

| Current concept | Target |
|---|---|
| `/components/supersede` | `/components/save` or `/pricing-components/save` |
| `supersedeComponent(...)` | `savePricingComponents(...)` |
| `supersede` request body block | none |
| `ALREADY_SUPERSEDED` error | normal edit conflict or stale version conflict |
| UI label `Components superseded` | `Pricing changes` or `Change history` |

### 6.2 Add common parent edit guard

Create one shared guard:

```text
assertChildEditable(source_doc_type, source_doc_id, actor, action)
```

It should:

1. Resolve the parent header from `source_doc_type`.
2. Map parent status to status group.
3. Check child action policy.
4. Check role/permission.
5. Check parent `row_version`.
6. Return a normalized decision.

### 6.3 Add document-specific source resolver

Create one source resolver for all P2P child carriers:

| Source type | Header table | Line table |
|---|---|---|
| `PURCHASE_REQUISITION_LINE` | `purchase_requisition` | `purchase_requisition_line` |
| `COMMITMENT_LINE` | `commitment` | `commitment_line` |
| `RECEIPT_LINE` | `receipt` | `receipt_line` |
| `SERVICE_SHEET_LINE` | `service_sheet` | `service_sheet_line` |
| `PURCHASE_INVOICE_LINE` | `purchase_invoice` | `purchase_invoice_line` |

This resolver becomes the single source for AD/PC/SL parent gating.

---

## 7. UI Changes

### 7.1 Use consistent verbs

| Area | Use |
|---|---|
| AD | `Edit distributions`, `Save distributions`, `Replace distributions` |
| PC | `Edit pricing`, `Save pricing`, `Replace pricing component` |
| SL | `Edit schedule`, `Save schedule`, `Revise schedule` only when history exists |

Do not show `supersede`.

### 7.2 Use one child editability banner

For all AD/PC/SL panels:

```text
Editable while document is draft.
Read-only during approval.
Frozen after approval/posting according to document policy.
```

If the approver needs a change:

```text
Request revision
```

Do not open child edit drawers in `pending_approval` except for allowlisted review metadata.

---

## 8. Tests and Verifiers

### 8.1 Unit tests

Add tests for:

- status group mapping per document,
- child edit guard,
- AD replace command,
- PC replace command,
- SL replace vs revise decision,
- approver correction allowlist.

### 8.2 Integration tests

Add one flow per document:

| Document | Test |
|---|---|
| PR | Draft child edits allowed; pending approval child edits denied; approved child edits denied. |
| PO | Draft child edits allowed; active child edits denied; amendment path required. |
| Receipt | Draft AD/PC edits allowed; posted edits denied. |
| Service sheet | Draft child edits allowed; pending acceptance/approval edits denied; posted edits denied. |
| PI | Draft AD/PC/SL edits allowed; pending approval denied; approved/posting behavior enforced. |

### 8.3 Static verifiers

Add or update scripts:

```text
verify-child-carrier-audit-envelope.ts
verify-p2p-child-edit-policy.ts
verify-no-business-supersede-language.ts
verify-child-current-view-usage.ts
```

---

## 9. Migration Phases

### Phase 1: Policy and documentation

- Approve this unified child lifecycle plan.
- Update existing audit recommendation report.
- Mark `purchase_invoice.status` and equivalent P2P header statuses as parent edit authority.
- Agree that PC uses replace language only.

### Phase 2: Read consistency

- Add current child views.
- Route UI/read services through current resolvers.
- Stop ad hoc `superseded_by_id IS NULL` filters outside compatibility code.

### Phase 3: Write consistency

- Implement `saveAccountingDistributions`.
- Implement `savePricingComponents`.
- Implement `saveScheduleLines`.
- Add shared parent edit guard.
- Deny generic child `PATCH` outside these commands.

### Phase 4: PC simplification

- Retire `/components/supersede` API.
- Remove `supersede` request body from BFF/runtime contracts.
- Rename UI labels and comments.
- Keep old physical columns only as compatibility if needed.

### Phase 5: SL vocabulary cleanup

- Rename schedule service methods from supersede language to revise/replace language.
- Rename `supersedes_at` to `revised_at` if migration is acceptable.
- Keep old field as compatibility alias only during rollout.

### Phase 6: Enforcement and tests

- Add DB/service tests.
- Add static verifiers.
- Add CI gate for no business-facing `supersede` language in PC routes/UI.

---

## 10. Final Target Model

```text
P2P header lifecycle controls children.

PR / PO / Receipt / Service Sheet / PI
  Header status decides editability.
  Lines inherit header editability.
  AD, PC, and SL inherit header editability.

Draft:
  Replace AD.
  Replace PC.
  Replace SL.

Review / approved / posted / terminal:
  Read-only children.
  Request revision or amendment for business changes.

Exception:
  SL preserves prior schedule only when downstream references require exact history.
```

This gives business users one simple rule while keeping enough internal history for audit and downstream correctness.
