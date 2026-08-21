# Accounting Profile Engine (4.13)

The Accounting Profile Engine governs how financial transactions are posted to the general ledger. All configuration lives in the `control` schema under the `Engine 4.13` family of tables. The engine resolves the correct accounting profile for any document by evaluating commodity intent, transaction flow, and contextual predicates — then applying the profile's Dr/Cr templates to generate journal entry lines.

---

## Architecture Overview

```
Document event (e.g. PURCHASE_INVOICE.POST)
        │
        ▼
transaction_flow_template  ─── Resolves canonical event sequence for the flow
        │
        ▼
commodity_classification_to_intent_rule  ─── Commodity → Business Intent
        │
        ▼
intent_to_accounting_profile_rule  ─── Intent + context → acct_profile_config
        │ (check intent_profile_override first for regulatory exceptions)
        ▼
acct_profile_config  ─── Core profile (recognition, tax, matching, versioning)
        │
        ├── acct_profile_event  ─── Which events create JEs
        │       └── acct_profile_entry_template  ─── Dr/Cr line templates
        │
        ├── acct_profile_commitment_config  ─── Encumbrance behavior (optional)
        ├── acct_profile_revenue_config  ─── Revenue recognition (optional)
        ├── acct_profile_settlement_config  ─── Settlement terms (optional)
        ├── acct_profile_book_rule  ─── Per-book posting (optional)
        └── acct_profile_dimension_rule  ─── Dimension derivation
```

---

## `control.transaction_event_catalog`

Canonical registry of lifecycle event codes. Platform-global; no `tenant_id`. `ARCHETYPE=C;SCOPE=N`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `code` | `text NOT NULL UNIQUE` | e.g. `INVOICE_RECEIVED`, `PO_ISSUED`, `PAYMENT_CLEARED` |
| `label` | `text NOT NULL` | Human-readable label |
| `description` | `text` | |
| `is_active` | `bool NOT NULL DEFAULT true` | `false` = deprecated (FKs from child tables preserved) |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.transaction_flow_template`

Canonical lifecycle event sequences per transaction flow. 15 flows, 38 event codes. `ARCHETYPE=B;SCOPE=G` — `tenant_id IS NULL` = platform-global; tenant rows may override.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `flow_code` | `text NOT NULL` | e.g. `NON_PO`, `PO_THREE_WAY`, `SALES_ORDER` |
| `direction` | `text NOT NULL` | `INBOUND` / `OUTBOUND` / `BILATERAL` |
| `event_code` | `text NOT NULL` | FK → `control.transaction_event_catalog.code` |
| `event_name` | `text NOT NULL` | Human-readable event name |
| `event_seq` | `smallint NOT NULL` | Ordering within the flow (`> 0`) |
| `is_mandatory` | `bool NOT NULL DEFAULT true` | |
| `creates_je` | `bool NOT NULL DEFAULT true` | Whether this event generates a journal entry |
| `reverses_prior` | `text` | `event_code` of the event this reverses |
| `commitment_action` | `text NOT NULL DEFAULT 'NONE'` | `NONE` / `CREATE` / `INCREASE` / `RELEASE_PARTIAL` / `RELEASE_FULL` / `CANCEL` |
| `description` | `text` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Uniqueness:** Partial index `tft_flow_event_uq` on `(COALESCE(tenant_id, ''), flow_code, event_code)`.

---

## `control.book_posting_rule`

Cross-book derivation rules. When a JE posts to `source_book`, these rules auto-derive JEs for `target_book`. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `company_code_id` | `uuid NOT NULL` | |
| `rule_code` | `text NOT NULL` | Unique per `(tenant, company_code)` |
| `rule_name` | `text NOT NULL` | |
| `description` | `text` | |
| `source_book_id` / `target_book_id` | `uuid NOT NULL` | FK → `master.ledger_book`; must differ |
| `scope_doc_type` | `text` | NULL = all doc types |
| `scope_intent_code` | `text` | NULL = all intents |
| `scope_account_class` | `text` | NULL = all account classes |
| `scope_subledger_type` | `text` | NULL = all subledgers |
| `account_strategy` | `text NOT NULL DEFAULT 'same'` | `same` / `map` / `profile` |
| `account_mapping` | `jsonb` | Required when `account_strategy = 'map'` |
| `target_profile_id` | `uuid` | Required when `account_strategy = 'profile'` |
| `amount_strategy` | `text NOT NULL DEFAULT 'mirror'` | `mirror` / `multiply` / `formula` / `suppress` |
| `amount_multiplier` | `numeric(10,6) DEFAULT 1.0` | Required when `amount_strategy = 'multiply'` |
| `amount_formula` | `jsonb` | Required when `amount_strategy = 'formula'` |
| `recognition_timing` | `text NOT NULL DEFAULT 'simultaneous'` | `simultaneous` / `deferred` / `on_close` |
| `recognition_lag_periods` | `smallint DEFAULT 0` | Required when `recognition_timing = 'deferred'` |
| `priority` | `smallint NOT NULL DEFAULT 0` | |
| `version` | `smallint NOT NULL DEFAULT 1` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.acct_profile_config`

