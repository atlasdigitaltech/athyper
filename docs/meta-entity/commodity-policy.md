# Commodity Policy Engine

Commodity policies define how goods and services are classified, what business intents they map to, and what default accounting, tax, and operational parameters apply. The engine covers buy-side, sell-side, and inventory policy — each as a separate scoped policy table.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.commodity_classification_config` | Per-tenant AI classification preferences (singleton) |
| `control.commodity_code_to_category_rule` | Incoming code → commodity_category routing |
| `control.commodity_classification_to_intent_rule` | Classification → business intent resolution |
| `control.commodity_category_buy_policy` | Buy-side intent + default GL/tax/asset/capex policy |
| `control.commodity_category_sell_policy` | Sell-side intent + revenue recognition defaults |
| `control.commodity_category_inventory_policy` | Inventory policy (valuation, stocking, replenishment) |
| `control.supplier_posting_override` | Exceptional AP GL overrides for specific supplier profiles |
| `control.intent_to_accounting_profile_rule` | Intent + context → accounting profile (see [Accounting Profiles](./accounting-profiles.md)) |

---

## `control.commodity_classification_config`

Per-tenant AI classification preferences. Singleton row per tenant (PK = `tenant_id`). `ARCHETYPE=C;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `tenant_id` | `uuid PK` | One row per tenant |
| `primary_commodity_domain` | `text` | Primary commodity taxonomy (e.g. `UNSPSC`, `eCl@ss`) |
| `trade_commodity_domain` | `text` | Trade/customs taxonomy (e.g. `HS_CODE`, `TARIC`) |
| `is_commodity_code_required` | `bool NOT NULL DEFAULT false` | |
| `is_trade_code_required` | `bool NOT NULL DEFAULT false` | |
| `is_required_for_regulated` | `bool NOT NULL DEFAULT true` | Classification required for regulated goods |
| `primary_industry_domain` | `text` | Industry classification system (e.g. `NAICS`, `SIC`) |
| `is_auto_classify_enabled` | `bool NOT NULL DEFAULT true` | |
| `is_auto_crosswalk_enabled` | `bool NOT NULL DEFAULT true` | |
| `min_confidence_auto` | `numeric(5,2) NOT NULL DEFAULT 90.00` | Confidence threshold for automated classification (0–100) |
| `min_confidence_suggest` | `numeric(5,2) NOT NULL DEFAULT 60.00` | Confidence threshold for suggestion-only mode (0–100) |
| `crosswalk_strategy` | `text NOT NULL DEFAULT 'BEST_MATCH'` | `EXACT_ONLY` / `BEST_MATCH` / `AI_ASSISTED` |
| `cross_border_triggers` | `jsonb NOT NULL DEFAULT '["SUPPLIER_COUNTRY_MISMATCH",...]'` | Events that mark a transaction as cross-border |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Constraint:** `min_confidence_auto >= min_confidence_suggest`

---

## `control.commodity_code_to_category_rule`

Reverse-routing: incoming external code (UNSPSC, HS Code) → `master.commodity_category`. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `commodity_domain_code` | `text NOT NULL` | Domain of the incoming code (e.g. `UNSPSC`, `HS_CODE`) |
| `match_mode` | `text NOT NULL DEFAULT 'RANGE'` | `EXACT` / `RANGE` / `PREFIX` / `CROSSWALK` |
| `code_from` | `text NOT NULL` | Inclusive range start; for EXACT match, this is the full code |
| `code_to` | `text` | Inclusive range end; NULL = exact match on `code_from` only |
| `code_level` | `smallint` | Match only at this hierarchy level (e.g. level 2 = UNSPSC segment) |
| `commodity_category_id` | `uuid NOT NULL` | Resolved target category |
| `priority` | `smallint NOT NULL DEFAULT 0` | Higher wins when multiple rules match |
| `confidence` | `numeric(5,2) NOT NULL DEFAULT 100.00` | 0–100 |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

### Match Mode Resolution

| Mode | Behavior |
|---|---|
| `EXACT` | `code_from` only; `code_to` must be NULL |
| `RANGE` | Lexical range `code_from..code_to` inclusive |
| `PREFIX` | `WHERE input LIKE code_from || '%'` |
| `CROSSWALK` | Resolve via `shared.commodity_crosswalk` first, then re-match |

