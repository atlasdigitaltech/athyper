-- ============================================================================
-- event/07g_authorization_change_capture_views.sql
-- Admin telemetry projections; underlying RLS remains authoritative.
-- ============================================================================

CREATE OR REPLACE VIEW event.v_authorization_legacy_write_telemetry
WITH (security_invoker = true)
AS
SELECT
    change.source_schema,
    change.source_table,
    change.source_kind,
    change.operation,
    change.session_user_name,
    change.current_user_name,
    change.application_name,
    matched.writer_key,
    count(*)::bigint AS write_count,
    min(change.source_watermark) AS first_watermark,
    max(change.source_watermark) AS last_watermark,
    min(change.captured_at) AS first_captured_at,
    max(change.captured_at) AS last_captured_at
FROM event.authorization_change_event AS change
LEFT JOIN LATERAL (
    SELECT writer.writer_key
    FROM control.authorization_writer_registry AS writer
    WHERE writer.status = 'approved'
      AND change.captured_at >= writer.effective_from
      AND (
          writer.effective_until IS NULL
          OR change.captured_at < writer.effective_until
      )
      AND (
          change.session_user_name LIKE writer.db_role_pattern
          OR change.current_user_name LIKE writer.db_role_pattern
      )
      AND COALESCE(change.application_name, '') LIKE writer.application_name_pattern
      AND change.source_schema LIKE writer.source_schema_pattern
      AND change.source_table LIKE writer.source_table_pattern
      AND change.operation::text = ANY (writer.allowed_operations)
    ORDER BY writer.priority, writer.writer_key
    LIMIT 1
) AS matched ON true
GROUP BY
    change.source_schema,
    change.source_table,
    change.source_kind,
    change.operation,
    change.session_user_name,
    change.current_user_name,
    change.application_name,
    matched.writer_key;

COMMENT ON VIEW event.v_authorization_legacy_write_telemetry IS
    'Captured legacy writes matched to the highest-priority active approved '
    'writer. writer_key NULL means an unknown writer and blocks Wave 0 exit.';


CREATE OR REPLACE VIEW event.v_authorization_capture_health
WITH (security_invoker = true)
AS
SELECT
    clock.source_database_id,
    clock.capture_contract_version,
    clock.current_watermark AS source_high_watermark,
    checkpoint.id AS checkpoint_id,
    checkpoint.migration_run_id,
    checkpoint.consumer_name,
    checkpoint.last_applied_watermark,
    GREATEST(
        clock.current_watermark - checkpoint.last_applied_watermark,
        0
    ) AS watermark_lag,
    checkpoint.state,
    checkpoint.lease_owner,
    checkpoint.lease_until,
    checkpoint.last_error,
    checkpoint.updated_at AS checkpoint_updated_at,
    clock.updated_at AS source_updated_at
FROM event.authorization_capture_clock AS clock
LEFT JOIN event.authorization_projection_checkpoint AS checkpoint
    ON checkpoint.source_database_id = clock.source_database_id
WHERE clock.singleton_id = 1;

COMMENT ON VIEW event.v_authorization_capture_health IS
    'Source high watermark and projector lag. A cutover requires an approved '
    'checkpoint at zero lag plus transaction/count reconciliation.';

