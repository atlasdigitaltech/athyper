-- Bind notification maintenance identity resolution to the stamped tenant.
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
      AND p_tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
      AND principal.status = 'active'
    ORDER BY (principal.principal_type = 'service_account') DESC,
             principal.created_at,
             principal.id
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION event.fn_notification_worker_principal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION event.fn_notification_worker_principal(uuid) TO athyperapp;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION event.fn_notification_worker_principal(uuid) TO athyperadmin;
  END IF;
END;
$$;

COMMIT;
