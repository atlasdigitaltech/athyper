-- ============================================================================
-- FILE: 010_demo/999_visual_fixture_pi.sql
-- ============================================================================
-- Visual regression fixture for tests/e2e/visual/pi-fixture.spec.ts.
--
-- Cleanup Plan v5 §P5c.
--
-- ─── Stability contract ───────────────────────────────────────────────────
--
-- Pins the PI document used as the stable input for descriptor-route
-- screenshot diffing. DO NOT modify this file without:
--   1. regenerating the reference snapshot via
--      `pnpm test:visual --update-snapshots`
--   2. committing the new image in `tests/e2e/visual/__screenshots__/`
--   3. updating PI_FIXTURE_ID in `tests/e2e/visual/pi-fixture.spec.ts` if the
--      pinned id changes here
--
-- The fixture's pinned id `ffffffff-aaaa-0000-0000-000000000001` is wired
-- into the spec at `tests/e2e/visual/pi-fixture.spec.ts:51` and into the
-- README's activation checklist.
--
-- ─── Required shape (per README) ──────────────────────────────────────────
--
-- Header:
--   - currency_code = INR, supplier_id_label populated
--   - status = draft (so AmountSummary chips render)
--   - subtotal/tax/discount/retention/withholding amounts set
--
-- Lines (3 rows, mixed UoMs):
--   - L1: EA (each)   — item with qty/rate
--   - L2: KG (mass)   — item with qty/rate
--   - L3: M  (length) — item with qty/rate
--
-- Pricing components (5 rows):
--   - 1 header-scope: freight, value apportionment
--   - 4 line-scope:   discount, IGST 18%, retention 2%, withholding 10%
--
-- Accounting distributions (6 rows): 6 AD splits across 2 GL accounts.
-- ============================================================================

-- TODO(activation): this file is intentionally a SKELETON. The PI header +
-- lines INSERTs below match the pattern from
-- ap_non_po_demo/002_scenario_a1_plain_non_po.sql. The PC and AD INSERT
-- blocks are marked with TODO and must be authored against the live DDL
-- in `server/db/ddl/planes/neon/document/` before the visual test can be activated.
--
-- The skeleton is safe to APPLY today: the existence guard at the top
-- means it no-ops on subsequent runs, and the missing PC/AD blocks only
-- mean the rendered preview will lack apportionment / postings data —
-- the screenshot baseline generated post-activation will simply capture
-- whatever shape the trigger pipeline produces at that point.

