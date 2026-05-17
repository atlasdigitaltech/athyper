-- ============================================================================
-- DEMO — POSITIONS & WORK ASSIGNMENTS
-- ============================================================================
-- File:     900_principals/008_positions_work_assignments.sql
-- Schemas:  master.position, master.work_assignment
-- Purpose:  Create positions (with reporting hierarchy) and primary work
--           assignments for all 21 demo principals across ATHQ, AQTU, ASAC,
--           AUIC and ASGF company codes.
-- Depends:  007_principal_people.sql
--             → employees with codes EMP-{p_code}, employee_number E-0001…E-0021
--           020_universal/060_org_structure/300_org_units.sql
--             → org_units: {CC}-ORG, {CC}-ORG-ADMIN, -FIN, -COMM, -OPS, -SUPPORT
--           020_universal/060_org_structure/301_cost_centers.sql
--             → cost_centers: {CC}-CC-ADMIN-FIN, -ADMIN-IT, -ADMIN-HR,
--                             -SUPPORT-PROC, -COMM-SALES, -COMM-MKTG, -OPS-GEN
-- Idempotent: Yes — ON CONFLICT DO UPDATE throughout
-- ============================================================================

DO $demo_org$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;

    -- company code ids
    v_cc_athq  uuid;  v_cc_aqtu  uuid;  v_cc_asac  uuid;
    v_cc_auic  uuid;  v_cc_asgf  uuid;

    -- org unit ids — ATHQ
    v_ou_athq_root   uuid;  v_ou_athq_admin  uuid;  v_ou_athq_fin    uuid;
    v_ou_athq_comm   uuid;  v_ou_athq_ops    uuid;  v_ou_athq_supp   uuid;

    -- org unit ids — subsidiaries
    v_ou_aqtu_ops  uuid;  v_ou_asac_ops  uuid;
    v_ou_auic_ops  uuid;  v_ou_asgf_fin  uuid;

    -- cost center ids — ATHQ posting nodes
    v_cct_athq_admin  uuid;  -- ATHQ-CC-ADMIN  (header used for exec layer)
    v_cct_athq_fin    uuid;  -- ATHQ-CC-ADMIN-FIN
    v_cct_athq_it     uuid;  -- ATHQ-CC-ADMIN-IT
    v_cct_athq_proc   uuid;  -- ATHQ-CC-SUPPORT-PROC
    v_cct_athq_sales  uuid;  -- ATHQ-CC-COMM-SALES
    v_cct_athq_mktg   uuid;  -- ATHQ-CC-COMM-MKTG
    v_cct_athq_ops    uuid;  -- ATHQ-CC-OPS-GEN

    -- cost center ids — subsidiaries
    v_cct_aqtu_ops  uuid;  v_cct_asac_ops  uuid;
    v_cct_auic_ops  uuid;  v_cct_asgf_fin  uuid;

    -- position ids needed for hierarchy wiring
    v_pos_grp_dir     uuid;  v_pos_cfo         uuid;
    v_pos_fin_ctrl    uuid;  v_pos_fin_mgr     uuid;
    v_pos_ops_mgr     uuid;  v_pos_sr_proc     uuid;
    v_pos_partner_dir uuid;  v_pos_partner_mgr uuid;

