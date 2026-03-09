/* ============================================================================
   Athyper v2.4 — DEMO SEED: Close Intelligence
   Tables: fin.close_risk_rule, fin.close_orchestration_snapshot,
           fin.close_risk_signal, fin.atlas_anomaly_baseline, fin.atlas_anomaly
   Dependencies: 337_seed_demo_close_checklists.sql, 335_seed_demo_gl_balances.sql

   Seeds the full close intelligence stack for demo tenants:
     1. Close risk rules (8 standard rules per tenant/entity)
     2. Orchestration snapshots (trend data for P1/P2)
     3. Risk signals for P2 (fired/acknowledged for the FAILED task)
     4. Atlas anomaly baselines (trailing 12-period synthetic baselines)
     5. Atlas anomalies for P2 (2 per tenant — one WARNING, one CRITICAL)

   MC-4 compliant. DEMO DATA ONLY.
   ============================================================================ */

-- ============================================================================
-- Part 1: Close Risk Rules for demo tenants
-- ============================================================================
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
            INSERT INTO fin.close_risk_rule (
                tenant_id, entity_code, rule_code, rule_name, description,
                rule_type, parameters, severity,
                escalation_role, cooldown_minutes, target_status, sort_order, is_active
            ) VALUES
                (v_tenant, v_entity, 'FORECAST_SLIP_2H', 'Close Forecast Slipped (2h)',
                 'Predicted close readiness shifted by >2 hours',
                 'forecast_slipped', '{"threshold_minutes": 120, "lookback_snapshots": 3}',
                 'high', NULL, 240, NULL, 10, true),

                (v_tenant, v_entity, 'CONFIDENCE_DROP', 'Close Confidence Dropped',
                 'Confidence level decreased across snapshots',
                 'confidence_dropped', '{"from": "medium"}',
                 'high', NULL, 360, NULL, 20, true),

                (v_tenant, v_entity, 'BLOCKER_STALE_3', 'Stale Blockers (3 snapshots)',
                 'Same blockers persist across 3+ consecutive snapshots',
                 'blocker_stale', '{"stale_snapshot_count": 3}',
                 'critical', NULL, 480, NULL, 30, true),

                (v_tenant, v_entity, 'FAILED_24H', 'Failed Task Unresolved (24h)',
                 'A failed task remains unresolved beyond 24 hours',
                 'failed_task_unresolved', '{"threshold_hours": 24}',
                 'critical', 'CONTROLLER', 480, NULL, 40, true),

                (v_tenant, v_entity, 'READY_AGING_8H', 'Ready Queue Aging (8h)',
                 'Ready tasks awaiting action beyond 8 hours',
                 'ready_queue_aging', '{"threshold_hours": 8}',
                 'medium', NULL, 240, NULL, 50, true),

                (v_tenant, v_entity, 'SLA_WARN_4H', 'SLA Warning (4h)',
                 'Task approaching SLA within 4 hours',
                 'sla_warning', '{"lead_hours": 4}',
                 'medium', NULL, 120, NULL, 60, true),

                (v_tenant, v_entity, 'SLA_BREACH', 'SLA Breach',
                 'Task past SLA deadline',
                 'sla_breach', '{}',
                 'high', 'CONTROLLER', 240, NULL, 70, true),

                (v_tenant, v_entity, 'TARGET_AT_RISK_SC', 'Soft Close Target At Risk',
                 'Within 3 days of soft close target with low confidence',
                 'close_target_at_risk', '{"days_before_target": 3, "min_confidence": "medium"}',
                 'critical', 'CFO', 720, 'SOFT_CLOSE', 80, true)

            ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

        END LOOP;
        RAISE NOTICE 'Close risk rules (8) seeded for tenant %', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Part 2: Close Orchestration Snapshots (trend data for P1 + P2)
