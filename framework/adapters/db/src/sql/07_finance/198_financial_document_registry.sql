/* ============================================================================
   Athyper v2.1 — Financial Document Registry
   Schema: fin
   Dependencies: core.tenant, ref.currency, fin.journal_entry,
                 fin.purchase_invoice, fin.payment_entry

   Unified financial document registry — one row per finance-relevant document.
   Acts as the audit spine, lifecycle spine, posting linkage spine, and
   compliance query surface across all finance document types.

   This is a projection/index table, NOT a replacement for source tables.
   Source modules keep their own detailed business tables; this registry
   holds shared identity, lifecycle, and linkage.
   ============================================================================ */

-- ============================================================================
-- fin.financial_document — Unified finance document registry
-- ============================================================================
create table if not exists fin.financial_document (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references core.tenant(id),

    -- Document identity (stable across events, postings, audit)
    doc_id              uuid not null,
    txn_id              uuid not null,
    doc_type            varchar(30) not null
                        check (doc_type in (
                            'PURCHASE_INVOICE','PAYMENT_ENTRY','JOURNAL_ENTRY',
                            -- Future document types (additive extension)
                            'CREDIT_NOTE','DEBIT_NOTE','ACCRUAL','REVERSAL',
                            'RECLASS','TAX_DOC','ASSET_CAPITALIZATION',
                            'FX_REVALUATION','IC_ELIMINATION'
                        )),
    doc_no              varchar(50) not null,

    -- Ownership / entity context
    entity_code         varchar(20) not null,
    source_module       varchar(50) not null,
    source_table        varchar(100) not null,
    source_ref_id       uuid not null,

    -- Canonical lifecycle (cross-document normalized)
    status              varchar(20) not null default 'DRAFT'
                        check (status in (
                            'DRAFT','IN_REVIEW','APPROVED','POSTING_PENDING',
                            'POSTED','PARTIALLY_SETTLED','SETTLED',
                            'REVERSED','VOIDED','CANCELLED','FAILED'
                        )),
    -- Source-native lifecycle (preserves module fidelity)
    source_status       varchar(30) not null,

    -- Dates
    doc_date            date not null,
    posting_date        date,

    -- Business summary (MC-4: DECIMAL only)
    currency_code       varchar(3) not null references ref.currency(code),
    total_amount        decimal(18,4) not null default 0,

    -- Counterparty
    counterparty_type   varchar(20)
                        check (counterparty_type is null or counterparty_type in
                               ('SUPPLIER','CUSTOMER','EMPLOYEE','INTERCOMPANY','INTERNAL')),
    counterparty_id     uuid,

    -- Posting linkage
    je_id               uuid references fin.journal_entry(id),
    book_code           varchar(20),
    posted_at           timestamptz,
    posted_by           uuid,

    -- Reversal / cancellation
    reversed_doc_id     uuid references fin.financial_document(id),
    void_reason_code    varchar(50),

    -- Event continuity
    last_event_id       uuid,

    -- Audit trail
    created_by          uuid,
    created_at          timestamptz not null default now(),
    updated_by          uuid,
    updated_at          timestamptz not null default now(),

    -- Uniqueness: one registry row per source document per tenant
    constraint uq_fin_doc_source unique (tenant_id, source_table, source_ref_id),
    -- Stable doc_id uniqueness per tenant
    constraint uq_fin_doc_id unique (tenant_id, doc_id)
);

-- ============================================================================
-- Indexes — optimized for registry query patterns
-- ============================================================================

-- Primary tenant isolation
create index if not exists idx_fin_doc_tenant
    on fin.financial_document(tenant_id);

-- Cross-document queries by entity + status (compliance dashboard)
create index if not exists idx_fin_doc_entity_status
    on fin.financial_document(tenant_id, entity_code, status);

-- Cross-document queries by entity + type + status (filtered workbench)
create index if not exists idx_fin_doc_entity_type_status
    on fin.financial_document(tenant_id, entity_code, doc_type, status);

-- Posting date range queries (period compliance, audit sampling)
create index if not exists idx_fin_doc_posting_date
    on fin.financial_document(tenant_id, entity_code, posting_date)
    where posting_date is not null;

