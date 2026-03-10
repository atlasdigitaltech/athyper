/* ============================================================================
   Athyper v2.1 — Bank Reconciliation
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.payment_entry
   ============================================================================ */

-- ============================================================================
-- fin.bank_statement — Imported bank statement header
-- ============================================================================
create table if not exists fin.bank_statement (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,

    -- Identity
    statement_number    varchar(100) not null,
    bank_account_id     uuid not null,
    bank_name           varchar(200),

    -- Period
    statement_date      date not null,
    period_start        date not null,
    period_end          date not null,

    -- Balances
    opening_balance     decimal(18,4) not null,
    closing_balance     decimal(18,4) not null,
    currency_code       varchar(3) not null references ref.currency(code),

    -- Import metadata
    source              varchar(50) not null default 'MANUAL'
                        check (source in ('MANUAL','CSV','OFX','MT940','API')),

    -- Status
    status              varchar(20) not null default 'IMPORTED'
                        check (status in ('IMPORTED','IN_PROGRESS','COMPLETED','CANCELLED')),

    line_count          integer not null default 0,

    -- Audit
    imported_by         uuid,
    imported_at         timestamptz not null default now(),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint uq_fin_bs_number unique (tenant_id, entity_code, statement_number)
);

create index if not exists idx_fin_bs_tenant on fin.bank_statement(tenant_id);
create index if not exists idx_fin_bs_bank on fin.bank_statement(tenant_id, bank_account_id);
create index if not exists idx_fin_bs_status on fin.bank_statement(tenant_id, entity_code, status);
create index if not exists idx_fin_bs_date on fin.bank_statement(tenant_id, entity_code, statement_date desc);

-- ============================================================================
-- fin.bank_statement_line — Individual transactions on a bank statement
-- ============================================================================
create table if not exists fin.bank_statement_line (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    statement_id        uuid not null references fin.bank_statement(id) on delete cascade,
    line_no             smallint not null,

    -- Transaction details
    transaction_date    date not null,
    value_date          date,
    amount              decimal(18,4) not null,
    direction           varchar(6) not null check (direction in ('DEBIT','CREDIT')),
    reference           varchar(200),
    description         text,
    counterparty        varchar(200),

    -- Matching
    match_status        varchar(20) not null default 'UNMATCHED'
                        check (match_status in ('UNMATCHED','AUTO_MATCHED','MANUAL_MATCHED','CONFIRMED','EXCLUDED')),
    match_confidence    decimal(5,2),
    matched_payment_id  uuid references fin.payment_entry(id),
    matched_at          timestamptz,
    matched_by          uuid,

    -- Metadata
    bank_reference      varchar(100),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint uq_fin_bsl_line unique (tenant_id, statement_id, line_no)
);

create index if not exists idx_fin_bsl_statement on fin.bank_statement_line(statement_id);
create index if not exists idx_fin_bsl_match_status on fin.bank_statement_line(statement_id, match_status);
create index if not exists idx_fin_bsl_payment on fin.bank_statement_line(matched_payment_id)
    where matched_payment_id is not null;
create index if not exists idx_fin_bsl_date on fin.bank_statement_line(tenant_id, transaction_date);

-- ============================================================================
-- fin.reconciliation_session — Tracks a reconciliation work session
-- ============================================================================
create table if not exists fin.reconciliation_session (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    statement_id        uuid not null references fin.bank_statement(id),

    -- Status
    status              varchar(20) not null default 'OPEN'
                        check (status in ('OPEN','COMPLETED','CANCELLED')),

    -- Counts
    total_lines         integer not null default 0,
    auto_matched        integer not null default 0,
    manual_matched      integer not null default 0,
    unmatched           integer not null default 0,
    excluded            integer not null default 0,

    -- Discrepancy (statement closing - computed balance)
    discrepancy         decimal(18,4) not null default 0,

    -- Audit
    started_by          uuid,
    started_at          timestamptz not null default now(),
    completed_by        uuid,
    completed_at        timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint uq_fin_recon_statement unique (tenant_id, statement_id)
);

create index if not exists idx_fin_recon_statement on fin.reconciliation_session(statement_id);
create index if not exists idx_fin_recon_status on fin.reconciliation_session(tenant_id, status);
