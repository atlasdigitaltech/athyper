/* ============================================================================
   Athyper v2.1 — Document Registry: Phase 7 — Debit Note, FX Reval, IC Elim
   Schema: fin
   Dependencies: 198h_new_doctype_registry.sql,
                 198i_debit_note.sql, 198j_fx_revaluation.sql,
                 198k_ic_elimination.sql

   Contents:
     1. Extended canonical status mapping function (add 3 Phase 7 doc types)
     2. Canonical status mapping governance seeds
     3. Sync trigger: debit_note → financial_document
     4. Sync trigger: fx_revaluation_run → financial_document
     5. Sync trigger: ic_elimination → financial_document
     6. Compliance views
   ============================================================================ */

-- ============================================================================
-- 1. Extended canonical status mapping function
-- Replaces fin.map_canonical_status to support all 9 doc types.
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
        -- Debit Note
        when p_doc_type = 'DEBIT_NOTE' then case p_source_status
            when 'DRAFT'      then 'DRAFT'
            when 'SUBMITTED'  then 'IN_REVIEW'
            when 'APPROVED'   then 'APPROVED'
            when 'POSTED'     then 'POSTED'
            when 'CANCELLED'  then 'CANCELLED'
            when 'FAILED'     then 'FAILED'
            else 'DRAFT'
        end
        -- FX Revaluation
        when p_doc_type = 'FX_REVALUATION' then case p_source_status
            when 'DRAFT'       then 'DRAFT'
            when 'CALCULATED'  then 'IN_REVIEW'
            when 'APPROVED'    then 'APPROVED'
            when 'POSTED'      then 'POSTED'
            when 'REVERSED'    then 'REVERSED'
            else 'DRAFT'
        end
        -- IC Elimination
        when p_doc_type = 'IC_ELIMINATION' then case p_source_status
            when 'DRAFT'      then 'DRAFT'
            when 'PREPARED'   then 'IN_REVIEW'
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
    -- Debit Note
    ('DEBIT_NOTE', 'DRAFT',      'DRAFT',      'Debit note created, not submitted'),
    ('DEBIT_NOTE', 'SUBMITTED',  'IN_REVIEW',  'Debit note submitted for approval'),
    ('DEBIT_NOTE', 'APPROVED',   'APPROVED',   'Debit note approved, pending posting'),
    ('DEBIT_NOTE', 'POSTED',     'POSTED',     'Debit note posted with JE'),
    ('DEBIT_NOTE', 'CANCELLED',  'CANCELLED',  'Debit note cancelled'),
    ('DEBIT_NOTE', 'FAILED',     'FAILED',     'Debit note posting failed'),
    -- FX Revaluation
    ('FX_REVALUATION', 'DRAFT',       'DRAFT',      'FX revaluation run drafted'),
    ('FX_REVALUATION', 'CALCULATED',  'IN_REVIEW',  'Rates applied, gains/losses calculated'),
    ('FX_REVALUATION', 'APPROVED',    'APPROVED',   'FX revaluation approved, pending posting'),
    ('FX_REVALUATION', 'POSTED',      'POSTED',     'FX revaluation posted with JE'),
    ('FX_REVALUATION', 'REVERSED',    'REVERSED',   'FX revaluation reversed'),
    -- IC Elimination
    ('IC_ELIMINATION', 'DRAFT',      'DRAFT',      'IC elimination drafted'),
    ('IC_ELIMINATION', 'PREPARED',   'IN_REVIEW',  'IC elimination prepared for review'),
    ('IC_ELIMINATION', 'APPROVED',   'APPROVED',   'IC elimination approved, pending posting'),
    ('IC_ELIMINATION', 'POSTED',     'POSTED',     'IC elimination posted with JE'),
    ('IC_ELIMINATION', 'REVERSED',   'REVERSED',   'IC elimination reversed')
on conflict (doc_type, source_status, effective_from) do nothing;

-- ============================================================================
-- 3. Sync Trigger: debit_note → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_debit_note()
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
        'DEBIT_NOTE',
        NEW.debit_note_number,
        NEW.entity_code,
        'finance.accounting',
        'fin.debit_note',
        NEW.id,
        fin.map_canonical_status('DEBIT_NOTE', NEW.status),
        NEW.status,
        NEW.debit_note_date,
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
        status               = fin.map_canonical_status('DEBIT_NOTE', NEW.status),
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

