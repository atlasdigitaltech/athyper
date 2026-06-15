-- ============================================================================
-- document/05_functions_ap_improvements.sql
-- Concept: HF2-3 — All AP H4/HF2 trigger functions, in proper phase-80 slot
-- Depends on: log/05_functions.sql (log.trg_prevent_mutation),
--             01u_tables_pricing_component.sql, 01f_tables_payment.sql,
--             01p_tables_bank_recon.sql, 01e_tables_invoice.sql
-- Spec: Hardening Sprint H-Fix-2 §HF2-3, §HF2-5
--
-- Previously these functions lived alongside their tables in
-- 01z_ap_h4_improvements.sql, but creating them at phase 40 means they
-- cannot reference shared/log helpers that exist only at phase 80. Moving
-- them here ensures clean-deploy ordering: tables (40) → log functions (80
-- in log/05) → these functions (80 in document/05) → triggers (90).
--
-- 01z_ap_h4_improvements.sql is preserved as a header-only stub for backward
-- documentation. New deploys execute the split files.
-- ============================================================================


-- =============================================================================
-- §A  Settlement-effective predicates  (HF2-3)
-- =============================================================================
-- One canonical predicate is not enough — "settlement-effective" mixes two
-- distinct business events. Split into two helpers:
--
--   fn_pe_allocations_reserved : the payment's allocations reserve AP exposure.
--                                Used by over-allocation guards. Includes
--                                pending_approval / approved (workflow-stream),
--                                plus posted / transmitted / printed / cleared.
--
--   fn_pe_cash_effective       : the payment has actually moved cash and JE
--                                rows are final. Used by payment_amount
--                                reconciliation and cash-out reporting. Only
--                                posted / transmitted / printed / cleared.
--
-- EXCLUDED from both: draft (not committed), cancelled (workflow rejection),
--                     rejected, reversed (offset by reversal), voided.
-- Both helpers additionally require is_voided=false (defense in depth).
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_pe_allocations_reserved(
    p_status    text,
    p_is_voided boolean
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT COALESCE(p_is_voided, false) = false
       AND p_status IN ('pending_approval','approved','posted','transmitted','printed','cleared')
$$;

COMMENT ON FUNCTION document.fn_pe_allocations_reserved(text, boolean) IS
    'True when this payment_entry''s allocations reserve AP exposure. Covers '
    'workflow-stream (pending_approval, approved) plus cash-effective states. '
    'Used by over-allocation guards.';


CREATE OR REPLACE FUNCTION document.fn_pe_cash_effective(
    p_status    text,
    p_is_voided boolean
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT COALESCE(p_is_voided, false) = false
       AND p_status IN ('posted','transmitted','printed','cleared')
$$;

COMMENT ON FUNCTION document.fn_pe_cash_effective(text, boolean) IS
    'True when this payment_entry has moved cash and JE rows are final. '
    'Used by payment_amount reconciliation and cash-out reporting. Stricter '
    'than fn_pe_allocations_reserved — excludes pending_approval/approved.';


-- =============================================================================
-- §B  invoice_match_case rollup from match_exception (HF-7 active filter)
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_imc_rollup_exceptions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_case_id uuid;
    v_tenant  uuid;
BEGIN
    v_case_id := COALESCE(NEW.invoice_match_case_id, OLD.invoice_match_case_id);
    v_tenant  := COALESCE(NEW.tenant_id, OLD.tenant_id);

    -- HF-7: only ACTIVE exceptions count toward has_exceptions / exception_count.
    UPDATE document.invoice_match_case
       SET exception_count = (
            SELECT COUNT(*)::smallint FROM document.match_exception
             WHERE invoice_match_case_id = v_case_id
               AND tenant_id             = v_tenant
               AND status IN ('open','pending_approval')
       ),
           has_exceptions = EXISTS(
              SELECT 1 FROM document.match_exception
               WHERE invoice_match_case_id = v_case_id
                 AND tenant_id             = v_tenant
                 AND status IN ('open','pending_approval')
           ),
           updated_at = now()
     WHERE id        = v_case_id
       AND tenant_id = v_tenant;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION document.fn_imc_rollup_exceptions() IS
    'AFTER INSERT/UPDATE/DELETE on match_exception: recomputes parent '
    'invoice_match_case.exception_count and has_exceptions (active exceptions only).';


-- =============================================================================
-- §C  Over-allocation guard (HF2-5 revised — PE-status check FIRST)
-- =============================================================================
-- The reviewer flagged that the prior guard returned early when
-- purchase_invoice_id IS NULL, leaving commitment-only PEAs un-guarded against
-- the "parent PE already settlement-effective" case. This revised function:
--   1. Always checks parent PE status FIRST (every PEA INSERT).
--   2. Only runs the invoice-specific over-allocation logic when
--      purchase_invoice_id IS NOT NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_pea_no_over_allocation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_parent_status   text;
    v_parent_voided   boolean;
    v_total_allocated numeric(18,4);
    v_invoice_payable numeric(18,4);
BEGIN
    -- (HF2-5) Step 1 — ALWAYS check parent PE status before any other logic.
    -- Allocations must be set BEFORE the payment is settlement-effective.
    -- Posting / transmitting / clearing without this check breaks the
    -- invariant payment_amount = SUM(net_payment_amount).
    SELECT status, is_voided INTO v_parent_status, v_parent_voided
      FROM document.payment_entry
     WHERE id = NEW.payment_entry_id AND tenant_id = NEW.tenant_id;

    IF v_parent_status IS NULL THEN
        RAISE EXCEPTION
          'PEA_PARENT_NOT_FOUND: payment_entry % not found in tenant %',
          NEW.payment_entry_id, NEW.tenant_id USING ERRCODE = 'AP019';
    END IF;

    -- A payment in any cash-effective state is locked — no more PEAs.
    -- Workflow-stream states (pending_approval, approved) still allow inserts
    -- so corrections during approval are possible; the status-transition
    -- guard (06y) re-runs the over-allocation check at the transition.
    IF document.fn_pe_cash_effective(v_parent_status, v_parent_voided) THEN
        RAISE EXCEPTION
          'PEA_PARENT_ALREADY_EFFECTIVE: cannot add allocation to payment_entry % (status=%); allocations are locked once the payment moves cash',
          NEW.payment_entry_id, v_parent_status USING ERRCODE = 'AP022';
    END IF;

    -- Step 2 — Invoice-specific over-allocation check (skip for commitment-only)
    IF NEW.purchase_invoice_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Serialize concurrent allocations against the same invoice
    PERFORM 1
       FROM document.purchase_invoice
      WHERE id        = NEW.purchase_invoice_id
        AND tenant_id = NEW.tenant_id
        FOR UPDATE;

    SELECT COALESCE(SUM(pea.allocated_amount), 0)
      INTO v_total_allocated
      FROM document.payment_entry_allocation pea
      JOIN document.payment_entry            pe ON pe.id        = pea.payment_entry_id
                                                AND pe.tenant_id = pea.tenant_id
     WHERE pea.purchase_invoice_id = NEW.purchase_invoice_id
       AND pea.tenant_id           = NEW.tenant_id
       AND document.fn_pe_allocations_reserved(pe.status, pe.is_voided) = true;

    SELECT payable_amount INTO v_invoice_payable
      FROM document.purchase_invoice
     WHERE id        = NEW.purchase_invoice_id
       AND tenant_id = NEW.tenant_id;

    -- Not posted yet — skip; the status-transition guard catches it later.
    IF v_invoice_payable IS NULL THEN RETURN NEW; END IF;

    IF v_total_allocated > v_invoice_payable + 0.01 THEN
        RAISE EXCEPTION
          'AP_OVER_ALLOCATION: invoice % payable=% total_allocated=% (reserved payments only)',
          NEW.purchase_invoice_id, v_invoice_payable, v_total_allocated
          USING ERRCODE = 'AP020';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pea_no_over_allocation() IS
    'BEFORE INSERT on payment_entry_allocation: (1) always block PEA inserts '
    'when parent PE is cash-effective (locked allocations); (2) for '
    'invoice-bound PEAs, also enforce SUM(allocated) ≤ payable using '
    'fn_pe_allocations_reserved as the active-payment predicate.';


-- =============================================================================
-- §D  BRCL active-match uniqueness (HF-3 advisory lock preserved)
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_brcl_active_uniqueness()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_conflict_count integer;
BEGIN
    IF NEW.side = 'payment' THEN
        -- HF-3: serialize concurrent inserts for the same (tenant, payment_entry)
        PERFORM pg_advisory_xact_lock(
            hashtextextended(NEW.tenant_id::text || ':pe:' || NEW.payment_entry_id::text, 0)
        );

        SELECT COUNT(*) INTO v_conflict_count
          FROM document.bank_recon_case_line brcl
          JOIN document.bank_recon_case      brc ON brc.id        = brcl.bank_recon_case_id
                                                AND brc.tenant_id = brcl.tenant_id
         WHERE brcl.tenant_id            = NEW.tenant_id
           AND brcl.payment_entry_id     = NEW.payment_entry_id
           AND brcl.bank_recon_case_id  <> NEW.bank_recon_case_id
           AND brc.status               <> 'voided';
        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION
              'BRCL_DUPLICATE_PAYMENT: payment_entry % already attached to an active recon case',
              NEW.payment_entry_id USING ERRCODE = 'AP030';
        END IF;
    ELSIF NEW.side = 'statement' THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended(NEW.tenant_id::text || ':bsl:' || NEW.bank_statement_line_id::text, 0)
        );

        SELECT COUNT(*) INTO v_conflict_count
          FROM document.bank_recon_case_line brcl
          JOIN document.bank_recon_case      brc ON brc.id        = brcl.bank_recon_case_id
                                                AND brc.tenant_id = brcl.tenant_id
         WHERE brcl.tenant_id              = NEW.tenant_id
           AND brcl.bank_statement_line_id = NEW.bank_statement_line_id
           AND brcl.bank_recon_case_id    <> NEW.bank_recon_case_id
           AND brc.status                 <> 'voided';
        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION
              'BRCL_DUPLICATE_STATEMENT: bank_statement_line % already attached to an active recon case',
              NEW.bank_statement_line_id USING ERRCODE = 'AP031';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_brcl_active_uniqueness() IS
    'BEFORE INSERT on bank_recon_case_line: serializes concurrent inserts via '
    'pg_advisory_xact_lock, then rejects when the same payment_entry or '
    'bank_statement_line is already attached to a different active recon case.';


-- =============================================================================
-- §E  Payment amount reconciliation (HF2-3 — use fn_pe_cash_effective)
-- =============================================================================
-- payment_amount represents cash out. Must equal SUM(net_payment_amount) ±0.01
-- whenever the payment is cash-effective. Fires on status update to any of
-- posted/transmitted/printed/cleared (was previously only 'posted').
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_payment_amount_reconciliation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_sum_net numeric(18,4);
BEGIN
    SELECT COALESCE(SUM(net_payment_amount), 0)
      INTO v_sum_net
      FROM document.payment_entry_allocation
     WHERE payment_entry_id = NEW.id
       AND tenant_id        = NEW.tenant_id;

    IF abs(NEW.payment_amount - v_sum_net) > 0.01 THEN
        RAISE EXCEPTION
          'PE_AMOUNT_DRIFT: payment_amount=% does not match SUM(net_payment_amount)=% (diff=%) at status=%',
          NEW.payment_amount, v_sum_net, NEW.payment_amount - v_sum_net, NEW.status
          USING ERRCODE = 'AP040';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_payment_amount_reconciliation() IS
    'Constraint trigger: asserts payment_amount = SUM(allocation.net_payment_amount) '
    '±0.01 when the payment transitions to any cash-effective state. Uses '
    'fn_pe_cash_effective in the WHEN clause of the trigger that attaches it.';


-- =============================================================================
-- §F  PE status transition over-allocation guard (HF-2 revised — use predicates)
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_pe_status_transition_overalloc_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_invoice_id      uuid;
    v_total_allocated numeric(18,4);
    v_invoice_payable numeric(18,4);
BEGIN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
    -- Only run when transitioning INTO an allocations-reserved state.
    IF document.fn_pe_allocations_reserved(NEW.status, NEW.is_voided) = false THEN
        RETURN NEW;
    END IF;

    FOR v_invoice_id IN
        SELECT DISTINCT purchase_invoice_id
          FROM document.payment_entry_allocation
         WHERE payment_entry_id    = NEW.id
           AND tenant_id           = NEW.tenant_id
           AND purchase_invoice_id IS NOT NULL
    LOOP
        PERFORM 1 FROM document.purchase_invoice
         WHERE id = v_invoice_id AND tenant_id = NEW.tenant_id FOR UPDATE;

        SELECT COALESCE(SUM(pea.allocated_amount), 0) INTO v_total_allocated
          FROM document.payment_entry_allocation pea
          JOIN document.payment_entry            pe ON pe.id        = pea.payment_entry_id
                                                    AND pe.tenant_id = pea.tenant_id
         WHERE pea.purchase_invoice_id = v_invoice_id
           AND pea.tenant_id           = NEW.tenant_id
           AND (
                pe.id = NEW.id   -- this row under its NEW status (post-transition view)
             OR document.fn_pe_allocations_reserved(pe.status, pe.is_voided) = true
           );

        SELECT payable_amount INTO v_invoice_payable
          FROM document.purchase_invoice
         WHERE id = v_invoice_id AND tenant_id = NEW.tenant_id;

        IF v_invoice_payable IS NULL THEN CONTINUE; END IF;

        IF v_total_allocated > v_invoice_payable + 0.01 THEN
            RAISE EXCEPTION
              'AP_OVER_ALLOCATION_ON_TRANSITION: invoice % payable=% allocated_after_transition=% (this PE %→%)',
              v_invoice_id, v_invoice_payable, v_total_allocated, OLD.status, NEW.status
              USING ERRCODE = 'AP021';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pe_status_transition_overalloc_check() IS
    'Constraint trigger: at any payment_entry status change INTO an '
    'allocations-reserved state, re-runs the over-allocation check using '
    'fn_pe_allocations_reserved as the active-payment predicate. Locks invoice '
    'row to serialize concurrent transitions; DEFERRABLE INITIALLY DEFERRED.';


-- =============================================================================
-- End of 05_functions_ap_improvements.sql
-- =============================================================================
