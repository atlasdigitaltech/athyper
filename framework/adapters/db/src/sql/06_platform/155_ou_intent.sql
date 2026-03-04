/* ============================================================================
   Athyper v2.1 — Operating Unit Lifecycle + Business Intent
   Schema: fin
   Dependencies: core.tenant, core.organizational_unit, ref.currency
   ============================================================================ */

-- ============================================================================
-- fin.operating_unit — Finance-scoped Operating Unit
-- ============================================================================
create table if not exists fin.operating_unit (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    org_unit_id     uuid not null references core.organizational_unit(id),
    entity_code     varchar(20) not null,
    code            varchar(50) not null,
    name            varchar(200) not null,
    description     text,
    parent_id       uuid references fin.operating_unit(id),
    level           smallint not null default 1,

    -- Status lifecycle: DRAFT → ACTIVE → UNDER_REVIEW → SUNSET → ARCHIVED
    status          varchar(20) not null default 'DRAFT'
                    check (status in ('DRAFT','ACTIVE','UNDER_REVIEW','SUNSET','ARCHIVED')),
    activated_at    timestamptz,
    sunset_at       timestamptz,
    archived_at     timestamptz,

    -- Defaults
    default_fp_id           uuid,
    default_cost_center_id  uuid,
    default_profit_center_id uuid,
    default_currency_code   varchar(3) references ref.currency(code),

    -- Inheritance
    inherit_from_parent boolean not null default true,

    -- Approval + Classification policy
    default_approval_template_id uuid,                   -- base approval routing for this OU
    require_classification       boolean not null default false,  -- OU-level: must provide category

    -- Metadata
    metadata        jsonb default '{}',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_ou_code unique (tenant_id, entity_code, code),
    constraint chk_fin_ou_level check (level between 1 and 3)
);

-- Migration: add columns to existing table
alter table fin.operating_unit add column if not exists default_approval_template_id uuid;
alter table fin.operating_unit add column if not exists require_classification boolean not null default false;

create index if not exists idx_fin_ou_tenant on fin.operating_unit(tenant_id);
create index if not exists idx_fin_ou_parent on fin.operating_unit(parent_id);
create index if not exists idx_fin_ou_org_unit on fin.operating_unit(org_unit_id);
create index if not exists idx_fin_ou_status on fin.operating_unit(tenant_id, status);
create index if not exists idx_fin_ou_require_class
    on fin.operating_unit(tenant_id) where require_classification = true;

-- ============================================================================
-- fin.business_intent — Business Intent ontology
-- ============================================================================
create table if not exists fin.business_intent (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    code            varchar(50) not null,
    name            varchar(200) not null,
    description     text,
    domain          varchar(50) not null
                    check (domain in ('OPEX','CAPEX','REVENUE','TRANSFER','REGULATORY','ADMIN')),
    subtype         varchar(50),
    parent_id       uuid references fin.business_intent(id),

    -- Caps & Visibility
    requires_approval           boolean not null default true,
    max_auto_approve_amount     decimal(18,4),
    max_auto_approve_currency   varchar(3),
    visibility      varchar(20) not null default 'STANDARD'
                    check (visibility in ('STANDARD','RESTRICTED','CONFIDENTIAL')),

    -- Default mappings (Smart Defaults source)
    default_gl_account              varchar(20),
    default_tax_code                varchar(20),
    default_asset_profile_code      varchar(50),
    default_accounting_profile_code varchar(50),

    -- Classification affinity (for analytics + validation)
    commodity_domain_affinities  text[],                 -- e.g., {'unspsc:43','unspsc:44'} for CAPEX-IT

    is_active       boolean not null default true,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_intent_code unique (tenant_id, code)
);

-- Migration: add column to existing table
alter table fin.business_intent add column if not exists commodity_domain_affinities text[];

create index if not exists idx_fin_intent_tenant on fin.business_intent(tenant_id);
create index if not exists idx_fin_intent_domain on fin.business_intent(tenant_id, domain);
create index if not exists idx_fin_intent_parent on fin.business_intent(parent_id);

-- ============================================================================
-- fin.ou_intent_mapping — Which intents are available per OU
-- ============================================================================
create table if not exists fin.ou_intent_mapping (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    ou_id           uuid not null references fin.operating_unit(id) on delete cascade,
    intent_id       uuid not null references fin.business_intent(id) on delete cascade,
    is_default      boolean not null default false,
    override_fp_id  uuid,
    override_approval_template_id uuid,                  -- OU+Intent specific approval override
    override_compliance_checks    text[],                -- additional compliance for this combination
    notes                         text,                  -- admin notes for this mapping
    created_at      timestamptz not null default now(),

    constraint uq_fin_ou_intent unique (tenant_id, ou_id, intent_id)
);

-- Migration: add columns to existing table
alter table fin.ou_intent_mapping add column if not exists override_approval_template_id uuid;
alter table fin.ou_intent_mapping add column if not exists override_compliance_checks text[];
alter table fin.ou_intent_mapping add column if not exists notes text;

create index if not exists idx_fin_ou_intent_ou on fin.ou_intent_mapping(ou_id);
create index if not exists idx_fin_ou_intent_intent on fin.ou_intent_mapping(intent_id);
