CREATE TRIGGER trg_audit_reason_code_00_created_by
BEFORE INSERT ON master.audit_reason_code
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_audit_reason_code_00_creation_evidence
BEFORE UPDATE ON master.audit_reason_code
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_master_evidence();

CREATE TRIGGER trg_audit_reason_code_05_normalize
BEFORE INSERT OR UPDATE ON master.audit_reason_code
FOR EACH ROW EXECUTE FUNCTION audit.trg_normalize_audit_reason_code();

CREATE TRIGGER trg_audit_reason_code_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.audit_reason_code
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_audit_reason_code();

CREATE TRIGGER trg_audit_reason_code_20_status_changed
BEFORE UPDATE OF status ON master.audit_reason_code
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_audit_reason_code_30_updated_at
BEFORE UPDATE ON master.audit_reason_code
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_audit_event_contract_05_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.audit_event_contract
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_event_contract();

CREATE TRIGGER trg_audit_log_05_prepare
BEFORE INSERT ON audit.audit_log
FOR EACH ROW EXECUTE FUNCTION audit.trg_prepare_audit_log();

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit.audit_log
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_audit_log_immutable();

CREATE TRIGGER trg_authorization_decision_05_prepare
BEFORE INSERT ON audit.authorization_decision_evidence
FOR EACH ROW EXECUTE FUNCTION audit.trg_prepare_authorization_decision();

CREATE TRIGGER trg_authorization_decision_immutable
BEFORE UPDATE OR DELETE ON audit.authorization_decision_evidence
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_immutable_evidence();

CREATE TRIGGER trg_security_event_05_prepare
BEFORE INSERT ON audit.security_event
FOR EACH ROW EXECUTE FUNCTION audit.trg_prepare_security_event();

CREATE TRIGGER trg_security_event_immutable
BEFORE UPDATE OR DELETE ON audit.security_event
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_immutable_evidence();

CREATE TRIGGER trg_hash_anchor_05_prepare
BEFORE INSERT ON audit.hash_anchor
FOR EACH ROW EXECUTE FUNCTION audit.trg_prepare_hash_anchor();

CREATE TRIGGER trg_hash_anchor_immutable
BEFORE UPDATE OR DELETE ON audit.hash_anchor
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_immutable_evidence();

CREATE TRIGGER trg_export_request_guard
BEFORE UPDATE OR DELETE ON audit.export_request
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_export_request();

CREATE TRIGGER trg_export_manifest_immutable
BEFORE UPDATE OR DELETE ON audit.export_manifest
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_immutable_evidence();

CREATE TRIGGER trg_integrity_check_evidence_immutable
BEFORE UPDATE OR DELETE ON audit.integrity_check_evidence
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_immutable_evidence();

CREATE TRIGGER trg_legal_hold_guard
BEFORE UPDATE OR DELETE ON audit.legal_hold
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_legal_hold();

CREATE TRIGGER trg_legal_hold_manifest_immutable
BEFORE UPDATE OR DELETE ON audit.legal_hold_manifest
FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_immutable_evidence();

CREATE TRIGGER trg_retention_policy_updated_at
BEFORE UPDATE ON audit.retention_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