-- ============================================================================
DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_now      timestamptz := now();
    v_total    int;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Count tasks for this entity
            SELECT count(*) INTO v_total FROM fin.period_close_task
            WHERE tenant_id = v_tenant AND entity_code = v_entity;
            IF v_total = 0 THEN v_total := 16; END IF;

            -- ============================================================
            -- P1 snapshots: 3 snapshots showing progression to HARD_CLOSE
            -- ============================================================

            -- P1 snapshot 1: early (60% done)
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 1,
                v_now - interval '35 days', 'SOFT_CLOSE',
                v_total, (v_total * 0.6)::int, 2,
                0, 0, (v_total * 0.4)::int - 2, 2,
                180, v_now - interval '33 days',
                '[]', '[]',
                'medium', 'scheduled', 'v5.1', 'scheduler'
            );

            -- P1 snapshot 2: mid (85% done)
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 1,
                v_now - interval '32 days', 'SOFT_CLOSE',
                v_total, (v_total * 0.85)::int, 1,
                0, 0, (v_total * 0.15)::int - 1, 1,
                60, v_now - interval '31 days',
                '[]', '[]',
                'high', 'scheduled', 'v5.1', 'scheduler'
            );

            -- P1 snapshot 3: final (100% done)
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 1,
                v_now - interval '30 days', 'HARD_CLOSE',
                v_total, v_total, 0,
                0, 0, 0, 0,
                0, v_now - interval '30 days',
                '[]', '[]',
                'high', 'period_transition', 'v5.1', 'system'
            );

            -- ============================================================
            -- P2 snapshots: 4 snapshots showing progression with a hiccup
            -- ============================================================

            -- P2 snapshot 1: early (30%)
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 2,
                v_now - interval '7 days', 'SOFT_CLOSE',
                v_total, (v_total * 0.3)::int, 3,
                0, 0, (v_total * 0.7)::int - 3, 3,
                360, v_now - interval '2 days',
                '[]', '[]',
                'medium', 'scheduled', 'v5.1', 'scheduler'
            );

            -- P2 snapshot 2: mid (50%) — a task fails
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 2,
                v_now - interval '4 days', 'SOFT_CLOSE',
                v_total, (v_total * 0.5)::int, 2,
                0, 1, (v_total * 0.5)::int - 3, 2,
                300, v_now - interval '1 day',
                '[]', '["INV_VALUATION"]',
                'medium', 'scheduled', 'v5.1', 'scheduler'
            );

            -- P2 snapshot 3: slippage detected (still 50%, confidence drops)
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 2,
                v_now - interval '2 days', 'SOFT_CLOSE',
                v_total, (v_total * 0.5)::int, 2,
                0, 1, (v_total * 0.5)::int - 3, 2,
                420, v_now + interval '1 day',
                '[]', '["INV_VALUATION"]',
                'low', 'scheduled', 'v5.1', 'scheduler'
            );

            -- P2 snapshot 4: latest (recovery, 65%)
            INSERT INTO fin.close_orchestration_snapshot (
                tenant_id, entity_code, fiscal_year, period_number,
                snapshot_at, target_status,
                total_tasks, satisfied_count, ready_count,
                blocked_count, failed_count, not_ready_count, in_progress_count,
                critical_path_minutes, predicted_ready_at,
                blocker_task_codes, failed_task_codes,
                confidence, snapshot_source, computation_version, triggered_by
            ) VALUES (
                v_tenant, v_entity, 2026, 2,
                v_now - interval '6 hours', 'SOFT_CLOSE',
                v_total, (v_total * 0.65)::int, 2,
                0, 1, (v_total * 0.35)::int - 3, 2,
                240, v_now + interval '18 hours',
                '[]', '["INV_VALUATION"]',
                'medium', 'scheduled', 'v5.1', 'scheduler'
            );

        END LOOP;
        RAISE NOTICE 'Close orchestration snapshots (7) seeded for tenant %', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Part 3: Close Risk Signals for P2 (fired from the failed task scenario)
