REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC;
REVOKE ALL ON master.audit_event_contract FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA audit TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.audit_reason_code TO athyperapp;
        GRANT SELECT ON master.audit_event_contract TO athyperapp;
        GRANT SELECT
            ON audit.audit_log,
               audit.hash_anchor,
               audit.resolution_pipeline,
               audit.p2p_timeline,
               audit.activity_timeline,
               audit.entity_lifecycle_timeline,
               audit.workflow_timeline,
               audit.partition_health
            TO athyperapp;
        GRANT SELECT, INSERT
            ON audit.authorization_decision_evidence,
               audit.security_event
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION audit.append_event(
            text, audit.operation_d, text, uuid, audit.outcome_d,
            audit.event_severity_d, text, uuid, uuid, text, jsonb, jsonb,
            text[], jsonb, uuid, text, timestamptz
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA audit TO athyperadmin;
        GRANT ALL PRIVILEGES ON master.audit_reason_code TO athyperadmin;
        GRANT ALL PRIVILEGES ON master.audit_event_contract TO athyperadmin;
        GRANT SELECT
            ON audit.audit_log,
               audit.hash_anchor,
               audit.resolution_pipeline,
               audit.p2p_timeline,
               audit.activity_timeline,
               audit.entity_lifecycle_timeline,
               audit.workflow_timeline,
               audit.partition_health
            TO athyperadmin;
        GRANT SELECT, INSERT
            ON audit.authorization_decision_evidence,
               audit.security_event
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.trg_prepare_audit_log()
            TO athyperadmin;
        GRANT EXECUTE
            ON FUNCTION audit.trg_prepare_authorization_decision(),
                        audit.trg_prepare_security_event(),
                        audit.trg_prepare_hash_anchor()
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION master.seed_audit_reason_catalog(uuid, uuid)
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.append_event(
            text, audit.operation_d, text, uuid, audit.outcome_d,
            audit.event_severity_d, text, uuid, uuid, text, jsonb, jsonb,
            text[], jsonb, uuid, text, timestamptz
        ) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.append_platform_event(
            text, audit.operation_d, text, uuid, uuid, audit.outcome_d,
            audit.event_severity_d, jsonb, uuid, text, timestamptz
        ) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.ensure_monthly_partitions(date, integer)
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.create_hash_anchor(
            uuid, text, timestamptz, timestamptz, uuid
        ) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.verify_hash_anchor(uuid)
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION audit.install_document_row_audit_triggers()
            TO athyperadmin;
    END IF;
END;
$$;
