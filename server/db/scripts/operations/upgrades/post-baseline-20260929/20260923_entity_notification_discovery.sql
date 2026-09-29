BEGIN;
SET LOCAL lock_timeout='5s';
-- Keep published entity policies discoverable without operational routing rows.
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
            SELECT o.tenant_id FROM event.outbox o WHERE o.event_type IS NOT NULL AND (o.event_type LIKE 'collaboration.comment.%' OR o.event_type LIKE 'attachments.%' OR EXISTS (SELECT 1 FROM control.notification_routing_rule r WHERE r.event_type=o.event_type AND r.is_enabled AND (r.tenant_id IS NULL OR r.tenant_id=o.tenant_id))) AND NOT EXISTS (SELECT 1 FROM event.notification_outbox_state s WHERE s.tenant_id=o.tenant_id AND s.outbox_id=o.id AND s.status IN ('completed','dead_letter'))
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
CREATE INDEX IF NOT EXISTS notification_delivery_entity_dedup_idx ON event.notification_delivery(tenant_id,(metadata->>'dedup_key'),created_at) WHERE metadata ? 'dedup_key';
COMMIT;
