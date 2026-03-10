/* ============================================================================
   Athyper v2.5 — DEMO SEED: Asset, FX Revaluation, IC Elimination

   Seeds demo data rows for three entity list pages:
     - Asset                      (fin.asset)               — 12 per tenant
     - FxRevaluation              (fin.fx_revaluation_run)  —  6 per tenant
     - ConsolidationElimination   (fin.consolidation_elimination) — 8 per tenant

   Dependencies: core.tenant, fin.operating_unit, fin.chart_of_accounts,
                 fin.cost_center, ent.supplier, ref.currency,
                 299_seed_demo_legal_entity.sql, 320_seed_demo_fiscal_open.sql

   MC-4 compliant: all amounts are DECIMAL literals, no float.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert asset
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_asset(
    p_tenant uuid, p_entity_code text, p_asset_number text,
    p_name text, p_description text, p_asset_class text, p_status text,
    p_acquisition_date date, p_acquisition_cost decimal(18,4),
    p_currency_code text, p_residual_value decimal(18,4),
    p_useful_life_months int, p_ou_id uuid, p_cost_center_id uuid,
    p_location text, p_vendor_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.asset (
        id, tenant_id, entity_code, asset_number, name, description,
        asset_class, status, acquisition_date, acquisition_cost,
        currency_code, residual_value, useful_life_months,
        ou_id, cost_center_id, location, vendor_id
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, p_asset_number,
        p_name, p_description, p_asset_class, p_status,
        p_acquisition_date, p_acquisition_cost, p_currency_code,
        p_residual_value, p_useful_life_months,
        p_ou_id, p_cost_center_id, p_location, p_vendor_id
    )
    ON CONFLICT (tenant_id, entity_code, asset_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert fx revaluation run
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_fxr(
    p_tenant uuid, p_entity_code text, p_revaluation_code text,
    p_description text, p_period_code text, p_revaluation_date date,
    p_posting_date date, p_rate_source text, p_ou_id uuid,
    p_functional_currency text,
    p_total_gain decimal(18,4), p_total_loss decimal(18,4),
    p_net_amount decimal(18,4), p_line_count int, p_status text,
    p_decision_score decimal(5,4), p_approval_route text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.fx_revaluation_run (
        id, tenant_id, entity_code, txn_id,
        revaluation_code, description, period_code, revaluation_date,
        posting_date, rate_source, ou_id, functional_currency_code,
        total_gain, total_loss, net_amount, line_count, status,
        decision_score, approval_route,
        calculated_at, calculated_by,
        approved_at, approved_by,
        posted_at, posted_by
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, gen_random_uuid(),
        p_revaluation_code, p_description, p_period_code, p_revaluation_date,
        p_posting_date, p_rate_source, p_ou_id, p_functional_currency,
        p_total_gain, p_total_loss, p_net_amount, p_line_count, p_status,
        p_decision_score, p_approval_route,
        -- Calculated
        CASE WHEN p_status IN ('CALCULATED','APPROVED','POSTED','REVERSED') THEN p_revaluation_date END,
        CASE WHEN p_status IN ('CALCULATED','APPROVED','POSTED','REVERSED') THEN '00000000-0000-0000-0000-000000000001'::uuid END,
        -- Approved
        CASE WHEN p_status IN ('APPROVED','POSTED','REVERSED') THEN p_revaluation_date + interval '1 day' END,
        CASE WHEN p_status IN ('APPROVED','POSTED','REVERSED') THEN '00000000-0000-0000-0000-000000000002'::uuid END,
        -- Posted
        CASE WHEN p_status IN ('POSTED','REVERSED') THEN p_posting_date END,
        CASE WHEN p_status IN ('POSTED','REVERSED') THEN '00000000-0000-0000-0000-000000000002'::uuid END
    )
    ON CONFLICT (tenant_id, entity_code, revaluation_code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: insert consolidation elimination (no natural key for upsert, use idempotent pattern)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_consol_elim(
    p_tenant uuid, p_fiscal_year smallint, p_period_number smallint,
    p_elimination_type text, p_source_entity text, p_dest_entity text,
    p_amount decimal(18,4), p_currency_code text, p_status text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    -- Use combination of period + type + entities as idempotency key
    SELECT id INTO v_id FROM fin.consolidation_elimination
    WHERE tenant_id = p_tenant
      AND fiscal_year = p_fiscal_year
      AND period_number = p_period_number
      AND elimination_type = p_elimination_type
      AND source_entity_code = p_source_entity
      AND dest_entity_code = p_dest_entity;

    IF v_id IS NOT NULL THEN RETURN v_id; END IF;

    INSERT INTO fin.consolidation_elimination (
        id, tenant_id, fiscal_year, period_number,
        elimination_type, source_entity_code, dest_entity_code,
        amount, currency_code, status
    ) VALUES (
        gen_random_uuid(), p_tenant, p_fiscal_year, p_period_number,
        p_elimination_type, p_source_entity, p_dest_entity,
        p_amount, p_currency_code, p_status
    )
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
    v_entity     text;  -- entity_code from operating_unit
    v_ou_id      uuid;
    v_currency   text;
    v_supplier   uuid;
    v_cc_id      uuid;
    v_acct_asset uuid;
    v_fy_start   int;
    v_p1_start   date;
    v_p2_start   date;
    v_p3_start   date;
    -- Legal entities for IC eliminations
    v_le_parent  text;
    v_le_sub1    text;
    v_le_sub2    text;
    v_ignore     uuid;
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

        -- Supplier
        SELECT id INTO v_supplier FROM ent.supplier
        WHERE tenant_id = v_tenant LIMIT 1;

        -- Cost center
        SELECT id INTO v_cc_id FROM fin.cost_center
        WHERE tenant_id = v_tenant LIMIT 1;

        -- Asset account
        SELECT id INTO v_acct_asset FROM fin.chart_of_accounts
        WHERE tenant_id = v_tenant AND account_type = 'ASSET'
        LIMIT 1;

        -- Legal entities for IC elimination (fallback to entity_codes)
        SELECT code INTO v_le_parent FROM fin.legal_entity
        WHERE tenant_id = v_tenant AND entity_type = 'PARENT' LIMIT 1;
        SELECT code INTO v_le_sub1 FROM fin.legal_entity
        WHERE tenant_id = v_tenant AND entity_type = 'SUBSIDIARY'
        ORDER BY code LIMIT 1;
        SELECT code INTO v_le_sub2 FROM fin.legal_entity
        WHERE tenant_id = v_tenant AND entity_type = 'SUBSIDIARY' AND code != COALESCE(v_le_sub1, '')
        ORDER BY code LIMIT 1;
        -- Fallback if no legal entities seeded
        IF v_le_parent IS NULL THEN v_le_parent := v_entity; END IF;
        IF v_le_sub1 IS NULL THEN v_le_sub1 := v_entity || '-S1'; END IF;
        IF v_le_sub2 IS NULL THEN v_le_sub2 := v_entity || '-S2'; END IF;


        -- ================================================================
        -- A. ASSETS (12 per tenant: mix of classes and statuses)
        -- ================================================================

        -- Month 1 assets (CAPITALIZED / ACTIVE)
        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00001',
            'Office Building – HQ', 'Headquarters office building, 3 floors',
            'BUILDING', 'ACTIVE', v_p1_start + 2, 2500000.0000,
            v_currency, 250000.0000, 480, v_ou_id, v_cc_id, 'HQ Campus, Building A', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00002',
            'CNC Milling Machine', 'Precision CNC machine for manufacturing floor',
            'MACHINERY', 'ACTIVE', v_p1_start + 5, 185000.0000,
            v_currency, 18500.0000, 120, v_ou_id, v_cc_id, 'Plant 1, Bay 4', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00003',
            'Delivery Truck – Fleet #12', 'Medium-duty delivery truck',
            'VEHICLE', 'ACTIVE', v_p1_start + 8, 75000.0000,
            v_currency, 12000.0000, 96, v_ou_id, v_cc_id, 'Motor Pool', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00004',
            'ERP Software License', 'Enterprise resource planning perpetual license',
            'INTANGIBLE', 'CAPITALIZED', v_p1_start + 10, 320000.0000,
            v_currency, 0.0000, 60, v_ou_id, v_cc_id, NULL, v_supplier);

        -- Month 2 assets (mixed statuses)
        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00005',
            'Server Rack – DC01', 'Data center server rack with 42U',
            'IT_EQUIPMENT', 'ACTIVE', v_p2_start + 3, 48000.0000,
            v_currency, 4800.0000, 60, v_ou_id, v_cc_id, 'Data Center 1, Row B', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00006',
            'Executive Furniture Suite', 'Boardroom table and chairs set',
            'FURNITURE', 'ACTIVE', v_p2_start + 7, 28000.0000,
            v_currency, 2800.0000, 120, v_ou_id, v_cc_id, 'HQ Floor 3, Boardroom', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00007',
            'Warehouse Forklift', 'Electric counterbalance forklift 2.5T',
            'MACHINERY', 'IMPAIRED', v_p2_start + 10, 42000.0000,
            v_currency, 5000.0000, 84, v_ou_id, v_cc_id, 'Warehouse A', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00008',
            'Leased Office – Branch', 'Right-of-use asset for branch lease',
            'LEASED', 'ACTIVE', v_p2_start + 12, 150000.0000,
            v_currency, 0.0000, 60, v_ou_id, v_cc_id, 'Branch Office, City Center', v_supplier);

        -- Month 3 assets (WIP, new, disposed)
        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00009',
            'New Production Line', 'Automated assembly line — in construction',
            'MACHINERY', 'WIP', v_p3_start + 1, 890000.0000,
            v_currency, 89000.0000, 180, v_ou_id, v_cc_id, 'Plant 2', v_supplier);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00010',
            'Parking Lot – Annex', 'Employee parking area, paved surface',
            'LAND', 'ACTIVE', v_p3_start + 4, 380000.0000,
            v_currency, 380000.0000, 0, v_ou_id, v_cc_id, 'HQ Campus Annex', NULL);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00011',
            'Old Printing Press', 'Decommissioned offset printer',
            'MACHINERY', 'RETIRED', v_p3_start + 6, 95000.0000,
            v_currency, 5000.0000, 120, v_ou_id, v_cc_id, 'Plant 1, Bay 1', NULL);

        v_ignore := pg_temp.upsert_asset(v_tenant, v_entity, 'AST-2026-00012',
            'Company Van – Sold', 'Mini van disposed via auction',
            'VEHICLE', 'DISPOSED', v_p3_start + 8, 35000.0000,
            v_currency, 8000.0000, 72, v_ou_id, v_cc_id, 'Motor Pool', NULL);


        -- ================================================================
        -- B. FX REVALUATION RUNS (6 per tenant: across 3 periods)
        -- ================================================================

        -- Period 1 — POSTED (closed period)
        v_ignore := pg_temp.upsert_fxr(v_tenant, v_entity, 'FXR-2026-P1-001',
            'Period 1 FX revaluation — AP balances (EUR/GBP)',
            'P1', v_p1_start + 28, v_p1_start + 28,
            'ECB', v_ou_id, v_currency,
            12500.0000, 8200.0000, 4300.0000, 15, 'POSTED',
            0.9200, 'ZERO_APPROVAL');

        v_ignore := pg_temp.upsert_fxr(v_tenant, v_entity, 'FXR-2026-P1-002',
            'Period 1 FX revaluation — Intercompany balances',
            'P1', v_p1_start + 28, v_p1_start + 28,
            'ECB', v_ou_id, v_currency,
            5800.0000, 3100.0000, 2700.0000, 8, 'POSTED',
            0.8800, 'STANDARD');

        -- Period 2 — APPROVED (soft close, awaiting posting)
        v_ignore := pg_temp.upsert_fxr(v_tenant, v_entity, 'FXR-2026-P2-001',
            'Period 2 FX revaluation — AP/AR balances',
            'P2', v_p2_start + 27, v_p2_start + 28,
            'REUTERS', v_ou_id, v_currency,
            18200.0000, 14500.0000, 3700.0000, 22, 'APPROVED',
            0.8500, 'STANDARD');

        v_ignore := pg_temp.upsert_fxr(v_tenant, v_entity, 'FXR-2026-P2-002',
            'Period 2 FX revaluation — Bank accounts',
            'P2', v_p2_start + 27, NULL,
            'ECB', v_ou_id, v_currency,
            9400.0000, 11200.0000, -1800.0000, 6, 'CALCULATED',
            NULL, NULL);

        -- Period 3 — DRAFT + CALCULATED (open period)
        v_ignore := pg_temp.upsert_fxr(v_tenant, v_entity, 'FXR-2026-P3-001',
            'Period 3 FX revaluation — All foreign currency balances',
            'P3', v_p3_start + 25, NULL,
            'ECB', v_ou_id, v_currency,
            22000.0000, 19500.0000, 2500.0000, 34, 'CALCULATED',
            NULL, NULL);

        v_ignore := pg_temp.upsert_fxr(v_tenant, v_entity, 'FXR-2026-P3-002',
            'Period 3 FX revaluation — Preliminary run',
            'P3', v_p3_start + 15, NULL,
            'MANUAL', v_ou_id, v_currency,
            0.0000, 0.0000, 0.0000, 0, 'DRAFT',
            NULL, NULL);


        -- ================================================================
        -- C. CONSOLIDATION ELIMINATIONS (8 per tenant: across 2 periods)
        -- ================================================================

        -- Period 1 — all POSTED (closed period)
        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 1::smallint,
            'IC_REVENUE_EXPENSE', v_le_parent, v_le_sub1,
            125000.0000, v_currency, 'POSTED');

        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 1::smallint,
            'IC_RECEIVABLE_PAYABLE', v_le_parent, v_le_sub1,
            340000.0000, v_currency, 'POSTED');

        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 1::smallint,
            'IC_PROFIT', v_le_sub1, v_le_sub2,
            45000.0000, v_currency, 'POSTED');

        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 1::smallint,
            'MINORITY_INTEREST', v_le_parent, v_le_sub2,
            28000.0000, v_currency, 'REVIEWED');

        -- Period 2 — mixed statuses
        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 2::smallint,
            'IC_REVENUE_EXPENSE', v_le_parent, v_le_sub1,
            138000.0000, v_currency, 'POSTED');

        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 2::smallint,
            'IC_RECEIVABLE_PAYABLE', v_le_parent, v_le_sub1,
            290000.0000, v_currency, 'CALCULATED');

        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 2::smallint,
            'INVESTMENT', v_le_parent, v_le_sub2,
            1200000.0000, v_currency, 'CALCULATED');

        v_ignore := pg_temp.upsert_consol_elim(v_tenant, 2026::smallint, 2::smallint,
            'IC_PROFIT', v_le_sub1, v_le_sub2,
            52000.0000, v_currency, 'CALCULATED');

    END LOOP;

    RAISE NOTICE 'Demo data seeded: Asset (12/tenant), FxRevaluation (6/tenant), ConsolidationElimination (8/tenant)';
END $$;
