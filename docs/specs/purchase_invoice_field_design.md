# Purchase Invoice — Canonical Field & Architecture Spec

**Version:** v1.2 (architecturally locked) · **Date:** 2026-06-14
**Scope:** `document.purchase_invoice` (PI), `document.purchase_invoice_line` (PIL), `document.pricing_component` (PC — new), `document.accounting_distribution` (AD), and dependent sub-ledgers (`retention_schedule`, `advance_application`) + sidecar (`accounting_distribution_resolution_audit`).
**Authority:** Single source of truth for the AP module. Field-level seed lives in `server/db/seed/platform/003_control/042_entity_field_rules_*.sql`. CI verifier: `server/scripts/verify-field-rules.ts`.

---

## Document Organization

This spec has two parts:

- **Part A — Architecture, Lifecycle, Migration (v1.2):** Sections 1–11. The architectural plan, locked decisions, table-by-table specification, cascade rules, lifecycle, invariants, migration phases.
- **Part B — Field Matrices (preserved):** Sections 12–17. The per-field editability / visibility / computed reference tables. These are the reference grids the field-rule seeds enforce.

---

# Part A — Architecture, Lifecycle, Migration (v1.2)

## 1. Architectural Principles (Locked)

| # | Principle |
|---|---|
| P1 | Separation of input authority and frozen output. PI/PIL/PC = inputs (mutable in pre-post statuses). AD = output (one final UPDATE at posting, then frozen). Sub-ledgers = time-bound events. |
| P2 | Single cascade direction: PIL → PI → resolve fallback (budget only) → AD. PC is no longer in the dimension/budget chain — PC inherits from PIL at apportion/posting. |
| P3 | Compute, then snapshot. Derived values are recomputed by the service at submit/post; AD snapshots freeze the value forever. |
| P4 | Polymorphic with integrity discipline. PC and AD share the same `(source_doc_type, source_doc_id, source_line_id)` key. Per-type validation trigger required for both. |
| P5 | Real FKs over orphan UUIDs. `asset_category_id` (no master) is removed; replaced with `asset_class_id` FK + `target_asset_id` FK. |
| P6 | Append-leaning history. State transitions write events (`asset_transaction`, `advance_application`, `retention_schedule` milestones). Current state is a projection. |
| P7 | Backwards-compatible migration. No big-bang flips. P1 (PC) shadows for one cycle before readers migrate. P4 has a 30-day dual-write window with drift monitoring. |
| P8 | Pluggable jurisdiction policy. Waterfall, withholding, capitalization-threshold rules are tenant/jurisdiction-configurable. Hard CHECK constraints deferred until policy registry locks. |
| P9 | Facts in DB; interpretation in metadata. DB stores values; `control.entity_field.defaults` + BFF projection expresses inheritance/override interpretation. |

---

## 2. Four-Table Model + Sub-Ledgers

```
                  ┌────────────────────────────┐
                  │  document.purchase_invoice │  (PI — header)
                  └────────────┬───────────────┘
                               │ 1:N
                  ┌────────────▼───────────────┐
                  │ document.purchase_invoice_ │
                  │            line             │  (PIL — line)
                  └────────────┬───────────────┘
                               │
        ┌──────────────────────┼──────────────────────────┐
        │ source_doc_type=PURCHASE_INVOICE_LINE           │
        ▼                                                  │
┌───────────────────────┐  ┌─────────────────────────┐   │
│ document.pricing_     │  │ document.accounting_    │   │
│   component (PC)      │  │   distribution (AD)     │   │
│ NEW polymorphic       │  │ EXISTING polymorphic    │   │
│ No dimensions/budget  │  │ Mutable pre-post;       │   │
│ business_intent_id    │  │ ONE final UPDATE at     │   │
│  is the only routing  │  │ posting; frozen after   │   │
│  override             │  │                         │   │
└───────┬───────────────┘  └────────┬────────────────┘   │
        │                           │                    │
        │ at posting: PC inherits   │                    │
        │ dimensions from source    │                    │
        │ PIL via source_line_id    │                    │
        └────────► AD ◄─────────────┘                    │
                                                          │
        Sub-ledgers + sidecar (new):                     │
        retention_schedule,                              │
        advance_application,                             │
        accounting_distribution_resolution_audit         │
```

### Polymorphic source key — sealed CHECK

PC and AD share `(source_doc_type, source_doc_id, source_line_id)` using the existing AD enum:

| Source type | In sealed CHECK | Notes |
|---|---|---|
| `PURCHASE_REQUISITION_LINE` | yes | |
| `COMMITMENT_LINE` | yes | |
| `PURCHASE_INVOICE_LINE` | yes | **Primary scope** |
| `GOODS_RECEIPT_LINE` | yes | |
| `SERVICE_ENTRY_SHEET_LINE` | yes | |
| `PURCHASE_ORDER_LINE` | no | Future (P6+) requires coordinated CHECK extension |
| `SALES_INVOICE_LINE` | no | Future AR-side workstream |

---

## 3. Table-by-Table Specification

### 3.1 `document.purchase_invoice` (PI)

**No new DDL columns in P0.** PI keeps existing dimension scalars + `budget_allocation_id` + flat amount columns. Cascade semantics expressed via `entity_field.defaults`.

**Phased changes:**
- P0: add CHECK constraints `pi_reversal_pair_chk`, `pi_currency_chk` (NOT VALID then VALIDATE).
- P4: flat amount columns flip from user-input to trigger-maintained caches.
- P5: drop `code`, `is_credit_note`, `is_posted`, `tax_mode`, `tax_mode_source` (after grep-clean).
- P6: re-review `is_active`; introduce hold_event sub-table.

**Status vocabulary (locked, from `pi_status_chk`):**
`draft` · `pending_approval` · `approved` · `rejected` · `posted` · `partially_paid` · `fully_paid` · `on_hold` · `reversed` · `cancelled`.
**`proforma` is NOT a status** — it lives in `invoice_type`.

### 3.2 `document.purchase_invoice_line` (PIL)

**P0 additions:**
- `row_version bigint NOT NULL DEFAULT 1` + `trg_pil_row_version` trigger.
- `budget_allocation_id uuid` FK to `master.budget_allocation`.

**P3 additions (asset refactor):**
- `asset_treatment text NOT NULL DEFAULT 'none'` — discriminator: `none` · `expense_low_value` · `class_pending` · `target_asset`.
- `asset_class_id uuid` FK to `master.asset_class`.
- `target_asset_id uuid` FK to `master.asset`.
- CHECK constraints + validation trigger (`fn_pil_validate_asset_target`).

**P5 drops:**
- `is_asset`, `asset_category_id` (orphan UUID).
- `discount_pct`, `discount_amount`, `tax_group_id`, `tax_amount`, `withholding_tax_group_id`, `withholding_tax_amount`, `retention_amount`, `retention_pct` (moved to PC; flat columns become trigger-maintained caches).

### 3.3 `document.pricing_component` (PC) — NEW in P1

Full DDL spec — see §6.

