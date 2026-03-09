/* ============================================================================
   Athyper v2.1 — Financial Document Registry: Phase 3 Refinements
   Schema: fin
   Dependencies: 198_financial_document_registry.sql,
                 198b_financial_document_backfill.sql

   Refinements:
     1. Delete guard — prevent hard DELETE on posted/terminal documents
     2. Canonical status mapping governance table
     3. Multi-book posting bridge table (one doc → many JEs)
     4. Reversal chain enrichment (reason, timestamps, reversing_doc_id)
     5. Approval evidence columns on registry
     6. Event continuity timestamps
     7. Extended compliance views (Phase 2A)
   ============================================================================ */

-- ============================================================================
-- 1. Delete Guard — prevent hard deletion of registry records
-- Finance documents use status-based cancellation, never hard delete.
-- Only DRAFT documents may be physically removed (e.g., user discards).
-- ============================================================================
create or replace function fin.trg_guard_financial_document_delete()
returns trigger
language plpgsql as $$
begin
    if OLD.status not in ('DRAFT', 'FAILED') then
        raise exception
            'Cannot delete financial document % (status: %). '
            'Finance documents in non-draft states must be cancelled or voided, never deleted.',
            OLD.doc_no, OLD.status
        using errcode = 'restrict_violation';
    end if;
    return OLD;
end;
$$;

drop trigger if exists trg_fin_doc_delete_guard on fin.financial_document;
create trigger trg_fin_doc_delete_guard
    before delete on fin.financial_document
    for each row execute function fin.trg_guard_financial_document_delete();

-- ============================================================================
-- 2. Canonical Status Mapping — governed reference table
-- Formalizes the status mapping as a queryable, auditable reference rather
-- than only living inside the PL/pgSQL function. The function remains the
-- runtime path; this table is the governance contract and audit artifact.
-- ============================================================================
create table if not exists fin.canonical_status_mapping (
    id              serial primary key,
    doc_type        varchar(30) not null,
    source_status   varchar(30) not null,
    canonical_status varchar(20) not null
                    check (canonical_status in (
                        'DRAFT','IN_REVIEW','APPROVED','POSTING_PENDING',
                        'POSTED','PARTIALLY_SETTLED','SETTLED',
                        'REVERSED','VOIDED','CANCELLED','FAILED'
                    )),
    description     text,
    effective_from  date not null default current_date,
    effective_to    date,
    created_at      timestamptz not null default now(),

    constraint uq_canonical_status_mapping unique (doc_type, source_status, effective_from)
);

comment on table fin.canonical_status_mapping is
    'Governed reference table for canonical status mapping. '
    'Formalizes which source-table statuses map to which canonical registry statuses. '
    'The runtime mapping function fin.map_canonical_status() should stay in sync.';

-- Seed the current mapping as governed baseline
insert into fin.canonical_status_mapping (doc_type, source_status, canonical_status, description)
values
    ('PURCHASE_INVOICE', 'DRAFT',          'DRAFT',              'Invoice created, not submitted'),
    ('PURCHASE_INVOICE', 'SUBMITTED',      'IN_REVIEW',          'Invoice submitted for approval'),
    ('PURCHASE_INVOICE', 'APPROVED',       'APPROVED',           'Invoice approved, pending posting'),
    ('PURCHASE_INVOICE', 'POSTED',         'POSTED',             'Invoice posted with JE'),
    ('PURCHASE_INVOICE', 'PARTIALLY_PAID', 'PARTIALLY_SETTLED',  'Partial settlement applied'),
    ('PURCHASE_INVOICE', 'PAID',           'SETTLED',            'Fully settled'),
    ('PURCHASE_INVOICE', 'CANCELLED',      'CANCELLED',          'Invoice cancelled'),
    ('PAYMENT_ENTRY',    'DRAFT',          'DRAFT',              'Payment created, not submitted'),
    ('PAYMENT_ENTRY',    'SUBMITTED',      'IN_REVIEW',          'Payment submitted for approval'),
    ('PAYMENT_ENTRY',    'APPROVED',       'APPROVED',           'Payment approved, pending posting'),
    ('PAYMENT_ENTRY',    'POSTED',         'POSTED',             'Payment posted with JE'),
    ('PAYMENT_ENTRY',    'RECONCILED',     'SETTLED',            'Payment reconciled with bank'),
    ('PAYMENT_ENTRY',    'CANCELLED',      'CANCELLED',          'Payment cancelled'),
    ('PAYMENT_ENTRY',    'VOIDED',         'VOIDED',             'Payment voided after posting'),
    ('JOURNAL_ENTRY',    'CREATED',        'DRAFT',              'JE created/drafted'),
    ('JOURNAL_ENTRY',    'POSTED',         'POSTED',             'JE posted to ledger'),
    ('JOURNAL_ENTRY',    'REVERSED',       'REVERSED',           'JE reversed')
