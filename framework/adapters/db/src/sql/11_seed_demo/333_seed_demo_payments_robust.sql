/* ============================================================================
   Athyper v2.4 — DEMO SEED: Robust Payment Entries (24 per tenant)
   Tables: fin.payment_entry, fin.payment_allocation
   Dependencies: 330_seed_demo_invoices_robust.sql

   Seeds 24 payments per demo tenant (9 tenants = 216 payments):
     Month 1 (P1, HARD_CLOSE): 9 payments — all RECONCILED
     Month 2 (P2, SOFT_CLOSE): 8 payments — mixed (RECONCILED/POSTED/APPROVED/VOIDED)
     Month 3 (P3, OPEN):       7 payments — mixed (POSTED/APPROVED/SUBMITTED/DRAFT/CANCELLED)

   Payment methods: WIRE, ACH, CHECK, CARD
   Includes batch payments, partial settlements, voided, and cancelled.
   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

CREATE OR REPLACE FUNCTION pg_temp.upsert_pay_r(
    p_tenant uuid, p_entity_code text, p_payment_number text,
    p_supplier_id uuid, p_ou_id uuid,
    p_payment_method text, p_bank_account_id uuid,
    p_payment_date date,
    p_total_amount decimal(18,4), p_currency_code text,
    p_status text,
    p_decision_score decimal(5,4), p_approval_route text,
    p_description text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.payment_entry (
        id, tenant_id, entity_code, txn_id,
        payment_number, supplier_id, description,
        ou_id, payment_method, bank_account_id,
        payment_date, total_amount, currency_code,
        status, decision_score, approval_route,
        submitted_at, submitted_by,
        approved_at, approved_by,
        posted_at, posted_by,
        reconciled_at, reconciled_by,
        cancelled_at, cancelled_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_payment_number, p_supplier_id, p_description,
        p_ou_id, p_payment_method, p_bank_account_id,
        p_payment_date, p_total_amount, p_currency_code,
        p_status, p_decision_score, p_approval_route,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','RECONCILED','VOIDED') THEN p_payment_date END,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','RECONCILED','VOIDED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('APPROVED','POSTED','RECONCILED','VOIDED') THEN p_payment_date + interval '1 day' END,
        CASE WHEN p_status IN ('APPROVED','POSTED','RECONCILED','VOIDED') THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status IN ('POSTED','RECONCILED','VOIDED') THEN p_payment_date + interval '1 day' END,
        CASE WHEN p_status IN ('POSTED','RECONCILED','VOIDED') THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status = 'RECONCILED' THEN p_payment_date + interval '3 days' END,
        CASE WHEN p_status = 'RECONCILED' THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        CASE WHEN p_status = 'CANCELLED' THEN p_payment_date + interval '1 day' END,
        CASE WHEN p_status = 'CANCELLED' THEN '00000000-0000-0000-0000-000000000001'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, payment_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_alloc_r(
    p_tenant uuid, p_payment_id uuid, p_invoice_id uuid, p_line_no int,
    p_allocated_amount decimal(18,4),
    p_discount_amount decimal(18,4),
    p_withholding_amount decimal(18,4),
    p_description text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.payment_allocation (
        id, tenant_id, payment_id, invoice_id, line_no,
        allocated_amount, discount_amount, withholding_amount,
        description
    ) VALUES (
        gen_random_uuid(), p_tenant, p_payment_id, p_invoice_id, p_line_no,
        p_allocated_amount, p_discount_amount, p_withholding_amount,
        p_description
    )
    ON CONFLICT (tenant_id, payment_id, line_no) DO UPDATE SET updated_at = now()
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
    v_bank_acct  uuid;
    v_pay_id     uuid;
    v_inv_id     uuid;
    v_currency   text;
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

        SELECT id INTO v_ou_id2 FROM fin.operating_unit
        WHERE tenant_id = v_tenant AND id != v_ou_id ORDER BY entity_code LIMIT 1;
        IF v_ou_id2 IS NULL THEN v_ou_id2 := v_ou_id; END IF;

        SELECT id INTO v_supplier FROM ent.supplier WHERE tenant_id = v_tenant ORDER BY id LIMIT 1;
        IF v_supplier IS NULL THEN CONTINUE; END IF;
        SELECT id INTO v_supplier2 FROM ent.supplier WHERE tenant_id = v_tenant AND id != v_supplier ORDER BY id LIMIT 1;
        IF v_supplier2 IS NULL THEN v_supplier2 := v_supplier; END IF;

        SELECT id INTO v_bank_acct FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_code = '1110' LIMIT 1;
        IF v_bank_acct IS NULL THEN
            SELECT id INTO v_bank_acct FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND account_type = 'ASSET' AND NOT is_group LIMIT 1;
        END IF;

        -- ====================================================================
        -- MONTH 1 — Period 1 (HARD_CLOSE): 9 payments, all RECONCILED
        -- ====================================================================

        -- PAY-001: Full payment PI-001 (5,500)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00001';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00001', v_supplier, v_ou_id, 'WIRE', v_bank_acct, v_p1_start + 20, 5500.0000, v_currency, 'RECONCILED', 0.9500, 'ZERO_APPROVAL', 'Payment for PI-001 — office supplies');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 5500.0000, 0.0000, 0.0000, 'Full settlement PI-001');
        END IF;

        -- PAY-002: Full payment PI-002 (82,500)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00002';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00002', v_supplier, v_ou_id, 'WIRE', v_bank_acct, v_p1_start + 22, 82500.0000, v_currency, 'RECONCILED', 0.6500, 'ENHANCED', 'Payment for PI-002 — CNC equipment');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 82500.0000, 0.0000, 0.0000, 'Full settlement PI-002');
        END IF;

        -- PAY-003: Full payment PI-003 (1,320)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00003';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00003', v_supplier2, v_ou_id, 'ACH', v_bank_acct, v_p1_start + 18, 1320.0000, v_currency, 'RECONCILED', 0.9500, 'ZERO_APPROVAL', 'Payment for PI-003 — cloud hosting');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 1320.0000, 0.0000, 0.0000, 'Full settlement PI-003');
        END IF;

        -- PAY-004: Full payment PI-004 (16,500) with 1% WHT
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00004';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00004', v_supplier2, v_ou_id2, 'WIRE', v_bank_acct, v_p1_start + 24, 16500.0000, v_currency, 'RECONCILED', 0.8000, 'STANDARD', 'Payment for PI-004 — professional services');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 16500.0000, 0.0000, 165.0000, 'PI-004 with 1% WHT');
        END IF;

        -- PAY-005: Partial payment PI-005 (5,280 of 8,800 = 60%)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00005';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00005', v_supplier, v_ou_id, 'CHECK', v_bank_acct, v_p1_start + 26, 5280.0000, v_currency, 'RECONCILED', 0.8500, 'STANDARD', 'Partial payment PI-005 — marketing (60%)');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 5280.0000, 0.0000, 0.0000, 'Partial (60%) PI-005');
        END IF;

        -- PAY-006: Full payment PI-006 (27,500)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00006';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00006', v_supplier2, v_ou_id, 'WIRE', v_bank_acct, v_p1_start + 19, 27500.0000, v_currency, 'RECONCILED', 0.7800, 'STANDARD', 'Payment for PI-006 — insurance');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 27500.0000, 0.0000, 0.0000, 'Full settlement PI-006');
        END IF;

        -- PAY-007: Full payment PI-007 (3,850)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00007';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00007', v_supplier, v_ou_id2, 'CARD', v_bank_acct, v_p1_start + 25, 3850.0000, v_currency, 'RECONCILED', 0.9300, 'ZERO_APPROVAL', 'Payment for PI-007 — travel');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 3850.0000, 0.0000, 0.0000, 'Full settlement PI-007');
        END IF;

        -- PAY-008: Full payment PI-008 (132,000)
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00008';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00008', v_supplier2, v_ou_id, 'WIRE', v_bank_acct, v_p1_start + 23, 132000.0000, v_currency, 'RECONCILED', 0.3500, 'EXECUTIVE', 'Payment for PI-008 — IT infrastructure');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 132000.0000, 0.0000, 0.0000, 'Full settlement PI-008');
        END IF;

        -- PAY-009: Batch payment PI-009 + PI-010 (4,950 + 38,500 = 43,450)
        v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00009', v_supplier, v_ou_id, 'ACH', v_bank_acct, v_p1_start + 27, 43450.0000, v_currency, 'RECONCILED', 0.9100, 'ZERO_APPROVAL', 'Batch payment PI-009 + PI-010');
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00009';
        IF v_inv_id IS NOT NULL THEN
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 4950.0000, 0.0000, 0.0000, 'PI-009 — facility maintenance');
        END IF;
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00010';
        IF v_inv_id IS NOT NULL THEN
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 2, 38500.0000, 0.0000, 0.0000, 'PI-010 — vehicle lease');
        END IF;

        -- ====================================================================
        -- MONTH 2 — Period 2 (SOFT_CLOSE): 8 payments, mixed statuses
        -- ====================================================================

        -- PAY-010: Full payment PI-011 (3,520) — RECONCILED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00011';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00010', v_supplier, v_ou_id, 'WIRE', v_bank_acct, v_p2_start + 18, 3520.0000, v_currency, 'RECONCILED', 0.9400, 'ZERO_APPROVAL', 'Payment for PI-011 — office supplies');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 3520.0000, 0.0000, 0.0000, 'Full settlement PI-011');
        END IF;

        -- PAY-011: Partial payment PI-012 (14,520 of 24,200 = 60%) — POSTED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00012';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00011', v_supplier2, v_ou_id, 'ACH', v_bank_acct, v_p2_start + 20, 14520.0000, v_currency, 'POSTED', 0.8200, 'STANDARD', 'Partial payment PI-012 — raw materials (60%)');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 14520.0000, 0.0000, 0.0000, 'Partial (60%) PI-012');
        END IF;

        -- PAY-012: Full payment PI-014 (19,800) — RECONCILED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00014';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00012', v_supplier2, v_ou_id2, 'WIRE', v_bank_acct, v_p2_start + 22, 19800.0000, v_currency, 'RECONCILED', 0.7900, 'STANDARD', 'Payment for PI-014 — legal consultation');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 19800.0000, 0.0000, 198.0000, 'PI-014 with 1% WHT');
        END IF;

        -- PAY-013: Full payment PI-016 (8,250) — RECONCILED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00016';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00013', v_supplier2, v_ou_id2, 'ACH', v_bank_acct, v_p2_start + 24, 8250.0000, v_currency, 'RECONCILED', 0.9100, 'ZERO_APPROVAL', 'Payment for PI-016 — training');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 8250.0000, 0.0000, 0.0000, 'Full settlement PI-016');
        END IF;

        -- PAY-014: Full payment PI-017 (3,080) — RECONCILED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00017';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00014', v_supplier, v_ou_id, 'ACH', v_bank_acct, v_p2_start + 15, 3080.0000, v_currency, 'RECONCILED', 0.9600, 'ZERO_APPROVAL', 'Payment for PI-017 — utilities');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 3080.0000, 0.0000, 0.0000, 'Full settlement PI-017');
        END IF;

        -- PAY-015: Full payment PI-019 (1,650) — POSTED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00019';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00015', v_supplier, v_ou_id, 'CARD', v_bank_acct, v_p2_start + 25, 1650.0000, v_currency, 'POSTED', 0.9700, 'ZERO_APPROVAL', 'Payment for PI-019 — courier services');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 1650.0000, 0.0000, 0.0000, 'Full settlement PI-019');
        END IF;

        -- PAY-016: PI-005 remainder (3,520) — APPROVED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00005';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00016', v_supplier, v_ou_id, 'WIRE', v_bank_acct, v_p2_start + 26, 3520.0000, v_currency, 'APPROVED', 0.8500, 'STANDARD', 'Remainder payment PI-005 — marketing (40%)');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 3520.0000, 0.0000, 0.0000, 'Remainder (40%) PI-005');
        END IF;

        -- PAY-017: PI-013 (attempted) — VOIDED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00013';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00017', v_supplier, v_ou_id, 'WIRE', v_bank_acct, v_p2_start + 23, 49500.0000, v_currency, 'VOIDED', 0.6200, 'ENHANCED', 'Voided payment PI-013 — incorrect bank details');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 49500.0000, 0.0000, 0.0000, 'Voided: PI-013');
        END IF;

        -- ====================================================================
        -- MONTH 3 — Period 3 (OPEN): 7 payments, current period
        -- ====================================================================

        -- PAY-018: Full payment PI-021 (4,510) — POSTED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00021';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00018', v_supplier, v_ou_id, 'ACH', v_bank_acct, v_p3_start + 10, 4510.0000, v_currency, 'POSTED', 0.9300, 'ZERO_APPROVAL', 'Payment for PI-021 — office supplies');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 4510.0000, 0.0000, 0.0000, 'Full settlement PI-021');
        END IF;

        -- PAY-019: Full payment PI-027 (5,720) — POSTED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00027';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00019', v_supplier, v_ou_id2, 'CARD', v_bank_acct, v_p3_start + 12, 5720.0000, v_currency, 'POSTED', 0.9200, 'ZERO_APPROVAL', 'Payment for PI-027 — travel Q2');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 5720.0000, 0.0000, 0.0000, 'Full settlement PI-027');
        END IF;

        -- PAY-020: PI-022 planned (16,500) — APPROVED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00022';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00020', v_supplier2, v_ou_id, 'WIRE', v_bank_acct, v_p3_start + 15, 16500.0000, v_currency, 'APPROVED', 0.8100, 'STANDARD', 'Payment for PI-022 — cloud services Q2');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 16500.0000, 0.0000, 0.0000, 'Full settlement PI-022');
        END IF;

        -- PAY-021: PI-012 remainder (9,680) — SUBMITTED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00012';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00021', v_supplier2, v_ou_id, 'WIRE', v_bank_acct, v_p3_start + 14, 9680.0000, v_currency, 'SUBMITTED', 0.8200, 'STANDARD', 'Remainder payment PI-012 — raw materials (40%)');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 9680.0000, 0.0000, 0.0000, 'Remainder (40%) PI-012');
        END IF;

        -- PAY-022: PI-025 partial (40,000 of 82,500) — DRAFT
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00025';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00022', v_supplier, v_ou_id2, 'WIRE', v_bank_acct, v_p3_start + 18, 40000.0000, v_currency, 'DRAFT', NULL, NULL, 'Draft payment PI-025 — audit services (partial)');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 40000.0000, 0.0000, 0.0000, 'Partial (48%) PI-025');
        END IF;

        -- PAY-023: PI-018 planned (60,500) — DRAFT
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00018';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00023', v_supplier2, v_ou_id, 'ACH', v_bank_acct, v_p3_start + 20, 60500.0000, v_currency, 'DRAFT', NULL, NULL, 'Draft payment PI-018 — R&D components');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 60500.0000, 0.0000, 0.0000, 'Full settlement PI-018');
        END IF;

        -- PAY-024: PI-005 final settle attempt — CANCELLED
        SELECT id INTO v_inv_id FROM fin.purchase_invoice WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00005';
        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay_r(v_tenant, v_entity, 'PAY-2026-00024', v_supplier, v_ou_id, 'CHECK', v_bank_acct, v_p3_start + 8, 3520.0000, v_currency, 'CANCELLED', 0.8500, 'STANDARD', 'Cancelled — duplicate of PAY-016');
            PERFORM pg_temp.upsert_alloc_r(v_tenant, v_pay_id, v_inv_id, 1, 3520.0000, 0.0000, 0.0000, 'Cancelled: duplicate');
        END IF;

        RAISE NOTICE 'Robust payment entries (24) seeded for tenant %', v_code;
    END LOOP;
END $$;
