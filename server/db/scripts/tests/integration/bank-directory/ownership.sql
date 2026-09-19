-- Run on a freshly built plane. Rolls back every fixture and release.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.must_fail(command text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',command;
END $$;
DO $$
DECLARE p jsonb; h text; r uuid='10000000-0000-4000-8000-000000000001'; p2 jsonb; tenant uuid; actor uuid; account_id uuid; provisional_id uuid;
BEGIN
 p='{"institutions":[{"id":"20000000-0000-4000-8000-000000000001","name":"Fixture Bank","countryCode":"GB","institutionType":"bank","status":"active","effectiveFrom":"2026-01-01"},{"id":"20000000-0000-4000-8000-000000000002","name":"Another Fixture Bank","countryCode":"GB","institutionType":"bank","status":"active","effectiveFrom":"2026-01-01"}],"branches":[{"id":"30000000-0000-4000-8000-000000000001","institutionId":"20000000-0000-4000-8000-000000000001","name":"Fixture Branch","countryCode":"GB","location":{"city":"London"},"status":"active","effectiveFrom":"2026-01-01"}],"identifiers":[{"id":"40000000-0000-4000-8000-000000000001","institutionId":"20000000-0000-4000-8000-000000000001","branchId":"30000000-0000-4000-8000-000000000001","scheme":"bic","schemeNamespace":"iso9362","jurisdiction":"GB","value":"TSTBGB22XXX","effectiveFrom":"2026-01-01"}],"sourceRecords":[{"source":"synthetic-test","sourceRecordId":"bank-1","institutionId":"20000000-0000-4000-8000-000000000001"}]}'::jsonb;
 h=encode(public.digest(p::text,'sha256'),'hex');
 PERFORM shared.publish_bank_directory(r,1,'2026-09-09T00:00:00Z','[{"source":"synthetic-test"}]',p,h);
 PERFORM shared.publish_bank_directory(r,1,'2026-09-09T00:00:00Z','[{"source":"synthetic-test"}]',p,h);
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM shared.bank_directory_release),'idempotent publication');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM shared.v_bank_institution),'active projection');
 PERFORM pg_temp.assert_true((SELECT bic='TSTBGB22XXX' FROM shared.v_bank_directory WHERE branch_id='30000000-0000-4000-8000-000000000001'),'branch-specific BIC');
 PERFORM pg_temp.must_fail('UPDATE shared.bank_institution_version SET name=''Changed''');
 PERFORM pg_temp.must_fail('DELETE FROM shared.bank_directory_release');
 PERFORM pg_temp.must_fail(format('SELECT shared.publish_bank_directory(%L,2,now(),%L::jsonb,%L::jsonb,%L)',gen_random_uuid(),'[{"source":"synthetic-test"}]',p,repeat('0',64)));
 p2=jsonb_set(p,'{branches,0,institutionId}','"20000000-0000-4000-8000-000000000002"');
 PERFORM pg_temp.must_fail(format('SELECT shared.publish_bank_directory(%L,2,now(),%L::jsonb,%L::jsonb,%L)',gen_random_uuid(),'[{"source":"synthetic-test"}]',p2,encode(public.digest(p2::text,'sha256'),'hex')));
 p2=jsonb_set(p,'{identifiers}',(p->'identifiers') || jsonb_set(p->'identifiers'->0,'{id}','"40000000-0000-4000-8000-000000000002"'));
 PERFORM pg_temp.must_fail(format('SELECT shared.publish_bank_directory(%L,2,now(),%L::jsonb,%L::jsonb,%L)',gen_random_uuid(),'[{"source":"synthetic-test"}]',p2,encode(public.digest(p2::text,'sha256'),'hex')));
 PERFORM pg_temp.assert_true((SELECT release_id=r FROM shared.bank_directory_activation),'failed release leaves active pointer unchanged');
 p2=jsonb_set(p,'{sourceRecords,0,institutionId}','"20000000-0000-4000-8000-000000000002"');
 PERFORM pg_temp.must_fail(format('SELECT shared.publish_bank_directory(%L,2,now(),%L::jsonb,%L::jsonb,%L)',gen_random_uuid(),'[{"source":"synthetic-test"}]',p2,encode(public.digest(p2::text,'sha256'),'hex')));
 p2=jsonb_set(p,'{institutions}',jsonb_build_array(p->'institutions'->0));
 PERFORM pg_temp.must_fail(format('SELECT shared.publish_bank_directory(%L,2,now(),%L::jsonb,%L::jsonb,%L)',gen_random_uuid(),'[{"source":"synthetic-test"}]',p2,encode(public.digest(p2::text,'sha256'),'hex')));
 p2=jsonb_set(p,'{institutions,0,name}' ,'"Fixture Bank Renamed"');
 PERFORM shared.publish_bank_directory('10000000-0000-4000-8000-000000000002',2,'2026-09-10T00:00:00Z','[{"source":"synthetic-test"}]',p2,encode(public.digest(p2::text,'sha256'),'hex'));
 PERFORM pg_temp.assert_true((SELECT name='Fixture Bank' FROM shared.bank_institution_version WHERE release_id=r AND institution_id='20000000-0000-4000-8000-000000000001'),'historical name preserved');
 PERFORM pg_temp.assert_true((SELECT name='Fixture Bank Renamed' FROM shared.v_bank_institution WHERE institution_id='20000000-0000-4000-8000-000000000001'),'new name visible');
 PERFORM pg_temp.assert_true(NOT has_table_privilege('athyperapp','shared.bank_institution','INSERT'),'consumer cannot create canonical bank');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('athyperapp','shared.publish_bank_directory(uuid,bigint,timestamptz,jsonb,jsonb,text)','EXECUTE'),'consumer cannot publish');
 IF to_regclass('master.bank_account') IS NOT NULL THEN
  SELECT tenant_id,id INTO tenant,actor FROM master.principal ORDER BY id LIMIT 1;
  PERFORM set_config('app.current_tenant_id',tenant::text,true);
  PERFORM set_config('app.current_principal_id',actor::text,true);
  PERFORM pg_temp.must_fail(format('INSERT INTO master.bank_account(tenant_id,bank_institution_id,bank_branch_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,created_by) VALUES(%L,%L,%L,''Fixture holder'',''iban'',''GB82WEST12345698765432'',''5432'',''GBP'',%L)',tenant,'20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',actor));
  INSERT INTO master.bank_account(tenant_id,bank_institution_id,bank_branch_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,created_by)
  VALUES(tenant,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Fixture holder','iban','GB82WEST12345698765432','5432','GBP',actor) RETURNING id INTO account_id;
  PERFORM pg_temp.assert_true((SELECT bank_name='Fixture Bank Renamed' AND bic='TSTBGB22XXX' FROM master.v_bank_account_resolved WHERE bank_account_id=account_id),'account resolves shared institution and branch');
  INSERT INTO master.bank_account(tenant_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,created_by)
  VALUES(tenant,'Provisional fixture holder','iban','GB82WEST12345698765433','5433','GBP','Unresolved fixture bank','GB',actor) RETURNING provisional_bank_reference_id INTO provisional_id;
  PERFORM pg_temp.assert_true((SELECT status='unresolved' FROM master.bank_provisional_reference WHERE id=provisional_id),'submitted bank becomes explicit provisional reference');
  PERFORM set_config('app.current_tenant_id',gen_random_uuid()::text,true);
  EXECUTE 'SET LOCAL ROLE athyperapp';
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM master.bank_provisional_reference WHERE id=provisional_id),'provisional reference is tenant isolated');
  EXECUTE 'RESET ROLE';
 END IF;
 PERFORM pg_temp.assert_true(to_regclass('master.bank_party') IS NULL AND to_regclass('mesh.bank_party') IS NULL,'legacy tables removed');
END $$;
ROLLBACK;
