# Dimension Policy, Tax Engine & Rounding

This document covers the control-schema tables for dimension validation, entity numbering, tax rates, withholding tax thresholds, and monetary rounding.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.dimension_policy` | Dimension validation/governance rules (REQUIRED/OPTIONAL/FORBIDDEN) |
| `control.dimension_policy_allowed_value` | Allowed dimension values per policy |
| `control.entity_numbering_config` | Canonical entity numbering policy |
| `control.entity_numbering_counter` | Mutable sequence counter state |
| `control.rounding_rule` | Currency rounding configuration |
| `control.tax_rate_schedule` | Unified tax rate table (temporal, no tax_code) |
| `control.tax_group` | Named collections of tax rate schedules |
| `control.tax_group_component` | Bridge: tax_group → tax_rate_schedule |
| `control.wht_threshold_config` | Withholding tax activation thresholds |

---

## `control.dimension_policy`

Dimension validation/governance rules. Purpose: "Department is REQUIRED on Expense accounts." Does **not** derive values — derivation lives in `acct_profile_dimension_rule`. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `policy_code` | `text NOT NULL` | Non-empty; unique per `(tenant, policy_code, policy_version)` |
| `policy_version` | `smallint NOT NULL DEFAULT 1` | |
| `description` | `text` | |
| `dimension_type_id` | `uuid NOT NULL` | FK → `master.dimension_type` |
| `company_code_id` | `uuid` | NULL = tenant-global policy; non-null = company-specific |
| `scope_account_class` | `text` | NULL = all; `asset` / `liability` / `equity` / `income` / `expense` |
| `scope_account_id` | `uuid` | NULL = all; specific GL account |
| `scope_subledger_type` | `text` | NULL = all; `AP` / `AR` / `ASSET` / `INVENTORY` / `WIP` / `COMMISSION` / `NONE` |
| `scope_book_id` | `uuid` | NULL = all; specific ledger book |
| `scope_doc_type` | `text` | NULL = all; `PURCHASE_INVOICE` / `SALES_INVOICE` / `JE` / etc. |
| `behavior` | `text NOT NULL DEFAULT 'OPTIONAL'` | See Behavior Values below |
| `fixed_value_id` | `uuid` | Required when `behavior = 'FIXED_VALUE'` |
| `derive_source` | `text` | Required when `behavior = 'DERIVE_IF_MISSING'` |
| `depends_on_type_id` | `uuid` | This dimension only applies if another type is present on the line |
| `mutually_exclusive_with` | `uuid` | Cannot coexist with another dimension type on the same JE line |
| `priority` | `smallint NOT NULL DEFAULT 0` | Higher wins on conflict between matching policies |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, policy_code, policy_version)` and `(tenant_id, id)`

**Precedence:** company-specific match → tenant-global → no rule.

### Behavior Values

| Value | Description |
|---|---|
| `REQUIRED` | Dimension must be present; posting blocked if missing |
| `OPTIONAL` | No enforcement |
| `FORBIDDEN` | Dimension must NOT be present |
| `DERIVE_IF_MISSING` | Attempt to derive from `derive_source`; no error if derivation fails |
| `INHERIT_FROM_HEADER` | Copy from document header dimension |
| `FIXED_VALUE` | Always set to `fixed_value_id`; overrides any user input |

---

## `control.dimension_policy_allowed_value`

