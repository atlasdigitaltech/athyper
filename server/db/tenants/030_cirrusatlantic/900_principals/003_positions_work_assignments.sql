-- ============================================================================
-- CIRRUSATLANTIC — POSITIONS & WORK ASSIGNMENTS
-- ============================================================================
-- File:     900_principals/003_positions_work_assignments.sql
-- Schemas:  master.position, master.work_assignment
-- Purpose:  Create positions (with reporting hierarchy) and primary work
--           assignments for all 8 CirrusAtlantic employees (CATL company).
-- Depends:  002_people.sql
--             → employees: EMP-catl.owner … EMP-diana.thorpe (E-CA-0001…E-CA-0008)
--           020_universal/060_org_structure/300_org_units.sql
--             → CATL-ORG, CATL-ORG-ADMIN, -FIN, -COMM, -OPS, -SUPPORT
--           020_universal/060_org_structure/301_cost_centers.sql
--             → CATL-CC-ADMIN-FIN, -ADMIN-IT, -ADMIN-HR, -OPS-GEN
-- Hierarchy:
--   CATL-POS-CEO
--   ├── CATL-POS-IT-ADMIN
--   │   ├── CATL-POS-SR-DEV
--   │   └── CATL-POS-CLOUD-ARCH
--   ├── CATL-POS-FIN-DIR
--   ├── CATL-POS-PROJ-MGR
--   │   └── CATL-POS-BIZ-ANALYST
--   └── CATL-POS-HR-MGR
-- Idempotent: Yes — ON CONFLICT DO UPDATE throughout
-- ============================================================================

DO $catl_org$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;

    -- company code id
    v_cc_catl  uuid;

    -- org unit ids
    v_ou_catl_root   uuid;  v_ou_catl_admin  uuid;
    v_ou_catl_fin    uuid;  v_ou_catl_ops    uuid;

    -- cost center ids
    v_cct_catl_admin  uuid;  -- CATL-CC-ADMIN  (header for exec layer)
    v_cct_catl_fin    uuid;  -- CATL-CC-ADMIN-FIN
    v_cct_catl_it     uuid;  -- CATL-CC-ADMIN-IT
    v_cct_catl_hr     uuid;  -- CATL-CC-ADMIN-HR
    v_cct_catl_ops    uuid;  -- CATL-CC-OPS-GEN

    -- position ids for hierarchy
    v_pos_ceo       uuid;
    v_pos_it_admin  uuid;
    v_pos_proj_mgr  uuid;