Core profile configuration. 1:1 extension of `master.accounting_profile`. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `accounting_profile_id` | `uuid NOT NULL` | FK → `master.accounting_profile` |
| `direction` | `text NOT NULL DEFAULT 'INBOUND'` | `INBOUND` / `OUTBOUND` / `BILATERAL` |
| `profile_type` | `text NOT NULL DEFAULT 'STANDARD'` | See profile types below |
| `subledger_type` | `text NOT NULL DEFAULT 'AP'` | `AP` / `AR` / `ASSET` / `INVENTORY` / `WIP` / `COMMISSION` / `NONE` |
| `applicable_flow_codes` | `text[] NOT NULL DEFAULT '{NON_PO}'` | |
| `applicable_doc_types` | `text[] NOT NULL DEFAULT '{}'` | |
| `recognition_timing` | `text NOT NULL DEFAULT 'IMMEDIATE'` | `IMMEDIATE` / `DEFERRED` / `SCHEDULED` / `EVENT_DRIVEN` |
| `deferral_schedule_type` | `text` | |
| `deferral_periods` | `smallint` | `> 0` |
| `auto_reverse` | `bool NOT NULL DEFAULT false` | |
| `reversal_period_offset` | `smallint NOT NULL DEFAULT 1` | |
| `tax_treatment` | `text NOT NULL DEFAULT 'STANDARD'` | |
| `default_tax_code` | `text` | |
| `default_tax_group_id` | `uuid` | FK → `control.tax_group` (tenant-composite) |
| `is_reverse_charge` | `bool NOT NULL DEFAULT false` | |
| `matching_type` | `text NOT NULL DEFAULT 'NONE'` | `NONE` / `TWO_WAY` / `THREE_WAY` / `FOUR_WAY` |
| `version` | `int NOT NULL DEFAULT 1` | |
| `effective_from` | `date NOT NULL DEFAULT CURRENT_DATE` | |
| `effective_to` | `date` | |
| `supersedes_id` | `uuid` | FK → self for versioning chain |
| `status` | `text NOT NULL DEFAULT 'draft'` | `draft` → `active` → `superseded` / `inactive` |
| `is_active` | `bool GENERATED` | `GENERATED ALWAYS AS (status = 'active')` |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, id)` and `(accounting_profile_id, version)`

**Note:** `UNIQUE (tenant_id, id)` is required — child tables use composite FK `(profile_config_id, tenant_id)` for row-level tenant scoping.

### Profile Types

| Type | Use Case |
|---|---|
| `STANDARD` | Default AP/AR posting |
| `ACCRUAL` | Period-end accruals |
| `PREPAYMENT` | Advance payments |
| `CAPITALIZATION` | Asset capitalization |
| `RECLASS` | Account reclassifications |
| `INTERCOMPANY` | Cross-entity transactions |
| `FX_REVALUATION` | Foreign exchange revaluation |
| `REVERSAL` | Automatic reversal postings |
| `STATISTICAL` | Non-financial statistical entries |
| `COMMITMENT` | Encumbrance postings |
| `ENCUMBRANCE` | Budget encumbrances |
| `MILESTONE` | Milestone billing |
| `LEASE` | Lease accounting (IFRS 16 / ASC 842) |
| `REVENUE_POINT` | Point-in-time revenue recognition |
| `REVENUE_OVER_TIME` | Over-time revenue recognition |
| `DEFERRED_REVENUE` | Contract liability postings |
| `COGS` | Cost of goods sold |

---

## `control.acct_profile_commitment_config`

Optional 1:1 child of `acct_profile_config`. Controls commitment/encumbrance behavior. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_config_id` | `uuid NOT NULL UNIQUE` | |
| `creates_commitment` | `bool NOT NULL DEFAULT true` | |
| `commitment_type` | `text NOT NULL DEFAULT 'ONE_TIME'` | `ONE_TIME` / `FIXED_RECURRING` / `MILESTONE` / `USAGE_BASED` / `ESCALATING` / `RETENTION_RELEASE` |
| `releases_commitment_on` | `text` | Event code that releases the encumbrance |
| `encumbrance_behavior` | `text NOT NULL DEFAULT 'STANDARD'` | `NONE` / `STANDARD` / `STATISTICAL_ONLY` |
| `multi_year_strategy` | `text NOT NULL DEFAULT 'CURRENT_YEAR_ONLY'` | `CURRENT_YEAR_ONLY` / `HORIZON_SPREAD` / `FULL_RESERVE` |
| `advance_pct` | `numeric(5,2)` | Advance payment percentage (0–100) |
| `advance_recovery_method` | `text` | |
| `retention_pct` | `numeric(5,2)` | Retention percentage (0–100) |
| `retention_release_event` | `text` | Event code that releases retention |

