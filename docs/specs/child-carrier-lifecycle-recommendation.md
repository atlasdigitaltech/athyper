# Child Carrier Lifecycle Recommendation

**Date:** 2026-06-22  
**Scope:** `document.accounting_distribution`, `document.pricing_component`, `document.schedule_line`  
**Recommendation:** use one document lifecycle, with minimal child history policies.

---

## 1. Executive recommendation

The current audit recommendation is directionally correct that the three tables have different history needs, but it presents the result as three separate lifecycles. That is the part I would change.

My recommendation is:

1. Keep one lifecycle owner: `purchase_invoice.status`.
2. Treat AD, PC, and SL as child data policies, not independent document lifecycles.
3. Use the smallest child history pattern that satisfies audit and downstream references.
4. Make the tables look and behave consistent through a shared child-carrier contract.
5. Expose one consistent "current rows" read contract to services, UI, posting, and audit.

Do not force all three child tables into the same versioning model. That would make the schema look tidy while making the data less truthful. But also do not describe them as three full lifecycles. That overstates the design.

---

## 2. Problem with the current report

The issue is not only that the fields differ. The bigger issue is that the report makes the difference feel accidental.

From an audit and platform-governance point of view, the reader should see one model:

> Every PI/PIL child carrier has a common audit envelope, a declared lifecycle archetype, a single current-row resolver, and one approved write path.

The lifecycle details can then differ safely behind that model.

---

## 3. Recommended child history policies

| Table | Child policy | Meaning | Current-row rule | Write pattern |
|---|---|---|---|---|
| `accounting_distribution` | Snapshot child | Distribution rows are recomputed from the source line and later frozen for posting audit. | All rows for the source line are current until parent freeze. | Replace set before freeze; freeze after posting. |
| `pricing_component` | Replaceable child | Discount, charge, tax, withholding, or retention rows are editable child inputs until the parent freezes. | Current rows for the source document/line. | Replace current pricing rows while editable; freeze with the parent. |
| `schedule_line` | Versioned child | Downstream receipts, service sheets, or invoice events may need to point at the exact schedule version they consumed. | `is_current_version = true AND terminal_status IS NULL`. | Insert new version, link `previous_version_id`, mark old version non-current. |

This preserves correct business meaning while giving every consumer a stable mental model. The lifecycle is still owned by PI; these are child history policies.

---

## 3A. Detailed example across PI, PIL, AD, PC, and SL

### Business scenario

A supplier submits invoice `PI-1001` for office chairs.

Header:

| Field | Value |
|---|---|
| PI | `PI-1001` |
| Supplier | `ABC Furniture` |
| Currency | `MYR` |
| Status | `draft` |

Line:

| Field | Value |
|---|---|
| PIL | line 10 |
| Item | Ergonomic chair |
| Quantity | 10 |
| Unit price | 500.00 |
| Line gross | 5,000.00 |

The invoice line has three child concerns:

| Concern | Table | Business question |
|---|---|---|
| Pricing/tax | PC | Why is the payable amount not exactly `10 * 500`? |
| Accounting | AD | Which GL/dimension/budget/asset split will be posted? |
| Schedule | SL | When is this line expected to be delivered, billed, or fulfilled? |

### Step 1: PI and PIL are created in draft

`purchase_invoice` is the lifecycle owner:

```text
PI-1001 status = draft
```

`purchase_invoice_line` holds the commercial line:

```text
line 10 = 10 chairs * MYR 500 = MYR 5,000
```

At this stage, all children are editable because the parent invoice is editable.

### Step 2: pricing components explain the commercial math

Initial PC rows:

| PC | Type | Amount | Current? | Meaning |
|---|---:|---:|---|---|
| PC-1 | discount | 250.00 | yes | 5% supplier discount |
| PC-2 | tax | 285.00 | yes | 6% SST on net amount |

Calculation:

```text
Gross line amount       5,000.00
Less discount             250.00
Taxable base            4,750.00
Add SST 6%                285.00
Invoice line total      5,035.00
```

Later, while still in draft, the buyer changes the discount from 5% to 7%.

Do not expose this as a special lifecycle action. To the user, this is simply:

```text
Replace discount 5% with discount 7%.
```

The system does not need a special PC row lifecycle for this. If change history is required, use the generic audit log or document snapshot.

| PC | Type | Amount | Current? |
|---|---:|---:|---|
| PC-3 | discount | 350.00 | yes |
| PC-4 | tax | 279.00 | yes |

