-- ============================================================================
-- event/04g_authorization_change_capture_indexes.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS authorization_change_event_tx_idx
    ON event.authorization_change_event (
        source_database_id, source_txid, source_watermark
    );

CREATE INDEX IF NOT EXISTS authorization_change_event_source_idx
    ON event.authorization_change_event (
        source_schema, source_table, operation, source_watermark DESC
    );

CREATE INDEX IF NOT EXISTS authorization_change_event_tenant_idx
    ON event.authorization_change_event (
        tenant_id, source_watermark DESC
    )
    WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS authorization_change_event_captured_idx
    ON event.authorization_change_event (captured_at DESC);

CREATE INDEX IF NOT EXISTS authorization_change_event_writer_idx
    ON event.authorization_change_event (
        session_user_name, application_name, source_watermark DESC
    );

CREATE INDEX IF NOT EXISTS authorization_change_transaction_watermark_idx
    ON event.authorization_change_transaction (
        source_database_id, first_watermark, last_watermark
    );

CREATE INDEX IF NOT EXISTS authorization_projection_checkpoint_lag_idx
    ON event.authorization_projection_checkpoint (
        source_database_id, last_applied_watermark, updated_at
    );

CREATE INDEX IF NOT EXISTS authorization_projection_checkpoint_lease_idx
    ON event.authorization_projection_checkpoint (lease_until)
    WHERE lease_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS authorization_snapshot_marker_source_idx
    ON event.authorization_snapshot_marker (
        source_database_id, source_watermark DESC, recorded_at DESC
    );

