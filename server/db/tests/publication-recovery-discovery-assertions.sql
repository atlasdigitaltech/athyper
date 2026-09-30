-- Run after publication/19_recovery_discovery.sql on the disposable fixture.
CREATE ROLE publication_recovery_test LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT athyper_publication_recovery TO publication_recovery_test;
DO $$ BEGIN
  IF has_table_privilege('athyper_publication_recovery_owner', 'publication.release', 'UPDATE')
    OR has_table_privilege('athyper_publication_recovery_owner', 'publication.deployment', 'UPDATE')
    OR pg_has_role('publication_recovery_test', 'athyper_publication_recovery_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'discovery owner has mutation authority or is available to the recovery login';
  END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
    WHERE oid='publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer)'::regprocedure)
    <> 'athyper_publication_recovery_owner' THEN
    RAISE EXCEPTION 'discovery function has the wrong owner';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute recovery discovery';
  END IF;
END $$;
DO $$ BEGIN
  IF has_function_privilege('athyper_publication_service',
    'publication.fn_recoverable_deployment_coordinates(timestamptz,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'general publication service can discover tenants';
  END IF;
END $$;
SET ROLE athyper_publication_service;
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM publication.release;
  IF n <> 0 THEN RAISE EXCEPTION 'service role bypassed release RLS'; END IF;
END $$;
RESET ROLE;
SET ROLE publication_recovery_test;
DO $$ DECLARE n integer; first_id uuid; first_created timestamptz; BEGIN
  IF has_table_privilege(current_user, 'publication.release', 'SELECT') THEN
    RAISE EXCEPTION 'recovery role has direct release access';
  END IF;
  SELECT count(*) INTO n FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,200);
  IF n <> 3 THEN RAISE EXCEPTION 'expected three stale coordinates, got %', n; END IF;
  IF NOT EXISTS(SELECT 1 FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,200) WHERE deployment_id='30000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Lost acknowledgement was not recoverable'; END IF;
  IF EXISTS(SELECT 1 FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,200) WHERE deployment_id IN ('30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000007')) THEN RAISE EXCEPTION 'Completed, failed or fresh deployment was selected'; END IF;
  SELECT count(*) INTO n FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,1);
  IF n <> 1 THEN RAISE EXCEPTION 'batch limit ignored'; END IF;
  SELECT deployment_id, created_at INTO first_id, first_created
    FROM publication.fn_recoverable_deployment_coordinates(NULL,NULL,1);
  SELECT count(*) INTO n FROM publication.fn_recoverable_deployment_coordinates(first_created,first_id,1);
  IF n <> 1 THEN RAISE EXCEPTION 'cursor page missing'; END IF;
END $$;
RESET ROLE;
