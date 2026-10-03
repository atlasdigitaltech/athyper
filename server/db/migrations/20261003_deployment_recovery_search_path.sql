-- Explicit temporary-schema position for the bounded recovery evidence reader.
BEGIN;
ALTER FUNCTION publication.fn_coordinated_deployment_recovery_source(uuid,text) SET search_path TO pg_catalog,pg_temp;
COMMIT;