BEGIN
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[003_positions_work_assignments] CirrusAtlantic tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ── company code ───────────────────────────────────────────────────────────
    SELECT id INTO v_cc_catl FROM master.company_code WHERE tenant_id = v_tid AND code = 'CATL';

    -- ── org units ──────────────────────────────────────────────────────────────
    SELECT id INTO v_ou_catl_root  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'CATL-ORG';
    SELECT id INTO v_ou_catl_admin FROM master.org_unit WHERE tenant_id = v_tid AND code = 'CATL-ORG-ADMIN';
    SELECT id INTO v_ou_catl_fin   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'CATL-ORG-FIN';
    SELECT id INTO v_ou_catl_ops   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'CATL-ORG-OPS';

    -- ── cost centers ───────────────────────────────────────────────────────────
    SELECT id INTO v_cct_catl_admin FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN';
    SELECT id INTO v_cct_catl_fin   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-FIN';
    SELECT id INTO v_cct_catl_it    FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-IT';
    SELECT id INTO v_cct_catl_hr    FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-ADMIN-HR';
    SELECT id INTO v_cct_catl_ops   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CATL-CC-OPS-GEN';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: Positions  (level-by-level to respect FK hierarchy)
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── L1: CEO ───────────────────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'CATL-POS-CEO', 'Chief Executive Officer',
        v_cc_catl, v_ou_catl_root, v_cct_catl_admin,
        'regular', 1.0, '2015-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    SELECT id INTO v_pos_ceo FROM master.position WHERE tenant_id = v_tid AND code = 'CATL-POS-CEO';

    -- ── L2: Direct reports to CEO ─────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'CATL-POS-IT-ADMIN', 'IT Systems Administrator',
         v_cc_catl, v_ou_catl_admin, v_cct_catl_it, 'regular', v_pos_ceo, 1.0, '2018-01-01', 'active', v_su),
        (v_tid, 'CATL-POS-FIN-DIR',  'Finance Director',
         v_cc_catl, v_ou_catl_fin,   v_cct_catl_fin, 'regular', v_pos_ceo, 1.0, '2016-01-01', 'active', v_su),
        (v_tid, 'CATL-POS-PROJ-MGR', 'Project Manager',
         v_cc_catl, v_ou_catl_ops,   v_cct_catl_ops, 'regular', v_pos_ceo, 1.0, '2020-01-01', 'active', v_su),
        (v_tid, 'CATL-POS-HR-MGR',   'HR Manager',
         v_cc_catl, v_ou_catl_admin, v_cct_catl_hr,  'regular', v_pos_ceo, 1.0, '2021-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    SELECT id INTO v_pos_it_admin FROM master.position WHERE tenant_id = v_tid AND code = 'CATL-POS-IT-ADMIN';
    SELECT id INTO v_pos_proj_mgr FROM master.position WHERE tenant_id = v_tid AND code = 'CATL-POS-PROJ-MGR';

    -- ── L3: Under IT-ADMIN and PROJ-MGR ───────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'CATL-POS-SR-DEV',     'Senior Software Developer',
         v_cc_catl, v_ou_catl_ops, v_cct_catl_ops, 'regular', v_pos_it_admin, 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'CATL-POS-CLOUD-ARCH', 'Cloud Architect',
         v_cc_catl, v_ou_catl_ops, v_cct_catl_it,  'regular', v_pos_it_admin, 1.0, '2021-01-01', 'active', v_su),
        (v_tid, 'CATL-POS-BIZ-ANALYST','Business Analyst',
         v_cc_catl, v_ou_catl_ops, v_cct_catl_ops, 'regular', v_pos_proj_mgr, 1.0, '2022-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: Work assignments — one primary active assignment per employee
    -- Code pattern: WA-{employee_number}  e.g. WA-E-CA-0001
    -- ══════════════════════════════════════════════════════════════════════════
    INSERT INTO master.work_assignment (
        tenant_id, code, name,
        employee_id, employment_id,
        position_id, org_unit_id, cost_center_id,
        company_code_id, manager_employee_id,
        assignment_type, fte, effective_from, status, created_by
    )
    SELECT
        v_tid,
        'WA-' || e.employee_number,
        e.display_name || ' — Primary Assignment',
        e.id,
        (SELECT em.id FROM master.employment em
         WHERE em.tenant_id = v_tid AND em.employee_id = e.id AND em.status = 'active'
         LIMIT 1),
        pos.id,
        pos.org_unit_id,
        pos.cost_center_id,
        e.company_code_id,
        mgr.id,
        'primary', 1.0,
        e.hire_date,
        'active', v_su
    FROM (VALUES
        -- emp_code                pos_code                  mgr_code
        ('EMP-catl.owner',      'CATL-POS-CEO',           NULL),
        ('EMP-catl.admin',      'CATL-POS-IT-ADMIN',      'EMP-catl.owner'),
        ('EMP-catl.finance',    'CATL-POS-FIN-DIR',       'EMP-catl.owner'),
        ('EMP-oliver.blackwood','CATL-POS-PROJ-MGR',      'EMP-catl.owner'),
        ('EMP-sophie.chambers', 'CATL-POS-HR-MGR',        'EMP-catl.owner'),
        ('EMP-emma.hartley',    'CATL-POS-SR-DEV',        'EMP-catl.admin'),
        ('EMP-lucas.pembrook',  'CATL-POS-CLOUD-ARCH',    'EMP-catl.admin'),
        ('EMP-diana.thorpe',    'CATL-POS-BIZ-ANALYST',   'EMP-oliver.blackwood')
    ) AS t(emp_code, pos_code, mgr_code)
    JOIN  master.employee e   ON e.tenant_id   = v_tid AND e.code   = t.emp_code
    JOIN  master.position pos ON pos.tenant_id = v_tid AND pos.code = t.pos_code
    LEFT JOIN master.employee mgr ON mgr.tenant_id = v_tid AND mgr.code = t.mgr_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        position_id         = EXCLUDED.position_id,
        org_unit_id         = EXCLUDED.org_unit_id,
        cost_center_id      = EXCLUDED.cost_center_id,
        manager_employee_id = EXCLUDED.manager_employee_id,
        employment_id       = EXCLUDED.employment_id,
        updated_at          = now(),
        updated_by          = v_su;

    RAISE NOTICE '[003_positions_work_assignments] CirrusAtlantic: 8 positions + 8 work assignments seeded';

END $catl_org$;
