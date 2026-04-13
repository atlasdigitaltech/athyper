-- 09_triggers/006_log.sql
-- Lookup validation triggers for log schema tables.
-- Depends on: 04_tables/006_log.sql, 900_seed_data/008_log/001_lookup_domains.sql,
--             08_functions/002_control.sql (control.trg_validate_lookup_columns)
--
-- Convention  : trg_<table>_<column>_lookup
-- Pattern     : DROP IF EXISTS before CREATE (idempotent re-runs).
-- Fires       : BEFORE INSERT OR UPDATE OF <column> FOR EACH ROW
-- Function    : control.trg_validate_lookup_columns(domain_code, column_name)
--               Validates global (system) rows session-free; tenant extension rows
--               only when is_extensible=true and a session is established.
--
-- Tables with sealed vocabularies (inline CHECK) have NO trigger here.
-- Tables with lookup-validated columns:
--   audit_log              — actor_type          (log.actor_type)
--   security_event_log     — event_category      (log.security_event_category)
--   field_access_log       — field_classification (log.field_classification)
--   attachment_access_log  — access_type         (log.attachment_access_type)
--   password_history       — change_reason       (log.password_change_reason)
--   activity_log           — domain              (log.activity_domain)
--                          — activity_type       (log.activity_type)
--   export_log             — export_type         (log.export_type)
--   close_activity_log     — activity_type       (log.close_activity_type)
--   ai_feedback_log        — feedback_type       (log.ai_feedback_type)


-- —— audit_log.actor_type ————————————————————————————————————————————————
-- actor_type is nullable — control.trg_validate_lookup_columns returns NEW immediately
-- when the column is NULL, so no special nullable overload needed here.
DROP TRIGGER IF EXISTS trg_audit_log_actor_type_lookup ON log.audit_log;
CREATE TRIGGER trg_audit_log_actor_type_lookup
    BEFORE INSERT OR UPDATE OF actor_type ON log.audit_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.actor_type', 'actor_type');


-- —— security_event_log.event_category ———————————————————————————————————
-- Fires on the partitioned parent; PostgreSQL propagates to all monthly children.
DROP TRIGGER IF EXISTS trg_sel_event_category_lookup ON log.security_event_log;
CREATE TRIGGER trg_sel_event_category_lookup
    BEFORE INSERT OR UPDATE OF event_category ON log.security_event_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.security_event_category', 'event_category');


-- —— field_access_log.field_classification ———————————————————————————————
-- Domain is_extensible=true — tenants can add custom classifications.
-- Trigger validates global rows first, then tenant extension rows when session set.
DROP TRIGGER IF EXISTS trg_fal_field_classification_lookup ON log.field_access_log;
CREATE TRIGGER trg_fal_field_classification_lookup
    BEFORE INSERT OR UPDATE OF field_classification ON log.field_access_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.field_classification', 'field_classification');


-- —— attachment_access_log.access_type ———————————————————————————————————
-- Domain is_extensible=true — e.g. adding 'watermarked_download' without DDL.
DROP TRIGGER IF EXISTS trg_aal_access_type_lookup ON log.attachment_access_log;
CREATE TRIGGER trg_aal_access_type_lookup
    BEFORE INSERT OR UPDATE OF access_type ON log.attachment_access_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.attachment_access_type', 'access_type');


-- —— password_history.change_reason ——————————————————————————————————————
-- Nullable column. Trigger function short-circuits on NULL automatically.
DROP TRIGGER IF EXISTS trg_ph_change_reason_lookup ON log.password_history;
CREATE TRIGGER trg_ph_change_reason_lookup
    BEFORE INSERT OR UPDATE OF change_reason ON log.password_history
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.password_change_reason', 'change_reason');


-- —— activity_log.domain —————————————————————————————————————————————————
-- Domain is_extensible=true — tenants register custom activity domains.
DROP TRIGGER IF EXISTS trg_ala_domain_lookup ON log.activity_log;
CREATE TRIGGER trg_ala_domain_lookup
    BEFORE INSERT OR UPDATE OF domain ON log.activity_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.activity_domain', 'domain');


-- —— activity_log.activity_type ——————————————————————————————————————————
-- Domain is_extensible=true — keyed as {domain}.{type} (e.g. 'kpi.calculation').
-- Both domain and activity_type triggers fire independently; order is LIFO but
-- both must pass. Combined they enforce (domain, activity_type) validity.
DROP TRIGGER IF EXISTS trg_ala_activity_type_lookup ON log.activity_log;
CREATE TRIGGER trg_ala_activity_type_lookup
    BEFORE INSERT OR UPDATE OF activity_type ON log.activity_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.activity_type', 'activity_type');