-- Document date range queries
create index if not exists idx_fin_doc_date
    on fin.financial_document(tenant_id, entity_code, doc_date);

-- Transaction chain lookup (end-to-end lineage)
create index if not exists idx_fin_doc_txn
    on fin.financial_document(tenant_id, txn_id);

-- JE linkage queries ("which source docs have/lack JE?")
create index if not exists idx_fin_doc_je
    on fin.financial_document(je_id)
    where je_id is not null;

-- Creator audit ("all docs by user X")
create index if not exists idx_fin_doc_created_by
    on fin.financial_document(tenant_id, created_by)
    where created_by is not null;

-- Counterparty queries ("all docs for supplier Y")
create index if not exists idx_fin_doc_counterparty
    on fin.financial_document(tenant_id, counterparty_type, counterparty_id)
    where counterparty_id is not null;

-- Doc number search
create index if not exists idx_fin_doc_no
    on fin.financial_document(tenant_id, entity_code, doc_no);

-- Composite: entity + posting_date + status (month-end compliance)
create index if not exists idx_fin_doc_close_compliance
    on fin.financial_document(tenant_id, entity_code, posting_date, status)
    where posting_date is not null;

-- ============================================================================
-- Canonical status mapping function
-- Maps source-table-specific statuses to canonical registry statuses.
-- ============================================================================
create or replace function fin.map_canonical_status(
    p_doc_type  text,
    p_source_status text
) returns text
language sql immutable parallel safe as $$
    select case
        -- Purchase Invoice
        when p_doc_type = 'PURCHASE_INVOICE' then case p_source_status
            when 'DRAFT'          then 'DRAFT'
            when 'SUBMITTED'      then 'IN_REVIEW'
            when 'APPROVED'       then 'APPROVED'
            when 'POSTED'         then 'POSTED'
            when 'PARTIALLY_PAID' then 'PARTIALLY_SETTLED'
            when 'PAID'           then 'SETTLED'
            when 'CANCELLED'      then 'CANCELLED'
            else 'DRAFT'
        end
        -- Payment Entry
        when p_doc_type = 'PAYMENT_ENTRY' then case p_source_status
            when 'DRAFT'       then 'DRAFT'
            when 'SUBMITTED'   then 'IN_REVIEW'
            when 'APPROVED'    then 'APPROVED'
            when 'POSTED'      then 'POSTED'
            when 'RECONCILED'  then 'SETTLED'
            when 'CANCELLED'   then 'CANCELLED'
            when 'VOIDED'      then 'VOIDED'
            else 'DRAFT'
        end
        -- Journal Entry
        when p_doc_type = 'JOURNAL_ENTRY' then case p_source_status
            when 'CREATED'   then 'DRAFT'
            when 'POSTED'    then 'POSTED'
            when 'REVERSED'  then 'REVERSED'
            else 'DRAFT'
        end
        else 'DRAFT'
    end
$$;

