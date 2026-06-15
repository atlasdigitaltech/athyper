-- ============================================================================
-- document/01z_ap_h4_improvements.sql
-- Concept: H4 — AP Improvements Bundle
-- Depends on: H1 FKs, H2 append-only triggers, H3 index dedupe
-- Spec: AP Schema Hardening Plan §H4
--
-- Five improvements:
--   A. Settlement graph view  (v_ap_settlement_graph)
--   B. Match case rollup trigger (exception_count + has_exceptions)
--   C. Over-allocation guard (deferred constraint trigger)
--   D. BRCL active-match uniqueness trigger (preserves same-case splits)
--   E. Payment amount reconciliation trigger (sum(net_payment_amount) ≈ payment_amount)
-- ============================================================================


-- =============================================================================
-- §A  v_ap_settlement_graph — full AP flow projection
-- =============================================================================
-- One view across PI → PIL → AD → JE/JL → PEA → PE → recon → remittance.
-- Recon joins THROUGH bank_recon_case_line (BRCL) per the M:N bridge model.
-- =============================================================================

CREATE OR REPLACE VIEW document.v_ap_settlement_graph AS
SELECT
    pi.id                            AS purchase_invoice_id,
    pi.tenant_id,
    pi.invoice_number,
    pi.status                        AS invoice_status,
    pi.payable_amount,
    pi.paid_amount,
    pi.outstanding_amount,
    pil.id                           AS purchase_invoice_line_id,
    pil.line_no,
    ad.id                            AS accounting_distribution_id,
    je.id                            AS journal_entry_id,
    je.je_number,
    jl.id                            AS journal_line_id,
    pea.id                           AS payment_allocation_id,
    pea.allocated_amount,
    pea.net_payment_amount,
    pe.id                            AS payment_entry_id,
    pe.payment_number,
    pe.status                        AS payment_status,
    pe.is_voided                     AS payment_is_voided,
    prm.id                           AS remittance_output_id,
    brc.id                           AS bank_recon_case_id,
    brc.status                       AS recon_status,
    brc.case_number                  AS recon_case_number
  FROM document.purchase_invoice              pi
  LEFT JOIN document.purchase_invoice_line    pil ON pil.purchase_invoice_id = pi.id
                                                  AND pil.tenant_id           = pi.tenant_id
  LEFT JOIN document.accounting_distribution  ad  ON ad.source_line_id        = pil.id
                                                  AND ad.tenant_id            = pil.tenant_id
                                                  AND ad.source_doc_type      = 'PURCHASE_INVOICE_LINE'
  LEFT JOIN document.journal_entry            je  ON je.id                    = pi.ap_je_id
                                                  AND je.tenant_id            = pi.tenant_id
  LEFT JOIN document.journal_line             jl  ON jl.journal_entry_id      = je.id
                                                  AND jl.tenant_id            = je.tenant_id
  LEFT JOIN document.payment_entry_allocation pea ON pea.purchase_invoice_id  = pi.id
                                                  AND pea.tenant_id           = pi.tenant_id
  LEFT JOIN document.payment_entry            pe  ON pe.id                    = pea.payment_entry_id
                                                  AND pe.tenant_id            = pea.tenant_id
  LEFT JOIN document.bank_recon_case_line     brcl ON brcl.payment_entry_id   = pe.id
                                                   AND brcl.tenant_id          = pe.tenant_id
                                                   AND brcl.side               = 'payment'
  LEFT JOIN document.bank_recon_case          brc  ON brc.id                  = brcl.bank_recon_case_id
                                                   AND brc.tenant_id           = brcl.tenant_id
  LEFT JOIN document.payment_remittance_output prm ON prm.payment_entry_id    = pe.id
                                                   AND prm.tenant_id           = pe.tenant_id;

COMMENT ON VIEW document.v_ap_settlement_graph IS
    'EDGE/DETAIL graph: one row per (PI × PIL × AD × JL × PEA × recon link). '
    'Do NOT SUM PI-level columns (payable_amount, paid_amount, outstanding_amount) directly — '
    'rows are fanned out by 1:N joins and PI columns repeat across joined rows. '
    'For aggregation, use:'
    '  • v_ap_invoice_summary      (one row per invoice)'
    '  • v_ap_settlement_summary   (one row per invoice × payment, with allocated and cash-out totals)'
    'Use this graph view for support investigations, audit trails, and edge-traversal queries.';


