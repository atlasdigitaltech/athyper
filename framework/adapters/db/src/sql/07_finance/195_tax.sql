/* ============================================================================
   Athyper v2.1 — Tax & Withholding Engine
   Schema: fin
   Dependencies: core.tenant, ref.currency, ref.country, fin.commitment
   ============================================================================ */

-- ============================================================================
-- fin.tax_jurisdiction — Tax jurisdiction registry
-- ============================================================================
create table if not exists fin.tax_jurisdiction (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    code            varchar(20) not null,
    name            varchar(200) not null,
    country_code    varchar(2) not null references ref.country(code2),
    state_region_code varchar(10),
    jurisdiction_type varchar(20) not null
                    check (jurisdiction_type in ('COUNTRY','STATE','CITY','SPECIAL_ZONE')),
    parent_id       uuid references fin.tax_jurisdiction(id),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),

    constraint uq_fin_tax_juris_code unique (tenant_id, code)
);

create index if not exists idx_fin_tax_juris_tenant on fin.tax_jurisdiction(tenant_id);
create index if not exists idx_fin_tax_juris_country on fin.tax_jurisdiction(country_code);

-- ============================================================================
-- fin.tax_rate — Tax rate master (per jurisdiction + category)
-- ============================================================================
create table if not exists fin.tax_rate (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    jurisdiction_id uuid not null references fin.tax_jurisdiction(id),
    tax_type        varchar(20) not null
                    check (tax_type in ('VAT','GST','SALES_TAX','WHT','EXCISE','CUSTOMS')),
    tax_code        varchar(20) not null,
    rate            decimal(8,4) not null,
    description     varchar(200),
    effective_from  date not null,
    effective_to    date,
    category_filter jsonb,
    is_reverse_charge boolean not null default false,
    treaty_rate     decimal(8,4),
    created_at      timestamptz not null default now(),

    constraint uq_fin_tax_rate unique (tenant_id, jurisdiction_id, tax_code, effective_from)
);

create index if not exists idx_fin_tax_rate_juris on fin.tax_rate(jurisdiction_id);
create index if not exists idx_fin_tax_rate_type on fin.tax_rate(tenant_id, tax_type);
create index if not exists idx_fin_tax_rate_effective on fin.tax_rate(effective_from, effective_to);

-- ============================================================================
-- fin.tax_calculation — Computed tax per transaction
-- ============================================================================
create table if not exists fin.tax_calculation (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    txn_id          uuid not null,
    doc_id          uuid not null,
    commitment_id   uuid references fin.commitment(id),
    line_item_index smallint,
    jurisdiction_id uuid not null references fin.tax_jurisdiction(id),
    tax_type        varchar(20) not null,
    tax_code        varchar(20) not null,
    base_amount     decimal(18,4) not null,
    tax_rate        decimal(8,4) not null,
    tax_amount      decimal(18,4) not null,
    currency_code   varchar(3) not null,
    is_reverse_charge boolean not null default false,
    is_wht          boolean not null default false,
    wht_certificate_no varchar(50),
    is_input_credit_eligible boolean not null default false,
    calculated_at   timestamptz not null default now()
);

create index if not exists idx_fin_tax_calc_txn on fin.tax_calculation(tenant_id, txn_id);
create index if not exists idx_fin_tax_calc_doc on fin.tax_calculation(tenant_id, doc_id);
create index if not exists idx_fin_tax_calc_commitment on fin.tax_calculation(commitment_id);

-- ============================================================================
-- fin.tax_credit_ledger — Input tax credit tracking
-- ============================================================================
create table if not exists fin.tax_credit_ledger (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    jurisdiction_id uuid not null references fin.tax_jurisdiction(id),
    fiscal_year     smallint not null,
    period_number   smallint not null,
    input_credits   decimal(18,4) not null default 0,
    output_liability decimal(18,4) not null default 0,
    net_position    decimal(18,4) generated always as (input_credits - output_liability) stored,
    reconciled      boolean not null default false,
    reconciled_at   timestamptz,
    created_at      timestamptz not null default now(),

    constraint uq_fin_tax_credit_ledger unique (tenant_id, entity_code, jurisdiction_id, fiscal_year, period_number)
);

create index if not exists idx_fin_tax_credit_entity on fin.tax_credit_ledger(tenant_id, entity_code);
