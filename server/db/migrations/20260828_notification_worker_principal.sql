-- Resolve a tenant-scoped maintenance identity without weakening principal RLS.
BEGIN;

CREATE OR REPLACE FUNCTION event.fn_notification_worker_principal(p_tenant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
    SELECT principal.id
    FROM master.principal principal
    WHERE principal.tenant_id = p_tenant_id
      AND principal.status = 'active'
    ORDER BY (principal.principal_type = 'service_account') DESC,
             principal.created_at,
             principal.id
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION event.fn_notification_worker_principal(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    RAISE EXCEPTION 'Required role is absent: athyperapp';
  END IF;
  GRANT EXECUTE ON FUNCTION event.fn_notification_worker_principal(uuid) TO athyperapp;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION event.fn_notification_worker_principal(uuid) TO athyperadmin;
  END IF;

  IF NOT has_function_privilege('athyperapp', 'event.fn_notification_worker_principal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'notification worker principal resolver privilege reconciliation failed';
  END IF;
END;
$$;

COMMIT;
