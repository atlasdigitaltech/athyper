/* ============================================================================
   Athyper v2.4 — DEMO SEED: Debit Notes (3 per tenant)
   Tables: fin.debit_note, fin.debit_note_line
   Dependencies: 330_seed_demo_invoices_robust.sql

   Seeds 3 debit notes per demo tenant (9 tenants = 27 debit notes):
     Month 1 (P1): DN-001 POSTED (PRICE_INCREASE)
     Month 2 (P2): DN-002 APPROVED (UNDERBILLING)
     Month 3 (P3): DN-003 DRAFT (FREIGHT_ADJUSTMENT)

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

CREATE OR REPLACE FUNCTION pg_temp.upsert_dn(
    p_tenant uuid, p_entity_code text, p_dn_number text,
    p_supplier_id uuid, p_invoice_id uuid, p_reason_code text,
    p_ou_id uuid, p_dn_date date, p_posting_date date,
    p_debit_amount decimal(18,4), p_tax_amount decimal(18,4),
    p_total_amount decimal(18,4),
    p_currency_code text, p_status text,
    p_decision_score decimal(5,4), p_approval_route text,
    p_description text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.debit_note (
        id, tenant_id, entity_code, txn_id,
        debit_note_number, supplier_id, invoice_id, reason_code,
        description, ou_id,
        debit_note_date, posting_date,
        debit_amount, tax_amount, total_amount,
        currency_code, status,
        decision_score, approval_route,
        submitted_at, submitted_by,
        approved_at, approved_by,
        posted_at, posted_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_dn_number, p_supplier_id, p_invoice_id, p_reason_code,
        p_description, p_ou_id,
        p_dn_date, p_posting_date,
        p_debit_amount, p_tax_amount, p_total_amount,
        p_currency_code, p_status,
        p_decision_score, p_approval_route,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED') THEN p_dn_date + interval '1 day' END,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('APPROVED','POSTED') THEN p_dn_date + interval '2 days' END,
        CASE WHEN p_status IN ('APPROVED','POSTED') THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status = 'POSTED' THEN p_posting_date END,
        CASE WHEN p_status = 'POSTED' THEN '00000000-0000-0000-0000-000000000002'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, debit_note_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_dn_line(
    p_tenant uuid, p_dn_id uuid, p_line_no int,
    p_description text, p_quantity decimal(18,6), p_unit_price decimal(18,4),
    p_amount decimal(18,4), p_tax_code text, p_tax_rate decimal(9,6),
    p_tax_amount decimal(18,4), p_account_id uuid,
    p_cost_center_id uuid, p_profit_center_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.debit_note_line (
        id, tenant_id, debit_note_id, line_no,
        description, quantity, unit_price, amount,
        tax_code, tax_rate, tax_amount,
        account_id, cost_center_id, profit_center_id
    ) VALUES (
        gen_random_uuid(), p_tenant, p_dn_id, p_line_no,
        p_description, p_quantity, p_unit_price, p_amount,
        p_tax_code, p_tax_rate, p_tax_amount,
        p_account_id, p_cost_center_id, p_profit_center_id
    )
    ON CONFLICT (tenant_id, debit_note_id, line_no) DO UPDATE SET updated_at = now()
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
    v_dn_id      uuid;
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
        -- DN-001: Price increase on PI-004 — POSTED (Month 1)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00004';

        IF v_inv_id IS NOT NULL THEN
            v_dn_id := pg_temp.upsert_dn(
                v_tenant, v_entity, 'DN-2026-00001',
                v_supplier2, v_inv_id, 'PRICE_INCREASE', v_ou_id,
                v_p1_start + 25, v_p1_start + 27,
                1363.6400, 136.3600, 1500.0000,
                v_currency, 'POSTED', 0.8000, 'STANDARD',
                'Retrospective rate increase — legal advisory PI-004');
            PERFORM pg_temp.upsert_dn_line(v_tenant, v_dn_id, 1,
                'Rate adjustment for senior partner hours', 1.000000, 1363.6400, 1363.6400,
                'STD', 0.100000, 136.3600, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- DN-002: Underbilling on PI-014 — APPROVED (Month 2)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00014';

        IF v_inv_id IS NOT NULL THEN
            v_dn_id := pg_temp.upsert_dn(
                v_tenant, v_entity, 'DN-2026-00002',
                v_supplier2, v_inv_id, 'UNDERBILLING', v_ou_id,
                v_p2_start + 22, NULL,
                1636.3600, 163.6400, 1800.0000,
                v_currency, 'APPROVED', 0.7900, 'STANDARD',
                'Underbilled regulatory filing fees — PI-014');
            PERFORM pg_temp.upsert_dn_line(v_tenant, v_dn_id, 1,
                'Additional regulatory filing fees', 3.000000, 545.4500, 1636.3600,
                'STD', 0.100000, 163.6400, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        -- ================================================================
        -- DN-003: Freight adjustment on PI-022 — DRAFT (Month 3)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00022';

        IF v_inv_id IS NOT NULL THEN
            v_dn_id := pg_temp.upsert_dn(
                v_tenant, v_entity, 'DN-2026-00003',
                v_supplier2, v_inv_id, 'FREIGHT_ADJUSTMENT', v_ou_id,
                v_p3_start + 14, NULL,
                681.8200, 68.1800, 750.0000,
                v_currency, 'DRAFT', NULL, NULL,
                'Freight surcharge adjustment — cloud hardware delivery');
            PERFORM pg_temp.upsert_dn_line(v_tenant, v_dn_id, 1,
                'Freight surcharge (expedited delivery)', 1.000000, 681.8200, 681.8200,
                'STD', 0.100000, 68.1800, v_acct_exp, v_cc_id, v_pc_id);
        END IF;

        RAISE NOTICE 'Debit notes (3) seeded for tenant %', v_code;
    END LOOP;
END $$;
