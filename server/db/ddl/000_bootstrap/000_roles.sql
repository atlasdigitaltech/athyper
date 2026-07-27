-- ============================================================================
-- 00_platform/000_roles.sql
-- Concept: Platform Roles — athyperadmin superuser role for schema management
-- Depends on: (none — first file executed)
-- ============================================================================

DO $$ BEGIN
    CREATE ROLE athyperadmin NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE ROLE athyperadmin_atlas_maintenance NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON ROLE athyperadmin_atlas_maintenance IS
    'Atlas retention-only authority. Grant only to the dedicated purge login; '
    'never grant to the API runtime or support identities.';

COMMENT ON ROLE athyperadmin IS
    'Platform administrator role. Used by RLS policies across all schemas '
    'to grant unrestricted read/write access. NOLOGIN — granted to login roles.';
