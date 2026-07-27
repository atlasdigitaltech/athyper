-- ============================================================================
-- control/04zzo_authorization_migration_controls_indexes.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS authorization_capture_source_enabled_idx
    ON control.authorization_capture_source (source_kind, source_schema, source_table)
    WHERE capture_enabled;

CREATE INDEX IF NOT EXISTS authorization_writer_registry_match_idx
    ON control.authorization_writer_registry (status, priority, effective_from, effective_until)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS authorization_anomaly_disposition_source_idx
    ON control.authorization_anomaly_disposition (
        source_schema, source_table, classification, approved_at DESC
    );

CREATE INDEX IF NOT EXISTS authorization_anomaly_disposition_open_idx
    ON control.authorization_anomaly_disposition (severity, owner_team, approved_at)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS authorization_migration_run_status_idx
    ON control.authorization_migration_run (status, created_at DESC);

CREATE INDEX IF NOT EXISTS authorization_migration_run_source_idx
    ON control.authorization_migration_run (source_database_id, created_at DESC);

