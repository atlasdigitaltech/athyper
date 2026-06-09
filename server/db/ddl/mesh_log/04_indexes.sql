-- ============================================================================
-- mesh_log/04_indexes.sql
-- Query paths for Mesh audit and telemetry logs.
-- ============================================================================

CREATE INDEX IF NOT EXISTS mesh_log_audit_event_target_idx
    ON mesh_log.audit_event (account_code, target_type, target_id, occurred_at DESC)
    WHERE target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_audit_event_actor_idx
    ON mesh_log.audit_event (actor_account_code, actor_principal_id, occurred_at DESC)
    WHERE actor_account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_audit_event_correlation_idx
    ON mesh_log.audit_event (correlation_id)
    WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_audit_event_destructive_idx
    ON mesh_log.audit_event (account_code, operation, occurred_at DESC)
    WHERE operation IN ('delete', 'purge', 'archive', 'revoke');

CREATE INDEX IF NOT EXISTS mesh_log_security_event_subject_idx
    ON mesh_log.security_event_log (account_code, realm_key, provider_code, subject_id, occurred_at DESC)
    WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_security_event_failure_idx
    ON mesh_log.security_event_log (account_code, event_category, occurred_at DESC)
    WHERE outcome IN ('failure', 'blocked');
CREATE INDEX IF NOT EXISTS mesh_log_security_event_ip_idx
    ON mesh_log.security_event_log (account_code, ip_address, occurred_at DESC)
    WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_security_event_risk_idx
    ON mesh_log.security_event_log (account_code, risk_score DESC, occurred_at DESC)
    WHERE risk_score IS NOT NULL AND risk_score >= 60;

CREATE INDEX IF NOT EXISTS mesh_log_access_decision_principal_idx
    ON mesh_log.access_decision_log (account_code, principal_id, occurred_at DESC)
    WHERE principal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_access_decision_resource_idx
    ON mesh_log.access_decision_log (account_code, resource_type, resource_id, occurred_at DESC)
    WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_access_decision_deny_idx
    ON mesh_log.access_decision_log (account_code, decision, occurred_at DESC)
    WHERE decision <> 'allow';

CREATE INDEX IF NOT EXISTS mesh_log_attachment_access_attachment_idx
    ON mesh_log.attachment_access_log (account_code, attachment_id, occurred_at DESC)
    WHERE attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_attachment_access_payload_idx
    ON mesh_log.attachment_access_log (account_code, payload_id, occurred_at DESC)
    WHERE payload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_attachment_access_denied_idx
    ON mesh_log.attachment_access_log (account_code, occurred_at DESC)
    WHERE outcome IN ('denied', 'quarantined');

CREATE INDEX IF NOT EXISTS mesh_log_delivery_attempt_envelope_idx
    ON mesh_log.delivery_attempt_log (account_code, envelope_id, occurred_at DESC)
    WHERE envelope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_delivery_attempt_failure_idx
    ON mesh_log.delivery_attempt_log (account_code, delivery_type, occurred_at DESC)
    WHERE is_success = false;
CREATE INDEX IF NOT EXISTS mesh_log_delivery_attempt_purge_idx
    ON mesh_log.delivery_attempt_log (purge_after)
    WHERE purge_after IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_log_job_log_run_idx
    ON mesh_log.job_log (queue_name, run_id, occurred_at DESC)
    WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesh_log_job_log_failed_idx
    ON mesh_log.job_log (account_code, job_type, occurred_at DESC)
    WHERE status IN ('failed', 'timeout');
CREATE INDEX IF NOT EXISTS mesh_log_job_log_purge_idx
    ON mesh_log.job_log (purge_after)
    WHERE purge_after IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_log_dlq_open_idx
    ON mesh_log.dlq (status, last_attempted_at DESC)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS mesh_log_dlq_account_idx
    ON mesh_log.dlq (account_code, created_at DESC)
    WHERE account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_log_hash_anchor_account_date_idx
    ON mesh_log.hash_anchor (account_code, anchor_date DESC)
    WHERE account_code IS NOT NULL;