Indexable allowed-value list for a dimension policy. Replaces the `uuid[]` column approach. `ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `policy_id` | `uuid NOT NULL` | FK → `control.dimension_policy` ON DELETE CASCADE |
| `dimension_value_id` | `uuid NOT NULL` | FK → `master.dimension_value` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |

**Unique:** `(policy_id, dimension_value_id)`

---

## `control.entity_numbering_config`

Canonical entity numbering policy. `tenant_id = NULL` = platform default; tenant rows override. `ARCHETYPE=B;SCOPE=G/T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform default |
| `entity_id` | `uuid NOT NULL` | FK → entity registry |
| `number_field` | `text NOT NULL` | Logical field name receiving the generated number (e.g. `document_no`, `code`) |
| `company_code_id` | `uuid` | NULL = all companies |
| `prefix` | `text NOT NULL DEFAULT ''` | Static prefix |
| `prefix_configurable` | `bool NOT NULL DEFAULT true` | |
| `separator` | `text NOT NULL DEFAULT '-'` | Separator between segments |
| `segments` | `jsonb NOT NULL DEFAULT '[]'` | Array of segment descriptors (see Segments below) |
| `reset_strategy` | `text NOT NULL DEFAULT 'yearly'` | `never` / `yearly` / `fiscal_yearly` / `monthly` / `quarterly` |
| `uniqueness_scope` | `text NOT NULL DEFAULT 'tenant'` | `tenant` / `company` / `global` |
| `max_length` | `smallint` | 1–128; NULL = no limit |
| `allowed_chars` | `text NOT NULL DEFAULT 'upper_alnum_dash'` | Named set or PostgreSQL regex |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, company_code_id, entity_id, number_field) NULLS NOT DISTINCT`

### Segment Types

Array of `{type: string, ...}` descriptors in `segments`. Supported types:

| Segment Type | Description |
|---|---|
| `tenant_code` | Tenant short code |
| `company_code` | Company code |
| `branch_code` | Branch code |
| `year` | Calendar year (4 digits) |
| `fiscal_year` | Fiscal year |
| `period` | Period number (01–16) |
| `quarter` | Quarter number (Q1–Q4) |
| `sequence` | Auto-incrementing sequence (pad to N digits) |
| `static` | Static literal string |

---

## `control.entity_numbering_counter`

Hot counter state per resolved scope and reset bucket. Updated atomically by `control.next_entity_number()`. `ARCHETYPE=C;SCOPE=T/G;DEVIATION`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL for global uniqueness_scope |
| `config_id` | `uuid NOT NULL` | FK → `control.entity_numbering_config` |
| `company_code_id` | `uuid` | |
| `scope_key` | `text NOT NULL DEFAULT ''` | Non-empty; composite scope discriminator |
| `fiscal_year` | `smallint NOT NULL DEFAULT 0` | 0 when `reset_strategy = 'never'`; 2000–2099 otherwise |
| `period_number` | `smallint NOT NULL DEFAULT 0` | 0–16 |
| `quarter_number` | `smallint NOT NULL DEFAULT 0` | 0–4 |
| `last_value` | `bigint NOT NULL DEFAULT 0` | Current sequence value (`>= 0`) |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_by` | `uuid` | |

---

## `control.rounding_rule`

Currency rounding configuration. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `code` | `text NOT NULL` | Unique per tenant |
| `name` | `text NOT NULL` | |
| `method` | `text NOT NULL DEFAULT 'ROUND_HALF_UP'` | `ROUND_HALF_UP` / `ROUND_HALF_EVEN` / `ROUND_DOWN` / `ROUND_UP` |
| `precision_digits` | `smallint` | 0–6; NULL = derive from `shared.currency.minor_units` at runtime |
| `minimum_unit` | `numeric(18,6)` | Minimum denomination (e.g. `0.05` for CHF) |
| `gl_variance_approval_required` | `bool NOT NULL DEFAULT false` | When `true`, rounding variance JEs require explicit GL sign-off before period close |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Note:** `precision_digits = NULL` means the runtime reads `shared.currency.minor_units` to determine decimal places (0 for JPY, 3 for KWD).

---

## `control.tax_rate_schedule`

Unified tax rate table. No `tax_code` column — identity is fully structured as `(jurisdiction + tax_type + direction + component + scopes + priority + effective dates)`. `ARCHETYPE=B;SCOPE=T`.

A temporal EXCLUDE constraint (`trs_temporal_excl`) prevents two active rules with identical scope + priority from overlapping in time.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `jurisdiction_id` | `uuid NOT NULL` | FK → `master.tax_jurisdiction` |
| `tax_type_id` | `uuid NOT NULL` | FK → `master.tax_type` |
| `tax_direction` | `text NOT NULL` | `PURCHASE` / `SALE` / `PAYMENT` / `IMPORT` / `EXPORT` / `BOTH` |
| `component_code` | `text` | Component discriminator (e.g. `central`, `state`, `cess`) |
| `rate_kind` | `text NOT NULL DEFAULT 'PERCENT'` | `PERCENT` / `FIXED` / `PER_UNIT` |
| `rate_value` | `numeric(18,6) NOT NULL` | 0–100 for PERCENT; >= 0 for FIXED/PER_UNIT |
| `rate_currency` | `character(3)` | Required when `rate_kind != 'PERCENT'` |
| `recoverability_mode` | `text NOT NULL DEFAULT 'NONE'` | `FULL` / `PARTIAL` / `NONE` / `CONDITIONAL` |
| `recoverability_percent` | `numeric(5,2)` | Required when `recoverability_mode = 'PARTIAL'` (0–100) |
| `reverse_charge_mode` | `text NOT NULL DEFAULT 'NONE'` | `NONE` / `SELF_ASSESS` / `FULL` |
| `calculation_basis` | `text NOT NULL DEFAULT 'LINE_NET'` | `LINE_NET` / `LINE_GROSS` / `DOCUMENT_NET` / `DOCUMENT_GROSS` / `PAYMENT_AMOUNT` |
| `rounding_stage` | `text NOT NULL DEFAULT 'LINE'` | `LINE` / `COMPONENT` / `DOCUMENT` / `JURISDICTION_BUCKET` |
| `rounding_rule_id` | `uuid` | FK → `control.rounding_rule` |
| `wht_basis` | `text` | `GROSS` / `NET_OF_INDIRECT_TAX` / `PAYMENT_ONLY` (WHT-specific) |
| `wht_certificate_required` | `bool NOT NULL DEFAULT false` | |
| `treaty_country_code` | `character(2)` | Tax treaty partner country |
| `treaty_rate_value` | `numeric(18,6)` | Treaty-reduced rate; must be `<= rate_value` |
| **Scope Filters (all nullable = wildcard)** | | |
| `scope_company_code_id` | `uuid` | |
| `scope_commodity_category_id` | `uuid` | |
| `scope_commodity_domain_code` | `text` | |
| `scope_commodity_code` | `text` | |
| `scope_industry_domain_code` | `text` | |
| `scope_industry_code` | `text` | |
| `scope_counterparty_country` | `character(2)` | |
| `scope_counterparty_tax_status` | `text` | `REGISTERED` / `UNREGISTERED` / `EXEMPT` / `FOREIGN` / `TREATY` |
| `scope_doc_type` | `text` | |
| `priority` | `smallint NOT NULL DEFAULT 0` | |
| `description` | `text` | |
| `effective_from` | `date NOT NULL` | |
| `effective_to` | `date` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**`UNIQUE (tenant_id, id)`** — enables tenant-composite FK from `tax_group_component`.

