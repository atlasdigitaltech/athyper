/* ============================================================================
   Athyper v2.8 — Extend close_risk_rule for document_defect_detected
   Schema: fin
   Dependencies: 205_close_risk_signals.sql, 211_atlas_anomaly_rule_type.sql,
                 210_close_document_bridge.sql
   ============================================================================ */

-- Extend the rule_type CHECK constraint to include document_defect_detected
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
            'atlas_anomaly',
            'document_defect_detected'
        ));
