-- ============================================================================
-- event/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "event"."v_authorization_invalidation_health_v2" WITH (security_invoker=true) AS
SELECT scope_kind,
    tenant_id,
    plane_code,
    status,
    count(*) AS event_count,
    min(available_at) AS oldest_available_at,
    max(available_at) AS newest_available_at,
    count(*) FILTER (WHERE available_at <= clock_timestamp() AND (status = ANY (ARRAY['pending'::text, 'failed'::text]))) AS ready_count,
    count(*) FILTER (WHERE status = 'processing'::text AND locked_until < clock_timestamp()) AS expired_lease_count
   FROM event.authorization_invalidation_outbox_v2
  GROUP BY scope_kind, tenant_id, plane_code, status;

COMMENT ON VIEW "event"."v_authorization_invalidation_health_v2" IS 'RLS-preserving v2 invalidation backlog, due-boundary, and lease health.';
