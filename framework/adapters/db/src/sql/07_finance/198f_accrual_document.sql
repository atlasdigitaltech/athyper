/* ============================================================================
   Athyper v2.1 — Accrual Document
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.operating_unit,
                 fin.chart_of_accounts, fin.cost_center, fin.profit_center,
                 fin.journal_entry, fin.fiscal_period
   ============================================================================ */

-- ============================================================================
-- fin.accrual_document — Period-end accrual with optional auto-reversal
-- ============================================================================
create table if not exists fin.accrual_document (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    accrual_code        varchar(50) not null,
    description         text,

    -- Period context
    period_code         varchar(20) not null,

    -- OU context
    ou_id               uuid not null references fin.operating_unit(id),

    -- Dates
    accrual_date        date not null,
    posting_date        date,
    reversal_date       date,

    -- Auto-reversal control
    auto_reverse        boolean not null default false,

    -- Amounts (MC-4: DECIMAL only)
    accrual_amount      decimal(18,4) not null default 0,
    currency_code       varchar(3) not null references ref.currency(code),

    -- FX
    functional_currency_code varchar(3) references ref.currency(code),
    exchange_rate       decimal(12,6),
    functional_amount   decimal(18,4),

    -- Status lifecycle: DRAFT -> APPROVED -> POSTED -> REVERSED / CANCELLED
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','APPROVED','POSTED',
                                          'REVERSED','CANCELLED')),

    -- Decision Grid audit
    decision_score      decimal(5,4),
    approval_route      varchar(20)
                        check (approval_route is null or approval_route in
                               ('ZERO_APPROVAL','STANDARD','ENHANCED','EXECUTIVE','BLOCKED')),

    -- Workflow link
    approval_instance_id uuid,

    -- Posting link (original JE)
    je_id               uuid,
    posted_at           timestamptz,
    posted_by           uuid,

    -- Reversal link (reversal JE)
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
    cancelled_at        timestamptz,
    cancelled_by        uuid,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Constraints
    constraint chk_fin_acr_amount_gte_zero check (accrual_amount >= 0),
    -- Auto-reverse must have reversal_date
    constraint chk_fin_acr_auto_rev_date
        check (auto_reverse = false or reversal_date is not null),

    -- Unique accrual code per entity
    constraint uq_fin_acr_code unique (tenant_id, entity_code, accrual_code)
);

-- Idempotency
create unique index if not exists uidx_fin_acr_idempotency
    on fin.accrual_document(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Common query patterns
create index if not exists idx_fin_acr_tenant on fin.accrual_document(tenant_id);
create index if not exists idx_fin_acr_status on fin.accrual_document(tenant_id, entity_code, status);
create index if not exists idx_fin_acr_txn on fin.accrual_document(txn_id);
create index if not exists idx_fin_acr_je on fin.accrual_document(je_id) where je_id is not null;
create index if not exists idx_fin_acr_reversal_je on fin.accrual_document(reversal_je_id)
    where reversal_je_id is not null;
create index if not exists idx_fin_acr_period on fin.accrual_document(tenant_id, entity_code, period_code);
create index if not exists idx_fin_acr_reversal_date
    on fin.accrual_document(tenant_id, entity_code, reversal_date)
    where auto_reverse = true and status = 'POSTED';
create index if not exists idx_fin_acr_status_date
    on fin.accrual_document(tenant_id, entity_code, status, accrual_date desc);
create index if not exists idx_fin_acr_approval on fin.accrual_document(approval_instance_id)
    where approval_instance_id is not null;

-- ============================================================================
-- Deferred FKs
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_acr_je') THEN
        ALTER TABLE fin.accrual_document
            ADD CONSTRAINT fk_acr_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_acr_reversal_je') THEN
        ALTER TABLE fin.accrual_document
            ADD CONSTRAINT fk_acr_reversal_je FOREIGN KEY (reversal_je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_acr_approval_instance') THEN
        ALTER TABLE fin.accrual_document
            ADD CONSTRAINT fk_acr_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
END
$$;
