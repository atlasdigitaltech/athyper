-- Fixed resolution for invoker functions shared by every database plane.
-- The schemas are owned by the database administrator; application roles do
-- not have CREATE privileges on them.
ALTER FUNCTION control.jsonb_has_secret_shaped_key(jsonb)
    SET search_path = pg_catalog, control, shared;
ALTER FUNCTION control.trg_guard_control_identity()
    SET search_path = pg_catalog, control, shared;
ALTER FUNCTION control.trg_reject_cycle_dependency_cycle()
    SET search_path = pg_catalog, control, governance, shared;
ALTER FUNCTION control.trg_reject_secret_shaped_json()
    SET search_path = pg_catalog, control, shared;
ALTER FUNCTION control.trg_validate_cycle_domain()
    SET search_path = pg_catalog, control, shared;

ALTER FUNCTION event.current_plane_key()
    SET search_path = pg_catalog, event, shared;
ALTER FUNCTION event.trg_authorization_invalidation_immutable()
    SET search_path = pg_catalog, event, shared;
ALTER FUNCTION event.trg_guard_event_creation()
    SET search_path = pg_catalog, event, shared, master;
ALTER FUNCTION event.trg_guard_notification_inbox_state()
    SET search_path = pg_catalog, event, shared;
ALTER FUNCTION event.trg_mirror_whatsapp_consent_event()
    SET search_path = pg_catalog, event, governance, shared;
ALTER FUNCTION event.trg_reject_append_only_mutation()
    SET search_path = pg_catalog, event, shared;

ALTER FUNCTION governance.trg_guard_channel_consent_projection()
    SET search_path = pg_catalog, governance, shared;
ALTER FUNCTION governance.trg_guard_identity()
    SET search_path = pg_catalog, governance, shared;
ALTER FUNCTION log.trg_guard_notification_delivery_attempt()
    SET search_path = pg_catalog, log, shared;
ALTER FUNCTION log.trg_guard_notification_dlq()
    SET search_path = pg_catalog, log, shared;
ALTER FUNCTION runtime_meta.trg_authorization_epoch_coordinates_immutable()
    SET search_path = pg_catalog, runtime_meta, shared;