on conflict (doc_type, source_status, effective_from) do nothing;

-- ============================================================================
-- 3. Multi-Book Posting Bridge Table
-- One source document may produce multiple JEs across books (STAT→TAX, etc.).
-- The registry's je_id column stays as the "primary" JE link; this bridge
-- captures the full one-to-many posting set.
-- ============================================================================
create table if not exists fin.financial_document_posting (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references core.tenant(id),
    doc_id          uuid not null,
    book_code       varchar(20) not null,
    je_id           uuid not null references fin.journal_entry(id),
    posting_rule_id uuid,
    posting_status  varchar(20) not null default 'POSTED'
                    check (posting_status in ('POSTED','REVERSED','FAILED')),
    posted_at       timestamptz,
    posted_by       uuid,
    reversed_at     timestamptz,
    reversed_by     uuid,
    created_at      timestamptz not null default now(),

    -- One JE per book per document per tenant
    constraint uq_fin_doc_posting unique (tenant_id, doc_id, book_code, je_id)
);

comment on table fin.financial_document_posting is
    'Multi-book posting bridge: links one source document to multiple JEs across books. '
    'Complements fin.financial_document.je_id (primary JE) with the full posting set.';

create index if not exists idx_fin_doc_posting_doc
    on fin.financial_document_posting(tenant_id, doc_id);

create index if not exists idx_fin_doc_posting_je
    on fin.financial_document_posting(je_id);

create index if not exists idx_fin_doc_posting_book
    on fin.financial_document_posting(tenant_id, book_code);

-- Backfill existing multi-book JEs into the bridge table.
-- Derived JEs (journal_entry.derived_from_je_id IS NOT NULL) are secondary
-- book postings created by book_posting_rule.
do $$
declare
    v_has_derived boolean;
begin
    select exists (
        select 1 from information_schema.columns
        where table_schema = 'fin'
          and table_name = 'journal_entry'
          and column_name = 'derived_from_je_id'
    ) into v_has_derived;

    if v_has_derived then
        execute $q$
            insert into fin.financial_document_posting (
                tenant_id, doc_id, book_code, je_id, posting_rule_id,
                posting_status, posted_at, posted_by, created_at
            )
            select
                je.tenant_id,
                je.doc_id,
                coalesce(je.book_code, 'STAT'),
                je.id,
                je.posting_rule_id,
                case je.status
                    when 'REVERSED' then 'REVERSED'
                    when 'POSTED'   then 'POSTED'
                    else 'POSTED'
                end,
                je.posted_at,
                je.posted_by,
                je.created_at
            from fin.journal_entry je
            where je.doc_id != je.id  -- exclude manual/standalone JEs
            on conflict (tenant_id, doc_id, book_code, je_id) do nothing
        $q$;
    end if;
end
$$;

-- ============================================================================
-- 4. Reversal Chain Enrichment
-- Adds reversal provenance: who, when, why, and the reversing (new) document.
-- ============================================================================
alter table fin.financial_document
    add column if not exists reversal_reason   text,
    add column if not exists reversal_at       timestamptz,
    add column if not exists reversal_by       uuid,
    add column if not exists reversing_doc_id  uuid;

-- Self-referential FK: reversing_doc_id points to the NEW document that
-- reverses THIS one (inverse of reversed_doc_id).
do $$
begin
    if not exists (
        select 1 from information_schema.table_constraints
        where table_schema = 'fin'
          and table_name = 'financial_document'
          and constraint_name = 'fk_fin_doc_reversing'
    ) then
        alter table fin.financial_document
            add constraint fk_fin_doc_reversing
            foreign key (reversing_doc_id) references fin.financial_document(id);
    end if;
