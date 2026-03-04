/* ============================================================================
   Athyper v2.1 — DEMO SEED: Purchase Invoices & Lines
   Tables: fin.purchase_invoice, fin.purchase_invoice_line
   Dependencies: core.tenant, fin.operating_unit, fin.business_intent,
                 fin.chart_of_accounts, fin.cost_center, fin.profit_center,
                 fin.funding_profile, ent.supplier

   Seeds 3 invoices per demo tenant (9 tenants = 27 invoices):
     - INV-001: OPEX general, 3 lines, POSTED status
     - INV-002: CAPEX equipment, 2 lines, APPROVED status (pending posting)
     - INV-003: Draft invoice, 1 line, DRAFT status

   MC-4 compliant: all amounts are DECIMAL literals, no float.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert purchase invoice
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_pi(
    p_tenant uuid, p_entity_code text, p_invoice_number text,
    p_supplier_id uuid, p_ou_id uuid, p_intent_id uuid,
    p_invoice_date date, p_due_date date,
    p_subtotal decimal(18,4), p_tax_amount decimal(18,4),
    p_total_amount decimal(18,4), p_paid_amount decimal(18,4),
    p_currency_code text, p_status text,
    p_decision_score decimal(5,4), p_approval_route text,
    p_description text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.purchase_invoice (
        id, tenant_id, entity_code, txn_id,
        invoice_number, supplier_id, description,
        ou_id, intent_id,
        invoice_date, due_date,
        subtotal, tax_amount, total_amount, paid_amount,
        currency_code, status,
        decision_score, approval_route,
        submitted_at, submitted_by,
        approved_at, approved_by,
        posted_at, posted_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_invoice_number, p_supplier_id, p_description,
        p_ou_id, p_intent_id,
        p_invoice_date, p_due_date,
        p_subtotal, p_tax_amount, p_total_amount, p_paid_amount,
        p_currency_code, p_status,
        p_decision_score, p_approval_route,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN now() END,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN now() END,
        CASE WHEN p_status IN ('APPROVED','POSTED','PAID','PARTIALLY_PAID') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('POSTED','PAID','PARTIALLY_PAID') THEN now() END,
        CASE WHEN p_status IN ('POSTED','PAID','PARTIALLY_PAID') THEN '00000000-0000-0000-0000-000000000001'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, invoice_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert purchase invoice line
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_pi_line(
    p_tenant uuid, p_invoice_id uuid, p_line_no smallint,
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
    v_ou_id      uuid;
    v_intent_id  uuid;
    v_account_id uuid;
    v_cc_id      uuid;
    v_pc_id      uuid;
    v_pi_id      uuid;
    v_currency   text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Resolve tenant currency
        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        -- Get first entity_code + OU for this tenant
        SELECT entity_code, id INTO v_entity, v_ou_id
        FROM fin.operating_unit
        WHERE tenant_id = v_tenant
        ORDER BY entity_code
        LIMIT 1;

        IF v_entity IS NULL THEN CONTINUE; END IF;

        -- Get first supplier
        SELECT id INTO v_supplier FROM ent.supplier WHERE tenant_id = v_tenant LIMIT 1;
        IF v_supplier IS NULL THEN CONTINUE; END IF;

        -- Get OPEX-GENERAL intent
        SELECT id INTO v_intent_id FROM fin.business_intent
        WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL';

        -- Get first GL account, cost center, profit center
        SELECT id INTO v_account_id FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND account_type = 'EXPENSE' LIMIT 1;

        SELECT id INTO v_cc_id FROM fin.cost_center
        WHERE tenant_id = v_tenant LIMIT 1;

        SELECT id INTO v_pc_id FROM fin.profit_center
        WHERE tenant_id = v_tenant LIMIT 1;

        -- ================================================================
        -- INV-001: OPEX General — 3 lines, POSTED
        -- ================================================================
        v_pi_id := pg_temp.upsert_pi(
            v_tenant, v_entity, 'PI-2026-00001',
            v_supplier, v_ou_id, v_intent_id,
            '2026-01-15', '2026-02-15',
            5000.0000, 500.0000, 5500.0000, 5500.0000,
            v_currency, 'POSTED',
            0.9200, 'ZERO_APPROVAL',
            'Office supplies and general operating expenses — January 2026'
        );

        PERFORM pg_temp.upsert_pi_line(v_tenant, v_pi_id, 1,
            'Office furniture (desk chairs)', 10.000000, 200.0000, 2000.0000,
            'STD', 0.100000, 200.0000, v_account_id, v_cc_id, v_pc_id);

        PERFORM pg_temp.upsert_pi_line(v_tenant, v_pi_id, 2,
            'Printer paper and toner cartridges', 50.000000, 40.0000, 2000.0000,
            'STD', 0.100000, 200.0000, v_account_id, v_cc_id, v_pc_id);

        PERFORM pg_temp.upsert_pi_line(v_tenant, v_pi_id, 3,
            'IT peripherals (keyboards, mice)', 20.000000, 50.0000, 1000.0000,
            'STD', 0.100000, 100.0000, v_account_id, v_cc_id, v_pc_id);

        -- ================================================================
        -- INV-002: CAPEX Equipment — 2 lines, APPROVED
        -- ================================================================
        v_pi_id := pg_temp.upsert_pi(
            v_tenant, v_entity, 'PI-2026-00002',
            v_supplier, v_ou_id,
            (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
            '2026-02-01', '2026-03-01',
            75000.0000, 7500.0000, 82500.0000, 0.0000,
            v_currency, 'APPROVED',
            0.6500, 'ENHANCED',
            'CNC machining equipment for Production Floor B'
        );

        PERFORM pg_temp.upsert_pi_line(v_tenant, v_pi_id, 1,
            'CNC Lathe Model X-500', 1.000000, 50000.0000, 50000.0000,
            'STD', 0.100000, 5000.0000, v_account_id, v_cc_id, v_pc_id);

        PERFORM pg_temp.upsert_pi_line(v_tenant, v_pi_id, 2,
            'Tool kit and installation service', 1.000000, 25000.0000, 25000.0000,
            'STD', 0.100000, 2500.0000, v_account_id, v_cc_id, v_pc_id);

        -- ================================================================
        -- INV-003: Draft invoice — 1 line, DRAFT
        -- ================================================================
        v_pi_id := pg_temp.upsert_pi(
            v_tenant, v_entity, 'PI-2026-00003',
            v_supplier, v_ou_id, v_intent_id,
            '2026-03-01', '2026-03-31',
            1200.0000, 120.0000, 1320.0000, 0.0000,
            v_currency, 'DRAFT',
            NULL, NULL,
            'Monthly cloud hosting services — March 2026'
        );

        PERFORM pg_temp.upsert_pi_line(v_tenant, v_pi_id, 1,
            'Cloud hosting (monthly)', 1.000000, 1200.0000, 1200.0000,
            'STD', 0.100000, 120.0000, v_account_id, v_cc_id, v_pc_id);

        RAISE NOTICE 'Purchase invoices seeded for tenant %', v_code;
    END LOOP;
END $$;
