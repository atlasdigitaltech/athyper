/* ============================================================================
   Athyper v2.5 — DEMO SEED: Robust Purchase Invoices (30 per tenant)
   Tables: fin.purchase_invoice (with invoice_type: PO_BASED | NON_PO), fin.purchase_invoice_line
   Dependencies: core.tenant, fin.operating_unit, fin.business_intent,
                 fin.chart_of_accounts, fin.cost_center, fin.profit_center,
                 ent.supplier, 320_seed_demo_fiscal_open.sql

   Seeds 30 invoices per demo tenant (9 tenants = 270 invoices):
     Month 1 (P1, HARD_CLOSE): 10 invoices — all POSTED, most PAID
     Month 2 (P2, SOFT_CLOSE): 10 invoices — mixed statuses
     Month 3 (P3, OPEN):       10 invoices — full lifecycle spread

   Covers all approval routes: ZERO_APPROVAL, STANDARD, ENHANCED, EXECUTIVE, BLOCKED
   Each invoice has 2–3 lines with varied intents, accounts, cost centers.
   MC-4 compliant: all amounts are DECIMAL literals, no float.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert purchase invoice (extended with posting_date + dates)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_pi_robust(
    p_tenant uuid, p_entity_code text, p_invoice_number text,
    p_supplier_id uuid, p_ou_id uuid, p_intent_id uuid,
    p_invoice_date date, p_due_date date, p_posting_date date,
    p_subtotal decimal(18,4), p_tax_amount decimal(18,4),
    p_total_amount decimal(18,4), p_paid_amount decimal(18,4),
    p_currency_code text, p_status text,
    p_decision_score decimal(5,4), p_approval_route text,
    p_description text,
    p_fiscal_year smallint DEFAULT 2026,
    p_invoice_type text DEFAULT 'NON_PO'
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.purchase_invoice (
        id, tenant_id, entity_code, txn_id,
        invoice_number, invoice_type, supplier_id, description,
        ou_id, intent_id,
        invoice_date, due_date, posting_date,
        subtotal, tax_amount, total_amount, paid_amount,
        currency_code, status,
        decision_score, approval_route,
        submitted_at, submitted_by,
        approved_at, approved_by,
        posted_at, posted_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_invoice_number, p_invoice_type, p_supplier_id, p_description,
        p_ou_id, p_intent_id,
        p_invoice_date, p_due_date, p_posting_date,
        p_subtotal, p_tax_amount, p_total_amount, p_paid_amount,
        p_currency_code, p_status,
        p_decision_score, p_approval_route,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN p_invoice_date + interval '1 day' END,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN p_invoice_date + interval '2 days' END,
        CASE WHEN p_status IN ('APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status IN ('POSTED','PAID','PARTIALLY_PAID') THEN p_posting_date END,
        CASE WHEN p_status IN ('POSTED','PAID','PARTIALLY_PAID') THEN '00000000-0000-0000-0000-000000000002'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, invoice_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert purchase invoice line (reuse from 310)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_pi_line_r(
    p_tenant uuid, p_invoice_id uuid, p_line_no int,
    p_description text, p_quantity decimal(18,6), p_unit_price decimal(18,4),
    p_amount decimal(18,4), p_tax_code text, p_tax_rate decimal(9,6),
    p_tax_amount decimal(18,4), p_account_id uuid,
    p_cost_center_id uuid, p_profit_center_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.purchase_invoice_line (
        id, tenant_id, invoice_id, line_no,
        description, quantity, unit_price, amount,
        tax_code, tax_rate, tax_amount,
        account_id, cost_center_id, profit_center_id
    ) VALUES (
        gen_random_uuid(), p_tenant, p_invoice_id, p_line_no,
        p_description, p_quantity, p_unit_price, p_amount,
        p_tax_code, p_tax_rate, p_tax_amount,
        p_account_id, p_cost_center_id, p_profit_center_id
    )
    ON CONFLICT (tenant_id, invoice_id, line_no) DO UPDATE SET updated_at = now()
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
    v_ou_id2     uuid;
    v_pi_id      uuid;
    v_currency   text;
    -- Intent IDs
    v_int_opex_gen    uuid;
    v_int_opex_travel uuid;
    v_int_opex_it     uuid;
    v_int_opex_fac    uuid;
    v_int_opex_prof   uuid;
    v_int_opex_mktg   uuid;
    v_int_opex_hr     uuid;
    v_int_opex_ins    uuid;
    v_int_capex_equip uuid;
    v_int_capex_it    uuid;
    v_int_capex_fac   uuid;
    v_int_capex_veh   uuid;
    v_int_capex_intg  uuid;
    -- Account IDs (by type)
    v_acct_expense    uuid;
    v_acct_expense2   uuid;
    v_acct_asset      uuid;
    -- Cost center / profit center
    v_cc_id      uuid;
    v_cc_id2     uuid;
    v_pc_id      uuid;
    -- Fiscal period dates (derived from tenant FY start)
    v_fy_start   int;
    v_p1_start   date;
    v_p2_start   date;
    v_p3_start   date;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Resolve tenant currency
        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        -- Resolve FY start month
        SELECT COALESCE(tp.fiscal_year_start_month, 1) INTO v_fy_start
        FROM core.tenant_profile tp WHERE tp.tenant_id = v_tenant;
        IF v_fy_start IS NULL THEN v_fy_start := 1; END IF;

        -- Compute period start dates
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

        -- Get first entity_code + OU
        SELECT entity_code, id INTO v_entity, v_ou_id
        FROM fin.operating_unit
        WHERE tenant_id = v_tenant
        ORDER BY entity_code, level
        LIMIT 1;
        IF v_entity IS NULL THEN CONTINUE; END IF;

        -- Get second OU if available (for variety)
        SELECT id INTO v_ou_id2 FROM fin.operating_unit
        WHERE tenant_id = v_tenant AND id != v_ou_id
        ORDER BY entity_code LIMIT 1;
        IF v_ou_id2 IS NULL THEN v_ou_id2 := v_ou_id; END IF;

        -- Get suppliers (need at least 1)
        SELECT id INTO v_supplier FROM ent.supplier WHERE tenant_id = v_tenant ORDER BY id LIMIT 1;
        IF v_supplier IS NULL THEN CONTINUE; END IF;
        SELECT id INTO v_supplier2 FROM ent.supplier WHERE tenant_id = v_tenant AND id != v_supplier ORDER BY id LIMIT 1;
        IF v_supplier2 IS NULL THEN v_supplier2 := v_supplier; END IF;

        -- Resolve intents
        SELECT id INTO v_int_opex_gen    FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL';
        SELECT id INTO v_int_opex_travel FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-TRAVEL';
        SELECT id INTO v_int_opex_it     FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT';
        SELECT id INTO v_int_opex_fac    FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-FACILITIES';
        SELECT id INTO v_int_opex_prof   FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-PROFESSIONAL';
        SELECT id INTO v_int_opex_mktg   FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-MARKETING';
        SELECT id INTO v_int_opex_hr     FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-HR';
        SELECT id INTO v_int_opex_ins    FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-INSURANCE';
        SELECT id INTO v_int_capex_equip FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT';
        SELECT id INTO v_int_capex_it    FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT';
        SELECT id INTO v_int_capex_fac   FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-FACILITIES';
        SELECT id INTO v_int_capex_veh   FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-VEHICLE';
        SELECT id INTO v_int_capex_intg  FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-INTANGIBLE';

        -- Resolve GL accounts
        SELECT id INTO v_acct_expense FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'EXPENSE' AND NOT is_group AND is_active
        ORDER BY account_code LIMIT 1;
        SELECT id INTO v_acct_expense2 FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'EXPENSE' AND NOT is_group AND is_active AND id != v_acct_expense
        ORDER BY account_code LIMIT 1;
        IF v_acct_expense2 IS NULL THEN v_acct_expense2 := v_acct_expense; END IF;
        SELECT id INTO v_acct_asset FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'ASSET' AND NOT is_group AND is_active
        ORDER BY account_code LIMIT 1;

        -- Resolve cost centers + profit center
        SELECT id INTO v_cc_id FROM fin.cost_center
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active ORDER BY code LIMIT 1;
        SELECT id INTO v_cc_id2 FROM fin.cost_center
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active AND id != v_cc_id ORDER BY code LIMIT 1;
        IF v_cc_id2 IS NULL THEN v_cc_id2 := v_cc_id; END IF;
        SELECT id INTO v_pc_id FROM fin.profit_center
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active ORDER BY code LIMIT 1;

        -- ====================================================================
        -- MONTH 1 — Period 1 (HARD_CLOSE): All POSTED, most PAID
        -- ====================================================================

        -- PI-001: Office supplies — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00001',
            v_supplier, v_ou_id, v_int_opex_gen,
            v_p1_start + 4, v_p1_start + 34, v_p1_start + 6,
            5000.0000, 500.0000, 5500.0000, 5500.0000,
            v_currency, 'PAID', 0.9200, 'ZERO_APPROVAL',
            'Office supplies and general operating expenses — Month 1');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Office furniture (desk chairs)', 10.000000, 200.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Printer paper and toner cartridges', 50.000000, 40.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 3, 'IT peripherals (keyboards, mice)', 20.000000, 50.0000, 1000.0000, 'STD', 0.100000, 100.0000, v_acct_expense, v_cc_id2, v_pc_id);

        -- PI-002: CNC Equipment — ENHANCED, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00002',
            v_supplier, v_ou_id, v_int_capex_equip,
            v_p1_start + 7, v_p1_start + 37, v_p1_start + 10,
            75000.0000, 7500.0000, 82500.0000, 82500.0000,
            v_currency, 'PAID', 0.6500, 'ENHANCED',
            'CNC machining equipment for Production Floor B',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'CNC Lathe Model X-500', 1.000000, 50000.0000, 50000.0000, 'STD', 0.100000, 5000.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Tool kit and installation service', 1.000000, 25000.0000, 25000.0000, 'STD', 0.100000, 2500.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-003: Cloud hosting — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00003',
            v_supplier2, v_ou_id, v_int_opex_it,
            v_p1_start + 2, v_p1_start + 32, v_p1_start + 4,
            1200.0000, 120.0000, 1320.0000, 1320.0000,
            v_currency, 'PAID', 0.9500, 'ZERO_APPROVAL',
            'Monthly cloud hosting services — Month 1');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Cloud hosting (monthly)', 1.000000, 1200.0000, 1200.0000, 'STD', 0.100000, 120.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-004: Professional services — STANDARD, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00004',
            v_supplier2, v_ou_id2, v_int_opex_prof,
            v_p1_start + 10, v_p1_start + 40, v_p1_start + 13,
            15000.0000, 1500.0000, 16500.0000, 16500.0000,
            v_currency, 'PAID', 0.8000, 'STANDARD',
            'Legal and accounting advisory — Month 1');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Legal advisory retainer', 1.000000, 10000.0000, 10000.0000, 'STD', 0.100000, 1000.0000, v_acct_expense2, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Tax compliance review', 1.000000, 5000.0000, 5000.0000, 'STD', 0.100000, 500.0000, v_acct_expense2, v_cc_id2, v_pc_id);

        -- PI-005: Marketing campaign — STANDARD, PARTIALLY_PAID (60%)
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00005',
            v_supplier, v_ou_id, v_int_opex_mktg,
            v_p1_start + 12, v_p1_start + 42, v_p1_start + 15,
            8000.0000, 800.0000, 8800.0000, 5280.0000,
            v_currency, 'PARTIALLY_PAID', 0.8500, 'STANDARD',
            'Digital marketing campaign Q1 launch');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Social media advertising', 1.000000, 5000.0000, 5000.0000, 'STD', 0.100000, 500.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Content creation services', 1.000000, 3000.0000, 3000.0000, 'STD', 0.100000, 300.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-006: Insurance premium — STANDARD, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00006',
            v_supplier2, v_ou_id, v_int_opex_ins,
            v_p1_start + 3, v_p1_start + 33, v_p1_start + 5,
            25000.0000, 2500.0000, 27500.0000, 27500.0000,
            v_currency, 'PAID', 0.7800, 'STANDARD',
            'Annual property and liability insurance premium');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Property insurance', 1.000000, 15000.0000, 15000.0000, 'STD', 0.100000, 1500.0000, v_acct_expense2, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Liability insurance', 1.000000, 10000.0000, 10000.0000, 'STD', 0.100000, 1000.0000, v_acct_expense2, v_cc_id, v_pc_id);

        -- PI-007: Travel expenses — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00007',
            v_supplier, v_ou_id2, v_int_opex_travel,
            v_p1_start + 18, v_p1_start + 48, v_p1_start + 20,
            3500.0000, 350.0000, 3850.0000, 3850.0000,
            v_currency, 'PAID', 0.9300, 'ZERO_APPROVAL',
            'Business travel — client site visits Month 1');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Airline tickets (3 pax)', 3.000000, 800.0000, 2400.0000, 'STD', 0.100000, 240.0000, v_acct_expense, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Hotel accommodation', 3.000000, 366.6700, 1100.0000, 'STD', 0.100000, 110.0000, v_acct_expense, v_cc_id2, v_pc_id);

        -- PI-008: IT infrastructure — EXECUTIVE, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00008',
            v_supplier2, v_ou_id, v_int_capex_it,
            v_p1_start + 8, v_p1_start + 38, v_p1_start + 12,
            120000.0000, 12000.0000, 132000.0000, 132000.0000,
            v_currency, 'PAID', 0.3500, 'EXECUTIVE',
            'Data center server refresh — rack units and networking',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Server rack units (4U)', 8.000000, 12000.0000, 96000.0000, 'STD', 0.100000, 9600.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Networking switches & cabling', 1.000000, 24000.0000, 24000.0000, 'STD', 0.100000, 2400.0000, v_acct_asset, v_cc_id, v_pc_id);

        -- PI-009: Facility maintenance — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00009',
            v_supplier, v_ou_id, v_int_opex_fac,
            v_p1_start + 15, v_p1_start + 45, v_p1_start + 17,
            4500.0000, 450.0000, 4950.0000, 4950.0000,
            v_currency, 'PAID', 0.9100, 'ZERO_APPROVAL',
            'Building maintenance and repairs — Month 1');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'HVAC servicing', 1.000000, 2500.0000, 2500.0000, 'STD', 0.100000, 250.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Plumbing repairs', 1.000000, 2000.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-010: Vehicle lease — STANDARD, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00010',
            v_supplier2, v_ou_id, v_int_capex_veh,
            v_p1_start + 5, v_p1_start + 35, v_p1_start + 8,
            35000.0000, 3500.0000, 38500.0000, 38500.0000,
            v_currency, 'PAID', 0.7500, 'STANDARD',
            'Company vehicle lease — delivery fleet',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Delivery van lease (12-month)', 2.000000, 15000.0000, 30000.0000, 'STD', 0.100000, 3000.0000, v_acct_asset, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Vehicle insurance and registration', 2.000000, 2500.0000, 5000.0000, 'STD', 0.100000, 500.0000, v_acct_expense, v_cc_id2, v_pc_id);

        -- ====================================================================
        -- MONTH 2 — Period 2 (SOFT_CLOSE): Mixed statuses
        -- ====================================================================

        -- PI-011: Office supplies — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00011',
            v_supplier, v_ou_id, v_int_opex_gen,
            v_p2_start + 3, v_p2_start + 33, v_p2_start + 5,
            3200.0000, 320.0000, 3520.0000, 3520.0000,
            v_currency, 'PAID', 0.9400, 'ZERO_APPROVAL',
            'Office supplies — Month 2');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Stationery and binders', 25.000000, 80.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Cleaning supplies', 15.000000, 80.0000, 1200.0000, 'STD', 0.100000, 120.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-012: Raw materials — STANDARD, PARTIALLY_PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00012',
            v_supplier2, v_ou_id, v_int_opex_gen,
            v_p2_start + 5, v_p2_start + 35, v_p2_start + 8,
            22000.0000, 2200.0000, 24200.0000, 14520.0000,
            v_currency, 'PARTIALLY_PAID', 0.8200, 'STANDARD',
            'Raw materials for production — Month 2',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Steel sheets (grade 304)', 100.000000, 120.0000, 12000.0000, 'STD', 0.100000, 1200.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Aluminum extrusions', 50.000000, 200.0000, 10000.0000, 'STD', 0.100000, 1000.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-013: Software licenses — ENHANCED, POSTED (unpaid)
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00013',
            v_supplier, v_ou_id, v_int_capex_it,
            v_p2_start + 1, v_p2_start + 60, v_p2_start + 4,
            45000.0000, 4500.0000, 49500.0000, 0.0000,
            v_currency, 'POSTED', 0.6200, 'ENHANCED',
            'Enterprise software licenses — annual renewal');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'ERP license (50 seats)', 50.000000, 600.0000, 30000.0000, 'STD', 0.100000, 3000.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Support and maintenance', 1.000000, 15000.0000, 15000.0000, 'STD', 0.100000, 1500.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-014: Legal consultation — STANDARD, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00014',
            v_supplier2, v_ou_id2, v_int_opex_prof,
            v_p2_start + 8, v_p2_start + 38, v_p2_start + 11,
            18000.0000, 1800.0000, 19800.0000, 19800.0000,
            v_currency, 'PAID', 0.7900, 'STANDARD',
            'Legal consultation — contract review and compliance');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Contract review (8 agreements)', 8.000000, 1500.0000, 12000.0000, 'STD', 0.100000, 1200.0000, v_acct_expense2, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Regulatory compliance advisory', 1.000000, 6000.0000, 6000.0000, 'STD', 0.100000, 600.0000, v_acct_expense2, v_cc_id2, v_pc_id);

        -- PI-015: Warehouse equipment — EXECUTIVE, APPROVED (awaiting posting)
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00015',
            v_supplier, v_ou_id, v_int_capex_equip,
            v_p2_start + 10, v_p2_start + 40, NULL,
            95000.0000, 9500.0000, 104500.0000, 0.0000,
            v_currency, 'APPROVED', 0.4200, 'EXECUTIVE',
            'Automated warehouse racking and conveyor system',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Automated racking system', 1.000000, 65000.0000, 65000.0000, 'STD', 0.100000, 6500.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Conveyor belt installation', 1.000000, 30000.0000, 30000.0000, 'STD', 0.100000, 3000.0000, v_acct_asset, v_cc_id, v_pc_id);

        -- PI-016: Training services — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00016',
            v_supplier2, v_ou_id2, v_int_opex_hr,
            v_p2_start + 12, v_p2_start + 42, v_p2_start + 14,
            7500.0000, 750.0000, 8250.0000, 8250.0000,
            v_currency, 'PAID', 0.9100, 'ZERO_APPROVAL',
            'Staff training — safety and compliance workshop');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Safety training (2-day)', 15.000000, 300.0000, 4500.0000, 'STD', 0.100000, 450.0000, v_acct_expense2, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Compliance certification', 15.000000, 200.0000, 3000.0000, 'STD', 0.100000, 300.0000, v_acct_expense2, v_cc_id2, v_pc_id);

        -- PI-017: Utilities — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00017',
            v_supplier, v_ou_id, v_int_opex_fac,
            v_p2_start + 1, v_p2_start + 31, v_p2_start + 3,
            2800.0000, 280.0000, 3080.0000, 3080.0000,
            v_currency, 'PAID', 0.9600, 'ZERO_APPROVAL',
            'Electricity and water utility bills — Month 2');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Electricity bill', 1.000000, 2000.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Water and sewage', 1.000000, 800.0000, 800.0000, 'STD', 0.100000, 80.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-018: R&D components — ENHANCED, POSTED (unpaid)
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00018',
            v_supplier2, v_ou_id, v_int_capex_equip,
            v_p2_start + 14, v_p2_start + 44, v_p2_start + 17,
            55000.0000, 5500.0000, 60500.0000, 0.0000,
            v_currency, 'POSTED', 0.5800, 'ENHANCED',
            'R&D laboratory equipment and components',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Spectrometer unit', 1.000000, 35000.0000, 35000.0000, 'STD', 0.100000, 3500.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Lab consumables (bulk)', 1.000000, 20000.0000, 20000.0000, 'STD', 0.100000, 2000.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-019: Courier services — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00019',
            v_supplier, v_ou_id, v_int_opex_gen,
            v_p2_start + 18, v_p2_start + 48, v_p2_start + 20,
            1500.0000, 150.0000, 1650.0000, 1650.0000,
            v_currency, 'PAID', 0.9700, 'ZERO_APPROVAL',
            'Express courier and freight services — Month 2');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Domestic express courier', 30.000000, 30.0000, 900.0000, 'STD', 0.100000, 90.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'International freight', 2.000000, 300.0000, 600.0000, 'STD', 0.100000, 60.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-020: Intangible assets — EXECUTIVE, SUBMITTED (in approval)
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00020',
            v_supplier2, v_ou_id, v_int_capex_intg,
            v_p2_start + 20, v_p2_start + 50, NULL,
            200000.0000, 20000.0000, 220000.0000, 0.0000,
            v_currency, 'SUBMITTED', 0.2800, 'EXECUTIVE',
            'Patent acquisition — industrial process technology');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Patent license fee', 1.000000, 180000.0000, 180000.0000, 'STD', 0.100000, 18000.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Legal and registration costs', 1.000000, 20000.0000, 20000.0000, 'STD', 0.100000, 2000.0000, v_acct_expense2, v_cc_id, v_pc_id);

        -- ====================================================================
        -- MONTH 3 — Period 3 (OPEN): Full lifecycle spread
        -- ====================================================================

        -- PI-021: Office supplies — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00021',
            v_supplier, v_ou_id, v_int_opex_gen,
            v_p3_start + 2, v_p3_start + 32, v_p3_start + 4,
            4100.0000, 410.0000, 4510.0000, 4510.0000,
            v_currency, 'PAID', 0.9300, 'ZERO_APPROVAL',
            'Office supplies — Month 3');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Printer consumables', 20.000000, 105.0000, 2100.0000, 'STD', 0.100000, 210.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Office pantry supplies', 40.000000, 50.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-022: Cloud services Q2 — STANDARD, POSTED (unpaid)
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00022',
            v_supplier2, v_ou_id, v_int_opex_it,
            v_p3_start + 1, v_p3_start + 60, v_p3_start + 3,
            15000.0000, 1500.0000, 16500.0000, 0.0000,
            v_currency, 'POSTED', 0.8100, 'STANDARD',
            'Cloud infrastructure — quarterly prepayment');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Cloud compute (3 months)', 3.000000, 3500.0000, 10500.0000, 'STD', 0.100000, 1050.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Cloud storage (3 months)', 3.000000, 1500.0000, 4500.0000, 'STD', 0.100000, 450.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-023: Equipment parts — STANDARD, APPROVED
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00023',
            v_supplier, v_ou_id, v_int_capex_equip,
            v_p3_start + 5, v_p3_start + 35, NULL,
            38000.0000, 3800.0000, 41800.0000, 0.0000,
            v_currency, 'APPROVED', 0.7200, 'STANDARD',
            'Replacement parts for production machinery',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Hydraulic press cylinder', 2.000000, 12000.0000, 24000.0000, 'STD', 0.100000, 2400.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Bearing assemblies', 20.000000, 700.0000, 14000.0000, 'STD', 0.100000, 1400.0000, v_acct_asset, v_cc_id, v_pc_id);

        -- PI-024: Marketing Q2 — ENHANCED, SUBMITTED
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00024',
            v_supplier2, v_ou_id, v_int_opex_mktg,
            v_p3_start + 7, v_p3_start + 37, NULL,
            60000.0000, 6000.0000, 66000.0000, 0.0000,
            v_currency, 'SUBMITTED', 0.6000, 'ENHANCED',
            'Marketing campaign — product launch event Q2');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Event venue and catering', 1.000000, 25000.0000, 25000.0000, 'STD', 0.100000, 2500.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Media placement and PR', 1.000000, 20000.0000, 20000.0000, 'STD', 0.100000, 2000.0000, v_acct_expense, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 3, 'Collateral and merchandise', 1.000000, 15000.0000, 15000.0000, 'STD', 0.100000, 1500.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-025: Audit services — ENHANCED, APPROVED
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00025',
            v_supplier, v_ou_id2, v_int_opex_prof,
            v_p3_start + 4, v_p3_start + 64, NULL,
            75000.0000, 7500.0000, 82500.0000, 0.0000,
            v_currency, 'APPROVED', 0.5500, 'ENHANCED',
            'External audit services — annual statutory audit');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Statutory audit fees', 1.000000, 60000.0000, 60000.0000, 'STD', 0.100000, 6000.0000, v_acct_expense2, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Out-of-pocket expenses', 1.000000, 15000.0000, 15000.0000, 'STD', 0.100000, 1500.0000, v_acct_expense2, v_cc_id2, v_pc_id);

        -- PI-026: Facility upgrade — EXECUTIVE, SUBMITTED
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00026',
            v_supplier2, v_ou_id, v_int_capex_fac,
            v_p3_start + 10, v_p3_start + 70, NULL,
            150000.0000, 15000.0000, 165000.0000, 0.0000,
            v_currency, 'SUBMITTED', 0.3000, 'EXECUTIVE',
            'Office renovation — new wing construction',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Construction and civil works', 1.000000, 100000.0000, 100000.0000, 'STD', 0.100000, 10000.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Electrical and HVAC fit-out', 1.000000, 35000.0000, 35000.0000, 'STD', 0.100000, 3500.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 3, 'Interior finishing', 1.000000, 15000.0000, 15000.0000, 'STD', 0.100000, 1500.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-027: Travel Q2 advance — ZERO_APPROVAL, PAID
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00027',
            v_supplier, v_ou_id2, v_int_opex_travel,
            v_p3_start + 3, v_p3_start + 33, v_p3_start + 5,
            5200.0000, 520.0000, 5720.0000, 5720.0000,
            v_currency, 'PAID', 0.9200, 'ZERO_APPROVAL',
            'Travel advance — trade show attendance');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Conference registration (4 pax)', 4.000000, 500.0000, 2000.0000, 'STD', 0.100000, 200.0000, v_acct_expense, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Flights and accommodation', 4.000000, 800.0000, 3200.0000, 'STD', 0.100000, 320.0000, v_acct_expense, v_cc_id2, v_pc_id);

        -- PI-028: HR consulting — STANDARD, DRAFT
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00028',
            v_supplier2, v_ou_id2, v_int_opex_hr,
            v_p3_start + 12, v_p3_start + 42, NULL,
            12000.0000, 1200.0000, 13200.0000, 0.0000,
            v_currency, 'DRAFT', NULL, NULL,
            'HR consulting — organizational restructuring advisory');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Org design consulting', 1.000000, 8000.0000, 8000.0000, 'STD', 0.100000, 800.0000, v_acct_expense2, v_cc_id2, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'Change management workshops', 1.000000, 4000.0000, 4000.0000, 'STD', 0.100000, 400.0000, v_acct_expense2, v_cc_id2, v_pc_id);

        -- PI-029: Stationery — ZERO_APPROVAL, DRAFT
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00029',
            v_supplier, v_ou_id, v_int_opex_gen,
            v_p3_start + 15, v_p3_start + 45, NULL,
            800.0000, 80.0000, 880.0000, 0.0000,
            v_currency, 'DRAFT', NULL, NULL,
            'Stationery and printing supplies — Month 3');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'Branded letterhead and envelopes', 500.000000, 1.6000, 800.0000, 'STD', 0.100000, 80.0000, v_acct_expense, v_cc_id, v_pc_id);

        -- PI-030: IT security tools — BLOCKED, DRAFT
        v_pi_id := pg_temp.upsert_pi_robust(
            v_tenant, v_entity, 'PI-2026-00030',
            v_supplier2, v_ou_id, v_int_capex_it,
            v_p3_start + 8, v_p3_start + 68, NULL,
            500000.0000, 50000.0000, 550000.0000, 0.0000,
            v_currency, 'DRAFT', 0.1000, 'BLOCKED',
            'Enterprise security platform — SIEM and EDR deployment',
            p_invoice_type := 'PO_BASED');
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 1, 'SIEM platform license (3yr)', 1.000000, 350000.0000, 350000.0000, 'STD', 0.100000, 35000.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 2, 'EDR agent deployment', 500.000000, 200.0000, 100000.0000, 'STD', 0.100000, 10000.0000, v_acct_asset, v_cc_id, v_pc_id);
        PERFORM pg_temp.upsert_pi_line_r(v_tenant, v_pi_id, 3, 'Implementation services', 1.000000, 50000.0000, 50000.0000, 'STD', 0.100000, 5000.0000, v_acct_expense, v_cc_id, v_pc_id);

        RAISE NOTICE 'Robust purchase invoices (30) seeded for tenant %', v_code;
    END LOOP;
END $$;
