/* ============================================================================
   Athyper v2.1 -- Spend Category + Classification Resolution
   Schema: fin
   Dependencies: core.tenant, ref.currency, ref.commodity_domain,
                 fin.business_intent (from 155_ou_intent.sql)

   Purpose: Bridges item classification (WHAT) to financial resolution (WHY).
   Spend categories are the user-friendly grouping layer (20-60 per tenant)
   that map from commodity codes and drive OPEX/CAPEX auto-decision,
   intent suggestion, and compliance enforcement.

   Design principles:
     - Classification is OPTIONAL by default, mandatory only by policy
     - Every auto-decision carries an explanation template
     - Spend categories have visibility levels (STANDARD/RESTRICTED/CONFIDENTIAL)
   ============================================================================ */

-- ============================================================================
-- fin.spend_category -- Tenant spend groups with financial properties
-- Answers: "How do we account for this class of expenditure?"
-- Owned by: Finance team
-- ============================================================================
create table if not exists fin.spend_category (
    id                          uuid primary key default gen_random_uuid(),
    tenant_id                   uuid not null references core.tenant(id),
    code                        varchar(50) not null,
    name                        varchar(200) not null,
    description                 text,
    parent_id                   uuid references fin.spend_category(id),

    -- Domain affinity: which financial domains this category typically maps to
    primary_domain              varchar(50) not null
                                check (primary_domain in ('OPEX','CAPEX','REVENUE','TRANSFER','REGULATORY','ADMIN')),
    allowed_domains             varchar(50)[] not null default '{}',

    -- Capitalization rules (OPEX vs CAPEX auto-decision)
    -- If amount > threshold -> CAPEX; amount <= threshold -> OPEX
    -- NULL threshold = no auto-decision (use primary_domain)
    capitalization_threshold    decimal(18,4),
    capitalization_currency     varchar(3) references ref.currency(code),

    -- Procurement classification
    procurement_type            varchar(20) not null default 'MIXED'
                                check (procurement_type in ('GOODS','SERVICES','MIXED')),

    -- Financial defaults (category-level, before intent resolution)
    default_intent_id           uuid references fin.business_intent(id),
    default_gl_account          varchar(20),
    default_tax_code            varchar(20),

    -- Asset handling (used when domain resolves to CAPEX)
    requires_asset_tagging      boolean not null default false,
    default_useful_life_months  integer,
    default_depreciation_method varchar(20)
                                check (default_depreciation_method is null or
                                       default_depreciation_method in ('STRAIGHT_LINE','DECLINING_BALANCE',
                                                                       'DOUBLE_DECLINING','UNITS_OF_PRODUCTION',
                                                                       'SUM_OF_YEARS')),

    -- Visibility + Access Control (same model as business_intent)
    visibility                  varchar(20) not null default 'STANDARD'
                                check (visibility in ('STANDARD','RESTRICTED','CONFIDENTIAL')),

    -- Compliance flags (drives mandatory classification + HS requirements)
    classification_required     boolean not null default false,
    hs_required                 boolean not null default false,
    is_regulated                boolean not null default false,

    -- Control
    is_active                   boolean not null default true,
    sort_order                  integer not null default 0,
    metadata                    jsonb not null default '{}'::jsonb,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),

    constraint uq_fin_spend_category unique (tenant_id, code)
);

comment on table fin.spend_category is 'Tenant spend groups bridging item classification to financial resolution.';

create index if not exists idx_fin_spend_cat_tenant
    on fin.spend_category(tenant_id);
create index if not exists idx_fin_spend_cat_parent
    on fin.spend_category(parent_id);
create index if not exists idx_fin_spend_cat_domain
    on fin.spend_category(tenant_id, primary_domain);
create index if not exists idx_fin_spend_cat_visibility
    on fin.spend_category(tenant_id, visibility);
create index if not exists idx_fin_spend_cat_active
    on fin.spend_category(tenant_id, is_active) where is_active = true;