-- ============================================================================
DO $$
DECLARE
    v_tenant     uuid;
    v_code       text;
    v_entity     text;
    v_now        timestamptz := now();
    v_rule_id    uuid;
    v_snap_id    uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Get the latest P2 snapshot for trigger reference
            SELECT id INTO v_snap_id FROM fin.close_orchestration_snapshot
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND fiscal_year = 2026 AND period_number = 2
            ORDER BY snapshot_at DESC LIMIT 1;

            -- Signal 1: FAILED_24H rule — failed task unresolved
            SELECT id INTO v_rule_id FROM fin.close_risk_rule
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND rule_code = 'FAILED_24H';

            IF v_rule_id IS NOT NULL AND v_snap_id IS NOT NULL THEN
                INSERT INTO fin.close_risk_signal (
                    tenant_id, entity_code, fiscal_year, period_number,
                    rule_id, rule_code, rule_type, severity,
                    signal_state, trigger_snapshot_id,
                    title, message, evidence,
                    fired_at,
                    acknowledged_by, acknowledged_at
                ) VALUES (
                    v_tenant, v_entity, 2026, 2,
                    v_rule_id, 'FAILED_24H', 'failed_task_unresolved', 'critical',
                    'acknowledged', v_snap_id,
                    'Failed task unresolved for 26 hours',
                    'Task INV_VALUATION has been in FAILED state for 26 hours (threshold: 24h). Reconciliation variance of 2,847.50 exceeds tolerance.',
                    jsonb_build_object(
                        'task_code', 'INV_VALUATION',
                        'failed_hours', 26,
                        'threshold_hours', 24,
                        'variance', 2847.50
                    ),
                    v_now - interval '26 hours',
                    'controller@demo', v_now - interval '4 hours'
                );
            END IF;

            -- Signal 2: CONFIDENCE_DROP — confidence went from medium to low
            SELECT id INTO v_rule_id FROM fin.close_risk_rule
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND rule_code = 'CONFIDENCE_DROP';

            IF v_rule_id IS NOT NULL AND v_snap_id IS NOT NULL THEN
                INSERT INTO fin.close_risk_signal (
                    tenant_id, entity_code, fiscal_year, period_number,
                    rule_id, rule_code, rule_type, severity,
                    signal_state, trigger_snapshot_id,
                    title, message, evidence,
                    fired_at
                ) VALUES (
                    v_tenant, v_entity, 2026, 2,
                    v_rule_id, 'CONFIDENCE_DROP', 'confidence_dropped', 'high',
                    'fired', v_snap_id,
                    'Close confidence dropped to LOW',
                    'Soft close confidence for P2 dropped from medium to low. Failed task and forecast slippage detected.',
                    jsonb_build_object(
                        'from_confidence', 'medium',
                        'to_confidence', 'low',
                        'snapshot_at', (v_now - interval '2 days')::text
                    ),
                    v_now - interval '2 days'
                );
            END IF;

            -- Signal 3: FORECAST_SLIP_2H — resolved (shows lifecycle)
            SELECT id INTO v_rule_id FROM fin.close_risk_rule
            WHERE tenant_id = v_tenant AND entity_code = v_entity AND rule_code = 'FORECAST_SLIP_2H';

            IF v_rule_id IS NOT NULL AND v_snap_id IS NOT NULL THEN
                INSERT INTO fin.close_risk_signal (
                    tenant_id, entity_code, fiscal_year, period_number,
                    rule_id, rule_code, rule_type, severity,
                    signal_state, trigger_snapshot_id,
                    title, message, evidence,
                    fired_at,
                    acknowledged_by, acknowledged_at,
                    resolved_by, resolved_at, resolution_notes
                ) VALUES (
                    v_tenant, v_entity, 2026, 2,
                    v_rule_id, 'FORECAST_SLIP_2H', 'forecast_slipped', 'high',
                    'resolved', v_snap_id,
                    'Close forecast slipped by 3 hours',
                    'Predicted soft close readiness shifted from T-1d to T+2h, a net slip of ~3 hours.',
                    jsonb_build_object(
                        'previous_predicted', (v_now - interval '1 day')::text,
                        'current_predicted', (v_now + interval '2 hours')::text,
                        'slip_minutes', 180
                    ),
                    v_now - interval '4 days',
                    'controller@demo', v_now - interval '3 days',
                    'controller@demo', v_now - interval '1 day',
                    'Additional resources assigned; forecast recovered to within 1 hour of target.'
                );
            END IF;

        END LOOP;
        RAISE NOTICE 'Close risk signals (3) seeded for tenant %', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Part 4: Atlas Anomaly Baselines (synthetic trailing baselines)
