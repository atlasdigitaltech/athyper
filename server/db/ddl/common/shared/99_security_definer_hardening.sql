-- Final clean-slate hardening pass. This file must remain last in every plane
-- manifest so functions created by every schema have already been installed.
DO $hardening$
DECLARE
    routine record;
    target_owner text;
BEGIN
    FOR routine IN
        SELECT p.oid, p.prokind, n.nspname AS schema_name, p.proname AS routine_name,
               pg_get_function_identity_arguments(p.oid) AS identity_arguments
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prosecdef
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           AND n.nspname NOT LIKE 'pg_%'
    LOOP
        target_owner := CASE
            WHEN routine.schema_name = 'authz'
             AND routine.routine_name IN (
                'fn_stage_application_projection',
                'fn_activate_application_projection',
                'fn_stage_entity_operation_projection',
                'fn_activate_entity_operation_projection',
                'fn_retire_entity_operation_projection',
                'fn_restore_entity_operation_projection'
             ) THEN 'athyper_projection_owner'
            ELSE current_user
        END;

        IF routine.prokind = 'p' THEN
            EXECUTE format('ALTER PROCEDURE %I.%I(%s) OWNER TO %I',
                routine.schema_name, routine.routine_name, routine.identity_arguments, target_owner);
            EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM PUBLIC',
                routine.schema_name, routine.routine_name, routine.identity_arguments);
        ELSE
            EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I',
                routine.schema_name, routine.routine_name, routine.identity_arguments, target_owner);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                routine.schema_name, routine.routine_name, routine.identity_arguments);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_proc configured
             WHERE configured.oid = routine.oid
               AND EXISTS (
                   SELECT 1 FROM unnest(COALESCE(configured.proconfig, ARRAY[]::text[])) setting
                    WHERE setting LIKE 'search_path=%'
               )
        ) THEN
            RAISE EXCEPTION 'SECURITY DEFINER %.% lacks an explicit search_path',
                routine.schema_name, routine.routine_name;
        END IF;
    END LOOP;
END
$hardening$;
