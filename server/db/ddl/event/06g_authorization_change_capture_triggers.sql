-- ============================================================================
-- event/06g_authorization_change_capture_triggers.sql
-- Install capture on every enabled registered legacy input.
--
-- This file runs in event's trigger phase, after shared/control/master tables
-- and event capture functions exist. Trigger names are relation-local, so the
-- same fixed names are safe on every registered source.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_authorization_change_event_immutable
    ON event.authorization_change_event;
CREATE TRIGGER trg_authorization_change_event_immutable
    BEFORE UPDATE OR DELETE ON event.authorization_change_event
    FOR EACH ROW
    EXECUTE FUNCTION event.trg_authorization_change_event_immutable();

DROP TRIGGER IF EXISTS trg_authorization_snapshot_marker_immutable
    ON event.authorization_snapshot_marker;
CREATE TRIGGER trg_authorization_snapshot_marker_immutable
    BEFORE UPDATE OR DELETE ON event.authorization_snapshot_marker
    FOR EACH ROW
    EXECUTE FUNCTION event.trg_authorization_change_event_immutable();

DROP TRIGGER IF EXISTS trg_authorization_change_transaction_guard
    ON event.authorization_change_transaction;
CREATE TRIGGER trg_authorization_change_transaction_guard
    BEFORE UPDATE OR DELETE ON event.authorization_change_transaction
    FOR EACH ROW
    EXECUTE FUNCTION event.trg_authorization_change_transaction_guard();

DROP TRIGGER IF EXISTS trg_authorization_capture_clock_guard
    ON event.authorization_capture_clock;
CREATE TRIGGER trg_authorization_capture_clock_guard
    BEFORE UPDATE OR DELETE ON event.authorization_capture_clock
    FOR EACH ROW
    EXECUTE FUNCTION event.trg_authorization_change_transaction_guard();

DROP TRIGGER IF EXISTS trg_authorization_projection_checkpoint_updated_at
    ON event.authorization_projection_checkpoint;
CREATE TRIGGER trg_authorization_projection_checkpoint_updated_at
    BEFORE UPDATE ON event.authorization_projection_checkpoint
    FOR EACH ROW
    EXECUTE FUNCTION shared.trg_set_updated_at();


DO $capture_installer$
DECLARE
    v_source record;
    v_relation regclass;
    v_key_column text;
BEGIN
    FOR v_source IN
        SELECT
            source_schema,
            source_table,
            primary_key_columns,
            tenant_column
        FROM control.authorization_capture_source
        WHERE capture_enabled
        ORDER BY source_schema, source_table
    LOOP
        v_relation := to_regclass(
            format('%I.%I', v_source.source_schema, v_source.source_table)
        );

        IF v_relation IS NULL THEN
            RAISE EXCEPTION
                'Registered authorization capture source %.% does not exist',
                v_source.source_schema,
                v_source.source_table
                USING ERRCODE = 'undefined_table';
        END IF;

        FOREACH v_key_column IN ARRAY v_source.primary_key_columns LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM pg_attribute
                WHERE attrelid = v_relation
                  AND attname = v_key_column
                  AND attnum > 0
                  AND NOT attisdropped
            ) THEN
                RAISE EXCEPTION
                    'Authorization capture source %.% has no registered key column %',
                    v_source.source_schema,
                    v_source.source_table,
                    v_key_column
                    USING ERRCODE = 'undefined_column';
            END IF;
        END LOOP;

        IF v_source.tenant_column IS NOT NULL
           AND NOT EXISTS (
                SELECT 1
                FROM pg_attribute
                WHERE attrelid = v_relation
                  AND attname = v_source.tenant_column
                  AND attnum > 0
                  AND NOT attisdropped
           )
        THEN
            RAISE EXCEPTION
                'Authorization capture source %.% has no tenant column %',
                v_source.source_schema,
                v_source.source_table,
                v_source.tenant_column
                USING ERRCODE = 'undefined_column';
        END IF;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_authz_wave0_capture_row ON %I.%I',
            v_source.source_schema,
            v_source.source_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_authz_wave0_capture_row '
            'AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
            'FOR EACH ROW EXECUTE FUNCTION event.trg_capture_authorization_change()',
            v_source.source_schema,
            v_source.source_table
        );
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER trg_authz_wave0_capture_row',
            v_source.source_schema,
            v_source.source_table
        );

        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_authz_wave0_capture_truncate ON %I.%I',
            v_source.source_schema,
            v_source.source_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_authz_wave0_capture_truncate '
            'AFTER TRUNCATE ON %I.%I '
            'FOR EACH STATEMENT EXECUTE FUNCTION event.trg_capture_authorization_truncate()',
            v_source.source_schema,
            v_source.source_table
        );
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER trg_authz_wave0_capture_truncate',
            v_source.source_schema,
            v_source.source_table
        );
    END LOOP;
END;
$capture_installer$;

COMMENT ON FUNCTION event.trg_capture_authorization_change() IS
    'ENABLE ALWAYS row trigger installed on every enabled relation in '
    'control.authorization_capture_source. The installer fails closed when a '
    'registered source or stable-key/tenant column is missing.';

