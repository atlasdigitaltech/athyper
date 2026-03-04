/* ============================================================================
   Athyper v2.1 — Commitment & Schedule Engine
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.operating_unit,
                 fin.business_intent, fin.funding_profile,
                 ent.supplier, ent.customer
   ============================================================================ */

-- ============================================================================
-- fin.commitment — Commitment Object master
-- ============================================================================
create table if not exists fin.commitment (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    entity_code     varchar(20) not null,
    txn_id          uuid not null,
    doc_number      varchar(50) not null,
    doc_type        varchar(20) not null
                    check (doc_type in ('PR','PO','CONTRACT','SUBSCRIPTION','LEASE')),
    commitment_type varchar(30) not null
                    check (commitment_type in ('ONE_TIME','FIXED_RECURRING','MILESTONE','USAGE_BASED','ESCALATING','RETENTION_RELEASE')),
    status          varchar(30) not null default 'DRAFT'
                    check (status in ('DRAFT','PENDING','ACTIVE','PARTIALLY_FULFILLED','FULFILLED','CANCELLED','EXPIRED')),

    ou_id           uuid not null references fin.operating_unit(id),
    intent_id       uuid references fin.business_intent(id),
    fp_id           uuid references fin.funding_profile(id),
    vendor_id       uuid references ent.supplier(id),
    customer_id     uuid references ent.customer(id),

    -- Amounts (MC-4: DECIMAL only)
    total_amount    decimal(18,4) not null,
    currency_code   varchar(3) not null references ref.currency(code),
    fulfilled_amount decimal(18,4) not null default 0,
    remaining_amount decimal(18,4) generated always as (total_amount - fulfilled_amount) stored,

    -- Dates
    effective_date  date not null,
    expiry_date     date,
    delivery_date   date,

    -- Renewal
    auto_renew      boolean not null default false,
    renewal_terms   jsonb,
    notify_before_expiry_days integer,

    -- Metadata
    description     text,
    line_items      jsonb not null default '[]',
    terms           jsonb default '{}',
    submitted_by    uuid not null,
    approved_by     uuid,
    approved_at     timestamptz,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint uq_fin_commitment_docnum unique (tenant_id, entity_code, doc_number)
);

create index if not exists idx_fin_commitment_tenant on fin.commitment(tenant_id);
create index if not exists idx_fin_commitment_ou on fin.commitment(ou_id);
create index if not exists idx_fin_commitment_vendor on fin.commitment(vendor_id);
create index if not exists idx_fin_commitment_fp on fin.commitment(fp_id);
create index if not exists idx_fin_commitment_txn on fin.commitment(txn_id);
create index if not exists idx_fin_commitment_status on fin.commitment(tenant_id, status);
create index if not exists idx_fin_commitment_expiry on fin.commitment(expiry_date)
    where expiry_date is not null;

-- ============================================================================
-- fin.commitment_schedule — Schedule entries for recurring/milestone commitments
-- ============================================================================
create table if not exists fin.commitment_schedule (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    commitment_id   uuid not null references fin.commitment(id) on delete cascade,
    schedule_seq    integer not null,
    due_date        date not null,
    amount          decimal(18,4) not null,
    currency_code   varchar(3) not null,
    status          varchar(20) not null default 'PENDING'
                    check (status in ('PENDING','TRIGGERED','FULFILLED','SKIPPED','CANCELLED')),
    milestone_name  varchar(200),
    triggered_at    timestamptz,
    fulfilled_at    timestamptz,

    constraint uq_fin_sched_seq unique (tenant_id, commitment_id, schedule_seq)
);

create index if not exists idx_fin_sched_commitment on fin.commitment_schedule(commitment_id);
create index if not exists idx_fin_sched_due on fin.commitment_schedule(due_date, status);

-- ============================================================================
-- fin.commitment_fulfillment — GRN/delivery/payment match records
-- ============================================================================
create table if not exists fin.commitment_fulfillment (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    commitment_id   uuid not null references fin.commitment(id),
    schedule_id     uuid references fin.commitment_schedule(id),
    fulfillment_type varchar(20) not null
                    check (fulfillment_type in ('GRN','SERVICE_RECEIPT','PAYMENT','MILESTONE_COMPLETE')),
    reference_doc_id uuid,
    amount          decimal(18,4) not null,
    currency_code   varchar(3) not null,
    fulfilled_by    uuid not null,
    fulfilled_at    timestamptz not null default now(),
    notes           text
);

create index if not exists idx_fin_fulfill_commitment on fin.commitment_fulfillment(commitment_id);
create index if not exists idx_fin_fulfill_schedule on fin.commitment_fulfillment(schedule_id);
create index if not exists idx_fin_fulfill_tenant on fin.commitment_fulfillment(tenant_id);

-- ============================================================================
-- Deferred FK: fin.asset.commitment_id → fin.commitment (forward ref from 161_asset)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_asset_commitment'
    ) THEN
        ALTER TABLE fin.asset
            ADD CONSTRAINT fk_asset_commitment
            FOREIGN KEY (commitment_id) REFERENCES fin.commitment(id);
    END IF;
END
$$;
