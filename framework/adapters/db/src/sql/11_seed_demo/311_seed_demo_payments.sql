/* ============================================================================
   Athyper v2.1 — DEMO SEED: Payment Entries & Allocations
   Tables: fin.payment_entry, fin.payment_allocation
   Dependencies: core.tenant, fin.operating_unit, fin.chart_of_accounts,
                 fin.purchase_invoice, ent.supplier

   Seeds 2 payments per demo tenant (9 tenants = 18 payments):
     - PAY-001: Full payment for INV-001, POSTED+RECONCILED
     - PAY-002: Draft payment for INV-002, DRAFT with allocations

   Gross settlement semantics:
     allocated_amount = total AP reduction per invoice
     net cash = allocated - WHT - discount

   MC-4 compliant: all amounts are DECIMAL literals, no float.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert payment entry
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_pay(
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
        reconciled_at, reconciled_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_payment_number, p_supplier_id, p_description,
        p_ou_id, p_payment_method, p_bank_account_id,
        p_payment_date, p_total_amount, p_currency_code,
        p_status, p_decision_score, p_approval_route,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','RECONCILED') THEN now() END,
        CASE WHEN p_status IN ('SUBMITTED','APPROVED','POSTED','RECONCILED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('APPROVED','POSTED','RECONCILED') THEN now() END,
        CASE WHEN p_status IN ('APPROVED','POSTED','RECONCILED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status IN ('POSTED','RECONCILED') THEN now() END,
        CASE WHEN p_status IN ('POSTED','RECONCILED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        CASE WHEN p_status = 'RECONCILED' THEN now() END,
        CASE WHEN p_status = 'RECONCILED' THEN '00000000-0000-0000-0000-000000000001'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, payment_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert payment allocation
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_alloc(
    p_tenant uuid, p_payment_id uuid, p_invoice_id uuid, p_line_no smallint,
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
    v_ou_id      uuid;
    v_bank_acct  uuid;
    v_pay_id     uuid;
    v_inv_id     uuid;
    v_currency   text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Resolve tenant currency
        SELECT currency INTO v_currency FROM core.tenant_profile WHERE tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        -- Get first entity_code + OU
        SELECT entity_code, id INTO v_entity, v_ou_id
        FROM fin.operating_unit
        WHERE tenant_id = v_tenant
        ORDER BY entity_code
        LIMIT 1;

        IF v_entity IS NULL THEN CONTINUE; END IF;

        -- Get first supplier
        SELECT id INTO v_supplier FROM ent.supplier WHERE tenant_id = v_tenant LIMIT 1;
        IF v_supplier IS NULL THEN CONTINUE; END IF;

        -- Get bank account (first ASSET account as proxy)
        SELECT id INTO v_bank_acct FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND account_type = 'ASSET' LIMIT 1;

        -- ================================================================
        -- PAY-001: Full payment for PI-2026-00001, RECONCILED
        -- (INV-001 was 5500.00, fully paid)
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00001';

        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay(
                v_tenant, v_entity, 'PAY-2026-00001',
                v_supplier, v_ou_id,
                'WIRE', v_bank_acct,
                '2026-02-10',
                5500.0000, v_currency,
                'RECONCILED',
                0.9500, 'ZERO_APPROVAL',
                'Payment for PI-2026-00001 — office supplies'
            );

            -- Single allocation, full settlement, no discount/WHT
            PERFORM pg_temp.upsert_alloc(
                v_tenant, v_pay_id, v_inv_id, 1,
                5500.0000, 0.0000, 0.0000,
                'Full settlement of PI-2026-00001'
            );
        END IF;

        -- ================================================================
        -- PAY-002: Draft payment for PI-2026-00002, DRAFT
        -- (INV-002 was 82500.00, not yet approved)
        -- Demonstrates discount + WHT deductions
        -- ================================================================
        SELECT id INTO v_inv_id FROM fin.purchase_invoice
        WHERE tenant_id = v_tenant AND entity_code = v_entity AND invoice_number = 'PI-2026-00002';

        IF v_inv_id IS NOT NULL THEN
            v_pay_id := pg_temp.upsert_pay(
                v_tenant, v_entity, 'PAY-2026-00002',
                v_supplier, v_ou_id,
                'CHECK', v_bank_acct,
                '2026-03-15',
                82500.0000, v_currency,
                'DRAFT',
                NULL, NULL,
                'Payment for PI-2026-00002 — CNC equipment'
            );

            -- Allocation with early-payment discount (2%) and WHT (1%)
            -- allocated = 82500.00 (gross settlement)
            -- discount = 1650.00 (2%)
            -- WHT = 825.00 (1%)
            -- net cash = 82500 - 1650 - 825 = 80025.00
            PERFORM pg_temp.upsert_alloc(
                v_tenant, v_pay_id, v_inv_id, 1,
                82500.0000, 1650.0000, 825.0000,
                'Gross settlement: PI-2026-00002 with 2% discount + 1% WHT'
            );
        END IF;

        RAISE NOTICE 'Payment entries seeded for tenant %', v_code;
    END LOOP;
END $$;