-- ============================================================================
-- fin.spend_category_commodity_map -- Links categories to commodity code ranges
-- Enables: UNSPSC 43xx -> CAT-IT-HW, HS 8471 -> CAT-IT-HW (multi-domain)
-- ============================================================================
create table if not exists fin.spend_category_commodity_map (
    id                    uuid primary key default gen_random_uuid(),
    tenant_id             uuid not null references core.tenant(id),
    category_id           uuid not null references fin.spend_category(id) on delete cascade,
    commodity_domain_code text not null references ref.commodity_domain(code),
    commodity_code_from   text not null,                 -- range start or exact code
    commodity_code_to     text,                          -- range end; NULL = exact match
    commodity_level       smallint,                      -- at which hierarchy level this operates
    priority              integer not null default 0,    -- if overlapping ranges, lower wins
    created_at            timestamptz not null default now(),

    constraint uq_fin_sc_commodity
        unique (tenant_id, category_id, commodity_domain_code, commodity_code_from)
);

comment on table fin.spend_category_commodity_map is 'Maps commodity code ranges from any domain to spend categories.';

create index if not exists idx_fin_sc_commodity_cat
    on fin.spend_category_commodity_map(category_id);
create index if not exists idx_fin_sc_commodity_domain
    on fin.spend_category_commodity_map(commodity_domain_code, commodity_code_from);
create index if not exists idx_fin_sc_commodity_tenant
    on fin.spend_category_commodity_map(tenant_id);

-- ============================================================================
-- fin.category_intent_rule -- Context-driven resolution: WHAT + context -> WHY
-- Each rule carries an explanation template for auditability (requirement D)
-- ============================================================================
create table if not exists fin.category_intent_rule (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references core.tenant(id),
    category_id             uuid not null references fin.spend_category(id) on delete cascade,

    -- Condition that triggers this rule
    condition_type          varchar(30) not null
                            check (condition_type in (
                                'AMOUNT_ABOVE','AMOUNT_BELOW',
                                'IS_RECURRING','IS_ONE_TIME',
                                'OU_MATCH','PROCUREMENT_METHOD',
                                'CROSS_BORDER','FALLBACK'
                            )),
    condition_config        jsonb not null default '{}'::jsonb,
    -- Examples:
    --   AMOUNT_ABOVE: {"amount": 1000, "currency": "USD"}
    --   IS_RECURRING: {"recurring": true}
    --   OU_MATCH:     {"ou_codes": ["DEPT-PROCUREMENT","DEPT-IT"]}
    --   CROSS_BORDER: {"requires_hs": true}
    --   FALLBACK:     {}

    -- Resolution: which intent + domain when this rule fires
    resolved_intent_id      uuid not null references fin.business_intent(id),
    resolved_domain         varchar(50)
                            check (resolved_domain is null or
                                   resolved_domain in ('OPEX','CAPEX','REVENUE','TRANSFER','REGULATORY','ADMIN')),

    -- Priority: lower number = evaluated first; FALLBACK should be 99
    priority                integer not null default 50,
    is_active               boolean not null default true,

    -- Explainability: human-readable template with {placeholders}
    -- Populated into decision_explanations on fin.transaction_pipeline
    explanation_template    text not null,
    -- Examples:
    --   "CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}"
    --   "OPEX because procurement method is subscription/lease for {category_name}"
    --   "OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}"
    --   "HS required because cross-border flag is true for {category_name}"
    --   "CAPEX by default for {category_name} (primary domain)"

    created_at              timestamptz not null default now(),

    constraint uq_fin_cat_intent_rule
        unique (tenant_id, category_id, condition_type, priority)
);

comment on table fin.category_intent_rule is 'Context-driven intent resolution with explanation templates for audit trail.';

create index if not exists idx_fin_cat_intent_rule_cat
    on fin.category_intent_rule(category_id);
create index if not exists idx_fin_cat_intent_rule_tenant
    on fin.category_intent_rule(tenant_id);
create index if not exists idx_fin_cat_intent_rule_active
    on fin.category_intent_rule(tenant_id, category_id, priority)
    where is_active = true;
