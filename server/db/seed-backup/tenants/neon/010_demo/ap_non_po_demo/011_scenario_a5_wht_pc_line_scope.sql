-- ============================================================================
-- FILE: demo/011_scenario_a5_wht_pc_line_scope.sql
-- Scenario A5: Non-PO invoice with line-scope WHT via pricing_component (WS-F).
--
-- This scenario exercises the WHT-as-PC path that A3 covers via the legacy
-- flat-field columns. The invoice header is identical; the difference is
-- WHERE the WHT lives:
--   A3 (legacy)  : purchase_invoice_line.withholding_tax_amount = 100
--   A5 (PC-driven): document.pricing_component row with
--                   term_type='withholding', tax_group_id, computed_amount=100,
--                   tax_section_code, metadata.{rate_schedule_id, wht_basis,
--                   resolved_rate} — server enforces pc_wht_metadata_snapshot_chk.
--
-- Expected JE after posting (identical to A3):
--   Dr Expense              1,000
--      Cr WHT Payable               100
--      Cr AP Trade Payable          900
--
-- After posting, document.invoice_tax_snapshot.is_withholding=true rows
-- carry tax_section_code, jurisdiction_id, wht_basis — frozen snapshot
-- per the D8 immutability guarantee (WS-SNAPSHOT).
-- ============================================================================

