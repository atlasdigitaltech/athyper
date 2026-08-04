CREATE OR REPLACE FUNCTION event.current_plane_key()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT CASE coalesce(
        nullif(current_setting('app.current_plane_key', true), ''),
        CASE current_database()
            WHEN 'athyper_platform' THEN 'admin'
            WHEN 'athyper_mesh' THEN 'mesh'
            ELSE 'neon'
        END
    )
        WHEN 'admin' THEN 'admin'
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
        RETURN QUERY SELECT DISTINCT m.tenant_id FROM event.notification_message m
        WHERE m.status = 'pending' AND (m.expires_at IS NULL OR m.expires_at > clock_timestamp()) LIMIT p_limit;
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
        RETURN QUERY SELECT DISTINCT o.tenant_id FROM event.outbox o
        WHERE (o.status IN ('pending','failed') AND o.available_at <= clock_timestamp())
           OR (o.status = 'processing' AND o.locked_until < clock_timestamp())
        LIMIT p_limit;
    END IF;
END;
$$;

-- Atomic worker claim. The active service normally claims one message at a
-- time; this function supports batch workers without weakening tenant RLS.
CREATE OR REPLACE FUNCTION event.fn_notification_claim_deliveries(
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
    IF btrim(coalesce(p_worker_id, '')) = ''
       OR p_batch_size NOT BETWEEN 1 AND 1000
       OR p_lease_seconds NOT BETWEEN 5 AND 3600 THEN
        RAISE EXCEPTION 'invalid notification delivery claim arguments';
    END IF;

    FOR v_row IN
        SELECT *
        FROM event.notification_delivery
        WHERE status IN ('pending','failed')
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