New calculation:

```text
Gross line amount       5,000.00
Less discount             350.00
Taxable base            4,650.00
Add SST 6%                279.00
Invoice line total      4,929.00
```

Why PC should use simple replacement:

- Draft pricing/tax rows are working data until the PI is approved or posted.
- The current commercial calculation is what posting needs.
- If the business wants to inspect prior draft changes, that belongs in the generic audit trail, not in a special PC lifecycle.

### Step 3: accounting distribution explains posting allocation

Initial AD rows:

| AD | Split | Cost center | GL account | Amount |
|---|---:|---|---|---:|
| AD-1 | 60% | ADMIN | Office supplies expense | 2,957.40 |
| AD-2 | 40% | SALES | Office supplies expense | 1,971.60 |

Total:

```text
2,957.40 + 1,971.60 = 4,929.00
```

Before posting, the user changes the split to 50/50.

For AD, the simplest correct behavior is:

```text
delete/rebuild AD rows for this PIL while PI is editable
```

New AD rows:

| AD | Split | Cost center | GL account | Amount |
|---|---:|---|---|---:|
| AD-3 | 50% | ADMIN | Office supplies expense | 2,464.50 |
| AD-4 | 50% | SALES | Office supplies expense | 2,464.50 |

Why AD should not be fully versioned:

- Draft accounting splits are working data.
- Audit normally cares what was actually posted, not every draft allocation attempt.
- Full versioning would add noise and operational burden.

At posting, AD becomes the frozen accounting snapshot:

```text
PI status changes approved -> posted
AD-3 and AD-4 freeze with final GL, amount, dimension, budget, asset, and FX values
```

### Step 4: schedule line explains fulfillment timing

Initial SL row:

| SL | Schedule date | Quantity | Current? | Status |
|---|---|---:|---|---|
| SL-1 | 2026-07-10 | 10 | yes | active |

Now assume 4 chairs are received against this schedule.

The receipt points to `SL-1`:

```text
Receipt line: 4 chairs received against schedule_line_id = SL-1
```

Then the supplier says the remaining 6 chairs will arrive on 2026-07-20.

This is why SL is different. We cannot simply overwrite `SL-1`, because the receipt already used it.

Recommended SL result:

| SL | Previous version | Schedule date | Quantity | Current? | Fulfilled |
|---|---|---|---:|---|---:|
| SL-1 | null | 2026-07-10 | 10 | no | 4 |
| SL-2 | SL-1 | 2026-07-20 | 6 | yes | 0 |

Why SL needs versioning:

- Downstream fulfillment references the exact schedule it consumed.
- If we overwrite the date or quantity, old receipts become historically misleading.
- The current schedule is for remaining work, while the old schedule remains audit history.

### Step 5: parent status freezes the children

The PI status remains the lifecycle authority:

| PI status | PI/PIL | PC | AD | SL |
|---|---|---|---|---|
| `draft` | editable | editable through replace command | replaceable | revisable |
| `pending_approval` | limited edits or locked by policy | usually locked | usually locked | usually locked |
| `approved` | ready to post | frozen for posting | final posting update allowed | current schedule readable |
| `posted` | immutable | immutable | frozen snapshot | historical/current reads only |

The children should not each invent their own lifecycle independent of PI.

### Step 6: final audit view

For audit, show one unified view:

```text
PI-1001 posted at 2026-06-22

Line 10:
  Quantity: 10
  Gross: MYR 5,000.00
  Current pricing:
    Discount: MYR 350.00
    SST: MYR 279.00
    Net payable: MYR 4,929.00
  Accounting posted:
    ADMIN 50%: MYR 2,464.50
    SALES 50%: MYR 2,464.50
  Schedule:
    Original schedule: 10 chairs on 2026-07-10, 4 fulfilled
    Current remaining schedule: 6 chairs on 2026-07-20
```

That is the point of the recommendation: make the audit output unified even though the tables preserve different kinds of history internally.

---

## 3B. Why this is not over-engineering

It becomes over-engineering if each child table is treated as a full lifecycle entity.

Avoid this:

```text
AD lifecycle + PC lifecycle + SL lifecycle + PI lifecycle
```

Use this instead:

```text
PI lifecycle
  AD = replaceable draft data, frozen at posting
  PC = replaceable draft pricing data, frozen with the parent
  SL = schedule versions only when downstream references require history
```

The design should be implemented as three small storage/write policies under one PI lifecycle, not as three independent lifecycle state machines.

