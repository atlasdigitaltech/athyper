/* ============================================================================
   Athyper v2.1 — Document Registry: Credit Note, Accrual, Reclass Integration
   Schema: fin
   Dependencies: 198_financial_document_registry.sql,
                 198c_financial_document_refinements.sql,
                 198e_credit_note.sql, 198f_accrual_document.sql,
                 198g_reclass_document.sql

   Contents:
     1. Extended canonical status mapping function (add 3 new doc types)
     2. Canonical status mapping governance seeds
     3. Sync trigger: credit_note → financial_document
     4. Sync trigger: accrual_document → financial_document
     5. Sync trigger: reclass_document → financial_document
     6. Accrual compliance view: missing reversal
   ============================================================================ */

-- ============================================================================
-- 1. Extended canonical status mapping function
-- Replaces fin.map_canonical_status to support CREDIT_NOTE, ACCRUAL, RECLASS.
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
        -- Credit Note
        when p_doc_type = 'CREDIT_NOTE' then case p_source_status
            when 'DRAFT'      then 'DRAFT'
            when 'SUBMITTED'  then 'IN_REVIEW'
            when 'APPROVED'   then 'APPROVED'
            when 'POSTED'     then 'POSTED'
            when 'APPLIED'    then 'SETTLED'
            when 'CANCELLED'  then 'CANCELLED'
            when 'FAILED'     then 'FAILED'
            else 'DRAFT'
        end
        -- Accrual
        when p_doc_type = 'ACCRUAL' then case p_source_status
            when 'DRAFT'      then 'DRAFT'
            when 'APPROVED'   then 'APPROVED'
            when 'POSTED'     then 'POSTED'
            when 'REVERSED'   then 'REVERSED'
            when 'CANCELLED'  then 'CANCELLED'
            else 'DRAFT'
        end
        -- Reclassification
        when p_doc_type = 'RECLASS' then case p_source_status
            when 'DRAFT'      then 'DRAFT'
            when 'APPROVED'   then 'APPROVED'
            when 'POSTED'     then 'POSTED'
            when 'REVERSED'   then 'REVERSED'
            else 'DRAFT'
        end
        else 'DRAFT'
    end
$$;

-- ============================================================================
-- 2. Canonical status mapping governance seeds
-- ============================================================================
insert into fin.canonical_status_mapping (doc_type, source_status, canonical_status, description)
values
    -- Credit Note
    ('CREDIT_NOTE', 'DRAFT',      'DRAFT',      'Credit note created, not submitted'),
    ('CREDIT_NOTE', 'SUBMITTED',  'IN_REVIEW',  'Credit note submitted for approval'),
    ('CREDIT_NOTE', 'APPROVED',   'APPROVED',   'Credit note approved, pending posting'),
    ('CREDIT_NOTE', 'POSTED',     'POSTED',     'Credit note posted with JE'),
    ('CREDIT_NOTE', 'APPLIED',    'SETTLED',    'Credit note fully applied to invoice'),
    ('CREDIT_NOTE', 'CANCELLED',  'CANCELLED',  'Credit note cancelled'),
    ('CREDIT_NOTE', 'FAILED',     'FAILED',     'Credit note posting failed'),
    -- Accrual
    ('ACCRUAL', 'DRAFT',      'DRAFT',      'Accrual drafted'),
    ('ACCRUAL', 'APPROVED',   'APPROVED',   'Accrual approved, pending posting'),
    ('ACCRUAL', 'POSTED',     'POSTED',     'Accrual posted with JE'),
    ('ACCRUAL', 'REVERSED',   'REVERSED',   'Accrual reversed (manual or auto)'),
    ('ACCRUAL', 'CANCELLED',  'CANCELLED',  'Accrual cancelled'),
    -- Reclassification
    ('RECLASS', 'DRAFT',      'DRAFT',      'Reclassification drafted'),
    ('RECLASS', 'APPROVED',   'APPROVED',   'Reclassification approved, pending posting'),
    ('RECLASS', 'POSTED',     'POSTED',     'Reclassification posted with JE'),
    ('RECLASS', 'REVERSED',   'REVERSED',   'Reclassification reversed')
on conflict (doc_type, source_status, effective_from) do nothing;

-- ============================================================================
-- 3. Sync Trigger: credit_note → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_credit_note()
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
        'CREDIT_NOTE',
        NEW.credit_note_number,
        NEW.entity_code,
        'finance.accounting',
        'fin.credit_note',
        NEW.id,
        fin.map_canonical_status('CREDIT_NOTE', NEW.status),
        NEW.status,
        NEW.credit_note_date,
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
        status               = fin.map_canonical_status('CREDIT_NOTE', NEW.status),
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

drop trigger if exists trg_fin_cn_sync_doc_registry on fin.credit_note;
create trigger trg_fin_cn_sync_doc_registry
    after insert or update on fin.credit_note
    for each row execute function fin.trg_sync_financial_document_credit_note();