**Key v1.2 simplification:** PC has **no** dimension columns (`cost_center_id`, `profit_center_id`, `project_id`, `site_id`, `dimension_set_id`) and **no** `budget_allocation_id`. PC term rows inherit these from the source PIL at apportion/posting time.

**What PC carries:**
- Polymorphic source key.
- Term classification: `term_type`, `condition_type_id`, `sequence`.
- Basis & values (non-negative magnitudes; sign derived from term_type).
- Entry & apportionment lineage.
- Origin & cross-document lineage (`origin`, `ref_source_*`, `ref_value` — qualifies for DB intent because PO can be archived).
- Tax/withholding metadata (extends to BOTH term types).
- Currency triad.
- GL routing: `business_intent_id` (the only routing override at term level), `posting_role_code`, `gl_account_id`, `account_source`.
- Supersede chain.
- row_version.

### 3.4 `document.accounting_distribution` (AD)

**P0 additions:**
- `row_version bigint NOT NULL DEFAULT 1` + `trg_ad_row_version` trigger.
- `distributed_amount_base numeric(18,4) NOT NULL` (backfilled).
- `exchange_rate_snapshot numeric(20,10) NOT NULL` (backfilled).
- Polymorphic validation trigger `trg_ad_validate_polymorphic_source`.
- Status-gated mutation trigger `trg_ad_status_gated_mutation` (keys on OLD parent status — enables the final-posting UPDATE).

**P3 additions:**
- `asset_posting_target text` — frozen enum: `cwip_clearing` · `fixed_asset` · `class_clearing` · `expense` · NULL.
- `target_asset_id uuid` FK to `master.asset` (frozen snapshot).

**AD Lifecycle (4 stages — explicit):**

| Stage | Description | AD mutability |
|---|---|---|
| 1. CREATE | Row INSERTed (parent in draft); user defines basis, splits, strategy, dimensions | mutable |
| 2. MUTATE | Parent in draft/pending/approved/on_hold/rejected; user edits | mutable (status-gated trigger allows) |
| 3. FINAL POSTING UPDATE | Posting service runs ONE atomic UPDATE per AD row, fills resolved `gl_account_id`, base amounts, asset snapshots, budget result, encumbrance; INSERTs sidecar audit row | mutable for this one UPDATE (trigger reads OLD parent status — still `approved`) |
| 4. FROZEN | Parent status now `posted`; any further UPDATE/DELETE blocked by status-gated trigger reading OLD `posted` | immutable forever |

The trigger uses OLD parent status, not NEW — this is the critical design that allows Stage 3 while blocking Stage 4.

### 3.5 Retention & Advance — REUSE PTA + PAB (v1.2 P2 correction)

**v1.0/v1.1 originally proposed parallel `document.retention_schedule` and `document.advance_application` tables. P2 audit found these were redundant — the existing PTA + PAB stack covers the territory. Plan corrected.**

The architecture:

```
master.payment_term_clause      (PTC)  — DEFINITION  ("30% advance, 10% retention with milestone release")
              ↓
document.payment_term_application (PTA) — EVALUATION ("INV-001 applied $3,000 advance")
              ↓
document.party_advance_balance  (PAB)  — ROLLUP     ("Supplier ABC has $12k advance outstanding")
```

PC drives **additional, ad-hoc** retention/withholding terms at the invoice. A new seeder service flows PC retention rows into PTA at submit time, where they reuse the existing evaluation/override/reversal machinery.

**What lands in P2:**
- `pricing_component_id` FK column added to `document.payment_term_application` (nullable; non-null for PC-origin rows)
- `document.v_invoice_retention_release_schedule` view (PTA + PTC join for milestone calendar)
- `retention-advance-seeder.service.ts` — submit-time service that creates PTA rows from PC retention rows
- `pta_pc_origin_clause_type_chk` CHECK constraint — PC-origin PTA rows must use retention/advance clause types
- Index on `(tenant_id, pricing_component_id) WHERE NOT NULL` for audit/reversal lookup
- **No new tables.**

See [docs/specs/pta_pab_retention_advance_overlap.md](docs/specs/pta_pab_retention_advance_overlap.md) for the full overlap analysis and rationale.

### 3.6 ~~`document.advance_application`~~ — see §3.5

Superseded by §3.5. PTA's `clause_type='ADVANCE_RECOVERY'` rows already capture advance application events. PC link via the new `pricing_component_id` column when ad-hoc PC drives the application.

### 3.7 New: `document.accounting_distribution_resolution_audit`

Resolution decision trace at Stage 3. Append-only (`log.trg_prevent_mutation()`). Captures the resolver path (`account_source` strategy result, which fallback hit, resolved `gl_account_id`). **Does not** carry strategy fields — those stay on AD.

### 3.8 New: `master.condition_type`

Pricing-component condition catalog. System-seeded base set + tenant custom rows. FK target for `PC.condition_type_id`.

### 3.9 New: `control.entity_field.defaults` JSONB column

Holds cascade metadata (default_value_source, override_detection, on_parent_change, ui_affordance). Drives form runtime + BFF projection. **Replaces ~30 hypothetical per-field origin columns on document tables.**

---

## 4. Cascade & Resolution Rules

### Resolution direction

```
PIL (line-level override)
 │
 ▼
PI (header default)
 │
 ▼
RESOLVE (budget only — by dimensions+period)
 │
 ▼
AD (frozen output)
```

PC is no longer in the dimension/budget chain. PC inherits from source PIL at posting.

### Per-cluster resolution

| Cluster | Resolution function | Notes |
|---|---|---|
| Dimensions (CC, PC, Project, Site) | `pil.field ?? pi.field` | 2-tier |
| dimension_set_id | derived hash from scalars | trigger-maintained on PI, PIL, AD |
| budget_allocation_id | `ad.explicit ?? pil ?? pi ?? RESOLVE(dimensions, period, amount)` | RESOLVE fallback at AD level only |
| business_intent_id (PIL) | `pil.business_intent_id` | line-level intent |
| business_intent_id (PC term split) | `pc.business_intent_id ?? pil.business_intent_id` | PC keeps as routing override |
| posting_role_code | PC for term splits; rule-derived for principal splits | |
| gl_account_id | `control.resolve_entry_account(account_source, ...)` at posting | strategy-driven |
| asset_treatment | PIL authoritative | discriminator enum |
| target_asset_id | PIL authoritative; AD snapshots at posting | |
| is_capex | derived at posting from PIL.asset_treatment + class.is_depreciable | |
| asset_posting_target | derived at posting: `cwip_clearing` · `fixed_asset` · `class_clearing` · `expense` | |

### Cascade interpretation (metadata-driven)

PIL.cost_center_id (the fact) lives in DB. Whether that value is "inherited from header" or "overridden" (the interpretation) is computed by the BFF at projection time, driven by `control.entity_field.defaults`. No `*_origin` / `*_inherited_from` / `*_is_override` columns anywhere.

#### `entity_field.defaults` JSONB shape