---

## `control.acct_profile_revenue_config`

Optional 1:1 child. Revenue recognition configuration for OUTBOUND profiles. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_config_id` | `uuid NOT NULL UNIQUE` | |
| `revenue_recognition_method` | `text NOT NULL DEFAULT 'POINT_IN_TIME'` | `POINT_IN_TIME` / `OVER_TIME` / `PCT_COMPLETION` / `INPUT_METHOD` / `OUTPUT_METHOD` |
| `variable_consideration` | `text` | |
| `standalone_selling_price_method` | `text` | |
| `paired_profile_id` | `uuid` | FK → `master.accounting_profile` for COGS pairing |
| `fires_paired_on_event` | `text NOT NULL DEFAULT 'FULFILLMENT'` | Event code that triggers paired COGS entry |
| `deferral_account_code` | `text` | GL account for deferred revenue |
| `unbilled_ar_account_code` | `text` | GL account for unbilled AR |

---

## `control.acct_profile_settlement_config`

Optional 1:1 child. Settlement + dynamic discounting for profiles with special payment terms. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_config_id` | `uuid NOT NULL UNIQUE` | |
| `settlement_method` | `text NOT NULL DEFAULT 'PAYMENT'` | `PAYMENT` / `COLLECTION` / `NETTING` / `OFFSET` / `WRITE_OFF` / `PREPAID` / `SCF_FINANCED` / `NONE` |
| `settlement_tolerance` | `numeric(5,2) NOT NULL DEFAULT 0.00` | Tolerance percentage (0–100) |
| `discount_model` | `text` | `BUYER_FUNDED` / `SCF_SPLIT` / `SUPPLIER_INITIATED` |
| `discount_curve_type` | `text` | |
| `discount_apr` | `numeric(8,4)` | Annual percentage rate for early payment discount |
| `discount_min_days` | `smallint` | Minimum days ahead for discount eligibility |
| `discount_min_amount` | `numeric(18,4)` | Minimum amount threshold for discount |
| `scf_financier_id` | `uuid` | Supply chain finance financier |
| `scf_split_pct` | `numeric(5,2)` | Financier's split percentage (0–100) |

---

## `control.acct_profile_event`

