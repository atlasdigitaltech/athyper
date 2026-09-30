\set ON_ERROR_STOP on
SET app.database_plane='mesh';
INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by)
SELECT ('10000000-0000-4000-8000-00000000000'||i)::uuid,'review'||i,'Review '||i,'Review '||i,'review'||i,'active',('10000000-0000-4000-8000-00000000000'||i)::uuid FROM generate_series(1,2) i;
INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by)
SELECT ('20000000-0000-4000-8000-00000000000'||i)::uuid,('10000000-0000-4000-8000-00000000000'||i)::uuid,'review'||i,'Review '||i,'user',('20000000-0000-4000-8000-00000000000'||i)::uuid FROM generate_series(1,2) i;
INSERT INTO mesh.network_account(id,tenant_id,account_code,display_name,network_role,status,created_by)
SELECT ('30000000-0000-4000-8000-00000000000'||i)::uuid,('10000000-0000-4000-8000-00000000000'||i)::uuid,'review.'||i,'Review '||i,CASE WHEN i=1 THEN 'buyer' ELSE 'supplier' END,'active',('20000000-0000-4000-8000-00000000000'||i)::uuid FROM generate_series(1,2) i;
SET app.current_tenant_id='10000000-0000-4000-8000-000000000001';
SET app.current_principal_id='20000000-0000-4000-8000-000000000001';
SET app.current_network_account_id='30000000-0000-4000-8000-000000000001';

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
SET TIME ZONE 'Etc/GMT+12';
SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Review discovery',repeat('x',200),'20000000-0000-4000-8000-000000000001') \gset first_
SELECT pg_temp.assert_true((SELECT r.effective_from=c.effective_from FROM mesh.network_relationship r JOIN mesh.network_relationship_capability c ON c.network_relationship_id=r.id WHERE r.id=:'first_relationship_id'),'discovery dates align');
SET TIME ZONE 'Etc/GMT-14';
SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Review discovery',repeat('x',200),'20000000-0000-4000-8000-000000000001') \gset replay_
SELECT pg_temp.assert_true(:'replay_replayed'::boolean AND :'first_capability_id'=:'replay_capability_id','cross-date replay');
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Changed',repeat('x',200),'20000000-0000-4000-8000-000000000001')$q$,'23505');
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Review discovery',repeat('x',201),'20000000-0000-4000-8000-000000000001')$q$,'23514');
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Review discovery','short','20000000-0000-4000-8000-000000000001')$q$,'23514');
SET app.current_tenant_id='10000000-0000-4000-8000-000000000002';
SET app.current_principal_id='20000000-0000-4000-8000-000000000002';
SET app.current_network_account_id='30000000-0000-4000-8000-000000000002';
SELECT pg_temp.expect_error(format($q$SELECT * FROM mesh.command_relationship_capability_lifecycle(%L,'end',1,'Counterparty withdrawal','review-counter-end',%L)$q$,:'first_capability_id','20000000-0000-4000-8000-000000000002'),'55000');
-- Acceptance is rolled back so the independent withdrawal checks retain their fixture.
BEGIN;
SELECT * FROM mesh.command_network_relationship_lifecycle(:'first_relationship_id','accept',1,'Accept probe','review-accept-probe','20000000-0000-4000-8000-000000000002');
SELECT * FROM mesh.command_relationship_capability_lifecycle(:'first_capability_id','accept',1,'Accept capability probe','review-cap-accept-probe','20000000-0000-4000-8000-000000000002');
SET LOCAL app.current_tenant_id='10000000-0000-4000-8000-000000000001';
SET LOCAL app.current_principal_id='20000000-0000-4000-8000-000000000001';
SET LOCAL app.current_network_account_id='30000000-0000-4000-8000-000000000001';
SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Review discovery',repeat('x',200),'20000000-0000-4000-8000-000000000001') \gset accepted_replay_
SELECT pg_temp.assert_true(:'accepted_replay_replayed'::boolean AND :'accepted_replay_status'='active' AND :'accepted_replay_capability_id'=:'first_capability_id','discovery replay reports accepted capability as active');
ROLLBACK;

SET app.current_tenant_id='10000000-0000-4000-8000-000000000001';
SET app.current_principal_id='20000000-0000-4000-8000-000000000001';
SET app.current_network_account_id='30000000-0000-4000-8000-000000000001';
SELECT * FROM mesh.command_relationship_capability_lifecycle(:'first_capability_id','end',1,'Withdraw request','review-withdraw-01','20000000-0000-4000-8000-000000000001') \gset ended_
SELECT pg_temp.assert_true(:'ended_status'='ended','request withdrawal');
SELECT pg_temp.assert_true((SELECT approved_by_tenant_id IS NULL FROM mesh.network_relationship_capability WHERE id=:'first_capability_id'),'withdrawal does not fabricate approval');
SELECT * FROM mesh.command_relationship_capability_lifecycle(:'first_capability_id','end',1,'Withdraw request','review-withdraw-01','20000000-0000-4000-8000-000000000001') \gset ended_replay_
SELECT pg_temp.assert_true(:'ended_replay_replayed'::boolean,'withdrawal replay');
-- Discovery replays stable IDs while reporting the current capability state.
SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Review discovery',repeat('x',200),'20000000-0000-4000-8000-000000000001') \gset after_end_
SELECT pg_temp.assert_true(:'after_end_replayed'::boolean AND :'after_end_status'='ended' AND :'after_end_relationship_id'=:'first_relationship_id' AND :'after_end_capability_id'=:'first_capability_id','discovery reports current status after lifecycle change');
SELECT pg_temp.assert_true((SELECT status='ended' FROM mesh.network_relationship_capability WHERE id=:'first_capability_id'),'discovery replay does not reset live capability state');

SELECT * FROM mesh.command_issue_registration_exchange('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','buyer_request','commercial','mesh.registration-intent',1,repeat('a',64),'{}',repeat('b',64),clock_timestamp()+interval '1 second','Review expiry','review-issue-01','20000000-0000-4000-8000-000000000001') \gset issue_
SELECT pg_sleep(1.1);
SET app.current_tenant_id='10000000-0000-4000-8000-000000000002';
SET app.current_principal_id='20000000-0000-4000-8000-000000000002';
SET app.current_network_account_id='30000000-0000-4000-8000-000000000002';
SELECT pg_temp.expect_error(format($q$SELECT * FROM mesh.command_registration_exchange_lifecycle(%L,'accept',1,'Review accept','review-expired-accept',%L)$q$,:'issue_exchange_id','20000000-0000-4000-8000-000000000002'),'55000');
SELECT * FROM mesh.command_registration_exchange_lifecycle(:'issue_exchange_id','expire',1,'Review expire','review-expire-01','20000000-0000-4000-8000-000000000002') \gset expired_
SELECT pg_temp.assert_true(:'expired_status'='expired','explicit expiry remains available');
SET TIME ZONE 'UTC';
SELECT * FROM mesh.command_network_relationship_lifecycle(:'first_relationship_id','accept',1,'Accept relationship','review-rel-accept','20000000-0000-4000-8000-000000000002');
SELECT 'PASS discovery, withdrawal, registration expiry' result;
