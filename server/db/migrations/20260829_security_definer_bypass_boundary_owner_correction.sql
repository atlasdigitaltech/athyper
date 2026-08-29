BEGIN;

DO $correction$
DECLARE
    routine record;
    database_owner text;
BEGIN
    SELECT owner.rolname INTO STRICT database_owner
      FROM pg_database database
      JOIN pg_roles owner ON owner.oid = database.datdba
     WHERE database.datname = current_database();

    FOR routine IN
        SELECT p.prokind, n.nspname AS schema_name, p.proname AS routine_name,
               pg_get_function_identity_arguments(p.oid) AS identity_arguments
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prosecdef
           AND 'row_security=off' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           AND n.nspname NOT LIKE 'pg_%'
    LOOP
        IF routine.prokind = 'p' THEN
            EXECUTE format('ALTER PROCEDURE %I.%I(%s) OWNER TO %I', routine.schema_name, routine.routine_name, routine.identity_arguments, database_owner);
        ELSE
            EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', routine.schema_name, routine.routine_name, routine.identity_arguments, database_owner);
        END IF;
    END LOOP;
END
$correction$;

COMMIT;
