-- ============================================================================
-- document/05_purchase_invoice_proof.sql
-- Purpose: Pilot proof checks for the purchase invoice accounting model.
--
-- Contract:
--   purchase_invoice          = header truth and derived header totals
--   purchase_invoice_line     = commercial line truth
--   accounting_distribution   = account assignment split proof
--   journal_line              = immutable posted ledger snapshot
-- ============================================================================

CREATE OR REPLACE FUNCTION document.fn_purchase_invoice_proof(
    p_invoice_id uuid,
    p_tolerance  numeric DEFAULT 0.0001
)
RETURNS TABLE (
    check_code  text,
    check_label text,
    severity    text,
    passed      boolean,
    expected    numeric,
    actual      numeric,
    details     jsonb
)
LANGUAGE plpgsql
STABLE
SET search_path = document, pg_catalog
AS $$
DECLARE
    v_invoice record;
    v_is_posted boolean;
    v_fx_rate numeric;
BEGIN
    SELECT *
      INTO v_invoice
      FROM document.purchase_invoice
     WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            'INVOICE_EXISTS',
            'Purchase invoice exists',
            'error',
            false,
            1::numeric,
            0::numeric,
            jsonb_build_object('invoice_id', p_invoice_id);
        RETURN;
    END IF;

    v_is_posted := COALESCE(v_invoice.is_posted, false)
                   OR v_invoice.status IN ('posted', 'partially_paid', 'fully_paid', 'reversed');
    v_fx_rate := CASE
        WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN 1
        ELSE v_invoice.exchange_rate
    END;

    RETURN QUERY
    SELECT
        'INVOICE_EXISTS',
        'Purchase invoice exists',
        'info',
        true,
        1::numeric,
        1::numeric,
        jsonb_build_object(
            'invoice_id', p_invoice_id,
            'invoice_number', v_invoice.invoice_number,
            'status', v_invoice.status
        );

    RETURN QUERY
    SELECT
        'FX_RATE_PRESENT',
        'Foreign-currency invoice has a positive exchange rate',
        CASE WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN 'info' ELSE 'error' END,
        CASE
            WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN true
            ELSE v_invoice.exchange_rate IS NOT NULL AND v_invoice.exchange_rate > 0
        END,
        CASE WHEN v_invoice.currency_code = v_invoice.base_currency_code THEN 1::numeric ELSE NULL::numeric END,
        v_invoice.exchange_rate,
        jsonb_build_object(
            'currency_code', v_invoice.currency_code,
            'base_currency_code', v_invoice.base_currency_code,
            'exchange_rate', v_invoice.exchange_rate
        );

    RETURN QUERY
    WITH line_totals AS (
        SELECT
            COUNT(*)::numeric AS actual_line_count,
            COALESCE(SUM(pil.net_amount), 0)::numeric AS actual_subtotal_amount,
            COALESCE(SUM(pil.net_amount - COALESCE(pil.discount_amount, 0)), 0)::numeric AS actual_line_net_after_discount,
            COALESCE(SUM(pil.tax_amount), 0)::numeric AS actual_tax_amount,
            COALESCE(SUM(pil.withholding_tax_amount), 0)::numeric AS actual_withholding_tax_amount,
            COALESCE(SUM(pil.retention_amount), 0)::numeric AS actual_retention_amount
        FROM document.purchase_invoice_line pil
        WHERE pil.tenant_id = v_invoice.tenant_id
          AND pil.purchase_invoice_id = p_invoice_id
    ),
    checks AS (
        SELECT *
        FROM line_totals lt
        CROSS JOIN LATERAL (VALUES
            (
                'HEADER_LINE_COUNT',
                'Header line_count equals child line count',
                v_invoice.line_count::numeric,
                lt.actual_line_count
            ),
            (
                'HEADER_SUBTOTAL',
                'Header subtotal_amount equals sum(line net_amount)',
                v_invoice.subtotal_amount::numeric,
                lt.actual_subtotal_amount
            ),
            (
                'HEADER_TAX',
                'Header tax_amount equals sum(line tax_amount)',
                v_invoice.tax_amount::numeric,
                lt.actual_tax_amount
            ),
            (
                'HEADER_WITHHOLDING_TAX',
                'Header withholding_tax_amount equals sum(line withholding_tax_amount)',
                v_invoice.withholding_tax_amount::numeric,
                lt.actual_withholding_tax_amount
            ),
            (
                'HEADER_RETENTION',
                'Header retention_amount equals sum(line retention_amount)',
                v_invoice.retention_amount::numeric,
                lt.actual_retention_amount
            ),
            (
                'HEADER_TOTAL',
                'Header total_amount equals line net after discount plus tax, freight, misc, less header discount',
                v_invoice.total_amount::numeric,
                (
                    lt.actual_line_net_after_discount
                    + lt.actual_tax_amount
                    + COALESCE(v_invoice.freight_amount, 0)
                    + COALESCE(v_invoice.misc_charges_amount, 0)
                    - COALESCE(v_invoice.discount_amount, 0)
                )::numeric
            )
        ) AS c(code, label, expected_amount, actual_amount)
    )
    SELECT
        c.code,
        c.label,
        'error',
        ABS(COALESCE(c.expected_amount, 0) - COALESCE(c.actual_amount, 0)) <= p_tolerance,
        c.expected_amount,
        c.actual_amount,
        jsonb_build_object('invoice_id', p_invoice_id)
    FROM checks c;

    RETURN QUERY
    WITH line_distribution AS (
        SELECT
            pil.id AS line_id,
            pil.line_no,
            ABS(COALESCE(pil.net_amount, 0) - COALESCE(pil.discount_amount, 0))::numeric AS expected_assigned_amount,
            COALESCE(SUM(ad.distributed_amount), 0)::numeric AS actual_assigned_amount,
            COUNT(ad.id)::numeric AS split_count
        FROM document.purchase_invoice_line pil
        LEFT JOIN document.accounting_distribution ad
               ON ad.tenant_id = pil.tenant_id
              AND ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
              AND ad.source_doc_id = pil.purchase_invoice_id
              AND ad.source_line_id = pil.id
        WHERE pil.tenant_id = v_invoice.tenant_id
          AND pil.purchase_invoice_id = p_invoice_id
        GROUP BY pil.id, pil.line_no, pil.net_amount, pil.discount_amount
    ),
    distribution_totals AS (
        SELECT
            COUNT(*)::numeric AS line_count,
            (COUNT(*) FILTER (WHERE split_count > 0))::numeric AS assigned_line_count,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'line_id', line_id,
                        'line_no', line_no,
                        'split_count', split_count,
                        'expected_assigned_amount', expected_assigned_amount,
                        'actual_assigned_amount', actual_assigned_amount
                    )
                    ORDER BY line_no
                ) FILTER (
                    WHERE split_count = 0
                       OR ABS(expected_assigned_amount - actual_assigned_amount) > p_tolerance
                ),
                '[]'::jsonb
            ) AS exceptions
        FROM line_distribution
    )
    SELECT
        'ACCOUNT_ASSIGNMENT_EXISTS',
        'Every invoice line has at least one account assignment split',
        'error',
        dt.line_count > 0 AND dt.assigned_line_count = dt.line_count,
        dt.line_count,
        dt.assigned_line_count,
        jsonb_build_object('exceptions', dt.exceptions)
    FROM distribution_totals dt;

    RETURN QUERY
    WITH line_distribution AS (
        SELECT
            pil.id AS line_id,
            pil.line_no,
            ABS(COALESCE(pil.net_amount, 0) - COALESCE(pil.discount_amount, 0))::numeric AS expected_assigned_amount,
            COALESCE(SUM(ad.distributed_amount), 0)::numeric AS actual_assigned_amount,
            COUNT(ad.id)::numeric AS split_count
        FROM document.purchase_invoice_line pil
        LEFT JOIN document.accounting_distribution ad
               ON ad.tenant_id = pil.tenant_id
              AND ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
              AND ad.source_doc_id = pil.purchase_invoice_id
              AND ad.source_line_id = pil.id
        WHERE pil.tenant_id = v_invoice.tenant_id
          AND pil.purchase_invoice_id = p_invoice_id
        GROUP BY pil.id, pil.line_no, pil.net_amount, pil.discount_amount
    ),
    distribution_totals AS (
        SELECT
            COALESCE(SUM(expected_assigned_amount), 0)::numeric AS expected_assigned_amount,
            COALESCE(SUM(actual_assigned_amount), 0)::numeric AS actual_assigned_amount,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'line_id', line_id,
                        'line_no', line_no,
                        'expected_assigned_amount', expected_assigned_amount,
                        'actual_assigned_amount', actual_assigned_amount
                    )
                    ORDER BY line_no
                ) FILTER (
                    WHERE split_count = 0
                       OR ABS(expected_assigned_amount - actual_assigned_amount) > p_tolerance
                ),
                '[]'::jsonb
            ) AS exceptions
        FROM line_distribution
    )
    SELECT
        'ACCOUNT_ASSIGNMENT_TOTAL',
        'Split assigned amounts equal commercial line amounts after line discount',
        'error',
        ABS(dt.expected_assigned_amount - dt.actual_assigned_amount) <= p_tolerance
            AND dt.exceptions = '[]'::jsonb,
        dt.expected_assigned_amount,
        dt.actual_assigned_amount,
        jsonb_build_object('exceptions', dt.exceptions)
    FROM distribution_totals dt;

    RETURN QUERY
    SELECT
        'JOURNAL_REQUIRED_FOR_POSTED',
        'Posted invoice has an AP journal entry reference',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted) OR v_invoice.ap_je_id IS NOT NULL,
        CASE WHEN v_is_posted THEN 1::numeric ELSE NULL::numeric END,
        CASE WHEN v_invoice.ap_je_id IS NOT NULL THEN 1::numeric ELSE 0::numeric END,
        jsonb_build_object('ap_je_id', v_invoice.ap_je_id, 'status', v_invoice.status);

    RETURN QUERY
    WITH je AS (
        SELECT id, source_doc_type, source_doc_id, status
        FROM document.journal_entry
        WHERE tenant_id = v_invoice.tenant_id
          AND id = v_invoice.ap_je_id
    )
    SELECT
        'JOURNAL_SOURCE_MATCH',
        'AP journal entry source points to the purchase invoice',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted)
            OR EXISTS (
                SELECT 1
                FROM je
                WHERE source_doc_type = 'purchase_invoice'
                  AND source_doc_id = p_invoice_id
            ),
        CASE WHEN v_is_posted THEN 1::numeric ELSE NULL::numeric END,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM je
                WHERE source_doc_type = 'purchase_invoice'
                  AND source_doc_id = p_invoice_id
            ) THEN 1::numeric
            ELSE 0::numeric
        END,
        COALESCE(
            (SELECT jsonb_build_object('journal_entry_id', id, 'source_doc_type', source_doc_type, 'source_doc_id', source_doc_id, 'status', status) FROM je),
            jsonb_build_object('journal_entry_id', v_invoice.ap_je_id)
        );

    RETURN QUERY
    WITH jl_totals AS (
        SELECT
            COALESCE(SUM(transaction_debit), 0)::numeric AS transaction_debit,
            COALESCE(SUM(transaction_credit), 0)::numeric AS transaction_credit,
            COALESCE(SUM(base_debit), 0)::numeric AS base_debit,
            COALESCE(SUM(base_credit), 0)::numeric AS base_credit
        FROM document.journal_line
        WHERE tenant_id = v_invoice.tenant_id
          AND journal_entry_id = v_invoice.ap_je_id
    )
    SELECT
        'JOURNAL_BALANCED',
        'Posted journal debits equal credits',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted)
            OR (
                ABS(jt.transaction_debit - jt.transaction_credit) <= p_tolerance
                AND ABS(jt.base_debit - jt.base_credit) <= p_tolerance
            ),
        jt.transaction_debit,
        jt.transaction_credit,
        jsonb_build_object('base_debit', jt.base_debit, 'base_credit', jt.base_credit)
    FROM jl_totals jt;

    RETURN QUERY
    WITH jl_totals AS (
        SELECT
            COALESCE(SUM(transaction_debit), 0)::numeric AS transaction_debit,
            COALESCE(SUM(transaction_credit), 0)::numeric AS transaction_credit,
            COALESCE(SUM(base_debit), 0)::numeric AS base_debit,
            COALESCE(SUM(base_credit), 0)::numeric AS base_credit
        FROM document.journal_line
        WHERE tenant_id = v_invoice.tenant_id
          AND journal_entry_id = v_invoice.ap_je_id
    ),
    expected_journal AS (
        SELECT
            ABS(COALESCE(v_invoice.total_amount, 0))::numeric AS transaction_total,
            (ABS(COALESCE(v_invoice.total_amount, 0)) * COALESCE(v_fx_rate, 0))::numeric AS base_total
    )
    SELECT
        'JOURNAL_TOTAL_MATCHES_INVOICE',
        'Posted journal totals equal invoice total',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted)
            OR (
                v_fx_rate IS NOT NULL
                AND ABS(e.transaction_total - jt.transaction_debit) <= p_tolerance
                AND ABS(e.transaction_total - jt.transaction_credit) <= p_tolerance
                AND ABS(e.base_total - jt.base_debit) <= p_tolerance
                AND ABS(e.base_total - jt.base_credit) <= p_tolerance
            ),
        e.transaction_total,
        jt.transaction_debit,
        jsonb_build_object(
            'transaction_credit', jt.transaction_credit,
            'expected_base_total', e.base_total,
            'base_debit', jt.base_debit,
            'base_credit', jt.base_credit
        )
    FROM expected_journal e
    CROSS JOIN jl_totals jt;

    RETURN QUERY
    WITH invalid_links AS (
        SELECT COUNT(*)::numeric AS invalid_count
        FROM document.journal_line jl
        WHERE jl.tenant_id = v_invoice.tenant_id
          AND jl.journal_entry_id = v_invoice.ap_je_id
          AND jl.source_doc_line_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM document.purchase_invoice_line pil
              WHERE pil.tenant_id = jl.tenant_id
                AND pil.purchase_invoice_id = p_invoice_id
                AND pil.id = jl.source_doc_line_id
          )
    )
    SELECT
        'JOURNAL_LINE_SOURCE_TRACE',
        'Journal line source links point back to invoice lines',
        CASE WHEN v_is_posted THEN 'error' ELSE 'info' END,
        (NOT v_is_posted) OR il.invalid_count = 0,
        0::numeric,
        il.invalid_count,
        jsonb_build_object('invoice_id', p_invoice_id, 'journal_entry_id', v_invoice.ap_je_id)
    FROM invalid_links il;
END;
$$;

COMMENT ON FUNCTION document.fn_purchase_invoice_proof(uuid, numeric) IS
    'Returns row-level proof checks for purchase_invoice -> purchase_invoice_line -> '
    'accounting_distribution -> journal_line. Intended for pilot posting gates and '
    'resettable local verification.';

COMMENT ON TABLE document.accounting_distribution IS
    'ARCHETYPE=C;SCOPE=T. Account assignment split proof layer. Pre-posting rows '
    'show how a commercial document line is split by amount, account derivation, '
    'dimensions, capex, and budget. Not the ledger; posted ledger evidence lives '
    'in document.journal_line.';

COMMENT ON COLUMN document.accounting_distribution.distributed_amount IS
    'Assigned commercial amount for this split. For purchase invoice lines this '
    'reconciles to abs(net_amount - discount_amount) before posting.';

COMMENT ON COLUMN document.accounting_distribution.gl_account_id IS
    'Resolved GL account for this account assignment split. Posting snapshots the '
    'result into document.journal_line.';
