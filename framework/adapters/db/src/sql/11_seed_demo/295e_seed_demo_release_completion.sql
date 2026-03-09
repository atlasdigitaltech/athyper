/* ============================================================================
   Athyper v2.7 — Finance Release Completion Seed Data
   Dependencies: 202_close_orchestration.sql, 196_management_pack.sql,
                 197_pack_governance.sql, 204-208 governance layer,
                 295b_seed_demo_kpi.sql, 295c_seed_demo_close_calendar.sql,
                 295d_seed_demo_governance.sql

   Seeds two complete release stories that bring the full governance
   architecture to life:

     Story 1 — January 2026: Clean Governed Release
       - Close run reaches HARD_CLOSED
       - Readiness snapshot at 97% (meets policy)
       - No disqualifying overrides (295d seeds are within threshold)
       - Publication batch FINALIZED → PUBLISHED with manifest items
       - Certification APPROVED → CERTIFIED with publication context
       - Pack release ASSEMBLING → READY → RELEASED
       - Distribution SENT to CFO + Board
       - Integrity verification passes
       - Decision log + notification + SLA snapshot captured

     Story 2 — February 2026: Superseded / Exception-Based Release
       - Close run with override pressure (3 approved overrides)
       - Exception signoff required (not clean close)
       - Batch A published, then superseded by Batch B
       - Certification A becomes INVALIDATED (not REJECTED — 207 semantics)
       - Distribution A recalled, Batch B re-released
       - Demonstrates full supersession chain

     Additional:
       - KPI historical supersession (EFFECTIVE v1 → SUPERSEDED, v2 EFFECTIVE)
       - Release integrity pass (Story 1) and fail (incomplete Story 2 state)
   ============================================================================ */


-- ############################################################################
-- PART 0: PREREQUISITE INFRASTRUCTURE
-- ############################################################################
-- Seeds close_run, close_readiness_snapshot, report_pack_instance, and
-- pack_certification rows for January and February 2026. These tables
-- have no existing demo seeds.
-- ============================================================================

DO $$
DECLARE
    v_tenant           uuid;
    v_code             text;
    v_entity           text;
    v_cal_id           uuid;
    v_run_id_jan       uuid;
    v_run_id_feb       uuid;
    v_snap_id_jan      uuid;
    v_snap_id_feb      uuid;
    v_pack_def_id      uuid;
    v_pack_inst_jan    uuid;
    v_pack_inst_feb    uuid;
    v_cert_jan         uuid;
    v_cert_feb_a       uuid;
    v_now              timestamptz := now();
