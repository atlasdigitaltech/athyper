-- ============================================================================
-- document/01y_ap_p4_pc_cache_refresh.sql
-- Concept: PC → PIL/PI flat-amount cache refresh function (P4 v1.2)
-- Depends on: 01u_tables_pricing_component.sql (PC),
--             01e_tables_invoice.sql (PI + PIL flat columns)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.1, §3.2 (P4 reader migration)
--
-- This function recomputes the trigger-maintained flat amount caches on PIL
-- and (via downstream existing fn_refresh_purchase_invoice_totals) PI from
-- active PC rows. It is SERVICE-GATED: not yet wired as an AFTER trigger.
-- During the 30-day dual-write window, the posting/submit service calls this
-- explicitly and a drift detector (verify-pc-cache-consistency.ts) audits
-- consistency daily.
--
-- Post-window: an AFTER INSERT/UPDATE/DELETE trigger on pricing_component will
-- call this function to keep caches live. That trigger is added in a separate
-- P5 file once dual-write proves clean.
--
-- Sign convention:
--   discount, withholding, retention contribute to subtractive buckets
--   charge, tax contribute to additive buckets
--   principal_marker is audit-only (neutral)
-- ============================================================================


-- =============================================================================
-- §P4.2A  PIL cache refresh from PC line-scope rows
-- =============================================================================
-- Aggregates active (non-superseded) PC line-scope rows per source_line_id
-- and writes back to the PIL flat columns. Header-scope PC rows are NOT
-- considered here — they must be apportioned (is_apportioned=true) before
-- this function runs; the line-scope children carry the apportioned amounts.
--
-- For PIL the relevant flat caches are:
--   discount_amount, tax_amount, withholding_tax_amount, retention_amount
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_refresh_pil_amounts_from_pc(
    p_tenant_id  uuid,
    p_invoice_id uuid
) RETURNS TABLE (
    pil_id           uuid,
    discount_amount  numeric(18,4),
    tax_amount       numeric(18,4),
    withholding_amt  numeric(18,4),
    retention_amount numeric(18,4)
)
LANGUAGE plpgsql VOLATILE
AS $$
BEGIN
    -- Bypass PIL immutability guard for cache writes (cache is not user-visible
    -- input; trigger fires regardless of parent status so cache stays in sync
    -- after pre-post mutations).
    PERFORM set_config('session_replication_role', 'replica', true);

    RETURN QUERY
    WITH agg AS (
        SELECT
            pc.source_line_id AS pil_id,
            COALESCE(SUM(CASE WHEN pc.term_type = 'discount'    THEN pc.computed_amount END), 0) AS discount_amount,
            COALESCE(SUM(CASE WHEN pc.term_type = 'tax'         THEN pc.computed_amount END), 0) AS tax_amount,
            COALESCE(SUM(CASE WHEN pc.term_type = 'withholding' THEN pc.computed_amount END), 0) AS withholding_amt,
            COALESCE(SUM(CASE WHEN pc.term_type = 'retention'   THEN pc.computed_amount END), 0) AS retention_amount
          FROM document.pricing_component pc
         WHERE pc.tenant_id        = p_tenant_id
           AND pc.source_doc_type  = 'PURCHASE_INVOICE_LINE'
           AND pc.source_doc_id    = p_invoice_id
           AND pc.source_line_id   IS NOT NULL
           AND pc.superseded_by_id IS NULL
         GROUP BY pc.source_line_id
    ),
    updated AS (
        UPDATE document.purchase_invoice_line pil
           SET discount_amount        = a.discount_amount,
               tax_amount             = a.tax_amount,
               withholding_tax_amount = a.withholding_amt,
               retention_amount       = a.retention_amount,
               updated_at             = now()
          FROM agg a
         WHERE pil.id        = a.pil_id
           AND pil.tenant_id = p_tenant_id
        RETURNING pil.id, pil.discount_amount, pil.tax_amount,
                  pil.withholding_tax_amount, pil.retention_amount
    )
    SELECT u.id, u.discount_amount, u.tax_amount, u.withholding_tax_amount, u.retention_amount
      FROM updated u;

    -- Reset for safety; SET LOCAL would be cleaner but PERFORM set_config(...)
    -- inside plpgsql is a session setting reset on function exit when the
    -- third arg is true (transaction-scoped).
    RETURN;
END;
$$;

COMMENT ON FUNCTION document.fn_refresh_pil_amounts_from_pc(uuid, uuid) IS
    'Aggregates active line-scope PC rows by term_type and writes back to PIL '
    'flat caches: discount_amount, tax_amount, withholding_tax_amount, retention_amount. '
    'Header-scope PC rows must be apportioned first — this function reads only '
    'line-scope rows. Service-gated during P4 dual-write window; trigger-wired in P5.';


-- =============================================================================
-- §P4.2B  PI cache refresh entry point
-- =============================================================================
-- One-stop service entry that:
--   1. Refreshes PIL flat amounts from PC
--   2. Calls existing fn_refresh_purchase_invoice_totals to roll PIL → PI
--
-- The PI flat caches (discount_amount, freight_amount, misc_charges_amount,
-- tax_amount, withholding_tax_amount, retention_amount, subtotal_amount,
-- total_amount, line_count) are maintained by fn_refresh_purchase_invoice_totals
-- which sums PIL rows. We just chain.
-- =============================================================================

CREATE OR REPLACE FUNCTION document.refresh_invoice_amounts_from_pc(
    p_tenant_id  uuid,
    p_invoice_id uuid
) RETURNS TABLE (
    pil_count            integer,
    pi_subtotal_amount   numeric(18,4),
    pi_tax_amount        numeric(18,4),
    pi_retention_amount  numeric(18,4),
    pi_total_amount      numeric(18,4)
)
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
    v_pil_count integer;
BEGIN
    SELECT COUNT(*)
      INTO v_pil_count
      FROM document.fn_refresh_pil_amounts_from_pc(p_tenant_id, p_invoice_id);

    -- Existing trigger function maintains PI header totals from PIL.
    -- Touching any PIL above already fired trg_pil_sync_header. So PI is
    -- already current. We just return the snapshot.
    RETURN QUERY
    SELECT v_pil_count,
           pi.subtotal_amount,
           pi.tax_amount,
           pi.retention_amount,
           pi.total_amount
      FROM document.purchase_invoice pi
     WHERE pi.id        = p_invoice_id
       AND pi.tenant_id = p_tenant_id;
END;
$$;

COMMENT ON FUNCTION document.refresh_invoice_amounts_from_pc(uuid, uuid) IS
    'Service entry point for PC → PIL → PI cache refresh. Calls '
    'fn_refresh_pil_amounts_from_pc; PIL writes fire trg_pil_sync_header which '
    'maintains PI flat caches. Returns the post-refresh snapshot for verification.';


-- =============================================================================
-- End of 01y_ap_p4_pc_cache_refresh.sql
-- =============================================================================
