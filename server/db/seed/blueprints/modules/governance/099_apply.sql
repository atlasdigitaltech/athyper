-- Receipt for pack_finance_close_governance. Counts seeded rows and writes
-- a tenant_application record with warnings (not exceptions) for retry safety.
-- Requires SET app.seed_tenant_id = '<uuid>'.

DO $apply_finance_close_governance$
DECLARE
    v_tid               uuid;
    v_tenant_code       text;
    v_sys               uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_version           text := '1.0.0';
    v_type_count        integer;
    v_phase_count       integer;
    v_category_count    integer;
    v_template_count    integer;
    v_dependency_count  integer;
    v_rule_count        integer;
    v_company_count     integer;
    v_warnings          text[] := ARRAY[]::text[];
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT code INTO v_tenant_code
      FROM master.tenant
     WHERE id = v_tid;

    IF v_tenant_code IS NULL THEN
        RAISE EXCEPTION '[pack_finance_close_governance] No tenant found for app.seed_tenant_id = %', v_tid;
    END IF;

    -- Safety net: the canonical registry row also lives in
    -- platform/003_control/090_control_blueprint_registry_contract.sql but stage-3-only runs
    -- never see that file, so we re-upsert it here.
    INSERT INTO control.blueprint_registry (
        code, name, category, industry_vertical, framework,
        base_version, status, dependencies, seed_files, description,
        metadata, created_by
    )
    VALUES (
        'pack_finance_close_governance',
        'Finance Close Governance',
        'module_pack',
        NULL, NULL, v_version, 'active',
        ARRAY['base','org_foundation'],
        ARRAY[
            'blueprints/modules/governance/010_finance_close_governance_templates.sql',
            'blueprints/modules/governance/099_apply.sql'
        ],
        'Finance close governance templates for monthly soft close and year-end hard close.',
        jsonb_build_object(
            'cycle_types', ARRAY['MONTHLY_CLOSE','YEAR_END_CLOSE'],
            'period_policy', 'Open current month, soft-close prior months, hard-close at year-end'
        ),
        v_sys
    )
    ON CONFLICT (code) DO UPDATE SET
        name              = EXCLUDED.name,
        category          = EXCLUDED.category,
        industry_vertical = EXCLUDED.industry_vertical,
        framework         = EXCLUDED.framework,
        base_version      = EXCLUDED.base_version,
        status            = EXCLUDED.status,
        dependencies      = EXCLUDED.dependencies,
        seed_files        = EXCLUDED.seed_files,
        description       = EXCLUDED.description,
        metadata          = EXCLUDED.metadata;

    SELECT count(*) INTO v_company_count
      FROM master.company_code
     WHERE tenant_id = v_tid
       AND status = 'active'
       AND length(code) <= 20;

    SELECT count(*) INTO v_type_count
      FROM governance.cycle_type
     WHERE tenant_id = v_tid
       AND type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
       AND domain = 'FINANCE'
       AND is_active;

    SELECT count(*) INTO v_phase_count
      FROM governance.cycle_phase cp
      JOIN governance.cycle_type ct
        ON ct.tenant_id = cp.tenant_id
       AND ct.id = cp.cycle_type_id
     WHERE cp.tenant_id = v_tid
       AND ct.type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
       AND cp.is_active;

    SELECT count(*) INTO v_category_count
      FROM governance.cycle_task_category ctc
      JOIN governance.cycle_type ct
        ON ct.tenant_id = ctc.tenant_id
       AND ct.id = ctc.cycle_type_id
     WHERE ctc.tenant_id = v_tid
       AND ct.type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
       AND ctc.is_active;

    SELECT count(*) INTO v_template_count
      FROM governance.cycle_task_template ctt
      JOIN governance.cycle_type ct
        ON ct.tenant_id = ctt.tenant_id
       AND ct.id = ctt.cycle_type_id
     WHERE ctt.tenant_id = v_tid
       AND ct.type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
       AND ctt.is_active;

    SELECT count(*) INTO v_dependency_count
      FROM governance.cycle_task_dependency ctd
      JOIN governance.cycle_type ct
        ON ct.tenant_id = ctd.tenant_id
       AND ct.id = ctd.cycle_type_id
     WHERE ctd.tenant_id = v_tid
       AND ct.type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
       AND ctd.is_active;

    SELECT count(*) INTO v_rule_count
      FROM governance.cycle_carryforward_rule cfr
      JOIN governance.cycle_type ct
        ON ct.tenant_id = cfr.tenant_id
       AND ct.id = cfr.cycle_type_id
     WHERE cfr.tenant_id = v_tid
       AND ct.type_code IN ('MONTHLY_CLOSE','YEAR_END_CLOSE')
       AND cfr.is_active;

    IF v_type_count < 2 THEN
        v_warnings := v_warnings || format('Expected 2 finance close cycle types, got %s', v_type_count);
    END IF;
    IF v_phase_count < 17 THEN
        v_warnings := v_warnings || format('Expected at least 17 phases, got %s', v_phase_count);
    END IF;
    IF v_category_count < 24 THEN
        v_warnings := v_warnings || format('Expected at least 24 categories, got %s', v_category_count);
    END IF;
    IF v_company_count > 0 AND v_template_count < (v_company_count * 41) THEN
        v_warnings := v_warnings || format(
            'Expected at least %s task templates for %s companies, got %s',
            v_company_count * 41, v_company_count, v_template_count
        );
    END IF;
    IF v_company_count > 0 AND v_dependency_count < (v_company_count * 43) THEN
        v_warnings := v_warnings || format(
            'Expected at least %s task dependencies for %s companies, got %s',
            v_company_count * 43, v_company_count, v_dependency_count
        );
    END IF;
    IF v_rule_count < 6 THEN
        v_warnings := v_warnings || format('Expected 6 carryforward rules, got %s', v_rule_count);
    END IF;
    IF v_company_count = 0 THEN
        v_warnings := v_warnings || 'No active company codes found; task templates were not expanded.';
    END IF;

    INSERT INTO control.blueprint_tenant_application (
        tenant_id, blueprint_code, applied_version,
        applied_at, applied_by, status, error_detail, metadata,
        created_by
    )
    VALUES (
        v_tid, 'pack_finance_close_governance', v_version,
        now(), v_sys,
        'applied',
        CASE WHEN cardinality(v_warnings) = 0 THEN NULL
             ELSE array_to_string(v_warnings, E'\n') END,
        jsonb_build_object(
            'cycle_types',       v_type_count,
            'phases',            v_phase_count,
            'categories',        v_category_count,
            'task_templates',    v_template_count,
            'task_dependencies', v_dependency_count,
            'carryforward_rules',v_rule_count,
            'companies',         v_company_count,
            'policy',            'open_current_month_soft_close_prior_month_year_end_hard_close',
            'warnings_count',    cardinality(v_warnings)
        ),
        v_sys
    )
    ON CONFLICT (tenant_id, blueprint_code) DO UPDATE SET
        applied_version = EXCLUDED.applied_version,
        applied_at      = EXCLUDED.applied_at,
        applied_by      = EXCLUDED.applied_by,
        status          = EXCLUDED.status,
        error_detail    = EXCLUDED.error_detail,
        metadata        = EXCLUDED.metadata,
        updated_at      = now(),
        updated_by      = v_sys;

    IF cardinality(v_warnings) > 0 THEN
        RAISE WARNING 'pack_finance_close_governance applied with warnings for tenant %: %',
            v_tenant_code, array_to_string(v_warnings, '; ');
    ELSE
        RAISE NOTICE 'pack_finance_close_governance applied cleanly for tenant % (% companies, % templates, % dependencies)',
            v_tenant_code, v_company_count, v_template_count, v_dependency_count;
    END IF;
END $apply_finance_close_governance$;


