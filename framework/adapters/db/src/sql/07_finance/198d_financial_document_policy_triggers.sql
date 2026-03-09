/* ============================================================================
   Athyper v2.1 — Financial Document Registry: Policy Tightening Triggers
   Schema: fin
   Dependencies: 198c_financial_document_refinements.sql

   SQL-level invariant enforcement:
     1. Terminal docs cannot lose JE linkage
     2. Posted docs cannot regress to pre-posted status
     3. Reversal metadata must be set atomically
     4. Multi-book bridge rows are immutable once POSTED
   ============================================================================ */

-- ============================================================================
-- 1. Terminal JE Linkage Protection
-- Once a doc has je_id set and reaches a posted/terminal status,
-- je_id cannot be NULLed out.
-- ============================================================================
create or replace function fin.trg_guard_je_linkage()
returns trigger
language plpgsql as $$
begin
    if OLD.je_id is not null
       and NEW.je_id is null
       and OLD.status in ('POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'REVERSED')
    then
        raise exception
            'Cannot remove JE linkage from document % in terminal status %',
            OLD.doc_no, OLD.status
        using errcode = 'restrict_violation';
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_fin_doc_je_linkage_guard on fin.financial_document;
create trigger trg_fin_doc_je_linkage_guard
    before update on fin.financial_document
    for each row execute function fin.trg_guard_je_linkage();

-- ============================================================================
-- 2. Status Regression Prevention
-- Terminal statuses (POSTED, REVERSED, VOIDED, SETTLED) cannot regress
-- back to pre-terminal statuses (DRAFT, IN_REVIEW, APPROVED).
-- Exception: trigger-based sync can update POSTED → REVERSED/VOIDED/SETTLED.
-- ============================================================================
create or replace function fin.trg_guard_status_regression()
returns trigger
language plpgsql as $$
declare
    v_terminal_statuses text[] := array[
        'POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'REVERSED', 'VOIDED'
    ];
    v_pre_terminal text[] := array[
        'DRAFT', 'IN_REVIEW', 'APPROVED', 'POSTING_PENDING'
    ];
begin
    -- Only guard regression: terminal → pre-terminal
    if OLD.status = any(v_terminal_statuses)
       and NEW.status = any(v_pre_terminal)
    then
        raise exception
            'Cannot regress document % from % to %. Terminal status is irreversible.',
            OLD.doc_no, OLD.status, NEW.status
        using errcode = 'restrict_violation';
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_fin_doc_status_regression_guard on fin.financial_document;
create trigger trg_fin_doc_status_regression_guard
    before update on fin.financial_document
    for each row execute function fin.trg_guard_status_regression();

-- ============================================================================
-- 3. Reversal Metadata Atomicity
-- When status transitions TO 'REVERSED', at least one of
-- reversed_doc_id or reversing_doc_id must be set.
-- ============================================================================
create or replace function fin.trg_guard_reversal_metadata()
returns trigger
language plpgsql as $$
begin
    if NEW.status = 'REVERSED'
       and OLD.status != 'REVERSED'
       and NEW.reversed_doc_id is null
       and NEW.reversing_doc_id is null
    then
        raise exception
            'Document % transitioning to REVERSED must have reversed_doc_id or reversing_doc_id set',
            NEW.doc_no
        using errcode = 'check_violation';
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_fin_doc_reversal_metadata_guard on fin.financial_document;
create trigger trg_fin_doc_reversal_metadata_guard
    before update on fin.financial_document
    for each row execute function fin.trg_guard_reversal_metadata();

-- ============================================================================
-- 4. Multi-Book Bridge Immutability
-- Once a bridge row has posting_status = 'POSTED', it cannot be deleted.
-- Status can transition POSTED → REVERSED (not back).
-- ============================================================================
create or replace function fin.trg_guard_bridge_immutability()
returns trigger
language plpgsql as $$
begin
    if TG_OP = 'DELETE' then
        if OLD.posting_status = 'POSTED' then
            raise exception
                'Cannot delete posting bridge row for doc % in book % (status POSTED)',
                OLD.doc_id, OLD.book_code
            using errcode = 'restrict_violation';
        end if;
        return OLD;
    end if;

    if TG_OP = 'UPDATE' then
        -- Cannot regress from POSTED back to anything other than REVERSED
        if OLD.posting_status = 'POSTED' and NEW.posting_status not in ('POSTED', 'REVERSED') then
            raise exception
                'Bridge posting for doc % book % cannot regress from POSTED to %',
                OLD.doc_id, OLD.book_code, NEW.posting_status
            using errcode = 'restrict_violation';
        end if;
        -- Cannot undo a REVERSED posting
        if OLD.posting_status = 'REVERSED' and NEW.posting_status != 'REVERSED' then
            raise exception
                'Bridge posting for doc % book % cannot undo REVERSED status',
                OLD.doc_id, OLD.book_code
            using errcode = 'restrict_violation';
        end if;
    end if;

    return NEW;
end;
$$;

drop trigger if exists trg_fin_bridge_immutability_guard on fin.financial_document_posting;
create trigger trg_fin_bridge_immutability_guard
    before update or delete on fin.financial_document_posting
    for each row execute function fin.trg_guard_bridge_immutability();
