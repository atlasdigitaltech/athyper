/* ============================================================================
   Athyper v2.1 — Intercompany Elimination
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.operating_unit,
                 fin.chart_of_accounts, fin.journal_entry, wf.approval_instance

   Intercompany elimination entries for group consolidation.
   Removes internal transactions (revenue/expense, receivable/payable,
   loans, dividends, inventory markup) from consolidated statements.
   ============================================================================ */

-- ============================================================================
-- fin.ic_elimination — Intercompany elimination header
-- ============================================================================
create table if not exists fin.ic_elimination (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    elimination_code    varchar(50) not null,
    description         text,

    -- Consolidation context
    consolidation_period varchar(20) not null,
    consolidation_group  varchar(50),

    -- Counterparty entity (the other side of the IC transaction)
    counterparty_entity_code varchar(20) not null,

    -- Elimination type
    elimination_type    varchar(30) not null
                        check (elimination_type in (
                            'REVENUE_EXPENSE','RECEIVABLE_PAYABLE','LOAN',
                            'DIVIDEND','INVENTORY_MARKUP','INVESTMENT','OTHER'
                        )),

    -- OU context
    ou_id               uuid not null references fin.operating_unit(id),

    -- Dates
    elimination_date    date not null,
    posting_date        date,

    -- Amounts (MC-4: DECIMAL only)
    elimination_amount  decimal(18,4) not null default 0,
    currency_code       varchar(3) not null references ref.currency(code),

    -- FX
    functional_currency_code varchar(3) references ref.currency(code),
    exchange_rate       decimal(12,6),
    functional_amount   decimal(18,4),

    -- Status lifecycle: DRAFT -> PREPARED -> APPROVED -> POSTED -> REVERSED
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','PREPARED','APPROVED','POSTED','REVERSED')),

    -- Decision Grid audit
    decision_score      decimal(5,4),
    approval_route      varchar(20)
                        check (approval_route is null or approval_route in
                               ('STANDARD','ENHANCED','EXECUTIVE','BLOCKED')),

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
    prepared_at         timestamptz,
    prepared_by         uuid,
    approved_at         timestamptz,
    approved_by         uuid,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Constraints
    constraint chk_fin_ice_amount_gte_zero check (elimination_amount >= 0),
    -- Cannot eliminate against own entity
    constraint chk_fin_ice_different_entities check (entity_code != counterparty_entity_code),

    -- Unique elimination code per entity
    constraint uq_fin_ice_code unique (tenant_id, entity_code, elimination_code)
);

-- Idempotency
create unique index if not exists uidx_fin_ice_idempotency
    on fin.ic_elimination(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Common query patterns
create index if not exists idx_fin_ice_tenant on fin.ic_elimination(tenant_id);
create index if not exists idx_fin_ice_status on fin.ic_elimination(tenant_id, entity_code, status);
create index if not exists idx_fin_ice_txn on fin.ic_elimination(txn_id);
create index if not exists idx_fin_ice_je on fin.ic_elimination(je_id) where je_id is not null;
create index if not exists idx_fin_ice_period on fin.ic_elimination(tenant_id, consolidation_period);
create index if not exists idx_fin_ice_counterparty
    on fin.ic_elimination(tenant_id, counterparty_entity_code);
create index if not exists idx_fin_ice_type on fin.ic_elimination(tenant_id, entity_code, elimination_type);
create index if not exists idx_fin_ice_approval on fin.ic_elimination(approval_instance_id)
    where approval_instance_id is not null;
create index if not exists idx_fin_ice_status_date
    on fin.ic_elimination(tenant_id, entity_code, status, elimination_date desc);

-- ============================================================================
-- fin.ic_elimination_line — Elimination line items (account-level detail)
-- ============================================================================
create table if not exists fin.ic_elimination_line (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    elimination_id      uuid not null references fin.ic_elimination(id) on delete cascade,
    line_no             smallint not null,

    description         text not null,

    -- Account pair (debit one, credit the other)
    account_id          uuid not null references fin.chart_of_accounts(id),
    debit_amount        decimal(18,4) not null default 0,
    credit_amount       decimal(18,4) not null default 0,

    -- Cost / profit center
    cost_center_id      uuid references fin.cost_center(id),
    profit_center_id    uuid references fin.profit_center(id),

    -- Metadata
    created_at          timestamptz not null default now(),

    constraint chk_fin_ice_line_debit  check (debit_amount >= 0),
    constraint chk_fin_ice_line_credit check (credit_amount >= 0),
    -- At least one side must be non-zero
    constraint chk_fin_ice_line_nonzero check (debit_amount > 0 or credit_amount > 0),
    constraint uq_fin_ice_line unique (tenant_id, elimination_id, line_no)
);

create index if not exists idx_fin_ice_line_elim on fin.ic_elimination_line(elimination_id);
create index if not exists idx_fin_ice_line_account on fin.ic_elimination_line(account_id);

-- ============================================================================
-- Deferred FKs
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ice_je') THEN
        ALTER TABLE fin.ic_elimination
            ADD CONSTRAINT fk_ice_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ice_reversal_je') THEN
        ALTER TABLE fin.ic_elimination
            ADD CONSTRAINT fk_ice_reversal_je FOREIGN KEY (reversal_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ice_approval_instance') THEN
        ALTER TABLE fin.ic_elimination
            ADD CONSTRAINT fk_ice_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
END
$$;