end
$$;

comment on column fin.financial_document.reversed_doc_id is
    'Points to the original document that THIS document reverses (I am the reversal).';
comment on column fin.financial_document.reversing_doc_id is
    'Points to the document that reversed THIS document (I was reversed by).';

-- ============================================================================
-- 5. Approval Evidence Columns
-- Denormalized from source tables for compliance query performance.
-- Full evidence lives in wf.approval_instance; these are the summary fields.
-- ============================================================================
alter table fin.financial_document
    add column if not exists approval_instance_id uuid,
    add column if not exists approval_route       varchar(20),
    add column if not exists decision_score       decimal(5,4);

-- Deferred FK to wf.approval_instance (may not exist yet)
do $$
begin
    if exists (
        select 1 from information_schema.tables
        where table_schema = 'wf' and table_name = 'approval_instance'
    ) then
        if not exists (
            select 1 from information_schema.table_constraints
            where table_schema = 'fin'
              and table_name = 'financial_document'
              and constraint_name = 'fk_fin_doc_approval_instance'
        ) then
            alter table fin.financial_document
                add constraint fk_fin_doc_approval_instance
                foreign key (approval_instance_id) references wf.approval_instance(id);
        end if;
    end if;
end
$$;

create index if not exists idx_fin_doc_approval
    on fin.financial_document(approval_instance_id)
    where approval_instance_id is not null;

create index if not exists idx_fin_doc_approval_route
    on fin.financial_document(tenant_id, entity_code, approval_route)
    where approval_route is not null;

-- ============================================================================
-- 6. Event Continuity Timestamps
-- ============================================================================
alter table fin.financial_document
    add column if not exists last_lifecycle_at      timestamptz,
    add column if not exists last_posting_event_at  timestamptz;

-- ============================================================================
-- Backfill new columns from source tables
-- ============================================================================

-- Backfill approval evidence from purchase_invoice
update fin.financial_document fd
set
    approval_instance_id = pi.approval_instance_id,
    approval_route       = pi.approval_route,
    decision_score       = pi.decision_score
from fin.purchase_invoice pi
where fd.source_table = 'fin.purchase_invoice'
  and fd.source_ref_id = pi.id
  and fd.tenant_id = pi.tenant_id
  and fd.approval_instance_id is null
  and pi.approval_instance_id is not null;

-- Backfill approval evidence from payment_entry
update fin.financial_document fd
set
    approval_instance_id = pe.approval_instance_id,
    approval_route       = pe.approval_route,
    decision_score       = pe.decision_score
from fin.payment_entry pe
where fd.source_table = 'fin.payment_entry'
  and fd.source_ref_id = pe.id
  and fd.tenant_id = pe.tenant_id
  and fd.approval_instance_id is null
  and pe.approval_instance_id is not null;

-- Backfill lifecycle timestamps from updated_at
update fin.financial_document
set last_lifecycle_at = updated_at
where last_lifecycle_at is null;

-- Backfill posting event timestamp from posted_at
update fin.financial_document
set last_posting_event_at = posted_at
where last_posting_event_at is null
  and posted_at is not null;

-- ============================================================================
-- Update sync triggers to propagate new columns
-- ============================================================================