BEGIN
    -- Create temp table upfront so subsequent DO blocks can reference it even if empty
    CREATE TEMP TABLE IF NOT EXISTS _seed_release_ids (
        tenant_id       uuid,
        entity_code     varchar(20),
        run_id_jan      uuid,
        run_id_feb      uuid,
        snap_id_jan     uuid,
        snap_id_feb     uuid,
        pack_def_id     uuid,
        pack_inst_jan   uuid,
        pack_inst_feb   uuid,
        cert_jan        uuid,
        cert_feb_a      uuid,
        PRIMARY KEY (tenant_id, entity_code)
    );

    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- ==============================================================
            -- 0a. Close Runs — January (HARD_CLOSED) + February (SOFT_CLOSED)
            -- ==============================================================

            -- January close run — fully completed
            SELECT id INTO v_cal_id
            FROM fin.close_calendar
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 1;

            INSERT INTO fin.close_run (
                id, tenant_id, entity_code,
                fiscal_year, period_number, calendar_id,
                run_number, status,
                started_at, soft_closed_at, hard_closed_at, completed_at,
                started_by, soft_closed_by, hard_closed_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity,
                2026, 1, v_cal_id,
                1, 'HARD_CLOSED',
                v_now - interval '25 days',
                v_now - interval '22 days',
                v_now - interval '20 days',
                v_now - interval '20 days',
                v_tenant, v_tenant, v_tenant
            ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

            -- Always fetch the actual run ID (handles both insert and conflict)
            SELECT id INTO v_run_id_jan FROM fin.close_run
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND fiscal_year = 2026 AND period_number = 1 AND run_number = 1;

            -- February close run — in progress (soft closed, not yet hard closed)
            SELECT id INTO v_cal_id
            FROM fin.close_calendar
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 2;

            INSERT INTO fin.close_run (
                id, tenant_id, entity_code,
                fiscal_year, period_number, calendar_id,
                run_number, status,
                started_at, soft_closed_at,
                started_by, soft_closed_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity,
                2026, 2, v_cal_id,
                1, 'SOFT_CLOSED',
                v_now - interval '8 days',
                v_now - interval '5 days',
                v_tenant, v_tenant
            ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

            -- Always fetch the actual run ID
            SELECT id INTO v_run_id_feb FROM fin.close_run
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND fiscal_year = 2026 AND period_number = 2 AND run_number = 1;

            -- Update close_calendar actual dates for January
            UPDATE fin.close_calendar
            SET soft_close_actual = (period_end_date + interval '3 days')::date,
                hard_close_actual = (period_end_date + interval '5 days')::date,
                actual_working_days = 3,
                updated_at = v_now
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 1
              AND hard_close_actual IS NULL;

            -- ==============================================================
            -- 0b. Close Readiness Snapshots
            -- ==============================================================

            -- January: high readiness (97%) — qualifies for clean close
            INSERT INTO fin.close_readiness_snapshot (
                id, tenant_id, entity_code, run_id,
                captured_at,
                total_tasks, completed_count, waived_count,
                failed_count, blocked_count, in_progress_count, pending_count,
                completion_pct,
                open_exceptions, critical_exceptions, resolved_exceptions,
                days_elapsed, days_remaining, sla_status,
                readiness_score,
                category_progress,
                captured_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity, v_run_id_jan,
                v_now - interval '20 days',
                15, 14, 1,
                0, 0, 0, 0,
                100.00,
                0, 0, 2,
                3, 0, 'ON_TRACK',
                97.00,
                jsonb_build_object(
                    'SUBLEDGER', 100, 'CASH', 100, 'CONSOLIDATION', 100,
                    'TAX', 100, 'REVENUE', 100, 'ADJUSTMENTS', 100,
                    'VALIDATION', 100, 'APPROVAL', 100
                ),
                v_tenant
            ) ON CONFLICT DO NOTHING;

            -- Always fetch actual snapshot ID for Jan
            SELECT id INTO v_snap_id_jan FROM fin.close_readiness_snapshot
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id_jan
            ORDER BY captured_at DESC LIMIT 1;

            -- February: moderate readiness (82%) — override pressure
            INSERT INTO fin.close_readiness_snapshot (
                id, tenant_id, entity_code, run_id,
                captured_at,
                total_tasks, completed_count, waived_count,
                failed_count, blocked_count, in_progress_count, pending_count,
                completion_pct,
                open_exceptions, critical_exceptions, resolved_exceptions,
                days_elapsed, days_remaining, sla_status,
                readiness_score,
                category_progress,
                captured_by
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity, v_run_id_feb,
                v_now - interval '3 days',
                15, 10, 2,
                1, 0, 1, 1,
                80.00,
                2, 1, 1,
                5, 2, 'AT_RISK',
                82.00,
                jsonb_build_object(
                    'SUBLEDGER', 85, 'CASH', 75, 'CONSOLIDATION', 100,
                    'TAX', 80, 'REVENUE', 70, 'ADJUSTMENTS', 100,
                    'VALIDATION', 60, 'APPROVAL', 0
                ),
                v_tenant
            ) ON CONFLICT DO NOTHING;

            -- Always fetch actual snapshot ID for Feb
            SELECT id INTO v_snap_id_feb FROM fin.close_readiness_snapshot
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id_feb
            ORDER BY captured_at DESC LIMIT 1;

            -- ==============================================================
            -- 0c. Report Pack Instances — January (PUBLISHED) + February (APPROVED)
            -- ==============================================================

            -- Find a pack definition for this entity
            SELECT id INTO v_pack_def_id
            FROM fin.report_pack_definition
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND is_active = true
            ORDER BY sort_order
            LIMIT 1;

            -- If no pack definition exists, skip pack/cert/release seeding
            IF v_pack_def_id IS NULL THEN
                RAISE NOTICE 'No pack definition for tenant % entity % — skipping pack infrastructure', v_code, v_entity;
                CONTINUE;
            END IF;

            -- January pack instance — PUBLISHED
            INSERT INTO fin.report_pack_instance (
                id, tenant_id, entity_code,
                pack_definition_id, pack_version,
                fiscal_year, period_from, period_to,
                book_code, status,
                generated_at, generated_by,
                total_items, items_completed,
                variance_source, period_mode,
                reviewed_by, reviewed_at,
                approved_by, approved_at,
                finalized_at,
                published_by, published_at
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity,
                v_pack_def_id, 1,
                2026, 1, 1,
                'STAT', 'PUBLISHED',
                v_now - interval '19 days', v_tenant,
                5, 5,
                'PRIOR_YEAR', 'PTD',
                v_tenant, v_now - interval '18 days',
                v_tenant, v_now - interval '17 days',
                v_now - interval '16 days',
                v_tenant, v_now - interval '15 days'
            ) ON CONFLICT DO NOTHING;

            -- Fetch actual pack instance ID for Jan
            SELECT id INTO v_pack_inst_jan FROM fin.report_pack_instance
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
              AND period_from = 1 AND period_to = 1
            LIMIT 1;

            -- February pack instance — APPROVED (not yet published)
            INSERT INTO fin.report_pack_instance (
                id, tenant_id, entity_code,
                pack_definition_id, pack_version,
                fiscal_year, period_from, period_to,
                book_code, status,
                generated_at, generated_by,
                total_items, items_completed,
                variance_source, period_mode,
                reviewed_by, reviewed_at,
                approved_by, approved_at
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity,
                v_pack_def_id, 1,
                2026, 2, 2,
                'STAT', 'APPROVED',
                v_now - interval '4 days', v_tenant,
                5, 5,
                'PRIOR_YEAR', 'PTD',
                v_tenant, v_now - interval '3 days',
                v_tenant, v_now - interval '2 days'
            ) ON CONFLICT DO NOTHING;

            -- Fetch actual pack instance ID for Feb
            SELECT id INTO v_pack_inst_feb FROM fin.report_pack_instance
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
              AND period_from = 2 AND period_to = 2
            LIMIT 1;

            -- ==============================================================
            -- 0d. Certifications — January (CERTIFIED) + February (APPROVED, will be INVALIDATED)
            -- ==============================================================

            -- January certification — fully certified
            INSERT INTO fin.pack_certification (
                id, tenant_id, pack_instance_id,
                prepared_by, prepared_by_name, prepared_at,
                reviewed_by, reviewed_by_name, reviewed_at, review_notes,
                approved_by, approved_by_name, approved_at, approval_notes,
                certified_by, certified_by_name, certified_at, certification_notes,
                certification_status,
                -- 206 governance context columns
                close_run_id, readiness_snapshot_id,
                active_override_count, override_impact_total,
                readiness_score_at_cert, period_status_at_cert
            ) VALUES (
                gen_random_uuid(), v_tenant, v_pack_inst_jan,
                v_tenant, 'Sarah Chen (Senior Accountant)', v_now - interval '18 days',
                v_tenant, 'James Liu (Controller)', v_now - interval '17 days',
                'All reconciliations complete. Variances within tolerance.',
                v_tenant, 'James Liu (Controller)', v_now - interval '16 days',
                'January financials approved. Clean close — no material overrides.',
                v_tenant, 'Maria Santos (CFO)', v_now - interval '15 days',
                'Certified for distribution. Strong close with no exceptions.',
                'CERTIFIED',
                v_run_id_jan, v_snap_id_jan,
                0, 0.0000,
                97.00, 'HARD_CLOSED'
            ) ON CONFLICT DO NOTHING;

            -- Fetch actual cert ID for Jan
            SELECT id INTO v_cert_jan FROM fin.pack_certification
            WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_jan
            LIMIT 1;

            -- February certification A — initially APPROVED (will be INVALIDATED in Story 2)
            INSERT INTO fin.pack_certification (
                id, tenant_id, pack_instance_id,
                prepared_by, prepared_by_name, prepared_at,
                reviewed_by, reviewed_by_name, reviewed_at, review_notes,
                approved_by, approved_by_name, approved_at, approval_notes,
                certification_status,
                close_run_id, readiness_snapshot_id,
                active_override_count, override_impact_total,
                readiness_score_at_cert, period_status_at_cert
            ) VALUES (
                gen_random_uuid(), v_tenant, v_pack_inst_feb,
                v_tenant, 'Sarah Chen (Senior Accountant)', v_now - interval '3 days',
                v_tenant, 'James Liu (Controller)', v_now - interval '2 days',
                'February close has 3 approved overrides. Readiness at 82%.',
                v_tenant, 'James Liu (Controller)', v_now - interval '1 day',
                'Approved with reservations — override impact requires CFO exception signoff.',
                'APPROVED',
                v_run_id_feb, v_snap_id_feb,
                3, 45750.0000,
                82.00, 'SOFT_CLOSED'
            ) ON CONFLICT DO NOTHING;

            -- Fetch actual cert ID for Feb A
            SELECT id INTO v_cert_feb_a FROM fin.pack_certification
            WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_feb
            ORDER BY created_at ASC LIMIT 1;

            -- Store IDs for subsequent parts via temp table
            INSERT INTO _seed_release_ids VALUES (
                v_tenant, v_entity,
                v_run_id_jan, v_run_id_feb,
                v_snap_id_jan, v_snap_id_feb,
                v_pack_def_id,
                v_pack_inst_jan, v_pack_inst_feb,
                v_cert_jan, v_cert_feb_a
            ) ON CONFLICT (tenant_id, entity_code) DO UPDATE SET
                run_id_jan    = EXCLUDED.run_id_jan,
                run_id_feb    = EXCLUDED.run_id_feb,
                snap_id_jan   = EXCLUDED.snap_id_jan,
                snap_id_feb   = EXCLUDED.snap_id_feb,
                pack_def_id   = EXCLUDED.pack_def_id,
                pack_inst_jan = EXCLUDED.pack_inst_jan,
                pack_inst_feb = EXCLUDED.pack_inst_feb,
                cert_jan      = EXCLUDED.cert_jan,
                cert_feb_a    = EXCLUDED.cert_feb_a;

        END LOOP;

        RAISE NOTICE 'Prerequisite infrastructure seeded for tenant %', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- PART 1: KPI HISTORICAL SUPERSESSION
-- ############################################################################
-- Creates a v2 of GROSS_MARGIN_PCT that supersedes v1.
-- Demonstrates:
--   - EFFECTIVE v1 → SUPERSEDED (with retired_by/at)
--   - New v2 row inserted as EFFECTIVE
--   - Partial unique index uq_fin_kpi_def_one_effective enforces single-EFFECTIVE
--   - Historical audit lineage preserved
-- ============================================================================

DO $$
DECLARE
    v_tenant       uuid;
    v_code         text;
    v_entity       text;
    v_old_kpi_id   uuid;
    v_new_kpi_id   uuid;
    v_old_formula  jsonb;
    v_now          timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Find the current EFFECTIVE GROSS_MARGIN_PCT (v1, seeded in 295b, activated in 295d)
            SELECT id, formula INTO v_old_kpi_id, v_old_formula
            FROM fin.kpi_definition
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND kpi_code = 'GROSS_MARGIN_PCT'
              AND status = 'EFFECTIVE'
            LIMIT 1;

            IF v_old_kpi_id IS NULL THEN CONTINUE; END IF;

            -- Supersede v1 (the lifecycle trigger handles validation)
            UPDATE fin.kpi_definition
            SET status     = 'SUPERSEDED',
                retired_by = v_tenant,
                retired_at = v_now - interval '10 days',
                updated_at = v_now - interval '10 days'
            WHERE id = v_old_kpi_id;

            -- Insert v2 as DRAFT first, then step through lifecycle
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope,
                version, status
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity,
                'GROSS_MARGIN_PCT', 'Gross Margin % (v2)',
                'Gross profit as a percentage of revenue. v2: separates direct materials and direct labor for variance analysis.',
                'PROFITABILITY', 'GL',
                jsonb_build_object(
                    'op', 'MULTIPLY',
                    'left', jsonb_build_object(
                        'op', 'DIVIDE',
                        'left', jsonb_build_object(
                            'op', 'SUBTRACT',
                            'left', jsonb_build_object('ref', 'REVENUE'),
                            'right', jsonb_build_object(
                                'op', 'ADD',
                                'left', jsonb_build_object('ref', 'DIRECT_MATERIALS'),
                                'right', jsonb_build_object('ref', 'DIRECT_LABOR')
                            )
                        ),
                        'right', jsonb_build_object('ref', 'REVENUE')
                    ),
                    'right', jsonb_build_object('literal', 100)
                ),
                'RATIO', 'PERCENTAGE', 2, 'NORMAL', 'PRIOR_YEAR', 10, 'SYSTEM',
                2, 'DRAFT'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            -- Fetch actual v2 ID
            SELECT id INTO v_new_kpi_id FROM fin.kpi_definition
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND kpi_code = 'GROSS_MARGIN_PCT' AND version = 2
            LIMIT 1;

            IF v_new_kpi_id IS NULL THEN CONTINUE; END IF;

            -- Step through lifecycle: DRAFT → IN_REVIEW → APPROVED → EFFECTIVE
            UPDATE fin.kpi_definition
            SET status = 'IN_REVIEW', submitted_by = v_tenant, submitted_at = v_now - interval '12 days', updated_at = v_now
            WHERE id = v_new_kpi_id AND status = 'DRAFT';

            UPDATE fin.kpi_definition
            SET status = 'APPROVED', approved_by = v_tenant, approved_at = v_now - interval '11 days', updated_at = v_now
            WHERE id = v_new_kpi_id AND status = 'IN_REVIEW';

            UPDATE fin.kpi_definition
            SET status = 'EFFECTIVE', updated_at = v_now
            WHERE id = v_new_kpi_id AND status = 'APPROVED';

            -- Copy thresholds from v1 to v2
            INSERT INTO fin.kpi_threshold (tenant_id, kpi_id, severity, operator, threshold_value, label, color_code)
            SELECT v_tenant, v_new_kpi_id, severity, operator, threshold_value, label, color_code
            FROM fin.kpi_threshold
            WHERE kpi_id = v_old_kpi_id
            ON CONFLICT (tenant_id, kpi_id, severity, operator, threshold_value) DO NOTHING;

            -- Add new account bindings for v2 (more granular than v1)
            INSERT INTO fin.kpi_account_binding (kpi_id, ref_name, mapping_mode, account_type, balance_column, range_from, range_to)
            VALUES
                (v_new_kpi_id, 'REVENUE',          'TYPE',  'REVENUE', 'NET', null,   null),
                (v_new_kpi_id, 'DIRECT_MATERIALS',  'RANGE', null,      'NET', '5000', '5499'),
                (v_new_kpi_id, 'DIRECT_LABOR',      'RANGE', null,      'NET', '5500', '5999')
            ON CONFLICT DO NOTHING;

        END LOOP;

        RAISE NOTICE 'KPI supersession seeded for tenant % (GROSS_MARGIN_PCT v1→v2)', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- PART 2: STORY 1 — JANUARY 2026: CLEAN GOVERNED RELEASE
-- ############################################################################
-- Full pipeline: publication batch (PUBLISHED) → manifest items →
-- certification (CERTIFIED) → pack release (RELEASED) → distribution (SENT)
--
-- This release qualifies as clean close:
--   - Readiness 97% (threshold 90%)
--   - 0 overrides at cert time (threshold 2 for month-end)
--   - No exception signoff required
-- ============================================================================

DO $$
DECLARE
    v_tenant           uuid;
    v_code             text;
    v_entity           text;
    r                  record;       -- from _seed_release_ids
    v_batch_id         uuid;
    v_release_id       uuid;
    v_dist_id          uuid;
    v_manifest_hash    varchar(64);
    v_correlation_id   uuid;
    v_now              timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR r IN
            SELECT * FROM _seed_release_ids
            WHERE tenant_id = v_tenant
        LOOP
            v_correlation_id := gen_random_uuid();

            -- ==============================================================
            -- 2a. Publication Batch — PUBLISHED with manifest
            -- ==============================================================

            v_batch_id := gen_random_uuid();
            -- Deterministic manifest hash for demo data
            v_manifest_hash := encode(sha256(
                convert_to(format('manifest-%s-%s-2026-01', r.entity_code, v_code), 'UTF8')
            ), 'hex');

            INSERT INTO fin.publication_batch (
                id, tenant_id, entity_code,
                batch_code, description,
                fiscal_year, period_number, book_code,
                batch_type, pack_instance_id,
                status,
                kpi_item_count, planning_item_count,
                manifest_hash, manifest_item_count,
                finalized_by, finalized_at,
                published_by, published_at,
                created_by
            ) VALUES (
                v_batch_id, v_tenant, r.entity_code,
                format('PUB-FINAL-%s-2026-01', r.entity_code),
                'January 2026 — finalized and published KPI + planning batch for management pack.',
                2026, 1, 'STAT',
                'MIXED', r.pack_inst_jan,
                'PUBLISHED',
                4, 1,
                v_manifest_hash, 5,
                v_tenant, v_now - interval '16 days',
                v_tenant, v_now - interval '15 days',
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

            -- Update January certification to link to this batch
            UPDATE fin.pack_certification
            SET publication_batch_id = v_batch_id
            WHERE id = r.cert_jan;

            -- ==============================================================
            -- 2b. Publication Manifest Items (5 artifacts)
            -- ==============================================================
            -- These simulate published KPI execution results and a planning output.
            -- artifact_id uses deterministic UUIDs since actual kpi_execution rows
            -- may not exist — the manifest is the published record of truth.

            INSERT INTO fin.publication_manifest_item (
                tenant_id, entity_code, publication_batch_id,
                artifact_type, artifact_id,
                definition_code, definition_version,
                fiscal_year, period_number, book_code,
                published_value, published_currency,
                artifact_hash
            ) VALUES
                -- KPI 1: Gross Margin % = 42.3%
                (v_tenant, r.entity_code, v_batch_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'GROSS_MARGIN_PCT', 2,
                 2026, 1, 'STAT',
                 42.3000, null,
                 encode(sha256(convert_to('gm-pct-2026-01', 'UTF8')), 'hex')),

                -- KPI 2: Net Margin % = 12.8%
                (v_tenant, r.entity_code, v_batch_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'NET_MARGIN_PCT', 1,
                 2026, 1, 'STAT',
                 12.8000, null,
                 encode(sha256(convert_to('nm-pct-2026-01', 'UTF8')), 'hex')),

                -- KPI 3: Current Ratio = 2.15
                (v_tenant, r.entity_code, v_batch_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'CURRENT_RATIO', 1,
                 2026, 1, 'STAT',
                 2.1500, null,
                 encode(sha256(convert_to('cr-ratio-2026-01', 'UTF8')), 'hex')),

                -- KPI 4: Revenue Growth % = 8.4%
                (v_tenant, r.entity_code, v_batch_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'REVENUE_GROWTH_PCT', 1,
                 2026, 1, 'STAT',
                 8.4000, null,
                 encode(sha256(convert_to('rg-pct-2026-01', 'UTF8')), 'hex')),

                -- Planning output: Revenue forecast variance
                (v_tenant, r.entity_code, v_batch_id,
                 'PLANNING_OUTPUT', gen_random_uuid(),
                 'REV_FORECAST_BASE', 1,
                 2026, 1, 'STAT',
                 1250000.0000, 'USD',
                 encode(sha256(convert_to('rev-plan-2026-01', 'UTF8')), 'hex'))

            ON CONFLICT (publication_batch_id, artifact_type, artifact_id) DO NOTHING;

            -- ==============================================================
            -- 2c. Pack Release — RELEASED (clean close)
            -- ==============================================================

            v_release_id := gen_random_uuid();
            INSERT INTO fin.pack_release (
                id, tenant_id, entity_code,
                release_code, release_name, description,
                fiscal_year, period_from, period_to, book_code,
                release_type,
                pack_instance_id, publication_batch_id,
                certification_id, close_run_id, readiness_snapshot_id,
                status,
                -- Governance posture: clean close
                is_clean_close, override_count, override_impact_total,
                readiness_score, period_status_at_release,
                requires_exception_signoff,
                -- Lifecycle timestamps
                assembled_at, ready_at, released_at, released_by,
                created_by
            ) VALUES (
                v_release_id, v_tenant, r.entity_code,
                format('REL-CLEAN-%s-2026-01', r.entity_code),
                'January 2026 Management Pack — Clean Close',
                'Monthly management pack for January 2026. Clean close — all tasks complete, no overrides, 97% readiness.',
                2026, 1, 1, 'STAT',
                'MANAGEMENT_PACK',
                r.pack_inst_jan, v_batch_id,
                r.cert_jan, r.run_id_jan, r.snap_id_jan,
                'RELEASED',
                true, 0, 0.0000,
                97.00, 'HARD_CLOSED',
                false,
                v_now - interval '16 days',
                v_now - interval '15 days',
                v_now - interval '14 days',
                v_tenant,
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

            -- ==============================================================
            -- 2d. Distribution — SENT to CFO and Board
            -- ==============================================================

            v_dist_id := gen_random_uuid();
            INSERT INTO fin.pack_distribution (
                id, tenant_id, pack_instance_id,
                distribution_code, name, description,
                format, certification_id,
                distributed_by, distributed_at,
                status,
                recipient_count, delivered_count, viewed_count, downloaded_count,
                -- 206 columns
                publication_batch_id, artifact_hash
            ) VALUES (
                v_dist_id, v_tenant, r.pack_inst_jan,
                format('DIST-%s-2026-01-CFO', r.entity_code),
                'January 2026 Management Pack Distribution',
                'Monthly management pack distributed to CFO and Board members.',
                'PDF', r.cert_jan,
                v_tenant, v_now - interval '14 days',
                'SENT',
                3, 3, 2, 1,
                v_batch_id, v_manifest_hash
            ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

            -- Distribution recipients
            INSERT INTO fin.pack_distribution_recipient (
                distribution_id, recipient_name, recipient_email, recipient_role,
                delivery_status, sent_at, delivered_at,
                first_viewed_at, view_count
            ) VALUES
                (v_dist_id, 'Maria Santos', 'maria.santos@demo.com', 'CFO',
                 'DELIVERED', v_now - interval '14 days', v_now - interval '14 days',
                 v_now - interval '13 days', 3),
                (v_dist_id, 'James Liu', 'james.liu@demo.com', 'Controller',
                 'DELIVERED', v_now - interval '14 days', v_now - interval '14 days',
                 v_now - interval '13 days', 2),
                (v_dist_id, 'Robert Kim', 'robert.kim@demo.com', 'Board Member',
                 'DELIVERED', v_now - interval '14 days', v_now - interval '13 days',
                 v_now - interval '12 days', 1)
            ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

            -- ==============================================================
            -- 2e. Decision Log — ASSEMBLE, MARK_READY, RELEASE (all APPROVED)
            -- ==============================================================

            INSERT INTO fin.release_decision_log (
                tenant_id, entity_code, release_id,
                command, actor_id,
                policy_evaluation, result,
                correlation_id,
                publication_batch_id, certification_id,
                created_at
            ) VALUES
                -- Assemble decision
                (v_tenant, r.entity_code, v_release_id,
                 'ASSEMBLE', v_tenant,
                 jsonb_build_object(
                     'components_valid', true,
                     'pack_status', 'PUBLISHED',
                     'batch_status', 'PUBLISHED',
                     'certification_status', 'CERTIFIED'
                 ),
                 'APPROVED', v_correlation_id,
                 v_batch_id, r.cert_jan,
                 v_now - interval '16 days'),

                -- Mark ready decision (clean close evaluation)
                (v_tenant, r.entity_code, v_release_id,
                 'MARK_READY', v_tenant,
                 jsonb_build_object(
                     'is_clean', true,
                     'requires_exception_signoff', false,
                     'readiness_score', 97.00,
                     'override_count', 0,
                     'override_impact', 0,
                     'thresholds', jsonb_build_object(
                         'max_overrides', 2,
                         'min_readiness', 90.00,
                         'max_impact', 50000.00
                     ),
                     'disqualification_reasons', '[]'::jsonb
                 ),
                 'APPROVED', v_correlation_id,
                 v_batch_id, r.cert_jan,
                 v_now - interval '15 days'),

                -- Release decision
                (v_tenant, r.entity_code, v_release_id,
                 'RELEASE', v_tenant,
                 jsonb_build_object(
                     'gates_passed', jsonb_build_object(
                         'status_ready', true,
                         'batch_published', true,
                         'cert_approved_or_certified', true,
                         'exception_signoff_not_required', true,
                         'integrity_check', jsonb_build_object(
                             'passed', true,
                             'checks_run', 8,
                             'checks_passed', 8,
                             'failures', '[]'::jsonb
                         )
                     )
                 ),
                 'APPROVED', v_correlation_id,
                 v_batch_id, r.cert_jan,
                 v_now - interval '14 days'),

                -- Integrity check (separate log entry)
                (v_tenant, r.entity_code, v_release_id,
                 'INTEGRITY_CHECK', null,
                 jsonb_build_object(
                     'all_passed', true,
                     'check_count', 8,
                     'results', jsonb_build_object(
                         'component_linkage', 'PASS',
                         'batch_published', 'PASS',
                         'manifest_hash_valid', 'PASS',
                         'manifest_count_valid', 'PASS',
                         'consumer_state_consistent', 'PASS',
                         'batch_not_superseded', 'PASS',
                         'certification_valid', 'PASS',
                         'distributions_exist', 'PASS'
                     )
                 ),
                 'APPROVED', v_correlation_id,
                 v_batch_id, r.cert_jan,
                 v_now - interval '14 days');

            -- ==============================================================
            -- 2f. Notification Events — release completed
            -- ==============================================================

            INSERT INTO fin.release_notification_event (
                tenant_id, entity_code, release_id,
                event_code, severity, summary,
                detail_payload, processed, processed_at
            ) VALUES
                (v_tenant, r.entity_code, v_release_id,
                 'RELEASE_READY', 'INFO',
                 format('January 2026 Management Pack ready for release — clean close, 97%% readiness.'),
                 jsonb_build_object(
                     'release_code', format('REL-CLEAN-%s-2026-01', r.entity_code),
                     'is_clean_close', true,
                     'readiness_score', 97.00
                 ),
                 true, v_now - interval '15 days'),
                (v_tenant, r.entity_code, v_release_id,
                 'RELEASE_COMPLETED', 'INFO',
                 format('January 2026 Management Pack released and distributed to 3 recipients.'),
                 jsonb_build_object(
                     'release_code', format('REL-CLEAN-%s-2026-01', r.entity_code),
                     'distribution_count', 1,
                     'recipient_count', 3
                 ),
                 true, v_now - interval '14 days');

            -- ==============================================================
            -- 2g. SLA Snapshot — January release timing
            -- ==============================================================

            INSERT INTO fin.release_sla_snapshot (
                tenant_id, entity_code, release_id,
                fiscal_year, period_number,
                close_start_date, close_hard_close_target, close_hard_close_actual,
                close_duration_hours,
                assembly_duration_hours,
                certification_wait_hours,
                exception_signoff_wait_hours,
                release_to_distribution_hours,
                total_pipeline_hours,
                close_sla_met, release_type,
                override_count, is_clean_close,
                captured_at
            ) VALUES (
                v_tenant, r.entity_code, v_release_id,
                2026, 1,
                '2026-02-01'::date, '2026-02-08'::date, '2026-02-05'::date,
                72.00,      -- 3 working days close
                24.00,      -- 1 day assembly
                48.00,      -- 2 days certification wait
                0.00,       -- no exception signoff needed
                2.00,       -- 2 hours release → distribution
                146.00,     -- total pipeline
                true, 'MANAGEMENT_PACK',
                0, true,
                v_now - interval '13 days'
            ) ON CONFLICT DO NOTHING;

            -- Store Story 1 IDs for Story 2 reference
            ALTER TABLE _seed_release_ids
                ADD COLUMN IF NOT EXISTS batch_jan     uuid,
                ADD COLUMN IF NOT EXISTS release_jan   uuid,
                ADD COLUMN IF NOT EXISTS dist_jan      uuid;

            UPDATE _seed_release_ids
            SET batch_jan   = v_batch_id,
                release_jan = v_release_id,
                dist_jan    = v_dist_id
            WHERE tenant_id = v_tenant
              AND entity_code = r.entity_code;

        END LOOP;

        RAISE NOTICE 'Story 1 (clean release) seeded for tenant %', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- PART 3: STORY 2 — FEBRUARY 2026: SUPERSEDED / EXCEPTION-BASED RELEASE
-- ############################################################################
-- Full supersession pipeline:
--   Phase A: Initial release under override pressure
--     - 3 approved overrides (high override density)
--     - Readiness 82% (below 90% threshold → not clean close)
--     - Exception signoff required and granted by CFO
--     - Batch A published, Release A released with exception
--   Phase B: Supersession
--     - Material error discovered in published data
--     - Batch A superseded by Batch B
--     - Certification A becomes INVALIDATED (207 semantics)
--     - Distribution A recalled
--     - Batch B published, Release B released
-- ============================================================================

DO $$
DECLARE
    v_tenant             uuid;
    v_code               text;
    r                    record;
    -- Phase A IDs
    v_batch_a_id         uuid;
    v_release_a_id       uuid;
    v_dist_a_id          uuid;
    v_manifest_hash_a    varchar(64);
    v_corr_a             uuid;
    -- Phase B IDs
    v_batch_b_id         uuid;
    v_release_b_id       uuid;
    v_cert_feb_b         uuid;
    v_dist_b_id          uuid;
    v_manifest_hash_b    varchar(64);
    v_corr_b             uuid;
    -- Override IDs
    v_task_id            uuid;
    v_now                timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR r IN
            SELECT * FROM _seed_release_ids
            WHERE tenant_id = v_tenant
        LOOP
            v_corr_a := gen_random_uuid();
            v_corr_b := gen_random_uuid();

            -- ==============================================================
            -- 3a. February Close Overrides (3 approved — high pressure)
            -- ==============================================================

            -- Override 1: IMMATERIAL on INV_VALUATION
            SELECT t.id INTO v_task_id
            FROM fin.period_close_task t
            WHERE t.tenant_id = v_tenant
              AND t.entity_code = r.entity_code
              AND t.task_code = 'INV_VALUATION';

            IF v_task_id IS NOT NULL THEN
                INSERT INTO fin.close_override (
                    tenant_id, entity_code,
                    override_scope, run_id, task_id,
                    reason_code, reason_subcode, reason_detail,
                    impact_amount, impact_currency,
                    applies_to_transition,
                    status, requested_by, requested_at,
                    decided_by, decided_at, decision_notes,
                    evidence_payload
                ) VALUES (
                    v_tenant, r.entity_code,
                    'TASK', r.run_id_feb, v_task_id,
                    'IMMATERIAL', 'BELOW_THRESHOLD',
                    'Inventory valuation shows $3,200 variance on slow-moving stock. Below $5K threshold.',
                    3200.0000, 'USD',
                    'SOFT_CLOSE',
                    'APPROVED', v_tenant, v_now - interval '6 days',
                    v_tenant, v_now - interval '5 days',
                    'Approved — variance is immaterial and self-correcting in March write-down.',
                    jsonb_build_object('category', 'slow-moving', 'age_days', 180)
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- Override 2: TIMING on TAX_PROVISION
            SELECT t.id INTO v_task_id
            FROM fin.period_close_task t
            WHERE t.tenant_id = v_tenant
              AND t.entity_code = r.entity_code
              AND t.task_code = 'TAX_PROVISION';

            IF v_task_id IS NOT NULL THEN
                INSERT INTO fin.close_override (
                    tenant_id, entity_code,
                    override_scope, run_id, task_id,
                    reason_code, reason_subcode, reason_detail,
                    impact_amount, impact_currency,
                    applies_to_transition,
                    status, requested_by, requested_at,
                    decided_by, decided_at, decision_notes,
                    evidence_payload
                ) VALUES (
                    v_tenant, r.entity_code,
                    'TASK', r.run_id_feb, v_task_id,
                    'TIMING', 'ACCRUAL_REVERSAL',
                    'February tax provision delayed — R&D credit documentation pending from engineering. Estimated provision accrued.',
                    28000.0000, 'USD',
                    'BOTH',
                    'APPROVED', v_tenant, v_now - interval '5 days',
                    v_tenant, v_now - interval '4 days',
                    'Approved — estimated provision is conservative. Final adjustment expected in March.',
                    jsonb_build_object('credit_type', 'R&D', 'estimated_credit', 28000.00, 'confidence', 'high')
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- Override 3: MANAGEMENT_JUDGEMENT on CUTOFF_REVIEW
            SELECT t.id INTO v_task_id
            FROM fin.period_close_task t
            WHERE t.tenant_id = v_tenant
              AND t.entity_code = r.entity_code
              AND t.task_code = 'CUTOFF_REVIEW';

            IF v_task_id IS NOT NULL THEN
                INSERT INTO fin.close_override (
                    tenant_id, entity_code,
                    override_scope, run_id, task_id,
                    reason_code, reason_subcode, reason_detail,
                    impact_amount, impact_currency,
                    applies_to_transition,
                    status, requested_by, requested_at,
                    decided_by, decided_at, decision_notes,
                    evidence_payload
                ) VALUES (
                    v_tenant, r.entity_code,
                    'TASK', r.run_id_feb, v_task_id,
                    'MANAGEMENT_JUDGEMENT', 'MATERIALITY_OVERRIDE',
                    'Large contract straddling Feb/Mar cutoff — CFO judgement to recognize $14,550 in February based on delivery milestones.',
                    14550.0000, 'USD',
                    'HARD_CLOSE',
                    'APPROVED', v_tenant, v_now - interval '4 days',
                    v_tenant, v_now - interval '3 days',
                    'CFO approved — delivery milestones evidenced. Revenue recognition criteria met per ASC 606.',
                    jsonb_build_object('contract_ref', 'CTR-2026-087', 'milestone', 'Phase 2 delivery', 'asc606_criteria', 'met')
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- ==============================================================
            -- 3b. Phase A: Initial Batch A — PUBLISHED (will be superseded)
            -- ==============================================================

            v_batch_a_id := gen_random_uuid();
            v_manifest_hash_a := encode(sha256(
                convert_to(format('manifest-%s-%s-2026-02-A', r.entity_code, v_code), 'UTF8')
            ), 'hex');

            INSERT INTO fin.publication_batch (
                id, tenant_id, entity_code,
                batch_code, description,
                fiscal_year, period_number, book_code,
                batch_type, pack_instance_id,
                status,
                kpi_item_count, planning_item_count,
                manifest_hash, manifest_item_count,
                finalized_by, finalized_at,
                published_by, published_at,
                created_by
            ) VALUES (
                v_batch_a_id, v_tenant, r.entity_code,
                format('PUB-%s-2026-02-A', r.entity_code),
                'February 2026 Batch A — initial publication with 3 overrides.',
                2026, 2, 'STAT',
                'MIXED', r.pack_inst_feb,
                'PUBLISHED',
                3, 1,
                v_manifest_hash_a, 4,
                v_tenant, v_now - interval '2 days',
                v_tenant, v_now - interval '1 day',
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

            -- Link certification A to batch A
            UPDATE fin.pack_certification
            SET publication_batch_id = v_batch_a_id
            WHERE id = r.cert_feb_a;

            -- Manifest items for Batch A
            INSERT INTO fin.publication_manifest_item (
                tenant_id, entity_code, publication_batch_id,
                artifact_type, artifact_id,
                definition_code, definition_version,
                fiscal_year, period_number, book_code,
                published_value, published_currency,
                artifact_hash
            ) VALUES
                (v_tenant, r.entity_code, v_batch_a_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'GROSS_MARGIN_PCT', 2, 2026, 2, 'STAT',
                 39.1000, null,
                 encode(sha256(convert_to('gm-pct-2026-02-A', 'UTF8')), 'hex')),
                (v_tenant, r.entity_code, v_batch_a_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'NET_MARGIN_PCT', 1, 2026, 2, 'STAT',
                 10.2000, null,
                 encode(sha256(convert_to('nm-pct-2026-02-A', 'UTF8')), 'hex')),
                (v_tenant, r.entity_code, v_batch_a_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'CURRENT_RATIO', 1, 2026, 2, 'STAT',
                 1.85, null,
                 encode(sha256(convert_to('cr-ratio-2026-02-A', 'UTF8')), 'hex')),
                (v_tenant, r.entity_code, v_batch_a_id,
                 'PLANNING_OUTPUT', gen_random_uuid(),
                 'REV_FORECAST_BASE', 1, 2026, 2, 'STAT',
                 1180000.0000, 'USD',
                 encode(sha256(convert_to('rev-plan-2026-02-A', 'UTF8')), 'hex'))
            ON CONFLICT (publication_batch_id, artifact_type, artifact_id) DO NOTHING;

            -- ==============================================================
            -- 3c. Phase A: Release A — RELEASED with exception signoff
            -- ==============================================================

            v_release_a_id := gen_random_uuid();
            INSERT INTO fin.pack_release (
                id, tenant_id, entity_code,
                release_code, release_name, description,
                fiscal_year, period_from, period_to, book_code,
                release_type,
                pack_instance_id, publication_batch_id,
                certification_id, close_run_id, readiness_snapshot_id,
                status,
                -- Not clean close — exception signoff required and granted
                is_clean_close, override_count, override_impact_total,
                readiness_score, period_status_at_release,
                requires_exception_signoff,
                exception_signoff_by, exception_signoff_at, exception_signoff_notes,
                assembled_at, ready_at, released_at, released_by,
                created_by
            ) VALUES (
                v_release_a_id, v_tenant, r.entity_code,
                format('REL-EXC-%s-2026-02-A', r.entity_code),
                'February 2026 Management Pack — Exception Release (Superseded)',
                'Monthly management pack for February 2026. Released with CFO exception signoff due to 3 overrides and 82% readiness.',
                2026, 2, 2, 'STAT',
                'MANAGEMENT_PACK',
                r.pack_inst_feb, v_batch_a_id,
                r.cert_feb_a, r.run_id_feb, r.snap_id_feb,
                'SUPERSEDED',
                false, 3, 45750.0000,
                82.00, 'SOFT_CLOSED',
                true,
                v_tenant, v_now - interval '18 hours',
                'CFO exception signoff: 3 overrides totaling $45,750 accepted. All overrides have documented evidence and are within acceptable risk tolerance for month-end.',
                v_now - interval '2 days',
                v_now - interval '1 day',
                v_now - interval '18 hours',
                v_tenant,
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

            -- Distribution A — initially SENT, then RECALLED
            v_dist_a_id := gen_random_uuid();
            INSERT INTO fin.pack_distribution (
                id, tenant_id, pack_instance_id,
                distribution_code, name, description,
                format, certification_id,
                distributed_by, distributed_at,
                status,
                recipient_count, delivered_count, viewed_count, downloaded_count,
                publication_batch_id, artifact_hash,
                recalled_by, recalled_at, recall_reason
            ) VALUES (
                v_dist_a_id, v_tenant, r.pack_inst_feb,
                format('DIST-%s-2026-02-A', r.entity_code),
                'February 2026 Pack Distribution A (Recalled)',
                'Initial distribution recalled due to material error in Gross Margin calculation.',
                'PDF', r.cert_feb_a,
                v_tenant, v_now - interval '16 hours',
                'RECALLED',
                2, 2, 1, 0,
                v_batch_a_id, v_manifest_hash_a,
                v_tenant, v_now - interval '8 hours',
                'Material error discovered: Gross Margin calculation used incorrect COGS accrual. Batch superseded — replacement distribution to follow.'
            ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

            INSERT INTO fin.pack_distribution_recipient (
                distribution_id, recipient_name, recipient_email, recipient_role,
                delivery_status, sent_at, delivered_at,
                first_viewed_at, view_count
            ) VALUES
                (v_dist_a_id, 'Maria Santos', 'maria.santos@demo.com', 'CFO',
                 'DELIVERED', v_now - interval '16 hours', v_now - interval '16 hours',
                 v_now - interval '14 hours', 1),
                (v_dist_a_id, 'James Liu', 'james.liu@demo.com', 'Controller',
                 'DELIVERED', v_now - interval '16 hours', v_now - interval '15 hours',
                 null, 0)
            ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

            -- ==============================================================
            -- 3d. Phase B: Supersession — Batch B replaces Batch A
            -- ==============================================================

            -- Supersede Batch A
            UPDATE fin.publication_batch
            SET status = 'SUPERSEDED',
                updated_at = v_now - interval '6 hours'
            WHERE id = v_batch_a_id;

            -- INVALIDATE Certification A (207 semantics — not REJECTED)
            UPDATE fin.pack_certification
            SET certification_status = 'INVALIDATED',
                certification_notes = 'Certification invalidated due to publication batch supersession. Material error in COGS accrual affected Gross Margin calculation.',
                updated_at = v_now - interval '6 hours'
            WHERE id = r.cert_feb_a;

            -- Create Batch B — corrected publication
            v_batch_b_id := gen_random_uuid();
            v_manifest_hash_b := encode(sha256(
                convert_to(format('manifest-%s-%s-2026-02-B', r.entity_code, v_code), 'UTF8')
            ), 'hex');

            INSERT INTO fin.publication_batch (
                id, tenant_id, entity_code,
                batch_code, description,
                fiscal_year, period_number, book_code,
                batch_type, pack_instance_id,
                status,
                kpi_item_count, planning_item_count,
                manifest_hash, manifest_item_count,
                finalized_by, finalized_at,
                published_by, published_at,
                supersedes_id,
                created_by
            ) VALUES (
                v_batch_b_id, v_tenant, r.entity_code,
                format('PUB-%s-2026-02-B', r.entity_code),
                'February 2026 Batch B — corrected publication superseding Batch A. COGS accrual fixed.',
                2026, 2, 'STAT',
                'MIXED', r.pack_inst_feb,
                'PUBLISHED',
                3, 1,
                v_manifest_hash_b, 4,
                v_tenant, v_now - interval '5 hours',
                v_tenant, v_now - interval '4 hours',
                v_batch_a_id,
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

            -- Manifest items for Batch B (corrected values)
            INSERT INTO fin.publication_manifest_item (
                tenant_id, entity_code, publication_batch_id,
                artifact_type, artifact_id,
                definition_code, definition_version,
                fiscal_year, period_number, book_code,
                published_value, published_currency,
                artifact_hash
            ) VALUES
                -- Corrected Gross Margin: was 39.1%, now 36.8% (COGS accrual was understated)
                (v_tenant, r.entity_code, v_batch_b_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'GROSS_MARGIN_PCT', 2, 2026, 2, 'STAT',
                 36.8000, null,
                 encode(sha256(convert_to('gm-pct-2026-02-B', 'UTF8')), 'hex')),
                -- Net Margin adjusted: was 10.2%, now 8.9%
                (v_tenant, r.entity_code, v_batch_b_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'NET_MARGIN_PCT', 1, 2026, 2, 'STAT',
                 8.9000, null,
                 encode(sha256(convert_to('nm-pct-2026-02-B', 'UTF8')), 'hex')),
                -- Current Ratio unchanged
                (v_tenant, r.entity_code, v_batch_b_id,
                 'KPI_EXECUTION', gen_random_uuid(),
                 'CURRENT_RATIO', 1, 2026, 2, 'STAT',
                 1.85, null,
                 encode(sha256(convert_to('cr-ratio-2026-02-B', 'UTF8')), 'hex')),
                -- Planning output unchanged
                (v_tenant, r.entity_code, v_batch_b_id,
                 'PLANNING_OUTPUT', gen_random_uuid(),
                 'REV_FORECAST_BASE', 1, 2026, 2, 'STAT',
                 1180000.0000, 'USD',
                 encode(sha256(convert_to('rev-plan-2026-02-B', 'UTF8')), 'hex'))
            ON CONFLICT (publication_batch_id, artifact_type, artifact_id) DO NOTHING;

            -- ==============================================================
            -- 3e. Phase B: New Certification B + Release B
            -- ==============================================================

            -- Fresh certification for corrected data
            v_cert_feb_b := gen_random_uuid();
            INSERT INTO fin.pack_certification (
                id, tenant_id, pack_instance_id,
                prepared_by, prepared_by_name, prepared_at,
                reviewed_by, reviewed_by_name, reviewed_at, review_notes,
                approved_by, approved_by_name, approved_at, approval_notes,
                certified_by, certified_by_name, certified_at, certification_notes,
                certification_status,
                publication_batch_id,
                close_run_id, readiness_snapshot_id,
                active_override_count, override_impact_total,
                readiness_score_at_cert, period_status_at_cert
            ) VALUES (
                v_cert_feb_b, v_tenant, r.pack_inst_feb,
                v_tenant, 'Sarah Chen (Senior Accountant)', v_now - interval '4 hours',
                v_tenant, 'James Liu (Controller)', v_now - interval '3 hours',
                'Corrected COGS accrual verified. Gross Margin recalculated from 39.1% to 36.8%. All other KPIs validated.',
                v_tenant, 'James Liu (Controller)', v_now - interval '2 hours',
                'Approved — correction is material ($42K COGS adjustment). Expedited certification for re-release.',
                v_tenant, 'Maria Santos (CFO)', v_now - interval '1 hour',
                'Re-certified after COGS correction. Prior certification invalidated. Supersession chain documented.',
                'CERTIFIED',
                v_batch_b_id,
                r.run_id_feb, r.snap_id_feb,
                3, 45750.0000,
                82.00, 'SOFT_CLOSED'
            ) ON CONFLICT DO NOTHING;

            -- Supersede Release A
            UPDATE fin.pack_release
            SET status = 'SUPERSEDED',
                superseded_at = v_now - interval '5 hours',
                supersession_reason = 'Material error in COGS accrual affected Gross Margin calculation. Batch A superseded by corrected Batch B.',
                updated_at = v_now - interval '5 hours'
            WHERE id = v_release_a_id;

            -- Release B — replacement release (still requires exception signoff)
            v_release_b_id := gen_random_uuid();
            INSERT INTO fin.pack_release (
                id, tenant_id, entity_code,
                release_code, release_name, description,
                fiscal_year, period_from, period_to, book_code,
                release_type,
                pack_instance_id, publication_batch_id,
                certification_id, close_run_id, readiness_snapshot_id,
                status,
                is_clean_close, override_count, override_impact_total,
                readiness_score, period_status_at_release,
                requires_exception_signoff,
                exception_signoff_by, exception_signoff_at, exception_signoff_notes,
                assembled_at, ready_at, released_at, released_by,
                supersedes_id,
                created_by
            ) VALUES (
                v_release_b_id, v_tenant, r.entity_code,
                format('REL-EXC-%s-2026-02-B', r.entity_code),
                'February 2026 Management Pack — Corrected Release',
                'Replacement release after COGS accrual correction. Supersedes initial February release.',
                2026, 2, 2, 'STAT',
                'MANAGEMENT_PACK',
                r.pack_inst_feb, v_batch_b_id,
                v_cert_feb_b, r.run_id_feb, r.snap_id_feb,
                'RELEASED',
                false, 3, 45750.0000,
                82.00, 'SOFT_CLOSED',
                true,
                v_tenant, v_now - interval '45 minutes',
                'CFO exception signoff for corrected release: same override profile as prior release. COGS correction verified independently.',
                v_now - interval '4 hours',
                v_now - interval '1 hour',
                v_now - interval '30 minutes',
                v_tenant,
                v_release_a_id,
                v_tenant
            ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

            -- Distribution B — replacement (SENT)
            v_dist_b_id := gen_random_uuid();
            INSERT INTO fin.pack_distribution (
                id, tenant_id, pack_instance_id,
                distribution_code, name, description,
                format, certification_id,
                distributed_by, distributed_at,
                status,
                recipient_count, delivered_count, viewed_count, downloaded_count,
                publication_batch_id, artifact_hash
            ) VALUES (
                v_dist_b_id, v_tenant, r.pack_inst_feb,
                format('DIST-%s-2026-02-B', r.entity_code),
                'February 2026 Pack Distribution B (Corrected)',
                'Replacement distribution with corrected COGS and Gross Margin figures.',
                'PDF', v_cert_feb_b,
                v_tenant, v_now - interval '20 minutes',
                'SENT',
                2, 2, 0, 0,
                v_batch_b_id, v_manifest_hash_b
            ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

            INSERT INTO fin.pack_distribution_recipient (
                distribution_id, recipient_name, recipient_email, recipient_role,
                delivery_status, sent_at, delivered_at
            ) VALUES
                (v_dist_b_id, 'Maria Santos', 'maria.santos@demo.com', 'CFO',
                 'DELIVERED', v_now - interval '20 minutes', v_now - interval '19 minutes'),
                (v_dist_b_id, 'James Liu', 'james.liu@demo.com', 'Controller',
                 'DELIVERED', v_now - interval '20 minutes', v_now - interval '18 minutes')
            ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

            -- ==============================================================
            -- 3f. Decision Log — Story 2 (both phases)
            -- ==============================================================

            INSERT INTO fin.release_decision_log (
                tenant_id, entity_code, release_id,
                command, actor_id,
                policy_evaluation, result,
                correlation_id,
                publication_batch_id, certification_id,
                created_at
            ) VALUES
                -- Phase A: Mark ready — NOT clean close, exception required
                (v_tenant, r.entity_code, v_release_a_id,
                 'MARK_READY', v_tenant,
                 jsonb_build_object(
                     'is_clean', false,
                     'requires_exception_signoff', true,
                     'readiness_score', 82.00,
                     'override_count', 3,
                     'override_impact', 45750.00,
                     'thresholds', jsonb_build_object(
                         'max_overrides', 2,
                         'min_readiness', 90.00,
                         'max_impact', 50000.00
                     ),
                     'disqualification_reasons', jsonb_build_array(
                         'Override count 3 exceeds threshold 2',
                         'Readiness score 82.00 below threshold 90.00'
                     )
                 ),
                 'APPROVED', v_corr_a,
                 v_batch_a_id, r.cert_feb_a,
                 v_now - interval '1 day'),

                -- Phase A: Exception signoff granted
                (v_tenant, r.entity_code, v_release_a_id,
                 'EXCEPTION_SIGNOFF', v_tenant,
                 jsonb_build_object(
                     'signoff_by', 'Maria Santos (CFO)',
                     'override_count', 3,
                     'total_impact', 45750.00,
                     'reason', 'All overrides documented with evidence. Risk accepted.'
                 ),
                 'APPROVED', v_corr_a,
                 v_batch_a_id, r.cert_feb_a,
                 v_now - interval '18 hours'),

                -- Phase A: Release A
                (v_tenant, r.entity_code, v_release_a_id,
                 'RELEASE', v_tenant,
                 jsonb_build_object(
                     'gates_passed', jsonb_build_object(
                         'status_ready', true,
                         'batch_published', true,
                         'cert_approved_or_certified', true,
                         'exception_signoff_granted', true,
                         'integrity_check', jsonb_build_object(
                             'passed', true,
                             'checks_run', 8,
                             'checks_passed', 8,
                             'failures', '[]'::jsonb
                         )
                     )
                 ),
                 'APPROVED', v_corr_a,
                 v_batch_a_id, r.cert_feb_a,
                 v_now - interval '16 hours'),

                -- Phase B: Supersede Release A
                (v_tenant, r.entity_code, v_release_a_id,
                 'SUPERSEDE', v_tenant,
                 jsonb_build_object(
                     'reason', 'Material COGS accrual error',
                     'impact', jsonb_build_object(
                         'gross_margin_change', '-2.3 pp (39.1% → 36.8%)',
                         'cogs_adjustment', 42000.00,
                         'affected_kpis', jsonb_build_array('GROSS_MARGIN_PCT', 'NET_MARGIN_PCT')
                     ),
                     'cascade', jsonb_build_object(
                         'batch_a_superseded', true,
                         'cert_a_invalidated', true,
                         'dist_a_recalled', true
                     )
                 ),
                 'APPROVED', v_corr_b,
                 v_batch_a_id, r.cert_feb_a,
                 v_now - interval '6 hours'),

                -- Phase B: Integrity check on Release B (PASS)
                (v_tenant, r.entity_code, v_release_b_id,
                 'INTEGRITY_CHECK', null,
                 jsonb_build_object(
                     'all_passed', true,
                     'check_count', 8,
                     'results', jsonb_build_object(
                         'component_linkage', 'PASS',
                         'batch_published', 'PASS',
                         'manifest_hash_valid', 'PASS',
                         'manifest_count_valid', 'PASS',
                         'consumer_state_consistent', 'PASS',
                         'batch_not_superseded', 'PASS',
                         'certification_valid', 'PASS',
                         'distributions_exist', 'PASS'
                     )
                 ),
                 'APPROVED', v_corr_b,
                 v_batch_b_id, v_cert_feb_b,
                 v_now - interval '1 hour'),

                -- Phase B: Release B
                (v_tenant, r.entity_code, v_release_b_id,
                 'RELEASE', v_tenant,
                 jsonb_build_object(
                     'gates_passed', jsonb_build_object(
                         'status_ready', true,
                         'batch_published', true,
                         'cert_approved_or_certified', true,
                         'exception_signoff_granted', true,
                         'integrity_check', jsonb_build_object(
                             'passed', true,
                             'checks_run', 8,
                             'checks_passed', 8
                         )
                     ),
                     'supersedes', format('REL-EXC-%s-2026-02-A', r.entity_code)
                 ),
                 'APPROVED', v_corr_b,
                 v_batch_b_id, v_cert_feb_b,
                 v_now - interval '30 minutes'),

                -- Integrity check on Release A (FAIL — batch superseded)
                -- This demonstrates the "red" integrity state for dashboards
                (v_tenant, r.entity_code, v_release_a_id,
                 'INTEGRITY_CHECK', null,
                 jsonb_build_object(
                     'all_passed', false,
                     'check_count', 8,
                     'checks_passed', 6,
                     'results', jsonb_build_object(
                         'component_linkage', 'PASS',
                         'batch_published', 'FAIL: batch status is SUPERSEDED',
                         'manifest_hash_valid', 'PASS',
                         'manifest_count_valid', 'PASS',
                         'consumer_state_consistent', 'PASS',
                         'batch_not_superseded', 'FAIL: batch has been superseded by PUB-*-2026-02-B',
                         'certification_valid', 'FAIL: certification status is INVALIDATED',
                         'distributions_exist', 'PASS (recalled)'
                     ),
                     'recommendation', 'Release has been superseded. Do not redistribute.'
                 ),
                 'BLOCKED', v_corr_b,
                 v_batch_a_id, r.cert_feb_a,
                 v_now - interval '5 hours');

            -- ==============================================================
            -- 3g. Notification Events — Story 2
            -- ==============================================================

            INSERT INTO fin.release_notification_event (
                tenant_id, entity_code, release_id,
                event_code, severity, summary,
                detail_payload, processed, processed_at
            ) VALUES
                -- Exception signoff required (HIGH severity)
                (v_tenant, r.entity_code, v_release_a_id,
                 'EXCEPTION_SIGNOFF_REQUIRED', 'HIGH',
                 'February 2026 Management Pack requires CFO exception signoff — 3 overrides, 82% readiness.',
                 jsonb_build_object(
                     'override_count', 3,
                     'override_impact', 45750.00,
                     'readiness_score', 82.00,
                     'disqualification_reasons', jsonb_build_array(
                         'Override count exceeds threshold',
                         'Readiness below minimum'
                     )
                 ),
                 true, v_now - interval '1 day'),

                -- Exception signoff granted
                (v_tenant, r.entity_code, v_release_a_id,
                 'EXCEPTION_SIGNOFF_GRANTED', 'INFO',
                 'CFO exception signoff granted for February 2026 Management Pack.',
                 jsonb_build_object('signoff_by', 'Maria Santos (CFO)'),
                 true, v_now - interval '18 hours'),

                -- Release A completed
                (v_tenant, r.entity_code, v_release_a_id,
                 'RELEASE_COMPLETED', 'INFO',
                 'February 2026 Management Pack (A) released with exception signoff.',
                 jsonb_build_object('distribution_count', 1, 'recipient_count', 2),
                 true, v_now - interval '16 hours'),

                -- Batch superseded (WARNING)
                (v_tenant, r.entity_code, v_release_a_id,
                 'BATCH_SUPERSEDED', 'WARNING',
                 'Publication Batch A superseded due to material COGS accrual error. Gross Margin corrected from 39.1% to 36.8%.',
                 jsonb_build_object(
                     'old_batch', format('PUB-%s-2026-02-A', r.entity_code),
                     'new_batch', format('PUB-%s-2026-02-B', r.entity_code),
                     'error_type', 'COGS accrual understatement',
                     'impact', '2.3 percentage point reduction in Gross Margin'
                 ),
                 true, v_now - interval '6 hours'),

                -- Certification invalidated (HIGH)
                (v_tenant, r.entity_code, v_release_a_id,
                 'CERTIFICATION_INVALIDATED', 'HIGH',
                 'Certification on February pack invalidated following publication supersession.',
                 jsonb_build_object(
                     'certification_id', r.cert_feb_a,
                     'reason', 'Publication batch superseded'
                 ),
                 true, v_now - interval '6 hours'),

                -- Distribution recalled (HIGH)
                (v_tenant, r.entity_code, v_release_a_id,
                 'DISTRIBUTION_RECALLED', 'HIGH',
                 'February 2026 Distribution A recalled — recipients notified of pending correction.',
                 jsonb_build_object(
                     'distribution_code', format('DIST-%s-2026-02-A', r.entity_code),
                     'recipient_count', 2,
                     'recall_reason', 'Material COGS accrual error'
                 ),
                 true, v_now - interval '6 hours'),

                -- Release B superseded Release A
                (v_tenant, r.entity_code, v_release_a_id,
                 'RELEASE_SUPERSEDED', 'WARNING',
                 format('February 2026 Release A superseded by corrected Release B.'),
                 jsonb_build_object(
                     'old_release', format('REL-EXC-%s-2026-02-A', r.entity_code),
                     'new_release', format('REL-EXC-%s-2026-02-B', r.entity_code)
                 ),
                 true, v_now - interval '5 hours'),

                -- Release B completed (replacement)
                (v_tenant, r.entity_code, v_release_b_id,
                 'RELEASE_COMPLETED', 'INFO',
                 'February 2026 corrected Management Pack released. Supersedes prior release.',
                 jsonb_build_object(
                     'distribution_count', 1,
                     'recipient_count', 2,
                     'supersedes', format('REL-EXC-%s-2026-02-A', r.entity_code)
                 ),
                 false, null);  -- Latest notification not yet processed

            -- ==============================================================
            -- 3h. SLA Snapshots — Story 2 (both releases)
            -- ==============================================================

            -- Release A SLA (before supersession)
            INSERT INTO fin.release_sla_snapshot (
                tenant_id, entity_code, release_id,
                fiscal_year, period_number,
                close_start_date, close_hard_close_target, close_hard_close_actual,
                close_duration_hours,
                assembly_duration_hours,
                certification_wait_hours,
                exception_signoff_wait_hours,
                release_to_distribution_hours,
                total_pipeline_hours,
                close_sla_met, release_type,
                override_count, is_clean_close,
                captured_at
            ) VALUES (
                v_tenant, r.entity_code, v_release_a_id,
                2026, 2,
                '2026-03-01'::date, '2026-03-08'::date, null,  -- hard close not yet reached
                120.00,     -- 5 working days so far
                48.00,      -- 2 days assembly
                24.00,      -- 1 day certification
                6.00,       -- 6 hours waiting for CFO exception signoff
                2.00,       -- 2 hours release → distribution
                200.00,     -- total pipeline
                null, 'MANAGEMENT_PACK',
                3, false,
                v_now - interval '15 hours'
            ) ON CONFLICT DO NOTHING;

            -- Release B SLA (corrected release — faster pipeline)
            INSERT INTO fin.release_sla_snapshot (
                tenant_id, entity_code, release_id,
                fiscal_year, period_number,
                close_start_date, close_hard_close_target, close_hard_close_actual,
                close_duration_hours,
                assembly_duration_hours,
                certification_wait_hours,
                exception_signoff_wait_hours,
                release_to_distribution_hours,
                total_pipeline_hours,
                close_sla_met, release_type,
                override_count, is_clean_close,
                captured_at
            ) VALUES (
                v_tenant, r.entity_code, v_release_b_id,
                2026, 2,
                '2026-03-01'::date, '2026-03-08'::date, null,
                120.00,     -- same close duration
                4.00,       -- 4 hours expedited assembly
                3.00,       -- 3 hours expedited certification
                0.75,       -- 45 minutes exception signoff (CFO aware of situation)
                0.33,       -- 20 minutes release → distribution
                128.08,     -- total pipeline (faster due to urgency)
                null, 'MANAGEMENT_PACK',
                3, false,
                v_now - interval '10 minutes'
            ) ON CONFLICT DO NOTHING;

        END LOOP;

        RAISE NOTICE 'Story 2 (supersession/exception) seeded for tenant %', v_code;
    END LOOP;
END $$;


-- ############################################################################
-- CLEANUP: Drop temporary table
-- ############################################################################

DROP TABLE IF EXISTS _seed_release_ids;
