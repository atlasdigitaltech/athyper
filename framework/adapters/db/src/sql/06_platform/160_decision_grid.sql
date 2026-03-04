/* ============================================================================
   Athyper v2.1 — Decision Grid Engine + Exception Model
   Schema: fin
   Dependencies: core.tenant, fin.operating_unit, fin.business_intent
   ============================================================================ */

-- ============================================================================
-- fin.transaction_pipeline — Transaction processing state
-- ============================================================================
create table if not exists fin.transaction_pipeline (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    txn_id          uuid not null unique,
    doc_id          uuid not null,
    doc_type        varchar(20) not null,
    ou_id           uuid not null references fin.operating_unit(id),
    intent_id       uuid references fin.business_intent(id),
    status          varchar(30) not null default 'INTAKE'
                    check (status in (
                        'INTAKE','OU_VALIDATION','CLASSIFICATION','INTENT_RESOLUTION','SMART_DEFAULTS',
                        'FUNDING_CHECK','COMMITMENT_CREATION','POLICY_EVALUATION',
                        'RISK_SCORING','WORKFLOW_ASSEMBLY','TAX_CALCULATION',
                        'AI_ENHANCEMENT','FINALIZATION','COMPLETED','FAILED'
                    )),
    current_step    smallint not null default 1,
    composite_score decimal(3,2),
    workflow_path   varchar(20)
                    check (workflow_path is null or workflow_path in (
                        'ZERO_APPROVAL','STANDARD','ENHANCED','EXECUTIVE','BLOCKED'
                    )),
    rejection_reason text,
    remediation_guidance text,
    finalization_seq integer not null default 1,

    -- Resolved snapshot (populated progressively)
    resolved_gl_account     varchar(20),
    resolved_cost_center    varchar(20),
    resolved_profit_center  varchar(20),
    resolved_fund_center    varchar(20),
    resolved_fp_id          uuid,
    resolved_tax_profile    jsonb,
    resolved_asset_profile  jsonb,
    resolved_accounting_profile_id uuid,

    -- Classification dimension (populated during CLASSIFICATION step)
    spend_category_id           uuid,                    -- resolved fin.spend_category
    commodity_domain_code       text,                    -- e.g., 'unspsc'
    commodity_code              text,                    -- e.g., '43211501'
    resolved_hs_code            text,                    -- resolved via crosswalk for cross-border
    classification_confidence   decimal(5,2),            -- AI classification confidence (0-100)
    classification_source       varchar(20) not null default 'NONE'
                                check (classification_source in ('USER_SELECTED','AI_SUGGESTED','AUTO_MATCHED','NONE')),
    classification_required     boolean not null default false,

    -- Cross-border (populated during CLASSIFICATION step)
    is_cross_border             boolean not null default false,
    cross_border_reason         text,                    -- e.g., 'supplier_country DE != entity_country MY'

    -- Explainability: every auto-decision recorded with reason
    -- Array of: {step, field, decision, explanation, rule_id, confidence}
    decision_explanations       jsonb not null default '[]'::jsonb,

    -- User override tracking: what user changed from system suggestion
    -- Array of: {field, suggested_value, user_value, reason, overridden_by, overridden_at}
    user_overrides              jsonb not null default '[]'::jsonb,

    -- Pipeline metadata
    smart_defaults_confidence decimal(3,2),
    policy_decisions    jsonb,
    risk_scores         jsonb,
    ai_advisory         jsonb,

    submitted_by        uuid not null,
    submitted_at        timestamptz not null default now(),
    finalized_at        timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- Migration: add columns to existing table
alter table fin.transaction_pipeline add column if not exists spend_category_id uuid;
alter table fin.transaction_pipeline add column if not exists commodity_domain_code text;
alter table fin.transaction_pipeline add column if not exists commodity_code text;
alter table fin.transaction_pipeline add column if not exists resolved_hs_code text;
alter table fin.transaction_pipeline add column if not exists classification_confidence decimal(5,2);
alter table fin.transaction_pipeline add column if not exists classification_source varchar(20) not null default 'NONE';
alter table fin.transaction_pipeline add column if not exists classification_required boolean not null default false;
alter table fin.transaction_pipeline add column if not exists is_cross_border boolean not null default false;
alter table fin.transaction_pipeline add column if not exists cross_border_reason text;
alter table fin.transaction_pipeline add column if not exists decision_explanations jsonb not null default '[]'::jsonb;
alter table fin.transaction_pipeline add column if not exists user_overrides jsonb not null default '[]'::jsonb;

-- Migration: update status CHECK to include CLASSIFICATION
DO $$ BEGIN
    alter table fin.transaction_pipeline drop constraint if exists transaction_pipeline_status_check;
    alter table fin.transaction_pipeline add constraint transaction_pipeline_status_check
        check (status in (
            'INTAKE','OU_VALIDATION','CLASSIFICATION','INTENT_RESOLUTION','SMART_DEFAULTS',
            'FUNDING_CHECK','COMMITMENT_CREATION','POLICY_EVALUATION',
            'RISK_SCORING','WORKFLOW_ASSEMBLY','TAX_CALCULATION',
            'AI_ENHANCEMENT','FINALIZATION','COMPLETED','FAILED'
        ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Migration: add classification_source CHECK if missing
DO $$ BEGIN
    alter table fin.transaction_pipeline add constraint transaction_pipeline_classification_source_check
        check (classification_source in ('USER_SELECTED','AI_SUGGESTED','AUTO_MATCHED','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create index if not exists idx_fin_pipeline_tenant on fin.transaction_pipeline(tenant_id);
create index if not exists idx_fin_pipeline_txn on fin.transaction_pipeline(txn_id);
create index if not exists idx_fin_pipeline_ou on fin.transaction_pipeline(ou_id);
create index if not exists idx_fin_pipeline_status on fin.transaction_pipeline(tenant_id, status);

DO $$ BEGIN
    alter table fin.transaction_pipeline
        add constraint fk_fin_pipeline_spend_cat
            foreign key (spend_category_id) references fin.spend_category(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

create index if not exists idx_fin_pipeline_spend_cat
    on fin.transaction_pipeline(spend_category_id);
create index if not exists idx_fin_pipeline_cross_border
    on fin.transaction_pipeline(tenant_id, is_cross_border)
    where is_cross_border = true;

-- ============================================================================
-- fin.policy_module — Registered policy modules
-- ============================================================================
create table if not exists fin.policy_module (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    module_id       varchar(20) not null,
    module_name     varchar(100) not null,
    module_version  varchar(20) not null,
    scope           text not null,
    status          varchar(20) not null default 'ACTIVE'
                    check (status in ('ACTIVE','DRAFT','DEPRECATED')),
    config_hash     varchar(64) not null,
    config          jsonb not null default '{}',
    is_extensible   boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_policy_module unique (tenant_id, module_id, module_version)
);

create index if not exists idx_fin_policy_module_tenant on fin.policy_module(tenant_id);

-- ============================================================================
-- fin.policy_evaluation_log — Immutable policy decision log (MC-5)
-- ============================================================================
create table if not exists fin.policy_evaluation_log (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    txn_id          uuid not null,
    pipeline_id     uuid not null references fin.transaction_pipeline(id),
    module_id       varchar(20) not null,
    module_version  varchar(20) not null,
    config_hash     varchar(64) not null,
    score           decimal(3,2) not null,
    action          varchar(20) not null
                    check (action in ('APPROVE','REVIEW','ESCALATE','BLOCK')),
    conditions      jsonb default '[]',
    approvers       jsonb default '[]',
    sla_hours       integer,
    explanation     text not null,
    confidence      decimal(3,2),
    evaluated_at    timestamptz not null default now()
);

create index if not exists idx_fin_policy_eval_txn on fin.policy_evaluation_log(txn_id);
create index if not exists idx_fin_policy_eval_pipeline on fin.policy_evaluation_log(pipeline_id);

-- ============================================================================
-- fin.smart_default_rule — Configurable smart default rules
-- ============================================================================
create table if not exists fin.smart_default_rule (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    field_name      varchar(50) not null,
    source          varchar(50) not null,
    method          varchar(20) not null
                    check (method in ('RULES_ENGINE','ML_FALLBACK','DIRECT_LOOKUP')),
    priority        integer not null default 0,
    conditions      jsonb not null default '{}',
    resolution      jsonb not null default '{}',
    is_active       boolean not null default true,
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_smart_default_tenant on fin.smart_default_rule(tenant_id);
create index if not exists idx_fin_smart_default_field on fin.smart_default_rule(tenant_id, field_name);

-- ============================================================================
-- fin.exception — Exception/override objects (Section 14)
-- ============================================================================
create table if not exists fin.exception (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    exception_id    uuid not null unique,
    scope_type      varchar(30) not null
                    check (scope_type in ('txn_id','doc_id','ou_id','funding_profile_id','policy_module_id','vendor_id')),
    scope_id        uuid not null,
    txn_id          uuid,

    requested_by    uuid not null,
    requested_at    timestamptz not null default now(),
    reason_code     varchar(50) not null,
    reason_text     text not null,

    policy_overrides jsonb default '[]',
    funding_override jsonb,

    valid_from      timestamptz not null,
    valid_to        timestamptz not null,
    status          varchar(20) not null default 'REQUESTED'
                    check (status in ('REQUESTED','REVIEWED','APPROVED','REJECTED','APPLIED','EXPIRED','REVOKED')),

    approvers       jsonb default '[]',
    audit_tags      text[] default '{}',

    applied_at      timestamptz,
    expired_at      timestamptz,
    revoked_at      timestamptz,
    revoked_by      uuid,
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_exception_tenant on fin.exception(tenant_id);
create index if not exists idx_fin_exception_scope on fin.exception(scope_type, scope_id);
create index if not exists idx_fin_exception_status on fin.exception(status);
create index if not exists idx_fin_exception_validity on fin.exception(valid_from, valid_to);
