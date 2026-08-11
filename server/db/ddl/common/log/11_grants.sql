REVOKE ALL ON SCHEMA log FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA log FROM PUBLIC;
REVOKE ALL ON log.notification_delivery_attempt, log.notification_dlq,
    log.integration_delivery_attempt, log.integration_dlq FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA log TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON log.notification_delivery_attempt, log.notification_dlq TO athyperapp;
        GRANT SELECT, INSERT ON log.integration_delivery_attempt, log.integration_dlq TO athyperapp;
        GRANT UPDATE (replayed_at, replayed_by) ON log.integration_dlq TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA log TO athyperadmin;
        GRANT ALL PRIVILEGES ON log.notification_delivery_attempt, log.notification_dlq TO athyperadmin;
        GRANT ALL PRIVILEGES ON log.integration_delivery_attempt, log.integration_dlq TO athyperadmin;
    END IF;
END;
$$;
