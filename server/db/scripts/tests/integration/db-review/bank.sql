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
SET app.current_tenant_id='10000000-0000-4000-8000-000000000001';
SET app.current_principal_id='20000000-0000-4000-8000-000000000001';
SET app.current_network_account_id='30000000-0000-4000-8000-000000000001';
SET app.database_plane='mesh';
SELECT id AS rel FROM mesh.network_relationship WHERE buyer_tenant_id='10000000-0000-4000-8000-000000000001' LIMIT 1 \gset
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','review_checker','Review checker','user','20000000-0000-4000-8000-000000000003');
INSERT INTO mesh.network_relationship_capability(network_relationship_id,capability_code,episode_no,requested_by_tenant_id,approved_by_tenant_id,effective_from,status,row_version,created_by) VALUES(:'rel','payments',1,'10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',CURRENT_DATE,'active',2,'20000000-0000-4000-8000-000000000002');
INSERT INTO mesh.bank_provisional_reference(id,tenant_id,submitted_name,submitted_country) VALUES('40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000002','Example Bank','MY');
INSERT INTO mesh.bank_account(provisional_bank_reference_id,id,tenant_id,network_account_id,account_holder_name,account_id_type,protected_value_token,identifier_fingerprint,protection_key_version,account_last4,currency_code,bank_name_override,bank_country_override,is_verified,verified_at,verified_by,verification_method,status,created_by) VALUES('40000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Review Supplier','iban','vault:review-test-token',repeat('a',64),1,'6819','MYR','Example Bank','MY',true,clock_timestamp(),'20000000-0000-4000-8000-000000000002','manual','active','20000000-0000-4000-8000-000000000002');
INSERT INTO snapshot.bank_account_disclosure(id,owner_tenant_id,recipient_tenant_id,disclosure_id,disclosure_version,payload_json,payload_hash,captured_by) VALUES('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',1,'{}',repeat('b',64),'20000000-0000-4000-8000-000000000002');
INSERT INTO mesh.bank_account_disclosure(id,owner_tenant_id,owner_account_id,bank_account_id,network_relationship_id,recipient_tenant_id,recipient_account_id,purpose,snapshot_id,payload_hash,secure_retrieval_reference,idempotency_key,decision_fingerprint,approved_at,approved_by,status,disclosed_by,created_by) VALUES('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',:'rel','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','settlement','40000000-0000-4000-8000-000000000002',repeat('b',64),'vault-ref:40000000-0000-4000-8000-000000000003','review-disclosure',repeat('c',64),clock_timestamp(),'20000000-0000-4000-8000-000000000003','active','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
COMMIT;
CREATE ROLE db_review_retriever LOGIN IN ROLE athyper_protected_value_retriever;
SET SESSION AUTHORIZATION db_review_retriever;
SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001') \gset initial_
SELECT pg_temp.assert_true(:'initial_protected_value_token'='vault:review-test-token','eligible retrieval');
RESET SESSION AUTHORIZATION;
SELECT * FROM mesh.command_network_relationship_lifecycle(:'rel','suspend',2,'Review suspension','review-suspend-01','20000000-0000-4000-8000-000000000001');
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-02','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
SELECT * FROM mesh.command_network_relationship_lifecycle(:'rel','reactivate',3,'Review reactivation','review-reactivate-01','20000000-0000-4000-8000-000000000001');
SET SESSION AUTHORIZATION db_review_retriever;
SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001') \gset active_replay_
SELECT pg_temp.assert_true(:'active_replay_replayed'::boolean,'eligible replay after reactivation');
RESET SESSION AUTHORIZATION;
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE mesh.network_relationship SET effective_from=CURRENT_DATE+1 WHERE id=:'rel';
SET LOCAL session_replication_role=origin;
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
ROLLBACK;
SELECT 'PASS future relationship' result;
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE mesh.network_relationship SET effective_from=CURRENT_DATE-2,effective_until=CURRENT_DATE WHERE id=:'rel';
SET LOCAL session_replication_role=origin;
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
ROLLBACK;
SELECT 'PASS expired relationship' result;
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE mesh.network_account SET status='suspended' WHERE id='30000000-0000-4000-8000-000000000001';
SET LOCAL session_replication_role=origin;
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
ROLLBACK;
SELECT 'PASS suspended recipient' result;
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE mesh.network_account SET status='suspended' WHERE id='30000000-0000-4000-8000-000000000002';
SET LOCAL session_replication_role=origin;
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
ROLLBACK;
SELECT 'PASS suspended owner' result;
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE mesh.network_relationship_capability SET status='suspended' WHERE network_relationship_id=:'rel' AND capability_code='payments';
SET LOCAL session_replication_role=origin;
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
ROLLBACK;
SELECT 'PASS suspended capability' result;
SELECT * FROM mesh.command_network_relationship_lifecycle(:'rel','terminate',4,'Review termination','review-terminate-01','20000000-0000-4000-8000-000000000001');
SET SESSION AUTHORIZATION db_review_retriever;
SELECT pg_temp.expect_error($q$SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Review retrieval','review-retrieve-01','20000000-0000-4000-8000-000000000001')$q$,'42501');
RESET SESSION AUTHORIZATION;
SELECT 'PASS bank retrieval revocation and replay' result;
