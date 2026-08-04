-- ============================================================================
-- log/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_ala_activity_type_lookup BEFORE INSERT OR UPDATE OF activity_type ON log.activity_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.activity_type', 'activity_type');

CREATE TRIGGER trg_ala_domain_lookup BEFORE INSERT OR UPDATE OF domain ON log.activity_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.activity_domain', 'domain');

CREATE TRIGGER trg_ala_activity_type_lookup BEFORE INSERT OR UPDATE OF activity_type ON log.activity_log_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.activity_type', 'activity_type');

CREATE TRIGGER trg_ala_domain_lookup BEFORE INSERT OR UPDATE OF domain ON log.activity_log_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.activity_domain', 'domain');

CREATE TRIGGER trg_ai_agent_call_immutable BEFORE DELETE OR UPDATE ON log.ai_agent_call FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_ai_agent_run_immutable BEFORE DELETE OR UPDATE ON log.ai_agent_run FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

CREATE TRIGGER trg_afl_feedback_type_lookup BEFORE INSERT OR UPDATE OF feedback_type ON log.ai_feedback_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.ai_feedback_type', 'feedback_type');

CREATE TRIGGER trg_aal_access_type_lookup BEFORE INSERT OR UPDATE OF access_type ON log.attachment_access_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.attachment_access_type', 'access_type');

CREATE TRIGGER trg_aal_access_type_lookup BEFORE INSERT OR UPDATE OF access_type ON log.attachment_access_log_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.attachment_access_type', 'access_type');

CREATE TRIGGER trg_audit_log_actor_type_lookup BEFORE INSERT OR UPDATE OF actor_type ON log.audit_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.actor_type', 'actor_type');

CREATE TRIGGER trg_audit_log_actor_type_lookup BEFORE INSERT OR UPDATE OF actor_type ON log.audit_log_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.actor_type', 'actor_type');

CREATE TRIGGER trg_auth_decision_evidence_v2_immutable BEFORE DELETE OR UPDATE ON log.auth_decision_evidence_v2 FOR EACH ROW EXECUTE FUNCTION log.trg_auth_decision_evidence_v2_immutable();

ALTER TABLE "log"."auth_decision_evidence_v2" ENABLE ALWAYS TRIGGER "trg_auth_decision_evidence_v2_immutable";

CREATE TRIGGER trg_auth_decision_evidence_v2_immutable BEFORE DELETE OR UPDATE ON log.auth_decision_evidence_v2_default FOR EACH ROW EXECUTE FUNCTION log.trg_auth_decision_evidence_v2_immutable();

ALTER TABLE "log"."auth_decision_evidence_v2_default" ENABLE ALWAYS TRIGGER "trg_auth_decision_evidence_v2_immutable";

CREATE TRIGGER trg_cal_activity_type_lookup BEFORE INSERT OR UPDATE OF activity_type ON log.close_activity_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.close_activity_type', 'activity_type');

CREATE TRIGGER trg_el_export_type_lookup BEFORE INSERT OR UPDATE OF export_type ON log.export_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.export_type', 'export_type');

CREATE TRIGGER trg_fal_field_classification_lookup BEFORE INSERT OR UPDATE OF field_classification ON log.field_access_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.field_classification', 'field_classification');

CREATE TRIGGER trg_fal_field_classification_lookup BEFORE INSERT OR UPDATE OF field_classification ON log.field_access_log_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.field_classification', 'field_classification');

CREATE TRIGGER trg_nda_immutable BEFORE DELETE OR UPDATE ON log.notification_delivery_attempt FOR EACH ROW EXECUTE FUNCTION log.trg_guard_notification_delivery_attempt_mutation();

CREATE TRIGGER trg_ph_change_reason_lookup BEFORE INSERT OR UPDATE OF change_reason ON log.password_history FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.password_change_reason', 'change_reason');

CREATE TRIGGER trg_render_dlq_updated_at BEFORE UPDATE ON log.render_dlq FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_resolution_log_immutable BEFORE DELETE OR UPDATE ON log.resolution_log FOR EACH ROW EXECUTE FUNCTION log.trg_resolution_log_immutable();

CREATE TRIGGER trg_sel_event_category_lookup BEFORE INSERT OR UPDATE OF event_category ON log.security_event_log FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.security_event_category', 'event_category');

CREATE TRIGGER trg_sel_event_category_lookup BEFORE INSERT OR UPDATE OF event_category ON log.security_event_log_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.security_event_category', 'event_category');
