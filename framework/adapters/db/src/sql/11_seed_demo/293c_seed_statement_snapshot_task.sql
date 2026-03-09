/* ============================================================================
   Athyper v2.6 — Statement Snapshot Close Task
   Table: fin.period_close_task
   Dependencies: 293b_seed_period_close_tasks.sql

   Adds the GENERATE_STATEMENT_SNAPSHOTS system task to the period close
   checklist. Fires before HARD_CLOSE to capture all active statement
   definitions as immutable snapshots.

   Category: REPORTING (new — distinct from VALIDATION)
   Gate: HARD_CLOSE (runs after all adjustments/validations are done)
   Handler: close.generate_statement_snapshots
   Blueprint: all (null = universal)
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            INSERT INTO fin.period_close_task (
                id, tenant_id, entity_code, task_code, task_name, description,
                category, required_before, sort_order,
                is_mandatory, is_waivable, waiver_requires_approval, waiver_reason_required,
                completion_mode, system_check_handler, blueprint_filter,
                default_owner_role, sla_hours, severity, reminder_lead_hours
            ) VALUES
                (gen_random_uuid(), v_tenant, v_entity,
                 'STMT_SNAPSHOT', 'Generate Statement Snapshots',
                 'Capture point-in-time financial statement snapshots (P&L, Balance Sheet, etc.) before period hard close. Enables historical retrieval without recomputation.',
                 'REPORTING', 'HARD_CLOSE', 190,
                 true, true, false, true,
                 'SYSTEM', 'close.generate_statement_snapshots', null,
                 null, 4, 'medium', 1)
            ON CONFLICT (tenant_id, entity_code, task_code) DO NOTHING;

        END LOOP;

        RAISE NOTICE 'Statement snapshot close task seeded for tenant %', v_code;
    END LOOP;
END $$;
