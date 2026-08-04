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