```jsonc
{
  "default_value_source": {
    "kind": "parent_field",                    // 'parent_field' | 'tenant_config' | 'supplier_config' | 'static'
    "parent_entity": "purchase_invoice",
    "parent_field": "cost_center_id",
    "apply_on": ["create"]
  },
  "override_detection": {
    "compare_to": "parent.cost_center_id",
    "label_when_inherited": "From header",
    "label_when_overridden": "Overridden",
    "label_when_inherited_null": "Not set"
  },
  "on_parent_change": "preserve",              // 'preserve' | 'prompt' | 'inherit' | 'recompute'
  "ui_affordance": {
    "show_reset_to_default": true,
    "show_inheritance_chip": true,
    "chip_position": "field_label"
  }
}
```

#### BFF projection — virtual `_inheritance` block

```typescript
// Computed per-request; never persisted
function projectInheritance(row, parent, defaultsMap) {
  const result = {};
  for (const [field, def] of Object.entries(defaultsMap)) {
    if (!def.override_detection) continue;
    const childVal = row[field] ?? null;
    const parentField = def.override_detection.compare_to.replace('parent.', '');
    const parentVal = parent[parentField] ?? null;
    result[field] = computeInheritance(childVal, parentVal);
  }
  return result;
}

function computeInheritance<T>(child: T|null, parent: T|null): InheritanceLabel {
  if (child === null && parent === null) return 'unset';
  if (child === null) return 'inherited_null';
  if (child === parent) return 'inherited_match';
  return 'overridden';
}
```

Labels: `unset` · `inherited_null` · `inherited_match` · `overridden`. Lives in shared package `@athyper/cascade` (P4).

---

## 5. Lifecycle with Table Effects

| State entered | PI | PIL | PC | AD | Sub-ledgers |
|---|---|---|---|---|---|
| **draft (create)** | INSERT | INSERT on add | INSERT on add; cache trigger refreshes PI/PIL caches in P4 | empty | empty |
| **draft → pending_approval (submit)** | UPDATE workflow_request_id, snapshots | locked except via PC supersede | apportionment runs; supersede-only thereafter | empty | retention_schedule + advance_application seeded |
| **pending_approval → approved** | UPDATE approved_at/by | no change | no change | mutable per field rules | no change |
| **approved → posted** | UPDATE ap_je_id, posted_at/by, status=posted | match_status, matched_quantity set | no change | **Stage 3 final UPDATE**: gl_account_id resolved, base amounts filled, asset snapshots, budget result; **audit sidecar INSERTed**; AD enters Stage 4 (frozen) | advance_application → posted; PAB updated |
| **posted → partially/fully_paid** | UPDATE paid_amount, outstanding_amount | no change | no change | no change | retention release events tick milestones |
| **any → on_hold** | UPDATE status, metadata.hold | no edit | no edit | no edit | no change |
| **any → reversed** | new reversal invoice with reversal_of_id | reversal lines | reversal PC rows | new reversal AD rows | retention forfeited; advance reversed |

The posting transaction order (critical):
1. Posting service UPDATEs each AD row (trigger reads OLD `pi.status='approved'` → allows).
2. INSERT audit sidecar row per AD.
3. Generate journal_entry + journal_lines from AD.
4. Generate asset_transaction for capex AD rows.
5. UPDATE `pi.status='posted'` (this is the last write — locks AD via OLD status guard for any future UPDATEs).

All in one transaction. Crash → rollback → AD reverts to Stage 2.

---

## 6. PC Full DDL Spec

```sql
CREATE TABLE document.pricing_component (
  -- Identity
  id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
  tenant_id             uuid          NOT NULL,
  company_code_id       uuid          NOT NULL,

  -- Polymorphic source (header-or-line scope)
  source_doc_type       text          NOT NULL,
  source_doc_id         uuid          NOT NULL,
  source_line_id        uuid,                       -- NULL = header-scope

  -- Term classification
  term_type             text          NOT NULL,     -- discount | charge | tax | withholding | retention | principal_marker
  condition_type_id     uuid          NOT NULL,     -- FK -> master.condition_type
  sequence              integer       NOT NULL DEFAULT 100,

  -- Basis & values (non-negative magnitudes; sign derives from term_type)
  basis                 text          NOT NULL,     -- percent | amount | per_unit | flat
  rate_value            numeric(20,10),
  amount_value          numeric(18,4),
  base_for_calculation  numeric(18,4),
  computed_amount       numeric(18,4) NOT NULL DEFAULT 0,
  computed_base_amount  numeric(18,4) NOT NULL DEFAULT 0,

  -- Entry & apportionment
  entry_level           text          NOT NULL,     -- header | line
  apportion_basis       text,                       -- value | quantity | weight | equal (when apportioned)
  is_apportioned        boolean       NOT NULL DEFAULT false,
  is_apportioned_from_id uuid,                      -- self-FK

  -- Origin & cross-document lineage (DB intent — qualifies)
  origin                text          NOT NULL,     -- manual | inherited | vendor_default | system_resolved
  ref_source_doc_type   text,
  ref_source_doc_id     uuid,
  ref_source_line_id    uuid,
  ref_value             numeric(18,4),

  -- Tax & withholding metadata (BOTH term types)
  tax_group_id          uuid,
  is_inclusive          boolean,
  recoverable_pct       numeric(7,4),
  tax_section_code      text,

  -- Currency triad
  currency_code         character(3)  NOT NULL,
  base_currency_code    character(3)  NOT NULL,
  exchange_rate         numeric(20,10) NOT NULL DEFAULT 1.0,

  -- GL routing
  business_intent_id    uuid,                       -- the ONLY routing override at term level
  posting_role_code     text,
  gl_account_id         uuid,
  account_source        text,                       -- mirrors AD strategy enum

  -- NO dimension columns
  -- NO budget_allocation_id
  -- (PC inherits these from source PIL at posting)

  -- Supersede chain (in-draft history)
  superseded_by_id      uuid,
  superseded_at         timestamptz,
  superseded_by_user    uuid,

  -- Concurrency
  row_version           bigint        NOT NULL DEFAULT 1,

  -- Tags & Metadata
  tags                  jsonb         NOT NULL DEFAULT '[]'::jsonb,
  metadata              jsonb         NOT NULL DEFAULT '{}'::jsonb,

  -- Audit
  created_at            timestamptz   NOT NULL DEFAULT now(),
  created_by            uuid          NOT NULL,
  updated_at            timestamptz,
  updated_by            uuid,

  CONSTRAINT pc_pkey                       PRIMARY KEY (id),
  CONSTRAINT pc_tenant_id_uq               UNIQUE (tenant_id, id),

  CONSTRAINT pc_term_type_chk              CHECK (term_type IN (
    'discount','charge','tax','withholding','retention','principal_marker')),
  CONSTRAINT pc_basis_chk                  CHECK (basis IN ('percent','amount','per_unit','flat')),
  CONSTRAINT pc_entry_level_chk            CHECK (entry_level IN ('header','line')),
  CONSTRAINT pc_origin_chk                 CHECK (origin IN ('manual','inherited','vendor_default','system_resolved')),
  CONSTRAINT pc_apportion_basis_chk        CHECK (apportion_basis IS NULL
                                            OR apportion_basis IN ('value','quantity','weight','equal')),
  CONSTRAINT pc_source_doc_type_chk        CHECK (source_doc_type IN (
    'PURCHASE_REQUISITION_LINE','COMMITMENT_LINE','PURCHASE_INVOICE_LINE',
    'GOODS_RECEIPT_LINE','SERVICE_ENTRY_SHEET_LINE')),
  CONSTRAINT pc_account_source_chk         CHECK (account_source IS NULL OR account_source IN (
    'POSTING_ROLE','FIXED','FROM_INTENT','FROM_CATEGORY')),

  CONSTRAINT pc_rate_nonneg_chk            CHECK (rate_value IS NULL OR rate_value >= 0),
  CONSTRAINT pc_amount_nonneg_chk          CHECK (amount_value IS NULL OR amount_value >= 0),
  CONSTRAINT pc_computed_nonneg_chk        CHECK (computed_amount >= 0),
  CONSTRAINT pc_computed_base_nonneg_chk   CHECK (computed_base_amount >= 0),

  CONSTRAINT pc_basis_value_chk            CHECK (
    (basis = 'percent'  AND rate_value IS NOT NULL AND amount_value IS NULL)
    OR (basis = 'per_unit' AND rate_value IS NOT NULL AND amount_value IS NULL)
    OR (basis IN ('amount','flat') AND amount_value IS NOT NULL AND rate_value IS NULL)),

  CONSTRAINT pc_entry_level_scope_chk      CHECK (
    (entry_level = 'header' AND source_line_id IS NULL)
    OR (entry_level = 'line' AND source_line_id IS NOT NULL)),

  CONSTRAINT pc_apportion_chk              CHECK (
    (is_apportioned = false AND is_apportioned_from_id IS NULL)
    OR (is_apportioned = true AND is_apportioned_from_id IS NOT NULL AND entry_level = 'line')),

  CONSTRAINT pc_tax_fields_scope_chk       CHECK (
    (term_type IN ('tax','withholding') AND tax_group_id IS NOT NULL)
    OR (term_type NOT IN ('tax','withholding')
        AND tax_group_id IS NULL AND is_inclusive IS NULL
        AND recoverable_pct IS NULL AND tax_section_code IS NULL)),

  CONSTRAINT pc_supersede_pair_chk         CHECK (
    (superseded_by_id IS NULL AND superseded_at IS NULL AND superseded_by_user IS NULL)
    OR (superseded_by_id IS NOT NULL AND superseded_at IS NOT NULL AND superseded_by_user IS NOT NULL)),

  CONSTRAINT pc_currency_chk               CHECK (
    (currency_code = base_currency_code AND exchange_rate = 1.0)
    OR (currency_code <> base_currency_code AND exchange_rate > 0))
);
```

