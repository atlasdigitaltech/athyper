/* ============================================================================
   Atlas Anomaly Detection — Risk Rules
   Seed: fin.close_risk_rule (atlas_anomaly type)

   These rules configure when Atlas anomalies escalate to close risk signals.
   The anomaly detector runs independently; these rules control the bridge
   from anomalies → risk signals → EXCEPTION_SIGNOFF gate.
   ============================================================================ */

DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Demo tenant not found — skipping atlas anomaly rule seeding';
        RETURN;
    END IF;

    -- ATLAS_AMOUNT_OUTLIER: Escalate when any account has a WARNING+ amount outlier
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_AMOUNT_OUTLIER',
        'Atlas: GL Amount Outlier',
        'Fires when Atlas detects GL account balances that deviate significantly from historical baseline (z-score >= 2.5).',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["AMOUNT_OUTLIER", "UNUSUAL_ADJUSTMENT"]}'::jsonb,
        'high', 480, NULL, 100
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_RECON_VARIANCE: Escalate reconciliation discrepancies
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_RECON_VARIANCE',
        'Atlas: Reconciliation Variance',
        'Fires when Atlas detects reconciliation discrepancies outside historical tolerance.',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["RECON_VARIANCE"]}'::jsonb,
        'high', 480, NULL, 110
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_CRITICAL_ANOMALY: Escalate any critical anomaly immediately
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_CRITICAL',
        'Atlas: Critical Anomaly Escalation',
        'Fires when Atlas detects any anomaly at CRITICAL severity. Escalates to Controller.',
        'atlas_anomaly',
        '{"min_severity": "CRITICAL"}'::jsonb,
        'critical', 'CONTROLLER', 720, NULL, 120
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_PERIOD_END_SPIKE: Escalate period-end journal volume spikes
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_PERIOD_END_SPIKE',
        'Atlas: Period-End Journal Spike',
        'Fires when Atlas detects unusual journal entry volume in the last 3 days of the period.',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["PERIOD_END_SPIKE"]}'::jsonb,
        'high', 480, NULL, 130
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_MANUAL_RATIO: Escalate high manual journal entry ratio
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_MANUAL_RATIO',
        'Atlas: Manual Journal Ratio',
        'Fires when the proportion of manual/adjustment journal entries exceeds historical baseline.',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["MANUAL_JOURNAL_RATIO"]}'::jsonb,
        'medium', 480, NULL, 140
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_LATE_CLOSE: Escalate when close tasks take longer than expected
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_LATE_CLOSE',
        'Atlas: Close Task Duration Anomaly',
        'Fires when average close task duration exceeds historical baseline.',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["LATE_CLOSE_TASK"]}'::jsonb,
        'high', 480, NULL, 150
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_OVERRIDE_SPIKE: Escalate when waiver/override count spikes
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_OVERRIDE_SPIKE',
        'Atlas: Override/Waiver Spike',
        'Fires when the number of waived close tasks exceeds historical baseline. Escalates to Controller.',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["OVERRIDE_SPIKE"]}'::jsonb,
        'high', 'CONTROLLER', 480, NULL, 160
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- ATLAS_LARGE_ADJUSTMENT: Escalate unusually large single adjustments
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'ATLAS_LARGE_ADJUSTMENT',
        'Atlas: Large Adjustment Size',
        'Fires when a single adjustment entry exceeds historical maximum for that account.',
        'atlas_anomaly',
        '{"min_severity": "WARNING", "anomaly_types": ["LARGE_ADJUSTMENT"]}'::jsonb,
        'high', 480, NULL, 170
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    RAISE NOTICE 'Atlas anomaly rules seeded for ACME (8 rules total)';
END;
$$;
