-- ============================================================================
-- document/06y_ap_payment_status_overalloc_guard.sql
-- Concept: HF-2 — Lifecycle over-allocation guard at payment_entry status transition
-- Depends on: 01z_ap_h4_improvements.sql (existing trg_pea_no_over_allocation)
-- Spec: Hardening Sprint H-Fix §HF-2
--
-- The existing trg_pea_no_over_allocation on PEA insert excludes drafts from
-- the active-allocation sum. That leaves a race: two draft payments can each
-- allocate $1000 against a $1000 invoice; both pass the insert check; both
-- transition to approved/posted, landing $2000 of actual allocation.
--
-- This trigger fires on payment_entry.status transitioning OUT OF draft. It
-- re-runs the over-allocation check INCLUDING the transitioning payment under
-- its new status. Locks the invoice row to serialize concurrent transitions.
-- DEFERRABLE INITIALLY DEFERRED so a multi-line approval flow only checks at
-- COMMIT.
-- ============================================================================

CREATE OR REPLACE FUNCTION document.fn_pe_status_transition_overalloc_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_invoice_id      uuid;
    v_total_allocated numeric(18,4);
    v_invoice_payable numeric(18,4);
BEGIN
    -- Skip if status didn't change
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
    -- Skip if not moving to an active payment state
    IF NEW.status NOT IN ('pending_approval','approved','posted','partially_paid','fully_paid') THEN
        RETURN NEW;
    END IF;
    -- Skip if payment has been voided (no allocation effect)
    IF NEW.is_voided = true THEN RETURN NEW; END IF;

    -- For each invoice this payment allocates to:
    --   1. Lock the invoice row to serialize concurrent transitions.
    --   2. Sum allocated_amount across all PEAs where the parent payment is
    --      either this row (under NEW status) OR already in an active state.
    --   3. Compare against payable_amount; raise on overflow.
    FOR v_invoice_id IN
        SELECT DISTINCT purchase_invoice_id
          FROM document.payment_entry_allocation
         WHERE payment_entry_id    = NEW.id
           AND tenant_id           = NEW.tenant_id
           AND purchase_invoice_id IS NOT NULL
    LOOP
        PERFORM 1
           FROM document.purchase_invoice
          WHERE id        = v_invoice_id
            AND tenant_id = NEW.tenant_id
            FOR UPDATE;

        SELECT COALESCE(SUM(pea.allocated_amount), 0) INTO v_total_allocated
          FROM document.payment_entry_allocation pea
          JOIN document.payment_entry            pe ON pe.id        = pea.payment_entry_id
                                                    AND pe.tenant_id = pea.tenant_id
         WHERE pea.purchase_invoice_id = v_invoice_id
           AND pea.tenant_id           = NEW.tenant_id
           AND pe.is_voided            = false
           AND (
                pe.id = NEW.id   -- this payment, under its NEW status (post-transition view)
             OR pe.status IN ('pending_approval','approved','posted','partially_paid','fully_paid')
           );

        SELECT payable_amount INTO v_invoice_payable
          FROM document.purchase_invoice
         WHERE id        = v_invoice_id
           AND tenant_id = NEW.tenant_id;

        -- Skip invoices without a payable amount yet (not posted)
        IF v_invoice_payable IS NULL THEN CONTINUE; END IF;

        IF v_total_allocated > v_invoice_payable + 0.01 THEN
            RAISE EXCEPTION
              'AP_OVER_ALLOCATION_ON_TRANSITION: invoice % payable=% allocated_after_transition=% (this PE status: %→%)',
              v_invoice_id, v_invoice_payable, v_total_allocated, OLD.status, NEW.status
              USING ERRCODE = 'AP021';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pe_status_transition_overalloc_check() IS
    'Constraint trigger: at payment_entry.status transition out of draft (or '
    'between any active states), verifies the invoice payable would not be '
    'over-allocated. Closes the draft-to-active race left by the PEA-insert guard. '
    'Locks invoice row; DEFERRABLE INITIALLY DEFERRED.';

DROP TRIGGER IF EXISTS trg_pe_status_overalloc_check ON document.payment_entry;
CREATE CONSTRAINT TRIGGER trg_pe_status_overalloc_check
    AFTER UPDATE OF status ON document.payment_entry
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION document.fn_pe_status_transition_overalloc_check();


-- =============================================================================
-- End of 06y_ap_payment_status_overalloc_guard.sql
-- =============================================================================
