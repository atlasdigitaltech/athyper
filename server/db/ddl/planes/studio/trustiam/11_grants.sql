REVOKE ALL ON SCHEMA trustiam FROM PUBLIC;
REVOKE ALL ON FUNCTION trustiam.trg_guard_projection_reconciliation_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION trustiam.trg_guard_projection_desired_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION trustiam.trg_guard_identity_saga_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION trustiam.trg_guard_identity_desired_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION trustiam.trg_guard_provider_identity_callback() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA trustiam TO athyperapp;
        GRANT SELECT ON trustiam.application_projection,trustiam.projection_reconciliation_attempt TO athyperapp;
        GRANT UPDATE(replay_requested_at,replay_requested_by,updated_by) ON trustiam.projection_reconciliation_attempt TO athyperapp;
        GRANT SELECT ON trustiam.identity_projection,trustiam.identity_saga_attempt TO athyperapp;
        GRANT UPDATE(replay_requested_at,replay_requested_by,replay_approved_by,updated_by) ON trustiam.identity_saga_attempt TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_reconciler') THEN
        GRANT USAGE ON SCHEMA trustiam,event TO athyper_projection_reconciler;
        GRANT SELECT ON trustiam.organization,trustiam.organization_provider,trustiam.application_projection,trustiam.projection_scope TO athyper_projection_reconciler;
        GRANT UPDATE(reconciliation_status,last_reconciled_at,last_error_code,updated_by) ON trustiam.application_projection TO athyper_projection_reconciler;
        GRANT SELECT,INSERT,UPDATE ON trustiam.projection_reconciliation_attempt TO athyper_projection_reconciler;
        GRANT INSERT ON event.outbox TO athyper_projection_reconciler;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_trustiam_service') THEN
        GRANT USAGE ON SCHEMA trustiam,event TO athyper_trustiam_service;
        GRANT SELECT,INSERT,UPDATE ON trustiam.organization,trustiam.organization_provider,
            trustiam.application_projection,trustiam.projection_scope,trustiam.identity_provisioning_request
            TO athyper_trustiam_service;
        GRANT SELECT,INSERT,UPDATE ON trustiam.identity_provisioning_attempt TO athyper_trustiam_service;
        GRANT SELECT,INSERT,UPDATE ON trustiam.identity_projection,trustiam.identity_saga_attempt,trustiam.provider_identity_callback_inbox TO athyper_trustiam_service;
        GRANT INSERT ON event.outbox TO athyper_trustiam_service;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA trustiam TO athyperadmin;
    END IF;
END;
$$;
