-- ============================================================================
-- ATHYPER GROUP — COMPREHENSIVE BUDGET PROFILES, ALLOCATIONS & PLANNING MODELS
-- ============================================================================
-- File:     010_demo/200_finance/510_budget_planning.sql
-- Tenant:   athyper (demo)
-- Coverage: All 17 company codes across 9 currencies and 13 industry verticals
--
-- Scenarios:
--   Planning Models
--     A1. FY2025 Annual Op Plan (BOTTOM_UP → locked)        — all 17 CCs
--     A2. FY2026 Annual Op Plan (DRIVER_BASED → active)     — all 17 CCs
--     A3. FY2025-2027 Capital Plan (TOP_DOWN → approved)    — 7 capex CCs
--     A4. Rolling 12M Forecast FY2026 (ROLLING → in_review) — AUIC, ASGF, AUET
--     A5. FY2027 Zero-Based Budget (ZERO_BASED → draft)     — AJED, APHS, ADPM
--
--   Budget Profiles
--     B1. FY2025 Operating Budget (OPERATING / closed)      — all 17 CCs
--     B2. FY2026 Operating Budget (OPERATING / active)      — all 17 CCs
--     B3. Capital Budget FY2025-2027 (CAPITAL / active)     — 7 capex CCs
--     B4. FY2026 Contingency Reserve (CONTINGENCY / active) — 14 CCs
--     B5. Revolving Trade Facility (REVOLVING / active)     — AUET
--     B6. QNV2030 Infrastructure Grant (GRANT / active)     — AQTU
--
--   Budget Allocations
--     C.  FY2025 & FY2026 operating — 9 posting CCs × 17 companies × 2 FY
--     D.  Capital — 3 allocs per capex CC (project + IT + ops)
--     E.  Contingency — 1 pool alloc per CC
--     F.  Special — revolving (AUET) + grant (AQTU)
--
-- Idempotent: Skips if metadata._seed_pack = '510_budget_planning' already exists
-- Depends:
--   000_athyper_tenant.sql
--   010_demo/100_org_structure/199_gl_preseed.sql          (17 company codes)
--   blueprints/universal/060_org_structure/301_cost_centers.sql  (posting CCs)
--   010_demo/projects_demo/001-004_demo_projects.sql       (project FKs)
-- ============================================================================

