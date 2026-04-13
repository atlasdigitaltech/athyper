-- 00_extensions/000_roles.sql
-- Creates application roles required by RLS policies.
-- Must run before any RLS policy file (09_rls_policies/*).

DO $$ BEGIN
    CREATE ROLE athyperadmin NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON ROLE athyperadmin IS
    'Platform administrator role. Used by RLS policies across all schemas '
    'to grant unrestricted read/write access. NOLOGIN — granted to login roles.';
