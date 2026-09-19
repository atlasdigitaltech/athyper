\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_worker') THEN RAISE EXCEPTION 'Local runtime roles required'; END IF;
END $$;
GRANT athyper_publication_service TO athyper_runtime, athyper_worker;
GRANT athyper_projection_applier TO athyper_worker;
GRANT USAGE ON SCHEMA snapshot, shared TO athyper_publication_service;
GRANT EXECUTE ON FUNCTION shared.current_tenant_id(), shared.current_tenant_id_soft() TO athyper_publication_service;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
