-- Dependency of the retained 20260929_table_entity_publication migration.
-- Preserve that migration's checksum and its historical grantee name. This is
-- an inert capability role: no login, membership, schema access or application
-- enrollment is granted. Serving-role composition is qualified separately.
BEGIN;
DO $$
BEGIN
  IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
    CREATE ROLE athyper_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Publication runtime role requires privilege review';
  END IF;
END $$;
COMMIT;
