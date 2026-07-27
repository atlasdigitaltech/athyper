-- ============================================================================
-- event/08g_authorization_change_capture_rls.sql
-- Capture internals are trigger-only; platform admin receives evidence reads
-- and explicit checkpoint maintenance.
-- ============================================================================

ALTER TABLE event.authorization_capture_clock ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_capture_clock FORCE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_change_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_change_transaction FORCE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_change_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_change_event FORCE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_projection_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_projection_checkpoint FORCE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_snapshot_marker ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_snapshot_marker FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authorization_capture_clock_internal
    ON event.authorization_capture_clock;
CREATE POLICY authorization_capture_clock_internal
    ON event.authorization_capture_clock
    FOR ALL TO PUBLIC
    USING (
        current_setting('app.authorization_capture_internal', true) = 'on'
    )
    WITH CHECK (
        current_setting('app.authorization_capture_internal', true) = 'on'
    );

DROP POLICY IF EXISTS authorization_change_transaction_internal
    ON event.authorization_change_transaction;
CREATE POLICY authorization_change_transaction_internal
    ON event.authorization_change_transaction
    FOR ALL TO PUBLIC
    USING (
        current_setting('app.authorization_capture_internal', true) = 'on'
    )
    WITH CHECK (
        current_setting('app.authorization_capture_internal', true) = 'on'
    );

DROP POLICY IF EXISTS authorization_change_event_internal
    ON event.authorization_change_event;
CREATE POLICY authorization_change_event_internal
    ON event.authorization_change_event
    FOR INSERT TO PUBLIC
    WITH CHECK (
        current_setting('app.authorization_capture_internal', true) = 'on'
    );

DROP POLICY IF EXISTS authorization_snapshot_marker_internal
    ON event.authorization_snapshot_marker;
CREATE POLICY authorization_snapshot_marker_internal
    ON event.authorization_snapshot_marker
    FOR INSERT TO PUBLIC
    WITH CHECK (
        current_setting('app.authorization_capture_internal', true) = 'on'
    );

DROP POLICY IF EXISTS authorization_capture_clock_admin_read
    ON event.authorization_capture_clock;
CREATE POLICY authorization_capture_clock_admin_read
    ON event.authorization_capture_clock
    FOR SELECT TO athyperadmin
    USING (true);

DROP POLICY IF EXISTS authorization_change_transaction_admin_read
    ON event.authorization_change_transaction;
CREATE POLICY authorization_change_transaction_admin_read
    ON event.authorization_change_transaction
    FOR SELECT TO athyperadmin
    USING (true);

DROP POLICY IF EXISTS authorization_change_event_admin_read
    ON event.authorization_change_event;
CREATE POLICY authorization_change_event_admin_read
    ON event.authorization_change_event
    FOR SELECT TO athyperadmin
    USING (true);

DROP POLICY IF EXISTS authorization_snapshot_marker_admin_read
    ON event.authorization_snapshot_marker;
CREATE POLICY authorization_snapshot_marker_admin_read
    ON event.authorization_snapshot_marker
    FOR SELECT TO athyperadmin
    USING (true);

DROP POLICY IF EXISTS authorization_projection_checkpoint_admin
    ON event.authorization_projection_checkpoint;
CREATE POLICY authorization_projection_checkpoint_admin
    ON event.authorization_projection_checkpoint
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE
    event.authorization_capture_clock,
    event.authorization_change_transaction,
    event.authorization_change_event,
    event.authorization_projection_checkpoint,
    event.authorization_snapshot_marker
FROM PUBLIC;

GRANT SELECT ON TABLE
    event.authorization_capture_clock,
    event.authorization_change_transaction,
    event.authorization_change_event,
    event.authorization_snapshot_marker
TO athyperadmin;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    event.authorization_projection_checkpoint
TO athyperadmin;

GRANT SELECT ON TABLE
    event.v_authorization_legacy_write_telemetry,
    event.v_authorization_capture_health
TO athyperadmin;

