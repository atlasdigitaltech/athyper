-- Fresh isolated QA setup only. System provisioning, never a release approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT set_config('app.current_actor_type','service_account',true);
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
SELECT set_config('app.current_principal_id',id::text,true) FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
DO $roles$
DECLARE
 t uuid:='44444444-4444-4444-8444-444444444444'; actor uuid; scope_id uuid;
 qa_role uuid; qa_group uuid; user_id uuid; item record; role_code text;
 ref text:='local-qa:cirrusatlantic-native-metadata:v1';
BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'QA_STUDIO_DATABASE_REQUIRED'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND scope_key='cirrusatlantic' AND status='active';
 PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code IN('metadata.entity.author','metadata.entity.validate','metadata.entity.test','metadata.entity.submit','metadata.entity.review','metadata.entity.publish') AND status='published' AND requires_mfa=true)<>6 THEN RAISE EXCEPTION 'QA_NATIVE_METADATA_CATALOG_REQUIRED'; END IF;
 FOR item IN SELECT * FROM (VALUES
  ('catl.admin','author',ARRAY['metadata.entity.author','metadata.entity.validate','metadata.entity.test','metadata.entity.submit']),
  ('catl.owner','reviewer',ARRAY['metadata.entity.review','metadata.entity.publish'])
 ) AS desired(account,kind,permissions) LOOP
  SELECT id INTO STRICT user_id FROM master.principal WHERE tenant_id=t AND code=item.account AND status='active';
  role_code:='qa.studio.catl.meta-'||item.kind;
  INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
  VALUES(t,role_code,'QA native metadata '||item.kind,'Separate native author/reviewer, exact Cirrus tenant','system','seed',ref,'{"environment":"qa"}','draft',actor) ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO STRICT qa_role FROM authz.role WHERE tenant_id=t AND code=role_code AND source_ref=ref;
  IF EXISTS(SELECT 1 FROM authz.role WHERE id=qa_role AND status='draft') THEN
   INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t,qa_role,id,actor FROM authz.permission WHERE canonical_code=ANY(item.permissions);
   UPDATE authz.role SET status='active',updated_by=actor WHERE id=qa_role;
  END IF;
  IF (SELECT array_agg(p.canonical_code ORDER BY p.canonical_code) FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id WHERE rp.role_id=qa_role) IS DISTINCT FROM (SELECT array_agg(code ORDER BY code) FROM unnest(item.permissions) code) THEN RAISE EXCEPTION 'QA_NATIVE_ROLE_CONTENT_CONFLICT'; END IF;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by) VALUES(t,role_code,'QA native metadata '||item.kind,'system','seed',ref,'{"environment":"qa"}','active',actor) ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO STRICT qa_group FROM authz.principal_group WHERE tenant_id=t AND code=role_code AND source_ref=ref;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by) SELECT t,qa_group,user_id,'seed',ref,'active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.group_member gm WHERE gm.tenant_id=t AND gm.group_id=qa_group AND gm.principal_id=user_id AND gm.status='active');
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) SELECT t,qa_group,qa_role,scope_id,'exact','seed',ref,'active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.group_role gr WHERE gr.tenant_id=t AND gr.group_id=qa_group AND gr.role_id=qa_role AND gr.scope_target_id=scope_id AND gr.status='active');
 END LOOP;
END $roles$;
SELECT jsonb_build_object('kind','qa-native-metadata-authority-setup','nativeApproval',false,'mfaUnchanged',true);
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
