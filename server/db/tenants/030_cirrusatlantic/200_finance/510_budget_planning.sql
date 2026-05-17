-- ============================================================================
-- CIRRUSATLANTIC — BUDGET PROFILES, ALLOCATIONS & PLANNING MODELS
-- ============================================================================
-- File:     030_cirrusatlantic/200_finance/510_budget_planning.sql
-- Tenant:   cirrusatlantic
-- Coverage: CATL (GBP · April-March fiscal year · UK IT services)
--
-- Scenarios:
--   CATL — CirrusAtlantic Ltd  (GBP · Apr-Mar · infocomm/IT services)
--     Planning Models:  FY2025 DRIVER_BASED (locked) · FY2026 DRIVER_BASED (active)
--                       Rolling-12 FY2026 (in_review)
--     Budget Profiles:  FY2025 Operating GBP 8M (closed) ·
--                       FY2026 Operating GBP 9M (active) ·
--                       Capital GBP 2.5M cloud infra CATL-P001 (active) ·
--                       FY2026 Contingency GBP 400K (active)
--
--   FY note: fiscal_year=N means April N → March N+1 (e.g. 2025 = Apr-2025–Mar-2026)
--
-- Idempotent: Skips if metadata._seed_pack = '510_catl_budget' exists
-- Depends:   000_tenant.sql, 100_org_structure/200_legal_entities.sql,
--            020_universal/060_org_structure/301_cost_centers.sql,
--            030_cirrusatlantic/projects_demo/001_catl_projects.sql
-- ============================================================================