BEGIN
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[008_positions_work_assignments] Athyper demo tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ── company codes ──────────────────────────────────────────────────────────
    SELECT id INTO v_cc_athq FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ';
    SELECT id INTO v_cc_aqtu FROM master.company_code WHERE tenant_id = v_tid AND code = 'AQTU';
    SELECT id INTO v_cc_asac FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASAC';
    SELECT id INTO v_cc_auic FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUIC';
    SELECT id INTO v_cc_asgf FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASGF';

    -- ── org units ──────────────────────────────────────────────────────────────
    SELECT id INTO v_ou_athq_root  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ATHQ-ORG';
    SELECT id INTO v_ou_athq_admin FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ATHQ-ORG-ADMIN';
    SELECT id INTO v_ou_athq_fin   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ATHQ-ORG-FIN';
    SELECT id INTO v_ou_athq_comm  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ATHQ-ORG-COMM';
    SELECT id INTO v_ou_athq_ops   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ATHQ-ORG-OPS';
    SELECT id INTO v_ou_athq_supp  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ATHQ-ORG-SUPPORT';

    SELECT id INTO v_ou_aqtu_ops FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AQTU-ORG-OPS';
    SELECT id INTO v_ou_asac_ops FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ASAC-ORG-OPS';
    SELECT id INTO v_ou_auic_ops FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AUIC-ORG-OPS';
    SELECT id INTO v_ou_asgf_fin FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ASGF-ORG-FIN';

    -- ── cost centers ───────────────────────────────────────────────────────────
    SELECT id INTO v_cct_athq_admin FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-ADMIN';
    SELECT id INTO v_cct_athq_fin   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-ADMIN-FIN';
    SELECT id INTO v_cct_athq_it    FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-ADMIN-IT';
    SELECT id INTO v_cct_athq_proc  FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-SUPPORT-PROC';
    SELECT id INTO v_cct_athq_sales FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-COMM-SALES';
    SELECT id INTO v_cct_athq_mktg  FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-COMM-MKTG';
    SELECT id INTO v_cct_athq_ops   FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ATHQ-CC-OPS-GEN';

    SELECT id INTO v_cct_aqtu_ops FROM master.cost_center WHERE tenant_id = v_tid AND code = 'AQTU-CC-OPS-GEN';
    SELECT id INTO v_cct_asac_ops FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ASAC-CC-OPS-GEN';
    SELECT id INTO v_cct_auic_ops FROM master.cost_center WHERE tenant_id = v_tid AND code = 'AUIC-CC-OPS-GEN';
    SELECT id INTO v_cct_asgf_fin FROM master.cost_center WHERE tenant_id = v_tid AND code = 'ASGF-CC-ADMIN-FIN';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: Positions  (insert level-by-level to satisfy FK hierarchy)
    -- ══════════════════════════════════════════════════════════════════════════

    -- ── L1: ATHQ root ─────────────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'ATHQ-POS-GRP-DIR', 'Group Director',
        v_cc_athq, v_ou_athq_root, v_cct_athq_admin,
        'regular', 1.0, '2018-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    SELECT id INTO v_pos_grp_dir FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-GRP-DIR';

    -- ── L2: ATHQ direct reports to Group Director ─────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'ATHQ-POS-CFO',          'Chief Financial Officer',
         v_cc_athq, v_ou_athq_fin,   v_cct_athq_fin,   'regular', v_pos_grp_dir, 1.0, '2017-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-OPS-MGR',      'Group Operations Manager',
         v_cc_athq, v_ou_athq_ops,   v_cct_athq_ops,   'regular', v_pos_grp_dir, 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-PARTNER-DIR',  'Partner Director',
         v_cc_athq, v_ou_athq_comm,  v_cct_athq_mktg,  'regular', v_pos_grp_dir, 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-SYS-ADMIN',    'System Administrator',
         v_cc_athq, v_ou_athq_admin, v_cct_athq_it,    'regular', v_pos_grp_dir, 1.0, '2020-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    SELECT id INTO v_pos_cfo         FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-CFO';
    SELECT id INTO v_pos_ops_mgr     FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-OPS-MGR';
    SELECT id INTO v_pos_partner_dir FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-PARTNER-DIR';

    -- ── L3: Under CFO ─────────────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'ATHQ-POS-FIN-CTRL',     'Financial Controller',
         v_cc_athq, v_ou_athq_fin, v_cct_athq_fin, 'regular', v_pos_cfo, 1.0, '2022-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-FIN-MGR',      'Finance Manager',
         v_cc_athq, v_ou_athq_fin, v_cct_athq_fin, 'regular', v_pos_cfo, 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-FIN-ANALYST',  'Finance Analyst',
         v_cc_athq, v_ou_athq_fin, v_cct_athq_fin, 'regular', v_pos_cfo, 1.0, '2022-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    SELECT id INTO v_pos_fin_ctrl FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-FIN-CTRL';
    SELECT id INTO v_pos_fin_mgr  FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-FIN-MGR';

    -- ── L3: Under OPS-MGR ─────────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'ATHQ-POS-SR-MGR',           'Senior Manager',
         v_cc_athq, v_ou_athq_ops,  v_cct_athq_ops,  'regular', v_pos_ops_mgr, 1.0, '2020-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-SR-PROC-OFFICER',  'Senior Procurement Officer',
         v_cc_athq, v_ou_athq_supp, v_cct_athq_proc, 'regular', v_pos_ops_mgr, 1.0, '2021-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-BIZ-ANALYST',      'Business Analyst',
         v_cc_athq, v_ou_athq_ops,  v_cct_athq_ops,  'regular', v_pos_ops_mgr, 1.0, '2023-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    SELECT id INTO v_pos_sr_proc FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-SR-PROC-OFFICER';

    -- ── L3: Under PARTNER-DIR ─────────────────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES (
        v_tid, 'ATHQ-POS-PARTNER-MGR', 'Partner Manager',
        v_cc_athq, v_ou_athq_comm, v_cct_athq_mktg, 'regular', v_pos_partner_dir,
        1.0, '2020-01-01', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    SELECT id INTO v_pos_partner_mgr FROM master.position WHERE tenant_id = v_tid AND code = 'ATHQ-POS-PARTNER-MGR';

    -- ── L4: Under FIN-CTRL / FIN-MGR / SR-PROC-OFFICER / PARTNER-MGR ─────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, reports_to_position_id,
        headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'ATHQ-POS-TREASURY-ANALYST', 'Treasury Analyst',
         v_cc_athq, v_ou_athq_fin,  v_cct_athq_fin,   'regular', v_pos_fin_ctrl,    1.0, '2021-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-ACCTS-MGR',        'Accounts Manager',
         v_cc_athq, v_ou_athq_fin,  v_cct_athq_fin,   'regular', v_pos_fin_mgr,     1.0, '2020-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-PROC-OFFICER',     'Procurement Officer',
         v_cc_athq, v_ou_athq_supp, v_cct_athq_proc,  'regular', v_pos_sr_proc,     1.0, '2021-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-PARTNER-ASSOC',    'Partner Associate',
         v_cc_athq, v_ou_athq_comm, v_cct_athq_sales, 'regular', v_pos_partner_mgr, 1.0, '2021-01-01', 'active', v_su),
        (v_tid, 'ATHQ-POS-PARTNER-COORD',    'Partner Coordinator',
         v_cc_athq, v_ou_athq_comm, v_cct_athq_sales, 'regular', v_pos_partner_mgr, 1.0, '2022-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                   = EXCLUDED.name,
        org_unit_id            = EXCLUDED.org_unit_id,
        cost_center_id         = EXCLUDED.cost_center_id,
        reports_to_position_id = EXCLUDED.reports_to_position_id,
        status                 = EXCLUDED.status,
        updated_at             = now(), updated_by = v_su;

    -- ── Subsidiary standalone positions ───────────────────────────────────────
    INSERT INTO master.position (
        tenant_id, code, name,
        company_code_id, org_unit_id, cost_center_id,
        position_type, headcount_capacity, valid_from, status, created_by
    ) VALUES
        (v_tid, 'AQTU-POS-UTIL-MGR',       'Qatar Utilities Manager',
         v_cc_aqtu, v_ou_aqtu_ops, v_cct_aqtu_ops, 'regular', 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'ASAC-POS-CONSTR-MGR',     'Saudi Construction Manager',
         v_cc_asac, v_ou_asac_ops, v_cct_asac_ops, 'regular', 1.0, '2020-01-01', 'active', v_su),
        (v_tid, 'AUIC-POS-INFOCOMM-MGR',   'US InfoComm Manager',
         v_cc_auic, v_ou_auic_ops, v_cct_auic_ops, 'regular', 1.0, '2019-01-01', 'active', v_su),
        (v_tid, 'ASGF-POS-FIN-MGR',        'Singapore Financial Manager',
         v_cc_asgf, v_ou_asgf_fin, v_cct_asgf_fin, 'regular', 1.0, '2020-01-01', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        org_unit_id    = EXCLUDED.org_unit_id,
        cost_center_id = EXCLUDED.cost_center_id,
        status         = EXCLUDED.status,
        updated_at     = now(), updated_by = v_su;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: Work assignments — one primary active assignment per employee
    -- Code pattern: WA-{employee_number}  e.g. WA-E-0001
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
        -- emp_code                    pos_code                      mgr_code
        ('EMP-athq.owner',      'ATHQ-POS-GRP-DIR',           NULL),
        ('EMP-athq.cfo',        'ATHQ-POS-CFO',               'EMP-athq.owner'),
        ('EMP-athq.manager',    'ATHQ-POS-OPS-MGR',           'EMP-athq.owner'),
        ('EMP-athq.admin',      'ATHQ-POS-SYS-ADMIN',         'EMP-athq.owner'),
        ('EMP-kumar',           'ATHQ-POS-FIN-MGR',           'EMP-athq.cfo'),
        ('EMP-laks',            'ATHQ-POS-FIN-CTRL',          'EMP-athq.cfo'),
        ('EMP-athq.reporter',   'ATHQ-POS-FIN-ANALYST',       'EMP-kumar'),
        ('EMP-raja',            'ATHQ-POS-ACCTS-MGR',         'EMP-kumar'),
        ('EMP-rama',            'ATHQ-POS-TREASURY-ANALYST',  'EMP-laks'),
        ('EMP-karim.dual',      'ATHQ-POS-SR-MGR',            'EMP-athq.manager'),
        ('EMP-athq.agent',      'ATHQ-POS-SR-PROC-OFFICER',   'EMP-athq.manager'),
        ('EMP-athq.viewer',     'ATHQ-POS-BIZ-ANALYST',       'EMP-athq.manager'),
        ('EMP-athq.requester',  'ATHQ-POS-PROC-OFFICER',      'EMP-athq.agent'),
        ('EMP-partner.owner',   'ATHQ-POS-PARTNER-DIR',       'EMP-athq.owner'),
        ('EMP-partner.manager', 'ATHQ-POS-PARTNER-MGR',       'EMP-partner.owner'),
        ('EMP-partner.agent',   'ATHQ-POS-PARTNER-ASSOC',     'EMP-partner.manager'),
        ('EMP-partner.viewer',  'ATHQ-POS-PARTNER-COORD',     'EMP-partner.manager'),
        ('EMP-aqtu.manager',    'AQTU-POS-UTIL-MGR',          'EMP-athq.owner'),
        ('EMP-asac.manager',    'ASAC-POS-CONSTR-MGR',        'EMP-athq.owner'),
        ('EMP-auic.manager',    'AUIC-POS-INFOCOMM-MGR',      'EMP-athq.owner'),
        ('EMP-asgf.manager',    'ASGF-POS-FIN-MGR',           'EMP-athq.owner')
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

    RAISE NOTICE '[008_positions_work_assignments] Demo: 21 positions + 21 work assignments seeded';

END $demo_org$;
