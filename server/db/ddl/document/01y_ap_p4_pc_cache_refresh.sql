-- =============================================================================
-- AP Pricing Component cache refresh - Phase 1 reset-safe canonical version
--
-- Public function names are preserved for service compatibility. The reset model
-- no longer stores flat discount/freight/misc/retention pct caches on PI/PIL, so
-- this file refreshes only surviving line tax/WHT amounts and header totals.
-- =============================================================================

DROP FUNCTION IF EXISTS document.fn_refresh_pil_amounts_from_pc(uuid, uuid);

CREATE OR REPLACE FUNCTION document.fn_refresh_pil_amounts_from_pc(
    p_tenant_id  uuid,
    p_invoice_id uuid
) RETURNS TABLE (
    pil_id           uuid,
    discount_amount  numeric(18,4),
    tax_amount       numeric(18,4),
    withholding_amt  numeric(18,4),
    retention_amount numeric(18,4),
    gross_amount     numeric(18,4)
) LANGUAGE sql AS $$
    WITH pc_amounts AS (
        SELECT
            pc.source_line_id AS pil_id,
            COALESCE(SUM(CASE WHEN pc.term_type = 'tax' THEN pc.computed_amount END), 0) AS tax_amount,
            COALESCE(SUM(CASE WHEN pc.term_type = 'withholding' THEN pc.computed_amount END), 0) AS withholding_amt
        FROM document.pricing_component pc
        WHERE pc.tenant_id = p_tenant_id
          AND pc.source_doc_type = 'purchase_invoice_line'
          AND pc.source_doc_id = p_invoice_id
          AND pc.source_line_id IS NOT NULL
          AND pc.superseded_by_id IS NULL
        GROUP BY pc.source_line_id
    ), updated AS (
        UPDATE document.purchase_invoice_line pil
           SET tax_amount = COALESCE(a.tax_amount, 0),
               withholding_tax_amount = COALESCE(a.withholding_amt, 0),
               updated_at = now()
          FROM document.purchase_invoice_line pil_scan
          LEFT JOIN pc_amounts a ON a.pil_id = pil_scan.id
         WHERE pil.id = pil_scan.id
           AND pil_scan.tenant_id = p_tenant_id
           AND pil_scan.purchase_invoice_id = p_invoice_id
        RETURNING pil.id,
                  0::numeric(18,4) AS discount_amount,
                  pil.tax_amount,
                  pil.withholding_tax_amount,
                  0::numeric(18,4) AS retention_amount,
                  pil.gross_amount
    )
    SELECT u.id, u.discount_amount, u.tax_amount, u.withholding_tax_amount,
           u.retention_amount, u.gross_amount
      FROM updated u;
$$;

COMMENT ON FUNCTION document.fn_refresh_pil_amounts_from_pc(uuid, uuid) IS
    'Aggregates active line-scope pricing components into surviving PIL flat caches: tax_amount and withholding_tax_amount. Compatibility return columns for removed discount/retention caches are zero.';

DROP FUNCTION IF EXISTS document.refresh_invoice_amounts_from_pc(uuid, uuid);

CREATE OR REPLACE FUNCTION document.refresh_invoice_amounts_from_pc(
    p_tenant_id  uuid,
    p_invoice_id uuid
) RETURNS TABLE (
    pil_count            integer,
    pi_subtotal_amount   numeric(18,4),
    pi_tax_amount        numeric(18,4),
    pi_retention_amount  numeric(18,4),
    pi_total_amount      numeric(18,4)
) LANGUAGE plpgsql AS $$
DECLARE
    v_pil_count integer;
BEGIN
    SELECT COUNT(*) INTO v_pil_count
      FROM document.fn_refresh_pil_amounts_from_pc(p_tenant_id, p_invoice_id);

    PERFORM document.fn_refresh_purchase_invoice_totals(p_tenant_id, p_invoice_id);

    RETURN QUERY
    SELECT v_pil_count,
           COALESCE((SELECT SUM(pil.net_amount)::numeric(18,4)
                       FROM document.purchase_invoice_line pil
                      WHERE pil.tenant_id = p_tenant_id
                        AND pil.purchase_invoice_id = p_invoice_id), 0::numeric(18,4)) AS pi_subtotal_amount,
           pi.tax_amount,
           pi.retention_amount,
           pi.total_amount
      FROM document.purchase_invoice pi
     WHERE pi.tenant_id = p_tenant_id
       AND pi.id = p_invoice_id;
END;
$$;

COMMENT ON FUNCTION document.refresh_invoice_amounts_from_pc(uuid, uuid) IS
    'Refreshes reset-safe PI/PIL caches from pricing components: PIL tax/WHT then PI totals.';