-- HF-8: aggregation-safe companion views
CREATE OR REPLACE VIEW document.v_ap_invoice_summary AS
SELECT pi.id                AS purchase_invoice_id,
       pi.tenant_id,
       pi.invoice_number,
       pi.status            AS invoice_status,
       pi.supplier_id,
       pi.payable_amount,
       pi.paid_amount,
       pi.outstanding_amount,
       pi.due_date,
       pi.posting_date,
       pi.company_code_id
  FROM document.purchase_invoice pi;

COMMENT ON VIEW document.v_ap_invoice_summary IS
    'One row per purchase_invoice. Safe for SUM/AVG aggregation over PI columns.';

CREATE OR REPLACE VIEW document.v_ap_settlement_summary AS
SELECT pi.id                            AS purchase_invoice_id,
       pi.tenant_id,
       pi.invoice_number,
       pe.id                            AS payment_entry_id,
       pe.payment_number,
       pe.status                        AS payment_status,
       SUM(pea.allocated_amount)        AS allocated_total,
       SUM(pea.net_payment_amount)      AS cash_out_total,
       SUM(pea.discount_amount)         AS discount_total,
       SUM(pea.withholding_tax_amount)  AS withholding_total,
       SUM(pea.advance_recovery_amount) AS advance_recovery_total,
       SUM(pea.retention_amount)        AS retention_total
  FROM document.purchase_invoice              pi
  JOIN document.payment_entry_allocation      pea ON pea.purchase_invoice_id = pi.id
                                                  AND pea.tenant_id           = pi.tenant_id
  JOIN document.payment_entry                 pe  ON pe.id        = pea.payment_entry_id
                                                  AND pe.tenant_id = pea.tenant_id
 WHERE pe.is_voided = false
   AND pe.status NOT IN ('cancelled','rejected','draft')
 GROUP BY pi.id, pi.tenant_id, pi.invoice_number, pe.id, pe.payment_number, pe.status;

COMMENT ON VIEW document.v_ap_settlement_summary IS
    'One row per (invoice × posted payment). Allocated and cash-out totals decomposed '
    'by reduction type. Safe for settlement reporting and ageing dashboards.';


-- =============================================================================
-- §B  invoice_match_case rollup from match_exception
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
    -- match_exception.status enum: open / pending_approval / approved / rejected /
    -- force_matched / written_off / cancelled. Active = open + pending_approval.
    -- Resolved/rejected/written_off/cancelled exceptions are historical only.
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
    'AFTER INSERT/UPDATE/DELETE on match_exception: recomputes the parent '
    'invoice_match_case.exception_count and has_exceptions flag.';

DROP TRIGGER IF EXISTS trg_imc_rollup_exceptions ON document.match_exception;
CREATE TRIGGER trg_imc_rollup_exceptions
    AFTER INSERT OR UPDATE OR DELETE ON document.match_exception
    FOR EACH ROW EXECUTE FUNCTION document.fn_imc_rollup_exceptions();


-- =============================================================================
-- §C  Over-allocation guard (CONSTRAINT TRIGGER, deferred)
-- =============================================================================
-- Locks the invoice row to serialize concurrent allocations. Joins payment_entry
-- to exclude voided and non-active-status payments. Uses DEFERRABLE INITIALLY
-- DEFERRED so multi-row allocation transactions only check at COMMIT.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_pea_no_over_allocation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_total_allocated numeric(18,4);
    v_invoice_payable numeric(18,4);
BEGIN
    IF NEW.purchase_invoice_id IS NULL THEN
        -- Commitment-only allocations: out of scope for this guard
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
       AND pe.is_voided            = false
       AND pe.status NOT IN ('cancelled','rejected','draft');

    SELECT payable_amount INTO v_invoice_payable
      FROM document.purchase_invoice
     WHERE id        = NEW.purchase_invoice_id
       AND tenant_id = NEW.tenant_id;

    IF v_invoice_payable IS NULL THEN
        -- Invoice not yet posted/has no payable amount yet — skip
        RETURN NEW;
    END IF;

    IF v_total_allocated > v_invoice_payable + 0.01 THEN
        RAISE EXCEPTION
          'AP_OVER_ALLOCATION: invoice % payable=% total_allocated=% (active payments only)',
          NEW.purchase_invoice_id, v_invoice_payable, v_total_allocated
          USING ERRCODE = 'AP020';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pea_no_over_allocation() IS
    'Constraint trigger: sum of active-payment allocated_amount for an invoice '
    'must not exceed payable_amount. Locks invoice row to serialize across '
    'concurrent transactions; deferred until COMMIT for multi-line writes.';

