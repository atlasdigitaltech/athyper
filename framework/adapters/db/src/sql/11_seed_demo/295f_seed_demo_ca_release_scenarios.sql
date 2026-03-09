/* ============================================================================
   Athyper v2.7 — Demo Canada: Extended Release Control Tower Scenarios
   Dependencies: 295e_seed_demo_release_completion.sql (runs after base seeds)

   Seeds additional release stories ONLY for demo_ca tenant to populate the
   Release Control Tower dashboard with a wider variety of lifecycle states,
   release types, and governance postures.

   Entity codes for demo_ca: LE-CA, LE-MY, LE-SA, LE-IN

   Stories seeded (all for LE-CA unless noted):

     Story 3 — March 2026 (Q1): Board Pack — Quarterly Clean Close
       - Quarterly close (P1–P3), stricter thresholds (max 1 override, 95%)
       - Readiness 96%, 0 overrides → clean close
       - Board Pack type, distributed to Board + Audit Committee
       - Shows multi-period release

     Story 4 — March 2026: Regulatory Release
       - Single-period regulatory filing (REGULATORY type)
       - Zero-tolerance: 0 overrides, 98% readiness
       - Tight SLA — 48h pipeline
       - Demonstrates REGULATORY release type

     Story 5 — April 2026: Cancelled Release (LE-CA)
       - Assembling started but data quality issue discovered
       - Release CANCELLED before reaching READY
       - Shows CANCELLED lifecycle state + decision log with BLOCKED result

     Story 6 — April 2026: In-Progress Assembling (LE-MY)
       - Currently in ASSEMBLING state
       - Pack APPROVED, batch FINALIZED (not yet published)
       - Certification in progress (APPROVED, not yet CERTIFIED)
       - Shows the "work in progress" pipeline state

     Story 7 — April 2026: Policy-Blocked at MARK_READY (LE-SA)
       - 4 overrides on quarter-end close (max allowed: 1)
       - Readiness 78% (threshold: 95%)
       - MARK_READY decision = BLOCKED
       - Exception signoff not yet granted
       - Shows the "stuck" / policy-blocked state

     Story 8 — Ad Hoc Interim Release (LE-IN)
       - Mid-quarter interim release for external auditors
       - AD_HOC type, single period (P3)
       - Clean close, fast pipeline
       - Demonstrates AD_HOC release type

   ============================================================================ */


