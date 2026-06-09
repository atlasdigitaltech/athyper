-- server/db/seed/tenants/neon/010_demo/300_governance/001_finance_close_cycle.sql
-- Finance month-end close cycle seed data — demo tenant instance.
-- Requires: SET app.seed_tenant_id = '<demo_tenant_uuid>' before running.
-- Requires: 100_org_structure/ (entity_code AUIC must exist)
--           900_principals/ (at least one principal for this tenant)
-- Idempotent: ON CONFLICT DO NOTHING on all inserts.

DO $$
DECLARE
    v_t   uuid := current_setting('app.seed_tenant_id', true)::uuid;
    v_sys uuid;    -- system principal
    v_e   varchar := 'AUIC';

    v_ty uuid;  -- cycle_type
    v_pp uuid;  -- phase: PREPARATION
    v_ps uuid;  -- phase: SOFT_CLOSE
    v_ph uuid;  -- phase: HARD_CLOSE
    v_pc uuid;  -- phase: CERTIFICATION

    -- categories
    v_cs uuid;  v_cc uuid;  v_cv uuid;  v_cx uuid;  v_ck uuid;
    v_cr uuid;  v_ca uuid;  v_cp uuid;  v_crp uuid;  v_cn uuid;
BEGIN
    IF v_t IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT id INTO v_sys FROM master.principal WHERE tenant_id = v_t AND principal_type = 'SYSTEM' LIMIT 1;
    IF v_sys IS NULL THEN SELECT id INTO v_sys FROM master.principal WHERE tenant_id = v_t LIMIT 1; END IF;
    IF v_sys IS NULL THEN RAISE NOTICE 'SKIP: No principal found for tenant %. Run 900_principals/ first.', v_t; RETURN; END IF;

    -- ── Cycle type ──────────────────────────────────────────────────────────
    INSERT INTO governance.cycle_type (
        id, tenant_id, type_code, type_name, description, frequency, domain,
        clean_cycle_policy, run_data_schema, created_by)
    VALUES (
        shared.uuidv7(), v_t, 'FIN_CLOSE', 'Finance month-end close',
        'Monthly financial close cycle covering subledger close, consolidation, reconciliation, validation, tax, adjustments, and certification.',
        'MONTHLY', 'FINANCE',
        '{"max_overrides":0,"min_readiness":95.00,"max_impact":null}'::jsonb,
        '{"required":["book_statuses"],"properties":{"book_statuses":{"type":"array"},"is_clean_close":{"type":"boolean"}}}'::jsonb,
        v_sys)
    ON CONFLICT (tenant_id, type_code) DO NOTHING
    RETURNING id INTO v_ty;

    IF v_ty IS NULL THEN
        SELECT id INTO v_ty FROM governance.cycle_type
        WHERE tenant_id = v_t AND type_code = 'FIN_CLOSE';
    END IF;

    -- ── Phases ──────────────────────────────────────────────────────────────
    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'PREPARATION',   'Preparation',   10, NULL, NULL,   v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_pp;
    IF v_pp IS NULL THEN SELECT id INTO v_pp FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'PREPARATION'; END IF;

    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'SOFT_CLOSE',    'Soft close',    20, 72,   80.00, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_ps;
    IF v_ps IS NULL THEN SELECT id INTO v_ps FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'SOFT_CLOSE'; END IF;

    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'HARD_CLOSE',    'Hard close',    30, 120,  95.00, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_ph;
    IF v_ph IS NULL THEN SELECT id INTO v_ph FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'HARD_CLOSE'; END IF;

    INSERT INTO governance.cycle_phase (id, tenant_id, cycle_type_id, phase_code, phase_name, sort_order, target_hours_from_start, min_readiness_pct, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'CERTIFICATION', 'Certification', 40, 144, 100.00, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, phase_code) DO NOTHING RETURNING id INTO v_pc;
    IF v_pc IS NULL THEN SELECT id INTO v_pc FROM governance.cycle_phase WHERE tenant_id = v_t AND cycle_type_id = v_ty AND phase_code = 'CERTIFICATION'; END IF;

    -- ── Categories ──────────────────────────────────────────────────────────
    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'SUBLEDGER',      'Subledger close',       1,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cs;
    IF v_cs IS NULL THEN SELECT id INTO v_cs FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'SUBLEDGER'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'CONSOLIDATION',  'Consolidation',         2,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cc;
    IF v_cc IS NULL THEN SELECT id INTO v_cc FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'CONSOLIDATION'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'VALIDATION',     'Validation',            3,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cv;
    IF v_cv IS NULL THEN SELECT id INTO v_cv FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'VALIDATION'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'TAX',            'Tax',                   4,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cx;
    IF v_cx IS NULL THEN SELECT id INTO v_cx FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'TAX'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'CASH',           'Cash & treasury',       5,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_ck;
    IF v_ck IS NULL THEN SELECT id INTO v_ck FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'CASH'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'REVENUE',        'Revenue recognition',   6,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cr;
    IF v_cr IS NULL THEN SELECT id INTO v_cr FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'REVENUE'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'ADJUSTMENTS',    'Adjustments',           7,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_ca;
    IF v_ca IS NULL THEN SELECT id INTO v_ca FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'ADJUSTMENTS'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'APPROVAL',       'Approval',              8,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cp;
    IF v_cp IS NULL THEN SELECT id INTO v_cp FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'APPROVAL'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'REPORTING',      'Reporting',             9,  v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_crp;
    IF v_crp IS NULL THEN SELECT id INTO v_crp FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'REPORTING'; END IF;

    INSERT INTO governance.cycle_task_category (id, tenant_id, cycle_type_id, category_code, category_name, sort_order, created_by) VALUES
        (shared.uuidv7(), v_t, v_ty, 'RECONCILIATION', 'Reconciliation',        10, v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, category_code) DO NOTHING RETURNING id INTO v_cn;
    IF v_cn IS NULL THEN SELECT id INTO v_cn FROM governance.cycle_task_category WHERE tenant_id = v_t AND cycle_type_id = v_ty AND category_code = 'RECONCILIATION'; END IF;

    -- ── Task templates (17 tasks across 4 phases) ───────────────────────────
    -- ctpl_system_handler_chk: completion_mode = 'MANUAL' OR system_check_handler IS NOT NULL
    INSERT INTO governance.cycle_task_template (
        tenant_id, entity_code, cycle_type_id, phase_id, category_id,
        task_code, task_name, completion_mode, system_check_handler,
        is_mandatory, sla_hours, sort_order, created_by
    ) VALUES
    -- PREPARATION
    (v_t, v_e, v_ty, v_pp, v_cs, 'CUTOFF_REVIEW',      'Review period cutoff dates',          'MANUAL', NULL,                            true,   8, 1,  v_sys),
    (v_t, v_e, v_ty, v_pp, v_cn, 'BANK_FEEDS',         'Verify bank statement feeds loaded',  'SYSTEM', 'finance.close.bank_feeds',      true,   4, 2,  v_sys),
    -- SOFT_CLOSE
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_AP',             'Subledger close — AP',                'HYBRID', 'finance.close.sub_ap',          true,  24, 10, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_AR',             'Subledger close — AR',                'HYBRID', 'finance.close.sub_ar',          true,  24, 11, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_FA',             'Subledger close — fixed assets',      'SYSTEM', 'finance.close.sub_fa',          true,  12, 12, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cs, 'SUB_PAYROLL',        'Subledger close — payroll',           'HYBRID', 'finance.close.sub_payroll',     true,  16, 13, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cn, 'BANK_RECON',         'Bank reconciliation',                 'HYBRID', 'finance.close.bank_recon',      true,  24, 20, v_sys),
    (v_t, v_e, v_ty, v_ps, v_cr, 'REV_RECOGNITION',    'Revenue recognition review',          'MANUAL', NULL,                            true,  16, 25, v_sys),
    (v_t, v_e, v_ty, v_ps, v_ck, 'CASH_POSITION',      'Cash position reconciliation',        'MANUAL', NULL,                            true,  12, 30, v_sys),
    -- HARD_CLOSE
    (v_t, v_e, v_ty, v_ph, v_cc, 'IC_ELIMINATION',     'Intercompany elimination entries',    'SYSTEM', 'finance.close.ic_elimination',  true,   8, 40, v_sys),
    (v_t, v_e, v_ty, v_ph, v_cc, 'FX_REVAL',           'FX revaluation run',                  'SYSTEM', 'finance.close.fx_reval',        true,   4, 41, v_sys),
    (v_t, v_e, v_ty, v_ph, v_cx, 'TAX_PROVISION',      'Tax provision calculation',           'HYBRID', 'finance.close.tax_provision',   true,  16, 45, v_sys),
    (v_t, v_e, v_ty, v_ph, v_ca, 'TOPSIDE_ADJ',        'Review & post topside adjustments',   'MANUAL', NULL,                            true,   8, 50, v_sys),
    (v_t, v_e, v_ty, v_ph, v_cv, 'TB_VALIDATION',      'Trial balance validation',            'HYBRID', 'finance.close.tb_validation',   true,   8, 55, v_sys),
    -- CERTIFICATION
    (v_t, v_e, v_ty, v_pc, v_crp, 'MGMT_PACK',          'Prepare management reporting pack',   'MANUAL', NULL,                            true,  16, 60, v_sys),
    (v_t, v_e, v_ty, v_pc, v_cp,  'CONTROLLER_SIGNOFF', 'Controller sign-off',                 'MANUAL', NULL,                            true,   8, 70, v_sys),
    (v_t, v_e, v_ty, v_pc, v_cp,  'CFO_ATTESTATION',    'CFO attestation',                     'MANUAL', NULL,                            true,   8, 80, v_sys)
    ON CONFLICT (tenant_id, entity_code, cycle_type_id, task_code) DO NOTHING;

    -- ── Carryforward rules (SOX-strict) ─────────────────────────────────────
    INSERT INTO governance.cycle_carryforward_rule (
        tenant_id, cycle_type_id, deviation_type, action, description, created_by
    ) VALUES
    (v_t, v_ty, 'EXCEPTION', 'FORCE_CLOSE', 'SOX: all exceptions must be resolved before certification', v_sys),
    (v_t, v_ty, 'OVERRIDE',  'EXPIRE',      'Overrides are time-bound to the period they apply to',      v_sys),
    (v_t, v_ty, 'WAIVER',    'FORCE_CLOSE', 'SOX: waivers must be formally accepted before certification', v_sys)
    ON CONFLICT (tenant_id, cycle_type_id, deviation_type) DO NOTHING;

    RAISE NOTICE 'Finance close seed complete: type=%, phases=4, categories=10, templates=17, cf_rules=3', v_ty;
END;
$$;