DO $visual_fixture$
DECLARE
    v_tenant_id    uuid;
    v_cc_id        uuid;
    v_supplier_id  uuid;
    v_sys          uuid := '00000000-0000-0000-0000-000000000000';
    v_invoice_id   uuid := 'ffffffff-aaaa-0000-0000-000000000001';  -- pinned (PI_FIXTURE_ID)
    v_sc_opex_id   uuid;
    v_bi_opex_id   uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant
      WHERE realm_key = 'athyper' AND code = 'athyper';
    SELECT id INTO v_cc_id FROM master.company_code
      WHERE tenant_id = v_tenant_id AND code = 'AUIC';
    SELECT id INTO v_supplier_id FROM master.supplier
      WHERE tenant_id = v_tenant_id AND supplier_code = 'ACME-CONSULT-US';

    SELECT id INTO v_sc_opex_id FROM master.commodity_category
      WHERE tenant_id = v_tenant_id
        AND code IN ('SC-OPEX-CONSULT','CONSULTING','OPEX')
      ORDER BY sort_order LIMIT 1;

    SELECT id INTO v_bi_opex_id FROM master.business_intent
      WHERE tenant_id = v_tenant_id AND code = 'BI-OPEX';

    -- Idempotent guard — re-applying this file is a no-op once the
    -- fixture exists.
    IF EXISTS (
        SELECT 1 FROM document.purchase_invoice WHERE id = v_invoice_id
    ) THEN
        RAISE NOTICE 'visual fixture PI %: already seeded, skipping', v_invoice_id;
        RETURN;
    END IF;

    -- ── Invoice header ───────────────────────────────────────────────────
    INSERT INTO document.purchase_invoice (
        id,
        tenant_id, company_code_id,
        code, name,
        invoice_source, invoice_type,
        supplier_id, supplier_invoice_number, supplier_invoice_date,
        posting_date, received_date, baseline_date, due_date,
        currency_code, base_currency_code, exchange_rate,
        tax_amount, withholding_tax_amount,
        total_amount, retention_amount, advance_deduction_amount, paid_amount,
        match_type, match_status,
        status, tax_mode, requested_by, created_by,
        fiscal_year, period_number
    ) VALUES (
        v_invoice_id,
        v_tenant_id, v_cc_id,
        'PI-VISUAL-FIXTURE-001', 'Visual Regression Fixture',
        'non_po', 'standard',
        v_supplier_id, 'VISUAL-FIXTURE-2026-00001', DATE '2026-06-01',
        DATE '2026-06-01', DATE '2026-06-01', DATE '2026-06-01', DATE '2026-07-01',
        'INR', 'INR', 1.0,
        1800.00, 1000.00,
        11800.00, 200.00, 0.00, 0.00,
        'three_way', 'unmatched',
        -- tax_mode value constrained by pi_tax_mode_chk. `exclusive` matches a
        -- non-zero tax_amount + lets IGST 18% flow when the line-scope
        -- tax PC INSERT is authored at the TODO marker below.
        'draft', 'exclusive', v_sys, v_sys,
        extract(year FROM CURRENT_DATE)::smallint,
        extract(month FROM CURRENT_DATE)::smallint
    );

    -- ── Lines (3 rows, mixed UoMs) ───────────────────────────────────────
    INSERT INTO document.purchase_invoice_line (
        tenant_id, company_code_id, purchase_invoice_id, line_no,
        item_description, procurement_type,
        commodity_category_id, business_intent_id,
        uom_code, quantity, unit_price, currency_code,
        tax_amount, withholding_tax_amount,
        created_by
    ) VALUES
        (v_tenant_id, v_cc_id, v_invoice_id, 1,
         'Visual Fixture — Each item (EA)', 'goods',
         v_sc_opex_id, v_bi_opex_id,
         'EA', 10, 500.00, 'INR', 0.00, 0.00, v_sys),
        (v_tenant_id, v_cc_id, v_invoice_id, 2,
         'Visual Fixture — Mass item (KG)', 'goods',
         v_sc_opex_id, v_bi_opex_id,
         'KG', 20, 150.00, 'INR', 0.00, 0.00, v_sys),
        (v_tenant_id, v_cc_id, v_invoice_id, 3,
         'Visual Fixture — Length item (M)', 'goods',
         v_sc_opex_id, v_bi_opex_id,
         'M', 40, 50.00, 'INR', 0.00, 0.00, v_sys);

    UPDATE document.purchase_invoice
       SET tax_amount = 1800.00,
           withholding_tax_amount = 1000.00,
           retention_amount = 200.00,
           advance_deduction_amount = 0.00,
           total_amount = 11800.00,
           paid_amount = 0.00,
           match_type = 'three_way',
           match_status = 'unmatched',
           baseline_date = DATE '2026-06-01',
           due_date = DATE '2026-07-01',
           updated_by = v_sys,
           updated_at = now()
     WHERE id = v_invoice_id;

    -- ── Pricing components — TODO(activation) ───────────────────────────
    -- Author against `server/db/ddl/planes/neon/document/` DDL once the activation PR
    -- is in flight. Required rows per the README:
    --   • Header-scope: freight charge, value-apportionment, INR
    --   • Line-scope L1: trade discount
    --   • Line-scope L1: IGST 18%
    --   • Line-scope L2: retention 2%
    --   • Line-scope L2: withholding TDS 10%
    -- Reference scenario A3 (TDS) + A4 (TDS+VAT) for the column shape
    -- once those scenarios add explicit PC INSERTs.

    -- ── Accounting distributions — TODO(activation) ──────────────────────
    -- 6 AD splits across 2 GL accounts. Suggested split (must align with
    -- the line gross amounts above + chosen GL chart):
    --   L1 gross 5000 → 60/40 between Exp-A and Exp-B
    --   L2 gross 3000 → 50/50
    --   L3 gross 2000 → 100/0
    -- See `server/db/ddl/planes/neon/document/03_tables.sql` (§12) for the
    -- column shape.

    RAISE NOTICE 'visual fixture PI %: header + 3 lines seeded (PC + AD pending activation)', v_invoice_id;
END $visual_fixture$;