DO $catl_budget$
DECLARE
    v_tid        uuid;
    v_su         uuid  := '00000000-0000-0000-0000-000000000000';
    v_pack       text  := '510_catl_budget';
    v_meta       jsonb;
    v_cc_catl    uuid;
    v_bp_id      uuid;
    v_ctr_id     uuid;
    v_proj_id    uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[510_catl_budget] cirrusatlantic tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.planning_model
        WHERE  tenant_id = v_tid
          AND  metadata->>'_seed_pack' = v_pack
    ) THEN
        RAISE NOTICE '[510_catl_budget] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed_pack', v_pack, '_seeded_at', now()::text);

    SELECT id INTO v_cc_catl FROM master.company_code WHERE tenant_id = v_tid AND code = 'CATL';
    IF v_cc_catl IS NULL THEN RAISE EXCEPTION '[510_catl_budget] CATL company code not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- CATL — CIRRUSATLANTIC LTD  (GBP · Apr-Mar · IT services/infocomm)
    --   Operating budget: GBP 8M (FY25 closed) · GBP 9M (FY26 active)
    --   Capital budget:   GBP 2.5M (Cloud Infra Modernisation — CATL-P001)
    --   Contingency:      GBP 400K
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── Planning Model: FY2025 Driver-Based (locked) ─────────────────────────
    INSERT INTO master.planning_model (
        tenant_id, code, name, company_code_id,
        description, model_type, planning_horizon, granularity,
        base_currency_code, fiscal_year_from, fiscal_year_to,
        version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
        approved_at, approved_by,
        status, status_changed_at, status_changed_by,
        sort_order, tags, metadata, created_by
    ) VALUES (
        v_tid, 'CATL-PLN-FY25-OP', 'CATL FY2025 Annual Operating Plan', v_cc_catl,
        'Driver-based operating plan for CirrusAtlantic FY2025 (April 2025–March 2026). '
            'Revenue drivers: managed-service ACV, professional-services day-rates, and '
            'cloud-resale margins. Cost lines allocated to nine posting cost centres. '
            'Approved and locked by the Board at the March 2025 planning session.',
        'DRIVER_BASED', 'ANNUAL', 'MONTHLY',
        'GBP', 2025, 2025,
        1, false, false, true, false,
        '2025-03-28 10:00:00+00', v_su,
        'locked', '2025-04-01 08:00:00+00', v_su,
        10, jsonb_build_array('fy2025', 'driver_based', 'locked'), v_meta, v_su
    )
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        status = EXCLUDED.status, approved_at = EXCLUDED.approved_at,
        metadata = master.planning_model.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- ── Planning Model: FY2026 Driver-Based (active) ──────────────────────────
    INSERT INTO master.planning_model (
        tenant_id, code, name, company_code_id,
        description, model_type, planning_horizon, granularity,
        base_currency_code, fiscal_year_from, fiscal_year_to,
        version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
        status, status_changed_at, status_changed_by,
        sort_order, tags, metadata, created_by
    ) VALUES (
        v_tid, 'CATL-PLN-FY26-OP', 'CATL FY2026 Annual Operating Plan', v_cc_catl,
        'Driver-based operating plan for CirrusAtlantic FY2026 (April 2026–March 2027). '
            'Headcount growth (+6 FTEs in Delivery and Pre-Sales), cloud-platform revenue uplift '
            'from Microsoft CSP tier advance, and Digital Workplace project (CATL-P002) delivery '
            'costs all captured as explicit drivers. Monthly board pack with rolling full-year estimate.',
        'DRIVER_BASED', 'ANNUAL', 'MONTHLY',
        'GBP', 2026, 2026,
        1, true, false, true, true,
        'active', '2026-04-01 08:00:00+00', v_su,
        20, jsonb_build_array('fy2026', 'driver_based', 'active'), v_meta, v_su
    )
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        status = EXCLUDED.status, metadata = master.planning_model.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- ── Planning Model: Rolling 12-Month (in_review) ──────────────────────────
    INSERT INTO master.planning_model (
        tenant_id, code, name, company_code_id,
        description, model_type, planning_horizon, granularity,
        base_currency_code, fiscal_year_from, fiscal_year_to,
        version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
        status, status_changed_at, status_changed_by,
        sort_order, tags, metadata, created_by
    ) VALUES (
        v_tid, 'CATL-PLN-R12-FY26', 'CATL Rolling 12-Month Forecast FY2026', v_cc_catl,
        'Continuously updated rolling 12-month forecast introduced as a management overlay '
            'for FY2026. Each month the oldest month drops off and a new forward month is added '
            'using actuals-anchored driver recalculation. CFO reviews on the last working day. '
            'Currently under Finance Committee review before formal adoption.',
        'ROLLING', 'ROLLING_12', 'MONTHLY',
        'GBP', 2026, 2027,
        1, false, true, false, true,
        'in_review', '2026-04-15 14:00:00+00', v_su,
        30, jsonb_build_array('fy2026', 'rolling_12', 'forecast', 'in_review'), v_meta, v_su
    )
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        status = EXCLUDED.status, metadata = master.planning_model.metadata || v_meta,
        updated_at = now(), updated_by = v_su
    WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

    -- ── Budget Profile: FY2025 Operating (closed) ─────────────────────────────
    --   GBP 8,000,000 · 93 % consumed · 2 % residual reserve (£ 160K retained)
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
        v_tid, 'CATL-BUDG-FY25-OP', 'CATL FY2025 Operating Budget', v_cc_catl,
        'Board-approved annual operating budget for CirrusAtlantic Ltd FY2025 '
            '(April 2025–March 2026). Covers all staff costs, office occupancy, '
            'client delivery, sales, IT infrastructure and administration. '
            'Closed following FY2025 year-end statutory accounts sign-off.',
        'OPERATING', 'INTERNAL', 'GBP',
        8000000.00, 160000.00, 7440000.00,   -- 93 % consumed · 2 % residual reserve
        2025, false, '2025-04-01', '2026-03-31',
        'CURRENT_YEAR_ONLY', false,
        'BLOCK', 2.00, true, 400000.00,
        10, jsonb_build_array('fy2025', 'operating', 'closed'), v_meta,
        'closed', '2026-04-30 18:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount      = EXCLUDED.total_amount,
        consumed_amount   = EXCLUDED.consumed_amount,
        reserved_amount   = EXCLUDED.reserved_amount,
        status            = EXCLUDED.status,
        status_changed_at = EXCLUDED.status_changed_at,
        metadata          = master.budget_profile.metadata || v_meta,
        updated_at        = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- ── Budget Profile: FY2026 Operating (active) ─────────────────────────────
    --   GBP 9,000,000 · 10 % reserved · 38 % consumed (mid-year, month 2 of FY)
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
        v_tid, 'CATL-BUDG-FY26-OP', 'CATL FY2026 Operating Budget', v_cc_catl,
        'Board-approved annual operating budget for CirrusAtlantic Ltd FY2026 '
            '(April 2026–March 2027). Reflects planned headcount growth (+6 FTEs), '
            'Microsoft CSP partnership tier advance, and Digital Workplace project delivery '
            'costs. Monthly variance pack presented to the Audit & Finance Committee.',
        'OPERATING', 'INTERNAL', 'GBP',
        9000000.00, 900000.00, 3420000.00,   -- 10 % reserved · 38 % consumed (month 2 of FY)
        2026, false, '2026-04-01', '2027-03-31',
        'CURRENT_YEAR_ONLY', false,
        'BLOCK', 3.00, true, 450000.00,
        20, jsonb_build_array('fy2026', 'operating', 'active'), v_meta,
        'active', '2026-04-01 09:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount      = EXCLUDED.total_amount,
        consumed_amount   = EXCLUDED.consumed_amount,
        reserved_amount   = EXCLUDED.reserved_amount,
        status            = EXCLUDED.status,
        status_changed_at = EXCLUDED.status_changed_at,
        metadata          = master.budget_profile.metadata || v_meta,
        updated_at        = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- ── Budget Profile: Capital — Cloud Infra Modernisation (active) ───────────
    --   GBP 2,500,000 · 25 % reserved · 45 % consumed · CATL-P001
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
        v_tid, 'CATL-BUDG-CAP-FY25', 'CATL Capital Budget — Cloud Infrastructure Modernisation', v_cc_catl,
        'Board-approved capital budget for Cloud Infrastructure Modernisation project (CATL-P001): '
            'full migration from on-premise data centre to Azure hybrid-cloud platform. '
            'Budget covers external professional services, Azure commitment fees, Kubernetes '
            'platform build, and internal IT resource capitalisation. '
            'Active pending final settlement of go-live invoices and capitalisation entries.',
        'CAPITAL', 'INTERNAL', 'GBP',
        2500000.00, 625000.00, 1125000.00,   -- 25 % reserved · 45 % consumed
        2025, false, '2025-04-01', '2026-03-31',
        'CURRENT_YEAR_ONLY', false,
        'ESCALATE', 5.00, true, 50000.00,
        30, jsonb_build_array('capital', 'fy2025', 'cloud', 'catl_p001'), v_meta,
        'active', '2025-04-01 09:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount      = EXCLUDED.total_amount,
        consumed_amount   = EXCLUDED.consumed_amount,
        reserved_amount   = EXCLUDED.reserved_amount,
        status            = EXCLUDED.status,
        metadata          = master.budget_profile.metadata || v_meta,
        updated_at        = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- ── Budget Profile: FY2026 Contingency Reserve (active) ───────────────────
    --   GBP 400,000 · 15 % drawn · CFO + CEO dual-authorisation
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
        v_tid, 'CATL-BUDG-FY26-CONT', 'CATL FY2026 Contingency Reserve', v_cc_catl,
        'Board-approved contingency reserve for FY2026. Covers unanticipated staff costs, '
            'emergency infrastructure incidents, unplanned client remediation, and regulatory '
            'compliance responses. CFO and CEO dual sign-off required per drawdown request.',
        'CONTINGENCY', 'INTERNAL', 'GBP',
        400000.00, 20000.00, 60000.00,       -- 5 % reserved · 15 % drawn (one incident drawdown)
        2026, false, '2026-04-01', '2027-03-31',
        'CURRENT_YEAR_ONLY', false,
        'WARN', 0.00, true, 0,
        40, jsonb_build_array('fy2026', 'contingency', 'reserve'), v_meta,
        'active', '2026-04-01 10:00:00+00', v_su, v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        total_amount      = EXCLUDED.total_amount,
        consumed_amount   = EXCLUDED.consumed_amount,
        reserved_amount   = EXCLUDED.reserved_amount,
        status            = EXCLUDED.status,
        metadata          = master.budget_profile.metadata || v_meta,
        updated_at        = now(), updated_by = v_su
    WHERE (master.budget_profile.total_amount, master.budget_profile.status)
       IS DISTINCT FROM (EXCLUDED.total_amount, EXCLUDED.status);

    -- ══════════════════════════════════════════════════════════════════════════
    -- CATL FY2025 Operating Allocations (9 posting cost centres — infocomm splits)
    -- IT 20% · HR 18% · Sales 15% · Finance 12% · Mktg 10% · Legal 7%
    -- Services 6% · Ops 8% · Procurement 4%
    -- Total: GBP 8,000,000 · status: closed · 93 % consumed · 2 % released
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'CATL-BUDG-FY25-OP';
    IF v_bp_id IS NOT NULL THEN
        -- Information Technology (20 % = GBP 1,600,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-IT';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Information Technology',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,1600000.00,32000.00,1488000.00,32000.00,'BLOCK',2.00,true,false,10,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Human Resources (18 % = GBP 1,440,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-HR';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','Human Resources & People',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,1440000.00,28800.00,1339200.00,28800.00,'BLOCK',2.00,true,false,20,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Sales & Business Development (15 % = GBP 1,200,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-COMM-SALES';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Business Development',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,1200000.00,24000.00,1116000.00,24000.00,'BLOCK',2.00,true,false,30,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Finance & Accounting (12 % = GBP 960,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-FIN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,960000.00,19200.00,892800.00,19200.00,'BLOCK',2.00,true,false,40,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Marketing & Brand (10 % = GBP 800,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-COMM-MKTG';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Brand',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,800000.00,16000.00,744000.00,16000.00,'BLOCK',2.00,true,false,50,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Legal & Compliance (7 % = GBP 560,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-LEGAL';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Compliance',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,560000.00,11200.00,520800.00,11200.00,'BLOCK',2.00,true,false,60,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Service Delivery & Support (6 % = GBP 480,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-SUPPORT-SVC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Service Delivery & Support',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,480000.00,9600.00,446400.00,9600.00,'BLOCK',2.00,true,false,70,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- General Operations & Facilities (8 % = GBP 640,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-OPS-GEN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','General Operations & Facilities',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,640000.00,12800.00,595200.00,12800.00,'BLOCK',2.00,true,false,80,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Procurement & Vendor Management (4 % = GBP 320,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-SUPPORT-PROC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement & Vendor Management',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,320000.00,6400.00,297600.00,6400.00,'BLOCK',2.00,true,false,90,jsonb_build_array('fy2025','infocomm'),v_meta,'closed','2026-04-30 18:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- CATL FY2026 Operating Allocations
    -- IT 20% · HR 18% · Sales 15% · Finance 12% · Mktg 10% · Legal 7%
    -- Services 6% · Ops 8% · Procurement 4%
    -- Total: GBP 9,000,000 · status: active · 10 % reserved · 38 % consumed
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'CATL-BUDG-FY26-OP';
    IF v_bp_id IS NOT NULL THEN
        -- Information Technology (20 % = GBP 1,800,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-IT';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-IT','Information Technology',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,1800000.00,180000.00,684000.00,0,'BLOCK',3.00,true,false,10,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Human Resources (18 % = GBP 1,620,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-HR';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-HR','Human Resources & People',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,1620000.00,162000.00,615600.00,0,'BLOCK',3.00,true,false,20,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Sales & Business Development (15 % = GBP 1,350,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-COMM-SALES';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-SALES','Sales & Business Development',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,1350000.00,135000.00,513000.00,0,'BLOCK',3.00,true,false,30,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Finance & Accounting (12 % = GBP 1,080,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-FIN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-FIN','Finance & Accounting',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,1080000.00,108000.00,410400.00,0,'BLOCK',3.00,true,false,40,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Marketing & Brand (10 % = GBP 900,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-COMM-MKTG';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-COMM-MKTG','Marketing & Brand',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,900000.00,90000.00,342000.00,0,'BLOCK',3.00,true,false,50,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Legal & Compliance (7 % = GBP 630,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-LEGAL';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-ADMIN-LEGAL','Legal & Compliance',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,630000.00,63000.00,239400.00,0,'BLOCK',3.00,true,false,60,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Service Delivery & Support (6 % = GBP 540,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-SUPPORT-SVC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-SVC','Service Delivery & Support',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,540000.00,54000.00,205200.00,0,'BLOCK',3.00,true,false,70,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- General Operations & Facilities (8 % = GBP 720,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-OPS-GEN';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-OPS-GEN','General Operations & Facilities',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,720000.00,72000.00,273600.00,0,'BLOCK',3.00,true,false,80,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
        -- Procurement & Vendor Management (4 % = GBP 360,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-SUPPORT-PROC';
        IF v_ctr_id IS NOT NULL THEN INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by) VALUES (v_tid,'ALLOC-SUPPORT-PROC','Procurement & Vendor Management',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,360000.00,36000.00,136800.00,0,'BLOCK',3.00,true,false,90,jsonb_build_array('fy2026','infocomm'),v_meta,'active','2026-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING; END IF;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- CATL Capital Allocations — Cloud Infra Modernisation (CATL-P001)
    -- Project: GBP 1,500,000 (60 %) · IT CC: GBP 500,000 (20 %)
    --                                  Ops CC: GBP 500,000 (20 %)
    -- 45 % consumed · 25 % reserved across all three lines
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'CATL-BUDG-CAP-FY25';
    IF v_bp_id IS NOT NULL THEN
        -- Project allocation (60 % = GBP 1,500,000) — linked to CATL-P001
        SELECT id INTO v_proj_id FROM master.project WHERE tenant_id = v_tid AND code = 'CATL-P001';
        IF v_proj_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,project_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
            VALUES (v_tid,'ALLOC-PROJ-CLOUD','Cloud Infrastructure Modernisation — Project Budget',v_bp_id,v_cc_catl,2025,'GBP',v_proj_id,1500000.00,375000.00,675000.00,0,'ESCALATE',5.00,true,30000.00,false,10,jsonb_build_array('capital','cloud','project','catl_p001'),v_meta,'active','2025-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
        END IF;
        -- IT cost centre — internal capitalised resource (20 % = GBP 500,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-IT';
        IF v_ctr_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
            VALUES (v_tid,'ALLOC-CAP-IT','Internal IT Resource Capitalisation',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,500000.00,125000.00,225000.00,0,'ESCALATE',5.00,true,10000.00,false,20,jsonb_build_array('capital','cloud','internal_resource'),v_meta,'active','2025-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
        END IF;
        -- Ops cost centre — infrastructure & facilities uplift (20 % = GBP 500,000)
        SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-OPS-GEN';
        IF v_ctr_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,approval_threshold,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
            VALUES (v_tid,'ALLOC-CAP-OPS','Infrastructure & Facilities Uplift',v_bp_id,v_cc_catl,2025,'GBP',v_ctr_id,500000.00,125000.00,225000.00,0,'ESCALATE',5.00,true,10000.00,false,30,jsonb_build_array('capital','cloud','facilities'),v_meta,'active','2025-04-01 09:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
        END IF;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- CATL Contingency Allocation — single unallocated pool on Ops CC
    -- GBP 400,000 · 15 % drawn (£ 60K — one emergency incident) · 5 % reserved
    -- ══════════════════════════════════════════════════════════════════════════
    SELECT id INTO v_bp_id FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'CATL-BUDG-FY26-CONT';
    SELECT id INTO v_ctr_id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-OPS-GEN';
    IF v_bp_id IS NOT NULL AND v_ctr_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (tenant_id,code,name,budget_profile_id,company_code_id,fiscal_year,currency_code,cost_center_id,allocated_amount,reserved_amount,consumed_amount,released_amount,overspend_policy,tolerance_pct,requires_approval,is_carry_forward,sort_order,tags,metadata,status,status_changed_at,status_changed_by,created_by)
        VALUES (v_tid,'ALLOC-CONT-RESERVE','Contingency Reserve — Unallocated Pool',v_bp_id,v_cc_catl,2026,'GBP',v_ctr_id,400000.00,20000.00,60000.00,0,'WARN',0.00,true,false,10,jsonb_build_array('fy2026','contingency'),v_meta,'active','2026-04-01 10:00:00+00',v_su,v_su) ON CONFLICT (tenant_id,budget_profile_id,code) DO NOTHING;
    END IF;

    RAISE NOTICE '[510_catl_budget] Complete — CATL (3 planning models · 4 budget profiles · 22 allocations)';
END $catl_budget$;
