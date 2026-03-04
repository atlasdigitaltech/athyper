/* ============================================================================
   Athyper v2.1 — Posting Engine (General Ledger, Journal Entries, Period Control)
   Schema: fin
   Dependencies: core.tenant, ref.currency
   ============================================================================ */

-- ============================================================================
-- fin.chart_of_accounts — GL account master
-- ============================================================================
create table if not exists fin.chart_of_accounts (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    account_code    varchar(20) not null,
    account_name    varchar(200) not null,
    account_type    varchar(20) not null
                    check (account_type in ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    normal_balance  varchar(10) not null
                    check (normal_balance in ('DEBIT','CREDIT')),
    parent_id       uuid references fin.chart_of_accounts(id),
    level           smallint not null default 1,
    is_group        boolean not null default false,
    is_active       boolean not null default true,
    allow_direct_posting boolean not null default true,
    subledger_type  varchar(20)
                    check (subledger_type is null or subledger_type in ('AP','AR','ASSET','INVENTORY','WIP','COMMISSION')),
    currency_code   varchar(3) references ref.currency(code),
    tags            jsonb default '[]',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_coa_code unique (tenant_id, entity_code, account_code)
);

create index if not exists idx_fin_coa_tenant on fin.chart_of_accounts(tenant_id);
create index if not exists idx_fin_coa_type on fin.chart_of_accounts(tenant_id, account_type);
create index if not exists idx_fin_coa_parent on fin.chart_of_accounts(parent_id);
create index if not exists idx_fin_coa_subledger on fin.chart_of_accounts(subledger_type)
    where subledger_type is not null;

-- ============================================================================
-- fin.cost_center — Cost center master
-- ============================================================================
create table if not exists fin.cost_center (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    code            varchar(20) not null,
    name            varchar(200) not null,
    parent_id       uuid references fin.cost_center(id),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),

    constraint uq_fin_cc_code unique (tenant_id, entity_code, code)
);

create index if not exists idx_fin_cc_tenant on fin.cost_center(tenant_id);

-- ============================================================================
-- fin.profit_center — Profit center master
-- ============================================================================
create table if not exists fin.profit_center (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    code            varchar(20) not null,
    name            varchar(200) not null,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),

    constraint uq_fin_pc_code unique (tenant_id, entity_code, code)
);

create index if not exists idx_fin_pc_tenant on fin.profit_center(tenant_id);

-- ============================================================================
-- fin.fiscal_period — Period control
-- ============================================================================
create table if not exists fin.fiscal_period (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    fiscal_year     smallint not null,
    period_number   smallint not null,
    period_name     varchar(50) not null,
    start_date      date not null,
    end_date        date not null,
    status          varchar(20) not null default 'FUTURE'
                    check (status in ('FUTURE','OPEN','SOFT_CLOSE','HARD_CLOSE')),
    opened_at       timestamptz,
    soft_closed_at  timestamptz,
    hard_closed_at  timestamptz,
    closed_by       uuid,
    created_at      timestamptz not null default now(),

    constraint uq_fin_period unique (tenant_id, entity_code, fiscal_year, period_number)
);

create index if not exists idx_fin_period_tenant on fin.fiscal_period(tenant_id, entity_code);
create index if not exists idx_fin_period_status on fin.fiscal_period(status);

-- ============================================================================
-- fin.accounting_profile — Hidden posting intelligence templates
-- ============================================================================
create table if not exists fin.accounting_profile (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    code            varchar(50) not null,
    name            varchar(200) not null,
    description     text,
    intent_filter   jsonb,
    category_filter jsonb,
    posting_pattern jsonb not null,
    is_active       boolean not null default true,
    version         integer not null default 1,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_acct_profile unique (tenant_id, entity_code, code)
);

create index if not exists idx_fin_acct_profile_tenant on fin.accounting_profile(tenant_id);

-- ============================================================================
-- fin.journal_entry — Journal entry header
-- ============================================================================
create table if not exists fin.journal_entry (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    je_number       varchar(50) not null,
    txn_id          uuid not null,
    doc_id          uuid not null,
    doc_type        varchar(20) not null,
    accounting_profile_id uuid references fin.accounting_profile(id),
    fiscal_year     smallint not null,
    period_number   smallint not null,
    posting_date    date not null,
    description     text,
    status          varchar(20) not null default 'CREATED'
                    check (status in ('CREATED','POSTED','REVERSED')),
    total_debit     decimal(18,4) not null,
    total_credit    decimal(18,4) not null,
    currency_code   varchar(3) not null references ref.currency(code),
    is_reversal     boolean not null default false,
    reversal_of_id  uuid references fin.journal_entry(id),
    reversed_by_id  uuid references fin.journal_entry(id),
    posted_by       uuid,
    posted_at       timestamptz,
    created_at      timestamptz not null default now(),

    constraint uq_fin_je_number unique (tenant_id, entity_code, je_number),
    constraint chk_fin_je_balanced check (total_debit = total_credit)
);

create index if not exists idx_fin_je_tenant on fin.journal_entry(tenant_id);
create index if not exists idx_fin_je_txn on fin.journal_entry(txn_id);
create index if not exists idx_fin_je_doc on fin.journal_entry(doc_id);
create index if not exists idx_fin_je_period on fin.journal_entry(tenant_id, entity_code, fiscal_year, period_number);
create index if not exists idx_fin_je_status on fin.journal_entry(status);