### Sign-derivation table (no DB enforcement; service applies at posting)

| term_type | Sign effect | GL impact |
|---|---|---|
| `discount` | reduces base | CR adjustment on principal |
| `charge` | adds to total | DR charge account |
| `tax` | adds (unless inclusive) | DR/CR per recoverability |
| `withholding` | reduces payable | CR withholding-tax-payable |
| `retention` | reduces payable | CR retention-payable |
| `principal_marker` | neutral | audit-only marker |

---

## 7. Invariants Catalog

| Code | Phase | Rule |
|---|---|---|
| `HEADER_SUBTOTAL_DRIFT` | submit, approve, post | `header.subtotal_amount ≈ SUM(line.net_amount)` ±0.01 |
| `HEADER_TOTAL_DRIFT` | submit, approve, post | `header.total_amount ≈ SUM(line.gross_amount)` ±0.01 |
| `AD_SPLIT_PERCENT_NOT_100` | submit, approve, post | per source line, `SUM(split_pct)=100` ±0.01 |
| `AD_SPLIT_AMOUNT_MISMATCH` | submit, approve, post | per source line, `SUM(split_amount)=line.net_amount` ±0.01 |
| `AD_SPLIT_QUANTITY_MISMATCH` | submit, approve, post | per source line, `SUM(split_quantity)=line.quantity` ±0.01 |
| `ASSET_LINE_AD_MISSING_CAPEX` | submit, approve, post | `line.asset_treatment ∈ capex set ⇒ every AD row has is_capex=true AND (target_asset_id OR posting_target='class_clearing')` |
| `REVERSAL_OF_NOT_POSTED` | submit, approve, post | `is_reversal=true ⇒ reversal_of_id NOT NULL AND target.is_posted=true` |
| `PO_COMMITMENT_REQUIRED` | submit, approve, post | `invoice_source ∈ (po_based, contract_based) ⇒ commitment_id NOT NULL` |
| `PARTY_SNAPSHOT_MISSING` | approve, post | `status NOT IN (draft, rejected) ⇒ invoice_party_snapshot row exists` |
| `APPROVAL_AUDIT_PAIR_MISMATCH` | submit, approve, post | `(approved_at IS NULL) = (approved_by IS NULL)` |
| **`PC_BASIS_VALUE_DRIFT`** | submit | PC.computed_amount drift > 0.01 from basis × rate/amount |
| **`PC_APPORTION_SUM_DRIFT`** | submit | Header PC apportioned amounts ≠ original |
| **`PC_SUPERSEDE_CHAIN_BROKEN`** | submit | superseded_by_id points to nonexistent or self |
| **`PC_TERM_GL_ROUTING_MISSING`** | post | PC row has no resolvable gl_account_id |
| **`BUDGET_ALLOCATION_DIMENSION_MISMATCH`** | submit, post | PIL/AD budget_allocation_id rejects dimensions |
| **`ASSET_TARGET_CLASS_MISMATCH`** | submit | PIL.target_asset.asset_class_id ≠ PIL.asset_class_id |
| **`ASSET_CLASS_POLICY_VIOLATION`** | submit | class.useful_life_override_policy='forbid' but custom life specified |
| **`RETENTION_SCHEDULE_SUM_DRIFT`** | submit | Σ retention_schedule.scheduled_amount ≠ retention PC.computed_amount |
| **`ADVANCE_APPLICATION_OVER_AVAILABLE`** | submit | Σ applied_amount > advance_doc.available_balance |
| **`ASSET_CAPEX_AD_TARGET_MISSING`** | post | AD.is_capex=true but neither target_asset_id nor 'class_clearing' |
| **`CURRENCY_TRIAD_INCONSISTENT`** | submit | PI.currency = PI.base but exchange_rate ≠ 1.0 |
| **`WATERFALL_JURISDICTION_VIOLATION`** | submit, post | `validatePurchaseInvoiceWaterfall(invoice_id, jurisdiction)` returns violations |

---

## 8. Triggers & Functions Catalog

### Existing (kept)

| Object | Role |
|---|---|
| `shared.trg_increment_row_version()` | Generic BEFORE UPDATE row_version bump |
| `trg_pi_row_version` | Attached to PI |
| `fn_next_document_number` | Race-safe doc numbering |
| `fn_refresh_purchase_invoice_totals` | Header rollup from lines |
| `trg_pil_sync_header` | Fires header refresh on line change |
| `trg_pi_immutability_guard` | Blocks PI mutations in terminal states |
| `trg_pil_immutability_guard` | Blocks line mutations when parent locked |
| `log.trg_prevent_mutation()` | Append-only enforcement (used by sidecar) |