-- ############################################################################
-- PART 0: PREREQUISITE INFRASTRUCTURE FOR DEMO_CA EXTENDED STORIES
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    v_entity           text;
    v_cal_id           uuid;
    v_run_id           uuid;
    v_snap_id          uuid;
    v_pack_def_id      uuid;
    v_pack_inst_id     uuid;
    v_cert_id          uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'demo_ca tenant not found — skipping extended release scenarios';
        RETURN;
    END IF;

    -- ==================================================================
    -- Ensure report_pack_definition exists for each entity
    -- (may not have been seeded by other scripts)
    -- ==================================================================
    FOR v_entity IN
        SELECT DISTINCT entity_code FROM fin.operating_unit
        WHERE tenant_id = v_tenant ORDER BY entity_code
    LOOP
        INSERT INTO fin.report_pack_definition (
            tenant_id, entity_code,
            pack_code, name, description,
            pack_type, version, is_active, sort_order
        ) VALUES (
            v_tenant, v_entity,
            'MGMT-MONTHLY', 'Monthly Management Pack',
            'Standard monthly management reporting pack with KPIs, financial statements, and variance analysis.',
            'MANAGEMENT', 1, true, 1
        ) ON CONFLICT (tenant_id, entity_code, pack_code, version) DO NOTHING;
    END LOOP;
    RAISE NOTICE 'Pack definitions ensured for demo_ca entities';

    -- Create temp table for cross-block ID passing
    CREATE TEMP TABLE IF NOT EXISTS _seed_ca_release_ids (
        entity_code     varchar(20),
        story           smallint,
        run_id          uuid,
        snap_id         uuid,
        pack_def_id     uuid,
        pack_inst_id    uuid,
        cert_id         uuid,
        PRIMARY KEY (entity_code, story)
    );

    -- ==================================================================
    -- Story 3 prerequisites: LE-CA March 2026 (Q1 quarterly)
    -- ==================================================================
    v_entity := 'LE-CA';

    SELECT id INTO v_cal_id FROM fin.close_calendar
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3;

    -- March close run — HARD_CLOSED (quarterly)
    INSERT INTO fin.close_run (
        id, tenant_id, entity_code,
        fiscal_year, period_number, calendar_id,
        run_number, status,
        started_at, soft_closed_at, hard_closed_at, completed_at,
        started_by, soft_closed_by, hard_closed_by
    ) VALUES (
        gen_random_uuid(), v_tenant, v_entity,
        2026, 3, v_cal_id,
        1, 'HARD_CLOSED',
        v_now - interval '18 days',
        v_now - interval '14 days',
        v_now - interval '12 days',
        v_now - interval '12 days',
        v_tenant, v_tenant, v_tenant
    ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

    SELECT id INTO v_run_id FROM fin.close_run
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3 AND run_number = 1;

    -- Update close_calendar actual dates for March
    UPDATE fin.close_calendar
    SET soft_close_actual = (period_end_date + interval '4 days')::date,
        hard_close_actual = (period_end_date + interval '6 days')::date,
        actual_working_days = 4,
        updated_at = v_now
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3
      AND hard_close_actual IS NULL;

    -- Readiness snapshot: 96% (meets quarterly 95% threshold)
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
        gen_random_uuid(), v_tenant, v_entity, v_run_id,
        v_now - interval '12 days',
        20, 19, 1,
        0, 0, 0, 0,
        100.00,
        0, 0, 1,
        4, 0, 'ON_TRACK',
        96.00,
        jsonb_build_object(
            'SUBLEDGER', 100, 'CASH', 100, 'CONSOLIDATION', 95,
            'TAX', 100, 'REVENUE', 100, 'ADJUSTMENTS', 100,
            'VALIDATION', 100, 'APPROVAL', 100
        ),
        v_tenant
    ) ON CONFLICT DO NOTHING;

    SELECT id INTO v_snap_id FROM fin.close_readiness_snapshot
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id
    ORDER BY captured_at DESC LIMIT 1;

    -- Pack definition
    SELECT id INTO v_pack_def_id FROM fin.report_pack_definition
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active = true
    ORDER BY sort_order LIMIT 1;

    IF v_pack_def_id IS NULL THEN
        RAISE NOTICE 'No pack definition for demo_ca LE-CA — skipping Story 3';
    ELSE
        -- Q1 Board Pack instance — PUBLISHED (multi-period P1-P3)
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
            2026, 1, 3,
            'STAT', 'PUBLISHED',
            v_now - interval '11 days', v_tenant,
            8, 8,
            'PRIOR_YEAR', 'QTD',
            v_tenant, v_now - interval '10 days',
            v_tenant, v_now - interval '9 days',
            v_now - interval '8 days',
            v_tenant, v_now - interval '7 days'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_pack_inst_id FROM fin.report_pack_instance
        WHERE tenant_id = v_tenant AND entity_code = v_entity
          AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
          AND period_from = 1 AND period_to = 3
        LIMIT 1;

        -- Certification — CERTIFIED
        INSERT INTO fin.pack_certification (
            id, tenant_id, pack_instance_id,
            prepared_by, prepared_by_name, prepared_at,
            reviewed_by, reviewed_by_name, reviewed_at, review_notes,
            approved_by, approved_by_name, approved_at, approval_notes,
            certified_by, certified_by_name, certified_at, certification_notes,
            certification_status,
            close_run_id, readiness_snapshot_id,
            active_override_count, override_impact_total,
            readiness_score_at_cert, period_status_at_cert
        ) VALUES (
            gen_random_uuid(), v_tenant, v_pack_inst_id,
            v_tenant, 'Anika Patel (Senior Accountant)', v_now - interval '10 days',
            v_tenant, 'David Chen (VP Finance)', v_now - interval '9 days',
            'Q1 consolidation complete. All intercompany eliminations verified across LE-CA, LE-MY, LE-SA, LE-IN.',
            v_tenant, 'David Chen (VP Finance)', v_now - interval '8 days',
            'Q1 Board Pack approved. Clean quarterly close — readiness 96%, zero overrides.',
            v_tenant, 'Catherine Dubois (CFO Canada)', v_now - interval '7 days',
            'Certified for Board distribution. Strong Q1 performance with clean governance posture.',
            'CERTIFIED',
            v_run_id, v_snap_id,
            0, 0.0000,
            96.00, 'HARD_CLOSED'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_cert_id FROM fin.pack_certification
        WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_id
        LIMIT 1;

        INSERT INTO _seed_ca_release_ids VALUES (v_entity, 3, v_run_id, v_snap_id, v_pack_def_id, v_pack_inst_id, v_cert_id)
        ON CONFLICT (entity_code, story) DO UPDATE SET
            run_id = EXCLUDED.run_id, snap_id = EXCLUDED.snap_id,
            pack_def_id = EXCLUDED.pack_def_id, pack_inst_id = EXCLUDED.pack_inst_id,
            cert_id = EXCLUDED.cert_id;
    END IF;

    -- ==================================================================
    -- Story 4 prerequisites: LE-CA March 2026 Regulatory
    -- (reuses same close run as Story 3, separate pack instance)
    -- ==================================================================

    IF v_pack_def_id IS NOT NULL THEN
        -- Regulatory pack instance — PUBLISHED
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
            2026, 3, 3,
            'TAX', 'PUBLISHED',
            v_now - interval '10 days', v_tenant,
            3, 3,
            'PRIOR_YEAR', 'PTD',
            v_tenant, v_now - interval '9 days',
            v_tenant, v_now - interval '8 days',
            v_now - interval '7 days',
            v_tenant, v_now - interval '6 days'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_pack_inst_id FROM fin.report_pack_instance
        WHERE tenant_id = v_tenant AND entity_code = v_entity
          AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
          AND period_from = 3 AND period_to = 3 AND book_code = 'TAX'
        LIMIT 1;

        -- Regulatory certification — CERTIFIED (zero tolerance)
        INSERT INTO fin.pack_certification (
            id, tenant_id, pack_instance_id,
            prepared_by, prepared_by_name, prepared_at,
            reviewed_by, reviewed_by_name, reviewed_at, review_notes,
            approved_by, approved_by_name, approved_at, approval_notes,
            certified_by, certified_by_name, certified_at, certification_notes,
            certification_status,
            close_run_id, readiness_snapshot_id,
            active_override_count, override_impact_total,
            readiness_score_at_cert, period_status_at_cert
        ) VALUES (
            gen_random_uuid(), v_tenant, v_pack_inst_id,
            v_tenant, 'Anika Patel (Senior Accountant)', v_now - interval '8 days',
            v_tenant, 'David Chen (VP Finance)', v_now - interval '7 days',
            'March regulatory pack — CRA quarterly GST/HST reconciliation. All tax accounts reconciled.',
            v_tenant, 'David Chen (VP Finance)', v_now - interval '6 days',
            'Regulatory filing approved — zero overrides, no open exceptions.',
            v_tenant, 'Catherine Dubois (CFO Canada)', v_now - interval '5 days',
            'Certified for CRA submission. Tax provisions finalized, ITC claims verified.',
            'CERTIFIED',
            v_run_id, v_snap_id,
            0, 0.0000,
            96.00, 'HARD_CLOSED'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_cert_id FROM fin.pack_certification
        WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_id
        LIMIT 1;

        INSERT INTO _seed_ca_release_ids VALUES (v_entity, 4, v_run_id, v_snap_id, v_pack_def_id, v_pack_inst_id, v_cert_id)
        ON CONFLICT (entity_code, story) DO UPDATE SET
            run_id = EXCLUDED.run_id, snap_id = EXCLUDED.snap_id,
            pack_def_id = EXCLUDED.pack_def_id, pack_inst_id = EXCLUDED.pack_inst_id,
            cert_id = EXCLUDED.cert_id;
    END IF;

    -- ==================================================================
    -- Story 5 prerequisites: LE-CA April 2026 (Cancelled)
    -- ==================================================================

    SELECT id INTO v_cal_id FROM fin.close_calendar
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 4;

    -- April close run — IN_PROGRESS (soft close not reached)
    INSERT INTO fin.close_run (
        id, tenant_id, entity_code,
        fiscal_year, period_number, calendar_id,
        run_number, status,
        started_at, started_by
    ) VALUES (
        gen_random_uuid(), v_tenant, v_entity,
        2026, 4, v_cal_id,
        1, 'IN_PROGRESS',
        v_now - interval '3 days',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

    SELECT id INTO v_run_id FROM fin.close_run
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 4 AND run_number = 1;

    -- Low readiness — 58% (data quality issues)
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
        gen_random_uuid(), v_tenant, v_entity, v_run_id,
        v_now - interval '1 day',
        15, 7, 0,
        2, 1, 3, 2,
        46.67,
        4, 2, 0,
        3, 5, 'AT_RISK',
        58.00,
        jsonb_build_object(
            'SUBLEDGER', 70, 'CASH', 40, 'CONSOLIDATION', 0,
            'TAX', 50, 'REVENUE', 80, 'ADJUSTMENTS', 60,
            'VALIDATION', 30, 'APPROVAL', 0
        ),
        v_tenant
    ) ON CONFLICT DO NOTHING;

    SELECT id INTO v_snap_id FROM fin.close_readiness_snapshot
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id
    ORDER BY captured_at DESC LIMIT 1;

    IF v_pack_def_id IS NOT NULL THEN
        -- April pack instance — DRAFT (not ready)
        INSERT INTO fin.report_pack_instance (
            id, tenant_id, entity_code,
            pack_definition_id, pack_version,
            fiscal_year, period_from, period_to,
            book_code, status,
            generated_at, generated_by,
            total_items, items_completed,
            variance_source, period_mode
        ) VALUES (
            gen_random_uuid(), v_tenant, v_entity,
            v_pack_def_id, 1,
            2026, 4, 4,
            'STAT', 'DRAFT',
            v_now - interval '2 days', v_tenant,
            5, 2,
            'PRIOR_YEAR', 'PTD'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_pack_inst_id FROM fin.report_pack_instance
        WHERE tenant_id = v_tenant AND entity_code = v_entity
          AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
          AND period_from = 4 AND period_to = 4 AND book_code = 'STAT'
        LIMIT 1;

        INSERT INTO _seed_ca_release_ids VALUES (v_entity, 5, v_run_id, v_snap_id, v_pack_def_id, v_pack_inst_id, null)
        ON CONFLICT (entity_code, story) DO UPDATE SET
            run_id = EXCLUDED.run_id, snap_id = EXCLUDED.snap_id,
            pack_def_id = EXCLUDED.pack_def_id, pack_inst_id = EXCLUDED.pack_inst_id,
            cert_id = EXCLUDED.cert_id;
    END IF;

    -- ==================================================================
    -- Story 6 prerequisites: LE-MY April 2026 (Assembling — in progress)
    -- ==================================================================
    v_entity := 'LE-MY';

    SELECT id INTO v_cal_id FROM fin.close_calendar
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3;

    -- LE-MY March close run — HARD_CLOSED
    INSERT INTO fin.close_run (
        id, tenant_id, entity_code,
        fiscal_year, period_number, calendar_id,
        run_number, status,
        started_at, soft_closed_at, hard_closed_at, completed_at,
        started_by, soft_closed_by, hard_closed_by
    ) VALUES (
        gen_random_uuid(), v_tenant, v_entity,
        2026, 3, v_cal_id,
        1, 'HARD_CLOSED',
        v_now - interval '15 days',
        v_now - interval '12 days',
        v_now - interval '10 days',
        v_now - interval '10 days',
        v_tenant, v_tenant, v_tenant
    ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

    SELECT id INTO v_run_id FROM fin.close_run
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3 AND run_number = 1;

    -- Readiness 91% — decent but not stellar
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
        gen_random_uuid(), v_tenant, v_entity, v_run_id,
        v_now - interval '10 days',
        12, 11, 0,
        0, 0, 1, 0,
        91.67,
        1, 0, 2,
        5, 0, 'ON_TRACK',
        91.00,
        jsonb_build_object(
            'SUBLEDGER', 100, 'CASH', 90, 'CONSOLIDATION', 85,
            'TAX', 100, 'REVENUE', 100, 'ADJUSTMENTS', 80,
            'VALIDATION', 90, 'APPROVAL', 100
        ),
        v_tenant
    ) ON CONFLICT DO NOTHING;

    SELECT id INTO v_snap_id FROM fin.close_readiness_snapshot
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id
    ORDER BY captured_at DESC LIMIT 1;

    SELECT id INTO v_pack_def_id FROM fin.report_pack_definition
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active = true
    ORDER BY sort_order LIMIT 1;

    IF v_pack_def_id IS NOT NULL THEN
        -- LE-MY March pack — APPROVED (batch finalized, not yet published)
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
            2026, 3, 3,
            'STAT', 'APPROVED',
            v_now - interval '5 days', v_tenant,
            5, 5,
            'PRIOR_YEAR', 'PTD',
            v_tenant, v_now - interval '4 days',
            v_tenant, v_now - interval '3 days'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_pack_inst_id FROM fin.report_pack_instance
        WHERE tenant_id = v_tenant AND entity_code = v_entity
          AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
          AND period_from = 3 AND period_to = 3
        LIMIT 1;

        -- Certification — APPROVED (not yet CERTIFIED)
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
            gen_random_uuid(), v_tenant, v_pack_inst_id,
            v_tenant, 'Wei Lin (Accountant, KL)', v_now - interval '3 days',
            v_tenant, 'Rajesh Kumar (Finance Manager, MY)', v_now - interval '2 days',
            'March close for LE-MY. 1 open FX translation item pending Treasury confirmation.',
            v_tenant, 'Rajesh Kumar (Finance Manager, MY)', v_now - interval '1 day',
            'Approved pending CFO certification. FX translation booked at spot rate — awaiting hedge confirmation.',
            'APPROVED',
            v_run_id, v_snap_id,
            0, 0.0000,
            91.00, 'HARD_CLOSED'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_cert_id FROM fin.pack_certification
        WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_id
        LIMIT 1;

        INSERT INTO _seed_ca_release_ids VALUES (v_entity, 6, v_run_id, v_snap_id, v_pack_def_id, v_pack_inst_id, v_cert_id)
        ON CONFLICT (entity_code, story) DO UPDATE SET
            run_id = EXCLUDED.run_id, snap_id = EXCLUDED.snap_id,
            pack_def_id = EXCLUDED.pack_def_id, pack_inst_id = EXCLUDED.pack_inst_id,
            cert_id = EXCLUDED.cert_id;
    END IF;

    -- ==================================================================
    -- Story 7 prerequisites: LE-SA March 2026 (Policy-Blocked)
    -- ==================================================================
    v_entity := 'LE-SA';

    SELECT id INTO v_cal_id FROM fin.close_calendar
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3;

    -- LE-SA March close run — SOFT_CLOSED (struggling to hard close)
    INSERT INTO fin.close_run (
        id, tenant_id, entity_code,
        fiscal_year, period_number, calendar_id,
        run_number, status,
        started_at, soft_closed_at,
        started_by, soft_closed_by
    ) VALUES (
        gen_random_uuid(), v_tenant, v_entity,
        2026, 3, v_cal_id,
        1, 'SOFT_CLOSED',
        v_now - interval '16 days',
        v_now - interval '10 days',
        v_tenant, v_tenant
    ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

    SELECT id INTO v_run_id FROM fin.close_run
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3 AND run_number = 1;

    -- Readiness 78% — well below quarterly 95% threshold
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
        gen_random_uuid(), v_tenant, v_entity, v_run_id,
        v_now - interval '2 days',
        14, 9, 1,
        2, 1, 0, 1,
        71.43,
        5, 2, 1,
        14, 0, 'BREACHED',
        78.00,
        jsonb_build_object(
            'SUBLEDGER', 85, 'CASH', 60, 'CONSOLIDATION', 70,
            'TAX', 90, 'REVENUE', 75, 'ADJUSTMENTS', 50,
            'VALIDATION', 80, 'APPROVAL', 0
        ),
        v_tenant
    ) ON CONFLICT DO NOTHING;

    SELECT id INTO v_snap_id FROM fin.close_readiness_snapshot
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id
    ORDER BY captured_at DESC LIMIT 1;

    SELECT id INTO v_pack_def_id FROM fin.report_pack_definition
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active = true
    ORDER BY sort_order LIMIT 1;

    IF v_pack_def_id IS NOT NULL THEN
        -- LE-SA pack instance — APPROVED
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
            2026, 1, 3,
            'STAT', 'APPROVED',
            v_now - interval '4 days', v_tenant,
            6, 4,
            'PRIOR_YEAR', 'QTD',
            v_tenant, v_now - interval '3 days',
            v_tenant, v_now - interval '2 days'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_pack_inst_id FROM fin.report_pack_instance
        WHERE tenant_id = v_tenant AND entity_code = v_entity
          AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
          AND period_from = 1 AND period_to = 3
        LIMIT 1;

        -- Certification — APPROVED
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
            gen_random_uuid(), v_tenant, v_pack_inst_id,
            v_tenant, 'Ahmed Al-Rashid (Senior Accountant, SA)', v_now - interval '3 days',
            v_tenant, 'Fatima Noor (Finance Director, SA)', v_now - interval '2 days',
            'Q1 close for LE-SA has 4 approved overrides. Multiple VAT reconciliation issues.',
            v_tenant, 'Fatima Noor (Finance Director, SA)', v_now - interval '1 day',
            'Approved with significant reservations — override impact SAR 185K, readiness only 78%.',
            'APPROVED',
            v_run_id, v_snap_id,
            4, 185000.0000,
            78.00, 'SOFT_CLOSED'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_cert_id FROM fin.pack_certification
        WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_id
        LIMIT 1;

        INSERT INTO _seed_ca_release_ids VALUES (v_entity, 7, v_run_id, v_snap_id, v_pack_def_id, v_pack_inst_id, v_cert_id)
        ON CONFLICT (entity_code, story) DO UPDATE SET
            run_id = EXCLUDED.run_id, snap_id = EXCLUDED.snap_id,
            pack_def_id = EXCLUDED.pack_def_id, pack_inst_id = EXCLUDED.pack_inst_id,
            cert_id = EXCLUDED.cert_id;
    END IF;

    -- ==================================================================
    -- Story 8 prerequisites: LE-IN March 2026 (Ad Hoc for auditors)
    -- ==================================================================
    v_entity := 'LE-IN';

    SELECT id INTO v_cal_id FROM fin.close_calendar
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3;

    -- LE-IN March close run — HARD_CLOSED
    INSERT INTO fin.close_run (
        id, tenant_id, entity_code,
        fiscal_year, period_number, calendar_id,
        run_number, status,
        started_at, soft_closed_at, hard_closed_at, completed_at,
        started_by, soft_closed_by, hard_closed_by
    ) VALUES (
        gen_random_uuid(), v_tenant, v_entity,
        2026, 3, v_cal_id,
        1, 'HARD_CLOSED',
        v_now - interval '14 days',
        v_now - interval '11 days',
        v_now - interval '9 days',
        v_now - interval '9 days',
        v_tenant, v_tenant, v_tenant
    ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, run_number) DO NOTHING;

    SELECT id INTO v_run_id FROM fin.close_run
    WHERE tenant_id = v_tenant AND entity_code = v_entity
      AND fiscal_year = 2026 AND period_number = 3 AND run_number = 1;

    -- Readiness 99% — pristine close
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
        gen_random_uuid(), v_tenant, v_entity, v_run_id,
        v_now - interval '9 days',
        10, 10, 0,
        0, 0, 0, 0,
        100.00,
        0, 0, 0,
        3, 0, 'ON_TRACK',
        99.00,
        jsonb_build_object(
            'SUBLEDGER', 100, 'CASH', 100, 'CONSOLIDATION', 100,
            'TAX', 100, 'REVENUE', 100, 'ADJUSTMENTS', 100,
            'VALIDATION', 100, 'APPROVAL', 100
        ),
        v_tenant
    ) ON CONFLICT DO NOTHING;

    SELECT id INTO v_snap_id FROM fin.close_readiness_snapshot
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND run_id = v_run_id
    ORDER BY captured_at DESC LIMIT 1;

    SELECT id INTO v_pack_def_id FROM fin.report_pack_definition
    WHERE tenant_id = v_tenant AND entity_code = v_entity AND is_active = true
    ORDER BY sort_order LIMIT 1;

    IF v_pack_def_id IS NOT NULL THEN
        -- LE-IN March pack — PUBLISHED (ad hoc for statutory audit)
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
            2026, 3, 3,
            'STAT', 'PUBLISHED',
            v_now - interval '7 days', v_tenant,
            4, 4,
            'PRIOR_YEAR', 'PTD',
            v_tenant, v_now - interval '6 days',
            v_tenant, v_now - interval '5 days',
            v_now - interval '4 days',
            v_tenant, v_now - interval '3 days'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_pack_inst_id FROM fin.report_pack_instance
        WHERE tenant_id = v_tenant AND entity_code = v_entity
          AND pack_definition_id = v_pack_def_id AND fiscal_year = 2026
          AND period_from = 3 AND period_to = 3
        LIMIT 1;

        -- Certification — CERTIFIED
        INSERT INTO fin.pack_certification (
            id, tenant_id, pack_instance_id,
            prepared_by, prepared_by_name, prepared_at,
            reviewed_by, reviewed_by_name, reviewed_at, review_notes,
            approved_by, approved_by_name, approved_at, approval_notes,
            certified_by, certified_by_name, certified_at, certification_notes,
            certification_status,
            close_run_id, readiness_snapshot_id,
            active_override_count, override_impact_total,
            readiness_score_at_cert, period_status_at_cert
        ) VALUES (
            gen_random_uuid(), v_tenant, v_pack_inst_id,
            v_tenant, 'Priya Sharma (Senior Accountant, IN)', v_now - interval '5 days',
            v_tenant, 'Vikram Mehta (Finance Controller, IN)', v_now - interval '4 days',
            'March close for LE-IN complete. Statutory audit data package prepared per IndAS requirements.',
            v_tenant, 'Vikram Mehta (Finance Controller, IN)', v_now - interval '3 days',
            'Approved — clean close, 99% readiness. Deferred tax computation verified.',
            v_tenant, 'Vikram Mehta (Finance Controller, IN)', v_now - interval '2 days',
            'Certified for statutory auditor distribution. IndAS compliant, all schedules attached.',
            'CERTIFIED',
            v_run_id, v_snap_id,
            0, 0.0000,
            99.00, 'HARD_CLOSED'
        ) ON CONFLICT DO NOTHING;

        SELECT id INTO v_cert_id FROM fin.pack_certification
        WHERE tenant_id = v_tenant AND pack_instance_id = v_pack_inst_id
        LIMIT 1;

        INSERT INTO _seed_ca_release_ids VALUES (v_entity, 8, v_run_id, v_snap_id, v_pack_def_id, v_pack_inst_id, v_cert_id)
        ON CONFLICT (entity_code, story) DO UPDATE SET
            run_id = EXCLUDED.run_id, snap_id = EXCLUDED.snap_id,
            pack_def_id = EXCLUDED.pack_def_id, pack_inst_id = EXCLUDED.pack_inst_id,
            cert_id = EXCLUDED.cert_id;
    END IF;

    RAISE NOTICE 'Extended prerequisite infrastructure seeded for demo_ca';
END $$;


-- ############################################################################
-- PART 1: STORY 3 — Q1 BOARD PACK (LE-CA, RELEASED, CLEAN CLOSE)
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    r                  record;
    v_batch_id         uuid;
    v_release_id       uuid;
    v_dist_board_id    uuid;
    v_dist_audit_id    uuid;
    v_manifest_hash    varchar(64);
    v_corr             uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM _seed_ca_release_ids WHERE entity_code = 'LE-CA' AND story = 3;
    IF r IS NULL OR r.cert_id IS NULL THEN
        RAISE NOTICE 'Story 3 prerequisites missing — skipping';
        RETURN;
    END IF;

    v_corr := gen_random_uuid();
    v_batch_id := gen_random_uuid();
    v_manifest_hash := encode(sha256(
        convert_to('manifest-LE-CA-demo_ca-2026-Q1-board', 'UTF8')
    ), 'hex');

    -- Publication batch — PUBLISHED (Q1 board pack)
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
        v_batch_id, v_tenant, 'LE-CA',
        'PUB-BOARD-LE-CA-2026-Q1',
        'Q1 2026 Board Pack — consolidated quarterly financials for all Canadian legal entities.',
        2026, 3, 'STAT',
        'MIXED', r.pack_inst_id,
        'PUBLISHED',
        6, 2,
        v_manifest_hash, 8,
        v_tenant, v_now - interval '8 days',
        v_tenant, v_now - interval '7 days',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

    -- Link certification to batch
    UPDATE fin.pack_certification SET publication_batch_id = v_batch_id WHERE id = r.cert_id;

    -- Manifest items (8 artifacts: 6 KPIs + 2 planning)
    INSERT INTO fin.publication_manifest_item (
        tenant_id, entity_code, publication_batch_id,
        artifact_type, artifact_id,
        definition_code, definition_version,
        fiscal_year, period_number, book_code,
        published_value, published_currency,
        artifact_hash
    ) VALUES
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'GROSS_MARGIN_PCT', 2, 2026, 3, 'STAT', 44.2000, null,
         encode(sha256(convert_to('gm-pct-Q1-board', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'NET_MARGIN_PCT', 1, 2026, 3, 'STAT', 14.6000, null,
         encode(sha256(convert_to('nm-pct-Q1-board', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'CURRENT_RATIO', 1, 2026, 3, 'STAT', 2.35, null,
         encode(sha256(convert_to('cr-ratio-Q1-board', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'REVENUE_GROWTH_PCT', 1, 2026, 3, 'STAT', 11.2000, null,
         encode(sha256(convert_to('rg-pct-Q1-board', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'EBITDA_MARGIN_PCT', 1, 2026, 3, 'STAT', 22.8000, null,
         encode(sha256(convert_to('ebitda-Q1-board', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'DEBT_EQUITY_RATIO', 1, 2026, 3, 'STAT', 0.6500, null,
         encode(sha256(convert_to('de-ratio-Q1-board', 'UTF8')), 'hex')),
        -- Planning outputs
        (v_tenant, 'LE-CA', v_batch_id, 'PLANNING_OUTPUT', gen_random_uuid(),
         'REV_FORECAST_BASE', 1, 2026, 3, 'STAT', 4250000.0000, 'CAD',
         encode(sha256(convert_to('rev-plan-Q1-board', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'PLANNING_OUTPUT', gen_random_uuid(),
         'OPEX_FORECAST_BASE', 1, 2026, 3, 'STAT', 3280000.0000, 'CAD',
         encode(sha256(convert_to('opex-plan-Q1-board', 'UTF8')), 'hex'))
    ON CONFLICT (publication_batch_id, artifact_type, artifact_id) DO NOTHING;

    -- Pack release — RELEASED (clean quarterly close)
    v_release_id := gen_random_uuid();
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
        assembled_at, ready_at, released_at, released_by,
        created_by
    ) VALUES (
        v_release_id, v_tenant, 'LE-CA',
        'REL-BOARD-LE-CA-2026-Q1',
        'Q1 2026 Board Pack — Canadian Group Quarterly',
        'Quarterly Board Pack covering Jan-Mar 2026. Consolidated performance across 4 legal entities. Clean close with 96% readiness.',
        2026, 1, 3, 'STAT',
        'BOARD_PACK',
        r.pack_inst_id, v_batch_id,
        r.cert_id, r.run_id, r.snap_id,
        'RELEASED',
        true, 0, 0.0000,
        96.00, 'HARD_CLOSED',
        false,
        v_now - interval '8 days',
        v_now - interval '7 days',
        v_now - interval '6 days',
        v_tenant,
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

    -- Distribution 1: Board of Directors
    v_dist_board_id := gen_random_uuid();
    INSERT INTO fin.pack_distribution (
        id, tenant_id, pack_instance_id,
        distribution_code, name, description,
        format, certification_id,
        distributed_by, distributed_at,
        status,
        recipient_count, delivered_count, viewed_count, downloaded_count,
        publication_batch_id, artifact_hash
    ) VALUES (
        v_dist_board_id, v_tenant, r.pack_inst_id,
        'DIST-LE-CA-2026-Q1-BOARD',
        'Q1 Board Pack — Board of Directors',
        'Quarterly financials distributed to Board members ahead of April board meeting.',
        'PDF', r.cert_id,
        v_tenant, v_now - interval '5 days',
        'SENT',
        5, 5, 4, 3,
        v_batch_id, v_manifest_hash
    ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

    INSERT INTO fin.pack_distribution_recipient (
        distribution_id, recipient_name, recipient_email, recipient_role,
        delivery_status, sent_at, delivered_at,
        first_viewed_at, view_count
    ) VALUES
        (v_dist_board_id, 'Catherine Dubois', 'catherine.dubois@demo-ca.com', 'CFO',
         'DELIVERED', v_now - interval '5 days', v_now - interval '5 days',
         v_now - interval '4 days', 5),
        (v_dist_board_id, 'Marc Tremblay', 'marc.tremblay@demo-ca.com', 'CEO',
         'DELIVERED', v_now - interval '5 days', v_now - interval '5 days',
         v_now - interval '4 days', 3),
        (v_dist_board_id, 'Susan Park', 'susan.park@demo-ca.com', 'Board Chair',
         'DELIVERED', v_now - interval '5 days', v_now - interval '4 days',
         v_now - interval '3 days', 2),
        (v_dist_board_id, 'James Robertson', 'james.robertson@demo-ca.com', 'Independent Director',
         'DELIVERED', v_now - interval '5 days', v_now - interval '4 days',
         v_now - interval '2 days', 1),
        (v_dist_board_id, 'Elena Volkov', 'elena.volkov@demo-ca.com', 'Independent Director',
         'DELIVERED', v_now - interval '5 days', v_now - interval '4 days',
         null, 0)
    ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

    -- Distribution 2: Audit Committee
    v_dist_audit_id := gen_random_uuid();
    INSERT INTO fin.pack_distribution (
        id, tenant_id, pack_instance_id,
        distribution_code, name, description,
        format, certification_id,
        distributed_by, distributed_at,
        status,
        recipient_count, delivered_count, viewed_count, downloaded_count,
        publication_batch_id, artifact_hash
    ) VALUES (
        v_dist_audit_id, v_tenant, r.pack_inst_id,
        'DIST-LE-CA-2026-Q1-AUDIT',
        'Q1 Board Pack — Audit Committee',
        'Quarterly financials plus override analysis for Audit Committee review.',
        'EXCEL', r.cert_id,
        v_tenant, v_now - interval '5 days',
        'SENT',
        3, 3, 2, 2,
        v_batch_id, v_manifest_hash
    ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

    INSERT INTO fin.pack_distribution_recipient (
        distribution_id, recipient_name, recipient_email, recipient_role,
        delivery_status, sent_at, delivered_at,
        first_viewed_at, view_count
    ) VALUES
        (v_dist_audit_id, 'Susan Park', 'susan.park@demo-ca.com', 'Audit Committee Chair',
         'DELIVERED', v_now - interval '5 days', v_now - interval '5 days',
         v_now - interval '3 days', 4),
        (v_dist_audit_id, 'Michael Wong', 'michael.wong@demo-ca.com', 'Audit Committee Member',
         'DELIVERED', v_now - interval '5 days', v_now - interval '4 days',
         v_now - interval '2 days', 2),
        (v_dist_audit_id, 'Lisa Chen', 'lisa.chen@demo-ca.com', 'External Auditor (PwC)',
         'DELIVERED', v_now - interval '5 days', v_now - interval '4 days',
         null, 0)
    ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

    -- Decision log
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id,
        policy_evaluation, result,
        correlation_id,
        publication_batch_id, certification_id,
        created_at
    ) VALUES
        (v_tenant, 'LE-CA', v_release_id, 'ASSEMBLE', v_tenant,
         jsonb_build_object('components_valid', true, 'pack_status', 'PUBLISHED',
             'batch_status', 'PUBLISHED', 'certification_status', 'CERTIFIED'),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '8 days'),
        (v_tenant, 'LE-CA', v_release_id, 'MARK_READY', v_tenant,
         jsonb_build_object(
             'is_clean', true, 'requires_exception_signoff', false,
             'readiness_score', 96.00, 'override_count', 0, 'override_impact', 0,
             'thresholds', jsonb_build_object('max_overrides', 1, 'min_readiness', 95.00, 'max_impact', 25000.00),
             'disqualification_reasons', '[]'::jsonb),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '7 days'),
        (v_tenant, 'LE-CA', v_release_id, 'RELEASE', v_tenant,
         jsonb_build_object('gates_passed', jsonb_build_object(
             'status_ready', true, 'batch_published', true,
             'cert_approved_or_certified', true, 'exception_signoff_not_required', true,
             'integrity_check', jsonb_build_object('passed', true, 'checks_run', 8, 'checks_passed', 8, 'failures', '[]'::jsonb))),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '6 days'),
        (v_tenant, 'LE-CA', v_release_id, 'INTEGRITY_CHECK', null,
         jsonb_build_object('all_passed', true, 'check_count', 8, 'results', jsonb_build_object(
             'component_linkage', 'PASS', 'batch_published', 'PASS', 'manifest_hash_valid', 'PASS',
             'manifest_count_valid', 'PASS', 'consumer_state_consistent', 'PASS',
             'batch_not_superseded', 'PASS', 'certification_valid', 'PASS', 'distributions_exist', 'PASS')),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '6 days');

    -- Notifications
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary,
        detail_payload, processed, processed_at
    ) VALUES
        (v_tenant, 'LE-CA', v_release_id, 'RELEASE_READY', 'INFO',
         'Q1 2026 Board Pack ready — clean quarterly close, 96% readiness, 0 overrides.',
         jsonb_build_object('release_code', 'REL-BOARD-LE-CA-2026-Q1', 'is_clean_close', true, 'readiness_score', 96.00),
         true, v_now - interval '7 days'),
        (v_tenant, 'LE-CA', v_release_id, 'RELEASE_COMPLETED', 'INFO',
         'Q1 2026 Board Pack released. Distributed to 8 recipients across Board and Audit Committee.',
         jsonb_build_object('distribution_count', 2, 'recipient_count', 8),
         true, v_now - interval '5 days');

    -- SLA snapshot
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
        v_tenant, 'LE-CA', v_release_id,
        2026, 3,
        '2026-04-01'::date, '2026-04-10'::date, '2026-04-06'::date,
        96.00,
        24.00,
        72.00,
        0.00,
        4.00,
        196.00,
        true, 'BOARD_PACK',
        0, true,
        v_now - interval '5 days'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Story 3 (Q1 Board Pack) seeded for demo_ca LE-CA';
END $$;


-- ############################################################################
-- PART 2: STORY 4 — REGULATORY RELEASE (LE-CA, RELEASED)
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    r                  record;
    v_batch_id         uuid;
    v_release_id       uuid;
    v_dist_id          uuid;
    v_manifest_hash    varchar(64);
    v_corr             uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM _seed_ca_release_ids WHERE entity_code = 'LE-CA' AND story = 4;
    IF r IS NULL OR r.cert_id IS NULL THEN
        RAISE NOTICE 'Story 4 prerequisites missing — skipping';
        RETURN;
    END IF;

    v_corr := gen_random_uuid();
    v_batch_id := gen_random_uuid();
    v_manifest_hash := encode(sha256(
        convert_to('manifest-LE-CA-demo_ca-2026-03-regulatory', 'UTF8')
    ), 'hex');

    -- Publication batch — PUBLISHED (regulatory)
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
        v_batch_id, v_tenant, 'LE-CA',
        'PUB-REG-LE-CA-2026-03',
        'March 2026 CRA Quarterly Filing — GST/HST reconciliation and ITC claims.',
        2026, 3, 'TAX',
        'KPI', r.pack_inst_id,
        'PUBLISHED',
        3, 0,
        v_manifest_hash, 3,
        v_tenant, v_now - interval '6 days',
        v_tenant, v_now - interval '5 days',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

    UPDATE fin.pack_certification SET publication_batch_id = v_batch_id WHERE id = r.cert_id;

    -- Manifest items (3 tax KPIs)
    INSERT INTO fin.publication_manifest_item (
        tenant_id, entity_code, publication_batch_id,
        artifact_type, artifact_id,
        definition_code, definition_version,
        fiscal_year, period_number, book_code,
        published_value, published_currency,
        artifact_hash
    ) VALUES
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'GST_HST_COLLECTED', 1, 2026, 3, 'TAX', 387500.0000, 'CAD',
         encode(sha256(convert_to('gst-collected-2026-03', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'ITC_CLAIMED', 1, 2026, 3, 'TAX', 142800.0000, 'CAD',
         encode(sha256(convert_to('itc-claimed-2026-03', 'UTF8')), 'hex')),
        (v_tenant, 'LE-CA', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'NET_TAX_REMITTANCE', 1, 2026, 3, 'TAX', 244700.0000, 'CAD',
         encode(sha256(convert_to('net-tax-2026-03', 'UTF8')), 'hex'))
    ON CONFLICT (publication_batch_id, artifact_type, artifact_id) DO NOTHING;

    -- Pack release — RELEASED (regulatory, zero tolerance)
    v_release_id := gen_random_uuid();
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
        assembled_at, ready_at, released_at, released_by,
        created_by
    ) VALUES (
        v_release_id, v_tenant, 'LE-CA',
        'REL-REG-LE-CA-2026-Q1',
        'Q1 2026 CRA Regulatory Filing',
        'Quarterly GST/HST filing for CRA. Zero-tolerance governance — no overrides, 98%+ readiness required.',
        2026, 3, 3, 'TAX',
        'REGULATORY',
        r.pack_inst_id, v_batch_id,
        r.cert_id, r.run_id, r.snap_id,
        'RELEASED',
        true, 0, 0.0000,
        96.00, 'HARD_CLOSED',
        false,
        v_now - interval '5 days',
        v_now - interval '4 days',
        v_now - interval '4 days',
        v_tenant,
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

    -- Distribution — CRA filing
    v_dist_id := gen_random_uuid();
    INSERT INTO fin.pack_distribution (
        id, tenant_id, pack_instance_id,
        distribution_code, name, description,
        format, certification_id,
        distributed_by, distributed_at,
        status,
        recipient_count, delivered_count, viewed_count, downloaded_count,
        publication_batch_id, artifact_hash
    ) VALUES (
        v_dist_id, v_tenant, r.pack_inst_id,
        'DIST-REG-LE-CA-2026-Q1',
        'CRA Q1 Filing Distribution',
        'GST/HST quarterly filing submitted to CRA via e-filing portal.',
        'LINK', r.cert_id,
        v_tenant, v_now - interval '3 days',
        'SENT',
        2, 2, 1, 1,
        v_batch_id, v_manifest_hash
    ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

    INSERT INTO fin.pack_distribution_recipient (
        distribution_id, recipient_name, recipient_email, recipient_role,
        delivery_status, sent_at, delivered_at
    ) VALUES
        (v_dist_id, 'CRA e-Filing Portal', 'efiling@cra-arc.gc.ca', 'Regulatory Body',
         'DELIVERED', v_now - interval '3 days', v_now - interval '3 days'),
        (v_dist_id, 'Catherine Dubois', 'catherine.dubois@demo-ca.com', 'CFO (Confirmation Copy)',
         'DELIVERED', v_now - interval '3 days', v_now - interval '3 days')
    ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

    -- Decision log
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id, policy_evaluation, result,
        correlation_id, publication_batch_id, certification_id, created_at
    ) VALUES
        (v_tenant, 'LE-CA', v_release_id, 'ASSEMBLE', v_tenant,
         jsonb_build_object('components_valid', true, 'pack_status', 'PUBLISHED',
             'batch_status', 'PUBLISHED', 'certification_status', 'CERTIFIED'),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '5 days'),
        (v_tenant, 'LE-CA', v_release_id, 'MARK_READY', v_tenant,
         jsonb_build_object('is_clean', true, 'requires_exception_signoff', false,
             'readiness_score', 96.00, 'override_count', 0, 'override_impact', 0,
             'thresholds', jsonb_build_object('max_overrides', 0, 'min_readiness', 98.00, 'max_impact', 0.00),
             'disqualification_reasons', '[]'::jsonb),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '4 days'),
        (v_tenant, 'LE-CA', v_release_id, 'RELEASE', v_tenant,
         jsonb_build_object('gates_passed', jsonb_build_object(
             'status_ready', true, 'batch_published', true, 'cert_approved_or_certified', true,
             'exception_signoff_not_required', true,
             'integrity_check', jsonb_build_object('passed', true, 'checks_run', 8, 'checks_passed', 8))),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '4 days');

    -- SLA snapshot — tight 48h pipeline
    INSERT INTO fin.release_sla_snapshot (
        tenant_id, entity_code, release_id,
        fiscal_year, period_number,
        close_start_date, close_hard_close_target, close_hard_close_actual,
        close_duration_hours,
        assembly_duration_hours, certification_wait_hours,
        exception_signoff_wait_hours, release_to_distribution_hours,
        total_pipeline_hours,
        close_sla_met, release_type,
        override_count, is_clean_close, captured_at
    ) VALUES (
        v_tenant, 'LE-CA', v_release_id,
        2026, 3,
        '2026-04-01'::date, '2026-04-10'::date, '2026-04-06'::date,
        96.00,
        8.00, 24.00, 0.00, 1.00,
        129.00,
        true, 'REGULATORY', 0, true, v_now - interval '3 days'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Story 4 (Regulatory Release) seeded for demo_ca LE-CA';
END $$;


-- ############################################################################
-- PART 3: STORY 5 — CANCELLED RELEASE (LE-CA, April 2026)
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    r                  record;
    v_release_id       uuid;
    v_corr             uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM _seed_ca_release_ids WHERE entity_code = 'LE-CA' AND story = 5;
    IF r IS NULL THEN
        RAISE NOTICE 'Story 5 prerequisites missing — skipping';
        RETURN;
    END IF;

    v_corr := gen_random_uuid();

    -- Pack release — CANCELLED (never reached READY)
    v_release_id := gen_random_uuid();
    INSERT INTO fin.pack_release (
        id, tenant_id, entity_code,
        release_code, release_name, description,
        fiscal_year, period_from, period_to, book_code,
        release_type,
        pack_instance_id,
        close_run_id, readiness_snapshot_id,
        status,
        is_clean_close, override_count, override_impact_total,
        readiness_score, period_status_at_release,
        requires_exception_signoff,
        assembled_at,
        created_by
    ) VALUES (
        v_release_id, v_tenant, 'LE-CA',
        'REL-CANC-LE-CA-2026-04',
        'April 2026 Management Pack — Cancelled',
        'Release cancelled during assembly due to bank feed data quality issues. Cash reconciliation blocked — awaiting bank statement corrections.',
        2026, 4, 4, 'STAT',
        'MANAGEMENT_PACK',
        r.pack_inst_id,
        r.run_id, r.snap_id,
        'CANCELLED',
        null, 0, 0.0000,
        58.00, 'IN_PROGRESS',
        false,
        v_now - interval '1 day',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

    -- Decision log — ASSEMBLE (approved) then MARK_READY (blocked) then CANCEL
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id, policy_evaluation, result,
        correlation_id, created_at
    ) VALUES
        (v_tenant, 'LE-CA', v_release_id, 'ASSEMBLE', v_tenant,
         jsonb_build_object('components_valid', false,
             'pack_status', 'DRAFT', 'batch_status', null,
             'certification_status', null,
             'warning', 'Pack instance still in DRAFT — assembly started with incomplete data.'),
         'APPROVED', v_corr, v_now - interval '1 day'),
        (v_tenant, 'LE-CA', v_release_id, 'MARK_READY', v_tenant,
         jsonb_build_object(
             'is_clean', false, 'requires_exception_signoff', true,
             'readiness_score', 58.00, 'override_count', 0,
             'thresholds', jsonb_build_object('max_overrides', 2, 'min_readiness', 90.00, 'max_impact', 50000.00),
             'disqualification_reasons', jsonb_build_array(
                 'Readiness score 58.00 below threshold 90.00',
                 'Close run status IN_PROGRESS — hard close not reached',
                 'Pack instance not published',
                 'No publication batch linked',
                 'No certification linked'
             )),
         'BLOCKED', v_corr, v_now - interval '20 hours'),
        (v_tenant, 'LE-CA', v_release_id, 'CANCEL', v_tenant,
         jsonb_build_object(
             'reason', 'Bank feed data quality failure',
             'detail', 'TD Bank statement feed contained duplicate transactions for March 28-31. Cash reconciliation cannot complete until corrected feed received.',
             'blocked_tasks', jsonb_build_array('BANK_RECONCILIATION', 'CASH_POSITION'),
             'estimated_resolution', '3-5 business days'),
         'APPROVED', v_corr, v_now - interval '8 hours');

    -- Notifications
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary,
        detail_payload, processed, processed_at
    ) VALUES
        (v_tenant, 'LE-CA', v_release_id, 'CLEAN_CLOSE_FAILED', 'HIGH',
         'April 2026 release blocked — readiness at 58%, bank reconciliation failed.',
         jsonb_build_object('readiness_score', 58.00, 'failed_tasks', jsonb_build_array('BANK_RECONCILIATION', 'CASH_POSITION')),
         true, v_now - interval '20 hours'),
        (v_tenant, 'LE-CA', v_release_id, 'RELEASE_CANCELLED', 'WARNING',
         'April 2026 Management Pack release cancelled. Bank feed data quality issue under investigation.',
         jsonb_build_object('reason', 'Bank feed data quality failure', 'estimated_resolution', '3-5 business days'),
         true, v_now - interval '8 hours');

    RAISE NOTICE 'Story 5 (Cancelled Release) seeded for demo_ca LE-CA';
END $$;


-- ############################################################################
-- PART 4: STORY 6 — IN-PROGRESS ASSEMBLING (LE-MY, March 2026)
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    r                  record;
    v_batch_id         uuid;
    v_release_id       uuid;
    v_corr             uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM _seed_ca_release_ids WHERE entity_code = 'LE-MY' AND story = 6;
    IF r IS NULL OR r.cert_id IS NULL THEN
        RAISE NOTICE 'Story 6 prerequisites missing — skipping';
        RETURN;
    END IF;

    v_corr := gen_random_uuid();

    -- Publication batch — FINALIZED (not yet published)
    v_batch_id := gen_random_uuid();
    INSERT INTO fin.publication_batch (
        id, tenant_id, entity_code,
        batch_code, description,
        fiscal_year, period_number, book_code,
        batch_type, pack_instance_id,
        status,
        kpi_item_count, planning_item_count,
        manifest_item_count,
        finalized_by, finalized_at,
        created_by
    ) VALUES (
        v_batch_id, v_tenant, 'LE-MY',
        'PUB-FINAL-LE-MY-2026-03',
        'March 2026 LE-MY batch — finalized, awaiting FX hedge confirmation before publishing.',
        2026, 3, 'STAT',
        'MIXED', r.pack_inst_id,
        'FINALIZED',
        4, 1,
        5,
        v_tenant, v_now - interval '1 day',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

    -- Pack release — ASSEMBLING (pipeline in progress)
    v_release_id := gen_random_uuid();
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
        assembled_at,
        created_by
    ) VALUES (
        v_release_id, v_tenant, 'LE-MY',
        'REL-MGMT-LE-MY-2026-03',
        'March 2026 Management Pack — LE-MY (In Progress)',
        'Monthly management pack for LE-MY (Malaysia). Assembly in progress — awaiting FX hedge confirmation from Treasury before batch publishing.',
        2026, 3, 3, 'STAT',
        'MANAGEMENT_PACK',
        r.pack_inst_id, v_batch_id,
        r.cert_id, r.run_id, r.snap_id,
        'ASSEMBLING',
        null, 0, 0.0000,
        91.00, 'HARD_CLOSED',
        false,
        v_now - interval '12 hours',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

    -- Decision log — only ASSEMBLE so far
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id, policy_evaluation, result,
        correlation_id, publication_batch_id, certification_id, created_at
    ) VALUES
        (v_tenant, 'LE-MY', v_release_id, 'ASSEMBLE', v_tenant,
         jsonb_build_object('components_valid', true,
             'pack_status', 'APPROVED', 'batch_status', 'FINALIZED',
             'certification_status', 'APPROVED',
             'note', 'Assembly started. Batch not yet published — FX hedge confirmation pending from Treasury.'),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '12 hours');

    -- Notification — in-progress status
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary,
        detail_payload, processed, processed_at
    ) VALUES
        (v_tenant, 'LE-MY', v_release_id, 'RELEASE_READY', 'WARNING',
         'LE-MY March 2026 release assembling — batch finalized but not published. FX hedge confirmation pending.',
         jsonb_build_object('batch_status', 'FINALIZED', 'blocker', 'FX hedge confirmation from Treasury',
             'readiness_score', 91.00, 'certification_status', 'APPROVED'),
         false, null);

    RAISE NOTICE 'Story 6 (Assembling In-Progress) seeded for demo_ca LE-MY';
END $$;


-- ############################################################################
-- PART 5: STORY 7 — POLICY-BLOCKED AT MARK_READY (LE-SA, Q1 2026)
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    r                  record;
    v_batch_id         uuid;
    v_release_id       uuid;
    v_manifest_hash    varchar(64);
    v_corr             uuid;
    v_task_id          uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM _seed_ca_release_ids WHERE entity_code = 'LE-SA' AND story = 7;
    IF r IS NULL OR r.cert_id IS NULL THEN
        RAISE NOTICE 'Story 7 prerequisites missing — skipping';
        RETURN;
    END IF;

    v_corr := gen_random_uuid();

    -- 4 overrides on quarter-end (threshold: max 1)
    -- Override 1: EXTERNAL_DELAY on VAT reconciliation
    SELECT t.id INTO v_task_id FROM fin.period_close_task t
    WHERE t.tenant_id = v_tenant AND t.entity_code = 'LE-SA' AND t.task_code = 'TAX_PROVISION';
    IF v_task_id IS NOT NULL THEN
        INSERT INTO fin.close_override (
            tenant_id, entity_code, override_scope, run_id, task_id,
            reason_code, reason_subcode, reason_detail,
            impact_amount, impact_currency, applies_to_transition,
            status, requested_by, requested_at,
            decided_by, decided_at, decision_notes, evidence_payload
        ) VALUES (
            v_tenant, 'LE-SA', 'TASK', r.run_id, v_task_id,
            'EXTERNAL_DELAY', 'VENDOR_DELAY',
            'ZATCA (Saudi tax authority) portal outage prevented VAT reconciliation for 3 days. Estimated VAT liability accrued.',
            65000.0000, 'SAR', 'BOTH',
            'APPROVED', v_tenant, v_now - interval '7 days',
            v_tenant, v_now - interval '6 days',
            'Approved — ZATCA outage documented. Estimated liability is conservative.',
            jsonb_build_object('zatca_ticket', 'INC-2026-4421', 'outage_start', '2026-03-25', 'outage_end', '2026-03-28')
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Override 2: SYSTEM_ISSUE on bank reconciliation
    SELECT t.id INTO v_task_id FROM fin.period_close_task t
    WHERE t.tenant_id = v_tenant AND t.entity_code = 'LE-SA' AND t.task_code = 'BANK_RECONCILIATION';
    IF v_task_id IS NOT NULL THEN
        INSERT INTO fin.close_override (
            tenant_id, entity_code, override_scope, run_id, task_id,
            reason_code, reason_subcode, reason_detail,
            impact_amount, impact_currency, applies_to_transition,
            status, requested_by, requested_at,
            decided_by, decided_at, decision_notes, evidence_payload
        ) VALUES (
            v_tenant, 'LE-SA', 'TASK', r.run_id, v_task_id,
            'SYSTEM_ISSUE', 'DATA_FEED_DELAY',
            'Al Rajhi Bank SWIFT feed delayed — 47 transactions from March 28-31 not yet received.',
            42000.0000, 'SAR', 'SOFT_CLOSE',
            'APPROVED', v_tenant, v_now - interval '6 days',
            v_tenant, v_now - interval '5 days',
            'Approved — manual bank statement obtained for verification. Feed expected within 48h.',
            jsonb_build_object('bank', 'Al Rajhi Bank', 'missing_txn_count', 47, 'manual_verify', true)
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Override 3: TIMING on intercompany elimination
    SELECT t.id INTO v_task_id FROM fin.period_close_task t
    WHERE t.tenant_id = v_tenant AND t.entity_code = 'LE-SA' AND t.task_code = 'IC_RECONCILIATION';
    IF v_task_id IS NOT NULL THEN
        INSERT INTO fin.close_override (
            tenant_id, entity_code, override_scope, run_id, task_id,
            reason_code, reason_subcode, reason_detail,
            impact_amount, impact_currency, applies_to_transition,
            status, requested_by, requested_at,
            decided_by, decided_at, decision_notes, evidence_payload
        ) VALUES (
            v_tenant, 'LE-SA', 'TASK', r.run_id, v_task_id,
            'TIMING', 'CUTOFF_ADJUSTMENT',
            'Intercompany receivable from LE-CA (CAD 120K) timing difference — LE-CA booked payment March 31, LE-SA received April 1.',
            28000.0000, 'SAR', 'HARD_CLOSE',
            'APPROVED', v_tenant, v_now - interval '5 days',
            v_tenant, v_now - interval '4 days',
            'Timing difference — will auto-clear in April. Matched with LE-CA payment confirmation.',
            jsonb_build_object('counterparty', 'LE-CA', 'cad_amount', 120000.00, 'fx_rate', 0.2333)
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Override 4: PROCESS_GAP on fixed asset register
    SELECT t.id INTO v_task_id FROM fin.period_close_task t
    WHERE t.tenant_id = v_tenant AND t.entity_code = 'LE-SA' AND t.task_code = 'ASSET_DEPRECIATION';
    IF v_task_id IS NOT NULL THEN
        INSERT INTO fin.close_override (
            tenant_id, entity_code, override_scope, run_id, task_id,
            reason_code, reason_subcode, reason_detail,
            impact_amount, impact_currency, applies_to_transition,
            status, requested_by, requested_at,
            decided_by, decided_at, decision_notes, evidence_payload
        ) VALUES (
            v_tenant, 'LE-SA', 'TASK', r.run_id, v_task_id,
            'PROCESS_GAP', null,
            'New Riyadh office fit-out assets (SAR 1.2M) not yet classified in fixed asset register. Depreciation estimated on cost basis.',
            50000.0000, 'SAR', 'BOTH',
            'APPROVED', v_tenant, v_now - interval '4 days',
            v_tenant, v_now - interval '3 days',
            'Approved — estimated depreciation is immaterial relative to total asset base. Full classification due by April 15.',
            jsonb_build_object('asset_class', 'Leasehold Improvements', 'cost', 1200000.00, 'estimated_useful_life', 10)
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Publication batch — PUBLISHED
    v_batch_id := gen_random_uuid();
    v_manifest_hash := encode(sha256(
        convert_to('manifest-LE-SA-demo_ca-2026-Q1-blocked', 'UTF8')
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
        v_batch_id, v_tenant, 'LE-SA',
        'PUB-LE-SA-2026-Q1',
        'Q1 2026 LE-SA batch — published with 4 overrides. Policy gate expected to block.',
        2026, 3, 'STAT',
        'MIXED', r.pack_inst_id,
        'PUBLISHED',
        4, 1,
        v_manifest_hash, 5,
        v_tenant, v_now - interval '3 days',
        v_tenant, v_now - interval '2 days',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

    -- Pack release — READY but policy-blocked (awaiting exception signoff)
    v_release_id := gen_random_uuid();
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
        assembled_at, ready_at,
        created_by
    ) VALUES (
        v_release_id, v_tenant, 'LE-SA',
        'REL-BLOCKED-LE-SA-2026-Q1',
        'Q1 2026 Management Pack — LE-SA (Policy Blocked)',
        'Quarterly management pack for LE-SA. 4 overrides exceed quarter-end threshold of 1. Exception signoff required from Group CFO.',
        2026, 1, 3, 'STAT',
        'MANAGEMENT_PACK',
        r.pack_inst_id, v_batch_id,
        r.cert_id, r.run_id, r.snap_id,
        'READY',
        false, 4, 185000.0000,
        78.00, 'SOFT_CLOSED',
        true,
        v_now - interval '2 days',
        v_now - interval '1 day',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

    -- Decision log — ASSEMBLE (ok), MARK_READY (evaluated, not clean), RELEASE (blocked)
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id, policy_evaluation, result,
        correlation_id, publication_batch_id, certification_id, created_at
    ) VALUES
        (v_tenant, 'LE-SA', v_release_id, 'ASSEMBLE', v_tenant,
         jsonb_build_object('components_valid', true, 'pack_status', 'APPROVED',
             'batch_status', 'PUBLISHED', 'certification_status', 'APPROVED'),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '2 days'),
        (v_tenant, 'LE-SA', v_release_id, 'MARK_READY', v_tenant,
         jsonb_build_object(
             'is_clean', false, 'requires_exception_signoff', true,
             'readiness_score', 78.00, 'override_count', 4, 'override_impact', 185000.00,
             'thresholds', jsonb_build_object('max_overrides', 1, 'min_readiness', 95.00, 'max_impact', 25000.00),
             'disqualification_reasons', jsonb_build_array(
                 'Override count 4 exceeds quarterly threshold 1',
                 'Readiness score 78.00 below quarterly threshold 95.00',
                 'Override impact SAR 185,000 exceeds quarterly threshold SAR 25,000',
                 'Close run status SOFT_CLOSED — hard close not reached'
             )),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '1 day'),
        (v_tenant, 'LE-SA', v_release_id, 'RELEASE', v_tenant,
         jsonb_build_object('gates_passed', jsonb_build_object(
             'status_ready', true, 'batch_published', true, 'cert_approved_or_certified', true,
             'exception_signoff_granted', false,
             'blocked_reason', 'Exception signoff required but not yet granted. 4 overrides on quarter-end close exceed policy threshold.')),
         'BLOCKED', v_corr, v_batch_id, r.cert_id, v_now - interval '6 hours');

    -- Notifications
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary,
        detail_payload, processed, processed_at
    ) VALUES
        (v_tenant, 'LE-SA', v_release_id, 'EXCEPTION_SIGNOFF_REQUIRED', 'CRITICAL',
         'LE-SA Q1 release blocked — 4 overrides (SAR 185K impact) exceed quarterly threshold. Group CFO exception signoff required.',
         jsonb_build_object(
             'override_count', 4, 'override_impact', 185000.00, 'impact_currency', 'SAR',
             'readiness_score', 78.00,
             'disqualification_reasons', jsonb_build_array(
                 'Override count 4 exceeds quarterly threshold 1',
                 'Readiness 78% below quarterly 95% threshold',
                 'Override impact exceeds SAR 25K threshold'),
             'escalation', 'Group CFO Catherine Dubois'),
         false, null),
        (v_tenant, 'LE-SA', v_release_id, 'CLEAN_CLOSE_FAILED', 'HIGH',
         'LE-SA Q1 clean close evaluation failed on 4 criteria. Release requires exception governance.',
         jsonb_build_object('failure_count', 4, 'readiness_score', 78.00, 'override_count', 4),
         true, v_now - interval '1 day');

    RAISE NOTICE 'Story 7 (Policy-Blocked) seeded for demo_ca LE-SA';
END $$;


-- ############################################################################
-- PART 6: STORY 8 — AD HOC INTERIM RELEASE (LE-IN, March 2026)
-- ############################################################################

DO $$
DECLARE
    v_tenant           uuid;
    r                  record;
    v_batch_id         uuid;
    v_release_id       uuid;
    v_dist_id          uuid;
    v_manifest_hash    varchar(64);
    v_corr             uuid;
    v_now              timestamptz := now();
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN RETURN; END IF;

    SELECT * INTO r FROM _seed_ca_release_ids WHERE entity_code = 'LE-IN' AND story = 8;
    IF r IS NULL OR r.cert_id IS NULL THEN
        RAISE NOTICE 'Story 8 prerequisites missing — skipping';
        RETURN;
    END IF;

    v_corr := gen_random_uuid();
    v_batch_id := gen_random_uuid();
    v_manifest_hash := encode(sha256(
        convert_to('manifest-LE-IN-demo_ca-2026-03-adhoc', 'UTF8')
    ), 'hex');

    -- Publication batch — PUBLISHED (ad hoc audit pack)
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
        v_batch_id, v_tenant, 'LE-IN',
        'PUB-ADHOC-LE-IN-2026-03',
        'March 2026 LE-IN ad hoc audit data package — statutory auditor request for IndAS schedules.',
        2026, 3, 'STAT',
        'KPI', r.pack_inst_id,
        'PUBLISHED',
        4, 0,
        v_manifest_hash, 4,
        v_tenant, v_now - interval '3 days',
        v_tenant, v_now - interval '2 days',
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, batch_code) DO NOTHING;

    UPDATE fin.pack_certification SET publication_batch_id = v_batch_id WHERE id = r.cert_id;

    -- Manifest items (4 IndAS-relevant KPIs)
    INSERT INTO fin.publication_manifest_item (
        tenant_id, entity_code, publication_batch_id,
        artifact_type, artifact_id,
        definition_code, definition_version,
        fiscal_year, period_number, book_code,
        published_value, published_currency,
        artifact_hash
    ) VALUES
        (v_tenant, 'LE-IN', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'GROSS_MARGIN_PCT', 2, 2026, 3, 'STAT', 38.5000, null,
         encode(sha256(convert_to('gm-pct-IN-adhoc', 'UTF8')), 'hex')),
        (v_tenant, 'LE-IN', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'NET_MARGIN_PCT', 1, 2026, 3, 'STAT', 11.2000, null,
         encode(sha256(convert_to('nm-pct-IN-adhoc', 'UTF8')), 'hex')),
        (v_tenant, 'LE-IN', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'CURRENT_RATIO', 1, 2026, 3, 'STAT', 1.95, null,
         encode(sha256(convert_to('cr-ratio-IN-adhoc', 'UTF8')), 'hex')),
        (v_tenant, 'LE-IN', v_batch_id, 'KPI_EXECUTION', gen_random_uuid(),
         'REVENUE_GROWTH_PCT', 1, 2026, 3, 'STAT', 15.8000, null,
         encode(sha256(convert_to('rg-pct-IN-adhoc', 'UTF8')), 'hex'))
    ON CONFLICT (publication_batch_id, artifact_type, artifact_id) DO NOTHING;

    -- Pack release — RELEASED (ad hoc, clean, fast pipeline)
    v_release_id := gen_random_uuid();
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
        assembled_at, ready_at, released_at, released_by,
        created_by
    ) VALUES (
        v_release_id, v_tenant, 'LE-IN',
        'REL-ADHOC-LE-IN-2026-03',
        'March 2026 Statutory Audit Package — LE-IN',
        'Ad hoc release for Deloitte statutory audit of LE-IN (India). IndAS schedules and supporting KPI data.',
        2026, 3, 3, 'STAT',
        'AD_HOC',
        r.pack_inst_id, v_batch_id,
        r.cert_id, r.run_id, r.snap_id,
        'RELEASED',
        true, 0, 0.0000,
        99.00, 'HARD_CLOSED',
        false,
        v_now - interval '2 days',
        v_now - interval '1 day',
        v_now - interval '20 hours',
        v_tenant,
        v_tenant
    ) ON CONFLICT (tenant_id, entity_code, release_code) DO NOTHING;

    -- Distribution — to external auditor + local finance
    v_dist_id := gen_random_uuid();
    INSERT INTO fin.pack_distribution (
        id, tenant_id, pack_instance_id,
        distribution_code, name, description,
        format, certification_id,
        distributed_by, distributed_at,
        status,
        recipient_count, delivered_count, viewed_count, downloaded_count,
        publication_batch_id, artifact_hash
    ) VALUES (
        v_dist_id, v_tenant, r.pack_inst_id,
        'DIST-ADHOC-LE-IN-2026-03',
        'Statutory Audit Data Package Distribution',
        'IndAS-compliant financial data package for Deloitte statutory audit team.',
        'EXCEL', r.cert_id,
        v_tenant, v_now - interval '18 hours',
        'SENT',
        3, 3, 2, 2,
        v_batch_id, v_manifest_hash
    ) ON CONFLICT (tenant_id, pack_instance_id, distribution_code) DO NOTHING;

    INSERT INTO fin.pack_distribution_recipient (
        distribution_id, recipient_name, recipient_email, recipient_role,
        delivery_status, sent_at, delivered_at,
        first_viewed_at, view_count
    ) VALUES
        (v_dist_id, 'Anand Krishnan', 'anand.krishnan@deloitte.com', 'External Auditor (Deloitte)',
         'DELIVERED', v_now - interval '18 hours', v_now - interval '17 hours',
         v_now - interval '16 hours', 3),
        (v_dist_id, 'Vikram Mehta', 'vikram.mehta@demo-ca.com', 'Finance Controller (IN)',
         'DELIVERED', v_now - interval '18 hours', v_now - interval '17 hours',
         v_now - interval '15 hours', 2),
        (v_dist_id, 'Priya Sharma', 'priya.sharma@demo-ca.com', 'Senior Accountant (IN)',
         'DELIVERED', v_now - interval '18 hours', v_now - interval '17 hours',
         null, 0)
    ON CONFLICT (distribution_id, recipient_id) DO NOTHING;

    -- Decision log
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id, policy_evaluation, result,
        correlation_id, publication_batch_id, certification_id, created_at
    ) VALUES
        (v_tenant, 'LE-IN', v_release_id, 'ASSEMBLE', v_tenant,
         jsonb_build_object('components_valid', true, 'pack_status', 'PUBLISHED',
             'batch_status', 'PUBLISHED', 'certification_status', 'CERTIFIED'),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '2 days'),
        (v_tenant, 'LE-IN', v_release_id, 'MARK_READY', v_tenant,
         jsonb_build_object('is_clean', true, 'requires_exception_signoff', false,
             'readiness_score', 99.00, 'override_count', 0, 'override_impact', 0,
             'thresholds', jsonb_build_object('max_overrides', 2, 'min_readiness', 90.00, 'max_impact', 50000.00),
             'disqualification_reasons', '[]'::jsonb),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '1 day'),
        (v_tenant, 'LE-IN', v_release_id, 'RELEASE', v_tenant,
         jsonb_build_object('gates_passed', jsonb_build_object(
             'status_ready', true, 'batch_published', true, 'cert_approved_or_certified', true,
             'exception_signoff_not_required', true,
             'integrity_check', jsonb_build_object('passed', true, 'checks_run', 8, 'checks_passed', 8))),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '20 hours'),
        (v_tenant, 'LE-IN', v_release_id, 'INTEGRITY_CHECK', null,
         jsonb_build_object('all_passed', true, 'check_count', 8, 'results', jsonb_build_object(
             'component_linkage', 'PASS', 'batch_published', 'PASS', 'manifest_hash_valid', 'PASS',
             'manifest_count_valid', 'PASS', 'consumer_state_consistent', 'PASS',
             'batch_not_superseded', 'PASS', 'certification_valid', 'PASS', 'distributions_exist', 'PASS')),
         'APPROVED', v_corr, v_batch_id, r.cert_id, v_now - interval '20 hours');

    -- Notifications
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary,
        detail_payload, processed, processed_at
    ) VALUES
        (v_tenant, 'LE-IN', v_release_id, 'RELEASE_COMPLETED', 'INFO',
         'LE-IN March statutory audit package released to Deloitte. Clean close, 99% readiness.',
         jsonb_build_object('distribution_count', 1, 'recipient_count', 3, 'auditor', 'Deloitte'),
         true, v_now - interval '18 hours');

    -- SLA snapshot — fast ad hoc pipeline (28h total)
    INSERT INTO fin.release_sla_snapshot (
        tenant_id, entity_code, release_id,
        fiscal_year, period_number,
        close_start_date, close_hard_close_target, close_hard_close_actual,
        close_duration_hours,
        assembly_duration_hours, certification_wait_hours,
        exception_signoff_wait_hours, release_to_distribution_hours,
        total_pipeline_hours,
        close_sla_met, release_type,
        override_count, is_clean_close, captured_at
    ) VALUES (
        v_tenant, 'LE-IN', v_release_id,
        2026, 3,
        '2026-04-01'::date, '2026-04-08'::date, '2026-04-03'::date,
        48.00,
        4.00, 16.00, 0.00, 2.00,
        70.00,
        true, 'AD_HOC', 0, true, v_now - interval '16 hours'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Story 8 (Ad Hoc Interim) seeded for demo_ca LE-IN';
END $$;


-- ############################################################################
-- CLEANUP
-- ############################################################################

DROP TABLE IF EXISTS _seed_ca_release_ids;
