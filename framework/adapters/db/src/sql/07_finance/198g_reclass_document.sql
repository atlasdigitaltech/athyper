/* ============================================================================
   Athyper v2.1 — Reclassification Document
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.operating_unit,
                 fin.chart_of_accounts, fin.cost_center, fin.profit_center,
                 fin.journal_entry, wf.approval_instance
   ============================================================================ */

-- ============================================================================
-- fin.reclass_document — Account reclassification (balance transfer)
-- Moves a balance from one account to another within the same entity.
-- ============================================================================
create table if not exists fin.reclass_document (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    reclass_number      varchar(50) not null,
    description         text,

    -- OU context
    ou_id               uuid not null references fin.operating_unit(id),

    -- Account transfer
    from_account_id     uuid not null references fin.chart_of_accounts(id),
    to_account_id       uuid not null references fin.chart_of_accounts(id),
    from_cost_center_id uuid references fin.cost_center(id),
    to_cost_center_id   uuid references fin.cost_center(id),
    from_profit_center_id uuid references fin.profit_center(id),
    to_profit_center_id uuid references fin.profit_center(id),

    -- Dates
    reclass_date        date not null,
    posting_date        date,

    -- Amounts (MC-4: DECIMAL only)
    amount              decimal(18,4) not null,
    currency_code       varchar(3) not null references ref.currency(code),

    -- FX
    functional_currency_code varchar(3) references ref.currency(code),
    exchange_rate       decimal(12,6),
    functional_amount   decimal(18,4),

    -- Status lifecycle: DRAFT -> APPROVED -> POSTED -> REVERSED
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','APPROVED','POSTED','REVERSED')),

    -- Decision Grid audit (approval mandatory for reclass)
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
    approved_at         timestamptz,
    approved_by         uuid,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Constraints
    constraint chk_fin_rcl_amount_gte_zero check (amount >= 0),
    -- Cannot reclass to the same account
    constraint chk_fin_rcl_different_accounts check (from_account_id != to_account_id),

    -- Unique reclass number per entity
    constraint uq_fin_rcl_number unique (tenant_id, entity_code, reclass_number)
);

-- Idempotency
create unique index if not exists uidx_fin_rcl_idempotency
    on fin.reclass_document(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Common query patterns
create index if not exists idx_fin_rcl_tenant on fin.reclass_document(tenant_id);
create index if not exists idx_fin_rcl_status on fin.reclass_document(tenant_id, entity_code, status);
create index if not exists idx_fin_rcl_txn on fin.reclass_document(txn_id);
create index if not exists idx_fin_rcl_je on fin.reclass_document(je_id) where je_id is not null;
create index if not exists idx_fin_rcl_from_account on fin.reclass_document(from_account_id);
create index if not exists idx_fin_rcl_to_account on fin.reclass_document(to_account_id);
create index if not exists idx_fin_rcl_approval on fin.reclass_document(approval_instance_id)
    where approval_instance_id is not null;
create index if not exists idx_fin_rcl_status_date
    on fin.reclass_document(tenant_id, entity_code, status, reclass_date desc);

-- ============================================================================
-- Deferred FKs
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rcl_je') THEN
        ALTER TABLE fin.reclass_document
            ADD CONSTRAINT fk_rcl_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rcl_reversal_je') THEN
        ALTER TABLE fin.reclass_document
            ADD CONSTRAINT fk_rcl_reversal_je FOREIGN KEY (reversal_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rcl_approval_instance') THEN
        ALTER TABLE fin.reclass_document
            ADD CONSTRAINT fk_rcl_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
END
$$;