---

## 3C. Make child tables consistent

The child tables should be consistent in how the platform sees them.

Recommended rule:

```text
PI/PIL lifecycle is the only lifecycle.
AD, PC, and SL are child records governed by the parent lifecycle.
```

That means AD, PC, and SL should share the same external contract:

| Contract area | AD | PC | SL |
|---|---|---|---|
| Parent ownership | PI/PIL | PI/PIL | PI/PIL |
| Edit authority | Parent PI status | Parent PI status | Parent PI status |
| Draft behavior | editable by command | editable by command | editable by command |
| Approval behavior | read-only unless returned to draft | read-only unless returned to draft | read-only unless returned to draft |
| Posting behavior | frozen as accounting snapshot | frozen as pricing basis | frozen/read-only schedule history |
| Posted behavior | immutable | immutable | immutable except downstream read references |
| Audit fields | same envelope | same envelope | same envelope |
| Current read | resolver/view | resolver/view | resolver/view |
| Generic PATCH | no | no | no |

The consistency should be implemented in the service/API layer and optionally in database views.

### Recommended current views

Create one current view per child table so consumers do not need to know internal details:

```sql
-- AD has no replacement chain; current = existing rows for the line before/at posting.
document.v_current_accounting_distribution

-- PC is just the current pricing set for the source.
document.v_current_pricing_component

-- SL hides version and terminal rows.
document.v_current_schedule_line
WHERE is_current_version = true
  AND terminal_status IS NULL
```

Every consumer should read current child rows through these views or equivalent service resolvers:

```text
resolveAccountingDistributions(pil_id)
resolvePricingComponents(pi_id, pil_id)
resolveScheduleLines(pil_id)
```

### Recommended write commands

All child writes should have the same parent-gated shape:

```text
command(parent_id, line_id, payload, expected_parent_row_version)
```

Then each command handles its internal storage policy:

| Command | Internal behavior |
|---|---|
| `saveAccountingDistributions(...)` | Replace current draft AD set. |
| `savePricingComponents(...)` | Replace current draft PC rows; rely on generic audit/snapshot for change history. |
| `saveScheduleLines(...)` | Update directly if unreferenced; create new version if referenced. |

From the caller's point of view, all three are simply:

```text
Save child data for this PI/PIL while the parent is editable.
```

### Recommended parent status matrix

Use one matrix across all child tables:

| PI status | AD | PC | SL |
|---|---|---|---|
| `draft` | editable | editable | editable |
| `pending_approval` | read-only | read-only | read-only |
| `approved` | read-only; posting service may finalize | read-only | read-only |
| `posted` | immutable | immutable | immutable |
| `rejected` | editable only if reopened to draft | editable only if reopened to draft | editable only if reopened to draft |
| `cancelled` | immutable | immutable | immutable |

This is the consistency target.

### What may still differ internally

Only the persistence detail should differ:

```text
AD: replace rows because draft accounting split history is not useful.
PC: replace rows because draft pricing/tax inputs should behave like normal editable child data.
SL: version rows only when downstream references require exact history.
```

These differences should not leak into UI, audit reports, or generic service consumers.

---

## 3D. Approver corrections during pending approval

Default rule:

```text
pending_approval is review mode, not edit mode.
```

However, some tenants may want approvers to make small corrections without sending the invoice back to draft. Support this through an explicit policy:

```text
allow_approver_corrections = true
```

Even with that policy enabled, approver edits must be field-scoped. Do not allow blanket editing of PI, PIL, AD, PC, and SL in `pending_approval`.

### Recommended approver-edit categories

| Field category | Example | Allow direct approver edit? | Reason |
|---|---|---|---|
| Review metadata | approval comment, internal note, attachment note | yes | Does not change accounting, tax, amount, fulfillment, or supplier obligation. |
| Non-financial classification | internal tag, priority, follow-up owner | yes | Operational only. |
| Display-only correction | typo in description, if not used for posting/matching | usually yes | Low risk if it does not feed rules. |
| Invoice header date | invoice date, posting date, due date | usually no direct edit | May affect fiscal period, tax period, FX rate, payment terms, aging, and approval thresholds. |
| PC pricing/tax | discount, charge, tax, withholding, retention | no direct edit | Changes payable amount and may require recalculation/re-approval. |
| AD accounting split | GL account, cost center, project, budget, asset | no direct edit | Changes posting result and budget/accounting approval basis. |
| SL schedule | promised date, delivery date, milestone date | policy-dependent | May be operational only, but can affect matching, delivery commitments, or accrual timing. |