DO $demo_budget$
DECLARE
    v_tid         uuid;
    v_su          uuid  := '00000000-0000-0000-0000-000000000000';
    v_pack        text  := '510_budget_planning';
    v_meta        jsonb;
    v_cc_code_id  uuid;
    v_ctr_id      uuid;
    v_proj_id     uuid;
    v_bp_id       uuid;
    v_sort        int;
    v_fy25_from   date;
    v_fy25_to     date;
    v_fy26_from   date;
    v_fy26_to     date;
    cc            record;
    sp            record;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[510_budget_planning] athyper tenant not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.planning_model
        WHERE  tenant_id = v_tid
          AND  metadata->>'_seed_pack' = v_pack
    ) THEN
        RAISE NOTICE '[510_budget_planning] already seeded — skipping';
        RETURN;
    END IF;

    v_meta := jsonb_build_object('_seed_pack', v_pack, '_seeded_at', now()::text);

    -- ── Per-company configuration ─────────────────────────────────────────────
    CREATE TEMP TABLE tmp_cc_cfg (
        cc_code         text PRIMARY KEY,
        currency        char(3),
        industry        text,
        fy_start        smallint,   -- fiscal-year start month
        fy25_op         numeric,    -- FY2025 operating budget total
        fy26_op         numeric,    -- FY2026 operating budget total
        cap_budget      numeric,    -- capital budget (NULL = no capex profile)
        contingency     numeric,    -- contingency reserve (NULL = no profile)
        grant_budget    numeric,    -- grant budget (NULL = no grant profile)
        revolving_limit numeric,    -- revolving facility limit (NULL = none)
        cap_proj_code   text        -- primary project code for capex allocation
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc_cfg VALUES
    -- cc_code  cur   industry        fyS  fy25_op       fy26_op       cap_budget    contingency  grant        revolving     cap_proj
    ('ATHQ','MYR','admin',        1, 25000000,    27500000,    12000000,   1500000,  NULL,       NULL,        'ATHQ-P001'),
    ('AMRE','MYR','real_estate',  1, 80000000,    88000000,    90000000,   4000000,  NULL,       NULL,        'AMRE-P001'),
    ('AQTU','QAR','utilities',    4, 180000000,   198000000,   140000000,  10000000, 45000000,   NULL,        'AQTU-P001'),
    ('ASAC','SAR','construction', 1, 280000000,   308000000,   260000000,  15000000, NULL,       NULL,        'ASAC-P001'),
    ('AQTS','QAR','transport',    4, 120000000,   132000000,   100000000,  8000000,  NULL,       NULL,        'AQTS-P001'),
    ('AUET','AED','trading',      1, 200000000,   220000000,   NULL,       NULL,     NULL,       20000000,    NULL),
    ('ASAH','SAR','hospitality',  1, 95000000,    104500000,   NULL,       5000000,  NULL,       NULL,        NULL),
    ('AUIC','USD','infocomm',     1, 45000000,    49500000,    12000000,   2500000,  NULL,       NULL,        'AUIC-P001'),
    ('ASGF','SGD','financial',    1, 60000000,    66000000,    NULL,       3000000,  NULL,       NULL,        NULL),
    ('AITM','INR','mfg',          4, 450000000,   495000000,   NULL,       22000000, NULL,       NULL,        NULL),
    ('ACFB','CAD','mfg',          1, 85000000,    93500000,    NULL,       4500000,  NULL,       NULL,        NULL),
    ('ADPM','EUR','mfg',          1, 120000000,   132000000,   35000000,   7000000,  NULL,       NULL,        'ADPM-P001'),
    ('ATEM','TWD','mfg',          1, 1800000000,  1980000000,  NULL,       90000000, NULL,       NULL,        NULL),
    ('ASPE','ZAR','petroleum',    3, 800000000,   880000000,   NULL,       40000000, NULL,       NULL,        NULL),
    ('AUKA','GBP','agriculture',  4, 35000000,    38500000,    NULL,       2000000,  NULL,       NULL,        NULL),
    ('AJED','JPY','education',    4, 2500000000,  2750000000,  NULL,       120000000,NULL,       NULL,        NULL),
    ('APHS','PHP','healthcare',   1, 450000000,   495000000,   NULL,       22000000, NULL,       NULL,        NULL);

    -- ── Allocation percentage splits by industry vertical ─────────────────────
    -- Percentages sum to 1.00 per industry; used for both FY25 and FY26.
    CREATE TEMP TABLE tmp_alloc_split (
        industry    text,
        cc_suffix   text,
        alloc_name  text,
        pct         numeric
    ) ON COMMIT DROP;

    INSERT INTO tmp_alloc_split VALUES
    -- admin / holding (ATHQ) ──────────────────────────────────────────────────
    ('admin',        '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.18),
    ('admin',        '-CC-ADMIN-HR',     'Human Resources',                        0.22),
    ('admin',        '-CC-ADMIN-IT',     'Information Technology',                 0.15),
    ('admin',        '-CC-ADMIN-LEGAL',  'Legal & Compliance',                     0.08),
    ('admin',        '-CC-COMM-SALES',   'Sales & Business Development',           0.10),
    ('admin',        '-CC-COMM-MKTG',    'Marketing & Brand',                      0.07),
    ('admin',        '-CC-SUPPORT-PROC', 'Procurement',                            0.04),
    ('admin',        '-CC-SUPPORT-SVC',  'Shared Services',                        0.06),
    ('admin',        '-CC-OPS-GEN',      'General Operations',                     0.10),
    -- real estate (AMRE) ──────────────────────────────────────────────────────
    ('real_estate',  '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.10),
    ('real_estate',  '-CC-ADMIN-HR',     'Human Resources',                        0.12),
    ('real_estate',  '-CC-ADMIN-IT',     'Information Technology',                 0.06),
    ('real_estate',  '-CC-ADMIN-LEGAL',  'Legal & Transactions',                   0.10),
    ('real_estate',  '-CC-COMM-SALES',   'Sales & Leasing',                        0.15),
    ('real_estate',  '-CC-COMM-MKTG',    'Marketing & Events',                     0.10),
    ('real_estate',  '-CC-SUPPORT-PROC', 'Procurement & Contracts',                0.06),
    ('real_estate',  '-CC-SUPPORT-SVC',  'Property Management Support',            0.05),
    ('real_estate',  '-CC-OPS-GEN',      'Facilities & Property Operations',       0.26),
    -- utilities (AQTU) ────────────────────────────────────────────────────────
    ('utilities',    '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.08),
    ('utilities',    '-CC-ADMIN-HR',     'HR & Training',                          0.10),
    ('utilities',    '-CC-ADMIN-IT',     'SCADA & IT Systems',                     0.10),
    ('utilities',    '-CC-ADMIN-LEGAL',  'Regulatory Affairs & Legal',             0.06),
    ('utilities',    '-CC-COMM-SALES',   'Customer Services',                      0.04),
    ('utilities',    '-CC-COMM-MKTG',    'Stakeholder Relations',                  0.02),
    ('utilities',    '-CC-SUPPORT-PROC', 'Procurement & Supply Chain',             0.08),
    ('utilities',    '-CC-SUPPORT-SVC',  'HSE & Shared Services',                  0.06),
    ('utilities',    '-CC-OPS-GEN',      'Network & Plant Operations',             0.46),
    -- construction (ASAC) ─────────────────────────────────────────────────────
    ('construction', '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.10),
    ('construction', '-CC-ADMIN-HR',     'Workforce Management',                   0.12),
    ('construction', '-CC-ADMIN-IT',     'IT & Project Systems',                   0.06),
    ('construction', '-CC-ADMIN-LEGAL',  'Legal & Contract Management',            0.08),
    ('construction', '-CC-COMM-SALES',   'Tendering & Business Development',       0.08),
    ('construction', '-CC-COMM-MKTG',    'Marketing & Pre-Qualification',          0.03),
    ('construction', '-CC-SUPPORT-PROC', 'Procurement & Materials',                0.08),
    ('construction', '-CC-SUPPORT-SVC',  'QHSE & Shared Services',                 0.05),
    ('construction', '-CC-OPS-GEN',      'Site & Construction Operations',         0.40),
    -- transport (AQTS) ────────────────────────────────────────────────────────
    ('transport',    '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.10),
    ('transport',    '-CC-ADMIN-HR',     'HR & Driver Management',                 0.12),
    ('transport',    '-CC-ADMIN-IT',     'Fleet Management & IT',                  0.08),
    ('transport',    '-CC-ADMIN-LEGAL',  'Legal & Licensing',                      0.05),
    ('transport',    '-CC-COMM-SALES',   'Sales & Key Account Management',         0.10),
    ('transport',    '-CC-COMM-MKTG',    'Marketing & Brand',                      0.04),
    ('transport',    '-CC-SUPPORT-PROC', 'Procurement & Spare Parts',              0.06),
    ('transport',    '-CC-SUPPORT-SVC',  'Fleet Maintenance & HSE',                0.05),
    ('transport',    '-CC-OPS-GEN',      'Fleet & Depot Operations',               0.40),
    -- trading (AUET) ──────────────────────────────────────────────────────────
    ('trading',      '-CC-ADMIN-FIN',    'Finance & Treasury',                     0.12),
    ('trading',      '-CC-ADMIN-HR',     'Human Resources',                        0.14),
    ('trading',      '-CC-ADMIN-IT',     'IT & ERP Systems',                       0.08),
    ('trading',      '-CC-ADMIN-LEGAL',  'Trade Compliance & Legal',               0.06),
    ('trading',      '-CC-COMM-SALES',   'Sales & Distribution',                   0.22),
    ('trading',      '-CC-COMM-MKTG',    'Marketing & Trade Promotions',           0.10),
    ('trading',      '-CC-SUPPORT-PROC', 'Procurement & Sourcing',                 0.08),
    ('trading',      '-CC-SUPPORT-SVC',  'Shared Services',                        0.06),
    ('trading',      '-CC-OPS-GEN',      'Logistics & Warehousing',                0.14),
    -- hospitality (ASAH) ──────────────────────────────────────────────────────
    ('hospitality',  '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.10),
    ('hospitality',  '-CC-ADMIN-HR',     'HR & Guest Services Training',           0.18),
    ('hospitality',  '-CC-ADMIN-IT',     'IT & Property Management Systems',       0.08),
    ('hospitality',  '-CC-ADMIN-LEGAL',  'Legal & Compliance',                     0.05),
    ('hospitality',  '-CC-COMM-SALES',   'Sales & Reservations',                   0.16),
    ('hospitality',  '-CC-COMM-MKTG',    'Marketing & Events',                     0.12),
    ('hospitality',  '-CC-SUPPORT-PROC', 'Procurement & F&B Purchasing',           0.08),
    ('hospitality',  '-CC-SUPPORT-SVC',  'Guest Experience & HSE',                 0.08),
    ('hospitality',  '-CC-OPS-GEN',      'Hotel & Resort Operations',              0.15),
    -- infocomm (AUIC) ─────────────────────────────────────────────────────────
    ('infocomm',     '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.12),
    ('infocomm',     '-CC-ADMIN-HR',     'HR & Talent Acquisition',                0.18),
    ('infocomm',     '-CC-ADMIN-IT',     'Internal IT & Cybersecurity',            0.20),
    ('infocomm',     '-CC-ADMIN-LEGAL',  'Legal & Intellectual Property',          0.07),
    ('infocomm',     '-CC-COMM-SALES',   'Sales & Partnerships',                   0.15),
    ('infocomm',     '-CC-COMM-MKTG',    'Marketing & Analyst Relations',          0.10),
    ('infocomm',     '-CC-SUPPORT-PROC', 'Procurement',                            0.04),
    ('infocomm',     '-CC-SUPPORT-SVC',  'Customer Success & Support',             0.06),
    ('infocomm',     '-CC-OPS-GEN',      'R&D & Engineering Operations',           0.08),
    -- financial services (ASGF) ───────────────────────────────────────────────
    ('financial',    '-CC-ADMIN-FIN',    'Finance, Treasury & Operations',         0.18),
    ('financial',    '-CC-ADMIN-HR',     'HR & Compliance',                        0.16),
    ('financial',    '-CC-ADMIN-IT',     'IT & Cybersecurity',                     0.15),
    ('financial',    '-CC-ADMIN-LEGAL',  'Legal & Regulatory Affairs',             0.10),
    ('financial',    '-CC-COMM-SALES',   'Sales & Client Relations',               0.14),
    ('financial',    '-CC-COMM-MKTG',    'Marketing & Events',                     0.08),
    ('financial',    '-CC-SUPPORT-PROC', 'Procurement',                            0.03),
    ('financial',    '-CC-SUPPORT-SVC',  'Operations & Client Support',            0.08),
    ('financial',    '-CC-OPS-GEN',      'Trading & Investment Operations',        0.08),
    -- manufacturing (AITM, ACFB, ADPM, ATEM) ─────────────────────────────────
    ('mfg',          '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.08),
    ('mfg',          '-CC-ADMIN-HR',     'HR & Industrial Relations',              0.12),
    ('mfg',          '-CC-ADMIN-IT',     'IT & Automation Systems',                0.08),
    ('mfg',          '-CC-ADMIN-LEGAL',  'Legal & Compliance',                     0.04),
    ('mfg',          '-CC-COMM-SALES',   'Sales & Customer Management',            0.12),
    ('mfg',          '-CC-COMM-MKTG',    'Marketing & Branding',                   0.05),
    ('mfg',          '-CC-SUPPORT-PROC', 'Procurement & Raw Materials',            0.08),
    ('mfg',          '-CC-SUPPORT-SVC',  'Quality Assurance & Shared Services',    0.05),
    ('mfg',          '-CC-OPS-GEN',      'Manufacturing & Production Operations',  0.38),
    -- petroleum / mining (ASPE) ───────────────────────────────────────────────
    ('petroleum',    '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.08),
    ('petroleum',    '-CC-ADMIN-HR',     'HR & Safety Management',                 0.10),
    ('petroleum',    '-CC-ADMIN-IT',     'IT & SCADA Systems',                     0.08),
    ('petroleum',    '-CC-ADMIN-LEGAL',  'Legal, Environment & Regulatory',        0.06),
    ('petroleum',    '-CC-COMM-SALES',   'Commercial & Offtake Management',        0.06),
    ('petroleum',    '-CC-COMM-MKTG',    'Stakeholder & Community Relations',      0.02),
    ('petroleum',    '-CC-SUPPORT-PROC', 'Procurement & Logistics',                0.10),
    ('petroleum',    '-CC-SUPPORT-SVC',  'HSE & Shared Services',                  0.05),
    ('petroleum',    '-CC-OPS-GEN',      'Extraction & Field Operations',          0.45),
    -- agriculture (AUKA) ──────────────────────────────────────────────────────
    ('agriculture',  '-CC-ADMIN-FIN',    'Finance & Accounting',                   0.10),
    ('agriculture',  '-CC-ADMIN-HR',     'HR & Seasonal Workforce',                0.14),
    ('agriculture',  '-CC-ADMIN-IT',     'IT & Precision Farming Systems',         0.06),
    ('agriculture',  '-CC-ADMIN-LEGAL',  'Legal & Compliance',                     0.06),
    ('agriculture',  '-CC-COMM-SALES',   'Sales & Market Access',                  0.14),
    ('agriculture',  '-CC-COMM-MKTG',    'Marketing & Export Branding',            0.08),
    ('agriculture',  '-CC-SUPPORT-PROC', 'Procurement & Agricultural Inputs',      0.10),
    ('agriculture',  '-CC-SUPPORT-SVC',  'R&D & Shared Services',                  0.05),
    ('agriculture',  '-CC-OPS-GEN',      'Farming & Harvest Operations',           0.27),
    -- education (AJED) ────────────────────────────────────────────────────────
    ('education',    '-CC-ADMIN-FIN',    'Finance & Administration',               0.10),
    ('education',    '-CC-ADMIN-HR',     'HR & Academic Affairs',                  0.25),
    ('education',    '-CC-ADMIN-IT',     'IT & E-Learning Platforms',              0.10),
    ('education',    '-CC-ADMIN-LEGAL',  'Legal & Accreditation',                  0.06),
    ('education',    '-CC-COMM-SALES',   'Admissions & Student Recruitment',       0.12),
    ('education',    '-CC-COMM-MKTG',    'Marketing & Alumni Relations',           0.08),
    ('education',    '-CC-SUPPORT-PROC', 'Procurement & Library Resources',        0.06),
    ('education',    '-CC-SUPPORT-SVC',  'Student Services & Welfare',             0.08),
    ('education',    '-CC-OPS-GEN',      'Campus & Research Operations',           0.15),
    -- healthcare (APHS) ───────────────────────────────────────────────────────
    ('healthcare',   '-CC-ADMIN-FIN',    'Finance & Patient Billing',              0.08),
    ('healthcare',   '-CC-ADMIN-HR',     'HR & Medical Staffing',                  0.20),
    ('healthcare',   '-CC-ADMIN-IT',     'IT & Health Information Systems',        0.08),
    ('healthcare',   '-CC-ADMIN-LEGAL',  'Legal & Risk Management',                0.06),
    ('healthcare',   '-CC-COMM-SALES',   'Patient Services & Relations',           0.06),
    ('healthcare',   '-CC-COMM-MKTG',    'Marketing & Community Health',           0.04),
    ('healthcare',   '-CC-SUPPORT-PROC', 'Procurement & Pharma Supply Chain',      0.08),
    ('healthcare',   '-CC-SUPPORT-SVC',  'Quality, Safety & Support Services',     0.08),
    ('healthcare',   '-CC-OPS-GEN',      'Clinical & Ward Operations',             0.32);

    -- ══════════════════════════════════════════════════════════════════════════
    -- SECTION A: PLANNING MODELS
    -- ══════════════════════════════════════════════════════════════════════════

    <<cc_pln_loop>>
    FOR cc IN SELECT * FROM tmp_cc_cfg ORDER BY cc_code LOOP

        SELECT id INTO v_cc_code_id
        FROM master.company_code WHERE tenant_id = v_tid AND code = cc.cc_code;
        CONTINUE cc_pln_loop WHEN v_cc_code_id IS NULL;

        v_fy25_from := make_date(2025, cc.fy_start::int, 1);
        v_fy25_to   := (v_fy25_from + interval '1 year' - interval '1 day')::date;
        v_fy26_from := make_date(2026, cc.fy_start::int, 1);
        v_fy26_to   := (v_fy26_from + interval '1 year' - interval '1 day')::date;

        -- A1: FY2025 Annual Operating Plan — BOTTOM_UP, locked ─────────────────
        INSERT INTO master.planning_model (
            tenant_id, code, name, company_code_id,
            description, model_type, planning_horizon, granularity,
            base_currency_code, fiscal_year_from, fiscal_year_to,
            version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
            approved_at, approved_by,
            status, status_changed_at, status_changed_by,
            sort_order, tags, metadata, created_by
        ) VALUES (
            v_tid,
            cc.cc_code || '-PLN-FY25-OP',
            cc.cc_code || ' FY2025 Annual Operating Plan',
            v_cc_code_id,
            'Annual operating plan for FY' || date_part('year', v_fy25_from)::int::text || '. '
                'Bottom-up submission by cost-centre budget holders, consolidated by FP&A, '
                'approved at the January 2025 board meeting and locked against further changes.',
            'BOTTOM_UP', 'ANNUAL', 'MONTHLY',
            cc.currency, 2025, 2025,
            1, false, false, true, false,
            '2025-01-20 09:00:00+00', v_su,
            'locked', '2025-01-20 09:30:00+00', v_su,
            10,
            jsonb_build_array('fy2025', 'operating', 'approved', 'locked'),
            v_meta, v_su
        )
        ON CONFLICT (tenant_id, code, version) DO UPDATE SET
            status            = EXCLUDED.status,
            approved_at       = EXCLUDED.approved_at,
            status_changed_at = EXCLUDED.status_changed_at,
            metadata          = master.planning_model.metadata || v_meta,
            updated_at        = now(), updated_by = v_su
        WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

        -- A2: FY2026 Annual Operating Plan — DRIVER_BASED, active ──────────────
        INSERT INTO master.planning_model (
            tenant_id, code, name, company_code_id,
            description, model_type, planning_horizon, granularity,
            base_currency_code, fiscal_year_from, fiscal_year_to,
            version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
            status, status_changed_at, status_changed_by,
            sort_order, tags, metadata, created_by
        ) VALUES (
            v_tid,
            cc.cc_code || '-PLN-FY26-OP',
            cc.cc_code || ' FY2026 Annual Operating Plan',
            v_cc_code_id,
            'Annual operating plan for FY2026. Driver-based model — headcount, utilisation and '
                'volume drivers cascade to cost and revenue lines via pre-built business rules. '
                'Monthly variance vs actuals reported to board through integrated finance dashboard.',
            'DRIVER_BASED', 'ANNUAL', 'MONTHLY',
            cc.currency, 2026, 2026,
            1, true, false, true, true,
            'active', '2026-01-10 09:00:00+00', v_su,
            20,
            jsonb_build_array('fy2026', 'operating', 'active', 'current'),
            v_meta, v_su
        )
        ON CONFLICT (tenant_id, code, version) DO UPDATE SET
            status            = EXCLUDED.status,
            status_changed_at = EXCLUDED.status_changed_at,
            metadata          = master.planning_model.metadata || v_meta,
            updated_at        = now(), updated_by = v_su
        WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;

        -- A3: FY2025-2027 Capital Expenditure Plan — TOP_DOWN, approved ─────────
        IF cc.cap_budget IS NOT NULL THEN
            INSERT INTO master.planning_model (
                tenant_id, code, name, company_code_id,
                description, model_type, planning_horizon, granularity,
                base_currency_code, fiscal_year_from, fiscal_year_to,
                version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
                approved_at, approved_by,
                status, status_changed_at, status_changed_by,
                sort_order, tags, metadata, created_by
            ) VALUES (
                v_tid,
                cc.cc_code || '-PLN-CAP-FY25',
                cc.cc_code || ' FY2025–2027 Capital Expenditure Plan',
                v_cc_code_id,
                'Board-approved multi-year capital expenditure plan. Top-down investment envelope '
                    'set by the investment committee; spend profiled quarterly by project phase. '
                    'Milestone-based disbursement with WBS-level actuals tracking.',
                'TOP_DOWN', 'MULTI_YEAR', 'QUARTERLY',
                cc.currency, 2025, 2027,
                1, true, false, true, false,
                '2025-02-10 10:00:00+00', v_su,
                'approved', '2025-02-10 10:30:00+00', v_su,
                30,
                jsonb_build_array('capital', 'multi_year', 'fy2025_2027', 'approved'),
                v_meta, v_su
            )
            ON CONFLICT (tenant_id, code, version) DO UPDATE SET
                status            = EXCLUDED.status,
                approved_at       = EXCLUDED.approved_at,
                status_changed_at = EXCLUDED.status_changed_at,
                metadata          = master.planning_model.metadata || v_meta,
                updated_at        = now(), updated_by = v_su
            WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;
        END IF;

        -- A4: Rolling 12-Month Forecast — ROLLING, in_review (infocomm/financial/trading)
        IF cc.industry IN ('infocomm', 'financial', 'trading') THEN
            INSERT INTO master.planning_model (
                tenant_id, code, name, company_code_id,
                description, model_type, planning_horizon, granularity,
                base_currency_code, fiscal_year_from, fiscal_year_to,
                version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
                status, status_changed_at, status_changed_by,
                sort_order, tags, metadata, created_by
            ) VALUES (
                v_tid,
                cc.cc_code || '-PLN-R12-FY26',
                cc.cc_code || ' Rolling 12-Month Forecast FY2026',
                v_cc_code_id,
                'Continuous rolling 12-month forecast maintained alongside the annual plan. '
                    'Auto-recalculates each period-end from actuals feed — actuals lock, forward '
                    'periods reprojected. In CFO review before formal board adoption.',
                'ROLLING', 'ROLLING_12', 'MONTHLY',
                cc.currency, 2026, 2026,
                1, false, true, false, true,
                'in_review', '2026-04-05 09:00:00+00', v_su,
                40,
                jsonb_build_array('rolling', 'forecast', 'fy2026', 'in_review'),
                v_meta, v_su
            )
            ON CONFLICT (tenant_id, code, version) DO UPDATE SET
                status            = EXCLUDED.status,
                status_changed_at = EXCLUDED.status_changed_at,
                metadata          = master.planning_model.metadata || v_meta,
                updated_at        = now(), updated_by = v_su
            WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;
        END IF;

        -- A5: FY2027 Zero-Based Budget — ZERO_BASED, draft (AJED, APHS, ADPM)
        IF cc.cc_code IN ('AJED', 'APHS', 'ADPM') THEN
            INSERT INTO master.planning_model (
                tenant_id, code, name, company_code_id,
                description, model_type, planning_horizon, granularity,
                base_currency_code, fiscal_year_from, fiscal_year_to,
                version, is_current, auto_recalculate, lock_on_approval, allows_overrides,
                status, status_changed_at, status_changed_by,
                sort_order, tags, metadata, created_by
            ) VALUES (
                v_tid,
                cc.cc_code || '-PLN-ZBB-FY27',
                cc.cc_code || ' FY2027 Zero-Based Budget Initiative',
                v_cc_code_id,
                'FY2027 zero-based budgeting exercise initiated by board directive. Every cost line '
                    'must be justified from first principles — no baseline carry-over. '
                    'Budget holders submit decision packages ranked by business criticality.',
                'ZERO_BASED', 'ANNUAL', 'QUARTERLY',
                cc.currency, 2027, 2027,
                1, false, false, true, true,
                'draft', now(), v_su,
                50,
                jsonb_build_array('fy2027', 'zero_based', 'draft', 'planning'),
                v_meta, v_su
            )
            ON CONFLICT (tenant_id, code, version) DO UPDATE SET
                status            = EXCLUDED.status,
                metadata          = master.planning_model.metadata || v_meta,
                updated_at        = now(), updated_by = v_su
            WHERE master.planning_model.status IS DISTINCT FROM EXCLUDED.status;
        END IF;

    END LOOP cc_pln_loop;
    RAISE NOTICE '[510] planning_model rows seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- SECTION B: BUDGET PROFILES
    -- ══════════════════════════════════════════════════════════════════════════

    <<cc_bp_loop>>
    FOR cc IN SELECT * FROM tmp_cc_cfg ORDER BY cc_code LOOP

        SELECT id INTO v_cc_code_id
        FROM master.company_code WHERE tenant_id = v_tid AND code = cc.cc_code;
        CONTINUE cc_bp_loop WHEN v_cc_code_id IS NULL;

        v_fy25_from := make_date(2025, cc.fy_start::int, 1);
        v_fy25_to   := (v_fy25_from + interval '1 year' - interval '1 day')::date;
        v_fy26_from := make_date(2026, cc.fy_start::int, 1);
        v_fy26_to   := (v_fy26_from + interval '1 year' - interval '1 day')::date;

        -- B1: FY2025 Operating Budget — closed (year ended) ───────────────────
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
            v_tid,
            cc.cc_code || '-BUDG-FY25-OP',
            cc.cc_code || ' FY2025 Operating Budget',
            v_cc_code_id,
            'Board-approved annual operating budget for FY2025. Covers all posting cost centres '
                'across admin, commercial, support and operations. Closed at financial year-end '
                'with final variance analysis and carry-forward decisions issued.',
            'OPERATING', 'INTERNAL', cc.currency,
            cc.fy25_op,
            ROUND(cc.fy25_op * 0.02, 2),   -- 2 % residual reserved (settled post-close)
            ROUND(cc.fy25_op * 0.93, 2),   -- 93 % consumed at year-end
            2025, false, v_fy25_from, v_fy25_to,
            'CURRENT_YEAR_ONLY', false,
            'BLOCK', 2.00, true, ROUND(cc.fy25_op * 0.05, 2),
            10,
            jsonb_build_array('fy2025', 'operating', 'closed'),
            v_meta,
            'closed', '2026-01-31 18:00:00+00', v_su, v_su
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

        -- B2: FY2026 Operating Budget — active (current year) ─────────────────
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
            v_tid,
            cc.cc_code || '-BUDG-FY26-OP',
            cc.cc_code || ' FY2026 Operating Budget',
            v_cc_code_id,
            'Board-approved annual operating budget for FY2026. Mid-year execution active — '
                'monthly variance vs actuals tracked through the integrated finance dashboard. '
                'Reforecasting triggered if any cost centre exceeds 5 % adverse variance.',
            'OPERATING', 'INTERNAL', cc.currency,
            cc.fy26_op,
            ROUND(cc.fy26_op * 0.10, 2),   -- 10 % committed/reserved (purchase orders)
            ROUND(cc.fy26_op * 0.38, 2),   -- 38 % consumed (approx Q1 + partial Q2)
            2026, false, v_fy26_from, v_fy26_to,
            'CURRENT_YEAR_ONLY', false,
            'BLOCK', 3.00, true, ROUND(cc.fy26_op * 0.05, 2),
            20,
            jsonb_build_array('fy2026', 'operating', 'active'),
            v_meta,
            'active', '2026-01-15 10:00:00+00', v_su, v_su
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

        -- B3: Capital Budget FY2025-2027 — active, multi-year ─────────────────
        IF cc.cap_budget IS NOT NULL THEN
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
                v_tid,
                cc.cc_code || '-BUDG-CAP-FY25',
                cc.cc_code || ' Capital Expenditure Budget FY2025–2027',
                v_cc_code_id,
                'Board-approved multi-year capital expenditure budget. Investment envelope covers '
                    'major project commitments and strategic infrastructure over FY2025–FY2027. '
                    'Profiled across fiscal years using horizon-spread strategy; quarterly milestone '
                    'gates required before next tranche release.',
                'CAPITAL', 'INTERNAL', cc.currency,
                cc.cap_budget,
                ROUND(cc.cap_budget * 0.25, 2),  -- 25 % committed (signed contracts / POs)
                ROUND(cc.cap_budget * 0.45, 2),  -- 45 % consumed to date
                2025, true, '2025-01-01', '2027-12-31',
                'HORIZON_SPREAD', false,
                'ESCALATE', 5.00, true, ROUND(cc.cap_budget * 0.02, 2),
                30,
                jsonb_build_array('capital', 'multi_year', 'fy2025_2027', 'approved'),
                v_meta,
                'active', '2025-02-15 10:00:00+00', v_su, v_su
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
        END IF;

        -- B4: FY2026 Contingency Reserve — active ─────────────────────────────
        IF cc.contingency IS NOT NULL THEN
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
                v_tid,
                cc.cc_code || '-BUDG-FY26-CONT',
                cc.cc_code || ' FY2026 Contingency Reserve',
                v_cc_code_id,
                'Executive-approved contingency reserve for FY2026. Covers unplanned and '
                    'non-recurring expenditures not foreseeable at budget time. '
                    'All drawdowns require joint CFO and CEO authorisation with post-incident review.',
                'CONTINGENCY', 'INTERNAL', cc.currency,
                cc.contingency,
                0,
                ROUND(cc.contingency * 0.15, 2),  -- 15 % partially drawn (one incident)
                2026, false, v_fy26_from, v_fy26_to,
                'CURRENT_YEAR_ONLY', false,
                'WARN', 0.00, true, 0,
                40,
                jsonb_build_array('fy2026', 'contingency', 'reserve'),
                v_meta,
                'active', '2026-01-15 11:00:00+00', v_su, v_su
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
        END IF;

        -- B5: Revolving Trade Procurement Facility — AUET only ─────────────────
        IF cc.revolving_limit IS NOT NULL THEN
            INSERT INTO master.budget_profile (
                tenant_id, code, name, company_code_id,
                description, fund_type, fund_source, currency_code,
                total_amount, reserved_amount, consumed_amount,
                fiscal_year, is_multi_year, valid_from, valid_to,
                multi_year_strategy, is_replenishable, replenish_method, replenish_frequency,
                overspend_policy, tolerance_pct, requires_approval,
                sort_order, tags, metadata,
                status, status_changed_at, status_changed_by, created_by
            ) VALUES (
                v_tid,
                cc.cc_code || '-BUDG-FY26-REV',
                cc.cc_code || ' FY2026 Revolving Trade Procurement Facility',
                v_cc_code_id,
                'Revolving trade procurement facility replenished quarterly from operating cash '
                    'flow. Funds import letters of credit, advance supplier payments and bridge '
                    'procurement for high-velocity trading commodity lines. '
                    'Board-approved facility limit; individual drawdowns approved by Treasury.',
                'REVOLVING', 'INTERNAL', cc.currency,
                cc.revolving_limit,
                ROUND(cc.revolving_limit * 0.35, 2),  -- 35 % committed (open LCs)
                ROUND(cc.revolving_limit * 0.55, 2),  -- 55 % drawn (settled invoices this cycle)
                2026, false, '2026-01-01', '2026-12-31',
                'CURRENT_YEAR_ONLY', true, 'QUARTERLY', 'QUARTERLY',
                'ALLOW', 5.00, false,
                50,
                jsonb_build_array('fy2026', 'revolving', 'procurement', 'trading'),
                v_meta,
                'active', '2026-01-15 11:30:00+00', v_su, v_su
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
        END IF;

        -- B6: Qatar QNV2030 Infrastructure Grant — AQTU only ──────────────────
        IF cc.grant_budget IS NOT NULL THEN
            INSERT INTO master.budget_profile (
                tenant_id, code, name, company_code_id,
                description, fund_type, fund_source, fund_category, currency_code,
                total_amount, reserved_amount, consumed_amount,
                fiscal_year, is_multi_year, valid_from, valid_to,
                multi_year_strategy, is_replenishable,
                overspend_policy, tolerance_pct, requires_approval, approval_threshold,
                sort_order, tags, metadata,
                status, status_changed_at, status_changed_by, created_by
            ) VALUES (
                v_tid,
                cc.cc_code || '-BUDG-GRT-QNV',
                cc.cc_code || ' Qatar National Vision 2030 — Green Infrastructure Grant',
                v_cc_code_id,
                'Multi-year government grant awarded under Qatar National Vision 2030 for water '
                    'desalination capacity expansion and renewable energy integration. '
                    'Disbursed by MDPS in tranches against certified milestone completions. '
                    'Full-reserve strategy — unspent funds must be returned to MDPS.',
                'GRANT', 'GRANT', 'INFRASTRUCTURE', cc.currency,
                cc.grant_budget,
                ROUND(cc.grant_budget * 0.10, 2),  -- 10 % reserved for next milestone tranche
                ROUND(cc.grant_budget * 0.72, 2),  -- 72 % certified and consumed
                2024, true, '2024-07-01', '2027-06-30',
                'FULL_RESERVE', false,
                'BLOCK', 0.00, true, 0,
                60,
                jsonb_build_array('grant', 'government', 'qnv2030', 'infrastructure', 'multi_year'),
                v_meta,
                'active', '2024-07-01 08:00:00+00', v_su, v_su
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
        END IF;

    END LOOP cc_bp_loop;
    RAISE NOTICE '[510] budget_profile rows seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- SECTION C: BUDGET ALLOCATIONS — Operating (per posting cost centre)
    -- ══════════════════════════════════════════════════════════════════════════

    <<cc_alloc_loop>>
    FOR cc IN SELECT * FROM tmp_cc_cfg ORDER BY cc_code LOOP

        SELECT id INTO v_cc_code_id
        FROM master.company_code WHERE tenant_id = v_tid AND code = cc.cc_code;
        CONTINUE cc_alloc_loop WHEN v_cc_code_id IS NULL;

        -- C1: FY2025 Operating Allocations (status = closed)
        SELECT id INTO v_bp_id FROM master.budget_profile
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-BUDG-FY25-OP';

        IF v_bp_id IS NOT NULL THEN
            v_sort := 10;
            FOR sp IN SELECT * FROM tmp_alloc_split WHERE industry = cc.industry ORDER BY cc_suffix LOOP
                SELECT id INTO v_ctr_id FROM master.cost_center
                WHERE tenant_id = v_tid AND code = cc.cc_code || sp.cc_suffix;

                IF v_ctr_id IS NOT NULL THEN
                    INSERT INTO master.budget_allocation (
                        tenant_id, code, name,
                        budget_profile_id, company_code_id,
                        fiscal_year, currency_code, cost_center_id,
                        allocated_amount, reserved_amount, consumed_amount, released_amount,
                        overspend_policy, tolerance_pct, requires_approval,
                        is_carry_forward,
                        sort_order, tags, metadata,
                        status, status_changed_at, status_changed_by, created_by
                    ) VALUES (
                        v_tid,
                        'ALLOC-' || replace(sp.cc_suffix, '-CC-', ''),
                        sp.alloc_name,
                        v_bp_id, v_cc_code_id,
                        2025, cc.currency, v_ctr_id,
                        ROUND(cc.fy25_op * sp.pct, 2),
                        ROUND(cc.fy25_op * sp.pct * 0.02, 2),  -- 2 % residual reserve
                        ROUND(cc.fy25_op * sp.pct * 0.93, 2),  -- 93 % consumed at year-end
                        ROUND(cc.fy25_op * sp.pct * 0.02, 2),  -- 2 % released (savings returned)
                        'BLOCK', 2.00, true,
                        false,
                        v_sort,
                        jsonb_build_array('fy2025', cc.industry),
                        v_meta,
                        'closed', '2026-01-31 18:00:00+00', v_su, v_su
                    )
                    ON CONFLICT (tenant_id, budget_profile_id, code) DO UPDATE SET
                        allocated_amount  = EXCLUDED.allocated_amount,
                        consumed_amount   = EXCLUDED.consumed_amount,
                        reserved_amount   = EXCLUDED.reserved_amount,
                        released_amount   = EXCLUDED.released_amount,
                        status            = EXCLUDED.status,
                        status_changed_at = EXCLUDED.status_changed_at,
                        metadata          = master.budget_allocation.metadata || v_meta,
                        updated_at        = now(), updated_by = v_su
                    WHERE (master.budget_allocation.allocated_amount, master.budget_allocation.status)
                       IS DISTINCT FROM (EXCLUDED.allocated_amount, EXCLUDED.status);
                    v_sort := v_sort + 10;
                END IF;
            END LOOP;
        END IF;

        -- C2: FY2026 Operating Allocations (status = active)
        SELECT id INTO v_bp_id FROM master.budget_profile
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-BUDG-FY26-OP';

        IF v_bp_id IS NOT NULL THEN
            v_sort := 10;
            FOR sp IN SELECT * FROM tmp_alloc_split WHERE industry = cc.industry ORDER BY cc_suffix LOOP
                SELECT id INTO v_ctr_id FROM master.cost_center
                WHERE tenant_id = v_tid AND code = cc.cc_code || sp.cc_suffix;

                IF v_ctr_id IS NOT NULL THEN
                    INSERT INTO master.budget_allocation (
                        tenant_id, code, name,
                        budget_profile_id, company_code_id,
                        fiscal_year, currency_code, cost_center_id,
                        allocated_amount, reserved_amount, consumed_amount, released_amount,
                        overspend_policy, tolerance_pct, requires_approval,
                        is_carry_forward,
                        sort_order, tags, metadata,
                        status, status_changed_at, status_changed_by, created_by
                    ) VALUES (
                        v_tid,
                        'ALLOC-' || replace(sp.cc_suffix, '-CC-', ''),
                        sp.alloc_name,
                        v_bp_id, v_cc_code_id,
                        2026, cc.currency, v_ctr_id,
                        ROUND(cc.fy26_op * sp.pct, 2),
                        ROUND(cc.fy26_op * sp.pct * 0.10, 2),  -- 10 % reserved (open POs)
                        ROUND(cc.fy26_op * sp.pct * 0.38, 2),  -- 38 % consumed (Q1 + partial Q2)
                        0,
                        'BLOCK', 3.00, true,
                        false,
                        v_sort,
                        jsonb_build_array('fy2026', cc.industry),
                        v_meta,
                        'active', '2026-01-15 10:00:00+00', v_su, v_su
                    )
                    ON CONFLICT (tenant_id, budget_profile_id, code) DO UPDATE SET
                        allocated_amount  = EXCLUDED.allocated_amount,
                        consumed_amount   = EXCLUDED.consumed_amount,
                        reserved_amount   = EXCLUDED.reserved_amount,
                        released_amount   = EXCLUDED.released_amount,
                        status            = EXCLUDED.status,
                        status_changed_at = EXCLUDED.status_changed_at,
                        metadata          = master.budget_allocation.metadata || v_meta,
                        updated_at        = now(), updated_by = v_su
                    WHERE (master.budget_allocation.allocated_amount, master.budget_allocation.status)
                       IS DISTINCT FROM (EXCLUDED.allocated_amount, EXCLUDED.status);
                    v_sort := v_sort + 10;
                END IF;
            END LOOP;
        END IF;

    END LOOP cc_alloc_loop;

    -- ══════════════════════════════════════════════════════════════════════════
    -- SECTION D: BUDGET ALLOCATIONS — Capital (project + IT CC + ops CC)
    -- ══════════════════════════════════════════════════════════════════════════

    <<cc_cap_loop>>
    FOR cc IN SELECT * FROM tmp_cc_cfg WHERE cap_budget IS NOT NULL ORDER BY cc_code LOOP

        SELECT id INTO v_cc_code_id
        FROM master.company_code WHERE tenant_id = v_tid AND code = cc.cc_code;
        CONTINUE cc_cap_loop WHEN v_cc_code_id IS NULL;

        SELECT id INTO v_bp_id FROM master.budget_profile
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-BUDG-CAP-FY25';
        CONTINUE cc_cap_loop WHEN v_bp_id IS NULL;

        -- D1: Primary project allocation — 60 % of capital budget
        IF cc.cap_proj_code IS NOT NULL THEN
            SELECT id INTO v_proj_id FROM master.project
            WHERE tenant_id = v_tid AND code = cc.cap_proj_code;

            IF v_proj_id IS NOT NULL THEN
                INSERT INTO master.budget_allocation (
                    tenant_id, code, name,
                    budget_profile_id, company_code_id,
                    fiscal_year, currency_code, project_id,
                    allocated_amount, reserved_amount, consumed_amount, released_amount,
                    overspend_policy, tolerance_pct, requires_approval, approval_threshold,
                    is_carry_forward, sort_order, tags, metadata,
                    status, status_changed_at, status_changed_by, created_by
                ) VALUES (
                    v_tid,
                    'ALLOC-PROJ-MAIN',
                    'Primary Capital Project — Main Spend Envelope',
                    v_bp_id, v_cc_code_id,
                    2025, cc.currency, v_proj_id,
                    ROUND(cc.cap_budget * 0.60, 2),
                    ROUND(cc.cap_budget * 0.60 * 0.22, 2),  -- 22 % reserved (contract progress)
                    ROUND(cc.cap_budget * 0.60 * 0.48, 2),  -- 48 % consumed (certified spend)
                    0,
                    'ESCALATE', 5.00, true, ROUND(cc.cap_budget * 0.01, 2),
                    false, 10,
                    jsonb_build_array('capital', 'project', 'fy2025_2027'),
                    v_meta,
                    'active', '2025-02-15 10:00:00+00', v_su, v_su
                )
                ON CONFLICT (tenant_id, budget_profile_id, code) DO UPDATE SET
                    allocated_amount = EXCLUDED.allocated_amount,
                    consumed_amount  = EXCLUDED.consumed_amount,
                    reserved_amount  = EXCLUDED.reserved_amount,
                    metadata         = master.budget_allocation.metadata || v_meta,
                    updated_at       = now(), updated_by = v_su
                WHERE master.budget_allocation.allocated_amount IS DISTINCT FROM EXCLUDED.allocated_amount;
            END IF;
        END IF;

        -- D2: IT Infrastructure Capital — 20 % (software licences, hardware refresh)
        SELECT id INTO v_ctr_id FROM master.cost_center
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-CC-ADMIN-IT';

        IF v_ctr_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (
                tenant_id, code, name,
                budget_profile_id, company_code_id,
                fiscal_year, currency_code, cost_center_id,
                allocated_amount, reserved_amount, consumed_amount, released_amount,
                overspend_policy, tolerance_pct, requires_approval,
                is_carry_forward, sort_order, tags, metadata,
                status, status_changed_at, status_changed_by, created_by
            ) VALUES (
                v_tid,
                'ALLOC-IT-CAP',
                'IT Infrastructure Capital — Software, Hardware & Licences',
                v_bp_id, v_cc_code_id,
                2025, cc.currency, v_ctr_id,
                ROUND(cc.cap_budget * 0.20, 2),
                ROUND(cc.cap_budget * 0.20 * 0.30, 2),  -- 30 % reserved (ordered, not delivered)
                ROUND(cc.cap_budget * 0.20 * 0.40, 2),  -- 40 % consumed (delivered & commissioned)
                0,
                'ESCALATE', 3.00, true,
                false, 20,
                jsonb_build_array('capital', 'it', 'infrastructure'),
                v_meta,
                'active', '2025-02-15 10:00:00+00', v_su, v_su
            )
            ON CONFLICT (tenant_id, budget_profile_id, code) DO UPDATE SET
                allocated_amount = EXCLUDED.allocated_amount,
                consumed_amount  = EXCLUDED.consumed_amount,
                reserved_amount  = EXCLUDED.reserved_amount,
                metadata         = master.budget_allocation.metadata || v_meta,
                updated_at       = now(), updated_by = v_su
            WHERE master.budget_allocation.allocated_amount IS DISTINCT FROM EXCLUDED.allocated_amount;
        END IF;

        -- D3: Operational Capital — 20 % (equipment, machinery, vehicles)
        SELECT id INTO v_ctr_id FROM master.cost_center
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-CC-OPS-GEN';

        IF v_ctr_id IS NOT NULL THEN
            INSERT INTO master.budget_allocation (
                tenant_id, code, name,
                budget_profile_id, company_code_id,
                fiscal_year, currency_code, cost_center_id,
                allocated_amount, reserved_amount, consumed_amount, released_amount,
                overspend_policy, tolerance_pct, requires_approval,
                is_carry_forward, sort_order, tags, metadata,
                status, status_changed_at, status_changed_by, created_by
            ) VALUES (
                v_tid,
                'ALLOC-OPS-CAP',
                'Operational Capital — Equipment, Machinery & Vehicles',
                v_bp_id, v_cc_code_id,
                2025, cc.currency, v_ctr_id,
                ROUND(cc.cap_budget * 0.20, 2),
                ROUND(cc.cap_budget * 0.20 * 0.28, 2),  -- 28 % reserved (equipment ordered)
                ROUND(cc.cap_budget * 0.20 * 0.44, 2),  -- 44 % consumed (assets commissioned)
                0,
                'ESCALATE', 3.00, true,
                false, 30,
                jsonb_build_array('capital', 'operations', 'equipment'),
                v_meta,
                'active', '2025-02-15 10:00:00+00', v_su, v_su
            )
            ON CONFLICT (tenant_id, budget_profile_id, code) DO UPDATE SET
                allocated_amount = EXCLUDED.allocated_amount,
                consumed_amount  = EXCLUDED.consumed_amount,
                reserved_amount  = EXCLUDED.reserved_amount,
                metadata         = master.budget_allocation.metadata || v_meta,
                updated_at       = now(), updated_by = v_su
            WHERE master.budget_allocation.allocated_amount IS DISTINCT FROM EXCLUDED.allocated_amount;
        END IF;

    END LOOP cc_cap_loop;

    -- ══════════════════════════════════════════════════════════════════════════
    -- SECTION E: BUDGET ALLOCATIONS — Contingency Reserves
    -- ══════════════════════════════════════════════════════════════════════════

    <<cc_cont_loop>>
    FOR cc IN SELECT * FROM tmp_cc_cfg WHERE contingency IS NOT NULL ORDER BY cc_code LOOP

        SELECT id INTO v_cc_code_id
        FROM master.company_code WHERE tenant_id = v_tid AND code = cc.cc_code;
        CONTINUE cc_cont_loop WHEN v_cc_code_id IS NULL;

        SELECT id INTO v_bp_id FROM master.budget_profile
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-BUDG-FY26-CONT';
        CONTINUE cc_cont_loop WHEN v_bp_id IS NULL;

        SELECT id INTO v_ctr_id FROM master.cost_center
        WHERE tenant_id = v_tid AND code = cc.cc_code || '-CC-OPS-GEN';
        CONTINUE cc_cont_loop WHEN v_ctr_id IS NULL;

        INSERT INTO master.budget_allocation (
            tenant_id, code, name,
            budget_profile_id, company_code_id,
            fiscal_year, currency_code, cost_center_id,
            allocated_amount, reserved_amount, consumed_amount, released_amount,
            overspend_policy, tolerance_pct, requires_approval,
            is_carry_forward, sort_order, tags, metadata,
            status, status_changed_at, status_changed_by, created_by
        ) VALUES (
            v_tid,
            'ALLOC-CONT-RESERVE',
            'Contingency Reserve — Unallocated Pool',
            v_bp_id, v_cc_code_id,
            2026, cc.currency, v_ctr_id,
            cc.contingency,
            0,
            ROUND(cc.contingency * 0.15, 2),  -- 15 % drawn (one approved incident)
            0,
            'WARN', 0.00, true,
            false, 10,
            jsonb_build_array('fy2026', 'contingency', 'reserve'),
            v_meta,
            'active', '2026-01-15 11:00:00+00', v_su, v_su
        )
        ON CONFLICT (tenant_id, budget_profile_id, code) DO UPDATE SET
            allocated_amount = EXCLUDED.allocated_amount,
            consumed_amount  = EXCLUDED.consumed_amount,
            reserved_amount  = EXCLUDED.reserved_amount,
            metadata         = master.budget_allocation.metadata || v_meta,
            updated_at       = now(), updated_by = v_su
        WHERE master.budget_allocation.allocated_amount IS DISTINCT FROM EXCLUDED.allocated_amount;

    END LOOP cc_cont_loop;

    -- ══════════════════════════════════════════════════════════════════════════
    -- SECTION F: Special Allocations — Revolving (AUET) + Grant (AQTU)
    -- ══════════════════════════════════════════════════════════════════════════

    -- F1: AUET Revolving Trade Facility — Procurement CC
    SELECT id INTO v_cc_code_id FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUET';
    SELECT id INTO v_bp_id       FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'AUET-BUDG-FY26-REV';
    SELECT id INTO v_ctr_id      FROM master.cost_center    WHERE tenant_id = v_tid AND code = 'AUET-CC-SUPPORT-PROC';

    IF v_cc_code_id IS NOT NULL AND v_bp_id IS NOT NULL AND v_ctr_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (
            tenant_id, code, name,
            budget_profile_id, company_code_id,
            fiscal_year, currency_code, cost_center_id,
            allocated_amount, reserved_amount, consumed_amount, released_amount,
            overspend_policy, tolerance_pct, requires_approval,
            is_carry_forward, sort_order, tags, metadata,
            status, status_changed_at, status_changed_by, created_by
        ) VALUES (
            v_tid,
            'ALLOC-PROC-REV',
            'Import Letters of Credit & Supplier Advance Facility',
            v_bp_id, v_cc_code_id,
            2026, 'AED', v_ctr_id,
            20000000.00,
            7000000.00,   -- 35 % reserved (open LC commitments)
            11000000.00,  -- 55 % settled and consumed this cycle
            3000000.00,   -- 15 % released back from cancelled LCs
            'ALLOW', 5.00, false,
            false, 10,
            jsonb_build_array('fy2026', 'revolving', 'import_lc', 'trading'),
            v_meta,
            'active', '2026-01-15 11:30:00+00', v_su, v_su
        )
        ON CONFLICT (tenant_id, budget_profile_id, code) DO NOTHING;
    END IF;

    -- F2: AQTU QNV2030 Grant — Desalination Project
    SELECT id INTO v_cc_code_id FROM master.company_code WHERE tenant_id = v_tid AND code = 'AQTU';
    SELECT id INTO v_bp_id       FROM master.budget_profile WHERE tenant_id = v_tid AND code = 'AQTU-BUDG-GRT-QNV';
    SELECT id INTO v_proj_id     FROM master.project         WHERE tenant_id = v_tid AND code = 'AQTU-P001';

    IF v_cc_code_id IS NOT NULL AND v_bp_id IS NOT NULL AND v_proj_id IS NOT NULL THEN
        INSERT INTO master.budget_allocation (
            tenant_id, code, name,
            budget_profile_id, company_code_id,
            fiscal_year, currency_code, project_id,
            allocated_amount, reserved_amount, consumed_amount, released_amount,
            overspend_policy, tolerance_pct, requires_approval,
            is_carry_forward, sort_order, tags, metadata,
            status, status_changed_at, status_changed_by, created_by
        ) VALUES (
            v_tid,
            'ALLOC-GRT-DESAL',
            'Desalination Capacity Expansion — QNV2030 Grant Funded Works',
            v_bp_id, v_cc_code_id,
            2024, 'QAR', v_proj_id,
            45000000.00,
            4500000.00,   -- 10 % reserved (next milestone tranche held)
            32400000.00,  -- 72 % certified and consumed against grant drawdowns
            0,
            'BLOCK', 0.00, true,
            false, 10,
            jsonb_build_array('grant', 'infrastructure', 'desalination', 'qnv2030'),
            v_meta,
            'active', '2024-07-01 08:00:00+00', v_su, v_su
        )
        ON CONFLICT (tenant_id, budget_profile_id, code) DO NOTHING;
    END IF;

    RAISE NOTICE '[510] budget_allocation rows seeded';
    RAISE NOTICE '[510_budget_planning] complete — athyper/demo tenant (17 companies)';

END $demo_budget$;