---

## `control.tax_group`

Named collection of tax rate schedules applied as a unit to documents. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `code` | `text NOT NULL` | Unique per tenant |
| `name` | `text NOT NULL` | |
| `description` | `text` | |
| `is_compound` | `bool NOT NULL DEFAULT false` | `true` = components applied sequentially (each base = previous subtotal) |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, id)` and `(tenant_id, code)`

---

## `control.tax_group_component`

Bridge table: tax_group → tax_rate_schedule. `ARCHETYPE=B_LITE;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `tax_group_id` | `uuid NOT NULL` | FK → `control.tax_group` |
| `tax_rate_schedule_id` | `uuid NOT NULL` | FK → `control.tax_rate_schedule` (tenant-composite) |
| `calculation_seq` | `smallint NOT NULL` | Evaluation order (`> 0`); unique within group |
| `rate_override` | `numeric(18,6)` | Group-level rate substitution (`>= 0`); overrides the schedule rate |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tax_group_id, calculation_seq)` and `(tax_group_id, tax_rate_schedule_id)`

---

## `control.wht_threshold_config`

Per-supplier WHT activation thresholds (India TDS, Philippines EWT, etc.). `ARCHETYPE=C;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `jurisdiction_id` | `uuid NOT NULL` | FK → `master.tax_jurisdiction` (tenant-composite) |
| `tax_type_id` | `uuid NOT NULL` | FK → `master.tax_type` (tenant-composite) |
| `section_code` | `text` | e.g. `194C`, `194J`, `EWT-professional` |
| `threshold_amount` | `numeric(18,4) NOT NULL` | `> 0` |
| `threshold_currency` | `character(3) NOT NULL` | |
| `reset_period` | `text NOT NULL DEFAULT 'fiscal_year'` | `fiscal_year` / `calendar_year` / `contract` |
| `per_transaction` | `bool NOT NULL DEFAULT false` | `false` = threshold applies to YTD total (accumulation tracked in `aggregate.wht_supplier_accumulator`); `true` = per-payment threshold |
| `is_active` | `bool NOT NULL DEFAULT true` | Manual boolean |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | `> effective_from` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, jurisdiction_id, tax_type_id, section_code) NULLS NOT DISTINCT`

---

## Tax Rate Resolution

At document tax calculation time:

1. Gather `(jurisdiction_id, tax_type_id, direction, doc_type, commodity_category, counterparty)` from the line
2. Query `control.tax_rate_schedule` WHERE `is_active = true AND effective_from <= :today AND (effective_to IS NULL OR effective_to >= :today)` with scope filters applied as wildcards
3. Resolve `tax_group` if one is assigned to the document — evaluate all `tax_group_component` rows in `calculation_seq` order
4. Apply `is_compound = true` logic if the group is compound
5. For WHT: check `wht_threshold_config` and compare against `aggregate.wht_supplier_accumulator` YTD total
6. Apply `rounding_rule` at the configured `rounding_stage`

---

## Related Docs

- [Overview](./overview.md)
- [Accounting Profiles](./accounting-profiles.md)
- [Commodity Policy](./commodity-policy.md)