### Date-change recommendation

Do not treat all dates the same.

| Date type | Recommendation |
|---|---|
| `approval_comment_date` / reminder date | Allow direct edit. |
| `invoice_date` | Do not allow direct edit in `pending_approval`; return to draft or require revalidation. |
| `posting_date` | Do not allow direct edit in `pending_approval`; it affects GL period. |
| `due_date` | Allow only if manually overridden and payment terms are not recalculated; audit the override. |
| `schedule_line.scheduled_date` | Allow only if policy says schedule is non-financial for this invoice type and no downstream reference exists. Otherwise request revision. |

### Accounting fields recommendation

For accounting fields, my recommendation is strict:

```text
Approver should not directly edit AD in pending_approval.
```

AD fields decide the accounting output. If the approver changes cost center, GL account, budget, project, asset, or split percentage, the approval basis has changed. The right action is:

```text
pending_approval -> request_revision -> draft/revision_required
```

Then the maker updates AD/PC/SL and resubmits.

### If direct approver correction is enabled

If the business insists on direct approver correction, use a controlled command:

```text
applyApproverCorrection(pi_id, field_patch, reason, approver_id)
```

This command must:

1. Validate the field is on the allowed approver-correction allowlist.
2. Write an approval audit event.
3. Recalculate dependent values if needed.
4. Decide whether approval must restart.
5. Record the reason and before/after values.

Restart approval when the edit changes:

- supplier obligation,
- invoice total,
- tax/withholding/retention,
- accounting distribution,
- budget result,
- GL period,
- payment due date by payment-term recalculation,
- schedule fields already referenced by downstream documents.

Do not restart approval for review-only metadata changes.

---

## 4. Common child-carrier contract

All three tables should implement this contract, even though their lifecycle internals differ.

### 4.1 Universal audit envelope

Every child carrier should carry:

```sql
metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
created_at  timestamptz NOT NULL DEFAULT now(),
created_by  uuid        NOT NULL,
updated_at  timestamptz,
updated_by  uuid,
row_version bigint      NOT NULL DEFAULT 1
```

Recommendation:

- Add `tags` to `accounting_distribution`.
- Add `tags` to `schedule_line`.
- Keep `tags` on `pricing_component`.
- Keep `row_version` on all three through the shared row-version trigger pattern.

This gives audit, search, operational tagging, and UI filtering a consistent base.

### 4.2 Declared lifecycle archetype

Each table should declare its archetype in the table comment and entity descriptor metadata:

```text
child_lifecycle_archetype = snapshot | replaceable | versioned
current_row_resolver      = resolveAccountingDistributions | resolvePricingComponents | resolveScheduleLines
write_contract            = replace_all | replace | revise_version
```

This is not necessarily a physical column. It is a platform contract.

### 4.3 One current-row resolver per table

No UI, posting service, audit export, or workflow service should hand-write its own filter.

Use these resolvers:

| Resolver | Returns |
|---|---|
| `resolveAccountingDistributions(source)` | Current AD rows for the source line. |
| `resolvePricingComponents(source)` | Current PC rows for the source document/line. |
| `resolveScheduleLines(source)` | SL rows where `is_current_version = true` and `terminal_status IS NULL`. |

This is the main consistency win. The tables may store history differently, but consumers get the same contract: "give me the active children for this source."

---

## 5. Required schema cleanups

### 5.1 Remove "supersede" vocabulary from child tables

Avoid `supersede`, `superseded`, and `supersedes` in product language and new API names. The word is too technical and creates unnecessary confusion for business users.

Recommended vocabulary:

| Concept | Use this word |
|---|---|
| PC row changed | `replace` |
| SL old schedule changed into a new version | `revise` |
| AD draft rows rebuilt | `replace` |

For PC, do not add a special replacement chain unless a hard audit requirement appears. Prefer generic audit logging and document snapshots.

For SL, prefer revision vocabulary:

```sql
previous_version_id
revised_at
```

If existing physical columns already use `superseded_*`, keep them internal temporarily and retire them in a cleanup migration if no longer needed. Do not surface `supersede` in UI, API command names, or audit report headings.

### 5.2 Keep PC current-row reads simple

PC should read like normal current child data:

```sql
source_doc_type = :source_doc_type
AND source_doc_id = :source_doc_id
AND (source_line_id = :source_line_id OR :source_line_id IS NULL)
```

Recommendation:

- Do not add `is_current_version` to PC unless there is a real retained-row requirement.
- If PC rows are replaced in-place or delete/reinserted while draft, all PC rows for the source are current.
- If audit history is required, use audit events or document snapshots rather than row-level PC versioning.

### 5.3 Do not add lifecycle status to AD or PC

Do not copy `schedule_line.status`, `terminal_status`, or `fulfillment_status` into AD or PC.

Reason:

- AD lifecycle is governed by the parent document status and posting freeze.
- PC child data is governed by parent editability and generic audit/snapshot history.
- SL has real fulfillment state, so it needs status fields.

Adding status to AD and PC would create duplicate state and eventually drift from the parent PI/PIL lifecycle.

---

## 6. Recommended canonical blocks

Use these as DDL convention blocks.

### Block A: audit envelope

Applies to AD, PC, and SL.

```sql
metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
created_at  timestamptz NOT NULL DEFAULT now(),
created_by  uuid        NOT NULL,
updated_at  timestamptz,
updated_by  uuid,
row_version bigint      NOT NULL DEFAULT 1
```

### Block B: versioning

Applies to SL and future children where downstream rows must reference a specific version.

```sql
version_number     int     NOT NULL DEFAULT 1,
previous_version_id uuid,
is_current_version boolean NOT NULL DEFAULT true,
revised_at         timestamptz
```

### Block C: fulfillment lifecycle

Applies to SL only.

```sql
status             text NOT NULL DEFAULT 'active',
status_source      text NOT NULL DEFAULT 'manual',
terminal_status    text,
fulfillment_status text NOT NULL DEFAULT 'open'
```

---

## 7. PI/PIL wiring recommendation

Use the parent document status as the freeze authority.

| Child | Parent scope | Save behavior | Submit/post behavior | UI behavior |
|---|---|---|---|---|
| AD | PIL line only | Replace all rows for the line while editable. | Freeze final resolved account, base amount, budget, and asset snapshots at posting. | Distribution card on line detail. Read-only after freeze. |
| PC | PI header and PIL line | Replace current pricing rows while editable. | Current PC rows participate in pricing, tax, withholding, retention, and posting. | Pricing component grid; normal audit timeline shows changes if needed. |
| SL | PIL line only | Revise by creating a new version when downstream references exist. | Downstream rows keep pointing at the schedule version they consumed. | Delivery/billing schedule tab showing current versions by default. |

No generic `PATCH` should be exposed directly against these child tables. Each table needs one write command that matches its archetype:

| Table | Approved command |
|---|---|
| AD | `replaceAccountingDistributions(sourceLineId, rows)` |
| PC | `savePricingComponents(source, rows)` |
| SL | `reviseScheduleLine(oldId, newRow)` |

---

## 8. Audit presentation recommendation

The audit report should stop presenting "different columns" as the primary story.

Recommended audit-report structure:

1. Common child-carrier controls.
2. Declared lifecycle archetype per table.
3. Current-row resolver per table.
4. Approved write command per table.
5. Freeze authority from parent PI/PIL status.
6. Exceptions and why they exist.

This makes the audit conclusion cleaner:

> The design is consistent because every child carrier follows the same governance contract. The lifecycle fields differ only where the business object has a different historical obligation.

---

## 9. Implementation plan

### Phase 1: naming and audit envelope

- Remove `supersede` vocabulary from UI/API/reporting; use `replace` for PC and `revise` for SL.
- Add `tags` to `accounting_distribution`.
- Add `tags` to `schedule_line`.
- Update comments and entity descriptors with `child_lifecycle_archetype`.

### Phase 2: current-row consistency

- Add indexes for current-row resolvers where missing.
- Ensure all UI and posting reads go through resolver functions or service methods.

### Phase 3: write-path enforcement

- Remove or block generic child `PATCH` routes for AD, PC, and SL.
- Keep only archetype-specific write commands.
- Add tests proving old rows cannot be silently mutated through the wrong path.

### Phase 4: audit-report rewrite

- Replace the current "three tables behave differently" framing with the child-carrier contract.
- Keep the archetype explanation, but move it under a positive governance model.

---

## 10. Final decision

Adopt a unified child-carrier governance model:

```text
AD = audit envelope + snapshot lifecycle
PC = audit envelope + replaceable child policy
SL = audit envelope + versioned fulfillment lifecycle
```

This is the right compromise. It removes the visual and audit inconsistency without flattening three different business problems into one false lifecycle model.