Profile × lifecycle event bridge. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_config_id` | `uuid NOT NULL` | |
| `event_code` | `text NOT NULL` | FK → `control.transaction_event_catalog.code` |
| `event_name` | `text NOT NULL` | |
| `creates_je` | `bool NOT NULL DEFAULT true` | |
| `reverses_event` | `text` | Event code to reverse |
| `is_auto_reverse` | `bool NOT NULL DEFAULT false` | |
| `auto_reverse_offset` | `smallint NOT NULL DEFAULT 1` | Periods to offset for auto-reversal |
| `commitment_action` | `text NOT NULL DEFAULT 'NONE'` | `NONE` / `CREATE` / `INCREASE` / `RELEASE_PARTIAL` / `RELEASE_FULL` / `CANCEL` |
| `commitment_amount_source` | `text` | |
| `fires_paired_profile` | `bool NOT NULL DEFAULT false` | `true` = triggers COGS entry via `acct_profile_revenue_config` |
| `event_seq` | `smallint NOT NULL DEFAULT 0` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(profile_config_id, event_code)` and `(tenant_id, id)` (for child table composite FK)

---

## `control.acct_profile_entry_template`

Dr/Cr line templates per event. 21 `amount_source` values. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_event_id` | `uuid NOT NULL` | Composite FK → `(acct_profile_event.id, tenant_id)` |
| `line_seq` | `smallint NOT NULL` | Unique within event |
| `description` | `text NOT NULL` | |
| `posting_side` | `text NOT NULL` | `DEBIT` / `CREDIT` |
| `account_source` | `text NOT NULL DEFAULT 'FIXED'` | `FIXED` / `FROM_INTENT` / `FROM_CATEGORY` / `POSTING_ROLE` |
| `account_code` | `text` | Required when `account_source = 'FIXED'` |
| `account_lookup_key` | `text` | Required when `account_source = 'POSTING_ROLE'`; carries the posting_role_code |
| `account_fallback` | `text` | Fallback account when primary resolution fails |
| `amount_source` | `text NOT NULL DEFAULT 'DOCUMENT_TOTAL'` | See amount sources below |
| `amount_formula` | `text` | Expression for `CALCULATED` amount source |
| `amount_percentage` | `numeric(8,4)` | Percentage (0–100) for percentage-based amount sources |
| `is_balancing_line` | `bool NOT NULL DEFAULT false` | `true` = this line aggregates split AP/AR accounting lines |
| `override_cost_center` | `text` | |
| `override_profit_center` | `text` | |
| `override_dimension_set_id` | `uuid` | |
| `applies_to_doc_types` | `text[]` | NULL = all doc types |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

### Amount Source Values

| Value | Description |
|---|---|
| `DOCUMENT_TOTAL` | Full document amount |
| `LINE_AMOUNT` | Individual line amount |
| `TAX_AMOUNT` | Tax amount |
| `CALCULATED` | Custom formula expression |
| `REMAINDER` | Balancing remainder |
| `COMMITMENT_AMOUNT` | Encumbrance amount |
| `MILESTONE_AMOUNT` | Milestone billing amount |
| `FULFILLED_AMOUNT` | Fulfilled quantity × price |
| `REVENUE_AMOUNT` | Recognized revenue |
| `COGS_AMOUNT` | Cost of goods sold |
| `DISCOUNT_AMOUNT` | Early payment discount |
| `ADVANCE_AMOUNT` | Advance payment |
| `ADVANCE_RECOVERY` | Recovery of prior advance |
| `RETENTION_AMOUNT` | Retention withheld |
| `RETENTION_BALANCE` | Outstanding retention |
| `PENALTY_AMOUNT` | Late penalty |
| `REBATE_AMOUNT` | Volume rebate |
| `NET_PAYABLE` | Net amount after deductions |
| `DISCOUNT_EARNED` | Discount earned on early pay |
| `NET_AFTER_DISCOUNT` | Net after discount applied |
| `SCF_FINANCIER_AMOUNT` | Amount paid by SCF financier |

---

## `control.acct_profile_book_rule`

Per-book posting behavior overrides. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_config_id` | `uuid NOT NULL` | |
| `book_code` | `text NOT NULL` | Target ledger book |
| `posting_method` | `text NOT NULL DEFAULT 'MIRROR'` | `MIRROR` / `EXCLUDE` / `REMAP` |
| `account_mapping` | `jsonb NOT NULL DEFAULT '{}'` | Account substitutions for `REMAP` |
| `applies_to_events` | `text[]` | NULL = all events |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(profile_config_id, book_code)`

| Posting Method | Behavior |
|---|---|
| `MIRROR` | Same entries as primary book |
| `EXCLUDE` | Skip this book entirely |
| `REMAP` | Substitute accounts via `account_mapping` JSONB |

---

## `control.acct_profile_dimension_rule`

Dimension derivation rules per profile. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `profile_config_id` | `uuid NOT NULL` | |
| `dimension_type_id` | `uuid NOT NULL` | Which dimension type |
| `derive_source` | `text NOT NULL` | `FROM_DOCUMENT` / `FROM_LINE` / `FROM_OU` / `FROM_INTENT` / `FROM_COMMITMENT` / `FROM_CONTRACT` / `FROM_CUSTOMER` / `FROM_PRODUCT` / `FIXED` / `INHERIT` |
| `fixed_value_id` | `uuid` | When `derive_source = 'FIXED'` |
| `fallback_source` | `text` | Source to try if primary fails |
| `fallback_value_id` | `uuid` | |
| `behavior` | `text NOT NULL DEFAULT 'DERIVE_IF_MISSING'` | `REQUIRED` / `OPTIONAL` / `DERIVE_IF_MISSING` / `FIXED_VALUE` / `FORBIDDEN` |
| `is_required` | `bool NOT NULL DEFAULT false` | |
| `applies_to_events` | `text[]` | NULL = all events |
| `applies_to_books` | `text[]` | NULL = all books |
| `priority` | `smallint NOT NULL DEFAULT 0` | Lower = evaluated first |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.intent_to_accounting_profile_rule`