-- ============================================================================
-- Trigger: purchase_invoice → financial_document
-- Fires on INSERT and UPDATE to keep registry synchronized.
-- ============================================================================
create or replace function fin.trg_sync_financial_document_invoice()
returns trigger
language plpgsql as $$
begin
    insert into fin.financial_document (
        tenant_id, doc_id, txn_id, doc_type, doc_no,
        entity_code, source_module, source_table, source_ref_id,
        status, source_status,
        doc_date, posting_date,
        currency_code, total_amount,
        counterparty_type, counterparty_id,
        je_id, posted_at, posted_by,
        created_by, created_at, updated_by, updated_at
    ) values (
        NEW.tenant_id,
        NEW.id,                             -- doc_id = source PK
        NEW.txn_id,
        'PURCHASE_INVOICE',
        NEW.invoice_number,
        NEW.entity_code,
        'finance.accounting',               -- source module
        'fin.purchase_invoice',             -- source table
        NEW.id,                             -- source_ref_id = PK
        fin.map_canonical_status('PURCHASE_INVOICE', NEW.status),
        NEW.status,
        NEW.invoice_date,
        NEW.posting_date,
        NEW.currency_code,
        NEW.total_amount,
        'SUPPLIER',
        NEW.supplier_id,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        coalesce(NEW.submitted_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.approved_by, NEW.submitted_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status        = fin.map_canonical_status('PURCHASE_INVOICE', NEW.status),
        source_status = NEW.status,
        posting_date  = NEW.posting_date,
        total_amount  = NEW.total_amount,
        je_id         = NEW.je_id,
        posted_at     = NEW.posted_at,
        posted_by     = NEW.posted_by,
        updated_by    = coalesce(NEW.approved_by, NEW.submitted_by, NEW.cancelled_by),
        updated_at    = NEW.updated_at,
        void_reason_code = case when NEW.status = 'CANCELLED' then 'CANCELLED_BY_USER' else null end;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_pi_sync_doc_registry on fin.purchase_invoice;
create trigger trg_fin_pi_sync_doc_registry
    after insert or update on fin.purchase_invoice
    for each row execute function fin.trg_sync_financial_document_invoice();

-- ============================================================================
-- Trigger: payment_entry → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_payment()
returns trigger
language plpgsql as $$
begin
    insert into fin.financial_document (
        tenant_id, doc_id, txn_id, doc_type, doc_no,
        entity_code, source_module, source_table, source_ref_id,
        status, source_status,
        doc_date, posting_date,
        currency_code, total_amount,
        counterparty_type, counterparty_id,
        je_id, posted_at, posted_by,
        created_by, created_at, updated_by, updated_at
    ) values (
        NEW.tenant_id,
        NEW.id,
        NEW.txn_id,
        'PAYMENT_ENTRY',
        NEW.payment_number,
        NEW.entity_code,
        'finance.payments',
        'fin.payment_entry',
        NEW.id,
        fin.map_canonical_status('PAYMENT_ENTRY', NEW.status),
        NEW.status,
        NEW.payment_date,
        NEW.payment_date,                   -- payment_date serves as posting_date
        NEW.currency_code,
        NEW.total_amount,
        'SUPPLIER',
        NEW.supplier_id,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        coalesce(NEW.submitted_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.approved_by, NEW.submitted_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status        = fin.map_canonical_status('PAYMENT_ENTRY', NEW.status),
        source_status = NEW.status,
        total_amount  = NEW.total_amount,
        je_id         = NEW.je_id,
        posted_at     = NEW.posted_at,
        posted_by     = NEW.posted_by,
        updated_by    = coalesce(NEW.approved_by, NEW.submitted_by, NEW.cancelled_by),
        updated_at    = NEW.updated_at,
        void_reason_code = case
            when NEW.status = 'VOIDED' then 'VOIDED'
            when NEW.status = 'CANCELLED' then 'CANCELLED_BY_USER'
            else null
        end;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_pay_sync_doc_registry on fin.payment_entry;
create trigger trg_fin_pay_sync_doc_registry
    after insert or update on fin.payment_entry
    for each row execute function fin.trg_sync_financial_document_payment();

-- ============================================================================
-- Trigger: journal_entry → financial_document
-- Only for manual/standalone journal entries (doc_type starts with 'MANUAL'
-- or doc_id = id, meaning the JE IS the primary document).
-- Auto-posted JEs (from invoices/payments) update the source doc's registry
-- row via je_id propagation on the source table trigger.
--
-- Note: book_code is added to fin.journal_entry via ALTER TABLE in
-- 192_ledger_book.sql. The trigger reads it safely because it fires AFTER
-- the row is fully formed. If the column has not been added yet (fresh
-- install running migrations in order), the coalesce handles the NULL.
-- ============================================================================
create or replace function fin.trg_sync_financial_document_je()
returns trigger
language plpgsql as $$
declare
    v_book_code varchar(20);
begin
    -- Only register manual JEs as standalone documents.
    -- Auto-posted JEs (where doc_id references another source doc) are
    -- linked via je_id on the source document's registry row.
    if NEW.doc_id = NEW.id or NEW.doc_type like 'MANUAL%' then
        -- book_code is added by 192_ledger_book.sql (ALTER TABLE);
        -- read it dynamically to avoid hard dependency on migration order.
        begin
            v_book_code := NEW.book_code;
        exception when undefined_column then
            v_book_code := null;
        end;

        insert into fin.financial_document (
            tenant_id, doc_id, txn_id, doc_type, doc_no,
            entity_code, source_module, source_table, source_ref_id,
            status, source_status,
            doc_date, posting_date,
            currency_code, total_amount,
            counterparty_type, counterparty_id,
            je_id, book_code, posted_at, posted_by,
            created_by, created_at, updated_at
        ) values (
            NEW.tenant_id,
            NEW.id,
            NEW.txn_id,
            'JOURNAL_ENTRY',
            NEW.je_number,
            NEW.entity_code,
            'finance.accounting',
            'fin.journal_entry',
            NEW.id,
            fin.map_canonical_status('JOURNAL_ENTRY', NEW.status),
            NEW.status,
            NEW.posting_date,
            NEW.posting_date,
            NEW.currency_code,
            NEW.total_debit,
            'INTERNAL',
            null,
            NEW.id,                         -- je_id = self for manual JE
            v_book_code,
            NEW.posted_at,
            NEW.posted_by,
            NEW.posted_by,
            NEW.created_at,
            coalesce(NEW.posted_at, NEW.created_at)
        )
        on conflict (tenant_id, source_table, source_ref_id) do update set
            status        = fin.map_canonical_status('JOURNAL_ENTRY', NEW.status),
            source_status = NEW.status,
            book_code     = v_book_code,
            posted_at     = NEW.posted_at,
            posted_by     = NEW.posted_by,
            updated_at    = coalesce(NEW.posted_at, now());
    end if;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_je_sync_doc_registry on fin.journal_entry;
create trigger trg_fin_je_sync_doc_registry
    after insert or update on fin.journal_entry
    for each row execute function fin.trg_sync_financial_document_je();

-- ============================================================================
-- Utility views for common compliance queries
-- ============================================================================

-- Documents posted without prior approval evidence.
-- Checks source tables for approval timestamps; covers both invoices and payments.
create or replace view fin.v_doc_posted_without_approval as
select fd.*
from fin.financial_document fd
where fd.status = 'POSTED'
  and fd.doc_type in ('PURCHASE_INVOICE', 'PAYMENT_ENTRY')
  and (
      -- Purchase invoices: no approved_at means skipped approval
      (fd.doc_type = 'PURCHASE_INVOICE' and not exists (
          select 1 from fin.purchase_invoice pi
          where pi.id = fd.source_ref_id
            and pi.tenant_id = fd.tenant_id
            and pi.approved_at is not null
      ))
      or
      -- Payment entries: no approved_at means skipped approval
      (fd.doc_type = 'PAYMENT_ENTRY' and not exists (
          select 1 from fin.payment_entry pe
          where pe.id = fd.source_ref_id
            and pe.tenant_id = fd.tenant_id
            and pe.approved_at is not null
      ))
  );

-- Documents approved but never posted
create or replace view fin.v_doc_approved_not_posted as
select fd.*
from fin.financial_document fd
where fd.status = 'APPROVED'
  and fd.je_id is null;

-- Documents with posting/registry inconsistency
drop view if exists fin.v_doc_posting_inconsistency;
create or replace view fin.v_doc_posting_inconsistency as
select fd.*,
       case
           when fd.status = 'POSTED' and fd.je_id is null then 'POSTED_NO_JE'
           when fd.je_id is not null and fd.status in ('DRAFT','IN_REVIEW','APPROVED') then 'JE_EXISTS_BUT_NOT_POSTED'
           when fd.je_id is not null and je.status = 'REVERSED' and fd.status != 'REVERSED' then 'JE_REVERSED_DOC_NOT'
       end as inconsistency_type
from fin.financial_document fd
left join fin.journal_entry je on je.id = fd.je_id and je.tenant_id = fd.tenant_id
where (fd.status = 'POSTED' and fd.je_id is null)
   or (fd.je_id is not null and fd.status in ('DRAFT','IN_REVIEW','APPROVED'))
   or (fd.je_id is not null and je.status = 'REVERSED' and fd.status != 'REVERSED');
