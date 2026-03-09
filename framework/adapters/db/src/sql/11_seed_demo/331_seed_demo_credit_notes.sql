/* ============================================================================
   Athyper v2.4 — DEMO SEED: Credit Notes (6 per tenant)
   Tables: fin.credit_note, fin.credit_note_line
   Dependencies: 330_seed_demo_invoices_robust.sql

   Seeds 6 credit notes per demo tenant (9 tenants = 54 credit notes):
     Month 1 (P1): CN-001 POSTED+APPLIED, CN-002 POSTED+APPLIED
     Month 2 (P2): CN-003 POSTED+APPLIED, CN-004 APPROVED
     Month 3 (P3): CN-005 SUBMITTED, CN-006 DRAFT

   Each linked to a specific purchase invoice with reason codes:
   RETURN, PRICING_ERROR, SHORTAGE, DEFECTIVE, ALLOWANCE
   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert credit note
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_cn(
    p_tenant uuid, p_entity_code text, p_cn_number text,
    p_supplier_id uuid, p_invoice_id uuid, p_reason_code text,
    p_ou_id uuid, p_cn_date date, p_posting_date date,
    p_credit_amount decimal(18,4), p_tax_amount decimal(18,4),
    p_total_amount decimal(18,4), p_applied_amount decimal(18,4),
    p_currency_code text, p_status text,
    p_decision_score decimal(5,4), p_approval_route text,
    p_description text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.credit_note (
        id, tenant_id, entity_code, txn_id,
        credit_note_number, supplier_id, invoice_id, reason_code,
        description, ou_id,
        credit_note_date, posting_date,
        credit_amount, tax_amount, total_amount, applied_amount,
        currency_code, status,
        decision_score, approval_route,
        submitted_at, submitted_by,
        approved_at, approved_by,
        posted_at, posted_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_cn_number, p_supplier_id, p_invoice_id, p_reason_code,
        p_description, p_ou_id,
        p_cn_date, p_posting_date,
        p_credit_amount, p_tax_amount, p_total_amount, p_applied_amount,
        p_currency_code, p_status,
        p_decision_score, p_approval_route,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','APPLIED') THEN p_cn_date + interval '1 day' END,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','APPLIED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('APPROVED','POSTED','APPLIED') THEN p_cn_date + interval '2 days' END,
        CASE WHEN p_status IN ('APPROVED','POSTED','APPLIED') THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status IN ('POSTED','APPLIED') THEN p_posting_date END,
        CASE WHEN p_status IN ('POSTED','APPLIED') THEN '00000000-0000-0000-0000-000000000002'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, credit_note_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert credit note line
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_cn_line(
    p_tenant uuid, p_cn_id uuid, p_line_no int,
    p_description text, p_quantity decimal(18,6), p_unit_price decimal(18,4),
    p_amount decimal(18,4), p_tax_code text, p_tax_rate decimal(9,6),
    p_tax_amount decimal(18,4), p_account_id uuid,
    p_cost_center_id uuid, p_profit_center_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.credit_note_line (
        id, tenant_id, credit_note_id, line_no,
        description, quantity, unit_price, amount,
        tax_code, tax_rate, tax_amount,
        account_id, cost_center_id, profit_center_id
    ) VALUES (
        gen_random_uuid(), p_tenant, p_cn_id, p_line_no,
        p_description, p_quantity, p_unit_price, p_amount,
        p_tax_code, p_tax_rate, p_tax_amount,
        p_account_id, p_cost_center_id, p_profit_center_id
    )
    ON CONFLICT (tenant_id, credit_note_id, line_no) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant     uuid;
    v_code       text;
    v_entity     text;
    v_supplier   uuid;
    v_supplier2  uuid;
    v_ou_id      uuid;
    v_cn_id      uuid;
    v_inv_id     uuid;
    v_currency   text;
    v_acct_exp   uuid;
    v_cc_id      uuid;
    v_pc_id      uuid;
    v_fy_start   int;
    v_p1_start   date;
    v_p2_start   date;
    v_p3_start   date;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        SELECT COALESCE(tp.fiscal_year_start_month, 1) INTO v_fy_start
        FROM core.tenant_profile tp WHERE tp.tenant_id = v_tenant;
        IF v_fy_start IS NULL THEN v_fy_start := 1; END IF;

        IF v_fy_start <= 10 THEN
            v_p1_start := make_date(2026, v_fy_start, 1);
            v_p2_start := make_date(2026, v_fy_start + 1, 1);
            v_p3_start := make_date(2026, v_fy_start + 2, 1);
        ELSIF v_fy_start = 11 THEN
            v_p1_start := make_date(2026, 11, 1);
            v_p2_start := make_date(2026, 12, 1);
            v_p3_start := make_date(2027, 1, 1);
        ELSE
            v_p1_start := make_date(2026, 12, 1);
            v_p2_start := make_date(2027, 1, 1);
            v_p3_start := make_date(2027, 2, 1);
        END IF;

        SELECT entity_code, id INTO v_entity, v_ou_id
        FROM fin.operating_unit WHERE tenant_id = v_tenant ORDER BY entity_code, level LIMIT 1;
        IF v_entity IS NULL THEN CONTINUE; END IF;

        SELECT id INTO v_supplier FROM ent.supplier WHERE tenant_id = v_tenant ORDER BY id LIMIT 1;
        IF v_supplier IS NULL THEN CONTINUE; END IF;
        SELECT id INTO v_supplier2 FROM ent.supplier WHERE tenant_id = v_tenant AND id != v_supplier ORDER BY id LIMIT 1;
        IF v_supplier2 IS NULL THEN v_supplier2 := v_supplier; END IF;

        SELECT id INTO v_acct_exp FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'EXPENSE' AND NOT is_group AND is_active
        ORDER BY account_code LIMIT 1;

        SELECT id INTO v_cc_id FROM fin.cost_center
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active ORDER BY code LIMIT 1;

        SELECT id INTO v_pc_id FROM fin.profit_center
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active ORDER BY code LIMIT 1;

        -- ================================================================
        -- CN-001: Return against PI-001 — APPLIED (Month 1)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00001';

        IF v_inv_id IS NOT NULL THEN
            v_cn_id := pg_temp.upsert_cn(
                v_tenant, v_entity, 'CN-2026-00001',
                v_supplier, v_inv_id, 'RETURN', v_ou_id,
                v_p1_start + 20, v_p1_start + 22,
                454.5500, 45.4500, 500.0000, 500.0000,
                v_currency, 'APPLIED', 0.9200, 'ZERO_APPROVAL',
                'Return of defective desk chairs — 2 units from PI-001');
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 1,
                'Defective desk chairs returned', 2.000000, 200.0000, 400.0000,
                'STD', 0.100000, 40.0000, v_acct_exp, v_cc_id, v_pc_id);
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 2,
                'Return shipping costs credited', 1.000000, 54.5500, 54.5500,
                'STD', 0.100000, 5.4500, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- CN-002: Pricing error on PI-002 — APPLIED (Month 1)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00002';

        IF v_inv_id IS NOT NULL THEN
            v_cn_id := pg_temp.upsert_cn(
                v_tenant, v_entity, 'CN-2026-00002',
                v_supplier, v_inv_id, 'PRICING_ERROR', v_ou_id,
                v_p1_start + 22, v_p1_start + 24,
                4545.4500, 454.5500, 5000.0000, 5000.0000,
                v_currency, 'APPLIED', 0.8500, 'STANDARD',
                'Pricing correction — installation overcharged on PI-002');
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 1,
                'Installation service price correction', 1.000000, 4545.4500, 4545.4500,
                'STD', 0.100000, 454.5500, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- CN-003: Shortage on PI-011 — APPLIED (Month 2)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00011';

        IF v_inv_id IS NOT NULL THEN
            v_cn_id := pg_temp.upsert_cn(
                v_tenant, v_entity, 'CN-2026-00003',
                v_supplier, v_inv_id, 'SHORTAGE', v_ou_id,
                v_p2_start + 15, v_p2_start + 17,
                290.9100, 29.0900, 320.0000, 320.0000,
                v_currency, 'APPLIED', 0.9400, 'ZERO_APPROVAL',
                'Short shipment — 4 binder packs missing from PI-011');
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 1,
                'Missing binder packs (4 units)', 4.000000, 72.7300, 290.9100,
                'STD', 0.100000, 29.0900, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- CN-004: Defective goods on PI-012 — APPROVED (Month 2)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00012';

        IF v_inv_id IS NOT NULL THEN
            v_cn_id := pg_temp.upsert_cn(
                v_tenant, v_entity, 'CN-2026-00004',
                v_supplier2, v_inv_id, 'DEFECTIVE', v_ou_id,
                v_p2_start + 20, NULL,
                2000.0000, 200.0000, 2200.0000, 0.0000,
                v_currency, 'APPROVED', 0.8200, 'STANDARD',
                'Defective steel sheets — quality rejection on PI-012');
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 1,
                'Defective steel sheets (grade 304)', 10.000000, 120.0000, 1200.0000,
                'STD', 0.100000, 120.0000, v_acct_exp, v_cc_id, v_pc_id);
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 2,
                'Quality inspection costs', 1.000000, 800.0000, 800.0000,
                'STD', 0.100000, 80.0000, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- CN-005: Allowance on PI-021 — SUBMITTED (Month 3)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00021';

        IF v_inv_id IS NOT NULL THEN
            v_cn_id := pg_temp.upsert_cn(
                v_tenant, v_entity, 'CN-2026-00005',
                v_supplier, v_inv_id, 'ALLOWANCE', v_ou_id,
                v_p3_start + 10, NULL,
                372.7300, 37.2700, 410.0000, 0.0000,
                v_currency, 'SUBMITTED', 0.9300, 'ZERO_APPROVAL',
                'Volume discount allowance on printer consumables');
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 1,
                'Volume discount — printer consumables', 1.000000, 372.7300, 372.7300,
                'STD', 0.100000, 37.2700, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- CN-006: Pricing error on PI-022 — DRAFT (Month 3)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00022';

        IF v_inv_id IS NOT NULL THEN
            v_cn_id := pg_temp.upsert_cn(
                v_tenant, v_entity, 'CN-2026-00006',
                v_supplier2, v_inv_id, 'PRICING_ERROR', v_ou_id,
                v_p3_start + 12, NULL,
                1363.6400, 136.3600, 1500.0000, 0.0000,
                v_currency, 'DRAFT', NULL, NULL,
                'Cloud storage overcharge correction — PI-022');
            PERFORM pg_temp.upsert_cn_line(v_tenant, v_cn_id, 1,
                'Storage tier pricing correction (3 months)', 3.000000, 454.5500, 1363.6400,
                'STD', 0.100000, 136.3600, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        RAISE NOTICE 'Credit notes (6) seeded for tenant %', v_code;
    END LOOP;
END $$;
