/* ============================================================================
   Athyper v2.1 — FX Revaluation Run & Lines
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.operating_unit,
                 fin.chart_of_accounts, fin.journal_entry, wf.approval_instance

   Period-end foreign currency revaluation — recognizes unrealized FX gains
   and losses on open balances denominated in foreign currencies.
   Applies to AR, AP, bank accounts, and intercompany balances.
   ============================================================================ */

-- ============================================================================
-- fin.fx_revaluation_run — FX revaluation batch header
-- ============================================================================
create table if not exists fin.fx_revaluation_run (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    revaluation_code    varchar(50) not null,
    description         text,

    -- Period context
    period_code         varchar(20) not null,
    revaluation_date    date not null,
    posting_date        date,

    -- Rate source
    rate_source         varchar(30) not null default 'ECB'
                        check (rate_source in ('ECB','REUTERS','BLOOMBERG','MANUAL','CENTRAL_BANK','CUSTOM')),

    -- OU context
    ou_id               uuid not null references fin.operating_unit(id),

    -- Functional currency
    functional_currency_code varchar(3) not null references ref.currency(code),

    -- Aggregated amounts (MC-4: DECIMAL only)
    total_gain          decimal(18,4) not null default 0,
    total_loss          decimal(18,4) not null default 0,
    net_amount          decimal(18,4) not null default 0,
    line_count          integer not null default 0,

    -- Status lifecycle: DRAFT -> CALCULATED -> APPROVED -> POSTED -> REVERSED
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','CALCULATED','APPROVED','POSTED','REVERSED')),

    -- Decision Grid audit
    decision_score      decimal(5,4),
    approval_route      varchar(20)
                        check (approval_route is null or approval_route in
                               ('ZERO_APPROVAL','STANDARD','ENHANCED','EXECUTIVE','BLOCKED')),

    -- Workflow link
    approval_instance_id uuid,

    -- Posting link
    je_id               uuid,
    posted_at           timestamptz,
    posted_by           uuid,

    -- Reversal link
    reversal_je_id      uuid,
    reversed_at         timestamptz,
    reversed_by         uuid,

    -- Idempotency
    idempotency_key     varchar(200),

    -- Optimistic concurrency
    version             integer not null default 1,

    -- Audit
    calculated_at       timestamptz,
    calculated_by       uuid,
    approved_at         timestamptz,
    approved_by         uuid,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Constraints
    constraint chk_fin_fxr_gain_gte_zero check (total_gain >= 0),
    constraint chk_fin_fxr_loss_gte_zero check (total_loss >= 0),

    -- Unique revaluation code per entity
    constraint uq_fin_fxr_code unique (tenant_id, entity_code, revaluation_code)
);

-- Idempotency
create unique index if not exists uidx_fin_fxr_idempotency
    on fin.fx_revaluation_run(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Common query patterns
create index if not exists idx_fin_fxr_tenant on fin.fx_revaluation_run(tenant_id);
create index if not exists idx_fin_fxr_status on fin.fx_revaluation_run(tenant_id, entity_code, status);
create index if not exists idx_fin_fxr_txn on fin.fx_revaluation_run(txn_id);
create index if not exists idx_fin_fxr_je on fin.fx_revaluation_run(je_id) where je_id is not null;
create index if not exists idx_fin_fxr_period on fin.fx_revaluation_run(tenant_id, entity_code, period_code);
create index if not exists idx_fin_fxr_date on fin.fx_revaluation_run(tenant_id, entity_code, revaluation_date desc);
create index if not exists idx_fin_fxr_approval on fin.fx_revaluation_run(approval_instance_id)
    where approval_instance_id is not null;

-- ============================================================================
-- fin.fx_revaluation_line — Per-account/currency revaluation detail
-- ============================================================================
create table if not exists fin.fx_revaluation_line (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    run_id              uuid not null references fin.fx_revaluation_run(id) on delete cascade,
    line_no             smallint not null,

    -- Account being revalued
    account_id          uuid not null references fin.chart_of_accounts(id),
    currency_code       varchar(3) not null references ref.currency(code),

    -- Balance context
    original_amount     decimal(18,4) not null,
    original_rate       decimal(12,6) not null,
    new_rate            decimal(12,6) not null,

    -- Revalued result
    revalued_amount     decimal(18,4) not null,
    gain_loss_amount    decimal(18,4) not null,

    -- Classification
    balance_type        varchar(20) not null
                        check (balance_type in ('AR','AP','BANK','INTERCOMPANY','OTHER')),

    -- Counterparty (optional — for AR/AP lines)
    counterparty_id     uuid,
    counterparty_type   varchar(20)
                        check (counterparty_type is null or counterparty_type in
                               ('SUPPLIER','CUSTOMER','INTERCOMPANY')),

    -- Metadata
    created_at          timestamptz not null default now(),

    constraint uq_fin_fxr_line unique (tenant_id, run_id, line_no)
);

create index if not exists idx_fin_fxr_line_run on fin.fx_revaluation_line(run_id);
create index if not exists idx_fin_fxr_line_account on fin.fx_revaluation_line(account_id);
create index if not exists idx_fin_fxr_line_currency on fin.fx_revaluation_line(currency_code);

-- ============================================================================
-- Deferred FKs
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fxr_je') THEN
        ALTER TABLE fin.fx_revaluation_run
            ADD CONSTRAINT fk_fxr_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fxr_reversal_je') THEN
        ALTER TABLE fin.fx_revaluation_run
            ADD CONSTRAINT fk_fxr_reversal_je FOREIGN KEY (reversal_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fxr_approval_instance') THEN
        ALTER TABLE fin.fx_revaluation_run
            ADD CONSTRAINT fk_fxr_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
END
$$;
