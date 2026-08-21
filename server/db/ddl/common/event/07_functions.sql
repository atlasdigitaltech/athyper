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

CREATE OR REPLACE FUNCTION runtime_meta.trg_authorization_epoch_coordinates_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.scope_kind, OLD.tenant_id, OLD.plane_code)
       IS DISTINCT FROM (NEW.scope_kind, NEW.tenant_id, NEW.plane_code) THEN
        RAISE EXCEPTION 'authorization epoch coordinates are immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION event.fn_authorization_bump_epoch(
    p_scope_kind text, p_tenant_id uuid DEFAULT NULL, p_plane_code text DEFAULT NULL
) RETURNS TABLE(global_epoch bigint, tenant_epoch bigint, plane_epoch bigint, applied_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = runtime_meta, pg_catalog AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_local_plane text := current_setting('app.database_plane', true);
BEGIN
    IF p_scope_kind NOT IN ('global', 'tenant', 'plane') THEN
        RAISE EXCEPTION 'unsupported authorization invalidation scope %', p_scope_kind;
    END IF;
    IF p_scope_kind = 'plane' AND (p_plane_code IS DISTINCT FROM v_local_plane OR v_local_plane NOT IN ('studio','neon','mesh')) THEN
        RAISE EXCEPTION 'plane epoch must use the local database plane';
    END IF;
    IF (p_scope_kind = 'global' AND (p_tenant_id IS NOT NULL OR p_plane_code IS NOT NULL))
       OR (p_scope_kind = 'tenant' AND (p_tenant_id IS NULL OR p_plane_code IS NOT NULL))
       OR (p_scope_kind = 'plane' AND p_tenant_id IS NULL) THEN
        RAISE EXCEPTION 'invalid authorization epoch coordinate';
    END IF;

    INSERT INTO runtime_meta.authorization_epoch (scope_kind, epoch, updated_at, updated_by)
    VALUES ('global', 1, v_now, session_user)
    ON CONFLICT (scope_kind) WHERE scope_kind = 'global' DO UPDATE
      SET epoch = runtime_meta.authorization_epoch.epoch + 1, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
    RETURNING epoch INTO global_epoch;

    IF p_scope_kind = 'global' THEN
        RETURN QUERY SELECT global_epoch, NULL::bigint, NULL::bigint, v_now;
        RETURN;
    END IF;

    INSERT INTO runtime_meta.authorization_epoch (scope_kind, tenant_id, epoch, updated_at, updated_by)
    VALUES ('tenant', p_tenant_id, CASE WHEN p_scope_kind = 'tenant' THEN 1 ELSE 0 END, v_now, session_user)
    ON CONFLICT (tenant_id) WHERE scope_kind = 'tenant' DO UPDATE
      SET epoch = runtime_meta.authorization_epoch.epoch + CASE WHEN p_scope_kind = 'tenant' THEN 1 ELSE 0 END,
          updated_at = CASE WHEN p_scope_kind = 'tenant' THEN EXCLUDED.updated_at ELSE runtime_meta.authorization_epoch.updated_at END,
          updated_by = CASE WHEN p_scope_kind = 'tenant' THEN EXCLUDED.updated_by ELSE runtime_meta.authorization_epoch.updated_by END
    RETURNING epoch INTO tenant_epoch;

    IF p_scope_kind = 'tenant' THEN
        RETURN QUERY SELECT global_epoch, tenant_epoch, NULL::bigint, v_now;
        RETURN;
    END IF;

    INSERT INTO runtime_meta.authorization_epoch (scope_kind, tenant_id, plane_code, epoch, updated_at, updated_by)
    VALUES ('plane', p_tenant_id, p_plane_code, 1, v_now, session_user)
    ON CONFLICT (tenant_id, plane_code) WHERE scope_kind = 'plane' DO UPDATE
      SET epoch = runtime_meta.authorization_epoch.epoch + 1, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
    RETURNING epoch INTO plane_epoch;
    RETURN QUERY SELECT global_epoch, tenant_epoch, plane_epoch, v_now;
END;
$$;

CREATE OR REPLACE FUNCTION event.fn_authorization_emit_invalidation(
    p_idempotency_key text, p_scope_kind text, p_tenant_id uuid, p_plane_code text,
    p_authority_table text, p_authority_operation char(1), p_source_row_key jsonb,
    p_effective_at timestamptz DEFAULT clock_timestamp()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = event, runtime_meta, pg_catalog AS $$
DECLARE
    v_id uuid;
    v_epoch record;
    v_now timestamptz := clock_timestamp();
    v_authority_schema text := 'authz';
    v_authority_table text := p_authority_table;
BEGIN
    IF p_authority_table LIKE '%.%' THEN
        IF p_authority_table !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' THEN
            RAISE EXCEPTION 'invalid authorization authority coordinate: %', p_authority_table
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        v_authority_schema := split_part(p_authority_table, '.', 1);
        v_authority_table := split_part(p_authority_table, '.', 2);
    END IF;
    INSERT INTO event.authorization_invalidation_outbox
        (idempotency_key, scope_kind, tenant_id, plane_code, authority_schema, authority_table,
         authority_operation, source_row_key, effective_at, available_at, created_at)
    VALUES (p_idempotency_key, p_scope_kind, p_tenant_id, p_plane_code,
            v_authority_schema, v_authority_table, p_authority_operation, p_source_row_key,
            p_effective_at, GREATEST(p_effective_at, v_now), v_now)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM event.authorization_invalidation_outbox WHERE idempotency_key = p_idempotency_key;
        RETURN v_id;
    END IF;
    IF p_effective_at <= v_now THEN
        SELECT * INTO v_epoch FROM event.fn_authorization_bump_epoch(p_scope_kind, p_tenant_id, p_plane_code);
        UPDATE event.authorization_invalidation_outbox SET global_epoch = v_epoch.global_epoch, tenant_epoch = v_epoch.tenant_epoch,
            plane_epoch = v_epoch.plane_epoch, epoch_applied_at = v_epoch.applied_at WHERE id = v_id;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION event.fn_authorization_claim_invalidations(
    p_worker_id text, p_batch_size integer DEFAULT 100, p_lease_seconds integer DEFAULT 60
) RETURNS SETOF event.authorization_invalidation_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = event, runtime_meta, pg_catalog AS $$
DECLARE v_row event.authorization_invalidation_outbox%ROWTYPE; v_epoch record; v_now timestamptz := clock_timestamp();
BEGIN
    IF btrim(coalesce(p_worker_id, '')) = '' OR p_batch_size NOT BETWEEN 1 AND 1000 OR p_lease_seconds NOT BETWEEN 5 AND 3600 THEN
        RAISE EXCEPTION 'invalid authorization invalidation claim arguments';
    END IF;
    FOR v_row IN SELECT * FROM event.authorization_invalidation_outbox
      WHERE available_at <= v_now AND attempts < max_attempts AND (status IN ('pending','failed') OR (status = 'processing' AND locked_until < v_now))
      ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT p_batch_size
    LOOP
      IF v_row.epoch_applied_at IS NULL THEN
        SELECT * INTO v_epoch FROM event.fn_authorization_bump_epoch(v_row.scope_kind, v_row.tenant_id, v_row.plane_code);
      ELSE SELECT v_row.global_epoch global_epoch, v_row.tenant_epoch tenant_epoch, v_row.plane_epoch plane_epoch, v_row.epoch_applied_at applied_at INTO v_epoch; END IF;
      UPDATE event.authorization_invalidation_outbox SET status='processing', attempts=attempts+1, locked_at=v_now, locked_by=p_worker_id,
        locked_until=v_now+make_interval(secs => p_lease_seconds), last_error=NULL, global_epoch=v_epoch.global_epoch,
        tenant_epoch=v_epoch.tenant_epoch, plane_epoch=v_epoch.plane_epoch, epoch_applied_at=v_epoch.applied_at WHERE id=v_row.id RETURNING * INTO v_row;
      RETURN NEXT v_row;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION event.fn_authorization_complete_invalidation(p_id uuid, p_worker_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = event, pg_catalog AS $$
BEGIN
    UPDATE event.authorization_invalidation_outbox SET status='completed', locked_at=NULL, locked_by=NULL, locked_until=NULL,
        processed_at=clock_timestamp(), last_error=NULL
    WHERE id=p_id AND status='processing' AND locked_by IS NOT DISTINCT FROM p_worker_id;
    IF FOUND THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM event.authorization_invalidation_outbox WHERE id=p_id AND status='completed') THEN RETURN true; END IF;
    RAISE EXCEPTION 'invalidation % is not leased by %', p_id, p_worker_id;
END;
$$;

CREATE OR REPLACE FUNCTION event.fn_authorization_fail_invalidation(p_id uuid, p_worker_id text, p_error text, p_retry_seconds integer DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = event, pg_catalog AS $$
BEGIN
    IF btrim(coalesce(p_error, '')) = '' OR p_retry_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'invalid invalidation failure arguments'; END IF;
    UPDATE event.authorization_invalidation_outbox SET status=CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
      available_at=CASE WHEN attempts >= max_attempts THEN available_at ELSE clock_timestamp()+make_interval(secs=>p_retry_seconds) END,
      locked_at=NULL, locked_by=NULL, locked_until=NULL, last_error=left(p_error,4000)
    WHERE id=p_id AND status='processing' AND locked_by IS NOT DISTINCT FROM p_worker_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalidation % is not leased by %', p_id, p_worker_id; END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION event.current_plane_key()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT CASE coalesce(
        nullif(current_setting('app.current_plane_key', true), ''),
        CASE current_database()
            WHEN 'athyper_mesh' THEN 'mesh'
            ELSE 'neon'
        END
    )
        WHEN 'studio' THEN 'studio'
        WHEN 'mesh' THEN 'mesh'
        WHEN 'neon' THEN 'neon'
        ELSE 'neon'
    END
$$;

CREATE OR REPLACE FUNCTION event.fn_notification_work_tenants(
    p_work_kind text,
    p_frequency text DEFAULT NULL,
    p_limit integer DEFAULT 1000
)
RETURNS TABLE (tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = event, pg_catalog
AS $$
BEGIN
    IF p_work_kind NOT IN ('message','digest','housekeeping','webhook')
       OR p_limit NOT BETWEEN 1 AND 10000 THEN
        RAISE EXCEPTION 'invalid notification tenant-work arguments';
    END IF;

    IF p_work_kind = 'message' THEN
        RETURN QUERY SELECT DISTINCT work.tenant_id FROM (
            SELECT m.tenant_id FROM event.notification_message m WHERE m.status IN ('pending','delivering') AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp())
            UNION
            SELECT o.tenant_id FROM event.outbox o WHERE o.event_type IS NOT NULL AND EXISTS (SELECT 1 FROM control.notification_routing_rule r WHERE r.event_type=o.event_type AND r.is_enabled AND (r.tenant_id IS NULL OR r.tenant_id=o.tenant_id)) AND NOT EXISTS (SELECT 1 FROM event.notification_outbox_state s WHERE s.tenant_id=o.tenant_id AND s.outbox_id=o.id AND s.status IN ('completed','dead_letter'))
        ) work LIMIT p_limit;
    ELSIF p_work_kind = 'digest' THEN
        RETURN QUERY SELECT DISTINCT d.tenant_id FROM event.digest_staging d
        WHERE d.delivered_at IS NULL AND d.frequency = p_frequency LIMIT p_limit;
    ELSIF p_work_kind = 'housekeeping' THEN
        RETURN QUERY
        SELECT x.tenant_id FROM (
            SELECT c.tenant_id FROM event.notification_delivery_claim c WHERE c.expires_at < clock_timestamp()
            UNION
            SELECT s.tenant_id FROM event.push_subscription s
            WHERE NOT s.is_active AND coalesce(s.updated_at, s.expires_at, s.created_at) < clock_timestamp() - interval '90 days'
        ) x LIMIT p_limit;
    ELSE
        RETURN QUERY SELECT DISTINCT d.tenant_id FROM event.notification_delivery d
        WHERE d.channel='webhook'
          AND (d.status IN ('pending','failed') OR (d.status='sending' AND d.locked_until<=clock_timestamp()))
          AND d.attempt_count<d.max_attempts
          AND (d.next_retry_at IS NULL OR d.next_retry_at<=clock_timestamp()) LIMIT p_limit;
    END IF;
END;
$$;

-- Atomic worker claim. The active service normally claims one message at a
-- time; this function supports batch workers without weakening tenant RLS.
DROP FUNCTION IF EXISTS event.fn_notification_claim_deliveries(text,integer,integer);
CREATE OR REPLACE FUNCTION event.fn_notification_claim_deliveries(
    p_tenant_id uuid,
    p_worker_id text,
    p_batch_size integer DEFAULT 100,
    p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF event.notification_delivery
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = event, pg_catalog
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_row event.notification_delivery%ROWTYPE;
BEGIN
    IF p_tenant_id IS NULL OR btrim(coalesce(p_worker_id, '')) = ''
       OR p_batch_size NOT BETWEEN 1 AND 1000
       OR p_lease_seconds NOT BETWEEN 5 AND 3600 THEN
        RAISE EXCEPTION 'invalid notification delivery claim arguments';
    END IF;

    FOR v_row IN
        SELECT *
        FROM event.notification_delivery
        WHERE tenant_id=p_tenant_id
          AND (status IN ('pending','failed') OR (status='queued' AND locked_until<=v_now))
          AND channel <> 'webhook'
          AND attempt_count < max_attempts
          AND (next_retry_at IS NULL OR next_retry_at <= v_now)
          AND (locked_until IS NULL OR locked_until <= v_now)
        ORDER BY coalesce(next_retry_at, created_at), created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT p_batch_size
    LOOP
        UPDATE event.notification_delivery
        SET status = 'queued',
            attempt_count = attempt_count + 1,
            locked_until = v_now + make_interval(secs => p_lease_seconds),
            channel_detail = channel_detail || jsonb_build_object('claimed_by', p_worker_id, 'claimed_at', v_now)
        WHERE id = v_row.id
        RETURNING * INTO v_row;
        RETURN NEXT v_row;
    END LOOP;
END;
$$;

-- Mirror the mutable compatibility record into the immutable compliance log.
CREATE OR REPLACE FUNCTION event.trg_mirror_whatsapp_consent_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.consent_status IS NOT DISTINCT FROM OLD.consent_status THEN
        RETURN NEW;
    END IF;
    IF NEW.consent_status NOT IN ('opted_in','revoked') THEN
        RETURN NEW;
    END IF;

    v_actor := nullif(coalesce(NEW.updated_by, NEW.created_by), '00000000-0000-0000-0000-000000000000'::uuid);
    INSERT INTO event.channel_consent_event (
        tenant_id, subject_type, subject_id, channel_code, destination_hash,
        action, source_code, occurred_at, evidence, actor_principal_id
    ) VALUES (
        NEW.tenant_id, 'principal', NEW.principal_id, 'whatsapp',
        encode(public.digest(NEW.phone_e164, 'sha256'), 'hex'),
        CASE NEW.consent_status WHEN 'opted_in' THEN 'granted'::event.consent_action_d ELSE 'revoked'::event.consent_action_d END,
        NEW.consent_source,
        coalesce(CASE WHEN NEW.consent_status = 'opted_in' THEN NEW.consented_at ELSE NEW.revoked_at END, clock_timestamp()),
        jsonb_build_object('whatsapp_consent_id', NEW.id, 'metadata', NEW.metadata),
        v_actor
    );
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION event.notify_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('athyper_invalidation', NEW.id::text);
  RETURN NEW;
END $$;
