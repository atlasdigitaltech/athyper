BEGIN;
SET LOCAL ROLE athyper_runtime;
SELECT set_config('app.database_plane','neon',true),
       set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true),
       set_config('app.current_principal_id','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c',true);
DO $stage2$
DECLARE
  v_tenant uuid := '11111111-1111-4111-8111-111111111111';
  v_actor uuid := 'd4250b08-6e5e-5887-b4e1-6f3eb31d7c8c';
  v_company uuid := '7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7';
  v_code text := 'stage2_probe_' || substr(gen_random_uuid()::text,1,8);
  v_request text := 'UPR.STAGE2.' || substr(gen_random_uuid()::text,1,8);
BEGIN
  INSERT INTO master.position(tenant_id,code,name,company_code_id,legal_entity_id,valid_from,status,created_by)
  SELECT v_tenant,v_code,'Stage 2 probe',v_company,legal_entity_id,current_date,'draft',v_actor
    FROM master.company_code WHERE tenant_id=v_tenant AND id=v_company AND status='active';
  IF NOT EXISTS(SELECT 1 FROM master.position WHERE tenant_id=v_tenant AND code=v_code AND status='draft')
    THEN RAISE EXCEPTION 'Draft position did not reload'; END IF;
  INSERT INTO document.user_profile_update_request
    (tenant_id,code,name,created_by,requested_by,principal_id,principal_snapshot,request_scope,requested_changes,status)
  VALUES(v_tenant,v_request,'Stage 2 profile probe',v_actor,v_actor,v_actor,'{"principalType":"user"}',ARRAY['principal_profile'],
         '{"preferredName":"Stage 2 probe"}','draft');
  IF NOT EXISTS(SELECT 1 FROM document.user_profile_update_request WHERE tenant_id=v_tenant AND code=v_request AND principal_id=v_actor)
    THEN RAISE EXCEPTION 'Self profile request did not reload'; END IF;
  BEGIN
    INSERT INTO document.user_profile_update_request
      (tenant_id,code,name,created_by,requested_by,principal_id,request_scope,requested_changes,status)
    VALUES(v_tenant,v_request||'.denied','Invalid cross-user request',v_actor,v_actor,'ff3d770b-fc3f-5b2c-a5c1-901954691ddf',ARRAY['principal_profile'],'{}','draft');
    RAISE EXCEPTION 'Cross-user self-service request was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $stage2$;
ROLLBACK;
SELECT 'HR_STAGE2_SETUP_USER_ROLLBACK_OK';
