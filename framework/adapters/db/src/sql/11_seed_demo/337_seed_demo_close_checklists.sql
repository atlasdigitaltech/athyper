/* ============================================================================
   Athyper v2.4 — DEMO SEED: Period Close Checklists
   Table: fin.period_close_checklist
   Dependencies: 293b_seed_period_close_tasks.sql, 320_seed_demo_fiscal_open.sql

   Materializes close checklist instances for all 3 demo periods:

     Period 1 (HARD_CLOSE):
       - All SOFT_CLOSE tasks: COMPLETED (with timestamps + evidence)
       - HARD_CLOSE tasks (MGMT_SIGNOFF): COMPLETED

     Period 2 (SOFT_CLOSE):
       - 60% of SOFT_CLOSE tasks: COMPLETED
       - 20%: IN_PROGRESS
       - 10%: FAILED (one task for drama)
       - 10%: PENDING
       - HARD_CLOSE tasks: PENDING

     Period 3 (OPEN):
       - All tasks: PENDING (period just opened)

   Respects constraint integrity:
     - COMPLETED items have completed_by + completed_at, NO waiver/failure fields
     - FAILED items have failure_reason + failed_at, NO completion/waiver fields
     - WAIVED items have waived_by + waived_at + waiver_reason, NO others
     - PENDING/IN_PROGRESS/BLOCKED have NO completion/waiver/failure fields

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

DO $$
DECLARE
    v_tenant     uuid;
    v_code       text;
    v_entity     text;
    v_sys_user   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_ctrl_user  uuid := '00000000-0000-0000-0000-000000000002'::uuid;
    v_task       RECORD;
    v_task_idx   int;
    v_status     text;
    v_now        timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- ============================================================
            -- PERIOD 1 (HARD_CLOSE) — All tasks COMPLETED
            -- ============================================================
            v_task_idx := 0;
            FOR v_task IN
                SELECT id, task_code, required_before
                FROM fin.period_close_task
                WHERE tenant_id = v_tenant AND entity_code = v_entity
                ORDER BY sort_order
            LOOP
                INSERT INTO fin.period_close_checklist (
                    id, tenant_id, entity_code, fiscal_year, period_number,
                    task_id, task_code, task_status, is_mandatory,
                    completed_by, completed_at, completion_notes,
                    evidence_payload,
                    created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_entity, 2026, 1,
                    v_task.id, v_task.task_code, 'COMPLETED', true,
                    v_ctrl_user, v_now - interval '30 days' + (v_task_idx * interval '2 hours'),
                    'Completed during P1 month-end close',
                    jsonb_build_object('automated', true, 'period', 1, 'result', 'PASS'),
                    v_now - interval '32 days', v_now - interval '30 days'
                )
                ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, task_code) DO NOTHING;

                v_task_idx := v_task_idx + 1;
            END LOOP;

            -- ============================================================
            -- PERIOD 2 (SOFT_CLOSE) — Mixed statuses
            -- ============================================================
            v_task_idx := 0;
            FOR v_task IN
                SELECT id, task_code, required_before, completion_mode
                FROM fin.period_close_task
                WHERE tenant_id = v_tenant AND entity_code = v_entity
                ORDER BY sort_order
            LOOP
                -- Determine status based on task position and gate
                IF v_task.required_before = 'HARD_CLOSE' THEN
                    -- HARD_CLOSE tasks stay PENDING in a SOFT_CLOSE period
                    v_status := 'PENDING';
                ELSIF v_task_idx < 4 THEN
                    -- First ~4 tasks: COMPLETED
                    v_status := 'COMPLETED';
                ELSIF v_task_idx < 6 THEN
                    -- Next ~2: IN_PROGRESS
                    v_status := 'IN_PROGRESS';
                ELSIF v_task_idx = 6 THEN
                    -- One task FAILED (creates risk signal scenario)
                    v_status := 'FAILED';
                ELSE
                    -- Remaining: PENDING
                    v_status := 'PENDING';
                END IF;

                IF v_status = 'COMPLETED' THEN
                    INSERT INTO fin.period_close_checklist (
                        id, tenant_id, entity_code, fiscal_year, period_number,
                        task_id, task_code, task_status, is_mandatory,
                        completed_by, completed_at, completion_notes,
                        evidence_payload,
                        created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), v_tenant, v_entity, 2026, 2,
                        v_task.id, v_task.task_code, 'COMPLETED', true,
                        v_ctrl_user, v_now - interval '3 days' + (v_task_idx * interval '3 hours'),
                        'Completed during P2 close cycle',
                        jsonb_build_object('automated', v_task.completion_mode = 'SYSTEM', 'period', 2, 'result', 'PASS'),
                        v_now - interval '10 days', v_now - interval '3 days'
                    )
                    ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, task_code) DO NOTHING;

                ELSIF v_status = 'FAILED' THEN
                    INSERT INTO fin.period_close_checklist (
                        id, tenant_id, entity_code, fiscal_year, period_number,
                        task_id, task_code, task_status, is_mandatory,
                        failure_reason, failed_at,
                        evidence_payload,
                        created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), v_tenant, v_entity, 2026, 2,
                        v_task.id, v_task.task_code, 'FAILED', true,
                        'Reconciliation variance exceeds tolerance: 2,847.50 vs threshold 500.00',
                        v_now - interval '1 day',
                        jsonb_build_object('variance', 2847.50, 'threshold', 500.00, 'period', 2),
                        v_now - interval '10 days', v_now - interval '1 day'
                    )
                    ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, task_code) DO NOTHING;

                ELSE
                    -- PENDING or IN_PROGRESS: no completion/waiver/failure fields
                    INSERT INTO fin.period_close_checklist (
                        id, tenant_id, entity_code, fiscal_year, period_number,
                        task_id, task_code, task_status, is_mandatory,
                        assigned_to,
                        created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), v_tenant, v_entity, 2026, 2,
                        v_task.id, v_task.task_code, v_status, true,
                        CASE WHEN v_status = 'IN_PROGRESS' THEN v_ctrl_user ELSE NULL END,
                        v_now - interval '10 days', v_now
                    )
                    ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, task_code) DO NOTHING;
                END IF;

                v_task_idx := v_task_idx + 1;
            END LOOP;

            -- ============================================================
            -- PERIOD 3 (OPEN) — All tasks PENDING (just materialized)
            -- ============================================================
            FOR v_task IN
                SELECT id, task_code
                FROM fin.period_close_task
                WHERE tenant_id = v_tenant AND entity_code = v_entity
                ORDER BY sort_order
            LOOP
                INSERT INTO fin.period_close_checklist (
                    id, tenant_id, entity_code, fiscal_year, period_number,
                    task_id, task_code, task_status, is_mandatory,
                    created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_entity, 2026, 3,
                    v_task.id, v_task.task_code, 'PENDING', true,
                    v_now - interval '5 days', v_now - interval '5 days'
                )
                ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, task_code) DO NOTHING;
            END LOOP;

        END LOOP; -- entity_code

        RAISE NOTICE 'Period close checklists (P1=all-done, P2=mixed, P3=pending) seeded for tenant %', v_code;
    END LOOP; -- tenant
END $$;
