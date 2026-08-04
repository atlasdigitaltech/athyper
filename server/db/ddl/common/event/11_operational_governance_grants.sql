REVOKE ALL ON SCHEMA event FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA event FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_outbox_purge_completed(interval, integer) FROM PUBLIC;
REVOKE ALL ON event.comment_flag, event.notification_message,
    event.notification_delivery, event.notification_inbox_state,
    event.outbox, event.channel_consent_event, event.command_execution FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA event TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON event.comment_flag TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON event.notification_message,
            event.notification_delivery, event.outbox TO athyperapp;
        GRANT DELETE ON event.outbox TO athyperapp;
        GRANT EXECUTE ON FUNCTION event.fn_outbox_purge_completed(interval, integer) TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON event.notification_inbox_state TO athyperapp;
        GRANT SELECT, INSERT ON event.channel_consent_event TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON event.command_execution TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA event TO athyperadmin;
        GRANT ALL PRIVILEGES ON event.comment_flag, event.notification_message,
            event.notification_delivery, event.notification_inbox_state,
            event.outbox, event.channel_consent_event, event.command_execution TO athyperadmin;
        GRANT EXECUTE ON FUNCTION event.fn_outbox_purge_completed(interval, integer) TO athyperadmin;
    END IF;
END;
$$;
