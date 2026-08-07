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

REVOKE ALL ON event.authorization_invalidation_outbox FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT, INSERT ON event.authorization_invalidation_outbox TO athyperapp;
    GRANT EXECUTE ON FUNCTION event.fn_authorization_bump_epoch(text, uuid, text), event.fn_authorization_emit_invalidation(text, text, uuid, text, text, char, jsonb, timestamptz), event.fn_authorization_claim_invalidations(text, integer, integer), event.fn_authorization_complete_invalidation(uuid, text), event.fn_authorization_fail_invalidation(uuid, text, text, integer) TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON event.authorization_invalidation_outbox TO athyperadmin; END IF;
END $$;

REVOKE ALL ON event.descriptor_invalidation_outbox FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE
            ON event.descriptor_invalidation_outbox TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES
            ON event.descriptor_invalidation_outbox TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON event.notification_delivery_claim, event.digest_staging,
    event.push_subscription, event.whatsapp_consent, event.webhook_subscription FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_notification_claim_deliveries(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION event.trg_mirror_whatsapp_consent_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.current_plane_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_notification_work_tenants(text, text, integer) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON event.notification_delivery_claim TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON event.digest_staging TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON event.push_subscription, event.whatsapp_consent TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON event.webhook_subscription TO athyperapp;
        GRANT EXECUTE ON FUNCTION event.fn_notification_claim_deliveries(text, integer, integer) TO athyperapp;
        GRANT EXECUTE ON FUNCTION event.current_plane_key() TO athyperapp;
        GRANT EXECUTE ON FUNCTION event.fn_notification_work_tenants(text, text, integer) TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON event.notification_delivery_claim, event.digest_staging,
            event.push_subscription, event.whatsapp_consent, event.webhook_subscription TO athyperadmin;
        GRANT EXECUTE ON FUNCTION event.fn_notification_claim_deliveries(text, integer, integer) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION event.current_plane_key() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION event.fn_notification_work_tenants(text, text, integer) TO athyperadmin;
    END IF;
END;
$$;