### New in P0

| Object | Type | Purpose |
|---|---|---|
| `trg_pil_row_version` | BEFORE UPDATE on PIL | row_version bump |
| `trg_ad_row_version` | BEFORE UPDATE on AD | row_version bump |
| `document.fn_ad_validate_polymorphic_source` | trigger function | Per-type JOIN to parent line |
| `trg_ad_validate_polymorphic_source` | BEFORE INSERT/UPDATE OF source_doc_type/_id/_line_id on AD | Wires above |
| `document.fn_ad_status_gated_mutation` | trigger function | Blocks UPDATE/DELETE when OLD parent status is terminal |
| `trg_ad_status_gated_mutation` | BEFORE UPDATE OR DELETE on AD | Wires above |
| `shared.fn_dimension_set_hash_refresh` | trigger function | Recompute dimension_set_id from scalars |
| `trg_dimension_set_hash` | BEFORE INSERT/UPDATE on PI, PIL, AD | Wires above |
| `trg_ad_resolution_audit_immutable` | BEFORE UPDATE/DELETE on audit sidecar | `log.trg_prevent_mutation` |
| `document.validatePurchaseInvoiceWaterfall(invoice_id, jurisdiction)` | PL/pgSQL function | Returns violation list per jurisdiction (NEUTRAL initial) |

### New in P1 (PC)

| Object | Purpose |
|---|---|
| `fn_pc_validate_polymorphic_source` + trigger | Per-type JOIN to parent |
| `fn_pc_supersede_only_update` + trigger | UPDATE allowed only on supersede tuple |
| `fn_pc_immutability_guard` + trigger | Block non-supersede edits when parent terminal |
| `trg_pc_row_version` | row_version bump |

### Service-level (no row triggers — multi-row math)

| Function | Layer | Purpose |
|---|---|---|
| `apportionPricingComponents` | service | Header PC → line PC sibling rows |
| `resolvePricingWaterfall` | service | Sequence + computed_amount |
| `generateAccountingDistributions` | service | PC + PIL + advance → AD rows; runs Stage 3 final UPDATE |
| `resolveBudgetAllocation` | service | RESOLVE fallback |
| `resolveAssetTarget` | service | PIL.asset_treatment → AD.asset_posting_target |
| `validateAssetClassPolicy` | service | Governance flag checks |
| `seedRetentionSchedule` | service | Submit-time seeding |
| `applyAdvanceDocuments` | service | Submit-time link + capacity check |
| `releaseRetentionMilestone` | service | Mark released; create JE |

---

## 9. Phased Migration Plan

| Phase | Bundle | Risk | Effort |
|---|---|---|---|
| **P0** | Foundations: PIL/AD row_version, AD base-currency, AD audit sidecar, AD source validation, AD status-gated mutation, PIL budget FK, dim_set hash trigger, PI CHECK constraints (NOT VALID), validateWaterfall (NEUTRAL), entity_field.defaults column + PIL cascade seed | Low | 1 sprint |
| **P1** | PC table + condition_type catalog + service layer + per-type triggers + supersede trigger + field rules + RLS + cascade rule for PC.business_intent_id; shadow mode | Low | 1 sprint |
| **P2** | retention_schedule + advance_application + PTA/PAB overlap docs + submit-time seeders | Med | 1 sprint |
| **P3** | Asset PIL refactor: nullable add → backfill → validate. AD asset fields. Add `class_clearing_posting_role_code` and `expense_low_value_posting_role_code` to `control.asset_class_book_policy` (TEXT role codes, not GL IDs) | Med | 1 sprint |
| **P4** | Reader migration: BFF/posting/invariants/reports read from PC + sub-ledgers; trigger-maintained flat columns; 30-day dual-write monitoring; `@athyper/cascade` shared package + form runtime cascade consumer deployed | Med-High | 2 sprints |
| **P5** | Drop legacy: only after 30-day drift-free proof + grep-clean + backup; explicit go/no-go gate | Low | 1 sprint |
| **P6** | Optional: match_type→PIL, hold history sub-table, partitioning, PO/AR source_doc_type CHECK extension, term-level capex/dimension override on PC | Low | As needed |

### Migration patterns

Every existing-table addition follows:
1. ADD COLUMN nullable
2. Backfill (idempotent, chunked if >100k rows)
3. Verify zero NULL
4. SET NOT NULL (if required)
5. ADD CONSTRAINT NOT VALID
6. Pre-check script confirms zero violations
7. VALIDATE CONSTRAINT

`log.trg_prevent_mutation()` is the immutability helper (note: trigger function with `trg_` prefix per repo convention).

`row_version DEFAULT 1` is the standard.

---

## 10. Decisions to Lock (17 items)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Waterfall formula per jurisdiction | Pluggable function — NEUTRAL initial |
| 2 | Dimension canonical direction | Scalars canonical, dim_set derived hash |
| 3 | PC scope model | Model A — persist at both scopes after apportionment |
| 4 | `is_active` on PI | Keep; review semantics in P6 |
| 5 | Currency precision standard | NUMERIC(18,4) matches existing convention |
| 6 | Asset treatment storage | Stored discriminator |
| 7 | Hold history granularity | Sub-table in P6 |
| 8 | AD asset_class_id snapshot | Cached snapshot |
| 9 | Term-level capex override (PC) | Defer to P6 |
| 10 | `code` column on PI | Drop in P5 after grep-clean |
| 11 | Match move (match_type to PIL) | P6 |
| 12 | AR invoice reuse timeline | After AP P5 ships |
| 13 | AD immutability boundary | Status-gated (mutable pre-post, frozen at posted family) |
| 14 | AR/PO/SO source_doc_type additions | Defer — sealed CHECK extension needed |
| 15 | Sub-ledger overlap with PTA/PAB | Event detail in new tables; balances stay in PAB; clauses stay in PTA |
| 16 | `entity_field.defaults` as dedicated column vs `ui_hint.defaults` key | **Dedicated column** for query-ability + indexing |
| 17 | AD final-write model | **Option A** — single AD with final-posting UPDATE; trigger keys on OLD parent status |

---

