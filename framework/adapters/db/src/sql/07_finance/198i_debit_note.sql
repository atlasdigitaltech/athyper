/* ============================================================================
   Athyper v2.1 — Debit Note (Supplier)
   Schema: fin
   Dependencies: core.tenant, ref.currency, ent.supplier, fin.operating_unit,
                 fin.chart_of_accounts, fin.cost_center, fin.profit_center,
                 fin.purchase_invoice, fin.journal_entry, wf.approval_instance

   Mirror of credit_note — increases AP liability against a purchase invoice
   (or standalone). Used for price increases, underbilling corrections,
   freight adjustments, and other post-invoice charge increases.
   ============================================================================ */

-- ============================================================================
-- fin.debit_note — Supplier debit note header
-- ============================================================================
create table if not exists fin.debit_note (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    debit_note_number   varchar(50) not null,
    supplier_id         uuid not null references ent.supplier(id),
    invoice_id          uuid references fin.purchase_invoice(id),
    reason_code         varchar(30) not null
                        check (reason_code in (
                            'PRICE_INCREASE','UNDERBILLING','FREIGHT_ADJUSTMENT',
                            'SHORTAGE','QUALITY_CHARGE','OTHER'
                        )),
    description         text,

    -- OU context
    ou_id               uuid not null references fin.operating_unit(id),

    -- Dates
    debit_note_date     date not null,
    posting_date        date,

    -- Amounts (MC-4: DECIMAL only)
    debit_amount        decimal(18,4) not null default 0,
    tax_amount          decimal(18,4) not null default 0,
    total_amount        decimal(18,4) not null default 0,
    currency_code       varchar(3) not null references ref.currency(code),

    -- FX
    functional_currency_code varchar(3) references ref.currency(code),
    exchange_rate       decimal(12,6),
    functional_amount   decimal(18,4),

    -- Status lifecycle: DRAFT -> SUBMITTED -> APPROVED -> POSTED -> CANCELLED / FAILED
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','SUBMITTED','APPROVED','POSTED',
                                          'CANCELLED','FAILED')),

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

    -- Idempotency
    idempotency_key     varchar(200),

    -- Optimistic concurrency
    version             integer not null default 1,

    -- Audit
    submitted_at        timestamptz,
    submitted_by        uuid,
    approved_at         timestamptz,
    approved_by         uuid,
    cancelled_at        timestamptz,
    cancelled_by        uuid,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Constraints
    constraint chk_fin_dn_total_gte_zero check (total_amount >= 0),
    constraint chk_fin_dn_debit_gte_zero check (debit_amount >= 0),

    -- Unique debit note number per entity
    constraint uq_fin_dn_number unique (tenant_id, entity_code, debit_note_number)
);

-- Idempotency
create unique index if not exists uidx_fin_dn_idempotency
    on fin.debit_note(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Common query patterns
create index if not exists idx_fin_dn_tenant on fin.debit_note(tenant_id);
create index if not exists idx_fin_dn_supplier on fin.debit_note(tenant_id, supplier_id);
create index if not exists idx_fin_dn_status on fin.debit_note(tenant_id, entity_code, status);
create index if not exists idx_fin_dn_txn on fin.debit_note(txn_id);
create index if not exists idx_fin_dn_je on fin.debit_note(je_id) where je_id is not null;
create index if not exists idx_fin_dn_invoice on fin.debit_note(invoice_id) where invoice_id is not null;
create index if not exists idx_fin_dn_approval on fin.debit_note(approval_instance_id)
    where approval_instance_id is not null;
create index if not exists idx_fin_dn_status_date
    on fin.debit_note(tenant_id, entity_code, status, debit_note_date desc);
create index if not exists idx_fin_dn_supplier_date
    on fin.debit_note(tenant_id, supplier_id, debit_note_date desc);

-- ============================================================================
-- fin.debit_note_line — Debit note line items
-- ============================================================================
create table if not exists fin.debit_note_line (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    debit_note_id       uuid not null references fin.debit_note(id) on delete cascade,
    line_no             smallint not null,

    description         text not null,

    -- Quantity + pricing
    quantity            decimal(18,6) not null default 1,
    unit_price          decimal(18,4) not null,
    amount              decimal(18,4) not null,

    -- Tax
    tax_code            varchar(20),
    tax_rate            decimal(9,6) not null default 0,
    tax_amount          decimal(18,4) not null default 0,

    -- Accounting
    account_id          uuid references fin.chart_of_accounts(id),
    cost_center_id      uuid references fin.cost_center(id),
    profit_center_id    uuid references fin.profit_center(id),

    -- Metadata
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint chk_fin_dn_line_qty    check (quantity >= 0),
    constraint chk_fin_dn_line_price  check (unit_price >= 0),
    constraint chk_fin_dn_line_amount check (amount >= 0),
    constraint chk_fin_dn_line_tax    check (tax_amount >= 0),
    constraint uq_fin_dn_line unique (tenant_id, debit_note_id, line_no)
);

create index if not exists idx_fin_dn_line_dn on fin.debit_note_line(debit_note_id);
create index if not exists idx_fin_dn_line_account on fin.debit_note_line(account_id)
    where account_id is not null;

-- ============================================================================
-- Deferred FKs
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dn_je') THEN
        ALTER TABLE fin.debit_note
            ADD CONSTRAINT fk_dn_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dn_approval_instance') THEN
        ALTER TABLE fin.debit_note
            ADD CONSTRAINT fk_dn_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
END
$$;
