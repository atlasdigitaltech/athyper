-- ============================================================================
-- TECHNOSTAT GROUP — BUDGET PROFILES, ALLOCATIONS & PLANNING MODELS
-- ============================================================================
-- File:     020_technostat/200_finance/510_budget_planning.sql
-- Tenant:   technostat
-- Coverage: TKSA (SAR · Jan-Dec) · SSK (SAR · Jan-Dec)
--           TEGY (EGP · Jul-Jun) · SDTX (EGP · Jan-Dec)
--
-- Scenarios:
--   TKSA — Group HQ (Riyadh, ICT/holding)
--     Planning Models:  FY2025 HYBRID (locked) · FY2026 DRIVER_BASED (active)
--     Budget Profiles:  FY2025 Op (closed) · FY2026 Op (active) ·
--                       Capital FY2025-2026 ERP+SOC (active) ·
--                       FY2026 Contingency (active)
--
--   SSK — Construction Subsidiary (Riyadh, SAR)
--     Planning Models:  FY2025 BOTTOM_UP (locked) · FY2026 DRIVER_BASED (active)
--     Budget Profiles:  FY2025 Op (closed) · FY2026 Op (active) ·
--                       FY2025 Project Budget — Metro Segment (active) ·
--                       FY2026 Contingency (active)
--
--   TEGY — Egypt Ops (Cairo, EGP · Jul-Jun)
--     Planning Models:  FY2025 BOTTOM_UP (locked) · FY2026 DRIVER_BASED (active)
--     Budget Profiles:  FY2025 Op (closed) · FY2026 Op (active) ·
--                       FY2026 Contingency (active)
--     Note: FY2025 = Jul-2025 → Jun-2026 (fiscal_year_start_month = 7)
--
--   SDTX — Satellites for Digital Transformation (Cairo, EGP · Jan-Dec)
--     Planning Models:  FY2025 DRIVER_BASED (locked) · FY2026 ROLLING (in_review)
--     Budget Profiles:  FY2025 Op (closed) · FY2026 Op (active) ·
--                       IT Capital FY2025-2026 (active) ·
--                       FY2026 R&D Reserve (PROJECT / active)
--
-- Idempotent: Skips if metadata._seed_pack = '510_technostat_budget' exists
-- Depends:   003_technostat_production_seed.sql, 016_technostat_people.sql,
--            020_universal/060_org_structure/301_cost_centers.sql,
--            020_technostat/projects_demo/001-002_technostat_projects.sql
-- ============================================================================

