-- Local NEON regression: use -v case_id=<validated draft UUID>.
-- No submission, workflow notification or snapshot persists.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('test.submission_case_id', :'case_id', true);
DO $$
DECLARE c document.entity_case%ROWTYPE; result record; key text:='submission-regression-'||gen_random_uuid();
BEGIN
 SELECT * INTO STRICT c FROM document.entity_case WHERE id=current_setting('test.submission_case_id')::uuid;
 IF current_database()<>'athyper_neon' OR c.status<>'draft' THEN RAISE EXCEPTION 'Requires a local NEON validated draft'; END IF;
 PERFORM set_config('app.database_plane','neon',true);
 PERFORM set_config('app.current_tenant_id',c.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',c.created_by::text,true);
 BEGIN
  PERFORM document.command_entity_case_lifecycle(c.tenant_id,c.id,'submit',c.row_version,gen_random_uuid(),NULL,NULL,key||'-partial-cycle',c.created_by,NULL);
  RAISE EXCEPTION 'Partial cycle binding accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 SELECT * INTO result FROM document.command_entity_case_lifecycle(c.tenant_id,c.id,'submit',c.row_version,NULL,NULL,NULL,key,c.created_by,NULL);
 IF result.status<>'submitted' OR result.row_version<>c.row_version+1 OR result.replayed THEN RAISE EXCEPTION 'Submission result incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence WHERE tenant_id=c.tenant_id AND entity_case_id=c.id AND command_code='entity.case.submit' AND idempotency_key=key AND after_version=c.row_version+1) THEN RAISE EXCEPTION 'Submission evidence missing'; END IF;
 SELECT * INTO result FROM document.command_entity_case_lifecycle(c.tenant_id,c.id,'submit',c.row_version,NULL,NULL,NULL,key,c.created_by,NULL);
 IF NOT result.replayed OR result.row_version<>c.row_version+1 THEN RAISE EXCEPTION 'Submission replay incorrect'; END IF;
 BEGIN
  PERFORM document.command_entity_case_lifecycle(c.tenant_id,c.id,'approve',c.row_version+1,NULL,NULL,NULL,key||'-self-approve',c.created_by,NULL);
  RAISE EXCEPTION 'Maker approved own request';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM document.command_entity_case_lifecycle(c.tenant_id,c.id,'submit',c.row_version,NULL,NULL,NULL,key||'-stale',c.created_by,NULL);
  RAISE EXCEPTION 'Stale submission accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
END $$;
ROLLBACK;
SELECT 'NEON_SUBMISSION_ROLLBACK_OK';