**Tie-breaking:** highest `priority` → `EXACT` over `RANGE` → narrowest range → newest `created_at`.

---

## `control.commodity_classification_to_intent_rule`

Maps commodity classification to business intent. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `classification_source` | `text NOT NULL DEFAULT 'COMMODITY_CATEGORY'` | `COMMODITY_CATEGORY` / `PRODUCT` / `SERVICE` / `ITEM_GROUP` / `REVENUE_TYPE` |
| `classification_id` | `uuid NOT NULL` | FK to the relevant master table for the source |
| `direction` | `text` | `INBOUND` / `OUTBOUND` / `BILATERAL` / NULL |
| `condition_type` | `text NOT NULL` | See Condition Types below |
| `condition_config` | `jsonb NOT NULL DEFAULT '{}'` | Condition-type-specific parameters |
| `applies_to_flows` | `text[]` | NULL = all flows |
| `resolved_intent_id` | `uuid NOT NULL` | FK → `master.business_intent` |
| `resolved_domain` | `text` | `OPEX` / `CAPEX` / `REVENUE` / `COST_OF_SALES` / `TRANSFER` / `REGULATORY` / `ADMIN` / `DEFERRED_REVENUE` |
| `explanation_template` | `text NOT NULL` | Human-readable audit explanation |
| `confidence` | `numeric(3,2) NOT NULL DEFAULT 1.00` | 0.0–1.0 |
| `priority` | `int NOT NULL DEFAULT 50` | Lower = evaluated first |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

### Condition Types

`AMOUNT_ABOVE`, `AMOUNT_BELOW`, `IS_RECURRING`, `IS_ONE_TIME`, `COMPANY_MATCH`, `PROCUREMENT_METHOD`, `CROSS_BORDER`, `DOC_TYPE_MATCH`, `COMMODITY_MATCH`, `SUPPLIER_MATCH`, `CUSTOMER_MATCH`, `CUSTOMER_TIER`, `CONTRACT_TYPE_MATCH`, `FLOW_MATCH`, `CHANNEL_MATCH`, `FALLBACK`

---

## `control.commodity_category_buy_policy`

Buy-side intent policy. Controls which business intents are allowed/default for a commodity category, and sets default GL accounts, tax, asset, and CAPEX thresholds. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `commodity_category_id` | `uuid NOT NULL` | |
| `business_intent_id` | `uuid NOT NULL` | |
| `company_code_id` | `uuid` | NULL when `scope_type = 'TENANT'` |
| `scope_type` | `text NOT NULL DEFAULT 'TENANT'` | `TENANT` / `COMPANY` / `SITE` / `SUPPLIER_PROFILE` / `COST_CENTER` / `PROJECT` |
| `scope_id` | `uuid` | Required when `scope_type != 'TENANT'` |
| `mapping_mode` | `text NOT NULL DEFAULT 'ALLOW'` | `ALLOW` / `DENY` |
| `is_default` | `bool NOT NULL DEFAULT false` | |
| `is_selectable` | `bool NOT NULL DEFAULT true` | `false` when `mapping_mode = 'DENY'` |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | |
| `default_gl_account_id` | `uuid` | Default expense GL account |
| `default_tax_group_id` | `uuid` | Default tax group |
| `default_asset_class_id` | `uuid` | Default asset class when CAPEX |
| `default_asset_profile_code` | `text` | Default asset profile code |
| `default_budget_profile_id` | `uuid` | Default budget profile |
| `is_asset_tag_required` | `bool` | |
| `capex_screening_threshold` | `numeric(18,4)` | >= 0; CAPEX review required above this amount |
| `capex_screening_currency` | `character(3)` | Required when `capex_screening_threshold` is set |
| `override_visibility` | `text` | |
| `override_is_classification_required` | `bool` | |
| `override_is_hs_required` | `bool` | |
| `override_is_regulated` | `bool` | |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Constraint:** `mapping_mode = 'DENY'` requires both `is_default = false AND is_selectable = false`.

---

## `control.commodity_category_sell_policy`

