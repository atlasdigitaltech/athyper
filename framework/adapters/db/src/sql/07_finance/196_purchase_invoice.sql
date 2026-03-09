/* ============================================================================
   Athyper v2.1 — Purchase Invoice & Lines
   Schema: fin
   Dependencies: core.tenant, ref.currency, ref.uom,
                 fin.operating_unit, fin.business_intent, fin.funding_profile,
                 fin.chart_of_accounts, fin.cost_center, fin.profit_center,
                 fin.accounting_profile, fin.commitment, fin.commitment_schedule,
                 fin.item_master, fin.warehouse, fin.tax_jurisdiction,
                 ent.supplier, wf.approval_instance
   ============================================================================ */

-- ============================================================================
-- fin.document_sequence — Auto-numbering for finance documents
-- Used by DocumentControl.generateNumber() with advisory lock semantics.
-- ============================================================================
create table if not exists fin.document_sequence (
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    prefix          varchar(10) not null,
    fiscal_year     smallint not null,
    last_value      integer not null default 0,
    updated_at      timestamptz not null default now(),

    constraint pk_fin_doc_seq primary key (tenant_id, entity_code, prefix, fiscal_year)
);

-- ============================================================================
-- fin.purchase_invoice — Purchase Invoice header
-- ============================================================================
create table if not exists fin.purchase_invoice (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    entity_code         varchar(20) not null,
    txn_id              uuid not null,

    -- Document identity
    invoice_number      varchar(50) not null,
    invoice_type        varchar(20) not null default 'NON_PO'
                        check (invoice_type in ('PO_BASED','NON_PO')),
    supplier_id         uuid not null references ent.supplier(id),
    supplier_invoice_ref varchar(100),
    description         text,

    -- OU + Intent context
    ou_id               uuid not null references fin.operating_unit(id),
    intent_id           uuid references fin.business_intent(id),
    spend_category_id   uuid,
    fp_id               uuid references fin.funding_profile(id),
    accounting_profile_id uuid references fin.accounting_profile(id),

    -- Dates
    invoice_date        date not null,
    received_date       date,
    due_date            date,
    posting_date        date,

    -- Amounts (MC-4: DECIMAL only)
    subtotal            decimal(18,4) not null default 0,
    tax_amount          decimal(18,4) not null default 0,
    total_amount        decimal(18,4) not null default 0,
    paid_amount         decimal(18,4) not null default 0,
    currency_code       varchar(3) not null references ref.currency(code),

    -- FX (if invoice currency != functional currency)
    functional_currency_code varchar(3) references ref.currency(code),
    exchange_rate       decimal(12,6),
    functional_amount   decimal(18,4),

    -- Status lifecycle: DRAFT → SUBMITTED → APPROVED → POSTED → PAID/PARTIALLY_PAID
    status              varchar(20) not null default 'DRAFT'
                        check (status in ('DRAFT','SUBMITTED','APPROVED','POSTED',
                                          'PARTIALLY_PAID','PAID','CANCELLED')),

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

    -- Federation link (intercompany)
    ic_transaction_id   uuid,

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

    -- Constraints: status gating
    constraint chk_fin_pi_paid_lte_total check (paid_amount <= total_amount),
    constraint chk_fin_pi_total_gte_zero check (total_amount >= 0),
    constraint chk_fin_pi_paid_gte_zero  check (paid_amount >= 0),

    -- Unique invoice number per entity
    constraint uq_fin_pi_number unique (tenant_id, entity_code, invoice_number)
);

-- Idempotency: partial unique index (matches evt.event pattern)
create unique index if not exists uidx_fin_pi_idempotency
    on fin.purchase_invoice(tenant_id, entity_code, idempotency_key)
    where idempotency_key is not null;

-- Duplicate detection: soft guard (non-unique — same supplier may legitimately
-- have the same ref number for different invoices)
create index if not exists idx_fin_pi_supplier_ref
    on fin.purchase_invoice(tenant_id, entity_code, supplier_id, supplier_invoice_ref)
    where supplier_invoice_ref is not null;

-- Common query patterns
create index if not exists idx_fin_pi_tenant on fin.purchase_invoice(tenant_id);
create index if not exists idx_fin_pi_supplier on fin.purchase_invoice(tenant_id, supplier_id);
create index if not exists idx_fin_pi_status on fin.purchase_invoice(tenant_id, entity_code, status);
create index if not exists idx_fin_pi_txn on fin.purchase_invoice(txn_id);
create index if not exists idx_fin_pi_je on fin.purchase_invoice(je_id) where je_id is not null;
create index if not exists idx_fin_pi_approval on fin.purchase_invoice(approval_instance_id)
    where approval_instance_id is not null;
create index if not exists idx_fin_pi_due_date on fin.purchase_invoice(tenant_id, entity_code, due_date)
    where status in ('POSTED','PARTIALLY_PAID');
create index if not exists idx_fin_pi_fp on fin.purchase_invoice(fp_id) where fp_id is not null;