drop trigger if exists trg_fin_dn_sync_doc_registry on fin.debit_note;
create trigger trg_fin_dn_sync_doc_registry
    after insert or update on fin.debit_note
    for each row execute function fin.trg_sync_financial_document_debit_note();

-- ============================================================================
-- 4. Sync Trigger: fx_revaluation_run → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_fx_reval()
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
        'FX_REVALUATION',
        NEW.revaluation_code,
        NEW.entity_code,
        'finance.treasury',
        'fin.fx_revaluation_run',
        NEW.id,
        fin.map_canonical_status('FX_REVALUATION', NEW.status),
        NEW.status,
        NEW.revaluation_date,
        NEW.posting_date,
        NEW.functional_currency_code,
        abs(NEW.net_amount),          -- registry total_amount = absolute net impact
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
        coalesce(NEW.calculated_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.reversed_by, NEW.approved_by, NEW.calculated_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status               = fin.map_canonical_status('FX_REVALUATION', NEW.status),
        source_status        = NEW.status,
        posting_date         = NEW.posting_date,
        total_amount         = abs(NEW.net_amount),
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
        updated_by           = coalesce(NEW.reversed_by, NEW.approved_by, NEW.calculated_by),
        updated_at           = NEW.updated_at;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_fxr_sync_doc_registry on fin.fx_revaluation_run;
create trigger trg_fin_fxr_sync_doc_registry
    after insert or update on fin.fx_revaluation_run
    for each row execute function fin.trg_sync_financial_document_fx_reval();

-- ============================================================================
-- 5. Sync Trigger: ic_elimination → financial_document
-- ============================================================================
create or replace function fin.trg_sync_financial_document_ic_elimination()
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
        'IC_ELIMINATION',
        NEW.elimination_code,
        NEW.entity_code,
        'finance.consolidation',
        'fin.ic_elimination',
        NEW.id,
        fin.map_canonical_status('IC_ELIMINATION', NEW.status),
        NEW.status,
        NEW.elimination_date,
        NEW.posting_date,
        NEW.currency_code,
        NEW.elimination_amount,
        'INTERCOMPANY',
        null,                          -- counterparty_id: IC uses entity_code not UUID
        NEW.je_id,
        NEW.posted_at,
        NEW.posted_by,
        NEW.approval_instance_id,
        NEW.approval_route,
        NEW.decision_score,
        now(),
        NEW.posted_at,
        coalesce(NEW.prepared_by, NEW.approved_by),
        NEW.created_at,
        coalesce(NEW.reversed_by, NEW.approved_by, NEW.prepared_by),
        NEW.updated_at
    )
    on conflict (tenant_id, source_table, source_ref_id) do update set
        status               = fin.map_canonical_status('IC_ELIMINATION', NEW.status),
        source_status        = NEW.status,
        posting_date         = NEW.posting_date,
        total_amount         = NEW.elimination_amount,
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
        updated_by           = coalesce(NEW.reversed_by, NEW.approved_by, NEW.prepared_by),
        updated_at           = NEW.updated_at;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_ice_sync_doc_registry on fin.ic_elimination;
create trigger trg_fin_ice_sync_doc_registry
    after insert or update on fin.ic_elimination
    for each row execute function fin.trg_sync_financial_document_ic_elimination();

-- ============================================================================
-- 6. Compliance Views
-- ============================================================================

-- Debit notes posted without an invoice link (standalone correction — flag for review)
DROP VIEW IF EXISTS fin.v_debit_note_without_invoice CASCADE;
create or replace view fin.v_debit_note_without_invoice as
select fd.*, dn.reason_code, dn.debit_amount
from fin.financial_document fd
join fin.debit_note dn
    on dn.tenant_id = fd.tenant_id
   and dn.id = fd.source_ref_id
where fd.doc_type = 'DEBIT_NOTE'
  and fd.status in ('APPROVED', 'POSTED')
  and dn.invoice_id is null;

comment on view fin.v_debit_note_without_invoice is
    'Debit notes that reached APPROVED or POSTED without a linked invoice. '
    'Standalone debit notes require additional review.';

