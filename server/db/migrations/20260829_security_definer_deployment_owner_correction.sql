BEGIN;

DO $correction$
DECLARE
    routine record;
    target_owner text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
        RAISE EXCEPTION 'SECURITY DEFINER ownership correction requires the deployment superuser';
    END IF;
    FOR routine IN
        SELECT p.prokind, n.nspname AS schema_name, p.proname AS routine_name,
               pg_get_function_identity_arguments(p.oid) AS identity_arguments
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_%'
    LOOP
        target_owner := CASE WHEN routine.schema_name = 'authz' AND routine.routine_name IN (
            'fn_stage_application_projection', 'fn_activate_application_projection',
            'fn_stage_entity_operation_projection', 'fn_activate_entity_operation_projection',
            'fn_retire_entity_operation_projection', 'fn_restore_entity_operation_projection'
        ) THEN 'athyper_projection_owner' ELSE current_user END;
        IF routine.prokind = 'p' THEN
            EXECUTE format('ALTER PROCEDURE %I.%I(%s) OWNER TO %I', routine.schema_name, routine.routine_name, routine.identity_arguments, target_owner);
        ELSE
            EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', routine.schema_name, routine.routine_name, routine.identity_arguments, target_owner);
        END IF;
    END LOOP;
END
$correction$;

COMMIT;