-- Composite indexes for list page queries (status + date, supplier + date)
create index if not exists idx_fin_pi_status_date
    on fin.purchase_invoice(tenant_id, entity_code, status, invoice_date desc);
create index if not exists idx_fin_pi_supplier_date
    on fin.purchase_invoice(tenant_id, supplier_id, invoice_date desc);
create index if not exists idx_fin_pi_type
    on fin.purchase_invoice(tenant_id, entity_code, invoice_type);

-- ============================================================================
-- fin.purchase_invoice_line — Invoice line items
-- ============================================================================
create table if not exists fin.purchase_invoice_line (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),
    invoice_id          uuid not null references fin.purchase_invoice(id) on delete cascade,
    line_no             smallint not null,

    -- What is being purchased
    description         text not null,
    item_id             uuid references fin.item_master(id),
    warehouse_id        uuid references fin.warehouse(id),

    -- Classification (overrides header)
    spend_category_id   uuid,

    -- Quantity + pricing
    quantity            decimal(18,6) not null default 1,
    uom                 varchar(20),
    unit_price          decimal(18,4) not null,
    amount              decimal(18,4) not null,

    -- Tax
    tax_code            varchar(20),
    tax_rate            decimal(9,6) not null default 0,
    tax_amount          decimal(18,4) not null default 0,
    tax_inclusive        boolean not null default false,

    -- Accounting
    account_id          uuid references fin.chart_of_accounts(id),
    cost_center_id      uuid references fin.cost_center(id),
    profit_center_id    uuid references fin.profit_center(id),
    fp_id               uuid references fin.funding_profile(id),

    -- Commitment link (may reference existing commitment)
    commitment_id       uuid references fin.commitment(id),
    commitment_schedule_id uuid references fin.commitment_schedule(id),

    -- Post-posting links (populated when respective engines fire)
    asset_id            uuid,
    inventory_movement_id uuid,

    -- Metadata
    tags                jsonb default '[]',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    -- Line-level constraints
    constraint chk_fin_pi_line_qty    check (quantity >= 0),
    constraint chk_fin_pi_line_price  check (unit_price >= 0),
    constraint chk_fin_pi_line_amount check (amount >= 0),
    constraint chk_fin_pi_line_tax    check (tax_amount >= 0),

    -- Unique line number per invoice
    constraint uq_fin_pi_line unique (tenant_id, invoice_id, line_no)
);

create index if not exists idx_fin_pi_line_invoice on fin.purchase_invoice_line(invoice_id);
create index if not exists idx_fin_pi_line_account on fin.purchase_invoice_line(account_id)
    where account_id is not null;
create index if not exists idx_fin_pi_line_item on fin.purchase_invoice_line(item_id)
    where item_id is not null;
create index if not exists idx_fin_pi_line_commitment on fin.purchase_invoice_line(commitment_id)
    where commitment_id is not null;
create index if not exists idx_fin_pi_line_asset on fin.purchase_invoice_line(asset_id)
    where asset_id is not null;

-- ============================================================================
-- Schema delta: journal_line.source_doc_line_id
-- Links each JE line back to the specific source document line that generated it.
-- Enables GL drill-through: GL Balance → JE Line → Source Invoice/Payment Line.
-- ============================================================================
ALTER TABLE fin.journal_line ADD COLUMN IF NOT EXISTS source_doc_line_id uuid;

create index if not exists idx_fin_je_line_source_doc
    on fin.journal_line(source_doc_line_id)
    where source_doc_line_id is not null;

-- ============================================================================
-- Deferred FKs — tables that are created in later DDL files
-- (purchase_invoice references journal_entry, approval_instance, etc.)
-- ============================================================================
DO $$
BEGIN
    -- je_id → fin.journal_entry (190_posting.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pi_je') THEN
        ALTER TABLE fin.purchase_invoice
            ADD CONSTRAINT fk_pi_je FOREIGN KEY (je_id) REFERENCES fin.journal_entry(id);
    END IF;

    -- approval_instance_id → wf.approval_instance (060_wf.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pi_approval_instance') THEN
        ALTER TABLE fin.purchase_invoice
            ADD CONSTRAINT fk_pi_approval_instance FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;

    -- ic_transaction_id → fin.intercompany_transaction (164_federation.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pi_ic_txn') THEN
        ALTER TABLE fin.purchase_invoice
            ADD CONSTRAINT fk_pi_ic_txn FOREIGN KEY (ic_transaction_id) REFERENCES fin.intercompany_transaction(id);
    END IF;

    -- Line: asset_id → fin.asset (161_asset.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pi_line_asset') THEN
        ALTER TABLE fin.purchase_invoice_line
            ADD CONSTRAINT fk_pi_line_asset FOREIGN KEY (asset_id) REFERENCES fin.asset(id);
    END IF;

    -- Line: inventory_movement_id → fin.inventory_movement (162_inventory.sql)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pi_line_inv_movement') THEN
        ALTER TABLE fin.purchase_invoice_line
            ADD CONSTRAINT fk_pi_line_inv_movement FOREIGN KEY (inventory_movement_id) REFERENCES fin.inventory_movement(id);
    END IF;
END
$$;