-- FX revaluation runs with zero net adjustment (no-op runs)
DROP VIEW IF EXISTS fin.v_fx_zero_adjustment CASCADE;
create or replace view fin.v_fx_zero_adjustment as
select fd.*, fxr.total_gain, fxr.total_loss, fxr.net_amount
from fin.financial_document fd
join fin.fx_revaluation_run fxr
    on fxr.tenant_id = fd.tenant_id
   and fxr.id = fd.source_ref_id
where fd.doc_type = 'FX_REVALUATION'
  and fd.status in ('CALCULATED', 'APPROVED', 'POSTED')
  and fxr.net_amount = 0;

comment on view fin.v_fx_zero_adjustment is
    'FX revaluation runs with zero net gain/loss — may indicate stale rates or no open positions.';

-- FX revaluation posted into a closed period
DROP VIEW IF EXISTS fin.v_fx_posted_after_close CASCADE;
create or replace view fin.v_fx_posted_after_close as
select fd.*, fp.status as period_status
from fin.financial_document fd
join fin.fiscal_period fp
    on fp.tenant_id = fd.tenant_id
   and fp.entity_code = fd.entity_code
   and fd.posting_date between fp.start_date and fp.end_date
where fd.doc_type = 'FX_REVALUATION'
  and fd.status = 'POSTED'
  and fp.status in ('HARD_CLOSE', 'SOFT_CLOSE');

comment on view fin.v_fx_posted_after_close is
    'FX revaluation runs posted into a closed fiscal period — compliance violation.';

-- IC eliminations where entity_code matches counterparty (should not happen due to CHECK, but defense in depth)
DROP VIEW IF EXISTS fin.v_ic_entity_mismatch CASCADE;
create or replace view fin.v_ic_entity_mismatch as
select fd.*, ice.counterparty_entity_code, ice.elimination_type
from fin.financial_document fd
join fin.ic_elimination ice
    on ice.tenant_id = fd.tenant_id
   and ice.id = fd.source_ref_id
where fd.doc_type = 'IC_ELIMINATION'
  and ice.entity_code = ice.counterparty_entity_code;

comment on view fin.v_ic_entity_mismatch is
    'IC eliminations where entity matches counterparty — should be prevented by CHECK constraint.';

-- IC eliminations with unbalanced lines (total debits != total credits)
DROP VIEW IF EXISTS fin.v_ic_unbalanced_elimination CASCADE;
create or replace view fin.v_ic_unbalanced_elimination as
select
    fd.id, fd.tenant_id, fd.doc_id, fd.doc_no, fd.doc_type,
    fd.entity_code, fd.status,
    sum(el.debit_amount) as total_debits,
    sum(el.credit_amount) as total_credits,
    abs(sum(el.debit_amount) - sum(el.credit_amount)) as imbalance
from fin.financial_document fd
join fin.ic_elimination ice
    on ice.tenant_id = fd.tenant_id
   and ice.id = fd.source_ref_id
join fin.ic_elimination_line el
    on el.elimination_id = ice.id
   and el.tenant_id = ice.tenant_id
where fd.doc_type = 'IC_ELIMINATION'
  and fd.status in ('APPROVED', 'POSTED')
group by fd.id, fd.tenant_id, fd.doc_id, fd.doc_no, fd.doc_type,
         fd.entity_code, fd.status
having abs(sum(el.debit_amount) - sum(el.credit_amount)) > 0.0001;

comment on view fin.v_ic_unbalanced_elimination is
    'IC elimination entries where total debits do not equal total credits — must balance.';

-- Update the approval-without-scoring view to include Phase 7 doc types
DROP VIEW IF EXISTS fin.v_doc_approved_without_scoring CASCADE;
create or replace view fin.v_doc_approved_without_scoring as
select fd.*
from fin.financial_document fd
where fd.status in ('APPROVED', 'POSTED', 'SETTLED', 'PARTIALLY_SETTLED')
  and fd.doc_type in (
      'PURCHASE_INVOICE', 'PAYMENT_ENTRY', 'CREDIT_NOTE', 'RECLASS',
      'DEBIT_NOTE', 'FX_REVALUATION', 'IC_ELIMINATION'
  )
  and fd.decision_score is null
  and fd.approval_route is null;
