-- ============================================================================
-- mesh_log/06_triggers.sql
-- Append-only guards and operational update triggers.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_audit_event_immutable ON mesh_log.audit_event;
CREATE TRIGGER trg_audit_event_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.audit_event
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_security_event_log_immutable ON mesh_log.security_event_log;
CREATE TRIGGER trg_security_event_log_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.security_event_log
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_access_decision_log_immutable ON mesh_log.access_decision_log;
CREATE TRIGGER trg_access_decision_log_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.access_decision_log
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_attachment_access_log_immutable ON mesh_log.attachment_access_log;
CREATE TRIGGER trg_attachment_access_log_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.attachment_access_log
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_delivery_attempt_log_immutable ON mesh_log.delivery_attempt_log;
CREATE TRIGGER trg_delivery_attempt_log_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.delivery_attempt_log
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_job_log_immutable ON mesh_log.job_log;
CREATE TRIGGER trg_job_log_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.job_log
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_hash_anchor_immutable ON mesh_log.hash_anchor;
CREATE TRIGGER trg_hash_anchor_immutable
    BEFORE UPDATE OR DELETE ON mesh_log.hash_anchor
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_dlq_updated_at ON mesh_log.dlq;
CREATE TRIGGER trg_dlq_updated_at
    BEFORE UPDATE ON mesh_log.dlq
    FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_set_updated_at();