-- ============================================================================
DO $$
DECLARE
    v_tenant     uuid;
    v_code       text;
    v_entity     text;
    v_acct_exp   uuid;
    v_acct_rev   uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Get representative accounts
            SELECT id INTO v_acct_exp FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EXPENSE' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            SELECT id INTO v_acct_rev FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'REVENUE' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            IF v_acct_exp IS NULL THEN CONTINUE; END IF;

            -- Baseline: PERIOD_DEBIT for expense account
            INSERT INTO fin.atlas_anomaly_baseline (
                tenant_id, entity_code, account_id,
                metric_type, baseline_mean, baseline_stddev, sample_count,
                window_periods, fiscal_year_from, period_from, fiscal_year_to, period_to,
                book_code, currency_code
            ) VALUES (
                v_tenant, v_entity, v_acct_exp,
                'PERIOD_DEBIT', 95000.0000, 12000.0000, 12,
                12, 2025, 1, 2025, 12,
                'STAT', 'USD'
            )
            ON CONFLICT DO NOTHING;

            -- Baseline: NET_MOVEMENT for expense account
            INSERT INTO fin.atlas_anomaly_baseline (
                tenant_id, entity_code, account_id,
                metric_type, baseline_mean, baseline_stddev, sample_count,
                window_periods, fiscal_year_from, period_from, fiscal_year_to, period_to,
                book_code, currency_code
            ) VALUES (
                v_tenant, v_entity, v_acct_exp,
                'NET_MOVEMENT', 95000.0000, 11500.0000, 12,
                12, 2025, 1, 2025, 12,
                'STAT', 'USD'
            )
            ON CONFLICT DO NOTHING;

            -- Baseline: PERIOD_CREDIT for revenue account
            IF v_acct_rev IS NOT NULL THEN
                INSERT INTO fin.atlas_anomaly_baseline (
                    tenant_id, entity_code, account_id,
                    metric_type, baseline_mean, baseline_stddev, sample_count,
                    window_periods, fiscal_year_from, period_from, fiscal_year_to, period_to,
                    book_code, currency_code
                ) VALUES (
                    v_tenant, v_entity, v_acct_rev,
                    'PERIOD_CREDIT', 125000.0000, 15000.0000, 12,
                    12, 2025, 1, 2025, 12,
                    'STAT', 'USD'
                )
                ON CONFLICT DO NOTHING;
            END IF;

            -- Baseline: ADJUSTMENT_COUNT (entity-level, no specific account)
            INSERT INTO fin.atlas_anomaly_baseline (
                tenant_id, entity_code, account_id,
                metric_type, baseline_mean, baseline_stddev, sample_count,
                window_periods, fiscal_year_from, period_from, fiscal_year_to, period_to,
                book_code, currency_code
            ) VALUES (
                v_tenant, v_entity, NULL,
                'ADJUSTMENT_COUNT', 4.0000, 1.5000, 12,
                12, 2025, 1, 2025, 12,
                'STAT', 'USD'
            )
            ON CONFLICT DO NOTHING;

            -- Baseline: MANUAL_ENTRY_RATIO (entity-level)
            INSERT INTO fin.atlas_anomaly_baseline (
                tenant_id, entity_code, account_id,
                metric_type, baseline_mean, baseline_stddev, sample_count,
                window_periods, fiscal_year_from, period_from, fiscal_year_to, period_to,
                book_code, currency_code
            ) VALUES (
                v_tenant, v_entity, NULL,
                'MANUAL_ENTRY_RATIO', 0.1500, 0.0400, 12,
                12, 2025, 1, 2025, 12,
                'STAT', 'USD'
            )
            ON CONFLICT DO NOTHING;

        END LOOP;
        RAISE NOTICE 'Atlas anomaly baselines (5) seeded for tenant %', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Part 5: Atlas Anomalies for P2 (detected during close)
