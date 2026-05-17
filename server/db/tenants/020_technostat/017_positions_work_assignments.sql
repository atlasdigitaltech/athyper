-- ============================================================================
-- TECHNOSTAT — POSITIONS & WORK ASSIGNMENTS
-- ============================================================================
-- File:     017_positions_work_assignments.sql
-- Schemas:  master.position, master.work_assignment
-- Purpose:  Create positions (with reporting hierarchy) and primary work
--           assignments for all 12 Technostat employees across TKSA, SSK,
--           TEGY and SDTX company codes.
-- Depends:  016_technostat_people.sql
--             → employees: EMP-tksa.owner … EMP-nour.eldin (E-TK-0001…E-TK-0012)
--           020_universal/060_org_structure/300_org_units.sql
--             → {CC}-ORG, {CC}-ORG-ADMIN, -FIN, -COMM, -OPS, -SUPPORT
--           020_universal/060_org_structure/301_cost_centers.sql
--             → {CC}-CC-ADMIN-FIN, -ADMIN-IT, -OPS-GEN, -SUPPORT-PROC
-- Group structure:
--   TKSA (HQ, SA)  → SSK (SA subsidiary) + TEGY (EG subsidiary)
--   TEGY → SDTX (EG digital subsidiary)
-- Idempotent: Yes — ON CONFLICT DO UPDATE throughout
-- ============================================================================

DO $tksa_org$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;

    -- company code ids
    v_cc_tksa  uuid;  v_cc_ssk  uuid;
    v_cc_tegy  uuid;  v_cc_sdtx uuid;

    -- org unit ids
    v_ou_tksa_root  uuid;  v_ou_tksa_admin uuid;  v_ou_tksa_fin  uuid;
    v_ou_ssk_root   uuid;  v_ou_ssk_ops    uuid;  v_ou_ssk_supp  uuid;
    v_ou_tegy_root  uuid;  v_ou_tegy_fin   uuid;  v_ou_tegy_ops  uuid;
    v_ou_sdtx_root  uuid;  v_ou_sdtx_admin uuid;  v_ou_sdtx_ops  uuid;

    -- cost center ids
    v_cct_tksa_admin  uuid;  v_cct_tksa_fin  uuid;  v_cct_tksa_it   uuid;
    v_cct_ssk_ops     uuid;  v_cct_ssk_proc  uuid;
    v_cct_tegy_admin  uuid;  v_cct_tegy_fin  uuid;  v_cct_tegy_ops  uuid;
    v_cct_sdtx_admin  uuid;  v_cct_sdtx_it   uuid;  v_cct_sdtx_ops  uuid;

    -- position ids for hierarchy
    v_pos_tksa_ceo   uuid;
    v_pos_ssk_ops    uuid;
    v_pos_tegy_cntry uuid;
    v_pos_sdtx_it    uuid;

