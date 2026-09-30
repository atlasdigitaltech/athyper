\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE=expected THEN RETURN; END IF;
   RAISE EXCEPTION 'Expected %, got %: %',expected,SQLSTATE,SQLERRM;
 END;
 RAISE EXCEPTION 'Command unexpectedly succeeded (expected %)',expected;
END $$;
BEGIN;
SET app.database_plane='studio';
SET app.current_principal_id='malformed-uuid';
SELECT pg_temp.expect_error($q$INSERT INTO trustiam.identity_replay_approval(id,authority_tenant_id,attempt_id,desired_version,desired_hash,requested_by,reason,expires_at) VALUES('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,repeat('a',64),'20000000-0000-4000-8000-000000000001','Review principal',clock_timestamp()+interval '1 hour')$q$,'23514');
SET app.current_principal_id='';
SELECT pg_temp.expect_error($q$INSERT INTO trustiam.identity_replay_approval(id,authority_tenant_id,attempt_id,desired_version,desired_hash,requested_by,reason,expires_at) VALUES('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,repeat('a',64),'20000000-0000-4000-8000-000000000001','Review principal',clock_timestamp()+interval '1 hour')$q$,'23514');
ROLLBACK;
SELECT 'PASS identity replay principal context' result;