-- ============================================================================
DO $$
DECLARE
    v_tenant       uuid;
    v_code         text;
    v_entity       text;
    v_acct_exp     uuid;
    v_baseline_id  uuid;
    v_now          timestamptz := now();
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            SELECT id INTO v_acct_exp FROM fin.chart_of_accounts
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_type = 'EXPENSE' AND NOT is_group AND is_active
            ORDER BY account_code LIMIT 1;

            IF v_acct_exp IS NULL THEN CONTINUE; END IF;

            -- Get baseline ID for this account
            SELECT id INTO v_baseline_id FROM fin.atlas_anomaly_baseline
            WHERE tenant_id = v_tenant AND entity_code = v_entity
              AND account_id = v_acct_exp AND metric_type = 'PERIOD_DEBIT'
            LIMIT 1;

            -- Anomaly 1: AMOUNT_OUTLIER (WARNING) — expense spike in P2
            INSERT INTO fin.atlas_anomaly (
                tenant_id, entity_code,
                anomaly_type, severity,
                account_id, fiscal_year, period_number, book_code,
                observed_value, expected_value, z_score, baseline_id,
                title, description, evidence,
                status, detected_at
            ) VALUES (
                v_tenant, v_entity,
                'AMOUNT_OUTLIER', 'WARNING',
                v_acct_exp, 2026, 2, 'STAT',
                128500.0000, 95000.0000, 2.7917, v_baseline_id,
                'Unusual expense spike in Period 2',
                'Total debits for this expense account in P2 (128,500.00) exceed the trailing 12-month baseline mean (95,000.00) by 2.79 standard deviations. This is above the WARNING threshold of 2.0 sigma.',
                jsonb_build_object(
                    'account_id', v_acct_exp,
                    'baseline_mean', 95000.00,
                    'baseline_stddev', 12000.00,
                    'observed', 128500.00,
                    'sigma_threshold', 2.0
                ),
                'ACKNOWLEDGED',
                v_now - interval '3 days'
            )
            ON CONFLICT (tenant_id, entity_code, anomaly_type, account_id, fiscal_year, period_number, book_code)
            DO NOTHING;

            -- Anomaly 2: UNUSUAL_ADJUSTMENT (CRITICAL) — too many adjustments
            INSERT INTO fin.atlas_anomaly (
                tenant_id, entity_code,
                anomaly_type, severity,
                account_id, fiscal_year, period_number, book_code,
                observed_value, expected_value, z_score, baseline_id,
                title, description, evidence,
                status, detected_at
            ) VALUES (
                v_tenant, v_entity,
                'UNUSUAL_ADJUSTMENT', 'CRITICAL',
                NULL, 2026, 2, 'STAT',
                9.0000, 4.0000, 3.3333, NULL,
                'Abnormal number of period-end adjustments',
                'Period 2 has 9 manual adjustment journal entries, significantly exceeding the baseline of 4.0 (z-score: 3.33). This exceeds the CRITICAL threshold of 3.0 sigma and warrants CFO review.',
                jsonb_build_object(
                    'adjustment_count', 9,
                    'baseline_mean', 4.0,
                    'baseline_stddev', 1.5,
                    'sigma_threshold', 3.0
                ),
                'OPEN',
                v_now - interval '1 day'
            )
            ON CONFLICT (tenant_id, entity_code, anomaly_type, account_id, fiscal_year, period_number, book_code)
            DO NOTHING;

            -- Anomaly 3: TIMING_ANOMALY (INFO) — posting pattern break in P1 (resolved)
            INSERT INTO fin.atlas_anomaly (
                tenant_id, entity_code,
                anomaly_type, severity,
                account_id, fiscal_year, period_number, book_code,
                observed_value, expected_value, z_score,
                title, description, evidence,
                status, resolved_by, resolved_at, resolution_notes,
                detected_at
            ) VALUES (
                v_tenant, v_entity,
                'TIMING_ANOMALY', 'INFO',
                v_acct_exp, 2026, 1, 'STAT',
                28.0000, 15.0000, 2.1000,
                'Late posting cluster detected in P1',
                'A cluster of 8 journal entries were posted on day 28 of the period, compared to the historical average posting day of 15. Flagged as a timing anomaly.',
                jsonb_build_object('posting_day', 28, 'baseline_avg_day', 15, 'entry_count', 8),
                'RESOLVED',
                '00000000-0000-0000-0000-000000000002'::uuid,
                v_now - interval '28 days',
                'Normal year-end catch-up; batch was delayed due to system maintenance window.',
                v_now - interval '30 days'
            )
            ON CONFLICT (tenant_id, entity_code, anomaly_type, account_id, fiscal_year, period_number, book_code)
            DO NOTHING;

        END LOOP;
        RAISE NOTICE 'Atlas anomalies (3) seeded for tenant %', v_code;
    END LOOP;
END $$;