-- ============================================================================
-- 4. Sync Trigger: accrual_document → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_accrual()
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
        'ACCRUAL',
        NEW.accrual_code,
        NEW.entity_code,
        'finance.accounting',
        'fin.accrual_document',
        NEW.id,
        fin.map_canonical_status('ACCRUAL', NEW.status),
        NEW.status,
        NEW.accrual_date,
        NEW.posting_date,
        NEW.currency_code,
        NEW.accrual_amount,
        'INTERNAL',
        null,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        NEW.approval_instance_id,
        NEW.approval_route,
        NEW.decision_score,
        now(),
        NEW.posted_at,
        NEW.approved_by,
        NEW.created_at,
        coalesce(NEW.reversed_by, NEW.approved_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status               = fin.map_canonical_status('ACCRUAL', NEW.status),
        source_status        = NEW.status,
        posting_date         = NEW.posting_date,
        total_amount         = NEW.accrual_amount,
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
        updated_by           = coalesce(NEW.reversed_by, NEW.approved_by, NEW.cancelled_by),
        updated_at           = NEW.updated_at,
        void_reason_code     = case when NEW.status = 'CANCELLED' then 'CANCELLED_BY_USER' else null end;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_acr_sync_doc_registry on fin.accrual_document;
create trigger trg_fin_acr_sync_doc_registry
    after insert or update on fin.accrual_document
    for each row execute function fin.trg_sync_financial_document_accrual();

-- ============================================================================
-- 5. Sync Trigger: reclass_document → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_reclass()
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
        'RECLASS',
        NEW.reclass_number,
        NEW.entity_code,
        'finance.accounting',
        'fin.reclass_document',
        NEW.id,
        fin.map_canonical_status('RECLASS', NEW.status),
        NEW.status,
        NEW.reclass_date,
        NEW.posting_date,
        NEW.currency_code,
        NEW.amount,
        'INTERNAL',
        null,
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        NEW.approval_instance_id,
        NEW.approval_route,
        NEW.decision_score,
        now(),
        NEW.posted_at,
        NEW.approved_by,
        NEW.created_at,
        coalesce(NEW.reversed_by, NEW.approved_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status               = fin.map_canonical_status('RECLASS', NEW.status),
        source_status        = NEW.status,
        posting_date         = NEW.posting_date,
        total_amount         = NEW.amount,
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
        updated_by           = coalesce(NEW.reversed_by, NEW.approved_by),
        updated_at           = NEW.updated_at;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_rcl_sync_doc_registry on fin.reclass_document;
create trigger trg_fin_rcl_sync_doc_registry
    after insert or update on fin.reclass_document
    for each row execute function fin.trg_sync_financial_document_reclass();

-- ============================================================================
-- 6. Accrual Compliance View: posted accruals missing reversal
-- Auto-reverse accruals that are POSTED but past their reversal_date
-- without a reversal_je_id indicate a failed auto-reversal.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_accrual_missing_reversal CASCADE;
create or replace view fin.v_accrual_missing_reversal as
select
    ad.*,
    fd.status  as registry_status,
    fd.je_id   as registry_je_id
from fin.accrual_document ad
join fin.financial_document fd
    on fd.tenant_id = ad.tenant_id
   and fd.source_table = 'fin.accrual_document'
   and fd.source_ref_id = ad.id
where ad.auto_reverse = true
  and ad.status = 'POSTED'
  and ad.reversal_date <= current_date
  and ad.reversal_je_id is null;

comment on view fin.v_accrual_missing_reversal is
    'Accruals flagged for auto-reversal that are past their reversal_date '
    'without a reversal JE. Indicates a failed or pending auto-reversal job.';

-- Reclass approval compliance view: reclass docs without approval evidence
DROP VIEW IF EXISTS fin.v_reclass_missing_approval CASCADE;
create or replace view fin.v_reclass_missing_approval as
select fd.*
from fin.financial_document fd
where fd.doc_type = 'RECLASS'
  and fd.status in ('POSTED', 'APPROVED')
  and fd.approval_instance_id is null;

comment on view fin.v_reclass_missing_approval is
    'Reclassification documents that reached APPROVED or POSTED state '
    'without approval evidence. Reclass always requires approval.';

-- Update the approval-without-scoring view to include new doc types
DROP VIEW IF EXISTS fin.v_doc_approved_without_scoring CASCADE;
create or replace view fin.v_doc_approved_without_scoring as
select fd.*
from fin.financial_document fd
where fd.status in ('APPROVED', 'POSTED', 'SETTLED', 'PARTIALLY_SETTLED')
  and fd.doc_type in ('PURCHASE_INVOICE', 'PAYMENT_ENTRY', 'CREDIT_NOTE', 'RECLASS')
  and fd.decision_score is null
  and fd.approval_route is null;
