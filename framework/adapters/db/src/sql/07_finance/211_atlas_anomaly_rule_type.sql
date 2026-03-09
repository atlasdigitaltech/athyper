/* ============================================================================
   Athyper v2.10 — Extend close_risk_rule to support atlas_anomaly rule type
   Schema: fin
   Dependencies: 205_close_risk_signals.sql, 210_atlas_anomaly.sql
   ============================================================================ */

-- Add 'atlas_anomaly' to the rule_type CHECK constraint on fin.close_risk_rule.
-- The original CHECK was defined inline in 205_close_risk_signals.sql.

ALTER TABLE fin.close_risk_rule
    DROP CONSTRAINT IF EXISTS close_risk_rule_rule_type_check;

ALTER TABLE fin.close_risk_rule
    ADD CONSTRAINT close_risk_rule_rule_type_check
        CHECK (rule_type IN (
            'forecast_slipped',
            'confidence_dropped',
            'blocker_stale',
            'failed_task_unresolved',
            'ready_queue_aging',
            'sla_warning',
            'sla_breach',
            'close_target_at_risk',
            'atlas_anomaly'
        ));