-- PI trigger: add approval evidence propagation
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
        approval_instance_id, approval_route, decision_score,
        last_lifecycle_at, last_posting_event_at,
        created_by, created_at, updated_by, updated_at
    ) values (
        NEW.tenant_id,
        NEW.id,
        NEW.txn_id,
        'PURCHASE_INVOICE',
        NEW.invoice_number,
        NEW.entity_code,
        'finance.accounting',
        'fin.purchase_invoice',
        NEW.id,
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
        NEW.approval_instance_id,
        NEW.approval_route,
        NEW.decision_score,
        now(),
        NEW.posted_at,
        coalesce(NEW.submitted_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.approved_by, NEW.submitted_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status               = fin.map_canonical_status('PURCHASE_INVOICE', NEW.status),
        source_status        = NEW.status,
        posting_date         = NEW.posting_date,
        total_amount         = NEW.total_amount,
        je_id                = NEW.je_id,
        posted_at            = NEW.posted_at,
        posted_by            = NEW.posted_by,
        approval_instance_id = coalesce(NEW.approval_instance_id, fin.financial_document.approval_instance_id),
        approval_route       = coalesce(NEW.approval_route, fin.financial_document.approval_route),
        decision_score       = coalesce(NEW.decision_score, fin.financial_document.decision_score),
        last_lifecycle_at    = now(),
        last_posting_event_at = case
            when NEW.posted_at is not null and NEW.posted_at != coalesce(fin.financial_document.posted_at, '1970-01-01'::timestamptz)
            then NEW.posted_at
            else fin.financial_document.last_posting_event_at
        end,
        updated_by           = coalesce(NEW.approved_by, NEW.submitted_by, NEW.cancelled_by),
        updated_at           = NEW.updated_at,
        void_reason_code     = case when NEW.status = 'CANCELLED' then 'CANCELLED_BY_USER' else null end;

    return NEW;
end;
$$;

-- PE trigger: add approval evidence propagation
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
        approval_instance_id, approval_route, decision_score,
        last_lifecycle_at, last_posting_event_at,
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
        NEW.payment_date,
        NEW.currency_code,
        NEW.total_amount,
        'SUPPLIER',
        NEW.supplier_id,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        NEW.approval_instance_id,
        NEW.approval_route,
        NEW.decision_score,
        now(),
        NEW.posted_at,
        coalesce(NEW.submitted_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.approved_by, NEW.submitted_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status               = fin.map_canonical_status('PAYMENT_ENTRY', NEW.status),
        source_status        = NEW.status,
        total_amount         = NEW.total_amount,
        je_id                = NEW.je_id,
        posted_at            = NEW.posted_at,
        posted_by            = NEW.posted_by,
        approval_instance_id = coalesce(NEW.approval_instance_id, fin.financial_document.approval_instance_id),
        approval_route       = coalesce(NEW.approval_route, fin.financial_document.approval_route),
        decision_score       = coalesce(NEW.decision_score, fin.financial_document.decision_score),
        last_lifecycle_at    = now(),
        last_posting_event_at = case
            when NEW.posted_at is not null and NEW.posted_at != coalesce(fin.financial_document.posted_at, '1970-01-01'::timestamptz)
            then NEW.posted_at
            else fin.financial_document.last_posting_event_at
        end,
        updated_by           = coalesce(NEW.approved_by, NEW.submitted_by, NEW.cancelled_by),
        updated_at           = NEW.updated_at,
        void_reason_code     = case
            when NEW.status = 'VOIDED' then 'VOIDED'
            when NEW.status = 'CANCELLED' then 'CANCELLED_BY_USER'
            else null
        end;

    return NEW;
end;
$$;

-- JE trigger: add event continuity
create or replace function fin.trg_sync_financial_document_je()
returns trigger
language plpgsql as $$
declare
    v_book_code varchar(20);
begin
    if NEW.doc_id = NEW.id or NEW.doc_type like 'MANUAL%' then
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
            last_lifecycle_at, last_posting_event_at,
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
            NEW.id,
            v_book_code,
            NEW.posted_at,
            NEW.posted_by,
            now(),
            NEW.posted_at,
            NEW.posted_by,
            NEW.created_at,
            coalesce(NEW.posted_at, NEW.created_at)
        )
        on conflict (tenant_id, source_table, source_ref_id) do update set
            status                = fin.map_canonical_status('JOURNAL_ENTRY', NEW.status),
            source_status         = NEW.status,
            book_code             = v_book_code,
            posted_at             = NEW.posted_at,
            posted_by             = NEW.posted_by,
            last_lifecycle_at     = now(),
            last_posting_event_at = case
                when NEW.posted_at is not null then NEW.posted_at
                else fin.financial_document.last_posting_event_at
            end,
            updated_at            = coalesce(NEW.posted_at, now());
    end if;

    -- Multi-book bridge: also upsert into financial_document_posting
    -- for any JE that posts against a source document (doc_id != id).
    if NEW.doc_id != NEW.id and NEW.status in ('POSTED', 'REVERSED') then
        begin
            v_book_code := NEW.book_code;
        exception when undefined_column then
            v_book_code := null;
        end;

        insert into fin.financial_document_posting (
            tenant_id, doc_id, book_code, je_id,
            posting_rule_id, posting_status, posted_at, posted_by
        ) values (
            NEW.tenant_id,
            NEW.doc_id,
            coalesce(v_book_code, 'STAT'),
            NEW.id,
            null, -- posting_rule_id populated by posting engine if available
            case NEW.status when 'REVERSED' then 'REVERSED' else 'POSTED' end,
            NEW.posted_at,
            NEW.posted_by
        )
        on conflict (tenant_id, doc_id, book_code, je_id) do update set
            posting_status = case NEW.status when 'REVERSED' then 'REVERSED' else 'POSTED' end,
            reversed_at    = case when NEW.status = 'REVERSED' then now() else null end,
            reversed_by    = case when NEW.status = 'REVERSED' then NEW.posted_by else null end;
    end if;

    return NEW;
end;
$$;

-- ============================================================================
-- 7. Extended Compliance Views (Phase 2A)
-- ============================================================================

-- Documents with posting_date in a closed period
DROP VIEW IF EXISTS fin.v_doc_posted_in_closed_period CASCADE;
create or replace view fin.v_doc_posted_in_closed_period as
select fd.*, fp.status as period_status
from fin.financial_document fd
join fin.fiscal_period fp
    on fp.tenant_id = fd.tenant_id
   and fp.entity_code = fd.entity_code
   and fd.posting_date between fp.start_date and fp.end_date
where fd.posting_date is not null
  and fd.status = 'POSTED'
  and fp.status in ('HARD_CLOSE', 'SOFT_CLOSE');

-- Documents with entity_code mismatch between registry and JE
DROP VIEW IF EXISTS fin.v_doc_entity_mismatch CASCADE;
create or replace view fin.v_doc_entity_mismatch as
select fd.*, je.entity_code as je_entity_code
from fin.financial_document fd
join fin.journal_entry je
    on je.id = fd.je_id and je.tenant_id = fd.tenant_id
where fd.entity_code != je.entity_code;

-- Documents with future posting_date (potential backdating indicator)
DROP VIEW IF EXISTS fin.v_doc_future_posting_date CASCADE;
create or replace view fin.v_doc_future_posting_date as
select fd.*
from fin.financial_document fd
where fd.posting_date > current_date
  and fd.status in ('POSTED', 'APPROVED', 'POSTING_PENDING');

-- Terminal documents updated recently (potential tampering indicator)
DROP VIEW IF EXISTS fin.v_doc_terminal_recently_updated CASCADE;
create or replace view fin.v_doc_terminal_recently_updated as
select fd.*
from fin.financial_document fd
where fd.status in ('POSTED', 'REVERSED', 'VOIDED', 'SETTLED')
  and fd.updated_at > (now() - interval '24 hours')
  and fd.updated_at != fd.created_at;

-- Multi-book posting completeness: documents with incomplete book postings
DROP VIEW IF EXISTS fin.v_doc_incomplete_multibook CASCADE;
create or replace view fin.v_doc_incomplete_multibook as
select
    fd.id, fd.tenant_id, fd.doc_id, fd.doc_no, fd.doc_type, fd.entity_code,
    fd.status,
    count(fdp.id) as posting_count,
    array_agg(fdp.book_code order by fdp.book_code) as posted_books,
    array_agg(fdp.posting_status order by fdp.book_code) as posting_statuses,
    bool_or(fdp.posting_status = 'FAILED') as has_failed_posting,
    bool_or(fdp.posting_status = 'REVERSED') as has_reversed_posting
from fin.financial_document fd
join fin.financial_document_posting fdp
    on fdp.tenant_id = fd.tenant_id and fdp.doc_id = fd.doc_id
where fd.status = 'POSTED'
group by fd.id, fd.tenant_id, fd.doc_id, fd.doc_no, fd.doc_type, fd.entity_code, fd.status
having bool_or(fdp.posting_status != 'POSTED');

-- Approval evidence: documents approved without decision grid scoring
DROP VIEW IF EXISTS fin.v_doc_approved_without_scoring CASCADE;
create or replace view fin.v_doc_approved_without_scoring as
select fd.*
from fin.financial_document fd
where fd.status in ('APPROVED', 'POSTED', 'SETTLED', 'PARTIALLY_SETTLED')
  and fd.doc_type in ('PURCHASE_INVOICE', 'PAYMENT_ENTRY')
  and fd.decision_score is null
  and fd.approval_route is null;
