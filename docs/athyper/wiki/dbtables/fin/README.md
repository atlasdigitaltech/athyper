# Financial Schema (`fin`)

The `fin` schema implements the complete financial operating platform: spend classification, decision grids, budgets/funding, commitments, general ledger postings, tax/withholding, fixed assets, inventory, commissions, production/WIP, multi-entity federation, and AI analytics. All monetary columns use `DECIMAL(18,4)` -- never floating point.

**Sources**: `157_spend_category.sql`, `160_decision_grid.sql`, `161_asset.sql`, `162_inventory.sql`, `163_commission.sql`, `164_federation.sql`, `165_production.sql`, `166_atlas_ai.sql`, `170_budget.sql`, `180_commitment.sql`, `190_posting.sql`, `195_tax.sql`

---

## Table of Contents

**Spend Classification** -- [spend_category](#finspend_category) | [spend_category_commodity_map](#finspend_category_commodity_map) | [category_intent_rule](#fincategory_intent_rule)

**Decision Grid** -- [transaction_pipeline](#fintransaction_pipeline) | [policy_module](#finpolicy_module) | [policy_evaluation_log](#finpolicy_evaluation_log) | [smart_default_rule](#finsmart_default_rule) | [exception](#finexception)

**Budget Engine** -- [funding_profile](#finfunding_profile) | [funding_transaction](#finfunding_transaction) | [funding_transfer](#finfunding_transfer)

**Commitment Engine** -- [commitment](#fincommitment) | [commitment_schedule](#fincommitment_schedule) | [commitment_fulfillment](#fincommitment_fulfillment)

**Posting / GL** -- [chart_of_accounts](#finchart_of_accounts) | [cost_center](#fincost_center) | [profit_center](#finprofit_center) | [fiscal_period](#finfiscal_period) | [accounting_profile](#finaccounting_profile) | [journal_entry](#finjournal_entry) | [journal_line](#finjournal_line) | [gl_balance](#fingl_balance)

**Tax Engine** -- [tax_jurisdiction](#fintax_jurisdiction) | [tax_rate](#fintax_rate) | [tax_calculation](#fintax_calculation) | [tax_credit_ledger](#fintax_credit_ledger)

**Asset Engine** -- [asset](#finasset) | [asset_book](#finasset_book) | [asset_transaction](#finasset_transaction) | [depreciation_run](#findepreciation_run)

**Inventory Engine** -- [warehouse](#finwarehouse) | [item_master](#finitem_master) | [inventory_balance](#fininventory_balance) | [inventory_movement](#fininventory_movement) | [inventory_valuation_layer](#fininventory_valuation_layer) | [stocktake](#finstocktake) | [stocktake_line](#finstocktake_line)

**Commission Engine** -- [commission_plan](#fincommission_plan) | [commission_assignment](#fincommission_assignment) | [commission_calculation](#fincommission_calculation) | [commission_statement](#fincommission_statement)

**Federation Engine** -- [legal_entity](#finlegal_entity) | [intercompany_agreement](#finintercompany_agreement) | [intercompany_transaction](#finintercompany_transaction) | [fx_rate](#finfx_rate) | [fx_revaluation](#finfx_revaluation) | [consolidation_elimination](#finconsolidation_elimination) | [netting_batch](#finnetting_batch)

**Production Engine** -- [bill_of_materials](#finbill_of_materials) | [bom_line](#finbom_line) | [routing](#finrouting) | [work_order](#finwork_order) | [work_order_cost](#finwork_order_cost) | [work_order_material_issue](#finwork_order_material_issue) | [production_variance](#finproduction_variance)

**Atlas AI Engine** -- [ai_model_registry](#finai_model_registry) | [ai_prediction](#finai_prediction) | [ai_action](#finai_action) | [ai_drift_monitor](#finai_drift_monitor)

---

# Spend Classification

## fin.spend_category

Tenant spend groups (20-60 per tenant) that bridge item classification (WHAT) to financial resolution (WHY). Each category carries OPEX/CAPEX auto-decision rules via capitalization thresholds, procurement type, asset handling defaults, visibility levels, and compliance flags. Categories form a hierarchy via `parent_id`.

| Column                      | Type          | Nullable | Default             | Description                                                                                     |
| --------------------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| id                          | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                                                              |
| tenant_id                   | uuid          | NOT NULL |                     | FK to core.tenant                                                                               |
| code                        | varchar(50)   | NOT NULL |                     | Unique category code per tenant                                                                 |
| name                        | varchar(200)  | NOT NULL |                     | Display name                                                                                    |
| description                 | text          | YES      |                     | Long description                                                                                |
| parent_id                   | uuid          | YES      |                     | Self-referencing parent for hierarchy                                                           |
| primary_domain              | varchar(50)   | NOT NULL |                     | Financial domain: `OPEX`, `CAPEX`, `REVENUE`, `TRANSFER`, `REGULATORY`, `ADMIN`                 |
| allowed_domains             | varchar(50)[] | NOT NULL | `'{}'`              | Additional allowed domains                                                                      |
| capitalization_threshold    | decimal(18,4) | YES      |                     | Amount threshold for OPEX/CAPEX auto-decision                                                   |
| capitalization_currency     | varchar(3)    | YES      |                     | Currency for threshold (FK to ref.currency)                                                     |
| procurement_type            | varchar(20)   | NOT NULL | `'MIXED'`           | `GOODS`, `SERVICES`, `MIXED`                                                                    |
| default_intent_id           | uuid          | YES      |                     | Default business intent (FK to fin.business_intent)                                             |
| default_gl_account          | varchar(20)   | YES      |                     | Default GL account code                                                                         |
| default_tax_code            | varchar(20)   | YES      |                     | Default tax code                                                                                |
| requires_asset_tagging      | boolean       | NOT NULL | `false`             | Whether CAPEX items need asset tags                                                             |
| default_useful_life_months  | integer       | YES      |                     | Default asset useful life                                                                       |
| default_depreciation_method | varchar(20)   | YES      |                     | `STRAIGHT_LINE`, `DECLINING_BALANCE`, `DOUBLE_DECLINING`, `UNITS_OF_PRODUCTION`, `SUM_OF_YEARS` |
| visibility                  | varchar(20)   | NOT NULL | `'STANDARD'`        | `STANDARD`, `RESTRICTED`, `CONFIDENTIAL`                                                        |
| classification_required     | boolean       | NOT NULL | `false`             | Whether classification is mandatory by policy                                                   |
| hs_required                 | boolean       | NOT NULL | `false`             | Whether HS code is required                                                                     |
| is_regulated                | boolean       | NOT NULL | `false`             | Whether this category is regulated                                                              |
| is_active                   | boolean       | NOT NULL | `true`              | Active flag                                                                                     |
| sort_order                  | integer       | NOT NULL | `0`                 | Display order                                                                                   |
| metadata                    | jsonb         | NOT NULL | `'{}'`              | Extensible metadata                                                                             |
| created_at                  | timestamptz   | NOT NULL | `now()`             | Created timestamp                                                                               |
| updated_at                  | timestamptz   | NOT NULL | `now()`             | Updated timestamp                                                                               |

**PK**: `(id)` | **Unique**: `(tenant_id, code)` | **FKs**: tenant_id -> core.tenant, parent_id -> fin.spend_category, capitalization_currency -> ref.currency, default_intent_id -> fin.business_intent

**Indexes**: idx_fin_spend_cat_tenant, idx_fin_spend_cat_parent, idx_fin_spend_cat_domain `(tenant_id, primary_domain)`, idx_fin_spend_cat_visibility `(tenant_id, visibility)`, idx_fin_spend_cat_active `(tenant_id, is_active) WHERE is_active = true`

---

## fin.spend_category_commodity_map

Links spend categories to commodity code ranges from any classification domain (UNSPSC, HS, etc.). Enables automatic category resolution from commodity codes. Supports range matching (from/to) and priority-based conflict resolution when ranges overlap.

| Column                | Type        | Nullable | Default             | Description                               |
| --------------------- | ----------- | -------- | ------------------- | ----------------------------------------- |
| id                    | uuid        | NOT NULL | `gen_random_uuid()` | PK                                        |
| tenant_id             | uuid        | NOT NULL |                     | FK to core.tenant                         |
| category_id           | uuid        | NOT NULL |                     | FK to fin.spend_category (CASCADE delete) |
| commodity_domain_code | text        | NOT NULL |                     | FK to ref.commodity_domain                |
| commodity_code_from   | text        | NOT NULL |                     | Range start or exact code                 |
| commodity_code_to     | text        | YES      |                     | Range end; NULL = exact match             |
| commodity_level       | smallint    | YES      |                     | Hierarchy level this mapping operates at  |
| priority              | integer     | NOT NULL | `0`                 | Conflict resolution priority (lower wins) |
| created_at            | timestamptz | NOT NULL | `now()`             | Created timestamp                         |

**PK**: `(id)` | **Unique**: `(tenant_id, category_id, commodity_domain_code, commodity_code_from)` | **FKs**: tenant_id -> core.tenant, category_id -> fin.spend_category (CASCADE), commodity_domain_code -> ref.commodity_domain

**Indexes**: idx_fin_sc_commodity_cat, idx_fin_sc_commodity_domain `(commodity_domain_code, commodity_code_from)`, idx_fin_sc_commodity_tenant

---

## fin.category_intent_rule

Context-driven rules that resolve a spend category + context into a specific business intent and financial domain. Each rule carries a human-readable explanation template with `{placeholders}` for audit trail explainability. Rules are evaluated by priority (lower first); a `FALLBACK` condition type serves as the default.

| Column               | Type        | Nullable | Default             | Description                                                                                                                 |
| -------------------- | ----------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| id                   | uuid        | NOT NULL | `gen_random_uuid()` | PK                                                                                                                          |
| tenant_id            | uuid        | NOT NULL |                     | FK to core.tenant                                                                                                           |
| category_id          | uuid        | NOT NULL |                     | FK to fin.spend_category (CASCADE delete)                                                                                   |
| condition_type       | varchar(30) | NOT NULL |                     | `AMOUNT_ABOVE`, `AMOUNT_BELOW`, `IS_RECURRING`, `IS_ONE_TIME`, `OU_MATCH`, `PROCUREMENT_METHOD`, `CROSS_BORDER`, `FALLBACK` |
| condition_config     | jsonb       | NOT NULL | `'{}'`              | Condition parameters (varies by type)                                                                                       |
| resolved_intent_id   | uuid        | NOT NULL |                     | FK to fin.business_intent                                                                                                   |
| resolved_domain      | varchar(50) | YES      |                     | Override domain: `OPEX`, `CAPEX`, `REVENUE`, `TRANSFER`, `REGULATORY`, `ADMIN`                                              |
| priority             | integer     | NOT NULL | `50`                | Evaluation order (lower = first; FALLBACK should be 99)                                                                     |
| is_active            | boolean     | NOT NULL | `true`              | Active flag                                                                                                                 |
| explanation_template | text        | NOT NULL |                     | Human-readable template with {placeholders}                                                                                 |
| created_at           | timestamptz | NOT NULL | `now()`             | Created timestamp                                                                                                           |

**PK**: `(id)` | **Unique**: `(tenant_id, category_id, condition_type, priority)` | **FKs**: tenant_id -> core.tenant, category_id -> fin.spend_category (CASCADE), resolved_intent_id -> fin.business_intent

**Indexes**: idx_fin_cat_intent_rule_cat, idx_fin_cat_intent_rule_tenant, idx_fin_cat_intent_rule_active `(tenant_id, category_id, priority) WHERE is_active = true`

---

# Decision Grid Engine

## fin.transaction_pipeline

Central transaction processing state machine that tracks every financial transaction through a multi-step pipeline: intake, OU validation, classification, intent resolution, smart defaults, funding check, commitment creation, policy evaluation, risk scoring, workflow assembly, tax calculation, AI enhancement, and finalization. Accumulates resolved financial dimensions progressively and records every auto-decision with explanations and user overrides for full auditability.

| Column                         | Type         | Nullable | Default             | Description                                                        |
| ------------------------------ | ------------ | -------- | ------------------- | ------------------------------------------------------------------ |
| id                             | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                                 |
| tenant_id                      | uuid         | NOT NULL |                     | FK to core.tenant                                                  |
| txn_id                         | uuid         | NOT NULL |                     | Unique transaction ID                                              |
| doc_id                         | uuid         | NOT NULL |                     | Source document ID                                                 |
| doc_type                       | varchar(20)  | NOT NULL |                     | Document type                                                      |
| ou_id                          | uuid         | NOT NULL |                     | FK to fin.operating_unit                                           |
| intent_id                      | uuid         | YES      |                     | FK to fin.business_intent                                          |
| status                         | varchar(30)  | NOT NULL | `'INTAKE'`          | Pipeline step (14 steps from INTAKE to COMPLETED/FAILED)           |
| current_step                   | smallint     | NOT NULL | `1`                 | Current step number                                                |
| composite_score                | decimal(3,2) | YES      |                     | Aggregate risk/policy score                                        |
| workflow_path                  | varchar(20)  | YES      |                     | `ZERO_APPROVAL`, `STANDARD`, `ENHANCED`, `EXECUTIVE`, `BLOCKED`    |
| rejection_reason               | text         | YES      |                     | Why the transaction was rejected                                   |
| remediation_guidance           | text         | YES      |                     | How to fix a rejected transaction                                  |
| finalization_seq               | integer      | NOT NULL | `1`                 | Finalization sequence counter                                      |
| resolved_gl_account            | varchar(20)  | YES      |                     | Resolved GL account                                                |
| resolved_cost_center           | varchar(20)  | YES      |                     | Resolved cost center                                               |
| resolved_profit_center         | varchar(20)  | YES      |                     | Resolved profit center                                             |
| resolved_fund_center           | varchar(20)  | YES      |                     | Resolved fund center                                               |
| resolved_fp_id                 | uuid         | YES      |                     | Resolved funding profile                                           |
| resolved_tax_profile           | jsonb        | YES      |                     | Resolved tax configuration                                         |
| resolved_asset_profile         | jsonb        | YES      |                     | Resolved asset configuration                                       |
| resolved_accounting_profile_id | uuid         | YES      |                     | FK to fin.accounting_profile                                       |
| spend_category_id              | uuid         | YES      |                     | Resolved spend category                                            |
| commodity_domain_code          | text         | YES      |                     | Classification domain                                              |
| commodity_code                 | text         | YES      |                     | Commodity code                                                     |
| resolved_hs_code               | text         | YES      |                     | HS code for cross-border                                           |
| classification_confidence      | decimal(5,2) | YES      |                     | AI classification confidence (0-100)                               |
| classification_source          | varchar(20)  | NOT NULL | `'NONE'`            | `USER_SELECTED`, `AI_SUGGESTED`, `AUTO_MATCHED`, `NONE`            |
| classification_required        | boolean      | NOT NULL | `false`             | Whether classification is mandatory                                |
| is_cross_border                | boolean      | NOT NULL | `false`             | Cross-border flag                                                  |
| cross_border_reason            | text         | YES      |                     | Why cross-border was determined                                    |
| decision_explanations          | jsonb        | NOT NULL | `'[]'`              | Array of {step, field, decision, explanation, rule_id, confidence} |
| user_overrides                 | jsonb        | NOT NULL | `'[]'`              | Array of {field, suggested_value, user_value, reason}              |
| smart_defaults_confidence      | decimal(3,2) | YES      |                     | Smart defaults confidence score                                    |
| policy_decisions               | jsonb        | YES      |                     | Policy evaluation results                                          |
| risk_scores                    | jsonb        | YES      |                     | Risk assessment results                                            |
| ai_advisory                    | jsonb        | YES      |                     | AI advisory output                                                 |
| submitted_by                   | uuid         | NOT NULL |                     | Who submitted the transaction                                      |
| submitted_at                   | timestamptz  | NOT NULL | `now()`             | Submission timestamp                                               |
| finalized_at                   | timestamptz  | YES      |                     | Finalization timestamp                                             |
| created_at                     | timestamptz  | NOT NULL | `now()`             | Created timestamp                                                  |
| updated_at                     | timestamptz  | NOT NULL | `now()`             | Updated timestamp                                                  |

**PK**: `(id)` | **Unique**: `(txn_id)` | **FKs**: tenant_id -> core.tenant, ou_id -> fin.operating_unit, intent_id -> fin.business_intent, spend_category_id -> fin.spend_category

**Indexes**: idx_fin_pipeline_tenant, idx_fin_pipeline_txn, idx_fin_pipeline_ou, idx_fin_pipeline_status `(tenant_id, status)`, idx_fin_pipeline_spend_cat, idx_fin_pipeline_cross_border `(tenant_id, is_cross_border) WHERE is_cross_border = true`

---

## fin.policy_module

Registered policy modules that evaluate transactions during the policy evaluation pipeline step. Each module has a version, scope, configuration hash (for audit reproducibility), and extensibility flag.

| Column         | Type         | Nullable | Default             | Description                            |
| -------------- | ------------ | -------- | ------------------- | -------------------------------------- |
| id             | uuid         | NOT NULL | `gen_random_uuid()` | PK                                     |
| tenant_id      | uuid         | NOT NULL |                     | FK to core.tenant                      |
| module_id      | varchar(20)  | NOT NULL |                     | Module identifier                      |
| module_name    | varchar(100) | NOT NULL |                     | Display name                           |
| module_version | varchar(20)  | NOT NULL |                     | Version string                         |
| scope          | text         | NOT NULL |                     | Scope of applicability                 |
| status         | varchar(20)  | NOT NULL | `'ACTIVE'`          | `ACTIVE`, `DRAFT`, `DEPRECATED`        |
| config_hash    | varchar(64)  | NOT NULL |                     | SHA-256 of configuration for audit     |
| config         | jsonb        | NOT NULL | `'{}'`              | Module configuration                   |
| is_extensible  | boolean      | NOT NULL | `false`             | Whether tenants can extend this module |
| created_at     | timestamptz  | NOT NULL | `now()`             | Created timestamp                      |
| updated_at     | timestamptz  | NOT NULL | `now()`             | Updated timestamp                      |

**PK**: `(id)` | **Unique**: `(tenant_id, module_id, module_version)` | **FKs**: tenant_id -> core.tenant

---

## fin.policy_evaluation_log

Immutable audit log of every policy evaluation decision. Each row records which module version (with config hash) evaluated which transaction, the resulting score, action, conditions met, required approvers, SLA, and a human-readable explanation.

| Column         | Type         | Nullable | Default             | Description                              |
| -------------- | ------------ | -------- | ------------------- | ---------------------------------------- |
| id             | uuid         | NOT NULL | `gen_random_uuid()` | PK                                       |
| tenant_id      | uuid         | NOT NULL |                     | FK to core.tenant                        |
| txn_id         | uuid         | NOT NULL |                     | Transaction evaluated                    |
| pipeline_id    | uuid         | NOT NULL |                     | FK to fin.transaction_pipeline           |
| module_id      | varchar(20)  | NOT NULL |                     | Policy module that evaluated             |
| module_version | varchar(20)  | NOT NULL |                     | Module version used                      |
| config_hash    | varchar(64)  | NOT NULL |                     | Config hash at evaluation time           |
| score          | decimal(3,2) | NOT NULL |                     | Evaluation score                         |
| action         | varchar(20)  | NOT NULL |                     | `APPROVE`, `REVIEW`, `ESCALATE`, `BLOCK` |
| conditions     | jsonb        | YES      | `'[]'`              | Conditions that were evaluated           |
| approvers      | jsonb        | YES      | `'[]'`              | Required approvers                       |
| sla_hours      | integer      | YES      |                     | SLA for resolution                       |
| explanation    | text         | NOT NULL |                     | Human-readable explanation               |
| confidence     | decimal(3,2) | YES      |                     | Evaluation confidence                    |
| evaluated_at   | timestamptz  | NOT NULL | `now()`             | Evaluation timestamp                     |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, pipeline_id -> fin.transaction_pipeline

**Indexes**: idx_fin_policy_eval_txn `(txn_id)`, idx_fin_policy_eval_pipeline `(pipeline_id)`

---

## fin.smart_default_rule

Configurable rules for auto-populating financial fields (GL account, cost center, tax code, etc.) during the smart defaults pipeline step. Each rule specifies the target field, resolution method (`RULES_ENGINE`, `ML_FALLBACK`, `DIRECT_LOOKUP`), conditions, and resolution configuration.

| Column     | Type        | Nullable | Default             | Description                                    |
| ---------- | ----------- | -------- | ------------------- | ---------------------------------------------- |
| id         | uuid        | NOT NULL | `gen_random_uuid()` | PK                                             |
| tenant_id  | uuid        | NOT NULL |                     | FK to core.tenant                              |
| field_name | varchar(50) | NOT NULL |                     | Target field to populate                       |
| source     | varchar(50) | NOT NULL |                     | Resolution source                              |
| method     | varchar(20) | NOT NULL |                     | `RULES_ENGINE`, `ML_FALLBACK`, `DIRECT_LOOKUP` |
| priority   | integer     | NOT NULL | `0`                 | Evaluation priority                            |
| conditions | jsonb       | NOT NULL | `'{}'`              | When this rule applies                         |
| resolution | jsonb       | NOT NULL | `'{}'`              | How to resolve the value                       |
| is_active  | boolean     | NOT NULL | `true`              | Active flag                                    |
| created_at | timestamptz | NOT NULL | `now()`             | Created timestamp                              |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant

**Indexes**: idx_fin_smart_default_tenant, idx_fin_smart_default_field `(tenant_id, field_name)`

---

## fin.exception

Exception/override objects that temporarily bypass policy decisions for specific scopes (transaction, document, OU, funding profile, policy module, or vendor). Tracks a full lifecycle from request through review, approval, application, expiry, and revocation. Carries audit tags for compliance reporting.

| Column           | Type        | Nullable | Default             | Description                                                                        |
| ---------------- | ----------- | -------- | ------------------- | ---------------------------------------------------------------------------------- |
| id               | uuid        | NOT NULL | `gen_random_uuid()` | PK                                                                                 |
| tenant_id        | uuid        | NOT NULL |                     | FK to core.tenant                                                                  |
| exception_id     | uuid        | NOT NULL |                     | Unique exception identifier                                                        |
| scope_type       | varchar(30) | NOT NULL |                     | `txn_id`, `doc_id`, `ou_id`, `funding_profile_id`, `policy_module_id`, `vendor_id` |
| scope_id         | uuid        | NOT NULL |                     | ID of the scoped entity                                                            |
| txn_id           | uuid        | YES      |                     | Associated transaction                                                             |
| requested_by     | uuid        | NOT NULL |                     | Who requested the exception                                                        |
| requested_at     | timestamptz | NOT NULL | `now()`             | Request timestamp                                                                  |
| reason_code      | varchar(50) | NOT NULL |                     | Reason code                                                                        |
| reason_text      | text        | NOT NULL |                     | Free-text justification                                                            |
| policy_overrides | jsonb       | YES      | `'[]'`              | Policies being overridden                                                          |
| funding_override | jsonb       | YES      |                     | Funding override details                                                           |
| valid_from       | timestamptz | NOT NULL |                     | Exception validity start                                                           |
| valid_to         | timestamptz | NOT NULL |                     | Exception validity end                                                             |
| status           | varchar(20) | NOT NULL | `'REQUESTED'`       | `REQUESTED`, `REVIEWED`, `APPROVED`, `REJECTED`, `APPLIED`, `EXPIRED`, `REVOKED`   |
| approvers        | jsonb       | YES      | `'[]'`              | Approver chain                                                                     |
| audit_tags       | text[]      | YES      | `'{}'`              | Compliance audit tags                                                              |
| applied_at       | timestamptz | YES      |                     | When applied                                                                       |
| expired_at       | timestamptz | YES      |                     | When expired                                                                       |
| revoked_at       | timestamptz | YES      |                     | When revoked                                                                       |
| revoked_by       | uuid        | YES      |                     | Who revoked                                                                        |
| created_at       | timestamptz | NOT NULL | `now()`             | Created timestamp                                                                  |

**PK**: `(id)` | **Unique**: `(exception_id)` | **FKs**: tenant_id -> core.tenant

**Indexes**: idx_fin_exception_tenant, idx_fin_exception_scope `(scope_type, scope_id)`, idx_fin_exception_status, idx_fin_exception_validity `(valid_from, valid_to)`

---

# Budget Engine

## fin.funding_profile

4-level hierarchical funding envelope (Enterprise > Division > OU > Intent). Tracks total limits, reserved/committed/consumed/released amounts, health status with color coding, utilization percentage, trend direction, and predicted exhaustion dates. Supports multi-year budgets with carry-forward rules.

| Column                    | Type          | Nullable | Default             | Description                                               |
| ------------------------- | ------------- | -------- | ------------------- | --------------------------------------------------------- |
| id                        | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                        |
| tenant_id                 | uuid          | NOT NULL |                     | FK to core.tenant                                         |
| entity_code               | varchar(20)   | NOT NULL |                     | Legal entity code                                         |
| code                      | varchar(50)   | NOT NULL |                     | Funding profile code                                      |
| name                      | varchar(200)  | NOT NULL |                     | Display name                                              |
| description               | text          | YES      |                     | Description                                               |
| level                     | smallint      | NOT NULL |                     | Hierarchy level: 1=Enterprise, 2=Division, 3=OU, 4=Intent |
| parent_id                 | uuid          | YES      |                     | Self-referencing parent                                   |
| ou_id                     | uuid          | YES      |                     | FK to fin.operating_unit                                  |
| intent_id                 | uuid          | YES      |                     | FK to fin.business_intent                                 |
| total_limit               | decimal(18,4) | NOT NULL |                     | Total budget amount                                       |
| currency_code             | varchar(3)    | NOT NULL |                     | FK to ref.currency                                        |
| reserved_amount           | decimal(18,4) | NOT NULL | `0`                 | Amount reserved (soft hold)                               |
| committed_amount          | decimal(18,4) | NOT NULL | `0`                 | Amount committed (PO/contract)                            |
| consumed_amount           | decimal(18,4) | NOT NULL | `0`                 | Amount consumed (invoiced/paid)                           |
| released_amount           | decimal(18,4) | NOT NULL | `0`                 | Amount released back                                      |
| health_status             | varchar(10)   | NOT NULL | `'GREEN'`           | `GREEN`, `YELLOW`, `RED`, `BLACK`                         |
| utilization_pct           | decimal(5,2)  | NOT NULL | `0`                 | Current utilization percentage                            |
| trend                     | varchar(15)   | NOT NULL | `'STABLE'`          | `IMPROVING`, `STABLE`, `DETERIORATING`                    |
| predicted_exhaustion_date | date          | YES      |                     | AI-predicted exhaustion date                              |
| last_reforecast_at        | timestamptz   | YES      |                     | Last reforecast timestamp                                 |
| fiscal_year               | smallint      | NOT NULL |                     | Fiscal year                                               |
| is_multi_year             | boolean       | NOT NULL | `false`             | Multi-year flag                                           |
| carry_forward_rule        | varchar(10)   | NOT NULL | `'NONE'`            | `NONE`, `PARTIAL`, `FULL`                                 |
| carry_forward_cap         | decimal(18,4) | YES      |                     | Maximum carry-forward amount                              |
| status                    | varchar(20)   | NOT NULL | `'ACTIVE'`          | `DRAFT`, `ACTIVE`, `FROZEN`, `CLOSED`                     |
| created_at                | timestamptz   | NOT NULL | `now()`             | Created timestamp                                         |
| updated_at                | timestamptz   | NOT NULL | `now()`             | Updated timestamp                                         |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, code, fiscal_year)` | **FKs**: tenant_id -> core.tenant, parent_id -> fin.funding_profile, ou_id -> fin.operating_unit, intent_id -> fin.business_intent, currency_code -> ref.currency | **Check constraints**: level BETWEEN 1 AND 4; all amount columns >= 0

**Indexes**: idx_fin_fp_tenant, idx_fin_fp_parent, idx_fin_fp_ou, idx_fin_fp_health `(tenant_id, health_status)`, idx_fin_fp_entity_year `(tenant_id, entity_code, fiscal_year)`

---

## fin.funding_transaction

Immutable log of every funding lifecycle event (reserve, commit, consume, release) against a funding profile. Captures the full before/after state snapshot for audit trail. Supports idempotency keys to prevent duplicate operations and optional expiry for reservation timeouts.

| Column          | Type          | Nullable | Default             | Description                                   |
| --------------- | ------------- | -------- | ------------------- | --------------------------------------------- |
| id              | uuid          | NOT NULL | `gen_random_uuid()` | PK                                            |
| tenant_id       | uuid          | NOT NULL |                     | FK to core.tenant                             |
| fp_id           | uuid          | NOT NULL |                     | FK to fin.funding_profile                     |
| txn_id          | uuid          | NOT NULL |                     | Transaction that triggered this funding event |
| action          | varchar(20)   | NOT NULL |                     | `RESERVE`, `COMMIT`, `CONSUME`, `RELEASE`     |
| amount          | decimal(18,4) | NOT NULL |                     | Amount of the funding action                  |
| currency_code   | varchar(3)    | NOT NULL |                     | Currency                                      |
| previous_state  | jsonb         | NOT NULL |                     | Snapshot of FP state before this action       |
| resulting_state | jsonb         | NOT NULL |                     | Snapshot of FP state after this action        |
| reason          | text          | YES      |                     | Reason for this funding action                |
| performed_by    | uuid          | NOT NULL |                     | Who performed the action                      |
| performed_at    | timestamptz   | NOT NULL | `now()`             | Action timestamp                              |
| expires_at      | timestamptz   | YES      |                     | Reservation expiry                            |
| idempotency_key | varchar(200)  | YES      |                     | Idempotency key                               |

**PK**: `(id)` | **Unique**: `(idempotency_key)` | **FKs**: tenant_id -> core.tenant, fp_id -> fin.funding_profile

**Indexes**: idx_fin_ftxn_fp, idx_fin_ftxn_txn, idx_fin_ftxn_tenant, idx_fin_ftxn_expires `WHERE expires_at IS NOT NULL`

---

## fin.funding_transfer

Cross-funding-profile fund transfers with approval workflow. Enables budget reallocation between funding profiles with full justification tracking and approval chain.

| Column        | Type          | Nullable | Default             | Description                                    |
| ------------- | ------------- | -------- | ------------------- | ---------------------------------------------- |
| id            | uuid          | NOT NULL | `gen_random_uuid()` | PK                                             |
| tenant_id     | uuid          | NOT NULL |                     | FK to core.tenant                              |
| from_fp_id    | uuid          | NOT NULL |                     | Source funding profile                         |
| to_fp_id      | uuid          | NOT NULL |                     | Destination funding profile                    |
| amount        | decimal(18,4) | NOT NULL |                     | Transfer amount                                |
| currency_code | varchar(3)    | NOT NULL |                     | Currency                                       |
| reason        | text          | NOT NULL |                     | Justification                                  |
| status        | varchar(20)   | NOT NULL | `'PENDING'`         | `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED` |
| approved_by   | uuid          | YES      |                     | Approver                                       |
| approved_at   | timestamptz   | YES      |                     | Approval timestamp                             |
| created_at    | timestamptz   | NOT NULL | `now()`             | Created timestamp                              |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, from_fp_id -> fin.funding_profile, to_fp_id -> fin.funding_profile

**Indexes**: idx_fin_fxfer_from, idx_fin_fxfer_to, idx_fin_fxfer_tenant

---

# Commitment Engine

## fin.commitment

Commitment master records representing financial obligations: purchase orders, contracts, subscriptions, leases, and retention releases. Tracks total/fulfilled/remaining amounts (remaining is a generated column), dates, renewal terms, and approval chain. Links to operating units, business intents, funding profiles, suppliers, and customers.

| Column                    | Type          | Nullable  | Default             | Description                                                                                  |
| ------------------------- | ------------- | --------- | ------------------- | -------------------------------------------------------------------------------------------- |
| id                        | uuid          | NOT NULL  | `gen_random_uuid()` | PK                                                                                           |
| tenant_id                 | uuid          | NOT NULL  |                     | FK to core.tenant                                                                            |
| entity_code               | varchar(20)   | NOT NULL  |                     | Legal entity code                                                                            |
| txn_id                    | uuid          | NOT NULL  |                     | Transaction ID                                                                               |
| doc_number                | varchar(50)   | NOT NULL  |                     | Document number                                                                              |
| doc_type                  | varchar(20)   | NOT NULL  |                     | `PR`, `PO`, `CONTRACT`, `SUBSCRIPTION`, `LEASE`                                              |
| commitment_type           | varchar(30)   | NOT NULL  |                     | `ONE_TIME`, `FIXED_RECURRING`, `MILESTONE`, `USAGE_BASED`, `ESCALATING`, `RETENTION_RELEASE` |
| status                    | varchar(30)   | NOT NULL  | `'DRAFT'`           | `DRAFT`, `PENDING`, `ACTIVE`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELLED`, `EXPIRED`     |
| ou_id                     | uuid          | NOT NULL  |                     | FK to fin.operating_unit                                                                     |
| intent_id                 | uuid          | YES       |                     | FK to fin.business_intent                                                                    |
| fp_id                     | uuid          | YES       |                     | FK to fin.funding_profile                                                                    |
| vendor_id                 | uuid          | YES       |                     | FK to ent.supplier                                                                           |
| customer_id               | uuid          | YES       |                     | FK to ent.customer                                                                           |
| total_amount              | decimal(18,4) | NOT NULL  |                     | Total commitment amount                                                                      |
| currency_code             | varchar(3)    | NOT NULL  |                     | FK to ref.currency                                                                           |
| fulfilled_amount          | decimal(18,4) | NOT NULL  | `0`                 | Amount fulfilled so far                                                                      |
| remaining_amount          | decimal(18,4) | GENERATED |                     | `total_amount - fulfilled_amount` (STORED)                                                   |
| effective_date            | date          | NOT NULL  |                     | Commitment start date                                                                        |
| expiry_date               | date          | YES       |                     | Commitment end date                                                                          |
| delivery_date             | date          | YES       |                     | Expected delivery date                                                                       |
| auto_renew                | boolean       | NOT NULL  | `false`             | Auto-renewal flag                                                                            |
| renewal_terms             | jsonb         | YES       |                     | Renewal configuration                                                                        |
| notify_before_expiry_days | integer       | YES       |                     | Days before expiry to send notification                                                      |
| description               | text          | YES       |                     | Description                                                                                  |
| line_items                | jsonb         | NOT NULL  | `'[]'`              | Commitment line items                                                                        |
| terms                     | jsonb         | YES       | `'{}'`              | Terms and conditions                                                                         |
| submitted_by              | uuid          | NOT NULL  |                     | Submitter                                                                                    |
| approved_by               | uuid          | YES       |                     | Approver                                                                                     |
| approved_at               | timestamptz   | YES       |                     | Approval timestamp                                                                           |
| created_at                | timestamptz   | NOT NULL  | `now()`             | Created timestamp                                                                            |
| updated_at                | timestamptz   | NOT NULL  | `now()`             | Updated timestamp                                                                            |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, doc_number)` | **FKs**: tenant_id -> core.tenant, ou_id -> fin.operating_unit, intent_id -> fin.business_intent, fp_id -> fin.funding_profile, vendor_id -> ent.supplier, customer_id -> ent.customer, currency_code -> ref.currency

**Indexes**: idx_fin_commitment_tenant, idx_fin_commitment_ou, idx_fin_commitment_vendor, idx_fin_commitment_fp, idx_fin_commitment_txn, idx_fin_commitment_status `(tenant_id, status)`, idx_fin_commitment_expiry `WHERE expiry_date IS NOT NULL`

---

## fin.commitment_schedule

Schedule entries for recurring and milestone-based commitments. Each entry represents a single payment/delivery due date with its amount and fulfillment status. Sequence numbers maintain ordering within a commitment.

| Column         | Type          | Nullable | Default             | Description                                                 |
| -------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------- |
| id             | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                          |
| tenant_id      | uuid          | NOT NULL |                     | FK to core.tenant                                           |
| commitment_id  | uuid          | NOT NULL |                     | FK to fin.commitment (CASCADE delete)                       |
| schedule_seq   | integer       | NOT NULL |                     | Sequence within commitment                                  |
| due_date       | date          | NOT NULL |                     | Payment/delivery due date                                   |
| amount         | decimal(18,4) | NOT NULL |                     | Scheduled amount                                            |
| currency_code  | varchar(3)    | NOT NULL |                     | Currency                                                    |
| status         | varchar(20)   | NOT NULL | `'PENDING'`         | `PENDING`, `TRIGGERED`, `FULFILLED`, `SKIPPED`, `CANCELLED` |
| milestone_name | varchar(200)  | YES      |                     | Milestone name (for milestone-type)                         |
| triggered_at   | timestamptz   | YES      |                     | When triggered                                              |
| fulfilled_at   | timestamptz   | YES      |                     | When fulfilled                                              |

**PK**: `(id)` | **Unique**: `(tenant_id, commitment_id, schedule_seq)` | **FKs**: tenant_id -> core.tenant, commitment_id -> fin.commitment (CASCADE)

**Indexes**: idx_fin_sched_commitment, idx_fin_sched_due `(due_date, status)`

---

## fin.commitment_fulfillment

Records that match goods receipt notes (GRN), service receipts, payments, or milestone completions against commitments. Each fulfillment reduces the commitment's remaining amount. Links optionally to a specific schedule entry for milestone/recurring commitments.

| Column           | Type          | Nullable | Default             | Description                                               |
| ---------------- | ------------- | -------- | ------------------- | --------------------------------------------------------- |
| id               | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                        |
| tenant_id        | uuid          | NOT NULL |                     | FK to core.tenant                                         |
| commitment_id    | uuid          | NOT NULL |                     | FK to fin.commitment                                      |
| schedule_id      | uuid          | YES      |                     | FK to fin.commitment_schedule                             |
| fulfillment_type | varchar(20)   | NOT NULL |                     | `GRN`, `SERVICE_RECEIPT`, `PAYMENT`, `MILESTONE_COMPLETE` |
| reference_doc_id | uuid          | YES      |                     | Reference document ID                                     |
| amount           | decimal(18,4) | NOT NULL |                     | Fulfillment amount                                        |
| currency_code    | varchar(3)    | NOT NULL |                     | Currency                                                  |
| fulfilled_by     | uuid          | NOT NULL |                     | Who recorded the fulfillment                              |
| fulfilled_at     | timestamptz   | NOT NULL | `now()`             | Fulfillment timestamp                                     |
| notes            | text          | YES      |                     | Notes                                                     |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, commitment_id -> fin.commitment, schedule_id -> fin.commitment_schedule

**Indexes**: idx_fin_fulfill_commitment, idx_fin_fulfill_schedule, idx_fin_fulfill_tenant

---

# Posting / General Ledger

## fin.chart_of_accounts

GL account master defining the chart of accounts hierarchy. Each account has a type (asset, liability, equity, revenue, expense), normal balance side, and optional subledger linkage (AP, AR, asset, inventory, WIP, commission). Group accounts cannot receive direct postings.

| Column               | Type         | Nullable | Default             | Description                                           |
| -------------------- | ------------ | -------- | ------------------- | ----------------------------------------------------- |
| id                   | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                    |
| tenant_id            | uuid         | NOT NULL |                     | FK to core.tenant                                     |
| entity_code          | varchar(20)  | NOT NULL |                     | Legal entity code                                     |
| account_code         | varchar(20)  | NOT NULL |                     | GL account code                                       |
| account_name         | varchar(200) | NOT NULL |                     | Display name                                          |
| account_type         | varchar(20)  | NOT NULL |                     | `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`  |
| normal_balance       | varchar(10)  | NOT NULL |                     | `DEBIT`, `CREDIT`                                     |
| parent_id            | uuid         | YES      |                     | Self-referencing parent                               |
| level                | smallint     | NOT NULL | `1`                 | Hierarchy depth                                       |
| is_group             | boolean      | NOT NULL | `false`             | Group (summary) account flag                          |
| is_active            | boolean      | NOT NULL | `true`              | Active flag                                           |
| allow_direct_posting | boolean      | NOT NULL | `true`              | Whether direct posting is allowed                     |
| subledger_type       | varchar(20)  | YES      |                     | `AP`, `AR`, `ASSET`, `INVENTORY`, `WIP`, `COMMISSION` |
| currency_code        | varchar(3)   | YES      |                     | Account currency (FK to ref.currency)                 |
| tags                 | jsonb        | YES      | `'[]'`              | Tags                                                  |
| created_at           | timestamptz  | NOT NULL | `now()`             | Created timestamp                                     |
| updated_at           | timestamptz  | NOT NULL | `now()`             | Updated timestamp                                     |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, account_code)` | **FKs**: tenant_id -> core.tenant, parent_id -> fin.chart_of_accounts, currency_code -> ref.currency

**Indexes**: idx_fin_coa_tenant, idx_fin_coa_type `(tenant_id, account_type)`, idx_fin_coa_parent, idx_fin_coa_subledger `WHERE subledger_type IS NOT NULL`

---

## fin.cost_center

Cost center master for expense allocation. Supports hierarchy via `parent_id`.

| Column      | Type         | Nullable | Default             | Description             |
| ----------- | ------------ | -------- | ------------------- | ----------------------- |
| id          | uuid         | NOT NULL | `gen_random_uuid()` | PK                      |
| tenant_id   | uuid         | NOT NULL |                     | FK to core.tenant       |
| entity_code | varchar(20)  | NOT NULL |                     | Legal entity code       |
| code        | varchar(20)  | NOT NULL |                     | Cost center code        |
| name        | varchar(200) | NOT NULL |                     | Display name            |
| parent_id   | uuid         | YES      |                     | Self-referencing parent |
| is_active   | boolean      | NOT NULL | `true`              | Active flag             |
| created_at  | timestamptz  | NOT NULL | `now()`             | Created timestamp       |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, code)` | **FKs**: tenant_id -> core.tenant, parent_id -> fin.cost_center

---

## fin.profit_center

Profit center master for revenue and margin tracking.

| Column      | Type         | Nullable | Default             | Description        |
| ----------- | ------------ | -------- | ------------------- | ------------------ |
| id          | uuid         | NOT NULL | `gen_random_uuid()` | PK                 |
| tenant_id   | uuid         | NOT NULL |                     | FK to core.tenant  |
| entity_code | varchar(20)  | NOT NULL |                     | Legal entity code  |
| code        | varchar(20)  | NOT NULL |                     | Profit center code |
| name        | varchar(200) | NOT NULL |                     | Display name       |
| is_active   | boolean      | NOT NULL | `true`              | Active flag        |
| created_at  | timestamptz  | NOT NULL | `now()`             | Created timestamp  |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, code)` | **FKs**: tenant_id -> core.tenant

---

## fin.fiscal_period

Period control managing the open/close lifecycle of accounting periods. Each period transitions through `FUTURE` -> `OPEN` -> `SOFT_CLOSE` -> `HARD_CLOSE`. Soft-close allows adjustments; hard-close is final.

| Column         | Type        | Nullable | Default             | Description                                  |
| -------------- | ----------- | -------- | ------------------- | -------------------------------------------- |
| id             | uuid        | NOT NULL | `gen_random_uuid()` | PK                                           |
| tenant_id      | uuid        | NOT NULL |                     | FK to core.tenant                            |
| entity_code    | varchar(20) | NOT NULL |                     | Legal entity code                            |
| fiscal_year    | smallint    | NOT NULL |                     | Fiscal year                                  |
| period_number  | smallint    | NOT NULL |                     | Period number within year                    |
| period_name    | varchar(50) | NOT NULL |                     | Period display name                          |
| start_date     | date        | NOT NULL |                     | Period start date                            |
| end_date       | date        | NOT NULL |                     | Period end date                              |
| status         | varchar(20) | NOT NULL | `'FUTURE'`          | `FUTURE`, `OPEN`, `SOFT_CLOSE`, `HARD_CLOSE` |
| opened_at      | timestamptz | YES      |                     | When opened                                  |
| soft_closed_at | timestamptz | YES      |                     | When soft-closed                             |
| hard_closed_at | timestamptz | YES      |                     | When hard-closed                             |
| closed_by      | uuid        | YES      |                     | Who closed the period                        |
| created_at     | timestamptz | NOT NULL | `now()`             | Created timestamp                            |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, fiscal_year, period_number)` | **FKs**: tenant_id -> core.tenant

**Indexes**: idx_fin_period_tenant `(tenant_id, entity_code)`, idx_fin_period_status

---

## fin.accounting_profile

Hidden posting intelligence templates that define how transactions should be recorded in the GL. Each profile carries a posting pattern (debit/credit account mapping) and can be filtered by intent and/or spend category. Used by the posting engine to auto-generate journal entries.

| Column          | Type         | Nullable | Default             | Description                                    |
| --------------- | ------------ | -------- | ------------------- | ---------------------------------------------- |
| id              | uuid         | NOT NULL | `gen_random_uuid()` | PK                                             |
| tenant_id       | uuid         | NOT NULL |                     | FK to core.tenant                              |
| entity_code     | varchar(20)  | NOT NULL |                     | Legal entity code                              |
| code            | varchar(50)  | NOT NULL |                     | Profile code                                   |
| name            | varchar(200) | NOT NULL |                     | Display name                                   |
| description     | text         | YES      |                     | Description                                    |
| intent_filter   | jsonb        | YES      |                     | Which intents this profile applies to          |
| category_filter | jsonb        | YES      |                     | Which spend categories this profile applies to |
| posting_pattern | jsonb        | NOT NULL |                     | Debit/credit account mapping template          |
| is_active       | boolean      | NOT NULL | `true`              | Active flag                                    |
| version         | integer      | NOT NULL | `1`                 | Version counter                                |
| created_at      | timestamptz  | NOT NULL | `now()`             | Created timestamp                              |
| updated_at      | timestamptz  | NOT NULL | `now()`             | Updated timestamp                              |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, code)` | **FKs**: tenant_id -> core.tenant

---

## fin.journal_entry

Journal entry header -- the primary GL posting document. Each JE must be balanced (total_debit = total_credit, enforced by check constraint). Supports reversal linking via `reversal_of_id`/`reversed_by_id`. References an optional accounting profile that generated it.

| Column                | Type          | Nullable | Default             | Description                     |
| --------------------- | ------------- | -------- | ------------------- | ------------------------------- |
| id                    | uuid          | NOT NULL | `gen_random_uuid()` | PK                              |
| tenant_id             | uuid          | NOT NULL |                     | FK to core.tenant               |
| entity_code           | varchar(20)   | NOT NULL |                     | Legal entity code               |
| je_number             | varchar(50)   | NOT NULL |                     | Journal entry number            |
| txn_id                | uuid          | NOT NULL |                     | Source transaction ID           |
| doc_id                | uuid          | NOT NULL |                     | Source document ID              |
| doc_type              | varchar(20)   | NOT NULL |                     | Document type                   |
| accounting_profile_id | uuid          | YES      |                     | FK to fin.accounting_profile    |
| fiscal_year           | smallint      | NOT NULL |                     | Fiscal year                     |
| period_number         | smallint      | NOT NULL |                     | Period number                   |
| posting_date          | date          | NOT NULL |                     | Posting date                    |
| description           | text          | YES      |                     | JE description                  |
| status                | varchar(20)   | NOT NULL | `'CREATED'`         | `CREATED`, `POSTED`, `REVERSED` |
| total_debit           | decimal(18,4) | NOT NULL |                     | Total debit amount              |
| total_credit          | decimal(18,4) | NOT NULL |                     | Total credit amount             |
| currency_code         | varchar(3)    | NOT NULL |                     | FK to ref.currency              |
| is_reversal           | boolean       | NOT NULL | `false`             | Whether this is a reversal JE   |
| reversal_of_id        | uuid          | YES      |                     | JE this reverses                |
| reversed_by_id        | uuid          | YES      |                     | JE that reversed this one       |
| posted_by             | uuid          | YES      |                     | Who posted                      |
| posted_at             | timestamptz   | YES      |                     | When posted                     |
| created_at            | timestamptz   | NOT NULL | `now()`             | Created timestamp               |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, je_number)` | **Check**: `total_debit = total_credit` | **FKs**: tenant_id -> core.tenant, accounting_profile_id -> fin.accounting_profile, currency_code -> ref.currency, reversal_of_id -> fin.journal_entry, reversed_by_id -> fin.journal_entry

**Indexes**: idx_fin_je_tenant, idx_fin_je_txn, idx_fin_je_doc, idx_fin_je_period `(tenant_id, entity_code, fiscal_year, period_number)`, idx_fin_je_status

---

## fin.journal_line

Individual debit/credit line items within a journal entry. Each line posts to a specific GL account with optional cost center and profit center dimensions. Enforces single-sided entries (a line is either debit or credit, never both).

| Column           | Type          | Nullable | Default             | Description                              |
| ---------------- | ------------- | -------- | ------------------- | ---------------------------------------- |
| id               | uuid          | NOT NULL | `gen_random_uuid()` | PK                                       |
| tenant_id        | uuid          | NOT NULL |                     | FK to core.tenant                        |
| je_id            | uuid          | NOT NULL |                     | FK to fin.journal_entry (CASCADE delete) |
| line_no          | smallint      | NOT NULL |                     | Line number                              |
| account_id       | uuid          | NOT NULL |                     | FK to fin.chart_of_accounts              |
| cost_center_id   | uuid          | YES      |                     | FK to fin.cost_center                    |
| profit_center_id | uuid          | YES      |                     | FK to fin.profit_center                  |
| debit_amount     | decimal(18,4) | NOT NULL | `0`                 | Debit amount                             |
| credit_amount    | decimal(18,4) | NOT NULL | `0`                 | Credit amount                            |
| currency_code    | varchar(3)    | NOT NULL |                     | Currency                                 |
| description      | text          | YES      |                     | Line description                         |
| subledger_type   | varchar(20)   | YES      |                     | Subledger type                           |
| subledger_ref_id | uuid          | YES      |                     | Subledger reference ID                   |
| tags             | jsonb         | YES      | `'[]'`              | Tags                                     |

**PK**: `(id)` | **Unique**: `(tenant_id, je_id, line_no)` | **Check**: amounts >= 0; not both debit and credit > 0 | **FKs**: tenant_id -> core.tenant, je_id -> fin.journal_entry (CASCADE), account_id -> fin.chart_of_accounts, cost_center_id -> fin.cost_center, profit_center_id -> fin.profit_center

**Indexes**: idx_fin_je_line_je, idx_fin_je_line_account, idx_fin_je_line_subledger `WHERE subledger_type IS NOT NULL`

---

## fin.gl_balance

Denormalized GL account balance projection per fiscal period. Stores opening/period/closing debit and credit totals for fast balance sheet and P&L reporting without needing to aggregate journal lines.

| Column         | Type          | Nullable | Default             | Description                 |
| -------------- | ------------- | -------- | ------------------- | --------------------------- |
| id             | uuid          | NOT NULL | `gen_random_uuid()` | PK                          |
| tenant_id      | uuid          | NOT NULL |                     | FK to core.tenant           |
| entity_code    | varchar(20)   | NOT NULL |                     | Legal entity code           |
| account_id     | uuid          | NOT NULL |                     | FK to fin.chart_of_accounts |
| fiscal_year    | smallint      | NOT NULL |                     | Fiscal year                 |
| period_number  | smallint      | NOT NULL |                     | Period number               |
| cost_center_id | uuid          | YES      |                     | FK to fin.cost_center       |
| currency_code  | varchar(3)    | NOT NULL |                     | Currency                    |
| opening_debit  | decimal(18,4) | NOT NULL | `0`                 | Opening debit balance       |
| opening_credit | decimal(18,4) | NOT NULL | `0`                 | Opening credit balance      |
| period_debit   | decimal(18,4) | NOT NULL | `0`                 | Period debit movements      |
| period_credit  | decimal(18,4) | NOT NULL | `0`                 | Period credit movements     |
| closing_debit  | decimal(18,4) | NOT NULL | `0`                 | Closing debit balance       |
| closing_credit | decimal(18,4) | NOT NULL | `0`                 | Closing credit balance      |
| updated_at     | timestamptz   | NOT NULL | `now()`             | Last recalculation          |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, account_id, fiscal_year, period_number, cost_center_id, currency_code)` | **FKs**: tenant_id -> core.tenant, account_id -> fin.chart_of_accounts, cost_center_id -> fin.cost_center

**Indexes**: idx_fin_gl_balance_account `(tenant_id, entity_code, account_id)`, idx_fin_gl_balance_period `(tenant_id, entity_code, fiscal_year, period_number)`

---

# Tax Engine

## fin.tax_jurisdiction

Tax jurisdiction registry supporting country, state, city, and special zone levels. Jurisdictions form a hierarchy via `parent_id` for cascading tax calculations (e.g., US federal + state + city).

| Column            | Type         | Nullable | Default             | Description                                |
| ----------------- | ------------ | -------- | ------------------- | ------------------------------------------ |
| id                | uuid         | NOT NULL | `gen_random_uuid()` | PK                                         |
| tenant_id         | uuid         | NOT NULL |                     | FK to core.tenant                          |
| code              | varchar(20)  | NOT NULL |                     | Jurisdiction code                          |
| name              | varchar(200) | NOT NULL |                     | Display name                               |
| country_code      | varchar(2)   | NOT NULL |                     | FK to ref.country                          |
| state_region_code | varchar(10)  | YES      |                     | State/region code                          |
| jurisdiction_type | varchar(20)  | NOT NULL |                     | `COUNTRY`, `STATE`, `CITY`, `SPECIAL_ZONE` |
| parent_id         | uuid         | YES      |                     | Self-referencing parent                    |
| is_active         | boolean      | NOT NULL | `true`              | Active flag                                |
| created_at        | timestamptz  | NOT NULL | `now()`             | Created timestamp                          |

**PK**: `(id)` | **Unique**: `(tenant_id, code)` | **FKs**: tenant_id -> core.tenant, country_code -> ref.country(code2), parent_id -> fin.tax_jurisdiction

---

## fin.tax_rate

Tax rate definitions per jurisdiction, tax type, and effective date range. Supports VAT, GST, sales tax, withholding tax, excise, and customs. Handles reverse charge and treaty rates for cross-border scenarios.

| Column            | Type         | Nullable | Default             | Description                                           |
| ----------------- | ------------ | -------- | ------------------- | ----------------------------------------------------- |
| id                | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                    |
| tenant_id         | uuid         | NOT NULL |                     | FK to core.tenant                                     |
| jurisdiction_id   | uuid         | NOT NULL |                     | FK to fin.tax_jurisdiction                            |
| tax_type          | varchar(20)  | NOT NULL |                     | `VAT`, `GST`, `SALES_TAX`, `WHT`, `EXCISE`, `CUSTOMS` |
| tax_code          | varchar(20)  | NOT NULL |                     | Tax code identifier                                   |
| rate              | decimal(8,4) | NOT NULL |                     | Tax rate (percentage)                                 |
| description       | varchar(200) | YES      |                     | Description                                           |
| effective_from    | date         | NOT NULL |                     | Rate effective from                                   |
| effective_to      | date         | YES      |                     | Rate effective to                                     |
| category_filter   | jsonb        | YES      |                     | Category applicability filter                         |
| is_reverse_charge | boolean      | NOT NULL | `false`             | Reverse charge mechanism                              |
| treaty_rate       | decimal(8,4) | YES      |                     | Tax treaty rate                                       |
| created_at        | timestamptz  | NOT NULL | `now()`             | Created timestamp                                     |

**PK**: `(id)` | **Unique**: `(tenant_id, jurisdiction_id, tax_code, effective_from)` | **FKs**: tenant_id -> core.tenant, jurisdiction_id -> fin.tax_jurisdiction

---

## fin.tax_calculation

Computed tax records per transaction line item. Captures the base amount, applied rate, calculated tax amount, and flags for reverse charge, withholding tax, and input credit eligibility.

| Column                   | Type          | Nullable | Default             | Description                |
| ------------------------ | ------------- | -------- | ------------------- | -------------------------- |
| id                       | uuid          | NOT NULL | `gen_random_uuid()` | PK                         |
| tenant_id                | uuid          | NOT NULL |                     | FK to core.tenant          |
| txn_id                   | uuid          | NOT NULL |                     | Transaction ID             |
| doc_id                   | uuid          | NOT NULL |                     | Document ID                |
| commitment_id            | uuid          | YES      |                     | FK to fin.commitment       |
| line_item_index          | smallint      | YES      |                     | Line item index            |
| jurisdiction_id          | uuid          | NOT NULL |                     | FK to fin.tax_jurisdiction |
| tax_type                 | varchar(20)   | NOT NULL |                     | Tax type                   |
| tax_code                 | varchar(20)   | NOT NULL |                     | Tax code                   |
| base_amount              | decimal(18,4) | NOT NULL |                     | Taxable base amount        |
| tax_rate                 | decimal(8,4)  | NOT NULL |                     | Applied tax rate           |
| tax_amount               | decimal(18,4) | NOT NULL |                     | Calculated tax amount      |
| currency_code            | varchar(3)    | NOT NULL |                     | Currency                   |
| is_reverse_charge        | boolean       | NOT NULL | `false`             | Reverse charge             |
| is_wht                   | boolean       | NOT NULL | `false`             | Withholding tax            |
| wht_certificate_no       | varchar(50)   | YES      |                     | WHT certificate number     |
| is_input_credit_eligible | boolean       | NOT NULL | `false`             | Input tax credit eligible  |
| calculated_at            | timestamptz   | NOT NULL | `now()`             | Calculation timestamp      |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, commitment_id -> fin.commitment, jurisdiction_id -> fin.tax_jurisdiction

**Indexes**: idx_fin_tax_calc_txn `(tenant_id, txn_id)`, idx_fin_tax_calc_doc `(tenant_id, doc_id)`, idx_fin_tax_calc_commitment

---

## fin.tax_credit_ledger

Input tax credit tracking per jurisdiction per fiscal period. Maintains running totals of input credits vs. output liability with a generated `net_position` column. Supports periodic reconciliation.

| Column           | Type          | Nullable  | Default             | Description                                 |
| ---------------- | ------------- | --------- | ------------------- | ------------------------------------------- |
| id               | uuid          | NOT NULL  | `gen_random_uuid()` | PK                                          |
| tenant_id        | uuid          | NOT NULL  |                     | FK to core.tenant                           |
| entity_code      | varchar(20)   | NOT NULL  |                     | Legal entity code                           |
| jurisdiction_id  | uuid          | NOT NULL  |                     | FK to fin.tax_jurisdiction                  |
| fiscal_year      | smallint      | NOT NULL  |                     | Fiscal year                                 |
| period_number    | smallint      | NOT NULL  |                     | Period number                               |
| input_credits    | decimal(18,4) | NOT NULL  | `0`                 | Total input credits                         |
| output_liability | decimal(18,4) | NOT NULL  | `0`                 | Total output liability                      |
| net_position     | decimal(18,4) | GENERATED |                     | `input_credits - output_liability` (STORED) |
| reconciled       | boolean       | NOT NULL  | `false`             | Whether reconciled                          |
| reconciled_at    | timestamptz   | YES       |                     | Reconciliation timestamp                    |
| created_at       | timestamptz   | NOT NULL  | `now()`             | Created timestamp                           |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, jurisdiction_id, fiscal_year, period_number)` | **FKs**: tenant_id -> core.tenant, jurisdiction_id -> fin.tax_jurisdiction

---

# Asset Engine

## fin.asset

Fixed asset register -- master record for every capitalized or WIP asset. Tracks acquisition details, asset classification, lifecycle status, physical location, vendor/commitment linkage, and supports hierarchical asset grouping via `parent_asset_id`.

| Column               | Type          | Nullable | Default             | Description                                                                                     |
| -------------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| id                   | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                                                              |
| tenant_id            | uuid          | NOT NULL |                     | Tenant                                                                                          |
| entity_code          | varchar(20)   | NOT NULL |                     | Legal entity code                                                                               |
| asset_number         | varchar(40)   | NOT NULL |                     | Unique asset number                                                                             |
| name                 | varchar(255)  | NOT NULL |                     | Asset name                                                                                      |
| description          | text          | YES      |                     | Description                                                                                     |
| asset_class          | varchar(30)   | NOT NULL |                     | `LAND`, `BUILDING`, `MACHINERY`, `VEHICLE`, `FURNITURE`, `IT_EQUIPMENT`, `INTANGIBLE`, `LEASED` |
| status               | varchar(20)   | NOT NULL | `'WIP'`             | `WIP`, `CAPITALIZED`, `ACTIVE`, `IMPAIRED`, `RETIRED`, `DISPOSED`                               |
| acquisition_date     | date          | NOT NULL |                     | Date acquired                                                                                   |
| acquisition_cost     | decimal(18,4) | NOT NULL |                     | Original cost                                                                                   |
| currency_code        | varchar(3)    | NOT NULL | `'USD'`             | Currency                                                                                        |
| residual_value       | decimal(18,4) | NOT NULL | `0`                 | Salvage value                                                                                   |
| useful_life_months   | int           | NOT NULL |                     | Useful life in months                                                                           |
| ou_id                | uuid          | YES      |                     | Operating unit                                                                                  |
| cost_center_id       | uuid          | YES      |                     | Cost center                                                                                     |
| location             | varchar(255)  | YES      |                     | Physical location                                                                               |
| vendor_id            | uuid          | YES      |                     | FK to ent.supplier                                                                              |
| commitment_id        | uuid          | YES      |                     | FK to fin.commitment                                                                            |
| capitalized_from_wip | boolean       | NOT NULL | `false`             | Whether capitalized from WIP                                                                    |
| parent_asset_id      | uuid          | YES      |                     | Self-referencing parent asset                                                                   |
| tags                 | jsonb         | YES      | `'[]'`              | Tags                                                                                            |
| metadata             | jsonb         | YES      | `'{}'`              | Metadata                                                                                        |
| created_at           | timestamptz   | NOT NULL | `now()`             | Created timestamp                                                                               |
| updated_at           | timestamptz   | NOT NULL | `now()`             | Updated timestamp                                                                               |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, asset_number)` | **FKs**: vendor_id -> ent.supplier, commitment_id -> fin.commitment, parent_asset_id -> fin.asset

**Indexes**: idx_asset_tenant, idx_asset_tenant_entity, idx_asset_status, idx_asset_class, idx_asset_parent (partial), idx_asset_vendor (partial), idx_asset_commitment (partial), idx_asset_ou (partial), idx_asset_cost_center (partial), idx_asset_tags (GIN), idx_asset_metadata (GIN)

---

## fin.asset_book

Multi-book depreciation parameters per asset. Each asset can have multiple books (statutory, tax, management, insurance) with independent depreciation methods, useful lives, and running accumulated depreciation. `net_book_value` is a generated column: `cost_basis - accumulated_depreciation`.

| Column                   | Type          | Nullable  | Default             | Description                                                                        |
| ------------------------ | ------------- | --------- | ------------------- | ---------------------------------------------------------------------------------- |
| id                       | uuid          | NOT NULL  | `gen_random_uuid()` | PK                                                                                 |
| tenant_id                | uuid          | NOT NULL  |                     | Tenant                                                                             |
| asset_id                 | uuid          | NOT NULL  |                     | FK to fin.asset                                                                    |
| book_type                | varchar(20)   | NOT NULL  |                     | `STATUTORY`, `TAX`, `MANAGEMENT`, `INSURANCE`                                      |
| depreciation_method      | varchar(30)   | NOT NULL  |                     | `STRAIGHT_LINE`, `REDUCING_BALANCE`, `UNITS_OF_PRODUCTION`, `ACCELERATED`, `MACRS` |
| useful_life_months       | int           | NOT NULL  |                     | Book-specific useful life                                                          |
| residual_value           | decimal(18,4) | NOT NULL  | `0`                 | Book-specific residual value                                                       |
| cost_basis               | decimal(18,4) | NOT NULL  |                     | Depreciable cost basis                                                             |
| accumulated_depreciation | decimal(18,4) | NOT NULL  | `0`                 | Total depreciation charged                                                         |
| net_book_value           | decimal(18,4) | GENERATED |                     | `cost_basis - accumulated_depreciation` (STORED)                                   |
| last_depreciation_date   | date          | YES       |                     | Last depreciation run date                                                         |
| next_depreciation_date   | date          | YES       |                     | Next scheduled depreciation                                                        |
| currency_code            | varchar(3)    | NOT NULL  | `'USD'`             | Currency                                                                           |
| created_at               | timestamptz   | NOT NULL  | `now()`             | Created timestamp                                                                  |
| updated_at               | timestamptz   | NOT NULL  | `now()`             | Updated timestamp                                                                  |

**PK**: `(id)` | **Unique**: `(tenant_id, asset_id, book_type)` | **FKs**: asset_id -> fin.asset

**Indexes**: idx_asset_book_tenant, idx_asset_book_asset, idx_asset_book_next_depr (partial)

---

## fin.asset_transaction

Immutable log of every asset lifecycle event: capitalization, depreciation, revaluation (up/down), impairment, transfer, retirement, disposal. Captures before/after state snapshots and links to the generated journal entry.

| Column          | Type          | Nullable | Default             | Description                                                                                         |
| --------------- | ------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| id              | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                                                                  |
| tenant_id       | uuid          | NOT NULL |                     | Tenant                                                                                              |
| asset_id        | uuid          | NOT NULL |                     | FK to fin.asset                                                                                     |
| book_type       | varchar(20)   | NOT NULL |                     | `STATUTORY`, `TAX`, `MANAGEMENT`, `INSURANCE`                                                       |
| txn_type        | varchar(20)   | NOT NULL |                     | `CAPITALIZE`, `DEPRECIATE`, `REVALUE_UP`, `REVALUE_DOWN`, `IMPAIR`, `TRANSFER`, `RETIRE`, `DISPOSE` |
| amount          | decimal(18,4) | NOT NULL |                     | Transaction amount                                                                                  |
| currency_code   | varchar(3)    | NOT NULL | `'USD'`             | Currency                                                                                            |
| from_values     | jsonb         | YES      |                     | State before transaction                                                                            |
| to_values       | jsonb         | YES      |                     | State after transaction                                                                             |
| reference_je_id | uuid          | YES      |                     | FK to fin.journal_entry                                                                             |
| performed_by    | uuid          | NOT NULL |                     | Who performed                                                                                       |
| performed_at    | timestamptz   | NOT NULL | `now()`             | When performed                                                                                      |
| notes           | text          | YES      |                     | Notes                                                                                               |

**PK**: `(id)` | **FKs**: asset_id -> fin.asset, reference_je_id -> fin.journal_entry

**Indexes**: idx_asset_txn_tenant, idx_asset_txn_asset, idx_asset_txn_asset_book, idx_asset_txn_type, idx_asset_txn_performed_at, idx_asset_txn_je_ref (partial)

---

## fin.depreciation_run

Batch depreciation run header -- one per entity/book/period combination. Tracks run status, asset count, total depreciation amount, and timing.

| Column        | Type          | Nullable | Default             | Description                                   |
| ------------- | ------------- | -------- | ------------------- | --------------------------------------------- |
| id            | uuid          | NOT NULL | `gen_random_uuid()` | PK                                            |
| tenant_id     | uuid          | NOT NULL |                     | Tenant                                        |
| entity_code   | varchar(20)   | NOT NULL |                     | Legal entity code                             |
| book_type     | varchar(20)   | NOT NULL |                     | `STATUTORY`, `TAX`, `MANAGEMENT`, `INSURANCE` |
| fiscal_year   | int           | NOT NULL |                     | Fiscal year                                   |
| period_number | int           | NOT NULL |                     | Period number                                 |
| status        | varchar(20)   | NOT NULL | `'PLANNED'`         | `PLANNED`, `RUNNING`, `COMPLETED`, `FAILED`   |
| asset_count   | int           | NOT NULL | `0`                 | Number of assets depreciated                  |
| total_amount  | decimal(18,4) | NOT NULL | `0`                 | Total depreciation amount                     |
| started_at    | timestamptz   | YES      |                     | Run start time                                |
| completed_at  | timestamptz   | YES      |                     | Run completion time                           |
| run_by        | uuid          | NOT NULL |                     | Who initiated the run                         |
| created_at    | timestamptz   | NOT NULL | `now()`             | Created timestamp                             |
| updated_at    | timestamptz   | NOT NULL | `now()`             | Updated timestamp                             |

**PK**: `(id)` | **Indexes**: idx_depr_run_tenant, idx_depr_run_entity_period `(tenant_id, entity_code, book_type, fiscal_year, period_number)`, idx_depr_run_status

---

# Inventory Engine

## fin.warehouse

Warehouse/storage location master. Each warehouse belongs to a legal entity and can be activated or deactivated.

| Column      | Type         | Nullable | Default             | Description       |
| ----------- | ------------ | -------- | ------------------- | ----------------- |
| id          | uuid         | NOT NULL | `gen_random_uuid()` | PK                |
| tenant_id   | uuid         | NOT NULL |                     | FK to core.tenant |
| entity_code | varchar(20)  | NOT NULL |                     | Legal entity code |
| code        | varchar(20)  | NOT NULL |                     | Warehouse code    |
| name        | varchar(200) | NOT NULL |                     | Display name      |
| is_active   | boolean      | NOT NULL | `true`              | Active flag       |
| created_at  | timestamptz  | NOT NULL | `now()`             | Created timestamp |
| updated_at  | timestamptz  | NOT NULL | `now()`             | Updated timestamp |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, code)` | **FKs**: tenant_id -> core.tenant

---

## fin.item_master

Inventory item master linking products to inventory configuration: valuation method (FIFO, LIFO, weighted average, standard cost, specific identification), reorder parameters, safety stock, and lot/serial tracking flags. Uses the custom enum `fin.valuation_method`.

| Column           | Type                 | Nullable | Default             | Description                                            |
| ---------------- | -------------------- | -------- | ------------------- | ------------------------------------------------------ |
| id               | uuid                 | NOT NULL | `gen_random_uuid()` | PK                                                     |
| tenant_id        | uuid                 | NOT NULL |                     | FK to core.tenant                                      |
| entity_code      | varchar(20)          | NOT NULL |                     | Legal entity code                                      |
| product_id       | uuid                 | NOT NULL |                     | FK to ent.product                                      |
| valuation_method | fin.valuation_method | NOT NULL |                     | `FIFO`, `LIFO`, `WEIGHTED_AVG`, `STANDARD`, `SPECIFIC` |
| standard_cost    | decimal(18,4)        | YES      |                     | Standard cost (for standard costing)                   |
| currency_code    | varchar(3)           | NOT NULL |                     | Currency                                               |
| reorder_point    | decimal(18,4)        | YES      |                     | Reorder trigger quantity                               |
| reorder_qty      | decimal(18,4)        | YES      |                     | Quantity to reorder                                    |
| safety_stock     | decimal(18,4)        | YES      |                     | Minimum safety stock                                   |
| lot_tracking     | boolean              | NOT NULL | `false`             | Enable lot tracking                                    |
| serial_tracking  | boolean              | NOT NULL | `false`             | Enable serial number tracking                          |
| uom_code         | varchar(20)          | NOT NULL |                     | FK to ref.uom                                          |
| created_at       | timestamptz          | NOT NULL | `now()`             | Created timestamp                                      |
| updated_at       | timestamptz          | NOT NULL | `now()`             | Updated timestamp                                      |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, product_id)` | **FKs**: tenant_id -> core.tenant, product_id -> ent.product, uom_code -> ref.uom

---

## fin.inventory_balance

Current on-hand quantity and value per item per warehouse, with optional lot/serial granularity. `total_value` is a generated column: `quantity_on_hand * unit_cost`. Composite uniqueness is enforced via a functional unique index using COALESCE for nullable lot/serial columns.

| Column           | Type          | Nullable  | Default             | Description                             |
| ---------------- | ------------- | --------- | ------------------- | --------------------------------------- |
| id               | uuid          | NOT NULL  | `gen_random_uuid()` | PK                                      |
| tenant_id        | uuid          | NOT NULL  |                     | FK to core.tenant                       |
| entity_code      | varchar(20)   | NOT NULL  |                     | Legal entity code                       |
| item_id          | uuid          | NOT NULL  |                     | FK to fin.item_master                   |
| warehouse_id     | uuid          | NOT NULL  |                     | FK to fin.warehouse                     |
| lot_number       | varchar(100)  | YES       |                     | Lot number                              |
| serial_number    | varchar(100)  | YES       |                     | Serial number                           |
| quantity_on_hand | decimal(18,4) | NOT NULL  | `0`                 | Current quantity                        |
| unit_cost        | decimal(18,4) | NOT NULL  | `0`                 | Current unit cost                       |
| total_value      | decimal(18,4) | GENERATED |                     | `quantity_on_hand * unit_cost` (STORED) |
| currency_code    | varchar(3)    | NOT NULL  |                     | Currency                                |
| last_movement_at | timestamptz   | YES       |                     | Last stock movement                     |
| created_at       | timestamptz   | NOT NULL  | `now()`             | Created timestamp                       |
| updated_at       | timestamptz   | NOT NULL  | `now()`             | Updated timestamp                       |

**PK**: `(id)` | **Unique index**: `(tenant_id, entity_code, item_id, warehouse_id, COALESCE(lot_number,''), COALESCE(serial_number,''))` | **FKs**: tenant_id -> core.tenant, item_id -> fin.item_master, warehouse_id -> fin.warehouse

---

## fin.inventory_movement

Every stock movement (receipt, issue, transfer, adjustment, scrap, return). Uses the custom enum `fin.movement_type`. Tracks source/destination warehouses for transfers and links to the generated journal entry.

| Column              | Type              | Nullable | Default             | Description                                                                                                  |
| ------------------- | ----------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| id                  | uuid              | NOT NULL | `gen_random_uuid()` | PK                                                                                                           |
| tenant_id           | uuid              | NOT NULL |                     | FK to core.tenant                                                                                            |
| entity_code         | varchar(20)       | NOT NULL |                     | Legal entity code                                                                                            |
| item_id             | uuid              | NOT NULL |                     | FK to fin.item_master                                                                                        |
| warehouse_id        | uuid              | NOT NULL |                     | FK to fin.warehouse                                                                                          |
| movement_type       | fin.movement_type | NOT NULL |                     | `RECEIPT`, `ISSUE_SALES`, `ISSUE_PRODUCTION`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`, `SCRAP`, `RETURN` |
| quantity            | decimal(18,4)     | NOT NULL |                     | Quantity moved                                                                                               |
| unit_cost           | decimal(18,4)     | NOT NULL |                     | Unit cost at time of movement                                                                                |
| total_value         | decimal(18,4)     | NOT NULL |                     | Total movement value                                                                                         |
| currency_code       | varchar(3)        | NOT NULL |                     | Currency                                                                                                     |
| lot_number          | varchar(100)      | YES      |                     | Lot number                                                                                                   |
| serial_number       | varchar(100)      | YES      |                     | Serial number                                                                                                |
| reference_doc_type  | varchar(50)       | YES      |                     | Source document type                                                                                         |
| reference_doc_id    | uuid              | YES      |                     | Source document ID                                                                                           |
| source_warehouse_id | uuid              | YES      |                     | FK to fin.warehouse (transfer source)                                                                        |
| dest_warehouse_id   | uuid              | YES      |                     | FK to fin.warehouse (transfer destination)                                                                   |
| reference_je_id     | uuid              | YES      |                     | FK to fin.journal_entry                                                                                      |
| performed_by        | uuid              | NOT NULL |                     | Who performed                                                                                                |
| performed_at        | timestamptz       | NOT NULL | `now()`             | When performed                                                                                               |
| notes               | text              | YES      |                     | Notes                                                                                                        |
| created_at          | timestamptz       | NOT NULL | `now()`             | Created timestamp                                                                                            |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, item_id -> fin.item_master, warehouse_id -> fin.warehouse, source_warehouse_id -> fin.warehouse, dest_warehouse_id -> fin.warehouse, reference_je_id -> fin.journal_entry

---

## fin.inventory_valuation_layer

FIFO/LIFO cost layers for inventory valuation. Each receipt creates a new layer; issues consume layers in order (FIFO: oldest first, LIFO: newest first). Tracks original vs. remaining quantity per layer for accurate COGS calculation.

| Column              | Type          | Nullable | Default             | Description                                |
| ------------------- | ------------- | -------- | ------------------- | ------------------------------------------ |
| id                  | uuid          | NOT NULL | `gen_random_uuid()` | PK                                         |
| tenant_id           | uuid          | NOT NULL |                     | FK to core.tenant                          |
| entity_code         | varchar(20)   | NOT NULL |                     | Legal entity code                          |
| item_id             | uuid          | NOT NULL |                     | FK to fin.item_master                      |
| warehouse_id        | uuid          | NOT NULL |                     | FK to fin.warehouse                        |
| layer_date          | date          | NOT NULL |                     | Date this layer was created                |
| receipt_movement_id | uuid          | NOT NULL |                     | FK to fin.inventory_movement (the receipt) |
| original_qty        | decimal(18,4) | NOT NULL |                     | Original quantity received                 |
| remaining_qty       | decimal(18,4) | NOT NULL |                     | Remaining unconsumed quantity              |
| unit_cost           | decimal(18,4) | NOT NULL |                     | Unit cost at receipt                       |
| currency_code       | varchar(3)    | NOT NULL |                     | Currency                                   |
| is_consumed         | boolean       | NOT NULL | `false`             | Fully consumed flag                        |
| created_at          | timestamptz   | NOT NULL | `now()`             | Created timestamp                          |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, item_id -> fin.item_master, warehouse_id -> fin.warehouse, receipt_movement_id -> fin.inventory_movement

---

## fin.stocktake

Physical inventory count header. Tracks the count lifecycle from planning through completion, the assigned counter and approver, and the resulting variance journal entry.

| Column         | Type                 | Nullable | Default             | Description                                        |
| -------------- | -------------------- | -------- | ------------------- | -------------------------------------------------- |
| id             | uuid                 | NOT NULL | `gen_random_uuid()` | PK                                                 |
| tenant_id      | uuid                 | NOT NULL |                     | FK to core.tenant                                  |
| entity_code    | varchar(20)          | NOT NULL |                     | Legal entity code                                  |
| warehouse_id   | uuid                 | NOT NULL |                     | FK to fin.warehouse                                |
| stocktake_date | date                 | NOT NULL |                     | Count date                                         |
| status         | fin.stocktake_status | NOT NULL | `'PLANNED'`         | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| counted_by     | uuid                 | YES      |                     | Who performed the count                            |
| approved_by    | uuid                 | YES      |                     | Who approved                                       |
| variance_je_id | uuid                 | YES      |                     | FK to fin.journal_entry (variance posting)         |
| created_at     | timestamptz          | NOT NULL | `now()`             | Created timestamp                                  |
| completed_at   | timestamptz          | YES      |                     | Completion timestamp                               |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, warehouse_id -> fin.warehouse, variance_je_id -> fin.journal_entry

---

## fin.stocktake_line

Individual counted line items within a stocktake. Records system quantity, counted quantity, and the `variance_qty` (generated column: `counted_qty - system_qty`) with unit cost for variance valuation.

| Column         | Type          | Nullable  | Default             | Description                         |
| -------------- | ------------- | --------- | ------------------- | ----------------------------------- |
| id             | uuid          | NOT NULL  | `gen_random_uuid()` | PK                                  |
| tenant_id      | uuid          | NOT NULL  |                     | FK to core.tenant                   |
| stocktake_id   | uuid          | NOT NULL  |                     | FK to fin.stocktake                 |
| item_id        | uuid          | NOT NULL  |                     | FK to fin.item_master               |
| lot_number     | varchar(100)  | YES       |                     | Lot number                          |
| serial_number  | varchar(100)  | YES       |                     | Serial number                       |
| system_qty     | decimal(18,4) | NOT NULL  |                     | System quantity at count time       |
| counted_qty    | decimal(18,4) | NOT NULL  |                     | Physical count quantity             |
| variance_qty   | decimal(18,4) | GENERATED |                     | `counted_qty - system_qty` (STORED) |
| unit_cost      | decimal(18,4) | NOT NULL  |                     | Unit cost for variance valuation    |
| variance_value | decimal(18,4) | YES       |                     | Dollar value of variance            |
| created_at     | timestamptz   | NOT NULL  | `now()`             | Created timestamp                   |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, stocktake_id -> fin.stocktake, item_id -> fin.item_master

---

# Commission Engine

## fin.commission_plan

Commission plan definitions supporting flat-rate, tiered, percentage, and formula-based calculations. Each plan specifies the base metric (revenue, gross margin, net profit, or quantity), optional tier configuration, clawback windows, and clawback trigger conditions.

| Column               | Type         | Nullable | Default             | Description                                         |
| -------------------- | ------------ | -------- | ------------------- | --------------------------------------------------- |
| id                   | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                  |
| tenant_id            | uuid         | NOT NULL |                     | FK to core.tenant                                   |
| entity_code          | varchar(50)  | NOT NULL |                     | Legal entity code                                   |
| code                 | varchar(50)  | NOT NULL |                     | Plan code                                           |
| name                 | varchar(200) | NOT NULL |                     | Display name                                        |
| plan_type            | varchar(20)  | NOT NULL |                     | `FLAT_RATE`, `TIERED`, `PERCENTAGE`, `FORMULA`      |
| base_metric          | varchar(20)  | NOT NULL |                     | `REVENUE`, `GROSS_MARGIN`, `NET_PROFIT`, `QUANTITY` |
| tiers                | jsonb        | YES      |                     | Tier configuration                                  |
| formula              | text         | YES      |                     | Formula expression (for FORMULA type)               |
| effective_from       | date         | NOT NULL |                     | Effective start date                                |
| effective_to         | date         | YES      |                     | Effective end date                                  |
| clawback_window_days | integer      | NOT NULL | `0`                 | Days for clawback eligibility                       |
| clawback_triggers    | text[]       | YES      |                     | Clawback trigger events                             |
| is_active            | boolean      | NOT NULL | `true`              | Active flag                                         |
| created_at           | timestamptz  | NOT NULL | `now()`             | Created timestamp                                   |
| updated_at           | timestamptz  | NOT NULL | `now()`             | Updated timestamp                                   |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, code)` | **FKs**: tenant_id -> core.tenant

---

## fin.commission_assignment

Links partners (employees, agents, resellers, affiliates) to commission plans with optional split percentages and effective date ranges. Multiple partners can share a commission via split percentages that need not sum to 100% across assignments.

| Column         | Type         | Nullable | Default             | Description                                  |
| -------------- | ------------ | -------- | ------------------- | -------------------------------------------- |
| id             | uuid         | NOT NULL | `gen_random_uuid()` | PK                                           |
| tenant_id      | uuid         | NOT NULL |                     | FK to core.tenant                            |
| entity_code    | varchar(50)  | NOT NULL |                     | Legal entity code                            |
| partner_id     | uuid         | NOT NULL |                     | Partner identifier                           |
| partner_type   | varchar(20)  | NOT NULL |                     | `EMPLOYEE`, `AGENT`, `RESELLER`, `AFFILIATE` |
| plan_id        | uuid         | NOT NULL |                     | FK to fin.commission_plan                    |
| split_pct      | decimal(5,2) | NOT NULL | `100.00`            | Commission split percentage                  |
| effective_from | date         | NOT NULL |                     | Assignment start date                        |
| effective_to   | date         | YES      |                     | Assignment end date                          |
| created_at     | timestamptz  | NOT NULL | `now()`             | Created timestamp                            |
| updated_at     | timestamptz  | NOT NULL | `now()`             | Updated timestamp                            |

**PK**: `(id)` | **Unique**: `(tenant_id, partner_id, plan_id, effective_from)` | **Check**: `split_pct > 0 AND split_pct <= 100.00` | **FKs**: tenant_id -> core.tenant, plan_id -> fin.commission_plan

---

## fin.commission_calculation

Individual commission calculations linked to transactions or documents, tracking the full lifecycle from calculation through accrual, approval, settlement, or clawback. Each step links to its corresponding journal entry.

| Column            | Type          | Nullable | Default             | Description                                                   |
| ----------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------- |
| id                | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                            |
| tenant_id         | uuid          | NOT NULL |                     | FK to core.tenant                                             |
| entity_code       | varchar(50)   | NOT NULL |                     | Legal entity code                                             |
| partner_id        | uuid          | NOT NULL |                     | Partner identifier                                            |
| plan_id           | uuid          | NOT NULL |                     | FK to fin.commission_plan                                     |
| txn_id            | uuid          | YES      |                     | Transaction ID                                                |
| doc_id            | uuid          | YES      |                     | Document ID                                                   |
| base_amount       | decimal(18,4) | NOT NULL |                     | Base metric amount                                            |
| commission_rate   | decimal(8,4)  | NOT NULL |                     | Applied rate                                                  |
| commission_amount | decimal(18,4) | NOT NULL |                     | Calculated commission                                         |
| currency_code     | varchar(3)    | NOT NULL | `'USD'`             | Currency                                                      |
| split_pct         | decimal(5,2)  | NOT NULL | `100.00`            | Split percentage                                              |
| status            | varchar(20)   | NOT NULL | `'CALCULATED'`      | `CALCULATED`, `ACCRUED`, `APPROVED`, `SETTLED`, `CLAWED_BACK` |
| accrual_je_id     | uuid          | YES      |                     | FK to fin.journal_entry (accrual)                             |
| settlement_je_id  | uuid          | YES      |                     | FK to fin.journal_entry (settlement)                          |
| clawback_je_id    | uuid          | YES      |                     | FK to fin.journal_entry (clawback)                            |
| clawback_reason   | text          | YES      |                     | Clawback reason                                               |
| calculated_at     | timestamptz   | NOT NULL | `now()`             | Calculation timestamp                                         |
| accrued_at        | timestamptz   | YES      |                     | Accrual timestamp                                             |
| approved_at       | timestamptz   | YES      |                     | Approval timestamp                                            |
| settled_at        | timestamptz   | YES      |                     | Settlement timestamp                                          |
| clawed_back_at    | timestamptz   | YES      |                     | Clawback timestamp                                            |
| created_at        | timestamptz   | NOT NULL | `now()`             | Created timestamp                                             |
| updated_at        | timestamptz   | NOT NULL | `now()`             | Updated timestamp                                             |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, plan_id -> fin.commission_plan, accrual_je_id/settlement_je_id/clawback_je_id -> fin.journal_entry

---

## fin.commission_statement

Periodic commission statements summarizing calculated, accrued, settled, and clawed-back amounts per partner. Progresses from DRAFT through GENERATED, APPROVED, to PAID.

| Column            | Type          | Nullable | Default             | Description                              |
| ----------------- | ------------- | -------- | ------------------- | ---------------------------------------- |
| id                | uuid          | NOT NULL | `gen_random_uuid()` | PK                                       |
| tenant_id         | uuid          | NOT NULL |                     | FK to core.tenant                        |
| entity_code       | varchar(50)   | NOT NULL |                     | Legal entity code                        |
| partner_id        | uuid          | NOT NULL |                     | Partner identifier                       |
| period_start      | date          | NOT NULL |                     | Statement period start                   |
| period_end        | date          | NOT NULL |                     | Statement period end                     |
| total_calculated  | decimal(18,4) | NOT NULL | `0`                 | Total calculated                         |
| total_accrued     | decimal(18,4) | NOT NULL | `0`                 | Total accrued                            |
| total_settled     | decimal(18,4) | NOT NULL | `0`                 | Total settled                            |
| total_clawed_back | decimal(18,4) | NOT NULL | `0`                 | Total clawed back                        |
| net_payable       | decimal(18,4) | NOT NULL | `0`                 | Net payable amount                       |
| currency_code     | varchar(3)    | NOT NULL | `'USD'`             | Currency                                 |
| status            | varchar(20)   | NOT NULL | `'DRAFT'`           | `DRAFT`, `GENERATED`, `APPROVED`, `PAID` |
| generated_at      | timestamptz   | YES      |                     | Generation timestamp                     |
| created_at        | timestamptz   | NOT NULL | `now()`             | Created timestamp                        |
| updated_at        | timestamptz   | NOT NULL | `now()`             | Updated timestamp                        |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant

---

# Federation Engine

## fin.legal_entity

Legal entity registry for multi-entity group structures. Each entity has a functional and reporting currency, entity type (parent, subsidiary, associate, joint venture, branch), and consolidation method. Forms a hierarchy via `parent_entity_id` for group consolidation.

| Column               | Type         | Nullable | Default             | Description                                                    |
| -------------------- | ------------ | -------- | ------------------- | -------------------------------------------------------------- |
| id                   | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                             |
| tenant_id            | uuid         | NOT NULL |                     | FK to core.tenant                                              |
| code                 | varchar(20)  | NOT NULL |                     | Entity code                                                    |
| name                 | varchar(200) | NOT NULL |                     | Display name                                                   |
| country_code         | varchar(2)   | NOT NULL |                     | FK to ref.country                                              |
| functional_currency  | varchar(3)   | NOT NULL |                     | FK to ref.currency                                             |
| reporting_currency   | varchar(3)   | NOT NULL |                     | FK to ref.currency                                             |
| entity_type          | varchar(20)  | NOT NULL |                     | `PARENT`, `SUBSIDIARY`, `ASSOCIATE`, `JOINT_VENTURE`, `BRANCH` |
| parent_entity_id     | uuid         | YES      |                     | Self-referencing parent                                        |
| consolidation_method | varchar(20)  | NOT NULL | `'FULL'`            | `FULL`, `PROPORTIONAL`, `EQUITY`, `NONE`                       |
| ownership_pct        | decimal(5,2) | YES      |                     | Ownership percentage                                           |
| is_active            | boolean      | NOT NULL | `true`              | Active flag                                                    |
| created_at           | timestamptz  | NOT NULL | `now()`             | Created timestamp                                              |
| updated_at           | timestamptz  | NOT NULL | `now()`             | Updated timestamp                                              |

**PK**: `(id)` | **Unique**: `(tenant_id, code)` | **FKs**: tenant_id -> core.tenant, country_code -> ref.country, functional_currency/reporting_currency -> ref.currency, parent_entity_id -> fin.legal_entity

---

## fin.intercompany_agreement

Defines intercompany trading relationships with transfer pricing methods. Supports goods, services, loans, royalties, and management fees with OECD-compliant transfer pricing methods (CUP, resale minus, cost plus, TNMM, profit split).

| Column                  | Type         | Nullable | Default             | Description                                                |
| ----------------------- | ------------ | -------- | ------------------- | ---------------------------------------------------------- |
| id                      | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                         |
| tenant_id               | uuid         | NOT NULL |                     | FK to core.tenant                                          |
| source_entity_code      | varchar(20)  | NOT NULL |                     | Source entity                                              |
| dest_entity_code        | varchar(20)  | NOT NULL |                     | Destination entity                                         |
| agreement_type          | varchar(20)  | NOT NULL |                     | `GOODS`, `SERVICES`, `LOAN`, `ROYALTY`, `MANAGEMENT_FEE`   |
| transfer_pricing_method | varchar(30)  | NOT NULL |                     | `CUP`, `RESALE_MINUS`, `COST_PLUS`, `TNMM`, `PROFIT_SPLIT` |
| markup_pct              | decimal(8,4) | YES      |                     | Markup percentage                                          |
| effective_from          | date         | NOT NULL |                     | Agreement start date                                       |
| effective_to            | date         | YES      |                     | Agreement end date                                         |
| is_active               | boolean      | NOT NULL | `true`              | Active flag                                                |

**PK**: `(id)` | **Unique**: `(tenant_id, source_entity_code, dest_entity_code, agreement_type)` | **FKs**: tenant_id -> core.tenant

---

## fin.intercompany_transaction

Intercompany transaction pairs tracking the full lifecycle from creation through mirroring, transfer pricing, posting, netting, and settlement. Records both source and destination JE references and optional netting batch linkage.

| Column             | Type          | Nullable | Default             | Description                                                    |
| ------------------ | ------------- | -------- | ------------------- | -------------------------------------------------------------- |
| id                 | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                             |
| tenant_id          | uuid          | NOT NULL |                     | FK to core.tenant                                              |
| source_entity_code | varchar(20)   | NOT NULL |                     | Source entity                                                  |
| dest_entity_code   | varchar(20)   | NOT NULL |                     | Destination entity                                             |
| source_doc_id      | uuid          | YES      |                     | Source document                                                |
| dest_doc_id        | uuid          | YES      |                     | Destination document                                           |
| txn_type           | varchar(20)   | NOT NULL |                     | `SALE`, `PURCHASE`, `LOAN`, `RECHARGE`, `DIVIDEND`             |
| amount             | decimal(18,4) | NOT NULL |                     | Transaction amount                                             |
| currency_code      | varchar(3)    | NOT NULL |                     | Currency                                                       |
| transfer_price     | decimal(18,4) | YES      |                     | Transfer price                                                 |
| arm_length_price   | decimal(18,4) | YES      |                     | Arm's length price                                             |
| source_je_id       | uuid          | YES      |                     | FK to fin.journal_entry (source)                               |
| dest_je_id         | uuid          | YES      |                     | FK to fin.journal_entry (destination)                          |
| netting_batch_id   | uuid          | YES      |                     | FK to fin.netting_batch                                        |
| status             | varchar(20)   | NOT NULL | `'CREATED'`         | `CREATED`, `MIRRORED`, `PRICED`, `POSTED`, `NETTED`, `SETTLED` |
| created_at         | timestamptz   | NOT NULL | `now()`             | Created timestamp                                              |
| updated_at         | timestamptz   | NOT NULL | `now()`             | Updated timestamp                                              |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, source_je_id/dest_je_id -> fin.journal_entry

---

## fin.fx_rate

Exchange rate table storing spot, period average, period end, and budget rates per currency pair per effective date.

| Column         | Type           | Nullable | Default             | Description                                  |
| -------------- | -------------- | -------- | ------------------- | -------------------------------------------- |
| id             | uuid           | NOT NULL | `gen_random_uuid()` | PK                                           |
| tenant_id      | uuid           | NOT NULL |                     | FK to core.tenant                            |
| from_currency  | varchar(3)     | NOT NULL |                     | Source currency                              |
| to_currency    | varchar(3)     | NOT NULL |                     | Target currency                              |
| rate_type      | varchar(20)    | NOT NULL |                     | `SPOT`, `PERIOD_AVG`, `PERIOD_END`, `BUDGET` |
| rate           | decimal(18,10) | NOT NULL |                     | Exchange rate (10 decimal places)            |
| effective_date | date           | NOT NULL |                     | Rate effective date                          |
| source         | varchar(50)    | YES      |                     | Rate source (e.g., `ECB`, `REUTERS`)         |

**PK**: `(id)` | **Unique**: `(tenant_id, from_currency, to_currency, rate_type, effective_date)` | **FKs**: tenant_id -> core.tenant

---

## fin.fx_revaluation

Unrealized FX gain/loss records generated during period-end revaluation of foreign-currency-denominated balances. Links to the revaluation journal entry and supports auto-reversal at next period open.

| Column                     | Type          | Nullable | Default             | Description                            |
| -------------------------- | ------------- | -------- | ------------------- | -------------------------------------- |
| id                         | uuid          | NOT NULL | `gen_random_uuid()` | PK                                     |
| tenant_id                  | uuid          | NOT NULL |                     | FK to core.tenant                      |
| entity_code                | varchar(20)   | NOT NULL |                     | Legal entity code                      |
| account_id                 | uuid          | NOT NULL |                     | FK to fin.chart_of_accounts            |
| original_currency          | varchar(3)    | NOT NULL |                     | Foreign currency                       |
| functional_currency        | varchar(3)    | NOT NULL |                     | Entity functional currency             |
| original_amount            | decimal(18,4) | NOT NULL |                     | Amount in foreign currency             |
| original_functional_amount | decimal(18,4) | NOT NULL |                     | Original amount in functional currency |
| revalued_functional_amount | decimal(18,4) | NOT NULL |                     | Revalued amount in functional currency |
| unrealized_gain_loss       | decimal(18,4) | NOT NULL |                     | Unrealized gain/loss                   |
| revaluation_date           | date          | NOT NULL |                     | Revaluation date                       |
| fiscal_year                | smallint      | NOT NULL |                     | Fiscal year                            |
| period_number              | smallint      | NOT NULL |                     | Period number                          |
| reference_je_id            | uuid          | YES      |                     | FK to fin.journal_entry                |
| auto_reversed              | boolean       | NOT NULL | `false`             | Whether auto-reversed at period open   |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, account_id -> fin.chart_of_accounts, reference_je_id -> fin.journal_entry

---

## fin.consolidation_elimination

Intercompany elimination entries generated during group consolidation. Eliminates IC revenue/expense, receivables/payables, unrealized profit, minority interest, and investments.

| Column             | Type          | Nullable | Default             | Description                                                                                   |
| ------------------ | ------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------- |
| id                 | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                                                            |
| tenant_id          | uuid          | NOT NULL |                     | FK to core.tenant                                                                             |
| fiscal_year        | smallint      | NOT NULL |                     | Fiscal year                                                                                   |
| period_number      | smallint      | NOT NULL |                     | Period number                                                                                 |
| elimination_type   | varchar(30)   | NOT NULL |                     | `IC_REVENUE_EXPENSE`, `IC_RECEIVABLE_PAYABLE`, `IC_PROFIT`, `MINORITY_INTEREST`, `INVESTMENT` |
| source_entity_code | varchar(20)   | NOT NULL |                     | Source entity                                                                                 |
| dest_entity_code   | varchar(20)   | NOT NULL |                     | Destination entity                                                                            |
| amount             | decimal(18,4) | NOT NULL |                     | Elimination amount                                                                            |
| currency_code      | varchar(3)    | NOT NULL |                     | Currency                                                                                      |
| reference_je_id    | uuid          | YES      |                     | FK to fin.journal_entry                                                                       |
| status             | varchar(20)   | NOT NULL | `'CALCULATED'`      | `CALCULATED`, `POSTED`, `REVIEWED`                                                            |
| created_at         | timestamptz   | NOT NULL | `now()`             | Created timestamp                                                                             |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, reference_je_id -> fin.journal_entry

---

## fin.netting_batch

Intercompany netting batches that reduce gross IC balances to net settlement amounts. Each batch covers an entity pair on a specific date and progresses from PROPOSED through APPROVED to SETTLED.

| Column            | Type          | Nullable | Default             | Description                       |
| ----------------- | ------------- | -------- | ------------------- | --------------------------------- |
| id                | uuid          | NOT NULL | `gen_random_uuid()` | PK                                |
| tenant_id         | uuid          | NOT NULL |                     | FK to core.tenant                 |
| batch_date        | date          | NOT NULL |                     | Netting date                      |
| entity_pair       | text          | NOT NULL |                     | Entity pair identifier            |
| gross_amount      | decimal(18,4) | NOT NULL |                     | Gross IC balance                  |
| net_amount        | decimal(18,4) | NOT NULL |                     | Net settlement amount             |
| currency_code     | varchar(3)    | NOT NULL |                     | Currency                          |
| status            | varchar(20)   | NOT NULL | `'PROPOSED'`        | `PROPOSED`, `APPROVED`, `SETTLED` |
| settlement_je_ids | uuid[]        | YES      |                     | Array of settlement JE IDs        |
| created_at        | timestamptz   | NOT NULL | `now()`             | Created timestamp                 |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant

---

# Production Engine

## fin.bill_of_materials

Bill of Materials (BOM) definitions supporting multi-level, versioned product structures. Each BOM version can be in DRAFT, ACTIVE, or SUPERSEDED status with effective date ranges.

| Column         | Type        | Nullable | Default             | Description                     |
| -------------- | ----------- | -------- | ------------------- | ------------------------------- |
| id             | uuid        | NOT NULL | `gen_random_uuid()` | PK                              |
| tenant_id      | uuid        | NOT NULL |                     | FK to core.tenant               |
| entity_code    | varchar(20) | NOT NULL |                     | Legal entity code               |
| product_id     | uuid        | NOT NULL |                     | FK to ent.product               |
| version        | integer     | NOT NULL | `1`                 | BOM version                     |
| status         | varchar(20) | NOT NULL | `'DRAFT'`           | `DRAFT`, `ACTIVE`, `SUPERSEDED` |
| effective_from | date        | YES      |                     | Effective start                 |
| effective_to   | date        | YES      |                     | Effective end                   |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, product_id, version)` | **FKs**: tenant_id -> core.tenant, product_id -> ent.product

---

## fin.bom_line

Individual component lines within a BOM. Specifies the component product, quantity per parent unit, scrap percentage allowance, and phantom flag (phantom components explode through to their own BOM).

| Column               | Type          | Nullable | Default             | Description                                  |
| -------------------- | ------------- | -------- | ------------------- | -------------------------------------------- |
| id                   | uuid          | NOT NULL | `gen_random_uuid()` | PK                                           |
| tenant_id            | uuid          | NOT NULL |                     | FK to core.tenant                            |
| bom_id               | uuid          | NOT NULL |                     | FK to fin.bill_of_materials (CASCADE delete) |
| line_no              | smallint      | NOT NULL |                     | Line number                                  |
| component_product_id | uuid          | NOT NULL |                     | FK to ent.product                            |
| quantity_per         | decimal(18,6) | NOT NULL |                     | Quantity per parent unit                     |
| uom_code             | varchar(10)   | YES      |                     | Unit of measure                              |
| scrap_pct            | decimal(5,2)  | NOT NULL | `0`                 | Expected scrap percentage                    |
| is_phantom           | boolean       | NOT NULL | `false`             | Phantom component flag                       |

**PK**: `(id)` | **Unique**: `(tenant_id, bom_id, line_no)` | **FKs**: tenant_id -> core.tenant, bom_id -> fin.bill_of_materials (CASCADE), component_product_id -> ent.product

---

## fin.routing

Manufacturing routing operations defining the sequence of work center operations needed to produce a product. Each operation specifies setup and run times, labor rates, and overhead rates for standard cost calculation.

| Column           | Type          | Nullable | Default             | Description               |
| ---------------- | ------------- | -------- | ------------------- | ------------------------- |
| id               | uuid          | NOT NULL | `gen_random_uuid()` | PK                        |
| tenant_id        | uuid          | NOT NULL |                     | FK to core.tenant         |
| entity_code      | varchar(20)   | NOT NULL |                     | Legal entity code         |
| product_id       | uuid          | NOT NULL |                     | FK to ent.product         |
| operation_seq    | smallint      | NOT NULL |                     | Operation sequence number |
| operation_name   | varchar(200)  | NOT NULL |                     | Operation name            |
| work_center      | varchar(50)   | YES      |                     | Work center code          |
| setup_time_hours | decimal(8,2)  | YES      |                     | Setup time                |
| run_time_hours   | decimal(8,2)  | YES      |                     | Run time per unit         |
| labor_rate       | decimal(18,4) | YES      |                     | Labor cost rate           |
| overhead_rate    | decimal(18,4) | YES      |                     | Overhead cost rate        |
| currency_code    | varchar(3)    | YES      |                     | Rate currency             |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, product_id, operation_seq)` | **FKs**: tenant_id -> core.tenant, product_id -> ent.product

---

## fin.work_order

Production work orders that drive manufacturing execution. Each work order references a product and optional BOM, tracks planned vs. completed quantities, and progresses through PLANNED -> RELEASED -> IN_PROGRESS -> COMPLETED -> CLOSED.

| Column         | Type          | Nullable | Default             | Description                                                 |
| -------------- | ------------- | -------- | ------------------- | ----------------------------------------------------------- |
| id             | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                          |
| tenant_id      | uuid          | NOT NULL |                     | FK to core.tenant                                           |
| entity_code    | varchar(20)   | NOT NULL |                     | Legal entity code                                           |
| wo_number      | varchar(50)   | NOT NULL |                     | Work order number                                           |
| product_id     | uuid          | NOT NULL |                     | FK to ent.product                                           |
| bom_id         | uuid          | YES      |                     | FK to fin.bill_of_materials                                 |
| planned_qty    | decimal(18,4) | NOT NULL |                     | Planned production quantity                                 |
| completed_qty  | decimal(18,4) | NOT NULL | `0`                 | Completed quantity                                          |
| uom_code       | varchar(10)   | YES      |                     | Unit of measure                                             |
| status         | varchar(20)   | NOT NULL | `'PLANNED'`         | `PLANNED`, `RELEASED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED` |
| planned_start  | date          | YES      |                     | Planned start date                                          |
| planned_end    | date          | YES      |                     | Planned end date                                            |
| actual_start   | date          | YES      |                     | Actual start date                                           |
| actual_end     | date          | YES      |                     | Actual end date                                             |
| ou_id          | uuid          | YES      |                     | Operating unit                                              |
| cost_center_id | uuid          | YES      |                     | Cost center                                                 |
| created_at     | timestamptz   | NOT NULL | `now()`             | Created timestamp                                           |
| updated_at     | timestamptz   | NOT NULL | `now()`             | Updated timestamp                                           |

**PK**: `(id)` | **Unique**: `(tenant_id, entity_code, wo_number)` | **FKs**: tenant_id -> core.tenant, product_id -> ent.product, bom_id -> fin.bill_of_materials

---

## fin.work_order_cost

WIP cost accumulation per work order by cost type (material, labor, overhead). Tracks planned vs. actual amounts with a generated `variance` column. Links to the corresponding journal entry.

| Column          | Type          | Nullable  | Default             | Description                               |
| --------------- | ------------- | --------- | ------------------- | ----------------------------------------- |
| id              | uuid          | NOT NULL  | `gen_random_uuid()` | PK                                        |
| tenant_id       | uuid          | NOT NULL  |                     | FK to core.tenant                         |
| work_order_id   | uuid          | NOT NULL  |                     | FK to fin.work_order (CASCADE delete)     |
| cost_type       | varchar(20)   | NOT NULL  |                     | `MATERIAL`, `LABOR`, `OVERHEAD`           |
| planned_amount  | decimal(18,4) | NOT NULL  |                     | Planned (standard) cost                   |
| actual_amount   | decimal(18,4) | NOT NULL  | `0`                 | Actual cost                               |
| variance        | decimal(18,4) | GENERATED |                     | `actual_amount - planned_amount` (STORED) |
| currency_code   | varchar(3)    | NOT NULL  |                     | Currency                                  |
| reference_je_id | uuid          | YES       |                     | FK to fin.journal_entry                   |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, work_order_id -> fin.work_order (CASCADE), reference_je_id -> fin.journal_entry

---

## fin.work_order_material_issue

Material consumption records for work orders. Tracks planned vs. issued quantities per item per warehouse, with unit/total cost and linkage to the inventory movement that performed the issue.

| Column        | Type          | Nullable | Default             | Description                   |
| ------------- | ------------- | -------- | ------------------- | ----------------------------- |
| id            | uuid          | NOT NULL | `gen_random_uuid()` | PK                            |
| tenant_id     | uuid          | NOT NULL |                     | FK to core.tenant             |
| work_order_id | uuid          | NOT NULL |                     | FK to fin.work_order          |
| item_id       | uuid          | NOT NULL |                     | Item master ID                |
| warehouse_id  | uuid          | NOT NULL |                     | Source warehouse ID           |
| planned_qty   | decimal(18,4) | NOT NULL |                     | Planned issue quantity        |
| issued_qty    | decimal(18,4) | NOT NULL | `0`                 | Actual issued quantity        |
| unit_cost     | decimal(18,4) | YES      |                     | Unit cost at issue            |
| total_cost    | decimal(18,4) | YES      |                     | Total cost of issued material |
| movement_id   | uuid          | YES      |                     | Inventory movement ID         |
| issued_at     | timestamptz   | YES      |                     | Issue timestamp               |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, work_order_id -> fin.work_order

---

## fin.production_variance

Variance analysis records generated at work order close. Breaks down variances into price, usage, rate, efficiency, and volume components by cost type (material, labor, overhead) with journal entry linkage.

| Column          | Type          | Nullable | Default             | Description                                      |
| --------------- | ------------- | -------- | ------------------- | ------------------------------------------------ |
| id              | uuid          | NOT NULL | `gen_random_uuid()` | PK                                               |
| tenant_id       | uuid          | NOT NULL |                     | FK to core.tenant                                |
| work_order_id   | uuid          | NOT NULL |                     | FK to fin.work_order                             |
| variance_type   | varchar(30)   | NOT NULL |                     | `PRICE`, `USAGE`, `RATE`, `EFFICIENCY`, `VOLUME` |
| cost_type       | varchar(20)   | NOT NULL |                     | `MATERIAL`, `LABOR`, `OVERHEAD`                  |
| standard_amount | decimal(18,4) | NOT NULL |                     | Standard (expected) amount                       |
| actual_amount   | decimal(18,4) | NOT NULL |                     | Actual amount                                    |
| variance_amount | decimal(18,4) | NOT NULL |                     | Variance (actual - standard)                     |
| reference_je_id | uuid          | YES      |                     | FK to fin.journal_entry                          |
| analyzed_at     | timestamptz   | NOT NULL | `now()`             | Analysis timestamp                               |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, work_order_id -> fin.work_order, reference_je_id -> fin.journal_entry

---

# Atlas AI Engine

## fin.ai_model_registry

Registry of deployed ML models. Each model is typed (classification, regression, anomaly, recommendation, NLP), targets a specific financial engine, has a capability level (L1=advisory, L2=semi-autonomous, L3=autonomous), and tracks deployment lifecycle and performance metrics.

| Column              | Type         | Nullable | Default             | Description                                                        |
| ------------------- | ------------ | -------- | ------------------- | ------------------------------------------------------------------ |
| id                  | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                                 |
| tenant_id           | uuid         | NOT NULL |                     | FK to core.tenant                                                  |
| model_code          | varchar(50)  | NOT NULL |                     | Model code                                                         |
| model_name          | varchar(200) | NOT NULL |                     | Display name                                                       |
| model_version       | varchar(20)  | NOT NULL |                     | Version string                                                     |
| model_type          | varchar(30)  | NOT NULL |                     | `CLASSIFICATION`, `REGRESSION`, `ANOMALY`, `RECOMMENDATION`, `NLP` |
| target_engine       | varchar(50)  | NOT NULL |                     | Target financial engine                                            |
| capability_level    | varchar(5)   | NOT NULL |                     | `L1` (advisory), `L2` (semi-auto), `L3` (autonomous)               |
| status              | varchar(20)  | NOT NULL | `'TRAINING'`        | `TRAINING`, `VALIDATING`, `DEPLOYED`, `DEPRECATED`                 |
| config              | jsonb        | YES      | `'{}'`              | Model configuration                                                |
| performance_metrics | jsonb        | YES      | `'{}'`              | Performance metrics (accuracy, F1, etc.)                           |
| deployed_at         | timestamptz  | YES      |                     | Deployment timestamp                                               |
| deployed_by         | uuid         | YES      |                     | Who deployed                                                       |
| last_prediction_at  | timestamptz  | YES      |                     | Last prediction timestamp                                          |
| created_at          | timestamptz  | NOT NULL | `now()`             | Created timestamp                                                  |
| updated_at          | timestamptz  | NOT NULL | `now()`             | Updated timestamp                                                  |

**PK**: `(id)` | **Unique**: `(tenant_id, model_code, model_version)` | **FKs**: tenant_id -> core.tenant

---

## fin.ai_prediction

Prediction and recommendation log. Each entry records the model used, input features, output, confidence score, and a human-readable reasoning chain. Tracks whether the prediction was accepted by a user.

| Column          | Type         | Nullable | Default             | Description                                               |
| --------------- | ------------ | -------- | ------------------- | --------------------------------------------------------- |
| id              | uuid         | NOT NULL | `gen_random_uuid()` | PK                                                        |
| tenant_id       | uuid         | NOT NULL |                     | FK to core.tenant                                         |
| model_id        | uuid         | NOT NULL |                     | FK to fin.ai_model_registry                               |
| txn_id          | uuid         | YES      |                     | Associated transaction                                    |
| target_engine   | varchar(50)  | NOT NULL |                     | Target engine                                             |
| prediction_type | varchar(30)  | NOT NULL |                     | `RECOMMENDATION`, `ANOMALY`, `CLASSIFICATION`, `FORECAST` |
| input_features  | jsonb        | NOT NULL |                     | Input feature vector                                      |
| output          | jsonb        | NOT NULL |                     | Prediction output                                         |
| confidence      | decimal(3,2) | NOT NULL |                     | Confidence score (0.00-1.00)                              |
| reasoning_chain | text         | NOT NULL |                     | Human-readable explanation                                |
| was_accepted    | boolean      | YES      |                     | Whether accepted by user                                  |
| accepted_by     | uuid         | YES      |                     | Who accepted                                              |
| accepted_at     | timestamptz  | YES      |                     | Acceptance timestamp                                      |
| created_at      | timestamptz  | NOT NULL | `now()`             | Created timestamp                                         |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, model_id -> fin.ai_model_registry

---

## fin.ai_action

Autonomous action log for L3 capability models. Records AI-initiated actions with full reasoning, confidence, and a reversal window. Actions can be proposed, executed, reversed, or rejected.

| Column                     | Type         | Nullable | Default             | Description                                    |
| -------------------------- | ------------ | -------- | ------------------- | ---------------------------------------------- |
| id                         | uuid         | NOT NULL | `gen_random_uuid()` | PK                                             |
| tenant_id                  | uuid         | NOT NULL |                     | FK to core.tenant                              |
| model_id                   | uuid         | NOT NULL |                     | FK to fin.ai_model_registry                    |
| txn_id                     | uuid         | YES      |                     | Associated transaction                         |
| target_engine              | varchar(50)  | NOT NULL |                     | Target engine                                  |
| action_type                | varchar(50)  | NOT NULL |                     | Type of action taken                           |
| action_payload             | jsonb        | NOT NULL |                     | Action details                                 |
| confidence                 | decimal(3,2) | NOT NULL |                     | Confidence score                               |
| reasoning_chain            | text         | NOT NULL |                     | Reasoning explanation                          |
| status                     | varchar(20)  | NOT NULL | `'PROPOSED'`        | `PROPOSED`, `EXECUTED`, `REVERSED`, `REJECTED` |
| executed_at                | timestamptz  | YES      |                     | Execution timestamp                            |
| reversal_window_expires_at | timestamptz  | YES      |                     | Reversal window deadline                       |
| reversed_at                | timestamptz  | YES      |                     | Reversal timestamp                             |
| reversed_by                | uuid         | YES      |                     | Who reversed                                   |
| created_at                 | timestamptz  | NOT NULL | `now()`             | Created timestamp                              |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, model_id -> fin.ai_model_registry

**Indexes**: idx_fin_ai_action_tenant, idx_fin_ai_action_status, idx_fin_ai_action_reversal `(reversal_window_expires_at) WHERE status = 'EXECUTED'`

---

## fin.ai_drift_monitor

Model bias and data drift monitoring. Records daily metric measurements against baseline values to detect when a deployed model's performance degrades, triggering alerts for retraining.

| Column          | Type          | Nullable | Default             | Description                                         |
| --------------- | ------------- | -------- | ------------------- | --------------------------------------------------- |
| id              | uuid          | NOT NULL | `gen_random_uuid()` | PK                                                  |
| tenant_id       | uuid          | NOT NULL |                     | FK to core.tenant                                   |
| model_id        | uuid          | NOT NULL |                     | FK to fin.ai_model_registry                         |
| monitoring_date | date          | NOT NULL |                     | Measurement date                                    |
| metric_name     | varchar(50)   | NOT NULL |                     | Metric being tracked (e.g., `accuracy`, `f1_score`) |
| metric_value    | decimal(10,6) | NOT NULL |                     | Current metric value                                |
| baseline_value  | decimal(10,6) | NOT NULL |                     | Expected baseline value                             |
| drift_detected  | boolean       | NOT NULL | `false`             | Whether drift threshold exceeded                    |
| alert_sent      | boolean       | NOT NULL | `false`             | Whether an alert was sent                           |
| created_at      | timestamptz   | NOT NULL | `now()`             | Created timestamp                                   |

**PK**: `(id)` | **FKs**: tenant_id -> core.tenant, model_id -> fin.ai_model_registry

**Indexes**: idx_fin_ai_drift_model, idx_fin_ai_drift_date
