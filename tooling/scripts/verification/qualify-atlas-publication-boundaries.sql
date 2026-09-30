BEGIN;
SET LOCAL ROLE athyper_runtime;
SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
SET LOCAL app.current_principal_id='81cd1978-2df5-5c9a-938a-2f8c291aea13';
DO $$ BEGIN
 IF has_table_privilege(current_user,'snapshot.entity_release_artifact','INSERT') THEN RAISE EXCEPTION 'API has general snapshot write privilege'; END IF;
 IF has_function_privilege(current_user,'publication.fn_emit_outbox(uuid,text,text,text,uuid,uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'API has arbitrary publication event privilege'; END IF;
 BEGIN
  PERFORM publication.fn_prepare_initial_baseline_release('126721f6-a2e5-45e2-91bf-0d6a1b660c56','5ca0968a-f81f-42b4-8333-dd54c1b02cbb','{"ai":{"enabled":true},"unreviewed":true}'::jsonb);
  RAISE EXCEPTION 'Mutated descriptor accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REVIEWED_BASELINE_PAYLOAD_MISMATCH' THEN RAISE; END IF; END;
 BEGIN
  PERFORM publication.fn_confirm_metadata_activation('126721f6-a2e5-45e2-91bf-0d6a1b660c56','mesh',gen_random_uuid());
  RAISE EXCEPTION 'Unacknowledged plane accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM publication.fn_confirm_metadata_activation('126721f6-a2e5-45e2-91bf-0d6a1b660c56','neon',gen_random_uuid());
 PERFORM set_config('app.current_tenant_id','55555555-5555-4555-8555-555555555555',true);
 BEGIN
  PERFORM publication.fn_confirm_metadata_activation('126721f6-a2e5-45e2-91bf-0d6a1b660c56','neon',gen_random_uuid());
  RAISE EXCEPTION 'Cross-tenant confirmation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM publication.fn_prepare_initial_baseline_release('126721f6-a2e5-45e2-91bf-0d6a1b660c56','5ca0968a-f81f-42b4-8333-dd54c1b02cbb','{}'::jsonb);
  RAISE EXCEPTION 'Cross-tenant materialization accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 RAISE NOTICE 'PASS: narrow API privileges, reviewed payload integrity, acknowledged plane, tenant isolation; confirmation fixture rolled back';
END $$;
ROLLBACK;