DROP TRIGGER IF EXISTS trg_pea_no_over_allocation ON document.payment_entry_allocation;
CREATE CONSTRAINT TRIGGER trg_pea_no_over_allocation
    AFTER INSERT ON document.payment_entry_allocation
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION document.fn_pea_no_over_allocation();


-- =============================================================================
-- §D  BRCL active-match uniqueness trigger
-- =============================================================================
-- BRCL has no status column; status lives on bank_recon_case. This trigger
-- rejects the case where the SAME payment_entry OR bank_statement_line already
-- appears in a DIFFERENT active recon case. Same-case splits remain allowed
-- (legitimate matching pattern).
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_brcl_active_uniqueness()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_conflict_count integer;
BEGIN
    IF NEW.side = 'payment' THEN
        -- HF-3: serialize concurrent inserts for the same (tenant, payment_entry)
        -- via transaction-scoped advisory lock. Without this, two concurrent
        -- transactions can both pass the COUNT check before either commits.
        PERFORM pg_advisory_xact_lock(
            hashtextextended(NEW.tenant_id::text || ':pe:' || NEW.payment_entry_id::text, 0)
        );

        SELECT COUNT(*) INTO v_conflict_count
          FROM document.bank_recon_case_line brcl
          JOIN document.bank_recon_case      brc ON brc.id        = brcl.bank_recon_case_id
                                                AND brc.tenant_id = brcl.tenant_id
         WHERE brcl.tenant_id            = NEW.tenant_id
           AND brcl.payment_entry_id     = NEW.payment_entry_id
           AND brcl.bank_recon_case_id  <> NEW.bank_recon_case_id   -- different case
           AND brc.status               <> 'voided';
        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION
              'BRCL_DUPLICATE_PAYMENT: payment_entry % already attached to an active recon case',
              NEW.payment_entry_id
              USING ERRCODE = 'AP030';
        END IF;
    ELSIF NEW.side = 'statement' THEN
        -- HF-3: same advisory lock pattern for the statement side
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
              NEW.bank_statement_line_id
              USING ERRCODE = 'AP031';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_brcl_active_uniqueness() IS
    'BEFORE INSERT on bank_recon_case_line: a payment_entry / bank_statement_line '
    'may appear in only ONE active (status<>voided) recon case at a time. '
    'Same-case splits remain allowed.';

DROP TRIGGER IF EXISTS trg_brcl_active_uniqueness ON document.bank_recon_case_line;
CREATE TRIGGER trg_brcl_active_uniqueness
    BEFORE INSERT ON document.bank_recon_case_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_brcl_active_uniqueness();


-- =============================================================================
-- §E  Payment amount reconciliation
-- =============================================================================
-- payment_amount represents CASH OUT. It should reconcile to
-- SUM(payment_entry_allocation.net_payment_amount). Fires on the posted
-- transition. CONSTRAINT TRIGGER deferred so allocations and header settle
-- together inside the same transaction.
--
-- NOTE: payment_entry has no bank_fee_amount column. Bank fees, if recorded,
-- live in metadata. Without a column model for fees, the check is strict: the
-- fee story is a follow-on (PE column addition + JE leg).
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_payment_amount_reconciliation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_sum_net      numeric(18,4);
BEGIN
    SELECT COALESCE(SUM(net_payment_amount), 0)
      INTO v_sum_net
      FROM document.payment_entry_allocation
     WHERE payment_entry_id = NEW.id
       AND tenant_id        = NEW.tenant_id;

    IF abs(NEW.payment_amount - v_sum_net) > 0.01 THEN
        RAISE EXCEPTION
          'PE_AMOUNT_DRIFT: payment_amount=% does not match SUM(net_payment_amount)=% (diff=%)',
          NEW.payment_amount, v_sum_net, NEW.payment_amount - v_sum_net
          USING ERRCODE = 'AP040';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_payment_amount_reconciliation() IS
    'Constraint trigger (deferred): asserts payment_amount = SUM(allocation.net_payment_amount) '
    'within ±0.01 at the posted transition. Bank fees (when modeled as a PE column) '
    'will be added to the equation in a follow-on patch.';

DROP TRIGGER IF EXISTS trg_payment_amount_reconciliation ON document.payment_entry;
CREATE CONSTRAINT TRIGGER trg_payment_amount_reconciliation
    AFTER UPDATE OF status ON document.payment_entry
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW WHEN (NEW.status = 'posted')
    EXECUTE FUNCTION document.fn_payment_amount_reconciliation();


-- =============================================================================
-- End of 01z_ap_h4_improvements.sql
-- =============================================================================
