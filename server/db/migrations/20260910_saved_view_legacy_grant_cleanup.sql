BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
   REVOKE SELECT, INSERT, UPDATE ON master.saved_view_default FROM athyper_runtime;
 END IF;
END $$;
COMMIT;
