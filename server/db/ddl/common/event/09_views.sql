CREATE VIEW event.authorization_invalidation_health
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    scope_kind,
    tenant_id,
    plane_code,
    count(*) FILTER (WHERE status IN ('pending','failed')) AS ready_count,
    count(*) FILTER (WHERE status = 'processing') AS processing_count,
    count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_count,
    min(available_at) FILTER (WHERE status IN ('pending','failed')) AS oldest_ready_at,
    min(locked_until) FILTER (WHERE status = 'processing') AS earliest_lease_expiry,
    max(processed_at) FILTER (WHERE status = 'completed') AS last_completed_at
FROM event.authorization_invalidation_outbox
GROUP BY scope_kind, tenant_id, plane_code;

COMMENT ON VIEW event.authorization_invalidation_health IS
  'Canonical plane-local authorization invalidation backlog and lease health. Replaces v_authorization_invalidation_health_v2.';
