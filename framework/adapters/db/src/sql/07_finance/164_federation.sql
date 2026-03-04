/* ============================================================================
   Athyper v2.1 — Federation Engine (Multi-Entity, FX, Intercompany, Consolidation)
   Schema: fin
   Dependencies: core.tenant, ref.currency, ref.country, fin.journal_entry
   ============================================================================ */

-- ============================================================================
-- fin.legal_entity — Legal entity registry
-- ============================================================================
create table if not exists fin.legal_entity (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    code            varchar(20) not null,
    name            varchar(200) not null,
    country_code    varchar(2) not null references ref.country(code2),
    functional_currency varchar(3) not null references ref.currency(code),
    reporting_currency  varchar(3) not null references ref.currency(code),
    entity_type     varchar(20) not null
                    check (entity_type in ('PARENT','SUBSIDIARY','ASSOCIATE','JOINT_VENTURE','BRANCH')),
    parent_entity_id uuid references fin.legal_entity(id),
    consolidation_method varchar(20) not null default 'FULL'
                    check (consolidation_method in ('FULL','PROPORTIONAL','EQUITY','NONE')),
    ownership_pct   decimal(5,2),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_legal_entity unique (tenant_id, code)
);

create index if not exists idx_fin_legal_entity_tenant on fin.legal_entity(tenant_id);
create index if not exists idx_fin_legal_entity_parent on fin.legal_entity(parent_entity_id);

-- ============================================================================
-- fin.intercompany_agreement — IC trading relationships
-- ============================================================================
create table if not exists fin.intercompany_agreement (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    source_entity_code varchar(20) not null,
    dest_entity_code   varchar(20) not null,
    agreement_type  varchar(20) not null
                    check (agreement_type in ('GOODS','SERVICES','LOAN','ROYALTY','MANAGEMENT_FEE')),
    transfer_pricing_method varchar(30) not null
                    check (transfer_pricing_method in ('CUP','RESALE_MINUS','COST_PLUS','TNMM','PROFIT_SPLIT')),
    markup_pct      decimal(8,4),
    effective_from  date not null,
    effective_to    date,
    is_active       boolean not null default true,

    constraint uq_fin_ic_agreement unique (tenant_id, source_entity_code, dest_entity_code, agreement_type)
);

create index if not exists idx_fin_ic_agreement_tenant on fin.intercompany_agreement(tenant_id);

-- ============================================================================
-- fin.intercompany_transaction — IC transaction pairs
-- ============================================================================
create table if not exists fin.intercompany_transaction (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    source_entity_code varchar(20) not null,
    dest_entity_code   varchar(20) not null,
    source_doc_id   uuid,
    dest_doc_id     uuid,
    txn_type        varchar(20) not null
                    check (txn_type in ('SALE','PURCHASE','LOAN','RECHARGE','DIVIDEND')),
    amount          decimal(18,4) not null,
    currency_code   varchar(3) not null,
    transfer_price  decimal(18,4),
    arm_length_price decimal(18,4),
    source_je_id    uuid,           -- FK added in 190_posting.sql (forward dependency)
    dest_je_id      uuid,           -- FK added in 190_posting.sql (forward dependency)
    netting_batch_id uuid,
    status          varchar(20) not null default 'CREATED'
                    check (status in ('CREATED','MIRRORED','PRICED','POSTED','NETTED','SETTLED')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_fin_ic_txn_tenant on fin.intercompany_transaction(tenant_id);
create index if not exists idx_fin_ic_txn_source on fin.intercompany_transaction(source_entity_code);
create index if not exists idx_fin_ic_txn_dest on fin.intercompany_transaction(dest_entity_code);
create index if not exists idx_fin_ic_txn_netting on fin.intercompany_transaction(netting_batch_id)
    where netting_batch_id is not null;

-- ============================================================================
-- fin.fx_rate — Exchange rate table
-- ============================================================================
create table if not exists fin.fx_rate (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    from_currency   varchar(3) not null,
    to_currency     varchar(3) not null,
    rate_type       varchar(20) not null
                    check (rate_type in ('SPOT','PERIOD_AVG','PERIOD_END','BUDGET')),
    rate            decimal(18,10) not null,
    effective_date  date not null,
    source          varchar(50),

    constraint uq_fin_fx_rate unique (tenant_id, from_currency, to_currency, rate_type, effective_date)
);

create index if not exists idx_fin_fx_rate_pair on fin.fx_rate(tenant_id, from_currency, to_currency);
create index if not exists idx_fin_fx_rate_date on fin.fx_rate(effective_date);

-- ============================================================================
-- fin.fx_revaluation — Unrealized FX gain/loss
-- ============================================================================
create table if not exists fin.fx_revaluation (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    account_id      uuid not null,  -- FK added in 190_posting.sql (forward dependency)
    original_currency varchar(3) not null,
    functional_currency varchar(3) not null,
    original_amount decimal(18,4) not null,
    original_functional_amount decimal(18,4) not null,
    revalued_functional_amount decimal(18,4) not null,
    unrealized_gain_loss decimal(18,4) not null,
    revaluation_date date not null,
    fiscal_year     smallint not null,
    period_number   smallint not null,
    reference_je_id uuid,           -- FK added in 190_posting.sql (forward dependency)
    auto_reversed   boolean not null default false
);

create index if not exists idx_fin_fx_reval_tenant on fin.fx_revaluation(tenant_id, entity_code);
create index if not exists idx_fin_fx_reval_period on fin.fx_revaluation(fiscal_year, period_number);

-- ============================================================================
-- fin.consolidation_elimination — IC elimination entries
-- ============================================================================
create table if not exists fin.consolidation_elimination (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    fiscal_year     smallint not null,
    period_number   smallint not null,
    elimination_type varchar(30) not null
                    check (elimination_type in ('IC_REVENUE_EXPENSE','IC_RECEIVABLE_PAYABLE','IC_PROFIT','MINORITY_INTEREST','INVESTMENT')),
    source_entity_code varchar(20) not null,
    dest_entity_code   varchar(20) not null,
    amount          decimal(18,4) not null,
    currency_code   varchar(3) not null,
    reference_je_id uuid,           -- FK added in 190_posting.sql (forward dependency)
    status          varchar(20) not null default 'CALCULATED'
                    check (status in ('CALCULATED','POSTED','REVIEWED')),
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_consol_elim_tenant on fin.consolidation_elimination(tenant_id);
create index if not exists idx_fin_consol_elim_period on fin.consolidation_elimination(fiscal_year, period_number);

-- ============================================================================
-- fin.netting_batch — IC netting batches
-- ============================================================================
create table if not exists fin.netting_batch (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    batch_date      date not null,
    entity_pair     text not null,
    gross_amount    decimal(18,4) not null,
    net_amount      decimal(18,4) not null,
    currency_code   varchar(3) not null,
    status          varchar(20) not null default 'PROPOSED'
                    check (status in ('PROPOSED','APPROVED','SETTLED')),
    settlement_je_ids uuid[],
    created_at      timestamptz not null default now()
);

create index if not exists idx_fin_netting_tenant on fin.netting_batch(tenant_id);
create index if not exists idx_fin_netting_status on fin.netting_batch(status);
