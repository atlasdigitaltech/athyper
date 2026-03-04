/* ============================================================================
   Athyper v2.1 — Payment Entry & Allocation (Gross Settlement)
   Schema: fin
   Dependencies: core.tenant, ref.currency,
                 fin.operating_unit, fin.chart_of_accounts,
                 fin.purchase_invoice, fin.journal_entry,
                 fin.commitment, fin.tax_calculation,
                 ent.supplier, wf.approval_instance
   ============================================================================ */

-- ============================================================================
-- fin.payment_entry — Payment header
-- ============================================================================
create table if not exists fin.payment_entry (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    payment_number      varchar(50) not null,
    supplier_id         uuid not null references ent.supplier(id),
    description         text,

    -- OU context
    ou_id               uuid references fin.operating_unit(id),

    -- Payment method & bank
    payment_method      varchar(20) not null
                        check (payment_method in ('CHECK','WIRE','ACH','CARD','CASH','NETTING')),
    bank_account_id     uuid references fin.chart_of_accounts(id),
    clearing_account_id uuid references fin.chart_of_accounts(id),
    bank_reference      varchar(100),

    -- Dates
    payment_date        date not null,
    value_date          date,

    -- Amounts (MC-4: DECIMAL only)
    total_amount        decimal(18,4) not null,
    currency_code       varchar(3) not null references ref.currency(code),

    -- FX (if payment currency != functional currency)
    functional_currency_code varchar(3) references ref.currency(code),
    exchange_rate       decimal(12,6),
    functional_amount   decimal(18,4),

    -- Status lifecycle: DRAFT → SUBMITTED → APPROVED → POSTED → RECONCILED
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','SUBMITTED','APPROVED','POSTED',
                                          'RECONCILED','CANCELLED','VOIDED')),

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

    -- Reconciliation
    reconciled_at       timestamptz,
    reconciled_by       uuid,

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
    constraint chk_fin_pay_total_gt_zero check (total_amount > 0),

    -- Unique payment number per entity
    constraint uq_fin_pay_number unique (tenant_id, entity_code, payment_number)
);

-- Idempotency: partial unique index (matches evt.event pattern)
create unique index if not exists uidx_fin_pay_idempotency
    on fin.payment_entry(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Common query patterns
create index if not exists idx_fin_pay_tenant on fin.payment_entry(tenant_id);
create index if not exists idx_fin_pay_supplier on fin.payment_entry(tenant_id, supplier_id);
create index if not exists idx_fin_pay_status on fin.payment_entry(tenant_id, entity_code, status);
create index if not exists idx_fin_pay_txn on fin.payment_entry(txn_id);
create index if not exists idx_fin_pay_je on fin.payment_entry(je_id) where je_id is not null;
create index if not exists idx_fin_pay_approval on fin.payment_entry(approval_instance_id)
    where approval_instance_id is not null;
create index if not exists idx_fin_pay_date on fin.payment_entry(tenant_id, entity_code, payment_date);

-- Composite indexes for list page queries (status + date, supplier + date)
create index if not exists idx_fin_pay_status_date
    on fin.payment_entry(tenant_id, entity_code, status, payment_date desc);
create index if not exists idx_fin_pay_supplier_date
    on fin.payment_entry(tenant_id, supplier_id, payment_date desc);

-- ============================================================================
-- fin.payment_allocation — Per-invoice allocation with gross settlement semantics
--
-- GROSS SETTLEMENT: allocated_amount = total AP reduction for this invoice.
-- Net cash = allocated_amount - withholding_amount - discount_amount.
-- JE proof: Dr AP(allocated) = Cr Bank(net) + Cr WHT(wht) + Cr Discount(disc)
-- ============================================================================
create table if not exists fin.payment_allocation (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    payment_id          uuid not null references fin.payment_entry(id) on delete cascade,
    invoice_id          uuid not null references fin.purchase_invoice(id),
    line_no             smallint not null,

    -- Gross settlement = total AP reduction for this invoice
    allocated_amount    decimal(18,4) not null,

    -- Deductions (reduce net cash, not AP)
    discount_amount     decimal(18,4) not null default 0,
    withholding_amount  decimal(18,4) not null default 0,

    -- WHT audit link
    wht_tax_calc_id     uuid,

    -- Commission settlement links (commissions settled by this allocation)
    commission_calc_ids uuid[],

    -- Commitment link (from invoice, for fulfillment recording)
    commitment_id       uuid references fin.commitment(id),

    -- Metadata
    description         text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Per-allocation constraints:
    -- Allocated amount must be positive
    constraint chk_fin_alloc_amount_gt_zero check (allocated_amount > 0),
    -- Deductions must be non-negative
    constraint chk_fin_alloc_disc_gte_zero check (discount_amount >= 0),
    constraint chk_fin_alloc_wht_gte_zero check (withholding_amount >= 0),
    -- Discount + WHT cannot exceed allocated (net cash cannot be negative)
    constraint chk_fin_alloc_deductions check (discount_amount + withholding_amount <= allocated_amount),

    -- Unique line number per payment
    constraint uq_fin_pay_alloc_line unique (tenant_id, payment_id, line_no)
);

create index if not exists idx_fin_alloc_payment on fin.payment_allocation(payment_id);
create index if not exists idx_fin_alloc_invoice on fin.payment_allocation(invoice_id);
create index if not exists idx_fin_alloc_commitment on fin.payment_allocation(commitment_id)
    where commitment_id is not null;

-- ============================================================================
-- Deferred FKs — tables that require forward references
-- ============================================================================
DO $$
BEGIN
    -- payment_entry.je_id → fin.journal_entry (190_posting.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pay_je') THEN
        ALTER TABLE fin.payment_entry
            ADD CONSTRAINT fk_pay_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- payment_entry.approval_instance_id → wf.approval_instance (060_wf.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pay_approval_instance') THEN
        ALTER TABLE fin.payment_entry
            ADD CONSTRAINT fk_pay_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;

    -- payment_allocation.wht_tax_calc_id → fin.tax_calculation (195_tax.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alloc_wht_tax_calc') THEN
        ALTER TABLE fin.payment_allocation
            ADD CONSTRAINT fk_alloc_wht_tax_calc FOREIGN KEY (wht_tax_calc_id) REFERENCES fin.tax_calculation(id);
    END IF;
END
$$;