Sell-side intent policy with revenue recognition defaults. Same structure as `buy_policy` but with revenue-specific columns. `ARCHETYPE=B;SCOPE=T`.

Scope types: `TENANT` / `COMPANY` / `SITE` / `CUSTOMER_PROFILE` / `SALES_CHANNEL` / `PROFIT_CENTER` / `COST_CENTER`

Sell-specific columns:

| Column | Type | Notes |
|---|---|---|
| `default_revenue_gl_account_id` | `uuid` | Primary revenue GL account |
| `default_deferred_revenue_gl_account_id` | `uuid` | Contract liability account |
| `default_unbilled_ar_gl_account_id` | `uuid` | Unbilled AR account |
| `default_tax_group_id` | `uuid` | |
| `default_accounting_profile_id` | `uuid` | |
| `paired_cogs_profile_id` | `uuid` | FK → `master.accounting_profile` for COGS pairing |
| `revenue_recognition_method` | `text` | `POINT_IN_TIME` / `OVER_TIME` / `PCT_COMPLETION` / `INPUT_METHOD` / `OUTPUT_METHOD` |
| `variable_consideration` | `text` | |
| `standalone_selling_price_method` | `text` | |

---

## `control.commodity_category_inventory_policy`

Inventory policy: stockability, valuation, replenishment, and posting defaults. `ARCHETYPE=B;SCOPE=T`.

Scope types: `TENANT` / `COMPANY` / `SITE` / `WAREHOUSE`

| Column | Type | Notes |
|---|---|---|
| `stocking_status` | `text NOT NULL DEFAULT 'stocked'` | `stocked` / `non_stock` / `blocked` / `made_to_order` |
| `valuation_method` | `text` | e.g. `FIFO`, `AVCO`, `STANDARD_COST` |
| `default_inventory_gl_account_id` | `uuid` | |
| `default_wip_gl_account_id` | `uuid` | |
| `default_cogs_gl_account_id` | `uuid` | |
| `default_price_variance_gl_account_id` | `uuid` | |
| `default_reorder_point` | `numeric(18,4)` | `>= 0` |
| `default_reorder_qty` | `numeric(18,4)` | `>= 0` |
| `default_safety_stock` | `numeric(18,4)` | `>= 0` |
| `override_lot_tracking_required` | `bool` | |
| `override_serial_tracking_required` | `bool` | |

---

## `control.supplier_posting_override`

Exceptional AP posting-role GL overrides for a specific supplier profile. Use only for non-standard AP account assignment. For standard defaults use `commodity_category_buy_policy`. `ARCHETYPE=B;SCOPE=T`.

Uses a temporal EXCLUDE constraint to prevent overlapping active overrides for the same `(tenant, supplier_profile, posting_role, book)`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `supplier_profile_id` | `uuid NOT NULL` | FK → `master.supplier_profile` |
| `posting_role_code` | `text NOT NULL` | Non-empty |
| `gl_account_id` | `uuid NOT NULL` | Override GL account |
| `book_code` | `text NOT NULL DEFAULT 'PRIMARY'` | Non-empty |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | |
| `reason` | `text` | Audit justification |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Temporal EXCLUDE:** Prevents two active overrides for `(tenant_id, supplier_profile_id, posting_role_code, book_code)` with overlapping `effective_from..effective_to` ranges.

---

## Intent Resolution Chain

```
Document line (commodity_category_id + direction + amount)
        │
        ▼
commodity_classification_to_intent_rule
  (condition_type evaluation → resolved_intent_id + resolved_domain)
        │
        ▼
commodity_category_buy_policy  or  commodity_category_sell_policy
  (scope: TENANT → COMPANY → SITE → most specific match)
  (mapping_mode = ALLOW → is_default + defaults applied)
        │
        ▼
intent_to_accounting_profile_rule
  (intent + direction + flow + company + amount → resolved_profile_config_id)
        │
        ▼
acct_profile_config → acct_profile_event → acct_profile_entry_template
```

---

## Related Docs

- [Overview](./overview.md)
- [Accounting Profiles](./accounting-profiles.md)
- [Dimension, Tax & Rounding](./dimension-tax-rounding.md)