-- —— export_log.export_type ——————————————————————————————————————————————
-- Domain is_extensible=true — new export destinations added without DDL.
DROP TRIGGER IF EXISTS trg_el_export_type_lookup ON log.export_log;
CREATE TRIGGER trg_el_export_type_lookup
    BEFORE INSERT OR UPDATE OF export_type ON log.export_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.export_type', 'export_type');


-- —— close_activity_log.activity_type ————————————————————————————————————
-- Domain is_extensible=false — sealed finance close vocabulary.
DROP TRIGGER IF EXISTS trg_cal_activity_type_lookup ON log.close_activity_log;
CREATE TRIGGER trg_cal_activity_type_lookup
    BEFORE INSERT OR UPDATE OF activity_type ON log.close_activity_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.close_activity_type', 'activity_type');


-- —— ai_feedback_log.feedback_type ———————————————————————————————————————
-- Domain is_extensible=false — platform-defined AI feedback types.
DROP TRIGGER IF EXISTS trg_afl_feedback_type_lookup ON log.ai_feedback_log;
CREATE TRIGGER trg_afl_feedback_type_lookup
    BEFORE INSERT OR UPDATE OF feedback_type ON log.ai_feedback_log
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('log.ai_feedback_type', 'feedback_type');


-- ============================================================================
-- §27  notification_delivery_attempt — SCOPED IMMUTABILITY GUARD
-- ============================================================================
-- Append-only with a narrow carve-out:
--   UPDATE of is_redacted, redaction_version, body_truncated, purge_after is ALLOWED
--   (credential scrubbing workflow — removes sensitive headers/body post-insert).
-- DELETE is always blocked.
-- All other columns are immutable after insert.

CREATE OR REPLACE FUNCTION log.trg_guard_notification_delivery_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = log
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'log.notification_delivery_attempt is append-only. DELETE is prohibited. '
            'Use purge_after to schedule GDPR-driven removal.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    -- Allow UPDATE only of redaction/retention columns
    IF TG_OP = 'UPDATE' THEN
        IF OLD.id                    IS DISTINCT FROM NEW.id
        OR OLD.tenant_id             IS DISTINCT FROM NEW.tenant_id
        OR OLD.delivery_id           IS DISTINCT FROM NEW.delivery_id
        OR OLD.subscription_id       IS DISTINCT FROM NEW.subscription_id
        OR OLD.request_url           IS DISTINCT FROM NEW.request_url
        OR OLD.request_method        IS DISTINCT FROM NEW.request_method
        OR OLD.request_body          IS DISTINCT FROM NEW.request_body
        OR OLD.request_content_type  IS DISTINCT FROM NEW.request_content_type
        OR OLD.response_status       IS DISTINCT FROM NEW.response_status
        OR OLD.response_headers      IS DISTINCT FROM NEW.response_headers
        OR OLD.response_body         IS DISTINCT FROM NEW.response_body
        OR OLD.response_content_type IS DISTINCT FROM NEW.response_content_type
        OR OLD.duration_ms           IS DISTINCT FROM NEW.duration_ms
        OR OLD.is_success            IS DISTINCT FROM NEW.is_success
        OR OLD.error                 IS DISTINCT FROM NEW.error
        OR OLD.created_at            IS DISTINCT FROM NEW.created_at
        OR OLD.created_by            IS DISTINCT FROM NEW.created_by
        THEN
            RAISE EXCEPTION
                'log.notification_delivery_attempt core fields are immutable. '
                'Only is_redacted, redaction_version, body_truncated, and '
                'purge_after may be updated (credential scrubbing workflow).'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION log.trg_guard_notification_delivery_attempt_mutation() IS
    'Scoped immutability guard for notification_delivery_attempt. '
    'Blocks DELETE. Blocks UPDATE of all columns except '
    'is_redacted, redaction_version, body_truncated, purge_after.';

DROP TRIGGER IF EXISTS trg_nda_immutable ON log.notification_delivery_attempt;
CREATE TRIGGER trg_nda_immutable
    BEFORE UPDATE OR DELETE ON log.notification_delivery_attempt
    FOR EACH ROW EXECUTE FUNCTION
    log.trg_guard_notification_delivery_attempt_mutation();


-- =============================================================================
-- §28  DOCUMENT · PRINT · BRANDING  —  log triggers
-- =============================================================================

-- ── log.render_dlq ─────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_render_dlq_updated_at ON log.render_dlq;
CREATE TRIGGER trg_render_dlq_updated_at
    BEFORE UPDATE ON log.render_dlq
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- log.resolution_log — append-only immutability guard
-- No updated_at or status_changed triggers (log table; no updates permitted).
-- ============================================================================

DROP TRIGGER IF EXISTS trg_resolution_log_immutable ON log.resolution_log;
CREATE TRIGGER trg_resolution_log_immutable
    BEFORE UPDATE OR DELETE ON log.resolution_log
    FOR EACH ROW EXECUTE FUNCTION log.trg_resolution_log_immutable();
