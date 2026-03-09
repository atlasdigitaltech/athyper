/* ============================================================================
   Standard Risk Rules for Period Close Orchestration
   Seed: fin.close_risk_rule

   Provides sensible default rules for all entity codes.
   Tenants can tune parameters, disable rules, or add custom ones.

   NOTE: Uses entity_code = '*' as a template wildcard.
   The materialization process should copy these to specific entity codes
   (similar to how close tasks are materialized per entity).
   For now, these serve as reference rules for the demo entity 'ACME'.
   ============================================================================ */

-- Use the demo tenant from existing seeds
DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Demo tenant not found — skipping close risk rule seeding';
        RETURN;
    END IF;

    -- forecast_slipped: predicted close shifted by 2+ hours
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'FORECAST_SLIP_2H', 'Close Forecast Slipped (2h)',
        'Fires when predicted close readiness shifts by more than 2 hours compared to recent snapshots.',
        'forecast_slipped',
        '{"threshold_minutes": 120, "lookback_snapshots": 3}'::jsonb,
        'high', 240, NULL, 10
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- confidence_dropped: any confidence downgrade from medium or above
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'CONFIDENCE_DROP', 'Close Confidence Dropped',
        'Fires when close readiness confidence drops (e.g., high → medium, medium → low).',
        'confidence_dropped',
        '{"from": "medium"}'::jsonb,
        'high', 360, NULL, 20
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- blocker_stale: same blockers across 3 consecutive snapshots
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'BLOCKER_STALE_3', 'Stale Blockers (3 snapshots)',
        'Fires when the same blocking tasks persist across 3 consecutive orchestration snapshots with no resolution.',
        'blocker_stale',
        '{"stale_snapshot_count": 3}'::jsonb,
        'critical', 480, NULL, 30
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- failed_task_unresolved: failed task unresolved for 24+ hours
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'FAILED_24H', 'Failed Task Unresolved (24h)',
        'Fires when a failed task remains unresolved for more than 24 hours.',
        'failed_task_unresolved',
        '{"threshold_hours": 24}'::jsonb,
        'critical',
        'CONTROLLER', 480, NULL, 40
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ready_queue_aging: ready tasks awaiting action for 8+ hours
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'READY_AGING_8H', 'Ready Queue Aging (8h)',
        'Fires when actionable tasks have been in the ready queue for more than 8 hours with no progress.',
        'ready_queue_aging',
        '{"threshold_hours": 8}'::jsonb,
        'medium', 240, NULL, 50
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- sla_warning: task approaching SLA within 4 hours
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'SLA_WARN_4H', 'SLA Warning (4h)',
        'Fires when close tasks are within 4 hours of their SLA deadline.',
        'sla_warning',
        '{"lead_hours": 4}'::jsonb,
        'medium', 120, NULL, 60
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- sla_breach: task past SLA deadline
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'SLA_BREACH', 'SLA Breach',
        'Fires when close tasks exceed their SLA deadline without completion.',
        'sla_breach',
        '{}'::jsonb,
        'high',
        'CONTROLLER', 240, NULL, 70
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- close_target_at_risk: within 3 days of target with low/medium confidence
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'TARGET_AT_RISK_SC', 'Soft Close Target At Risk',
        'Fires when within 3 days of the soft close target with medium or lower confidence.',
        'close_target_at_risk',
        '{"days_before_target": 3, "min_confidence": "medium"}'::jsonb,
        'critical',
        'CFO', 720, 'SOFT_CLOSE', 80
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'TARGET_AT_RISK_HC', 'Hard Close Target At Risk',
        'Fires when within 3 days of the hard close target with medium or lower confidence.',
        'close_target_at_risk',
        '{"days_before_target": 3, "min_confidence": "medium"}'::jsonb,
        'critical',
        'CFO', 720, 'HARD_CLOSE', 90
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    RAISE NOTICE 'Seeded 9 standard close risk rules for ACME entity';
END $$;
