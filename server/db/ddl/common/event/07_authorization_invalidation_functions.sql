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
    IF p_scope_kind = 'plane' AND (p_plane_code IS DISTINCT FROM v_local_plane OR v_local_plane NOT IN ('athyper','neon','mesh')) THEN
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
DECLARE v_id uuid; v_epoch record; v_now timestamptz := clock_timestamp();
BEGIN
    INSERT INTO event.authorization_invalidation_outbox
        (idempotency_key, scope_kind, tenant_id, plane_code, authority_table,
         authority_operation, source_row_key, effective_at, available_at, created_at)
    VALUES (p_idempotency_key, p_scope_kind, p_tenant_id, p_plane_code,
            p_authority_table, p_authority_operation, p_source_row_key,
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