DO $scenario_a5$
DECLARE
    v_tenant_id      uuid;
    v_cc_id          uuid;
    v_supplier_id    uuid;
    v_sys            uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id     uuid := '00000001-0000-0000-0001-000000000005';  -- INV-A5-0001 (pinned)
    v_line_id        uuid := '00000001-0000-0000-0002-000000000005';  -- PIL-A5-0001 (pinned)
    v_pc_id          uuid := '00000001-0000-0000-0003-000000000005';  -- PC row (pinned)
    v_sc_opex_id     uuid;
    v_bi_opex_id     uuid;
    v_tg_wht_id      uuid;
    v_trs_wht_id     uuid;
    v_ct_wht_id      uuid;
    v_juris_id       uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    SELECT id INTO v_cc_id     FROM master.company_code
        WHERE tenant_id = v_tenant_id AND code = 'AUIC';
    SELECT id INTO v_supplier_id FROM master.supplier
        WHERE tenant_id = v_tenant_id AND supplier_code = 'ACME-CONSULT-US';

    SELECT id INTO v_sc_opex_id FROM master.commodity_category
        WHERE tenant_id = v_tenant_id
          AND code IN ('SC-OPEX-CONSULT','CONSULTING','OPEX')
        ORDER BY sort_order LIMIT 1;

    SELECT id INTO v_bi_opex_id FROM master.business_intent
        WHERE tenant_id = v_tenant_id AND code = 'BI-OPEX';

    SELECT id INTO v_tg_wht_id FROM control.tax_group
        WHERE tenant_id = v_tenant_id AND code = 'WHT_CONSULT_10PCT';

    -- Look up the underlying WHT rate schedule for the metadata snapshot
    SELECT trs.id INTO v_trs_wht_id
        FROM control.tax_group_component tgc
        JOIN control.tax_rate_schedule trs
          ON trs.tenant_id = tgc.tenant_id
         AND trs.id        = tgc.tax_rate_schedule_id
       WHERE tgc.tenant_id    = v_tenant_id
         AND tgc.tax_group_id = v_tg_wht_id
         AND trs.wht_basis IS NOT NULL
       ORDER BY tgc.calculation_seq
       LIMIT 1;

    SELECT id INTO v_ct_wht_id FROM master.condition_type
        WHERE tenant_id = v_tenant_id AND code = 'WHT_GENERIC';

    SELECT jurisdiction_id INTO v_juris_id FROM control.tax_group
        WHERE tenant_id = v_tenant_id AND id = v_tg_wht_id;

    IF v_tg_wht_id IS NULL OR v_trs_wht_id IS NULL OR v_ct_wht_id IS NULL THEN
        RAISE NOTICE 'demo/011 scenario A5: WHT prereqs missing (tax_group / rate_schedule / condition_type), skipping';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice
         WHERE tenant_id = v_tenant_id AND code = 'INV-A5-0001'
    ) THEN
        RAISE NOTICE 'demo/011 scenario A5: INV-A5-0001 already exists, skipping';
        RETURN;
    END IF;

    -- ── Invoice header — flat caches start at zero; PC drives them. ─────────
    INSERT INTO document.purchase_invoice (
        id,
        tenant_id, company_code_id,
        code, name,
        invoice_source, invoice_type,
        supplier_id, supplier_invoice_number, supplier_invoice_date,
        document_date, posting_date, received_date, baseline_date, due_date,
        currency_code, base_currency_code, exchange_rate,
        subtotal_amount, tax_amount, withholding_tax_amount,
        total_amount, retention_amount, advance_deduction_amount,
        paid_amount, match_type, match_status,
        description, status, tax_mode, tax_mode_source, created_by,
        fiscal_year, period_number
    ) VALUES (
        v_invoice_id,
        v_tenant_id, v_cc_id,
        'INV-A5-0001', 'Non-PO Invoice with WHT (PC-driven)',
        'non_po', 'standard',
        v_supplier_id, 'ACME-2026-00105', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 30,
        'USD', 'USD', 1.0,
        1000.00, 0.00, 0.00,            -- WHT flat starts at 0; refreshed by PC.
        1000.00, 0.00, 0.00,
        0.00, 'two_way', 'fully_matched',
        'Scenario A5: PC-driven 10% WHT on consulting (mirrors A3 outcome via PC).',
        'draft', 'no_tax', 'user_override', v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Line 1: consulting USD 1,000 — no flat WHT, no withholding_tax_group_id ─
    INSERT INTO document.purchase_invoice_line (
        id, tenant_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        commodity_category_id, business_intent_id,
        uom_code, quantity, unit_price,
        tax_amount,
        withholding_tax_group_id, withholding_tax_amount,
        gross_amount, created_by
    ) VALUES (
        v_line_id, v_tenant_id, v_invoice_id, 1,
        'Q2 2026 Consulting Services (PC-driven WHT)', 'services',
        v_sc_opex_id, v_bi_opex_id,
        'EA', 1, 1000.00,
        0.00,
        NULL, 0.00,                      -- flat WHT zero — PC layer owns the figure.
        1000.00, v_sys
    );

    -- ── WHT pricing_component (term_type='withholding', line scope) ─────────
    -- Snapshot metadata (D8) freezes the determination so historical JEs
    -- stay stable even if upstream rate_schedule mutates later.
    INSERT INTO document.pricing_component (
        id,
        tenant_id, company_code_id,
        source_doc_type, source_doc_id, source_line_id,
        term_type, condition_type_id, sequence,
        basis, rate_value, amount_value, base_for_calculation,
        computed_amount, computed_base_amount,
        entry_level, apportion_basis,
        origin,
        tax_group_id, is_inclusive, recoverable_pct, tax_section_code,
        metadata,
        currency_code, base_currency_code, exchange_rate,
        created_by
    ) VALUES (
        v_pc_id,
        v_tenant_id, v_cc_id,
        'purchase_invoice_line', v_invoice_id, v_line_id,
        'withholding', v_ct_wht_id, 400,
        'percent', 10.0, NULL, 1000.00,
        100.00, 100.00,
        'line', NULL,
        'manual',
        v_tg_wht_id, false, 0, '194C',
        jsonb_build_object(
            'rate_schedule_id', v_trs_wht_id::text,
            'wht_basis',        'GROSS',
            'resolved_rate',    10.0,
            'jurisdiction_id',  v_juris_id::text,
            'captured_at',      to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        'USD', 'USD', 1.0,
        v_sys
    );

    -- Refresh the line + header flat caches from PC. In production this is
    -- triggered by the service writer; here we call it directly so the
    -- seeded invoice's flat fields end up consistent with the PC.
    PERFORM document.refresh_invoice_amounts_from_pc(v_tenant_id, v_invoice_id);

    RAISE NOTICE 'demo/011 scenario A5: INV-A5-0001 created (draft, USD 1,000, 100 WHT via PC, section 194C)';
END $scenario_a5$;
