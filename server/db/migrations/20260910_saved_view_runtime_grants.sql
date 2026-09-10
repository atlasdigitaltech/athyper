BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
   GRANT SELECT, INSERT, UPDATE ON master.saved_view_default TO athyperapp;
 END IF;
END $$;
COMMIT;
