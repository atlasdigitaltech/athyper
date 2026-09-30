-- Run against local NEON with -v case_id=<existing draft UUID>.
-- All validation output and snapshots are rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('test.validation_case_id', :'case_id', true);
DO $$
DECLARE c document.entity_case%ROWTYPE; result record; evaluation uuid := gen_random_uuid(); key text := 'validation-guard-probe-' || gen_random_uuid();
BEGIN
 SELECT * INTO STRICT c FROM document.entity_case WHERE id=current_setting('test.validation_case_id')::uuid;
 IF current_database()<>'athyper_neon' OR c.status<>'draft' THEN RAISE EXCEPTION 'Requires a local NEON draft'; END IF;
 PERFORM set_config('app.database_plane','neon',true);
 PERFORM set_config('app.current_tenant_id',c.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',c.created_by::text,true);
 PERFORM set_config('app.entity_case_command_execution_id','',true);
 BEGIN
  UPDATE document.entity_case SET updated_by=c.created_by WHERE id=c.id;
  RAISE EXCEPTION 'Unguarded update unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT * INTO result FROM document.command_entity_case_validation(c.tenant_id,c.id,c.row_version,evaluation,'guard.regression','1',repeat('a',64),'[]','{"outcome":"failed"}','{}','{}',key,c.created_by,NULL);
 IF result.row_version<>c.row_version+1 OR result.replayed THEN RAISE EXCEPTION 'Validation did not advance exactly one revision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence WHERE tenant_id=c.tenant_id AND entity_case_id=c.id AND command_code='entity.case.validation' AND idempotency_key=key AND after_version=c.row_version+1) THEN RAISE EXCEPTION 'Validation evidence missing'; END IF;
 SELECT * INTO result FROM document.command_entity_case_validation(c.tenant_id,c.id,c.row_version,evaluation,'guard.regression','1',repeat('a',64),'[]','{"outcome":"failed"}','{}','{}',key,c.created_by,NULL);
 IF NOT result.replayed OR result.row_version<>c.row_version+1 THEN RAISE EXCEPTION 'Replay changed version'; END IF;
 BEGIN
  PERFORM document.command_entity_case_validation(c.tenant_id,c.id,c.row_version,evaluation,'guard.regression','1',repeat('a',64),'[]','{"outcome":"failed"}','{}','{}',key||'-stale',c.created_by,NULL);
  RAISE EXCEPTION 'Stale version unexpectedly accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 -- A completed execution must not authorize a subsequent raw write.
 BEGIN
  UPDATE document.entity_case SET updated_by=c.created_by WHERE id=c.id;
  RAISE EXCEPTION 'Completed execution unexpectedly authorized an update';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
SELECT 'VALIDATION_GUARD_ROLLBACK_OK';