Multi-predicate profile resolution rules. First match by ascending priority wins. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `direction` | `text` | NULL = wildcard |
| `intent_id` | `uuid` | NULL = wildcard |
| `intent_domain` | `text` | NULL = wildcard |
| `flow_code` | `text` | NULL = wildcard |
| `company_code_id` | `uuid` | NULL = wildcard |
| `doc_type` | `text` | NULL = wildcard |
| `currency_code` | `text` | NULL = wildcard |
| `min_amount` / `max_amount` | `numeric(18,4)` | Amount range; NULL = wildcard |
| `is_cross_border` | `bool` | NULL = wildcard |
| `is_intercompany` | `bool` | NULL = wildcard |
| `commodity_domain` | `text` | NULL = wildcard |
| `commitment_type` | `text` | NULL = wildcard |
| `counterparty_tier` | `text` | NULL = wildcard |
| `contract_value_min` / `contract_value_max` | `numeric(18,4)` | NULL = wildcard |
| `revenue_type` | `text` | NULL = wildcard |
| `resolved_profile_config_id` | `uuid NOT NULL` | FK → `control.acct_profile_config` (composite FK) |
| `explanation_template` | `text NOT NULL` | Human-readable reason template |
| `confidence` | `numeric(3,2) NOT NULL DEFAULT 1.00` | 0.0–1.0 |
| `priority` | `int NOT NULL DEFAULT 50` | Lower = evaluated first |
| `effective_from` | `date NOT NULL` | |
| `effective_to` | `date` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active` / `inactive` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## `control.intent_profile_override`

Standing regulatory overrides (IFRS / ASC references). Takes precedence over `intent_to_accounting_profile_rule` at runtime. Governance-gated: `status = 'active'` only after `approved_by` is set. `ARCHETYPE=B;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `company_code_id` | `uuid` | NULL = all companies |
| `intent_id` | `uuid NOT NULL` | |
| `direction` | `text` | NULL = both |
| `flow_code` | `text` | NULL = all flows |
| `override_profile_config_id` | `uuid NOT NULL` | Profile to use instead |
| `reason` | `text NOT NULL` | Required narrative |
| `regulatory_reference` | `text` | IFRS article / ASC paragraph |
| `approved_by` | `uuid` | Approver principal |
| `approved_at` | `timestamptz` | |
| `effective_from` | `date NOT NULL` | |
| `effective_to` | `date` | |
| `status` | `text NOT NULL DEFAULT 'pending_approval'` | `pending_approval` / `active` / `inactive` / `revoked` |
| `is_active` | `bool GENERATED` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

---

## Related Docs

- [Overview](./overview.md)
- [Commodity Policy](./commodity-policy.md)
- [Dimension, Tax & Rounding](./dimension-tax-rounding.md)
- [Entity Operations](./entity-operations.md)
