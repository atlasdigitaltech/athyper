-- ============================================================================
-- event/05g_authorization_change_capture_functions.sql
-- Privacy-safe, commit-ordered authorization capture and watermark protocol.
-- ============================================================================

CREATE OR REPLACE FUNCTION event.fn_authorization_capture_safe_uuid(
    p_value text
)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
BEGIN
    RETURN p_value::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION event.fn_authorization_capture_redact(
    p_row jsonb,
    p_redacted_columns text[]
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN p_row IS NULL THEN NULL
        ELSE COALESCE(
            (
                SELECT jsonb_object_agg(
                    item.key,
                    CASE
                        WHEN item.key = ANY (
                            COALESCE(p_redacted_columns, '{}'::text[])
                        )
                        THEN to_jsonb('[REDACTED]'::text)
                        ELSE item.value
                    END
                    ORDER BY item.key
                )
                FROM jsonb_each(p_row) AS item(key, value)
            ),
            '{}'::jsonb
        )
    END;
$$;

COMMENT ON FUNCTION event.fn_authorization_capture_redact(jsonb, text[]) IS
    'Replaces registered top-level privacy-sensitive keys before a source row '
    'is persisted or hashed. The capture stream never receives the raw value.';


CREATE OR REPLACE FUNCTION event.fn_authorization_capture_primary_key(
    p_row jsonb,
    p_key_columns text[]
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
    v_key text;
    v_result jsonb := '{}'::jsonb;
BEGIN
    IF p_row IS NULL THEN
        RETURN NULL;
    END IF;

    FOREACH v_key IN ARRAY p_key_columns LOOP
        v_result := v_result || jsonb_build_object(v_key, p_row -> v_key);
    END LOOP;

    RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION event.fn_authorization_capture_sha256(
    p_row jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN p_row IS NULL THEN NULL
        ELSE encode(digest(p_row::text, 'sha256'), 'hex')
    END;
$$;


CREATE OR REPLACE FUNCTION event.fn_record_authorization_change(
    p_source_schema text,
    p_source_table text,
    p_operation char(1),
    p_old_raw jsonb,
    p_new_raw jsonb
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, event, control
AS $$
DECLARE
    v_source control.authorization_capture_source%ROWTYPE;
    v_source_row jsonb;
    v_old_row jsonb;
    v_new_row jsonb;
    v_primary_key jsonb;
    v_tenant_text text;
    v_tenant_id uuid;
    v_actor_principal_id uuid;
    v_correlation_id uuid;
    v_request_id text;
    v_application_name text;
    v_source_database_id uuid;
    v_source_watermark bigint;
    v_source_txid bigint;
    v_capture_contract_version text;
    v_captured_at timestamptz := clock_timestamp();
BEGIN
    IF p_operation NOT IN ('I','U','D','T') THEN
        RAISE EXCEPTION 'Unsupported authorization capture operation: %', p_operation;
    END IF;

    -- Set before reading the FORCE-RLS source registry. Direct callers still
    -- lack EXECUTE and table privileges; this marker only lets the definer
    -- traverse the capture-internal RLS policies.
    PERFORM set_config('app.authorization_capture_internal', 'on', true);

    SELECT *
    INTO v_source
    FROM control.authorization_capture_source
    WHERE source_schema = p_source_schema
      AND source_table = p_source_table;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Authorization capture trigger fired for unregistered source %.%',
            p_source_schema,
            p_source_table
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NOT v_source.capture_enabled THEN
        RETURN NULL;
    END IF;

    v_old_row := event.fn_authorization_capture_redact(
        p_old_raw,
        v_source.redacted_columns
    );
    v_new_row := event.fn_authorization_capture_redact(
        p_new_raw,
        v_source.redacted_columns
    );
    v_source_row := COALESCE(v_new_row, v_old_row);

    IF p_operation <> 'T' THEN
        v_primary_key := event.fn_authorization_capture_primary_key(
            v_source_row,
            v_source.primary_key_columns
        );
    END IF;

    IF v_source.tenant_column IS NOT NULL AND v_source_row IS NOT NULL THEN
        v_tenant_text := NULLIF(v_source_row ->> v_source.tenant_column, '');
        v_tenant_id := event.fn_authorization_capture_safe_uuid(v_tenant_text);
    END IF;

    v_actor_principal_id := event.fn_authorization_capture_safe_uuid(
        COALESCE(
            NULLIF(current_setting('app.current_principal_id', true), ''),
            NULLIF(current_setting('app.principal_id', true), '')
        )
    );
    v_correlation_id := event.fn_authorization_capture_safe_uuid(
        NULLIF(current_setting('app.correlation_id', true), '')
    );
    v_request_id := left(
        NULLIF(current_setting('app.request_id', true), ''),
        256
    );
    v_application_name := left(
        NULLIF(current_setting('application_name', true), ''),
        256
    );
    v_source_txid := txid_current();

    -- Updating one transactional row is deliberate. The lock remains held to
    -- source commit, so a later transaction cannot allocate a watermark and
    -- commit ahead of this transaction. Rollback restores the counter.
    UPDATE event.authorization_capture_clock
    SET
        current_watermark = current_watermark + 1,
        updated_at = v_captured_at
    WHERE singleton_id = 1
    RETURNING
        source_database_id,
        current_watermark,
        capture_contract_version
    INTO
        v_source_database_id,
        v_source_watermark,
        v_capture_contract_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Authorization capture clock singleton is missing'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    INSERT INTO event.authorization_change_transaction (
        source_database_id,
        source_txid,
        first_watermark,
        last_watermark,
        event_count,
        first_captured_at,
        last_captured_at,
        capture_contract_version
    )
    VALUES (
        v_source_database_id,
        v_source_txid,
        v_source_watermark,
        v_source_watermark,
        1,
        v_captured_at,
        v_captured_at,
        v_capture_contract_version
    )
    ON CONFLICT (source_database_id, source_txid) DO UPDATE
    SET
        last_watermark = EXCLUDED.last_watermark,
        event_count = event.authorization_change_transaction.event_count + 1,
        last_captured_at = EXCLUDED.last_captured_at,
        capture_contract_version = EXCLUDED.capture_contract_version;

    INSERT INTO event.authorization_change_event (
        source_database_id,
        source_watermark,
        source_txid,
        source_schema,
        source_table,
        source_kind,
        operation,
        tenant_id,
        source_primary_key,
        old_row,
        new_row,
        old_row_sha256,
        new_row_sha256,
        session_user_name,
        current_user_name,
        application_name,
        actor_principal_id,
        request_id,
        correlation_id,
        transaction_started_at,
        statement_started_at,
        captured_at,
        capture_contract_version,
        privacy_redacted
    )
    VALUES (
        v_source_database_id,
        v_source_watermark,
        v_source_txid,
        p_source_schema,
        p_source_table,
        v_source.source_kind,
        p_operation,
        v_tenant_id,
        v_primary_key,
        v_old_row,
        v_new_row,
        event.fn_authorization_capture_sha256(v_old_row),
        event.fn_authorization_capture_sha256(v_new_row),
        session_user,
        COALESCE(
            NULLIF(current_setting('role', true), 'none'),
            session_user
        ),
        v_application_name,
        v_actor_principal_id,
        v_request_id,
        v_correlation_id,
        transaction_timestamp(),
        statement_timestamp(),
        v_captured_at,
        v_capture_contract_version,
        true
    );

    RETURN v_source_watermark;
END;
$$;

COMMENT ON FUNCTION event.fn_record_authorization_change(
    text, text, char, jsonb, jsonb
) IS
    'Internal capture writer. Redacts the registered row payload, locks and '
    'increments the transactional clock, upserts its transaction envelope, and '
    'inserts one immutable event. Execute privilege is revoked from PUBLIC.';


CREATE OR REPLACE FUNCTION event.trg_capture_authorization_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, event
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM event.fn_record_authorization_change(
            TG_TABLE_SCHEMA, TG_TABLE_NAME, 'I', NULL, to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM event.fn_record_authorization_change(
            TG_TABLE_SCHEMA, TG_TABLE_NAME, 'U', to_jsonb(OLD), to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM event.fn_record_authorization_change(
            TG_TABLE_SCHEMA, TG_TABLE_NAME, 'D', to_jsonb(OLD), NULL
        );
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Unsupported row trigger operation: %', TG_OP;
END;
$$;


CREATE OR REPLACE FUNCTION event.trg_capture_authorization_truncate()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, event
AS $$
BEGIN
    PERFORM event.fn_record_authorization_change(
        TG_TABLE_SCHEMA, TG_TABLE_NAME, 'T', NULL, NULL
    );
    RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION event.trg_authorization_change_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION
        'event.authorization_change_event and snapshot markers are append-only'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;


CREATE OR REPLACE FUNCTION event.trg_authorization_change_transaction_guard()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog
AS $$
BEGIN
    IF current_setting('app.authorization_capture_internal', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION
        'authorization change transaction envelopes are capture-internal'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;


CREATE OR REPLACE FUNCTION event.fn_authorization_capture_watermark()
RETURNS TABLE (
    source_database_id uuid,
    capture_contract_version text,
    source_watermark bigint,
    transaction_snapshot text,
    observed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, event
AS $$
    SELECT
        clock.source_database_id,
        clock.capture_contract_version,
        clock.current_watermark,
        txid_current_snapshot()::text,
        clock_timestamp()
    FROM event.authorization_capture_clock AS clock
    WHERE clock.singleton_id = 1;
$$;

COMMENT ON FUNCTION event.fn_authorization_capture_watermark() IS
    'Returns the durable source identity and committed authorization watermark '
    'visible to the caller snapshot. For initial backfill, call from the same '
    'REPEATABLE READ transaction used to export source rows, then replay events '
    'strictly greater than the returned watermark.';


CREATE OR REPLACE FUNCTION event.fn_record_authorization_snapshot_marker(
    p_migration_run_id uuid,
    p_snapshot_label text,
    p_manifest_hint text DEFAULT NULL
)
RETURNS event.authorization_snapshot_marker
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, event, control
AS $$
DECLARE
    v_isolation text;
    v_clock event.authorization_capture_clock%ROWTYPE;
    v_run_source_database_id uuid;
    v_marker event.authorization_snapshot_marker%ROWTYPE;
BEGIN
    PERFORM set_config('app.authorization_capture_internal', 'on', true);

    v_isolation := current_setting('transaction_isolation');
    IF v_isolation NOT IN ('repeatable read', 'serializable') THEN
        RAISE EXCEPTION
            'Snapshot marker requires REPEATABLE READ or SERIALIZABLE; current isolation is %',
            v_isolation
            USING ERRCODE = 'invalid_transaction_state';
    END IF;

    SELECT source_database_id
    INTO v_run_source_database_id
    FROM control.authorization_migration_run
    WHERE id = p_migration_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authorization migration run % does not exist', p_migration_run_id;
    END IF;

    SELECT *
    INTO STRICT v_clock
    FROM event.authorization_capture_clock
    WHERE singleton_id = 1;

    IF v_run_source_database_id <> v_clock.source_database_id THEN
        RAISE EXCEPTION
            'Migration run source database % does not match capture source %',
            v_run_source_database_id,
            v_clock.source_database_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    INSERT INTO event.authorization_snapshot_marker (
        migration_run_id,
        snapshot_label,
        source_database_id,
        source_watermark,
        capture_contract_version,
        transaction_snapshot,
        manifest_hint
    )
    VALUES (
        p_migration_run_id,
        p_snapshot_label,
        v_clock.source_database_id,
        v_clock.current_watermark,
        v_clock.capture_contract_version,
        txid_current_snapshot()::text,
        p_manifest_hint
    )
    RETURNING * INTO v_marker;

    RETURN v_marker;
END;
$$;

COMMENT ON FUNCTION event.fn_record_authorization_snapshot_marker(
    uuid, text, text
) IS
    'Records W0 inside the same REPEATABLE READ transaction used for the '
    'initial export. Protocol: BEGIN ISOLATION LEVEL REPEATABLE READ; call this '
    'function; export all source rows/counts/hashes without leaving the '
    'transaction; COMMIT; backfill; replay complete source transactions with '
    'first_watermark > W0; freeze only after applied watermark equals source.';


REVOKE ALL ON FUNCTION event.fn_authorization_capture_safe_uuid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_authorization_capture_redact(jsonb, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_authorization_capture_primary_key(jsonb, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_authorization_capture_sha256(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_record_authorization_change(text, text, char, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION event.trg_capture_authorization_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.trg_capture_authorization_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.trg_authorization_change_event_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.trg_authorization_change_transaction_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_authorization_capture_watermark() FROM PUBLIC;
REVOKE ALL ON FUNCTION event.fn_record_authorization_snapshot_marker(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION event.fn_authorization_capture_watermark()
    TO athyperadmin;
GRANT EXECUTE ON FUNCTION event.fn_record_authorization_snapshot_marker(
    uuid, text, text
) TO athyperadmin;