-- ============================================================================
-- fin.journal_line — Journal entry line items
-- ============================================================================
create table if not exists fin.journal_line (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    je_id           uuid not null references fin.journal_entry(id) on delete cascade,
    line_no         smallint not null,
    account_id      uuid not null references fin.chart_of_accounts(id),
    cost_center_id  uuid references fin.cost_center(id),
    profit_center_id uuid references fin.profit_center(id),
    debit_amount    decimal(18,4) not null default 0,
    credit_amount   decimal(18,4) not null default 0,
    currency_code   varchar(3) not null,
    description     text,
    subledger_type  varchar(20),
    subledger_ref_id uuid,
    tags            jsonb default '[]',

    constraint uq_fin_je_line unique (tenant_id, je_id, line_no),
    constraint chk_fin_je_line_amounts check (debit_amount >= 0 and credit_amount >= 0),
    constraint chk_fin_je_line_side check (not (debit_amount > 0 and credit_amount > 0))
);

create index if not exists idx_fin_je_line_je on fin.journal_line(je_id);
create index if not exists idx_fin_je_line_account on fin.journal_line(account_id);
create index if not exists idx_fin_je_line_subledger on fin.journal_line(subledger_type, subledger_ref_id)
    where subledger_type is not null;

-- ============================================================================
-- fin.gl_balance — GL account balances (projection, denormalized)
-- ============================================================================
create table if not exists fin.gl_balance (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    account_id      uuid not null references fin.chart_of_accounts(id),
    fiscal_year     smallint not null,
    period_number   smallint not null,
    cost_center_id  uuid references fin.cost_center(id),
    currency_code   varchar(3) not null,
    opening_debit   decimal(18,4) not null default 0,
    opening_credit  decimal(18,4) not null default 0,
    period_debit    decimal(18,4) not null default 0,
    period_credit   decimal(18,4) not null default 0,
    closing_debit   decimal(18,4) not null default 0,
    closing_credit  decimal(18,4) not null default 0,
    updated_at      timestamptz not null default now(),

    constraint uq_fin_gl_balance unique (tenant_id, entity_code, account_id, fiscal_year, period_number, cost_center_id, currency_code)
);

create index if not exists idx_fin_gl_balance_account on fin.gl_balance(tenant_id, entity_code, account_id);
create index if not exists idx_fin_gl_balance_period on fin.gl_balance(tenant_id, entity_code, fiscal_year, period_number);

-- ============================================================================
-- Deferred FKs — tables created in 161–165 that reference fin.journal_entry
-- or fin.chart_of_accounts (forward dependencies resolved here)
-- ============================================================================
DO $$
BEGIN
    -- 161_asset: asset_transaction.reference_je_id
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_asset_txn_je') THEN
        ALTER TABLE fin.asset_transaction
            ADD CONSTRAINT fk_asset_txn_je FOREIGN KEY (reference_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 162_inventory: inventory_movement.reference_je_id
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inv_movement_je') THEN
        ALTER TABLE fin.inventory_movement
            ADD CONSTRAINT fk_inv_movement_je FOREIGN KEY (reference_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 162_inventory: stocktake.variance_je_id
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stocktake_je') THEN
        ALTER TABLE fin.stocktake
            ADD CONSTRAINT fk_stocktake_je FOREIGN KEY (variance_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 163_commission: commission_calculation JE columns
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_commission_accrual_je') THEN
        ALTER TABLE fin.commission_calculation
            ADD CONSTRAINT fk_commission_accrual_je FOREIGN KEY (accrual_je_id) REFERENCES fin.journal_entry(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_commission_settlement_je') THEN
        ALTER TABLE fin.commission_calculation
            ADD CONSTRAINT fk_commission_settlement_je FOREIGN KEY (settlement_je_id) REFERENCES fin.journal_entry(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_commission_clawback_je') THEN
        ALTER TABLE fin.commission_calculation
            ADD CONSTRAINT fk_commission_clawback_je FOREIGN KEY (clawback_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 164_federation: intercompany_transaction JE columns
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ic_txn_source_je') THEN
        ALTER TABLE fin.intercompany_transaction
            ADD CONSTRAINT fk_ic_txn_source_je FOREIGN KEY (source_je_id) REFERENCES fin.journal_entry(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ic_txn_dest_je') THEN
        ALTER TABLE fin.intercompany_transaction
            ADD CONSTRAINT fk_ic_txn_dest_je FOREIGN KEY (dest_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 164_federation: fx_revaluation
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fx_reval_account') THEN
        ALTER TABLE fin.fx_revaluation
            ADD CONSTRAINT fk_fx_reval_account FOREIGN KEY (account_id) REFERENCES fin.chart_of_accounts(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fx_reval_je') THEN
        ALTER TABLE fin.fx_revaluation
            ADD CONSTRAINT fk_fx_reval_je FOREIGN KEY (reference_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 164_federation: consolidation_elimination
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consol_elim_je') THEN
        ALTER TABLE fin.consolidation_elimination
            ADD CONSTRAINT fk_consol_elim_je FOREIGN KEY (reference_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 165_production: work_order_cost
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wo_cost_je') THEN
        ALTER TABLE fin.work_order_cost
            ADD CONSTRAINT fk_wo_cost_je FOREIGN KEY (reference_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- 165_production: production_variance
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_prod_var_je') THEN
        ALTER TABLE fin.production_variance
            ADD CONSTRAINT fk_prod_var_je FOREIGN KEY (reference_je_id) REFERENCES fin.journal_entry(id);
    END IF;
END
$$;
