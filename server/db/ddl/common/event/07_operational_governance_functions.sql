CREATE OR REPLACE FUNCTION event.trg_guard_event_creation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'event identity and creation time are immutable on %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION event.trg_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '%.% is append-only', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION event.trg_guard_notification_inbox_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.message_id IS DISTINCT FROM OLD.message_id
       OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.channel_code IS DISTINCT FROM OLD.channel_code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'notification inbox identity and channel coordinates are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION event.trg_guard_command_execution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF ROW(
        NEW.id, NEW.tenant_id, NEW.command_code, NEW.idempotency_key,
        NEW.request_fingerprint, NEW.received_at, NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.tenant_id, OLD.command_code, OLD.idempotency_key,
        OLD.request_fingerprint, OLD.received_at, OLD.created_at, OLD.created_by
    ) THEN
        RAISE EXCEPTION 'command execution identity and request evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.status IN ('succeeded','failed','cancelled','expired')
       AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'terminal command execution status is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (OLD.status = 'received' AND NEW.status NOT IN ('received','processing','cancelled','expired'))
       OR (OLD.status = 'processing' AND NEW.status NOT IN ('processing','succeeded','failed','cancelled','expired')) THEN
        RAISE EXCEPTION 'invalid command execution transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION event.fn_outbox_purge_completed(
    p_retention interval DEFAULT interval '7 days',
    p_batch_size integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = event, pg_catalog
AS $$
DECLARE
    v_deleted integer;
BEGIN
    IF p_retention < interval '1 hour' OR p_batch_size NOT BETWEEN 1 AND 10000 THEN
        RAISE EXCEPTION 'invalid outbox purge arguments';
    END IF;
    WITH victims AS (
        SELECT id FROM event.outbox
        WHERE status = 'completed'
          AND processed_at < clock_timestamp() - p_retention
        ORDER BY processed_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    DELETE FROM event.outbox o USING victims v WHERE o.id = v.id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;