DO $tksa_budget$
DECLARE
    v_tid        uuid;
    v_su         uuid  := '00000000-0000-0000-0000-000000000000';
    v_pack       text  := '510_technostat_budget';
    v_meta       jsonb;
    -- company code IDs
    v_cc_tksa    uuid;
    v_cc_ssk     uuid;
    v_cc_tegy    uuid;
    v_cc_sdtx    uuid;
    -- budget profile IDs
    v_bp_id      uuid;
    -- cost centre IDs
    v_ctr_id     uuid;
    -- project IDs
    v_proj_id    uuid;
    -- planning model IDs
    v_pm_id      uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[510_technostat_budget] technostat tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.planning_model
        WHERE  tenant_id = v_tid
          AND  metadata->>'_seed_pack' = v_pack
    ) THEN
        RAISE NOTICE '[510_technostat_budget] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed_pack', v_pack, '_seeded_at', now()::text);

    -- Resolve company code IDs
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    IF v_cc_tksa IS NULL THEN RAISE EXCEPTION '[510_technostat_budget] TKSA company code not found'; END IF;
    IF v_cc_ssk  IS NULL THEN RAISE EXCEPTION '[510_technostat_budget] SSK company code not found';  END IF;
    IF v_cc_tegy IS NULL THEN RAISE EXCEPTION '[510_technostat_budget] TEGY company code not found'; END IF;
    IF v_cc_sdtx IS NULL THEN RAISE EXCEPTION '[510_technostat_budget] SDTX company code not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- TKSA — TECHNOSTAT GROUP HQ  (SAR · Jan-Dec · ICT/holding)
    --   Operating budget: SAR 15M (FY25) · SAR 17M (FY26)
    --   Capital budget:   SAR 5M (ERP + SOC — FY2025-2026)
    --   Contingency:      SAR 750K
    -- ══════════════════════════════════════════════════════════════════════════

    -- Planning Model: FY2025 Hybrid (locked)
    INSERT INTO master.planning_model (
        tenant_id, code, name, company_code_id,
        description, model_type, planning_horizon, granularity,
        base_currency_code, fiscal_year_from, fiscal_year_to,
        version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
        approved_at, approved_by,
        status, status_changed_at, status_changed_by,
        sort_order, tags, metadata, created_by
    ) VALUES (
        v_tid, 'TKSA-PLN-FY25-OP', 'TKSA FY2025 Annual Operating Plan', v_cc_tksa,
        'Hybrid operating plan for FY2025. Top-down envelope set by Group CFO; bottom-up submissions '
            'from each business unit reconciled at consolidated level. Approved at January 2025 board.',
        'HYBRID', 'ANNUAL', 'MONTHLY',
        'SAR', 2025, 2025,
        1, false, false, true, false,
        '2025-01-18 09:00:00+00', v_su,
        'locked', '2025-01-18 09:30:00+00', v_su,
        10, jsonb_build_array('fy2025', 'hybrid', 'locked'), v_meta, v_su
    )
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        status = EXCLUDED.status, approved_at = EXCLUDED.approved_at,
        metadata = master.planning_model.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Planning Model: FY2026 Driver-Based (active)
    INSERT INTO master.planning_model (
        tenant_id, code, name, company_code_id,
        description, model_type, planning_horizon, granularity,
        base_currency_code, fiscal_year_from, fiscal_year_to,
        version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
        status, status_changed_at, status_changed_by,
        sort_order, tags, metadata, created_by
    ) VALUES (
        v_tid, 'TKSA-PLN-FY26-OP', 'TKSA FY2026 Annual Operating Plan', v_cc_tksa,
        'Driver-based operating plan for FY2026. Headcount plan and technology investment drivers '
            'cascade to cost lines via pre-built allocation rules. Monthly board pack with '
            'actuals vs plan variance and rolling full-year estimate.',
        'DRIVER_BASED', 'ANNUAL', 'MONTHLY',
        'SAR', 2026, 2026,
        1, true, false, true, true,
        'active', '2026-01-12 09:00:00+00', v_su,
        20, jsonb_build_array('fy2026', 'driver_based', 'active'), v_meta, v_su
    )
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        status = EXCLUDED.status, metadata = master.planning_model.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Planning Model: FY2025-2026 Capital Plan (approved)
    INSERT INTO master.planning_model (
        tenant_id, code, name, company_code_id,
        description, model_type, planning_horizon, granularity,
        base_currency_code, fiscal_year_from, fiscal_year_to,
        version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
        approved_at, approved_by,
        status, status_changed_at, status_changed_by,
        sort_order, tags, metadata, created_by
    ) VALUES (
        v_tid, 'TKSA-PLN-CAP-FY25', 'TKSA FY2025–2026 Capital Expenditure Plan', v_cc_tksa,
        'Board-approved capital expenditure plan covering Group ERP Platform Consolidation '
            '(TKSA-P001, SAR 3.2M) and Cybersecurity Operations Centre Build-out (TKSA-P002, SAR 1.5M). '
            'Quarterly milestone-gated disbursement reviewed by the Investment Committee.',
        'TOP_DOWN', 'MULTI_YEAR', 'QUARTERLY',
        'SAR', 2025, 2026,
        1, true, false, true, false,
        '2025-02-05 10:00:00+00', v_su,
        'approved', '2025-02-05 10:30:00+00', v_su,
        30, jsonb_build_array('capital', 'fy2025_2026', 'approved'), v_meta, v_su
    )
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        status = EXCLUDED.status, approved_at = EXCLUDED.approved_at,
        metadata = master.planning_model.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Budget Profile: FY2025 Operating (closed)
    INSERT INTO master.budget_profile (
        tenant_id, code, name, company_code_id,
        description, fund_type, fund_source, currency_code,
        total_amount, reserved_amount, consumed_amount,
        fiscal_year, is_multi_year, valid_from, valid_to,
        multi_year_strategy, is_replenishable,
        overspend_policy, tolerance_pct, requires_approval, approval_threshold,
        sort_order, tags, metadata,
        status, status_changed_at, status_changed_by, created_by
    ) VALUES (
        v_tid, 'TKSA-BUDG-FY25-OP', 'TKSA FY2025 Operating Budget', v_cc_tksa,
        'Annual operating budget for Technostat Group HQ FY2025. Covers all admin, '
            'commercial and shared-services cost centres at Riyadh headquarters. Closed.',
        'OPERATING', 'INTERNAL', 'SAR',
        15000000.00, 300000.00, 13950000.00,   -- 93 % consumed, 2 % residual reserve
        2025, false, '2025-01-01', '2025-12-31',
        'CURRENT_YEAR_ONLY', false,
        'BLOCK', 2.00, true, 750000.00,
        10, jsonb_build_array('fy2025', 'operating', 'closed'), v_meta,
        'closed', '2026-01-31 18:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount = EXCLUDED.total_amount, consumed_amount = EXCLUDED.consumed_amount,
        reserved_amount = EXCLUDED.reserved_amount, status = EXCLUDED.status,
        status_changed_at = EXCLUDED.status_changed_at,
        metadata = master.budget_profile.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- Budget Profile: FY2026 Operating (active)
    INSERT INTO master.budget_profile (
        tenant_id, code, name, company_code_id,
        description, fund_type, fund_source, currency_code,
        total_amount, reserved_amount, consumed_amount,
        fiscal_year, is_multi_year, valid_from, valid_to,
        multi_year_strategy, is_replenishable,
        overspend_policy, tolerance_pct, requires_approval, approval_threshold,
        sort_order, tags, metadata,
        status, status_changed_at, status_changed_by, created_by
    ) VALUES (
        v_tid, 'TKSA-BUDG-FY26-OP', 'TKSA FY2026 Operating Budget', v_cc_tksa,
        'Board-approved annual operating budget for Technostat Group HQ FY2026. '
            'Includes planned headcount expansion of 4 FTEs in IT and Finance. Active.',
        'OPERATING', 'INTERNAL', 'SAR',
        17000000.00, 1700000.00, 6460000.00,   -- 10 % reserved, 38 % consumed (mid-year)
        2026, false, '2026-01-01', '2026-12-31',
        'CURRENT_YEAR_ONLY', false,
        'BLOCK', 3.00, true, 850000.00,
        20, jsonb_build_array('fy2026', 'operating', 'active'), v_meta,
        'active', '2026-01-12 10:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount = EXCLUDED.total_amount, consumed_amount = EXCLUDED.consumed_amount,
        reserved_amount = EXCLUDED.reserved_amount, status = EXCLUDED.status,
        status_changed_at = EXCLUDED.status_changed_at,
        metadata = master.budget_profile.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- Budget Profile: Capital FY2025-2026 (active)
    INSERT INTO master.budget_profile (
        tenant_id, code, name, company_code_id,
        description, fund_type, fund_source, currency_code,
        total_amount, reserved_amount, consumed_amount,
        fiscal_year, is_multi_year, valid_from, valid_to,
        multi_year_strategy, is_replenishable,
        overspend_policy, tolerance_pct, requires_approval, approval_threshold,
        sort_order, tags, metadata,
        status, status_changed_at, status_changed_by, created_by
    ) VALUES (
        v_tid, 'TKSA-BUDG-CAP-FY25', 'TKSA Capital Expenditure Budget FY2025–2026', v_cc_tksa,
        'Board-approved capital budget for Group ERP Platform Consolidation (TKSA-P001) and '
            'Cybersecurity Operations Centre Build-out (TKSA-P002). Horizon-spread across two '
            'fiscal years. Milestone gate required before each tranche release.',
        'CAPITAL', 'INTERNAL', 'SAR',
        4700000.00, 1175000.00, 2115000.00,   -- 25 % reserved, 45 % consumed
        2025, true, '2025-01-01', '2026-12-31',
        'HORIZON_SPREAD', false,
        'ESCALATE', 5.00, true, 94000.00,
        30, jsonb_build_array('capital', 'fy2025_2026', 'erp', 'soc'), v_meta,
        'active', '2025-02-05 10:30:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount = EXCLUDED.total_amount, consumed_amount = EXCLUDED.consumed_amount,
        reserved_amount = EXCLUDED.reserved_amount, status = EXCLUDED.status,
        metadata = master.budget_profile.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- Budget Profile: FY2026 Contingency (active)
    INSERT INTO master.budget_profile (
        tenant_id, code, name, company_code_id,
        description, fund_type, fund_source, currency_code,
        total_amount, reserved_amount, consumed_amount,
        fiscal_year, is_multi_year, valid_from, valid_to,
        multi_year_strategy, is_replenishable,
        overspend_policy, tolerance_pct, requires_approval, approval_threshold,
        sort_order, tags, metadata,
        status, status_changed_at, status_changed_by, created_by
    ) VALUES (
        v_tid, 'TKSA-BUDG-FY26-CONT', 'TKSA FY2026 Contingency Reserve', v_cc_tksa,
        'Board-approved contingency reserve for FY2026. Covers unplanned costs arising from '
            'regulatory changes, emergency IT incidents, or unforeseen group-wide requirements. '
            'CFO + CEO dual authorisation required for each drawdown.',
        'CONTINGENCY', 'INTERNAL', 'SAR',
        750000.00, 0, 112500.00,     -- 15 % drawn (one approved emergency IT incident)
        2026, false, '2026-01-01', '2026-12-31',
        'CURRENT_YEAR_ONLY', false,
        'WARN', 0.00, true, 0,
        40, jsonb_build_array('fy2026', 'contingency', 'reserve'), v_meta,
        'active', '2026-01-12 11:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount = EXCLUDED.total_amount, consumed_amount = EXCLUDED.consumed_amount,
        reserved_amount = EXCLUDED.reserved_amount, status = EXCLUDED.status,
        metadata = master.budget_profile.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- Allocations: TKSA FY2025 Operating (9 posting cost centres)
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'TKSA-BUDG-FY25-OP';
    IF v_bp_id IS NOT NULL THEN
        -- Finance & Accounting (18 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-FIN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,2700000.00,54000.00,2511000.00,54000.00,'BLOCK',2.00,true,false,10,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Human Resources (22 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-HR';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','Human Resources',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,3300000.00,66000.00,3069000.00,66000.00,'BLOCK',2.00,true,false,20,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Information Technology (15 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-IT';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Information Technology',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,2250000.00,45000.00,2092500.00,45000.00,'BLOCK',2.00,true,false,30,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Legal & Compliance (8 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-LEGAL';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Compliance',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,1200000.00,24000.00,1116000.00,24000.00,'BLOCK',2.00,true,false,40,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Sales & Business Development (10 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-COMM-SALES';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Business Development',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,1500000.00,30000.00,1395000.00,30000.00,'BLOCK',2.00,true,false,50,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Marketing & Brand (7 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-COMM-MKTG';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Brand',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,1050000.00,21000.00,976500.00,21000.00,'BLOCK',2.00,true,false,60,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Procurement (4 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-SUPPORT-PROC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,600000.00,12000.00,558000.00,12000.00,'BLOCK',2.00,true,false,70,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Shared Services (6 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-SUPPORT-SVC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Shared Services',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,900000.00,18000.00,837000.00,18000.00,'BLOCK',2.00,true,false,80,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- General Operations (10 %)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-OPS-GEN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','General Operations',v_bp_id,v_cc_tksa,2025,'SAR',v_ctr_id,1500000.00,30000.00,1395000.00,30000.00,'BLOCK',2.00,true,false,90,jsonb_build_array('fy2025','admin'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- Allocations: TKSA FY2026 Operating (9 posting cost centres)
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'TKSA-BUDG-FY26-OP';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-FIN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,3060000.00,306000.00,1162800.00,0,'BLOCK',3.00,true,false,10,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-HR';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','Human Resources',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,3740000.00,374000.00,1421200.00,0,'BLOCK',3.00,true,false,20,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-IT';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Information Technology',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,2550000.00,255000.00,969000.00,0,'BLOCK',3.00,true,false,30,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-LEGAL';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Compliance',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,1360000.00,136000.00,516800.00,0,'BLOCK',3.00,true,false,40,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-COMM-SALES';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Business Development',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,1700000.00,170000.00,646000.00,0,'BLOCK',3.00,true,false,50,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-COMM-MKTG';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Brand',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,1190000.00,119000.00,452200.00,0,'BLOCK',3.00,true,false,60,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-SUPPORT-PROC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,680000.00,68000.00,258400.00,0,'BLOCK',3.00,true,false,70,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-SUPPORT-SVC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Shared Services',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,1020000.00,102000.00,387600.00,0,'BLOCK',3.00,true,false,80,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-OPS-GEN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','General Operations',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,1700000.00,170000.00,646000.00,0,'BLOCK',3.00,true,false,90,jsonb_build_array('fy2026','admin'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- Allocations: TKSA Capital (ERP project + IT + Ops)
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'TKSA-BUDG-CAP-FY25';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_proj_id FROM master.project WHERE tenant_id = v_tid AND code = 'TKSA-P001';
        IF v_proj_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,project_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-PROJ-ERP','Group ERP Platform Consolidation — Main Allocation',v_bp_id,v_cc_tksa,2025,'SAR',v_proj_id,3200000.00,704000.00,1536000.00,0,'ESCALATE',5.00,true,32000.00,false,10,jsonb_build_array('capital','erp','project'),v_meta,'active','2025-02-05 10:30:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
        END IF;
        SELECT id INTO v_proj_id FROM master.project WHERE tenant_id = v_tid AND code = 'TKSA-P002';
        IF v_proj_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,project_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-PROJ-SOC','Cybersecurity Operations Centre Build-out',v_bp_id,v_cc_tksa,2025,'SAR',v_proj_id,1500000.00,471000.00,579000.00,0,'ESCALATE',5.00,true,15000.00,false,20,jsonb_build_array('capital','soc','cybersecurity'),v_meta,'active','2025-02-05 10:30:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
        END IF;
    END IF;

    -- Allocation: TKSA Contingency
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'TKSA-BUDG-FY26-CONT';
    SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-OPS-GEN';
    IF v_bp_id IS NOT NULL AND v_ctr_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-CONT-RESERVE','Contingency Reserve — Unallocated Pool',v_bp_id,v_cc_tksa,2026,'SAR',v_ctr_id,750000.00,0,112500.00,0,'WARN',0.00,true,false,10,jsonb_build_array('fy2026','contingency'),v_meta,'active','2026-01-12 11:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
    END IF;

    RAISE NOTICE '[510] TKSA planning_model + budget_profile + budget_allocation seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- SSK — SAUDI CONSTRUCTION SUBSIDIARY  (SAR · Jan-Dec)
    --   Operating budget: SAR 48M (FY25) · SAR 52M (FY26)
    --   Project budget:   SAR 18M (Metro Segment construction, FY25)
    --   Contingency:      SAR 2.5M
    -- ══════════════════════════════════════════════════════════════════════════

    -- Planning Model: FY2025 Bottom-Up (locked)
    INSERT INTO master.planning_model (tenant_id,code,name,company_code_id,description,model_type,planning_horizon,granularity,base_currency_code,fiscal_year_from,fiscal_year_to,version,is_current,auto_recalculate,lock_on_approval,allows_overrides,approved_at,approved_by,status,status_changed_at,status_changed_by,sort_order,tags,metadata,created_by)
    VALUES (v_tid,'SSK-PLN-FY25-OP','SSK FY2025 Annual Operating Plan',v_cc_ssk,
        'Bottom-up operating plan for SSK Saudi FY2025. Site managers and department heads '
            'submitted activity-based estimates consolidated into the company budget. '
            'Approved and locked at the January 2025 TKSA board meeting.',
        'BOTTOM_UP','ANNUAL','MONTHLY','SAR',2025,2025,1,false,false,true,false,
        '2025-01-18 09:00:00+00',v_su,'locked','2025-01-18 10:00:00+00',v_su,
        10,jsonb_build_array('fy2025','bottom_up','locked'),v_meta,v_su)
    ON CONFLICT (tenant_id,code,version) DO UPDATE SET status=EXCLUDED.status,approved_at=EXCLUDED.approved_at,metadata=master.planning_model.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Planning Model: FY2026 Driver-Based (active)
    INSERT INTO master.planning_model (tenant_id,code,name,company_code_id,description,model_type,planning_horizon,granularity,base_currency_code,fiscal_year_from,fiscal_year_to,version,is_current,auto_recalculate,lock_on_approval,allows_overrides,status,status_changed_at,status_changed_by,sort_order,tags,metadata,created_by)
    VALUES (v_tid,'SSK-PLN-FY26-OP','SSK FY2026 Annual Operating Plan',v_cc_ssk,
        'Driver-based operating plan for SSK Saudi FY2026. Revenue driven by contract backlog '
            'and bid pipeline; cost lines modelled on headcount and direct-cost-per-SAR-revenue ratios.',
        'DRIVER_BASED','ANNUAL','MONTHLY','SAR',2026,2026,1,true,false,true,true,
        'active','2026-01-12 09:00:00+00',v_su,
        20,jsonb_build_array('fy2026','driver_based','active'),v_meta,v_su)
    ON CONFLICT (tenant_id,code,version) DO UPDATE SET status=EXCLUDED.status,metadata=master.planning_model.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Budget Profile: FY2025 Operating (closed)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SSK-BUDG-FY25-OP','SSK FY2025 Operating Budget',v_cc_ssk,
        'Annual operating budget for SSK Saudi FY2025. Covers workforce, materials handling, '
            'plant maintenance, administration and QHSE across all Riyadh construction operations.',
        'OPERATING','INTERNAL','SAR',48000000.00,960000.00,44640000.00,2025,false,'2025-01-01','2025-12-31',
        'CURRENT_YEAR_ONLY',false,'BLOCK',2.00,true,2400000.00,10,jsonb_build_array('fy2025','operating','closed'),v_meta,
        'closed','2026-01-31 18:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,status_changed_at=EXCLUDED.status_changed_at,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2026 Operating (active)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SSK-BUDG-FY26-OP','SSK FY2026 Operating Budget',v_cc_ssk,
        'Board-approved operating budget for SSK Saudi FY2026. Includes provision for ramp-up '
            'of two new site contracts won in Q4 FY2025. Active — monthly variance monitoring.',
        'OPERATING','INTERNAL','SAR',52000000.00,5200000.00,19760000.00,2026,false,'2026-01-01','2026-12-31',
        'CURRENT_YEAR_ONLY',false,'BLOCK',3.00,true,2600000.00,20,jsonb_build_array('fy2026','operating','active'),v_meta,
        'active','2026-01-12 10:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,status_changed_at=EXCLUDED.status_changed_at,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2025 Project Budget — Metro Segment (PROJECT type)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,fund_category,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SSK-BUDG-FY25-PROJ','SSK FY2025 Metro Segment Project Budget',v_cc_ssk,
        'Project-ring-fenced budget for the Riyadh Metro Segment civil works contract (ASAC-P001 upstream). '
            'Covers direct labour, sub-contractors, materials and equipment on-site. '
            'Strictly BLOCK policy — any variation requires formal contract variation order.',
        'PROJECT','INTERNAL','CONSTRUCTION','SAR',18000000.00,3600000.00,10800000.00,2025,false,'2025-03-01','2026-02-28',
        'CURRENT_YEAR_ONLY',false,'BLOCK',0.00,true,0,30,jsonb_build_array('fy2025','project','construction','metro'),v_meta,
        'active','2025-03-01 08:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2026 Contingency (active)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SSK-BUDG-FY26-CONT','SSK FY2026 Contingency Reserve',v_cc_ssk,
        'Contingency reserve for SSK Saudi FY2026. Covers unforeseen site conditions, weather delays, '
            'and non-recoverable variation orders. Board-authorised with TKSA CFO co-sign.',
        'CONTINGENCY','INTERNAL','SAR',2500000.00,0,375000.00,2026,false,'2026-01-01','2026-12-31',
        'CURRENT_YEAR_ONLY',false,'WARN',0.00,true,0,40,jsonb_build_array('fy2026','contingency','construction'),v_meta,
        'active','2026-01-12 11:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- SSK FY2025 Operating Allocations (construction splits: Finance 10%, HR 12%, IT 6%, Legal 8%, Sales 8%, Mktg 3%, Proc 8%, QHSE 5%, Ops 40%)
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SSK-BUDG-FY25-OP';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-FIN';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,4800000.00,96000.00,4464000.00,96000.00,'BLOCK',2.00,true,false,10,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-HR';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','Workforce Management',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,5760000.00,115200.00,5356800.00,115200.00,'BLOCK',2.00,true,false,20,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-IT';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','IT & Project Systems',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,2880000.00,57600.00,2678400.00,57600.00,'BLOCK',2.00,true,false,30,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-LEGAL'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Contract Management',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,3840000.00,76800.00,3571200.00,76800.00,'BLOCK',2.00,true,false,40,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-COMM-SALES';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Tendering & Business Development',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,3840000.00,76800.00,3571200.00,76800.00,'BLOCK',2.00,true,false,50,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-COMM-MKTG';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Pre-Qualification',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,1440000.00,28800.00,1339200.00,28800.00,'BLOCK',2.00,true,false,60,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-SUPPORT-PROC'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement & Materials',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,3840000.00,76800.00,3571200.00,76800.00,'BLOCK',2.00,true,false,70,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-SUPPORT-SVC';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','QHSE & Shared Services',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,2400000.00,48000.00,2232000.00,48000.00,'BLOCK',2.00,true,false,80,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-OPS-GEN';      IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','Site & Construction Operations',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,19200000.00,384000.00,17856000.00,384000.00,'BLOCK',2.00,true,false,90,jsonb_build_array('fy2025','construction'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- SSK FY2026 Operating Allocations
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SSK-BUDG-FY26-OP';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-FIN';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,5200000.00,520000.00,1976000.00,0,'BLOCK',3.00,true,false,10,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-HR';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','Workforce Management',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,6240000.00,624000.00,2371200.00,0,'BLOCK',3.00,true,false,20,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-IT';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','IT & Project Systems',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,3120000.00,312000.00,1185600.00,0,'BLOCK',3.00,true,false,30,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-ADMIN-LEGAL'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Contract Management',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,4160000.00,416000.00,1580800.00,0,'BLOCK',3.00,true,false,40,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-COMM-SALES';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Tendering & Business Development',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,4160000.00,416000.00,1580800.00,0,'BLOCK',3.00,true,false,50,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-COMM-MKTG';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Pre-Qualification',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,1560000.00,156000.00,592800.00,0,'BLOCK',3.00,true,false,60,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-SUPPORT-PROC'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement & Materials',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,4160000.00,416000.00,1580800.00,0,'BLOCK',3.00,true,false,70,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-SUPPORT-SVC';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','QHSE & Shared Services',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,2600000.00,260000.00,988000.00,0,'BLOCK',3.00,true,false,80,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-OPS-GEN';      IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','Site & Construction Operations',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,20800000.00,2080000.00,7904000.00,0,'BLOCK',3.00,true,false,90,jsonb_build_array('fy2026','construction'),v_meta,'active','2026-01-12 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- SSK Project Budget Allocation (Metro Segment — Ops CC + Procurement CC)
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SSK-BUDG-FY25-PROJ';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-OPS-GEN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-SITE','Direct Site Works — Labour, Plant & Sub-contractors',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,13500000.00,2700000.00,8100000.00,0,'BLOCK',0.00,true,0,false,10,jsonb_build_array('project','construction','direct_cost'),v_meta,'active','2025-03-01 08:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-SUPPORT-PROC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-PROC-MATL','Materials & Equipment Procurement',v_bp_id,v_cc_ssk,2025,'SAR',v_ctr_id,4500000.00,900000.00,2700000.00,0,'BLOCK',0.00,true,0,false,20,jsonb_build_array('project','construction','materials'),v_meta,'active','2025-03-01 08:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- SSK Contingency Allocation
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SSK-BUDG-FY26-CONT';
    SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-OPS-GEN';
    IF v_bp_id IS NOT NULL AND v_ctr_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-CONT-RESERVE','Contingency Reserve — Unallocated Pool',v_bp_id,v_cc_ssk,2026,'SAR',v_ctr_id,2500000.00,0,375000.00,0,'WARN',0.00,true,false,10,jsonb_build_array('fy2026','contingency','construction'),v_meta,'active','2026-01-12 11:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
    END IF;

    RAISE NOTICE '[510] SSK planning_model + budget_profile + budget_allocation seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- TEGY — TECHNOSTAT EGYPT OPS  (EGP · Jul-Jun)
    --   Note: FY2025 = July 2025 → June 2026 (fiscal_year_start_month = 7)
    --   Operating budget: EGP 85M (FY2025) · EGP 95M (FY2026)
    --   Contingency:      EGP 4M
    -- ══════════════════════════════════════════════════════════════════════════

    -- Planning Model: FY2025 Bottom-Up (locked) — Jul-Jun year
    INSERT INTO master.planning_model (tenant_id,code,name,company_code_id,description,model_type,planning_horizon,granularity,base_currency_code,fiscal_year_from,fiscal_year_to,version,is_current,auto_recalculate,lock_on_approval,allows_overrides,approved_at,approved_by,status,status_changed_at,status_changed_by,sort_order,tags,metadata,created_by)
    VALUES (v_tid,'TEGY-PLN-FY25-OP','TEGY FY2025 Annual Operating Plan',v_cc_tegy,
        'Bottom-up annual operating plan for Technostat Egypt FY2025 (July 2025 – June 2026). '
            'Submitted by New Cairo office department heads; consolidated by TEGY Finance team. '
            'Approved by TKSA Board in July 2025 with locked budget lines.',
        'BOTTOM_UP','ANNUAL','MONTHLY','EGP',2025,2025,1,false,false,true,false,
        '2025-07-10 09:00:00+00',v_su,'locked','2025-07-10 09:30:00+00',v_su,
        10,jsonb_build_array('fy2025','jul_jun','bottom_up','locked'),v_meta,v_su)
    ON CONFLICT (tenant_id,code,version) DO UPDATE SET status=EXCLUDED.status,approved_at=EXCLUDED.approved_at,metadata=master.planning_model.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Planning Model: FY2026 Driver-Based (active) — next Jul-Jun year
    INSERT INTO master.planning_model (tenant_id,code,name,company_code_id,description,model_type,planning_horizon,granularity,base_currency_code,fiscal_year_from,fiscal_year_to,version,is_current,auto_recalculate,lock_on_approval,allows_overrides,status,status_changed_at,status_changed_by,sort_order,tags,metadata,created_by)
    VALUES (v_tid,'TEGY-PLN-FY26-OP','TEGY FY2026 Annual Operating Plan',v_cc_tegy,
        'Driver-based operating plan for Technostat Egypt FY2026 (July 2026 – June 2027). '
            'Revenue driven by ICT project pipeline and service contract renewals. '
            'Cost modelled on headcount and project delivery capacity ratios.',
        'DRIVER_BASED','ANNUAL','MONTHLY','EGP',2026,2026,1,true,false,true,true,
        'draft',now(),v_su,
        20,jsonb_build_array('fy2026','jul_jun','driver_based','draft'),v_meta,v_su)
    ON CONFLICT (tenant_id,code,version) DO UPDATE SET status=EXCLUDED.status,metadata=master.planning_model.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Budget Profile: FY2025 Operating — Jul 2025 – Jun 2026 (partially consumed)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'TEGY-BUDG-FY25-OP','TEGY FY2025 Operating Budget (Jul 2025–Jun 2026)',v_cc_tegy,
        'Annual operating budget for Technostat Egypt FY2025 (July–June fiscal year). '
            'Covers ICT delivery teams, New Cairo office operations, HR and client services. '
            'Currently ~38 % consumed through mid-year (active).',
        'OPERATING','INTERNAL','EGP',85000000.00,8500000.00,32300000.00,2025,false,'2025-07-01','2026-06-30',
        'CURRENT_YEAR_ONLY',false,'BLOCK',3.00,true,4250000.00,10,jsonb_build_array('fy2025','jul_jun','operating','active'),v_meta,
        'active','2025-07-10 10:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,status_changed_at=EXCLUDED.status_changed_at,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2026 Operating — Jul 2026 – Jun 2027 (draft / future)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'TEGY-BUDG-FY26-OP','TEGY FY2026 Operating Budget (Jul 2026–Jun 2027)',v_cc_tegy,
        'Draft annual operating budget for Technostat Egypt FY2026 (July–June). '
            'Includes planned expansion of delivery headcount by 12 FTEs and new Cairo West office.',
        'OPERATING','INTERNAL','EGP',95000000.00,0,0,2026,false,'2026-07-01','2027-06-30',
        'CURRENT_YEAR_ONLY',false,'BLOCK',3.00,true,4750000.00,20,jsonb_build_array('fy2026','jul_jun','operating','draft'),v_meta,
        'draft',now(),v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2025 Contingency (active)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'TEGY-BUDG-FY25-CONT','TEGY FY2025 Contingency Reserve',v_cc_tegy,
        'Contingency reserve for Technostat Egypt FY2025. Covers unforeseen project cost overruns, '
            'FX volatility impacts on imported equipment, and emergency staffing requirements.',
        'CONTINGENCY','INTERNAL','EGP',4000000.00,0,600000.00,2025,false,'2025-07-01','2026-06-30',
        'CURRENT_YEAR_ONLY',false,'WARN',0.00,true,0,30,jsonb_build_array('fy2025','contingency','egypt'),v_meta,
        'active','2025-07-10 11:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- TEGY FY2025 Operating Allocations (ICT / infocomm splits in EGP)
    -- Finance 12%, HR 18%, IT 20%, Legal 7%, Sales 15%, Mktg 10%, Proc 4%, Svc 6%, Ops 8%
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'TEGY-BUDG-FY25-OP';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-ADMIN-FIN';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,10200000.00,1020000.00,3876000.00,0,'BLOCK',3.00,true,false,10,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-ADMIN-HR';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','HR & Talent Acquisition',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,15300000.00,1530000.00,5814000.00,0,'BLOCK',3.00,true,false,20,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-ADMIN-IT';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Internal IT & Cybersecurity',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,17000000.00,1700000.00,6460000.00,0,'BLOCK',3.00,true,false,30,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-ADMIN-LEGAL'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Regulatory',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,5950000.00,595000.00,2261000.00,0,'BLOCK',3.00,true,false,40,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-COMM-SALES';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Client Management',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,12750000.00,1275000.00,4845000.00,0,'BLOCK',3.00,true,false,50,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-COMM-MKTG';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Events',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,8500000.00,850000.00,3230000.00,0,'BLOCK',3.00,true,false,60,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-SUPPORT-PROC'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,3400000.00,340000.00,1292000.00,0,'BLOCK',3.00,true,false,70,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-SUPPORT-SVC';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Client Support & Shared Services',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,5100000.00,510000.00,1938000.00,0,'BLOCK',3.00,true,false,80,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-OPS-GEN';      IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','R&D & Delivery Operations',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,6800000.00,680000.00,2584000.00,0,'BLOCK',3.00,true,false,90,jsonb_build_array('fy2025','infocomm','egypt'),v_meta,'active','2025-07-10 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- TEGY Contingency Allocation
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'TEGY-BUDG-FY25-CONT';
    SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-OPS-GEN';
    IF v_bp_id IS NOT NULL AND v_ctr_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-CONT-RESERVE','Contingency Reserve — Unallocated Pool',v_bp_id,v_cc_tegy,2025,'EGP',v_ctr_id,4000000.00,0,600000.00,0,'WARN',0.00,true,false,10,jsonb_build_array('fy2025','contingency','egypt'),v_meta,'active','2025-07-10 11:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
    END IF;

    RAISE NOTICE '[510] TEGY planning_model + budget_profile + budget_allocation seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- SDTX — SATELLITES FOR DIGITAL TRANSFORMATION  (EGP · Jan-Dec)
    --   Operating budget: EGP 38M (FY2025) · EGP 44M (FY2026)
    --   IT Capital:       EGP 8M (FY2025-2026 digital infrastructure)
    --   R&D Reserve:      EGP 2M (PROJECT type)
    -- ══════════════════════════════════════════════════════════════════════════

    -- Planning Model: FY2025 Driver-Based (locked)
    INSERT INTO master.planning_model (tenant_id,code,name,company_code_id,description,model_type,planning_horizon,granularity,base_currency_code,fiscal_year_from,fiscal_year_to,version,is_current,auto_recalculate,lock_on_approval,allows_overrides,approved_at,approved_by,status,status_changed_at,status_changed_by,sort_order,tags,metadata,created_by)
    VALUES (v_tid,'SDTX-PLN-FY25-OP','SDTX FY2025 Annual Operating Plan',v_cc_sdtx,
        'Driver-based annual plan for Satellites for Digital Transformation FY2025. '
            'Revenue driven by number of active digital transformation project engagements. '
            'Approved by TEGY Board and locked in January 2025.',
        'DRIVER_BASED','ANNUAL','MONTHLY','EGP',2025,2025,1,false,false,true,false,
        '2025-01-20 09:00:00+00',v_su,'locked','2025-01-20 09:30:00+00',v_su,
        10,jsonb_build_array('fy2025','driver_based','locked'),v_meta,v_su)
    ON CONFLICT (tenant_id,code,version) DO UPDATE SET status=EXCLUDED.status,approved_at=EXCLUDED.approved_at,metadata=master.planning_model.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Planning Model: FY2026 Rolling 12M (in_review)
    INSERT INTO master.planning_model (tenant_id,code,name,company_code_id,description,model_type,planning_horizon,granularity,base_currency_code,fiscal_year_from,fiscal_year_to,version,is_current,auto_recalculate,lock_on_approval,allows_overrides,status,status_changed_at,status_changed_by,sort_order,tags,metadata,created_by)
    VALUES (v_tid,'SDTX-PLN-R12-FY26','SDTX Rolling 12-Month Forecast FY2026',v_cc_sdtx,
        'Rolling 12-month forecast maintained from January 2026. Auto-recalculates monthly — '
            'actuals locked for closed periods, forward months reprojected using latest backlog data. '
            'In review by TEGY CFO. Will supersede a traditional annual plan for SDTX going forward.',
        'ROLLING','ROLLING_12','MONTHLY','EGP',2026,2026,1,true,true,false,true,
        'in_review','2026-04-01 09:00:00+00',v_su,
        20,jsonb_build_array('fy2026','rolling','in_review'),v_meta,v_su)
    ON CONFLICT (tenant_id,code,version) DO UPDATE SET status=EXCLUDED.status,status_changed_at=EXCLUDED.status_changed_at,metadata=master.planning_model.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- Budget Profile: FY2025 Operating (closed)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SDTX-BUDG-FY25-OP','SDTX FY2025 Operating Budget',v_cc_sdtx,
        'Annual operating budget for Satellites for Digital Transformation FY2025. '
            'Covers delivery teams, cloud infrastructure subscriptions, and office operations in Cairo.',
        'OPERATING','INTERNAL','EGP',38000000.00,760000.00,35340000.00,2025,false,'2025-01-01','2025-12-31',
        'CURRENT_YEAR_ONLY',false,'BLOCK',2.00,true,1900000.00,10,jsonb_build_array('fy2025','operating','closed'),v_meta,
        'closed','2026-01-31 18:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,status_changed_at=EXCLUDED.status_changed_at,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2026 Operating (active)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SDTX-BUDG-FY26-OP','SDTX FY2026 Operating Budget',v_cc_sdtx,
        'Operating budget for Satellites for Digital Transformation FY2026. '
            'Growth budget — includes 6 new delivery engineers and expanded cloud platform spend.',
        'OPERATING','INTERNAL','EGP',44000000.00,4400000.00,16720000.00,2026,false,'2026-01-01','2026-12-31',
        'CURRENT_YEAR_ONLY',false,'BLOCK',3.00,true,2200000.00,20,jsonb_build_array('fy2026','operating','active'),v_meta,
        'active','2026-01-15 10:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,status_changed_at=EXCLUDED.status_changed_at,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: IT Capital FY2025-2026 (active, multi-year)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SDTX-BUDG-CAP-IT','SDTX Digital Infrastructure Capital FY2025–2026',v_cc_sdtx,
        'Board-approved capital budget for SDTX digital infrastructure modernisation. '
            'Covers cloud platform build-out, DevSecOps toolchain, and enterprise data platform. '
            'Horizon-spread across FY2025 and FY2026.',
        'CAPITAL','INTERNAL','EGP',8000000.00,2000000.00,3600000.00,2025,true,'2025-01-01','2026-12-31',
        'HORIZON_SPREAD',false,'ESCALATE',5.00,true,160000.00,30,jsonb_build_array('capital','digital','fy2025_2026'),v_meta,
        'active','2025-02-01 10:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- Budget Profile: FY2026 R&D Reserve (PROJECT type)
    INSERT INTO master.budget_profile (tenant_id,code,name,company_code_id,description,fund_type,fund_source,fund_category,currency_code,total_amount,reserved_amount,consumed_amount,fiscal_year,is_multi_year,valid_from,valid_to,multi_year_strategy,is_replenishable,overspend_policy,tolerance_pct,requires_approval,approval_threshold,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
    VALUES (v_tid,'SDTX-BUDG-FY26-RD','SDTX FY2026 R&D Innovation Reserve',v_cc_sdtx,
        'Innovation reserve for Satellites Digital Transformation FY2026. Funds internal R&D '
            'projects including AI-assisted project delivery tooling and edge computing PoC. '
            'Drawdown requires technical board approval with quarterly progress reviews.',
        'PROJECT','INTERNAL','RND','EGP',2000000.00,0,300000.00,2026,false,'2026-01-01','2026-12-31',
        'CURRENT_YEAR_ONLY',false,'WARN',5.00,true,0,40,jsonb_build_array('fy2026','rnd','innovation'),v_meta,
        'active','2026-01-15 11:00:00+00',v_su,v_su)
    ON CONFLICT (tenant_id,code) DO UPDATE SET total_amount=EXCLUDED.total_amount,consumed_amount=EXCLUDED.consumed_amount,reserved_amount=EXCLUDED.reserved_amount,status=EXCLUDED.status,metadata=master.budget_profile.metadata||v_meta,updated_at=now(),updated_by=v_su WHERE (master.budget_profile.total_amount,master.budget_profile.status) IS DISTINCT FROM (EXCLUDED.total_amount,EXCLUDED.status);

    -- SDTX FY2025 Operating Allocations (infocomm: Fin 12%, HR 18%, IT 20%, Legal 7%, Sales 15%, Mktg 10%, Proc 4%, Svc 6%, Ops 8%)
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SDTX-BUDG-FY25-OP';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-FIN';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,4560000.00,91200.00,4240800.00,91200.00,'BLOCK',2.00,true,false,10,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-HR';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','HR & Talent Acquisition',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,6840000.00,136800.00,6361200.00,136800.00,'BLOCK',2.00,true,false,20,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-IT';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Internal IT & DevSecOps',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,7600000.00,152000.00,7068000.00,152000.00,'BLOCK',2.00,true,false,30,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-LEGAL'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & IP',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,2660000.00,53200.00,2473800.00,53200.00,'BLOCK',2.00,true,false,40,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-COMM-SALES';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Account Management',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,5700000.00,114000.00,5301000.00,114000.00,'BLOCK',2.00,true,false,50,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-COMM-MKTG';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Digital Presence',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,3800000.00,76000.00,3534000.00,76000.00,'BLOCK',2.00,true,false,60,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-SUPPORT-PROC'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,1520000.00,30400.00,1413600.00,30400.00,'BLOCK',2.00,true,false,70,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-SUPPORT-SVC';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Customer Success & Support',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,2280000.00,45600.00,2120400.00,45600.00,'BLOCK',2.00,true,false,80,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-OPS-GEN';      IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','Delivery & Engineering Operations',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,3040000.00,60800.00,2827200.00,60800.00,'BLOCK',2.00,true,false,90,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-01-31 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- SDTX FY2026 Operating Allocations
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SDTX-BUDG-FY26-OP';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-FIN';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,5280000.00,528000.00,2006400.00,0,'BLOCK',3.00,true,false,10,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-HR';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','HR & Talent Acquisition',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,7920000.00,792000.00,3009600.00,0,'BLOCK',3.00,true,false,20,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-IT';    IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Internal IT & DevSecOps',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,8800000.00,880000.00,3344000.00,0,'BLOCK',3.00,true,false,30,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-LEGAL'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & IP',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,3080000.00,308000.00,1170400.00,0,'BLOCK',3.00,true,false,40,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-COMM-SALES';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Account Management',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,6600000.00,660000.00,2508000.00,0,'BLOCK',3.00,true,false,50,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-COMM-MKTG';   IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Digital Presence',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,4400000.00,440000.00,440000.00,0,'BLOCK',3.00,true,false,60,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-SUPPORT-PROC'; IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,1760000.00,176000.00,668800.00,0,'BLOCK',3.00,true,false,70,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-SUPPORT-SVC';  IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Customer Success & Support',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,2640000.00,264000.00,1003200.00,0,'BLOCK',3.00,true,false,80,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-OPS-GEN';      IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','Delivery & Engineering Operations',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,3520000.00,352000.00,1337600.00,0,'BLOCK',3.00,true,false,90,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-01-15 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- SDTX Capital IT Allocations
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SDTX-BUDG-CAP-IT';
    IF v_bp_id IS NOT NULL THEN
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-IT';
        IF v_ctr_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-IT-PLATFORM','Cloud Platform & DevSecOps Toolchain',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,5500000.00,1375000.00,2475000.00,0,'ESCALATE',5.00,true,false,10,jsonb_build_array('capital','cloud','devsecops'),v_meta,'active','2025-02-01 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-IT-DATA','Enterprise Data Platform & Analytics',v_bp_id,v_cc_sdtx,2025,'EGP',v_ctr_id,2500000.00,625000.00,1125000.00,0,'ESCALATE',5.00,true,false,20,jsonb_build_array('capital','data','analytics'),v_meta,'active','2025-02-01 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
        END IF;
    END IF;

    -- SDTX R&D Reserve Allocation
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'SDTX-BUDG-FY26-RD';
    SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-OPS-GEN';
    IF v_bp_id IS NOT NULL AND v_ctr_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-RD-POOL','R&D Innovation Pool — AI & Edge Computing',v_bp_id,v_cc_sdtx,2026,'EGP',v_ctr_id,2000000.00,0,300000.00,0,'WARN',5.00,true,false,10,jsonb_build_array('fy2026','rnd','ai','edge'),v_meta,'active','2026-01-15 11:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
    END IF;

    RAISE NOTICE '[510] SDTX planning_model + budget_profile + budget_allocation seeded';
    RAISE NOTICE '[510_technostat_budget] complete — TKSA, SSK, TEGY, SDTX';

END $tksa_budget$;
