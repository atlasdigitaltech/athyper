-- Reconcile tenant-context helper privileges required by durable job lifecycle RLS.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
    RAISE EXCEPTION 'Required role is absent: athyper_jobs_service';
  END IF;

  GRANT USAGE ON SCHEMA shared TO athyper_jobs_service;
  GRANT EXECUTE ON FUNCTION shared.uuidv7() TO athyper_jobs_service;
  GRANT EXECUTE ON FUNCTION shared.current_tenant_id() TO athyper_jobs_service;
  GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyper_jobs_service;

  IF NOT has_schema_privilege('athyper_jobs_service', 'shared', 'USAGE')
     OR NOT has_function_privilege('athyper_jobs_service', 'shared.uuidv7()', 'EXECUTE')
     OR NOT has_function_privilege('athyper_jobs_service', 'shared.current_tenant_id()', 'EXECUTE')
     OR NOT has_function_privilege('athyper_jobs_service', 'shared.current_tenant_id_soft()', 'EXECUTE') THEN
    RAISE EXCEPTION 'athyper_jobs_service shared helper privilege reconciliation failed';
  END IF;
END;
$$;

COMMIT;