## 11. Risk Register (Key Risks Only)

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Cache trigger drift during P4 dual-write | Daily drift detector; 0-mismatch exit |
| R2 | Asset category backfill maps to wrong class | Manual review queue; finance signoff |
| R3 | PC trigger performance on bulk import | Disable trigger during bulk INSERT; load-test |
| R6 | Jurisdiction waterfall function complexity | Lock to 2-3 jurisdictions v1 |
| R9 | Reader migration misses consumer | Codebase grep + UI smoke test; cache stays as failsafe |
| R13 | Existing invoices fail new waterfall CHECK | Pre-check script before NOT VALID → VALIDATE |
| R17 | AD immutability change breaks pre-post split editing | Status-gated trigger (Decision #17); test all UI paths |
| R22 | Inheritance chip drift between BFF and runtime | Shared `@athyper/cascade` package — single source |

---

# Part B — Field Matrices (Reference)

## 12. Locked field-rule storage decisions

| Decision | Choice |
|---|---|
| Field-rule storage | `control.entity_field.editability` (jsonb), `control.entity_field.visibility` (legacy), `control.entity_field.ui_hint.display.visible_when` (forward-compat). `is_computed` (boolean) and `is_read_only` (boolean) supplement. |
| Predicate vocabulary | `editable_in_status: text[]`. `visible_when`/`when`: ad-hoc `{field, eq/ne/value/isNull/notNull}`. JSON-logic upgrade is phase-2. |
| Status source for child entities | PIL ⇒ parent PI.status. AD ⇒ parent PI.status (when source_doc_type='PURCHASE_INVOICE_LINE'). Resolved by `fetchRecordStatus` in records.route.ts. |
| Server enforcement | `isEntityFieldWritable(rule, action, recordStatus)` returns typed reason. Only `FIELD_LOCKED_BY_STATUS` raises 400; others silently drop. |
| Computed-field policy | `is_computed=true` flagged fields silently drop PATCH input. `compute_mode` ∈ `generated` / `trigger` / `service`. |
| Snapshot policy | Party/address/bank captured BEFORE non-draft status transition. |
| Hold model | Model A: `status='on_hold'` authoritative; `is_on_hold` dropped; restoration in `metadata.hold.previous_status`. |
| Optimistic concurrency | `row_version` (bigint, trigger-incremented). PATCH callers send `expected_row_version`; 409 on mismatch. |
| Cross-entity invariants | `validatePurchaseInvoiceInvariants(piId, ctx)` runs pre-submit and pre-post; aggregates into one 422. |
| Cascade interpretation | `control.entity_field.defaults` JSONB + BFF projection (v1.2 P9). |

---

## 13. Field matrix — Purchase Invoice (header)

Status lifecycle (from `pi_status_chk`): `draft`, `pending_approval`, `approved`, `posted`, `partially_paid`, `fully_paid`, `on_hold`, `reversed`, `cancelled`, `rejected`.

### 13.1 Identity, source, supplier

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

### 13.2 Dates

| Field | Editable In | Visible | Notes |
|---|---|---|---|
| `invoice_date` (col `document_date`) | draft, rejected | always | Document date |
| `posting_date` | draft, rejected | always | Drives period + FX |
| `received_date` | draft, rejected | always | Operational audit |
| `baseline_date` | draft, rejected | always | Payment-term anchor |
| `due_date` | draft, rejected, pending_approval | always | Can be deferred during approval |

### 13.3 Currency & FX

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `currency_code` | draft | — | always | 3-char ISO |
| `base_currency_code` | draft | — | always | Company functional currency |
| `exchange_rate` | draft, rejected | — | when `currency_code != base_currency_code` (UX hint) | Required when foreign currency |

### 13.4 Amounts (pre-P4 — P4 flips computed flags)

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `discount_amount` | draft, rejected | — (P4: trigger) | always | ≥ 0 |
| `freight_amount` | draft, rejected | — (P4: trigger) | always | ≥ 0 |
| `misc_charges_amount` | draft, rejected | — (P4: trigger) | always | ≥ 0 |
| `total_amount` (label "Gross Amount") | — | ✓ (trigger) | always | SUM of line gross |
| `net_amount` (col `subtotal_amount`) | — | ✓ (trigger) | always | SUM of line net |
| `tax_amount` | — | ✓ (trigger) | always | SUM of line tax |
| `withholding_tax_amount` | draft, rejected | — (P4: trigger) | always | Header-level WHT override |
| `payable_amount` | — | ✓ (GENERATED) | always | `total_amount − WHT` |
| `paid_amount` | — | ✓ (service) | always | Payment posting writes |
| `outstanding_amount` | — | ✓ (GENERATED) | always | `total − WHT − advance − retention − paid` |
| `advance_deduction_amount` | draft, rejected | — | when `commitment_id IS NOT NULL` | ≥ 0 |
| `retention_amount` | draft, rejected | — | always | ≥ 0 |
| `retention_pct` | draft, rejected | — | when `retention_amount IS NOT NULL` | 0..100 |

### 13.5 Tax

| Field | Editable In | Visible | Notes |
|---|---|---|---|
| `tax_mode` | draft, rejected | always | Drives tax engine (P5: dropped — subsumed by PC) |
| `tax_mode_source` | draft, rejected | when `tax_mode IS NOT NULL` | Explains derivation (P5: dropped) |

### 13.6 Matching, reversal, hold

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `match_type` | draft, rejected | — | always | three_way / two_way / no_match / evaluated_receipt (P6: moves to PIL) |
| `match_status` | — | ✓ (service) | always | unmatched / partially_matched / fully_matched / match_exception (P6: derived from PIL rollup) |
| `is_reversal` | draft | — | always | Boolean |
| `reversal_of_id` | draft | — | when `is_reversal=true` | Target invoice (must be posted) |
| `hold_reason` | on_hold only | — | when `status='on_hold'` | Required while on hold |

### 13.7 Dimensions

| Field | Editable In | Notes |
|---|---|---|
| `cost_center_id` | draft, rejected | Header default for line postings; cascade via `entity_field.defaults` |
| `profit_center_id` | draft, rejected | Header default; cascade via `entity_field.defaults` |
| `project_id` | draft, rejected | Header default; cascade via `entity_field.defaults` |
| `site_id` | draft, rejected | Header default; cascade via `entity_field.defaults` |
| `budget_allocation_id` | draft, rejected | Drives budget consumption; cascade via `entity_field.defaults` |
| `budget_check_result` | — (computed by engine) | passed / warned / override / blocked / exempt |

### 13.8 Fiscal scope

| Field | Editable In | Notes |
|---|---|---|
| `fiscal_year` | draft, rejected | Derived from posting_date in app |
| `period_number` | draft, rejected | 1..16 (adjustment periods) |

### 13.9 Annotations, audit, system

| Field | Editable In | Computed | Notes |
|---|---|---|---|
| `notes` | draft, rejected, pending_approval, approved, on_hold | — | Operational notes |
| `tags` | draft, rejected, pending_approval, approved, on_hold | — | Operational tags |
| `line_count` | — | ✓ (trigger) | Maintained by trg_pil_sync_header |
| `is_active` | — | ✓ (GENERATED) | `status IN (draft, pending_approval, approved, posted, partially_paid, on_hold)` |
| `row_version` | system (PATCH `expected_row_version` only) | ✓ (trigger) | Optimistic concurrency |
| `workflow_request_id`, `approved_at`, `approved_by`, `posted_at`, `posted_by`, `ap_je_id`, `status_changed_at`, `status_changed_by` | system | — | Maintained by workflow / posting flows |
| `is_credit_note` | (deprecated, P5: drop) | — | Use `invoice_type='credit_note'` instead |
| `is_posted` | (deprecated, P5: drop) | — | Derive from `status` |
| `is_on_hold` | (dropped, Model A) | — | Use `status='on_hold'` instead |

---

## 14. Field matrix — Purchase Invoice Line (PIL)

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
| `uom_code` | draft, rejected | — | always |
| `quantity` | draft, rejected | — | always |
| `unit_price` | draft, rejected | — | always |
| `price_unit` | draft, rejected | — | always |
| `discount_pct` | draft, rejected | — (P4: trigger) | always |
| `discount_amount` | draft, rejected | — (P4: trigger) | always |
| `net_amount` | — | ✓ (DB-GENERATED) | always |
| `gross_amount` | — | ✓ (engine-maintained) | always |
| `tax_amount` | draft, rejected | — (P4: trigger) | always |
| `withholding_tax_amount` | draft, rejected | — (P4: trigger) | always |
| `retention_pct` | draft, rejected | — | when `retention_amount IS NOT NULL` |
| `retention_amount` | draft, rejected | — | always |
| `cost_center_id` | draft, rejected | — | always (cascade default from PI) |
| `profit_center_id` | draft, rejected | — | always (cascade default from PI) |
| `project_id` | draft, rejected | — | always (cascade default from PI) |
| `site_id` | draft, rejected | — | always (cascade default from PI) |
| `budget_allocation_id` (NEW P0) | draft, rejected | — | always (cascade default from PI) |
| `asset_treatment` (NEW P3) | draft, rejected | — | always |
| `asset_class_id` (NEW P3) | draft, rejected | — | when `asset_treatment <> 'none'` |
| `target_asset_id` (NEW P3) | draft, rejected | — | when `asset_treatment = 'target_asset'` |
| `is_asset` | (P5: drop) | — | always |
| `asset_category_id` | (P5: drop) | — | when `is_asset=true` |
| `match_status` | — | ✓ (service) | always |
| `matched_quantity` | — | ✓ (service) | always |
| `row_version` (NEW P0) | system | ✓ (trigger) | system |

---

## 15. Field matrix — Pricing Component (PC, P1)

Editability gated on parent PI status via `fetchRecordStatus` extension (PC ⇒ parent PI via source_doc_id JOIN).

| Field | Editable In | Computed | Visible | Notes |
|---|---|---|---|---|
| `source_doc_type`, `source_doc_id`, `source_line_id` | draft (set once) | — | always | polymorphic key |
| `term_type` | draft, rejected | — | always | enum |
| `condition_type_id` | draft, rejected | — | always | FK |
| `sequence` | draft, rejected | — | always | waterfall order |
| `basis` | draft, rejected | — | always | percent/amount/per_unit/flat |
| `rate_value` | draft, rejected | — | when basis=percent/per_unit | |
| `amount_value` | draft, rejected | — | when basis=amount/flat | |
| `computed_amount` | — | ✓ (service) | always | waterfall result |
| `computed_base_amount` | — | ✓ (service) | always | base currency |
| `entry_level` | draft (set once) | — | always | header/line |
| `apportion_basis` | draft, rejected | — | when entry_level=header | |
| `is_apportioned` | — | ✓ (service) | system | |
| `is_apportioned_from_id` | — | ✓ (service) | system | |
| `origin` | draft, rejected | — | always | DB intent (cross-doc lineage) |
| `ref_source_doc_*`, `ref_value` | draft (set once) | — | when origin=inherited | DB intent (cross-doc) |
| `tax_group_id`, `is_inclusive`, `recoverable_pct`, `tax_section_code` | draft, rejected | — | when term_type ∈ (tax, withholding) | |
| `currency_code`, `base_currency_code`, `exchange_rate` | draft (set at create) | — | always | |
| `business_intent_id` | draft, rejected | — | always | cascade default from PIL via `entity_field.defaults` |
| `posting_role_code` | draft, rejected | — | always | strategy param |
| `gl_account_id` | — | ✓ (service) | system | resolved at posting |
| `account_source` | draft, rejected | — | always | strategy |
| `superseded_by_id`, `superseded_at`, `superseded_by_user` | — | ✓ (service) | system | supersede chain |
| `row_version` | system | ✓ (trigger) | system | |

PC has **no** dimension columns (CC/PC/Project/Site/dim_set) and **no** `budget_allocation_id`. These inherit from source PIL at posting.

---

## 16. Field matrix — Accounting Distribution (AD)

Editability gated on parent invoice status (Stage 2 = mutable, Stage 4 = frozen). Status-gated mutation trigger reads OLD parent status.

| Field | Editable In (Stage) | Computed | Visible | Notes |
|---|---|---|---|---|
| `source_doc_type` | system (immutable after Stage 1) | — | always | Polymorphic discriminator |
| `source_doc_id` | system (immutable after Stage 1) | — | always | |
| `source_line_id` | system (immutable after Stage 1) | — | always | |
| `distribution_no` | system (sequence) | — | always | ≥ 1 |
| `distribution_basis` | Stage 1, 2 | — | always | PERCENT / AMOUNT / QUANTITY |
| `split_pct` | Stage 1, 2 | — | when basis=PERCENT | Required for PERCENT |
| `split_amount` | Stage 1, 2 | — | when basis=AMOUNT | Required for AMOUNT |
| `split_quantity` | Stage 1, 2 | — | when basis=QUANTITY | Required for QUANTITY |
| `distributed_amount` | — | ✓ (engine-maintained) | always | basis × line amount |
| `distributed_amount_base` (NEW P0) | — | ✓ (service, Stage 3) | always | base currency snapshot |
| `exchange_rate_snapshot` (NEW P0) | — | ✓ (service, Stage 3) | always | FX rate at posting |
| `currency_code` | system (inherits from line) | — | always | |
| `account_source` | Stage 1, 2 | — | always | POSTING_ROLE / FIXED / FROM_INTENT / FROM_CATEGORY (operational semantics) |
| `posting_role_code` | Stage 1, 2 | — | when account_source=POSTING_ROLE | |
| `gl_account_id` | Stage 1, 2 (if FIXED); else Stage 3 | ✓ (service at Stage 3) | always | resolved at posting |
| `account_code` | Stage 1, 2 (if FIXED) | — | when account_source=FIXED | Alternate to gl_account_id |
| `account_lookup_key` | system (engine input) | — | when policy enables | |
| `account_fallback` | system (engine input) | — | when policy enables | |
| `business_intent_id` | Stage 1, 2 | — | always | Required when account_source=FROM_INTENT |
| `commodity_category_id` | Stage 1, 2 | — | always | Required when account_source=FROM_CATEGORY |
| `cost_center_id`, `profit_center_id`, `project_id`, `site_id` | Stage 1, 2 | — (Stage 3: re-frozen) | always | |
| `dimension_set_id` | — | ✓ (trigger) | system | derived hash |
| `budget_allocation_id` | Stage 1, 2 | ✓ (service Stage 3 if null) | always | RESOLVE fallback |
| `budget_check_result` | — | ✓ (service Stage 3) | when budget_allocation_id IS NOT NULL | passed/warned/override/blocked/exempt |
| `encumbrance_je_id` | — | ✓ (service Stage 3) | when encumbered | |
| `is_capex` (NEW P3) | — | ✓ (service Stage 3) | always | derived from PIL.asset_treatment |
| `asset_posting_target` (NEW P3) | — | ✓ (service Stage 3) | when is_capex=true | cwip_clearing / fixed_asset / class_clearing / expense |
| `target_asset_id` (NEW P3) | — | ✓ (service Stage 3) | when is_capex=true | snapshot from PIL |
| `asset_class_id` (NEW P3 frozen) | — | ✓ (service Stage 3) | when is_capex=true | snapshot |
| `tax_treatment_override` | Stage 1, 2 | — | always | Optional enum |
| `description` | Stage 1, 2, on_hold | — | always | Annotative |
| `row_version` (NEW P0) | system | ✓ (trigger) | system | |

---

## 17. Field matrix — Sub-ledgers + Sidecar

### 17.1 `document.retention_schedule` (P2)

| Field | Editable | Computed | Notes |
|---|---|---|---|
| `purchase_invoice_id`, `purchase_invoice_line_id`, `pricing_component_id` | system (set at submit-time seed) | — | linkage |
| `milestone_no`, `milestone_type`, `scheduled_release_date`, `scheduled_amount`, `scheduled_amount_base` | system (set at seed); admin can edit until released | — | |
| `currency_code`, `base_currency_code`, `exchange_rate_snapshot` | system | — | |
| `released_amount`, `released_amount_base`, `released_at`, `released_by`, `release_je_id`, `release_payment_id` | system (set on release event) | ✓ (service) | |
| `status` | release-event-only | ✓ (service) | pending/partial/released/forfeited/cancelled |
| `row_version` | system | ✓ (trigger) | |

### 17.2 `document.advance_application` (P2)

| Field | Editable | Computed | Notes |
|---|---|---|---|
| `purchase_invoice_id`, `advance_document_type`, `advance_document_id` | system (polymorphic; validation trigger checks per type) | — | linkage |
| `applied_amount`, `applied_amount_base`, `tax_reversal_amount`, `tax_reversal_amount_base` | system | — | |
| `currency_code`, `base_currency_code`, `exchange_rate_snapshot` | system | — | |
| `application_je_id`, `applied_at`, `applied_by` | system (set on post) | ✓ (service) | |
| `status` | event-only | ✓ (service) | planned/posted/reversed |
| `reversed_at`, `reversal_reason` | system | ✓ (service) | |
| `row_version` | system | ✓ (trigger) | |

### 17.3 `document.accounting_distribution_resolution_audit` (P0)

| Field | Editable | Notes |
|---|---|---|
| `accounting_distribution_id`, `tenant_id` | system (set at Stage 3) | linkage |
| `resolution_steps` (jsonb) | system | ordered trace |
| `resolved_gl_account_id` | system | result |
| `resolution_path` | system | direct/fallback_1/.../company_default |
| `resolver_version` | system | semver |
| `resolved_at` | system | timestamp |

Append-only via `log.trg_prevent_mutation()`.

### 17.4 `master.condition_type` (P1)

| Field | Editable | Notes |
|---|---|---|
| `code`, `name`, `description` | tenant admin | tenant-uq on code |
| `term_type` | tenant admin | enum aligns with PC.term_type |
| `default_basis`, `default_rate`, `default_amount` | tenant admin | populates PC at create |
| `default_apportion_basis`, `default_posting_role_code`, `default_business_intent_id`, `default_account_source` | tenant admin | strategy defaults |
| `default_tax_group_id`, `default_is_inclusive`, `default_recoverable_pct`, `default_tax_section_code` | tenant admin | tax/withholding defaults |
| `is_taxable`, `is_apportionable`, `applies_to_classes` | tenant admin | behavior flags |
| `is_system` | (immutable after seed) | distinguishes system vs tenant rows |
| `status` | tenant admin | active/inactive/deprecated |
| Standard audit envelope | system | |

---

## 18. Cross-entity invariants — wire-in points

- `handleSubmitForApproval` — phase=`submit`, runs before snapshot capture and status change.
- `handlePostInvoice` — phase=`post`, runs after status check, before GL JE construction (= Stage 3 final UPDATE).
- Approve phase invariants ride along on the submit response path (auto-approve / self-approve).
- New phases: `apportionment` (PC service); `release_milestone` (retention); `apply_advance` (advance).

---

## 19. Server enforcement contract

### 19.1 Field write rejection (existing)

`isEntityFieldWritable(rule, action, recordStatus)` returns typed outcomes — only `FIELD_LOCKED_BY_STATUS` raises 400; others silently drop. See implementation in `records.route.ts`.

### 19.2 Optimistic concurrency

PATCH callers MUST send `expected_row_version`. Server returns `409 VERSION_CONFLICT { current_version }` on mismatch. PIL and AD added in P0.

### 19.3 Invariant rejection

`POST /api/records/purchase_invoice/{id}/action/submit` returns `422 INVOICE_INVARIANT_VIOLATION { violations: [{code, message, details}] }` when invariants fail.

### 19.4 Cascade defaults

Form runtime reads `control.entity_field.defaults` on row create; pre-fills `default_value_source` per rule. BFF projects `_inheritance` block per row in API responses.

---

## 20. How to add a new field rule

1. Add the `entity_field` row to `042_entity_field.sql`.
2. Add the rule to the appropriate `042_entity_field_rules_*.sql`.
3. For cascade fields, add `defaults` JSONB to `043_entity_field_rules_pi_pil_cascade.sql` (or equivalent).
4. For `is_computed=true`, set `compute_mode` (`generated` / `trigger` / `service`).
5. Update field matrix in this spec.
6. Run `npx tsx server/scripts/verify-field-rules.ts`.
7. If cascade, run `npx tsx server/scripts/verify-cascade-rule-coverage.ts`.

---

## 21. Audit & diagnostics

| Resource | Purpose |
|---|---|
| `control.v_entity_field_contract_audit` | Per-field flags |
| `control.v_entity_field_rule_coverage` | Per-entity counts |
| `server/scripts/verify-field-rules.ts` | CI gate |
| `server/scripts/verify-cascade-rule-coverage.ts` (NEW P0) | Cascade rule coverage |
| `server/scripts/verify-pc-cache-consistency.ts` (NEW P4) | PC → flat amount drift detection |
| `server/scripts/verify-asset-treatment-mapping.ts` (NEW P3) | Backfill verification |
| `server/scripts/verify-ad-polymorphic-integrity.ts` (NEW P0) | AD source FK integrity |

---

## 22. Phase-2 / deferred items (P6+)

| Item | Reason for deferral |
|---|---|
| JSON-logic predicate vocabulary | Current shape suffices |
| `invoice_tax_snapshot` population | Jurisdiction-specific |
| One-time-supplier snapshot from invoice metadata | Supplier_id NULL invoices skip with warning |
| Cross-field `visible_when` | Evaluator supports field-vs-value only |
| Non-PI source types for AD parent-status lookup | Other AP/P2P modules wire in their own sprints |
| `match_type` move to PIL + header rollup | P6 — orthogonal to asset work |
| Hold history sub-table | P6 — append-only event log |
| Partitioning (LIST tenant + RANGE fiscal_year) | Only when scale warrants |
| PO_LINE / SO_LINE / SI_LINE in source_doc_type CHECK | Sealed CHECK update — coordinated multi-table |
| Term-level capex override (PC) | No current use case |
| Term-level dimension override (PC) | Rare; defer with above |
