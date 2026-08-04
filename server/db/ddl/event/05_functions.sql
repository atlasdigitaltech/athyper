-- ============================================================================
-- event/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION event.fn_authorization_bump_epoch_v2(p_scope_kind text, p_tenant_id uuid, p_plane_code text)
 RETURNS TABLE(global_epoch bigint, tenant_epoch bigint, plane_epoch bigint, applied_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_global_epoch bigint;
    v_tenant_epoch bigint;
    v_plane_epoch bigint;
    v_applied_at timestamptz := clock_timestamp();
BEGIN
    IF p_scope_kind = 'global' THEN
        IF p_tenant_id IS NOT NULL OR p_plane_code IS NOT NULL THEN
            RAISE EXCEPTION 'Global epoch cannot carry tenant or plane';
        END IF;

        UPDATE event.authorization_global_epoch_v2
        SET
            epoch = epoch + 1,
            updated_at = v_applied_at,
            updated_by = session_user
        WHERE singleton_id = 1
        RETURNING epoch INTO v_global_epoch;

        RETURN QUERY
        SELECT v_global_epoch, NULL::bigint, NULL::bigint, v_applied_at;
        RETURN;
    END IF;

    SELECT epoch
    INTO v_global_epoch
    FROM event.authorization_global_epoch_v2
    WHERE singleton_id = 1;

    IF p_scope_kind = 'tenant' THEN
        IF p_tenant_id IS NULL OR p_plane_code IS NOT NULL THEN
            RAISE EXCEPTION 'Tenant epoch requires tenant and forbids plane';
        END IF;

        INSERT INTO event.authorization_tenant_epoch_v2 (
            tenant_id,
            epoch,
            updated_at,
            updated_by
        )
        VALUES (p_tenant_id, 1, v_applied_at, session_user)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
            epoch = event.authorization_tenant_epoch_v2.epoch + 1,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
        RETURNING epoch INTO v_tenant_epoch;

        RETURN QUERY
        SELECT v_global_epoch, v_tenant_epoch, NULL::bigint, v_applied_at;
        RETURN;
    END IF;

    IF p_scope_kind = 'plane' THEN
        IF p_tenant_id IS NULL OR p_plane_code NOT IN ('neon', 'admin') THEN
            RAISE EXCEPTION
                'Plane epoch requires tenant and Neon/Admin plane';
        END IF;

        INSERT INTO event.authorization_tenant_epoch_v2 (
            tenant_id,
            epoch,
            updated_at,
            updated_by
        )
        VALUES (p_tenant_id, 0, v_applied_at, session_user)
        ON CONFLICT (tenant_id) DO NOTHING;

        SELECT epoch
        INTO v_tenant_epoch
        FROM event.authorization_tenant_epoch_v2
        WHERE tenant_id = p_tenant_id;

        INSERT INTO event.authorization_plane_epoch_v2 (
            tenant_id,
            plane_code,
            epoch,
            updated_at,
            updated_by
        )
        VALUES (
            p_tenant_id,
            p_plane_code,
            1,
            v_applied_at,
            session_user
        )
        ON CONFLICT (tenant_id, plane_code) DO UPDATE
        SET
            epoch = event.authorization_plane_epoch_v2.epoch + 1,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
        RETURNING epoch INTO v_plane_epoch;

        RETURN QUERY
        SELECT v_global_epoch, v_tenant_epoch, v_plane_epoch, v_applied_at;
        RETURN;
    END IF;

    RAISE EXCEPTION 'Unsupported authorization invalidation scope %', p_scope_kind;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_claim_invalidations_v2(p_worker_id text, p_batch_size integer DEFAULT 100, p_lease_seconds integer DEFAULT 60)
 RETURNS SETOF event.authorization_invalidation_outbox_v2
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_id uuid;
    v_row event.authorization_invalidation_outbox_v2%ROWTYPE;
    v_epoch record;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF btrim(COALESCE(p_worker_id, '')) = '' THEN
        RAISE EXCEPTION 'worker_id is required';
    END IF;
    IF p_batch_size < 1 OR p_batch_size > 1000 THEN
        RAISE EXCEPTION 'batch_size must be between 1 and 1000';
    END IF;
    IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
        RAISE EXCEPTION 'lease_seconds must be between 5 and 3600';
    END IF;

    FOR v_id IN
        SELECT outbox.id
        FROM event.authorization_invalidation_outbox_v2 AS outbox
        WHERE outbox.available_at <= v_now
          AND outbox.attempts < outbox.max_attempts
          AND (
              outbox.status IN ('pending', 'failed')
              OR (
                  outbox.status = 'processing'
                  AND outbox.locked_until < v_now
              )
          )
        ORDER BY outbox.available_at, outbox.created_at, outbox.id
        FOR UPDATE SKIP LOCKED
        LIMIT p_batch_size
    LOOP
        SELECT *
        INTO v_row
        FROM event.authorization_invalidation_outbox_v2
        WHERE id = v_id
        FOR UPDATE;

        IF v_row.epoch_applied_at IS NULL THEN
            SELECT *
            INTO v_epoch
            FROM event.fn_authorization_bump_epoch_v2(
                v_row.scope_kind,
                v_row.tenant_id,
                v_row.plane_code
            );
        ELSE
            SELECT
                v_row.global_epoch AS global_epoch,
                v_row.tenant_epoch AS tenant_epoch,
                v_row.plane_epoch AS plane_epoch,
                v_row.epoch_applied_at AS applied_at
            INTO v_epoch;
        END IF;

        UPDATE event.authorization_invalidation_outbox_v2
        SET
            status = 'processing',
            attempts = attempts + 1,
            locked_at = v_now,
            locked_by = p_worker_id,
            locked_until = v_now + make_interval(secs => p_lease_seconds),
            last_error = NULL,
            global_epoch = v_epoch.global_epoch,
            tenant_epoch = v_epoch.tenant_epoch,
            plane_epoch = v_epoch.plane_epoch,
            epoch_applied_at = v_epoch.applied_at
        WHERE id = v_id
        RETURNING * INTO v_row;

        RETURN NEXT v_row;
    END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_complete_invalidation_v2(p_id uuid, p_worker_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_row event.authorization_invalidation_outbox_v2%ROWTYPE;
BEGIN
    SELECT *
    INTO v_row
    FROM event.authorization_invalidation_outbox_v2
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown invalidation %', p_id;
    END IF;
    IF v_row.status = 'completed' THEN
        RETURN true;
    END IF;
    IF v_row.status <> 'processing' OR v_row.locked_by IS DISTINCT FROM p_worker_id THEN
        RAISE EXCEPTION 'Invalidation % is not leased by %', p_id, p_worker_id;
    END IF;

    UPDATE event.authorization_invalidation_outbox_v2
    SET
        status = 'completed',
        locked_at = NULL,
        locked_by = NULL,
        locked_until = NULL,
        processed_at = clock_timestamp(),
        last_error = NULL
    WHERE id = p_id;

    RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_emit_invalidation_v2(p_idempotency_key text, p_scope_kind text, p_tenant_id uuid, p_plane_code text, p_authority_schema text, p_authority_table text, p_authority_operation character, p_source_row_key jsonb, p_boundary_kind text, p_effective_at timestamp with time zone, p_affected_principal_ids uuid[], p_affected_group_ids uuid[], p_affected_role_ids uuid[], p_affected_permission_set_ids uuid[], p_affected_permission_ids uuid[], p_affected_scope_ids uuid[], p_affected_record_ids uuid[], p_affected_delegation_ids uuid[], p_cause_source_database_id uuid DEFAULT NULL::uuid, p_cause_source_watermark bigint DEFAULT NULL::bigint, p_cause_replay_transaction_id uuid DEFAULT NULL::uuid, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_id uuid;
    v_epoch record;
    v_now timestamptz := clock_timestamp();
BEGIN
    INSERT INTO event.authorization_invalidation_outbox_v2 (
        idempotency_key,
        scope_kind,
        tenant_id,
        plane_code,
        authority_schema,
        authority_table,
        authority_operation,
        source_row_key,
        boundary_kind,
        affected_principal_ids,
        affected_group_ids,
        affected_role_ids,
        affected_permission_set_ids,
        affected_permission_ids,
        affected_scope_ids,
        affected_record_ids,
        affected_delegation_ids,
        cause_source_database_id,
        cause_source_watermark,
        cause_replay_transaction_id,
        correlation_id,
        effective_at,
        available_at,
        created_at
    )
    VALUES (
        p_idempotency_key,
        p_scope_kind,
        p_tenant_id,
        p_plane_code,
        p_authority_schema,
        p_authority_table,
        p_authority_operation,
        p_source_row_key,
        p_boundary_kind,
        COALESCE(p_affected_principal_ids, '{}'::uuid[]),
        COALESCE(p_affected_group_ids, '{}'::uuid[]),
        COALESCE(p_affected_role_ids, '{}'::uuid[]),
        COALESCE(p_affected_permission_set_ids, '{}'::uuid[]),
        COALESCE(p_affected_permission_ids, '{}'::uuid[]),
        COALESCE(p_affected_scope_ids, '{}'::uuid[]),
        COALESCE(p_affected_record_ids, '{}'::uuid[]),
        COALESCE(p_affected_delegation_ids, '{}'::uuid[]),
        p_cause_source_database_id,
        p_cause_source_watermark,
        p_cause_replay_transaction_id,
        p_correlation_id,
        p_effective_at,
        GREATEST(p_effective_at, v_now),
        v_now
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        SELECT outbox.id
        INTO v_id
        FROM event.authorization_invalidation_outbox_v2 AS outbox
        WHERE outbox.idempotency_key = p_idempotency_key;
        RETURN v_id;
    END IF;

    IF p_effective_at <= v_now THEN
        SELECT *
        INTO v_epoch
        FROM event.fn_authorization_bump_epoch_v2(
            p_scope_kind,
            p_tenant_id,
            p_plane_code
        );

        UPDATE event.authorization_invalidation_outbox_v2
        SET
            global_epoch = v_epoch.global_epoch,
            tenant_epoch = v_epoch.tenant_epoch,
            plane_epoch = v_epoch.plane_epoch,
            epoch_applied_at = v_epoch.applied_at
        WHERE id = v_id;
    END IF;

    RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_fail_invalidation_v2(p_id uuid, p_worker_id text, p_error text, p_retry_seconds integer DEFAULT 30)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_row event.authorization_invalidation_outbox_v2%ROWTYPE;
BEGIN
    IF btrim(COALESCE(p_error, '')) = '' THEN
        RAISE EXCEPTION 'error is required';
    END IF;
    IF p_retry_seconds < 1 OR p_retry_seconds > 86400 THEN
        RAISE EXCEPTION 'retry_seconds must be between 1 and 86400';
    END IF;

    SELECT *
    INTO v_row
    FROM event.authorization_invalidation_outbox_v2
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown invalidation %', p_id;
    END IF;
    IF v_row.status <> 'processing' OR v_row.locked_by IS DISTINCT FROM p_worker_id THEN
        RAISE EXCEPTION 'Invalidation % is not leased by %', p_id, p_worker_id;
    END IF;

    UPDATE event.authorization_invalidation_outbox_v2
    SET
        status = CASE
            WHEN attempts >= max_attempts THEN 'dead_letter'
            ELSE 'failed'
        END,
        available_at = CASE
            WHEN attempts >= max_attempts THEN available_at
            ELSE clock_timestamp() + make_interval(secs => p_retry_seconds)
        END,
        locked_at = NULL,
        locked_by = NULL,
        locked_until = NULL,
        last_error = left(p_error, 4000)
    WHERE id = p_id;

    RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_supersede_scheduled_v2(p_authority_schema text, p_authority_table text, p_source_row_key jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_count integer;
BEGIN
    UPDATE event.authorization_invalidation_outbox_v2
    SET status = 'superseded'
    WHERE authority_schema = p_authority_schema
      AND authority_table = p_authority_table
      AND source_row_key = p_source_row_key
      AND boundary_kind IN ('effective_start', 'effective_end')
      AND epoch_applied_at IS NULL
      AND status IN ('pending', 'failed')
      AND locked_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_v2_json_uuid_values(p_old_row jsonb, p_new_row jsonb, p_keys text[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_key text;
    v_value uuid;
    v_values uuid[] := '{}'::uuid[];
BEGIN
    FOREACH v_key IN ARRAY p_keys
    LOOP
        v_value := event.fn_authorization_v2_safe_uuid(p_old_row ->> v_key);
        IF v_value IS NOT NULL AND NOT (v_value = ANY(v_values)) THEN
            v_values := array_append(v_values, v_value);
        END IF;

        v_value := event.fn_authorization_v2_safe_uuid(p_new_row ->> v_key);
        IF v_value IS NOT NULL AND NOT (v_value = ANY(v_values)) THEN
            v_values := array_append(v_values, v_value);
        END IF;
    END LOOP;

    RETURN v_values;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_v2_safe_timestamptz(p_value text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    IF p_value IS NULL OR btrim(p_value) = '' THEN
        RETURN NULL;
    END IF;
    RETURN p_value::timestamptz;
EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_v2_safe_uuid(p_value text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    IF p_value IS NULL OR btrim(p_value) = '' THEN
        RETURN NULL;
    END IF;
    RETURN p_value::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_authorization_v2_source_row_key(p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    v_key jsonb;
BEGIN
    IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
        RAISE EXCEPTION 'An authority invalidation requires an object row image';
    END IF;

    IF p_row ? 'id' AND p_row ->> 'id' IS NOT NULL THEN
        RETURN jsonb_build_object('id', p_row -> 'id');
    END IF;

    v_key := jsonb_strip_nulls(jsonb_build_object(
        'tenant_id', p_row -> 'tenant_id',
        'plane_code', p_row -> 'plane_code',
        'permission_id', p_row -> 'permission_id',
        'permission_set_id', p_row -> 'permission_set_id',
        'role_id', p_row -> 'role_id',
        'compilation_id', p_row -> 'compilation_id',
        'group_id', p_row -> 'group_id',
        'principal_id', p_row -> 'principal_id',
        'deny_rule_id', p_row -> 'deny_rule_id',
        'scope_target_id', p_row -> 'scope_target_id',
        'scope_policy_id', p_row -> 'scope_policy_id',
        'record_id', p_row -> 'record_id',
        'record_acl_id', p_row -> 'record_acl_id',
        'delegation_id', p_row -> 'delegation_id',
        'entity_operation_id', p_row -> 'entity_operation_id',
        'entity_id', p_row -> 'entity_id',
        'operation_code', p_row -> 'operation_code',
        'module_id', p_row -> 'module_id',
        'feature_id', p_row -> 'feature_id'
    ));

    IF v_key = '{}'::jsonb THEN
        RAISE EXCEPTION
            'Authority row has neither id nor an approved composite source key';
    END IF;
    RETURN v_key;
END
$function$;

CREATE OR REPLACE FUNCTION event.fn_outbox_claim_batch(p_topic text, p_worker_id text DEFAULT 'default'::text, p_batch_size integer DEFAULT 50)
 RETURNS SETOF event.outbox
 LANGUAGE sql
 SET search_path TO 'event', 'pg_catalog'
AS $function$
    UPDATE event.outbox
    SET status    = 'processing',
        attempts  = attempts + 1,
        locked_at = now(),
        locked_by = p_worker_id
    WHERE id IN (
        SELECT id FROM event.outbox
        WHERE topic = p_topic
          AND (
              status = 'pending'
              OR (status = 'failed' AND available_at <= now())
          )
          AND available_at <= now()
        ORDER BY available_at, created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$function$;

COMMENT ON FUNCTION "event".fn_outbox_claim_batch(p_topic text, p_worker_id text, p_batch_size integer) IS 'Claims a batch of pending/retryable outbox events for a specific topic. Uses FOR UPDATE SKIP LOCKED for safe concurrent worker polling. Sets locked_at/locked_by for observability.';

CREATE OR REPLACE FUNCTION event.fn_outbox_complete(p_event_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'event', 'pg_catalog'
AS $function$
    UPDATE event.outbox
    SET status       = 'completed',
        processed_at = now(),
        locked_at    = NULL,
        locked_by    = NULL,
        locked_until = NULL
    WHERE id = p_event_id;
$function$;

COMMENT ON FUNCTION "event".fn_outbox_complete(p_event_id uuid) IS 'Marks an outbox event as completed. Clears lock fields.';

CREATE OR REPLACE FUNCTION event.fn_outbox_emit(p_tenant_id uuid, p_topic text, p_event_type text, p_payload jsonb, p_created_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_event_key text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'event', 'pg_catalog'
AS $function$
    INSERT INTO event.outbox (
        tenant_id, topic, event_type, event_key,
        entity_type, entity_id, source, correlation_id,
        payload, created_by
    )
    VALUES (
        p_tenant_id, p_topic, p_event_type, p_event_key,
        p_entity_type, p_entity_id, p_source, p_correlation_id,
        p_payload, p_created_by
    )
    RETURNING id;
$function$;

COMMENT ON FUNCTION "event".fn_outbox_emit(p_tenant_id uuid, p_topic text, p_event_type text, p_payload jsonb, p_created_by uuid, p_event_key text, p_entity_type text, p_entity_id uuid, p_source text, p_correlation_id uuid) IS 'Generic outbox event emitter. Inserts an event into event.outbox. Called by triggers and application code. Returns the outbox event ID. topic discriminates consumers (iam, wf, audit, fin).';

CREATE OR REPLACE FUNCTION event.fn_outbox_fail(p_event_id uuid, p_error text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_attempts     integer;
    v_max_attempts integer;
BEGIN
    SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
    FROM event.outbox WHERE id = p_event_id;

    IF v_attempts >= v_max_attempts THEN
        UPDATE event.outbox
        SET status       = 'dead_letter',
            last_error   = p_error,
            locked_at    = NULL,
            locked_by    = NULL,
            locked_until = NULL
        WHERE id = p_event_id;
    ELSE
        -- Exponential backoff: 2^attempts seconds (2s, 4s, 8s, 16s, 32s, ...)
        UPDATE event.outbox
        SET status       = 'failed',
            last_error   = p_error,
            available_at = now() + (power(2, v_attempts) || ' seconds')::interval,
            locked_at    = NULL,
            locked_by    = NULL,
            locked_until = NULL
        WHERE id = p_event_id;
    END IF;
END;
$function$;

COMMENT ON FUNCTION "event".fn_outbox_fail(p_event_id uuid, p_error text) IS 'Marks an outbox event as failed. Applies exponential backoff via available_at. Dead-letters after max_attempts failures. Clears lock fields.';

CREATE OR REPLACE FUNCTION event.fn_outbox_purge_completed(p_retention_interval interval DEFAULT '7 days'::interval, p_batch_size integer DEFAULT 1000)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM event.outbox
    WHERE id IN (
        SELECT id FROM event.outbox
        WHERE status = 'completed'
          AND processed_at < now() - p_retention_interval
        LIMIT p_batch_size
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$function$;

COMMENT ON FUNCTION "event".fn_outbox_purge_completed(p_retention_interval interval, p_batch_size integer) IS 'Housekeeping: batch-deletes completed outbox events older than the retention window. Default: 7 days. Returns count of deleted rows.';

CREATE OR REPLACE FUNCTION event.trg_authorization_authority_invalidate_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'event', 'control', 'pg_catalog'
AS $function$
DECLARE
    v_old jsonb := '{}'::jsonb;
    v_new jsonb := '{}'::jsonb;
    v_current jsonb;
    v_row_key jsonb;
    v_old_row_key jsonb;
    v_scope_kind text;
    v_tenant_id uuid;
    v_entity_operation_id uuid;
    v_permission_id uuid;
    v_plane_code text;
    v_self_id uuid;
    v_principal_ids uuid[];
    v_group_ids uuid[];
    v_role_ids uuid[];
    v_permission_set_ids uuid[];
    v_permission_ids uuid[];
    v_scope_ids uuid[];
    v_record_ids uuid[];
    v_delegation_ids uuid[];
    v_effective_from timestamptz;
    v_effective_until timestamptz;
    v_now timestamptz := clock_timestamp();
    v_source_database_id uuid;
    v_source_watermark bigint;
    v_replay_transaction_id uuid;
    v_correlation_id uuid;
    v_cause_key text;
    v_idempotency_key text;
    v_operation char(1);
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW);
    END IF;
    v_current := CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END;

    -- Existing entity_operation remains a legacy write path until cutover.
    -- Only rows participating in the nullable v2 path emit v2 invalidations.
    IF TG_TABLE_SCHEMA = 'control'
       AND TG_TABLE_NAME = 'entity_operation'
       AND COALESCE(
           v_new ->> 'permission_id_v2',
           v_old ->> 'permission_id_v2'
       ) IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    v_row_key := event.fn_authorization_v2_source_row_key(v_current);
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old_row_key := event.fn_authorization_v2_source_row_key(v_old);
        PERFORM event.fn_authorization_supersede_scheduled_v2(
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            v_old_row_key
        );
        IF v_old_row_key IS DISTINCT FROM v_row_key THEN
            PERFORM event.fn_authorization_supersede_scheduled_v2(
                TG_TABLE_SCHEMA,
                TG_TABLE_NAME,
                v_row_key
            );
        END IF;
    END IF;

    v_tenant_id := event.fn_authorization_v2_safe_uuid(
        COALESCE(v_new ->> 'tenant_id', v_old ->> 'tenant_id')
    );
    v_permission_id := event.fn_authorization_v2_safe_uuid(COALESCE(
        v_new ->> 'permission_id',
        v_old ->> 'permission_id',
        v_new ->> 'permission_id_v2',
        v_old ->> 'permission_id_v2',
        CASE
            WHEN TG_TABLE_SCHEMA = 'control'
             AND TG_TABLE_NAME = 'auth_permission'
            THEN v_current ->> 'id'
        END
    ));
    v_entity_operation_id := event.fn_authorization_v2_safe_uuid(COALESCE(
        v_new ->> 'entity_operation_id',
        v_old ->> 'entity_operation_id',
        CASE
            WHEN TG_TABLE_SCHEMA = 'control'
             AND TG_TABLE_NAME = 'entity_operation'
            THEN v_current ->> 'id'
        END
    ));
    IF v_tenant_id IS NULL AND v_entity_operation_id IS NOT NULL THEN
        SELECT operation.tenant_id
        INTO v_tenant_id
        FROM control.entity_operation AS operation
        WHERE operation.id = v_entity_operation_id;
    END IF;

    v_plane_code := COALESCE(
        v_new ->> 'plane_code',
        v_old ->> 'plane_code'
    );
    IF v_plane_code NOT IN ('neon', 'admin') THEN
        v_plane_code := NULL;
    END IF;

    v_scope_kind := COALESCE(TG_ARGV[0], 'auto');
    IF v_scope_kind = 'auto' THEN
        v_scope_kind := CASE
            WHEN v_tenant_id IS NULL THEN 'global'
            WHEN v_plane_code IS NULL THEN 'tenant'
            ELSE 'plane'
        END;
    END IF;
    IF v_scope_kind = 'global' THEN
        v_tenant_id := NULL;
        v_plane_code := NULL;
    ELSIF v_scope_kind = 'tenant' THEN
        v_plane_code := NULL;
    ELSIF v_scope_kind <> 'plane' THEN
        RAISE EXCEPTION
            'Invalid invalidation scope hint % for %.%',
            v_scope_kind,
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME;
    END IF;

    IF v_scope_kind IN ('tenant', 'plane') AND v_tenant_id IS NULL THEN
        RAISE EXCEPTION
            'Cannot resolve tenant for canonical authority %.%',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME;
    END IF;
    IF v_scope_kind = 'plane' AND v_plane_code IS NULL THEN
        RAISE EXCEPTION
            'Cannot resolve Neon/Admin plane for canonical authority %.%',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME;
    END IF;

    v_principal_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY[
            'principal_id', 'member_principal_id', 'subject_principal_id',
            'delegate_principal_id', 'delegator_principal_id',
            'delegate_id', 'delegator_id',
            'grantee_principal_id', 'actor_principal_id',
            'owner_principal_id', 'business_owner_principal_id'
        ]
    );
    v_group_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['group_id', 'grantee_group_id']
    );
    v_role_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['role_id']
    );
    v_permission_set_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['permission_set_id']
    );
    v_permission_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['permission_id', 'permission_id_v2']
    );
    v_scope_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['scope_target_id', 'scope_id', 'permission_scope_id']
    );
    v_record_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['record_id', 'record_acl_id', 'entity_record_id', 'resource_id']
    );
    v_delegation_ids := event.fn_authorization_v2_json_uuid_values(
        v_old,
        v_new,
        ARRAY['delegation_id']
    );

    v_self_id := event.fn_authorization_v2_safe_uuid(v_current ->> 'id');
    IF v_self_id IS NOT NULL THEN
        IF TG_TABLE_NAME = 'auth_permission' THEN
            v_permission_ids := ARRAY(
                SELECT DISTINCT value
                FROM unnest(v_permission_ids || ARRAY[v_self_id]) AS item(value)
            );
        ELSIF TG_TABLE_NAME = 'auth_role' THEN
            v_role_ids := ARRAY(
                SELECT DISTINCT value
                FROM unnest(v_role_ids || ARRAY[v_self_id]) AS item(value)
            );
        ELSIF TG_TABLE_NAME = 'auth_group' THEN
            v_group_ids := ARRAY(
                SELECT DISTINCT value
                FROM unnest(v_group_ids || ARRAY[v_self_id]) AS item(value)
            );
        ELSIF TG_TABLE_NAME = 'auth_scope_target' THEN
            v_scope_ids := ARRAY(
                SELECT DISTINCT value
                FROM unnest(v_scope_ids || ARRAY[v_self_id]) AS item(value)
            );
        ELSIF TG_TABLE_NAME = 'auth_record_acl' THEN
            v_record_ids := ARRAY(
                SELECT DISTINCT value
                FROM unnest(v_record_ids || ARRAY[v_self_id]) AS item(value)
            );
        ELSIF TG_TABLE_NAME = 'auth_delegation' THEN
            v_delegation_ids := ARRAY(
                SELECT DISTINCT value
                FROM unnest(v_delegation_ids || ARRAY[v_self_id]) AS item(value)
            );
        END IF;
    END IF;

    v_source_database_id := event.fn_authorization_v2_safe_uuid(
        current_setting('app.authorization_source_database_id', true)
    );
    BEGIN
        v_source_watermark := NULLIF(
            current_setting('app.authorization_source_watermark', true),
            ''
        )::bigint;
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_source_watermark := NULL;
    END;
    v_replay_transaction_id := event.fn_authorization_v2_safe_uuid(
        current_setting('app.authorization_replay_transaction_id', true)
    );
    v_correlation_id := event.fn_authorization_v2_safe_uuid(
        current_setting('app.correlation_id', true)
    );
    v_cause_key := COALESCE(
        v_source_database_id::text || ':' || v_source_watermark::text,
        txid_current()::text
    );
    v_operation := substr(TG_OP, 1, 1)::char(1);

    v_idempotency_key := encode(public.digest(
        concat_ws(
            '|',
            'mutation',
            v_cause_key,
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            v_operation,
            v_row_key::text,
            v_old::text,
            v_new::text
        ),
        'sha256'
    ), 'hex');

    PERFORM event.fn_authorization_emit_invalidation_v2(
        v_idempotency_key,
        v_scope_kind,
        v_tenant_id,
        v_plane_code,
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        v_operation,
        v_row_key,
        'mutation',
        v_now,
        v_principal_ids,
        v_group_ids,
        v_role_ids,
        v_permission_set_ids,
        v_permission_ids,
        v_scope_ids,
        v_record_ids,
        v_delegation_ids,
        v_source_database_id,
        v_source_watermark,
        v_replay_transaction_id,
        v_correlation_id
    );

    IF TG_OP <> 'DELETE' THEN
        v_effective_from := event.fn_authorization_v2_safe_timestamptz(COALESCE(
            v_new ->> 'effective_from',
            v_new ->> 'valid_from',
            v_new ->> 'starts_at',
            v_new ->> 'starts_on'
        ));
        v_effective_until := event.fn_authorization_v2_safe_timestamptz(COALESCE(
            v_new ->> 'effective_until',
            v_new ->> 'valid_until',
            v_new ->> 'expires_at',
            v_new ->> 'ends_at',
            v_new ->> 'ends_on'
        ));

        IF v_effective_from > v_now THEN
            v_idempotency_key := encode(public.digest(
                concat_ws(
                    '|',
                    'effective_start',
                    v_cause_key,
                    TG_TABLE_SCHEMA,
                    TG_TABLE_NAME,
                    v_row_key::text,
                    v_effective_from::text
                ),
                'sha256'
            ), 'hex');
            PERFORM event.fn_authorization_emit_invalidation_v2(
                v_idempotency_key,
                v_scope_kind,
                v_tenant_id,
                v_plane_code,
                TG_TABLE_SCHEMA,
                TG_TABLE_NAME,
                v_operation,
                v_row_key,
                'effective_start',
                v_effective_from,
                v_principal_ids,
                v_group_ids,
                v_role_ids,
                v_permission_set_ids,
                v_permission_ids,
                v_scope_ids,
                v_record_ids,
                v_delegation_ids,
                v_source_database_id,
                v_source_watermark,
                v_replay_transaction_id,
                v_correlation_id
            );
        END IF;

        IF v_effective_until > v_now THEN
            v_idempotency_key := encode(public.digest(
                concat_ws(
                    '|',
                    'effective_end',
                    v_cause_key,
                    TG_TABLE_SCHEMA,
                    TG_TABLE_NAME,
                    v_row_key::text,
                    v_effective_until::text
                ),
                'sha256'
            ), 'hex');
            PERFORM event.fn_authorization_emit_invalidation_v2(
                v_idempotency_key,
                v_scope_kind,
                v_tenant_id,
                v_plane_code,
                TG_TABLE_SCHEMA,
                TG_TABLE_NAME,
                v_operation,
                v_row_key,
                'effective_end',
                v_effective_until,
                v_principal_ids,
                v_group_ids,
                v_role_ids,
                v_permission_set_ids,
                v_permission_ids,
                v_scope_ids,
                v_record_ids,
                v_delegation_ids,
                v_source_database_id,
                v_source_watermark,
                v_replay_transaction_id,
                v_correlation_id
            );
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION event.trg_authorization_invalidation_immutable_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'event', 'pg_catalog'
AS $function$
DECLARE
    v_mutable_columns text[] := ARRAY[
        'status', 'attempts', 'available_at',
        'locked_at', 'locked_by', 'locked_until',
        'last_error', 'processed_at',
        'global_epoch', 'tenant_epoch', 'plane_epoch', 'epoch_applied_at'
    ];
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'authorization_invalidation_outbox_v2 rows cannot be deleted';
    END IF;

    IF (to_jsonb(NEW) - v_mutable_columns)
       IS DISTINCT FROM
       (to_jsonb(OLD) - v_mutable_columns) THEN
        RAISE EXCEPTION
            'Authorization invalidation authority identity is immutable';
    END IF;

    IF OLD.epoch_applied_at IS NOT NULL
       AND (
           NEW.global_epoch,
           NEW.tenant_epoch,
           NEW.plane_epoch,
           NEW.epoch_applied_at
       ) IS DISTINCT FROM (
           OLD.global_epoch,
           OLD.tenant_epoch,
           OLD.plane_epoch,
           OLD.epoch_applied_at
       ) THEN
        RAISE EXCEPTION 'Applied authorization epochs are immutable';
    END IF;

    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION event.trg_guard_ai_tool_invocation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'event'
AS $function$
DECLARE
    v_current_principal_id uuid :=
        nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_is_resolution boolean;
BEGIN
    v_is_resolution :=
        OLD.status = 'proposed'
        AND OLD.autonomy_decision = 'not_evaluated'
        AND NEW.autonomy_decision <> 'not_evaluated';

    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.thread_id IS DISTINCT FROM NEW.thread_id
       OR OLD.run_id IS DISTINCT FROM NEW.run_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.tool_call_id IS DISTINCT FROM NEW.tool_call_id
       OR OLD.tool_code IS DISTINCT FROM NEW.tool_code
       OR OLD.input_hash IS DISTINCT FROM NEW.input_hash
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: scope, call identity, input hash, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.tool_version IS DISTINCT FROM NEW.tool_version
        OR OLD.action_code IS DISTINCT FROM NEW.action_code
        OR OLD.operation_class IS DISTINCT FROM NEW.operation_class
        OR OLD.risk_class IS DISTINCT FROM NEW.risk_class
        OR OLD.autonomy_decision IS DISTINCT FROM NEW.autonomy_decision
        OR OLD.permission_snapshot IS DISTINCT FROM NEW.permission_snapshot
        OR OLD.policy_snapshot IS DISTINCT FROM NEW.policy_snapshot
        OR OLD.profile_snapshot IS DISTINCT FROM NEW.profile_snapshot
        OR OLD.authorization_epoch IS DISTINCT FROM NEW.authorization_epoch
        OR OLD.policy_revision IS DISTINCT FROM NEW.policy_revision
        OR OLD.profile_revision IS DISTINCT FROM NEW.profile_revision
        OR OLD.proposal_summary IS DISTINCT FROM NEW.proposal_summary
        OR OLD.affected_entity_type IS DISTINCT FROM NEW.affected_entity_type
        OR OLD.affected_entity_id IS DISTINCT FROM NEW.affected_entity_id
        OR OLD.expected_record_row_version IS DISTINCT FROM NEW.expected_record_row_version
        OR OLD.confirmation_required IS DISTINCT FROM NEW.confirmation_required
        OR OLD.confirmation_policy IS DISTINCT FROM NEW.confirmation_policy
        OR OLD.confirmation_token_hash IS DISTINCT FROM NEW.confirmation_token_hash
        OR OLD.confirmation_expires_at IS DISTINCT FROM NEW.confirmation_expires_at
    )
       AND NOT v_is_resolution
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: authorization resolution fields change at most once'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'denied', 'failed', 'expired', 'cancelled') THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: terminal invocations are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.status = NEW.status
        AND NOT (
            OLD.status = 'proposed'
            AND v_is_resolution
        )
       )
       OR NOT (
            (OLD.status = 'proposed'
             AND NEW.status = 'proposed'
             AND v_is_resolution)
            OR
            (OLD.status = 'proposed'
             AND NEW.status IN ('confirmed', 'executing', 'denied', 'failed', 'expired', 'cancelled'))
            OR (OLD.status = 'confirmed'
                AND NEW.status IN ('executing', 'denied', 'failed', 'expired', 'cancelled'))
            OR (OLD.status = 'executing'
                AND NEW.status IN ('completed', 'failed', 'cancelled'))
       )
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: invalid lifecycle transition from % to %',
            OLD.status, NEW.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.updated_by IS NULL THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: lifecycle transitions require an audit actor'
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF v_current_principal_id IS NOT NULL
       AND NEW.updated_by IS DISTINCT FROM v_current_principal_id
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: audit actor must match the verified request principal'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF (
        OLD.confirmation_actor_id IS DISTINCT FROM NEW.confirmation_actor_id
        OR OLD.confirmation_at IS DISTINCT FROM NEW.confirmation_at
    )
    THEN
        IF OLD.status <> 'proposed' OR NEW.status <> 'confirmed' THEN
            RAISE EXCEPTION
                'event.ai_tool_invocation: confirmation metadata changes only during proposed to confirmed'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        IF NEW.confirmation_actor_id IS DISTINCT FROM NEW.updated_by THEN
            RAISE EXCEPTION
                'event.ai_tool_invocation: confirmation actor must match the transition audit actor'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.confirmation_policy = 'dual_control'
           AND NEW.confirmation_actor_id IS NOT DISTINCT FROM NEW.principal_id
        THEN
            RAISE EXCEPTION
                'event.ai_tool_invocation: dual control requires a different confirmation actor'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF (
        OLD.execution_guard_snapshot IS DISTINCT FROM NEW.execution_guard_snapshot
        OR OLD.execution_auth_epoch IS DISTINCT FROM NEW.execution_auth_epoch
        OR OLD.execution_policy_revision IS DISTINCT FROM NEW.execution_policy_revision
        OR OLD.executing_at IS DISTINCT FROM NEW.executing_at
        OR OLD.downstream_command_idempotency_key IS DISTINCT FROM
            NEW.downstream_command_idempotency_key
    )
       AND NEW.status <> 'executing'
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: execution guard metadata changes only when entering executing'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.business_transaction_type IS DISTINCT FROM NEW.business_transaction_type
        OR OLD.business_transaction_id IS DISTINCT FROM NEW.business_transaction_id
        OR OLD.result_hash IS DISTINCT FROM NEW.result_hash
        OR OLD.evidence_refs IS DISTINCT FROM NEW.evidence_refs
        OR OLD.terminal_error_class IS DISTINCT FROM NEW.terminal_error_class
        OR OLD.terminal_at IS DISTINCT FROM NEW.terminal_at
        OR OLD.duration_ms IS DISTINCT FROM NEW.duration_ms
    )
       AND NEW.status NOT IN ('completed', 'denied', 'failed', 'expired', 'cancelled')
    THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: outcome metadata changes only on a terminal transition'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION event.trg_guard_atlas_run_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'event'
AS $function$
BEGIN
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.client_request_id IS DISTINCT FROM NEW.client_request_id
       OR OLD.input_message_id IS DISTINCT FROM NEW.input_message_id
       OR OLD.output_message_id IS DISTINCT FROM NEW.output_message_id
       OR OLD.started_at IS DISTINCT FROM NEW.started_at
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'event.atlas_run: scope, idempotency, messages, principal, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
        IF OLD.metering_run_id IS NULL
           AND NEW.metering_run_id IS NOT NULL
           AND OLD.status IS NOT DISTINCT FROM NEW.status
           AND OLD.cancellation_requested_at IS NOT DISTINCT FROM NEW.cancellation_requested_at
           AND OLD.cancellation_requested_by IS NOT DISTINCT FROM NEW.cancellation_requested_by
           AND OLD.terminal_at IS NOT DISTINCT FROM NEW.terminal_at
           AND OLD.terminal_error_class IS NOT DISTINCT FROM NEW.terminal_error_class
        THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION
            'event.atlas_run: terminal runs are immutable except one-time metering reconciliation'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status NOT IN ('started', 'completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION
            'event.atlas_run: invalid status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.cancellation_requested_at IS NOT NULL
       AND (
            OLD.cancellation_requested_at IS DISTINCT FROM NEW.cancellation_requested_at
            OR OLD.cancellation_requested_by IS DISTINCT FROM NEW.cancellation_requested_by
       )
    THEN
        RAISE EXCEPTION
            'event.atlas_run: a cancellation request cannot be cleared or reassigned'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.status = 'started' -- INTENTIONALLY HARDCODED: no pre-terminal metering
        AND NEW.metering_run_id IS NOT NULL THEN
        RAISE EXCEPTION
            'event.atlas_run: metering reconciliation requires a terminal run'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION event.trg_guard_notification_message_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'event'
AS $function$
BEGIN
    IF NEW.delivered_count + NEW.failed_count > NEW.recipient_count THEN
        RAISE EXCEPTION
            'event.notification_message: delivered_count (%) + failed_count (%) '
            'cannot exceed recipient_count (%).',
            NEW.delivered_count, NEW.failed_count, NEW.recipient_count
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION event.trg_sync_comment_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'event', 'governance', 'master'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- New flag: increment counter
        INSERT INTO governance.comment_moderation
            (tenant_id, context_type, comment_id, flag_count, last_flagged_at,
             created_at, created_by)
        VALUES
            (NEW.tenant_id, NEW.context_type, NEW.comment_id, 1, NEW.created_at,
             now(), NEW.created_by)
        ON CONFLICT (tenant_id, context_type, comment_id) DO UPDATE
            SET flag_count     = governance.comment_moderation.flag_count + 1,
                last_flagged_at = NEW.created_at,
                updated_at     = now();

    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'actioned'
          AND OLD.status <> 'actioned' THEN
        -- Flag actioned: hide the comment
        INSERT INTO governance.comment_moderation
            (tenant_id, context_type, comment_id, is_hidden, hidden_reason,
             hidden_at, hidden_by, flag_count, last_flagged_at,
             created_at, created_by)
        VALUES
            (NEW.tenant_id, NEW.context_type, NEW.comment_id,
             true, NEW.flag_reason, now(), NEW.reviewed_by,
             1, NEW.created_at, now(), NEW.reviewed_by)
        ON CONFLICT (tenant_id, context_type, comment_id) DO UPDATE
            SET is_hidden      = true,
                hidden_reason  = NEW.flag_reason,
                hidden_at      = now(),
                hidden_by      = NEW.reviewed_by,
                updated_at     = now();
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "event".trg_sync_comment_moderation() IS 'Maintains governance.comment_moderation in sync with event.comment_flag. INSERT: increments flag_count. UPDATE status=actioned: sets is_hidden=true and records who hid it.';

CREATE OR REPLACE FUNCTION event.trg_validate_ai_tool_invocation_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'event'
AS $function$
DECLARE
    v_run_principal_id uuid;
    v_run_status text;
BEGIN
    IF NEW.status <> 'proposed' THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: every invocation must begin in proposed state'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.created_by IS DISTINCT FROM NEW.principal_id THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: proposal actor must match the Atlas run principal'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT principal_id, status
      INTO v_run_principal_id, v_run_status
      FROM event.atlas_run
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.thread_id
       AND plane = NEW.plane
       AND id = NEW.run_id;

    IF v_run_principal_id IS NULL THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: Atlas run not found in requested scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_run_principal_id IS DISTINCT FROM NEW.principal_id THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: proposal principal must own the Atlas run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_run_status <> 'started' THEN
        RAISE EXCEPTION
            'event.ai_tool_invocation: tool proposals require an active Atlas run'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION event.trg_validate_atlas_run_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'event', 'master'
AS $function$
DECLARE
    v_input master.atlas_message%ROWTYPE;
    v_output master.atlas_message%ROWTYPE;
    v_owner_principal_id uuid;
BEGIN
    SELECT owner_principal_id
      INTO v_owner_principal_id
      FROM master.atlas_thread
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane;

    IF v_owner_principal_id IS NULL
       OR v_owner_principal_id IS DISTINCT FROM NEW.principal_id
    THEN
        RAISE EXCEPTION
            'event.atlas_run: only the immutable thread owner may create a run'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT *
      INTO v_input
      FROM master.atlas_message
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
       AND id = NEW.input_message_id;

    SELECT *
      INTO v_output
      FROM master.atlas_message
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
       AND id = NEW.output_message_id;

    IF v_input.id IS NULL OR v_output.id IS NULL THEN
        RAISE EXCEPTION
            'event.atlas_run: input and output messages must exist in the run scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_input.role <> 'user'
       OR v_input.status <> 'completed'
       OR v_input.run_id IS DISTINCT FROM NEW.id
       OR v_input.created_by IS DISTINCT FROM NEW.principal_id
    THEN
        RAISE EXCEPTION
            'event.atlas_run: input must be the principal''s completed user message linked to this run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_output.role <> 'assistant'
       OR v_output.run_id IS DISTINCT FROM NEW.id
       OR v_output.created_by IS DISTINCT FROM NEW.principal_id
       OR v_output.parent_message_id IS DISTINCT FROM v_input.id
       OR v_output.sequence <= v_input.sequence
    THEN
        RAISE EXCEPTION
            'event.atlas_run: output must be a later assistant child linked to this run'
            USING ERRCODE = 'check_violation';
    END IF;

    IF (NEW.status = 'started' -- INTENTIONALLY HARDCODED: run/output coherence
        AND v_output.status <> 'pending')
       OR (
            NEW.status IN ('completed', 'failed', 'cancelled')
            AND v_output.status <> NEW.status
       )
    THEN
        RAISE EXCEPTION
            'event.atlas_run: run status % does not match output message status %',
            NEW.status, v_output.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$function$;