BEGIN
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[017_positions_work_assignments] Technostat tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ── company codes ──────────────────────────────────────────────────────────
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    -- ── org units ──────────────────────────────────────────────────────────────
    SELECT id INTO v_ou_tksa_root  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'TKSA-ORG';
    SELECT id INTO v_ou_tksa_admin FROM master.org_unit WHERE tenant_id = v_tid AND code = 'TKSA-ORG-ADMIN';
    SELECT id INTO v_ou_tksa_fin   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'TKSA-ORG-FIN';

    SELECT id INTO v_ou_ssk_root  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'SSK-ORG';
    SELECT id INTO v_ou_ssk_ops   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'SSK-ORG-OPS';
    SELECT id INTO v_ou_ssk_supp  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'SSK-ORG-SUPPORT';

    SELECT id INTO v_ou_tegy_root FROM master.org_unit WHERE tenant_id = v_tid AND code = 'TEGY-ORG';
    SELECT id INTO v_ou_tegy_fin  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'TEGY-ORG-FIN';
    SELECT id INTO v_ou_tegy_ops  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'TEGY-ORG-OPS';

    SELECT id INTO v_ou_sdtx_root  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'SDTX-ORG';
    SELECT id INTO v_ou_sdtx_admin FROM master.org_unit WHERE tenant_id = v_tid AND code = 'SDTX-ORG-ADMIN';
    SELECT id INTO v_ou_sdtx_ops   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'SDTX-ORG-OPS';

    -- ── cost centers ───────────────────────────────────────────────────────────
    SELECT id INTO v_cct_tksa_admin FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN';
    SELECT id INTO v_cct_tksa_fin   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-FIN';
    SELECT id INTO v_cct_tksa_it    FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TKSA-CC-ADMIN-IT';

    SELECT id INTO v_cct_ssk_ops  FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-OPS-GEN';
    SELECT id INTO v_cct_ssk_proc FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SSK-CC-SUPPORT-PROC';

    SELECT id INTO v_cct_tegy_admin FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-ADMIN';
    SELECT id INTO v_cct_tegy_fin   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-ADMIN-FIN';
    SELECT id INTO v_cct_tegy_ops   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'TEGY-CC-OPS-GEN';

    SELECT id INTO v_cct_sdtx_admin FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN';
    SELECT id INTO v_cct_sdtx_it    FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-ADMIN-IT';
    SELECT id INTO v_cct_sdtx_ops   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'SDTX-CC-OPS-GEN';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: Positions  (level-by-level to respect FK hierarchy)
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── TKSA L1: Group CEO ────────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'TKSA-POS-GRP-CEO', 'Group Chief Executive',
        v_cc_tksa, v_ou_tksa_root, v_cct_tksa_admin,
        'regular', 1.0, '2000-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    SELECT id INTO v_pos_tksa_ceo FROM master.position WHERE tenant_id = v_tid AND code = 'TKSA-POS-GRP-CEO';

    -- ── TKSA L2: IT Manager + Finance Director ────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'TKSA-POS-IT-MGR',  'Group IT Manager',
         v_cc_tksa, v_ou_tksa_admin, v_cct_tksa_it,  'regular', v_pos_tksa_ceo, 1.0, '2010-01-01', 'active', v_su),
        (v_tid, 'TKSA-POS-FIN-DIR', 'Finance Director',
         v_cc_tksa, v_ou_tksa_fin,   v_cct_tksa_fin, 'regular', v_pos_tksa_ceo, 1.0, '2005-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    -- ── SSK L1: Operations Manager ────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'SSK-POS-OPS-MGR', 'Operations Manager',
        v_cc_ssk, v_ou_ssk_root, v_cct_ssk_ops,
        'regular', 1.0, '2017-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    SELECT id INTO v_pos_ssk_ops FROM master.position WHERE tenant_id = v_tid AND code = 'SSK-POS-OPS-MGR';

    -- ── SSK L2: Project Manager + Procurement Manager ─────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'SSK-POS-PROJ-MGR', 'Project Manager',
         v_cc_ssk, v_ou_ssk_ops,  v_cct_ssk_ops,  'regular', v_pos_ssk_ops, 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'SSK-POS-PROC-MGR', 'Procurement Manager',
         v_cc_ssk, v_ou_ssk_supp, v_cct_ssk_proc, 'regular', v_pos_ssk_ops, 1.0, '2020-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    -- ── TEGY L1: Country Manager ──────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'TEGY-POS-COUNTRY-MGR', 'Country Manager',
        v_cc_tegy, v_ou_tegy_root, v_cct_tegy_admin,
        'regular', 1.0, '2018-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    SELECT id INTO v_pos_tegy_cntry FROM master.position WHERE tenant_id = v_tid AND code = 'TEGY-POS-COUNTRY-MGR';

    -- ── TEGY L2: Finance Manager + Operations Lead ────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'TEGY-POS-FIN-MGR',  'Finance Manager',
         v_cc_tegy, v_ou_tegy_fin, v_cct_tegy_fin, 'regular', v_pos_tegy_cntry, 1.0, '2020-01-01', 'active', v_su),
        (v_tid, 'TEGY-POS-OPS-LEAD', 'Operations Lead',
         v_cc_tegy, v_ou_tegy_ops, v_cct_tegy_ops, 'regular', v_pos_tegy_cntry, 1.0, '2021-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    -- ── SDTX L1: IT Director ─────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'SDTX-POS-IT-DIR', 'IT Director',
        v_cc_sdtx, v_ou_sdtx_root, v_cct_sdtx_admin,
        'regular', 1.0, '2022-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    SELECT id INTO v_pos_sdtx_it FROM master.position WHERE tenant_id = v_tid AND code = 'SDTX-POS-IT-DIR';

    -- ── SDTX L2: Senior Software Engineer + Digital Transformation Lead ───────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'SDTX-POS-SR-SW-ENG', 'Senior Software Engineer',
         v_cc_sdtx, v_ou_sdtx_ops, v_cct_sdtx_ops, 'regular', v_pos_sdtx_it, 1.0, '2022-01-01', 'active', v_su),
        (v_tid, 'SDTX-POS-DT-LEAD',   'Digital Transformation Lead',
         v_cc_sdtx, v_ou_sdtx_ops, v_cct_sdtx_ops, 'regular', v_pos_sdtx_it, 1.0, '2022-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: Work assignments — one primary active assignment per employee
    -- Code pattern: WA-{employee_number}  e.g. WA-E-TK-0001
    -- Manager note: cross-company managers are allowed (same tenant FK)
    --   SSK/TEGY heads report to TKSA CEO; SDTX head reports to TEGY Country Mgr
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
        ('EMP-tksa.owner',       'TKSA-POS-GRP-CEO',       NULL),
        ('EMP-tksa.admin',       'TKSA-POS-IT-MGR',        'EMP-tksa.owner'),
        ('EMP-nasser.alghamdi',  'TKSA-POS-FIN-DIR',       'EMP-tksa.owner'),
        ('EMP-ssk.admin',        'SSK-POS-OPS-MGR',        'EMP-tksa.owner'),
        ('EMP-fatimah.alzahrani','SSK-POS-PROJ-MGR',       'EMP-ssk.admin'),
        ('EMP-khalid.alotaibi',  'SSK-POS-PROC-MGR',       'EMP-ssk.admin'),
        ('EMP-tegy.admin',       'TEGY-POS-COUNTRY-MGR',   'EMP-tksa.owner'),
        ('EMP-sara.mahmoud',     'TEGY-POS-FIN-MGR',       'EMP-tegy.admin'),
        ('EMP-mohd.nour',        'TEGY-POS-OPS-LEAD',      'EMP-tegy.admin'),
        ('EMP-sdtx.admin',       'SDTX-POS-IT-DIR',        'EMP-tegy.admin'),
        ('EMP-youssef.ibrahim',  'SDTX-POS-SR-SW-ENG',     'EMP-sdtx.admin'),
        ('EMP-nour.eldin',       'SDTX-POS-DT-LEAD',       'EMP-sdtx.admin')
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

    RAISE NOTICE '[017_positions_work_assignments] Technostat: 12 positions + 12 work assignments seeded';

END $tksa_org$;
