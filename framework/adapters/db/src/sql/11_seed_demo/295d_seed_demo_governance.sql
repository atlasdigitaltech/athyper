/* ============================================================================
   Athyper v2.7 — Finance Governance Layer Seed Data
   Dependencies: 204_governance_lifecycle.sql, 205_governance_consistency.sql,
                 206_publication_certification_integrity.sql,
                 207_governed_release_orchestration.sql,
                 208_release_operations_runtime.sql,
                 295b_seed_demo_kpi.sql, 295c_seed_demo_close_calendar.sql,
                 293b_seed_period_close_tasks.sql

   Seeds governance-layer demo data for tables introduced in 204-208:
     Part 1: Transition KPI definitions to governed lifecycle states
     Part 2: Configure clean close policy on close_calendar
     Part 3: Seed close overrides for January 2026 close
     Part 4: Seed publication batch + pack release for January 2026
   ============================================================================ */


-- ############################################################################
-- PART 1: KPI DEFINITION GOVERNED LIFECYCLE STATES
-- ############################################################################
-- Transitions the KPI definitions seeded in 295b from implicit DRAFT (the
-- default) to EFFECTIVE so they produce consumable values immediately.
-- Two KPIs per entity are left as APPROVED to demonstrate the lifecycle.
-- ============================================================================

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_kpi_id   uuid;
    v_now      timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Move all system-scope KPI definitions to EFFECTIVE
            -- Step through lifecycle: DRAFT → IN_REVIEW → APPROVED → EFFECTIVE
            -- Note: created_by may be NULL, so use v_tenant as stand-in actor
            UPDATE fin.kpi_definition
            SET status       = 'IN_REVIEW',
                submitted_by = COALESCE(created_by, v_tenant),
                submitted_at = v_now - interval '7 days',
                updated_at   = v_now
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND scope = 'SYSTEM'
              AND status = 'DRAFT'
              AND kpi_code NOT IN ('OPEX_RATIO', 'REVENUE_PER_EMPLOYEE');

            UPDATE fin.kpi_definition
            SET status       = 'APPROVED',
                approved_by  = COALESCE(created_by, v_tenant),
                approved_at  = v_now - interval '5 days',
                updated_at   = v_now
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND scope = 'SYSTEM'
              AND status = 'IN_REVIEW'
              AND kpi_code NOT IN ('OPEX_RATIO', 'REVENUE_PER_EMPLOYEE');

            UPDATE fin.kpi_definition
            SET status       = 'EFFECTIVE',
                updated_at   = v_now
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND scope = 'SYSTEM'
              AND status = 'APPROVED'
              AND kpi_code NOT IN ('OPEX_RATIO', 'REVENUE_PER_EMPLOYEE');

            -- Leave OPEX_RATIO as APPROVED (DRAFT → IN_REVIEW → APPROVED)
            UPDATE fin.kpi_definition
            SET status       = 'IN_REVIEW',
                submitted_by = COALESCE(created_by, v_tenant),
                submitted_at = v_now - interval '4 days',
                updated_at   = v_now
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND kpi_code = 'OPEX_RATIO'
              AND status = 'DRAFT';

            UPDATE fin.kpi_definition
            SET status       = 'APPROVED',
                approved_by  = COALESCE(created_by, v_tenant),
                approved_at  = v_now - interval '2 days',
                updated_at   = v_now
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND kpi_code = 'OPEX_RATIO'
              AND status = 'IN_REVIEW';

            -- Leave REVENUE_PER_EMPLOYEE as DRAFT (demonstrates "still being authored")
            -- (no update needed — it's already DRAFT)

        END LOOP;

        RAISE NOTICE 'KPI governance states updated for tenant %', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- PART 2: CLEAN CLOSE POLICY ON CLOSE CALENDAR
-- ############################################################################
-- Configures clean close thresholds for FY2026. Quarter-end and year-end
-- periods get stricter thresholds than month-end.
-- ============================================================================

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Month-end: allow up to 2 overrides, 90% readiness, 50K impact
        UPDATE fin.close_calendar
        SET clean_close_max_overrides = 2,
            clean_close_min_readiness = 90.00,
            clean_close_max_impact    = 50000.0000,
            updated_at = now()
        WHERE tenant_id = v_tenant
          AND fiscal_year = 2026
          AND close_type = 'MONTH_END';

        -- Quarter-end: stricter — max 1 override, 95% readiness, 25K impact
        UPDATE fin.close_calendar
        SET clean_close_max_overrides = 1,
            clean_close_min_readiness = 95.00,
            clean_close_max_impact    = 25000.0000,
            updated_at = now()
        WHERE tenant_id = v_tenant
          AND fiscal_year = 2026
          AND close_type = 'QUARTER_END';

        -- Year-end: zero tolerance — no overrides, 98% readiness
        UPDATE fin.close_calendar
        SET clean_close_max_overrides = 0,
            clean_close_min_readiness = 98.00,
            clean_close_max_impact    = 0.0000,
            updated_at = now()
        WHERE tenant_id = v_tenant
          AND fiscal_year = 2026
          AND close_type = 'YEAR_END';

        RAISE NOTICE 'Clean close policy configured for tenant % (FY2026)', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- PART 3: CLOSE OVERRIDES FOR JANUARY 2026 CLOSE
-- ############################################################################
-- Seeds realistic override scenarios for the January 2026 (period 1) close.
-- Demonstrates TASK-scoped overrides with various reason codes.
-- Override activity rows are auto-emitted by triggers (205 Section E).
-- ============================================================================

DO $$
DECLARE
    v_tenant       uuid;
    v_code         text;
    v_entity       text;
    v_run_id       uuid;
    v_task_id      uuid;
    v_checklist_id uuid;
    v_override_id  uuid;
    v_now          timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Find the January 2026 close run (if it exists)
            SELECT id INTO v_run_id
            FROM fin.close_run
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 1
            LIMIT 1;

            IF v_run_id IS NULL THEN CONTINUE; END IF;

            -- ================================================================
            -- Override 1: IMMATERIAL — small AR difference below threshold
            -- ================================================================
            SELECT t.id INTO v_task_id
            FROM fin.period_close_task t
            WHERE t.tenant_id = v_tenant
              AND t.entity_code = v_entity
              AND t.task_code = 'AR_RECON';

            IF v_task_id IS NOT NULL THEN
                -- Find checklist item if it exists
                SELECT cl.id INTO v_checklist_id
                FROM fin.period_close_checklist cl
                WHERE cl.tenant_id = v_tenant
                  AND cl.entity_code = v_entity
                  AND cl.fiscal_year = 2026
                  AND cl.period_number = 1
                  AND cl.task_id = v_task_id
                LIMIT 1;

                v_override_id := gen_random_uuid();
                INSERT INTO fin.close_override (
                    id, tenant_id, entity_code,
                    override_scope, run_id, task_id, checklist_id,
                    reason_code, reason_subcode, reason_detail,
                    impact_amount, impact_currency,
                    applies_to_transition,
                    status, requested_by, requested_at,
                    decided_by, decided_at, decision_notes,
                    evidence_payload
                ) VALUES (
                    v_override_id, v_tenant, v_entity,
                    'TASK', v_run_id, v_task_id, v_checklist_id,
                    'IMMATERIAL', 'BELOW_THRESHOLD',
                    'AR subledger shows $247.50 unreconciled — below $500 materiality threshold for month-end close.',
                    247.5000, 'USD',
                    'SOFT_CLOSE',
                    'APPROVED', v_tenant, v_now - interval '3 days',
                    v_tenant, v_now - interval '2 days',
                    'Approved — immaterial variance will self-correct with next payment batch.',
                    jsonb_build_object(
                        'reconciliation_balance', 247.50,
                        'materiality_threshold', 500.00,
                        'aging_bucket', '0-30 days',
                        'expected_clearance', 'Next AP run'
                    )
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- ================================================================
            -- Override 2: TIMING — bank statement not yet received
            -- ================================================================
            SELECT t.id INTO v_task_id
            FROM fin.period_close_task t
            WHERE t.tenant_id = v_tenant
              AND t.entity_code = v_entity
              AND t.task_code = 'BANK_RECON';

            IF v_task_id IS NOT NULL THEN
                SELECT cl.id INTO v_checklist_id
                FROM fin.period_close_checklist cl
                WHERE cl.tenant_id = v_tenant
                  AND cl.entity_code = v_entity
                  AND cl.fiscal_year = 2026
                  AND cl.period_number = 1
                  AND cl.task_id = v_task_id
                LIMIT 1;

                v_override_id := gen_random_uuid();
                INSERT INTO fin.close_override (
                    id, tenant_id, entity_code,
                    override_scope, run_id, task_id, checklist_id,
                    reason_code, reason_subcode, reason_detail,
                    applies_to_transition,
                    effective_to,
                    status, requested_by, requested_at,
                    decided_by, decided_at, decision_notes,
                    evidence_payload
                ) VALUES (
                    v_override_id, v_tenant, v_entity,
                    'TASK', v_run_id, v_task_id, v_checklist_id,
                    'TIMING', 'CUTOFF_ADJUSTMENT',
                    'January bank statement from secondary account delayed — expected by Feb 3. Reconciliation will complete on receipt.',
                    'SOFT_CLOSE',
                    (v_now + interval '5 days'),
                    'APPROVED', v_tenant, v_now - interval '2 days',
                    v_tenant, v_now - interval '1 day',
                    'Approved with 5-day window. Secondary account balance is immaterial.',
                    jsonb_build_object(
                        'bank_account', 'Secondary Operating',
                        'expected_statement_date', '2026-02-03',
                        'estimated_balance', 12450.00,
                        'last_reconciled_period', 12
                    )
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- ================================================================
            -- Override 3: EXTERNAL_DELAY — vendor invoice pending (REJECTED)
            -- ================================================================
            SELECT t.id INTO v_task_id
            FROM fin.period_close_task t
            WHERE t.tenant_id = v_tenant
              AND t.entity_code = v_entity
              AND t.task_code = 'AP_RECON';

            IF v_task_id IS NOT NULL THEN
                SELECT cl.id INTO v_checklist_id
                FROM fin.period_close_checklist cl
                WHERE cl.tenant_id = v_tenant
                  AND cl.entity_code = v_entity
                  AND cl.fiscal_year = 2026
                  AND cl.period_number = 1
                  AND cl.task_id = v_task_id
                LIMIT 1;

                v_override_id := gen_random_uuid();
                INSERT INTO fin.close_override (
                    id, tenant_id, entity_code,
                    override_scope, run_id, task_id, checklist_id,
                    reason_code, reason_subcode, reason_detail,
                    impact_amount, impact_currency,
                    applies_to_transition,
                    status, requested_by, requested_at,
                    decided_by, decided_at, decision_notes,
                    evidence_payload
                ) VALUES (
                    v_override_id, v_tenant, v_entity,
                    'TASK', v_run_id, v_task_id, v_checklist_id,
                    'EXTERNAL_DELAY', 'VENDOR_DELAY',
                    'Major vendor invoice for $78,500 not yet received. AP team requested override to proceed with soft close.',
                    78500.0000, 'USD',
                    'SOFT_CLOSE',
                    'REJECTED', v_tenant, v_now - interval '3 days',
                    v_tenant, v_now - interval '2 days',
                    'Rejected — $78.5K exceeds materiality. Must accrue estimated amount before close can proceed.',
                    jsonb_build_object(
                        'vendor_name', 'Atlas Consulting Group',
                        'po_number', 'PO-2026-0142',
                        'expected_invoice_date', '2026-02-05',
                        'service_period', 'January 2026'
                    )
                ) ON CONFLICT DO NOTHING;
            END IF;

        END LOOP;

        RAISE NOTICE 'Close overrides seeded for tenant % (Jan 2026)', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- PART 4: PUBLICATION BATCH & PACK RELEASE FOR JANUARY 2026
-- ############################################################################
-- Seeds a publication batch and pack release for the January 2026 period.
-- The batch is in DRAFT status (not yet finalized) — demonstrates the
-- governance pipeline before actual publication.
--
-- Note: We do NOT call fin.publish_batch() here because that function
-- requires actual APPROVED kpi_execution/planning_output rows. Instead,
-- we seed the structural objects to demonstrate the release pipeline.
-- ============================================================================

DO $$
DECLARE
    v_tenant           uuid;
    v_code             text;
    v_entity           text;
    v_run_id           uuid;
    v_pack_instance_id uuid;
    v_batch_id         uuid;
    v_release_id       uuid;
    v_cert_id          uuid;
    v_now              timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Find the January 2026 close run
            SELECT id INTO v_run_id
            FROM fin.close_run
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 1
            LIMIT 1;

            IF v_run_id IS NULL THEN CONTINUE; END IF;

            -- Find a pack instance for this entity/period (if any)
            -- report_pack_instance uses period_from/period_to, not period_number
            SELECT pi.id INTO v_pack_instance_id
            FROM fin.report_pack_instance pi
            WHERE pi.tenant_id = v_tenant
              AND pi.entity_code = v_entity
              AND pi.fiscal_year = 2026
              AND pi.period_from <= 1
              AND pi.period_to >= 1
            LIMIT 1;

            -- ================================================================
            -- 4a. Publication Batch
            -- ================================================================
            v_batch_id := gen_random_uuid();
            INSERT INTO fin.publication_batch (
                id, tenant_id, entity_code,
                batch_code, description,
                fiscal_year, period_number, book_code,
                batch_type, pack_instance_id,
                status,
                created_by
            ) VALUES (
                v_batch_id, v_tenant, v_entity,
                format('PUB-%s-%s-2026-01', v_entity, left(v_code, 10)),
                'January 2026 management pack publication batch — KPI executions and planning outputs',
                2026, 1, 'STAT',
                'MIXED', v_pack_instance_id,
                'DRAFT',
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

            -- ================================================================
            -- 4b. Pack Release (ASSEMBLING)
            -- ================================================================
            -- Find certification if exists
            SELECT c.id INTO v_cert_id
            FROM fin.pack_certification c
            WHERE c.tenant_id = v_tenant
              AND c.pack_instance_id = v_pack_instance_id
            LIMIT 1;

            v_release_id := gen_random_uuid();
            INSERT INTO fin.pack_release (
                id, tenant_id, entity_code,
                release_code, release_name, description,
                fiscal_year, period_from, period_to, book_code,
                release_type,
                pack_instance_id, publication_batch_id,
                certification_id, close_run_id,
                status,
                override_count,
                assembled_at,
                created_by
            ) VALUES (
                v_release_id, v_tenant, v_entity,
                format('REL-%s-%s-2026-01', v_entity, left(v_code, 10)),
                'January 2026 Management Pack',
                'Monthly management pack for January 2026 — includes P&L, balance sheet, KPIs, and planning variance analysis.',
                2026, 1, 1, 'STAT',
                'MANAGEMENT_PACK',
                v_pack_instance_id, v_batch_id,
                v_cert_id, v_run_id,
                'ASSEMBLING',
                2,  -- matches the 2 approved overrides above
                v_now,
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

        END LOOP;

        RAISE NOTICE 'Publication batch & pack release seeded for tenant % (Jan 2026)', v_code;
    END LOOP;
END $$;
