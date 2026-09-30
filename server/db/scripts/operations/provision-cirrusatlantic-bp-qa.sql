-- Isolated local QA product database only; explicit maker/checker grants, no approvals.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT set_config('app.current_actor_type','service_account',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
SELECT set_config('app.current_principal_id',id::text,true) FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner';
DO $$
DECLARE t uuid:='44444444-4444-4444-8444-444444444444'; actor uuid; scope_id uuid; selected_role uuid; selected_group uuid; principal uuid; account text; role_code text; permissions text[]; ref text:='local-qa:cirrusatlantic-bp-journey:v1';
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON database required'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND scope_kind='operating_organization' AND target_id='a478f9c0-8226-5d22-9599-b8fb27a45180' AND status='active';
 FOREACH account IN ARRAY ARRAY['catl.admin','catl.owner'] LOOP
  SELECT id INTO STRICT principal FROM master.principal WHERE tenant_id=t AND code=account AND status='active';
  role_code:='qa.neon.'||account||'.bp-journey';
  permissions:=CASE WHEN account='catl.admin' THEN ARRAY['create','read','update','validate','submit','materialize'] ELSE ARRAY['read','decide'] END;
  INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
   VALUES(t,role_code,role_code,'Bounded QA BP maker/checker journey','system','seed',ref,'{"environment":"qa"}','draft',actor) ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO STRICT selected_role FROM authz.role WHERE tenant_id=t AND code=role_code AND source_ref=ref;
  IF EXISTS(SELECT 1 FROM authz.role WHERE id=selected_role AND status='draft') THEN
   INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t,selected_role,p.id,actor FROM authz.permission p WHERE p.canonical_code=ANY(ARRAY(SELECT 'neon.relationship.entity_case.'||v FROM unnest(permissions) v)) AND p.status='published';
   IF (SELECT count(*) FROM authz.role_permission rp WHERE rp.role_id=selected_role)<>cardinality(permissions) THEN RAISE EXCEPTION 'Missing permissions'; END IF;
   UPDATE authz.role SET status='active',updated_by=actor WHERE id=selected_role;
  END IF;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by) VALUES(t,role_code,role_code,'system','seed',ref,'{"environment":"qa"}','active',actor) ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO STRICT selected_group FROM authz.principal_group WHERE tenant_id=t AND code=role_code AND source_ref=ref;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by) SELECT t,selected_group,principal,'seed',ref,'active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.group_member gm WHERE gm.tenant_id=t AND gm.group_id=selected_group AND gm.principal_id=principal AND gm.status='active');
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) SELECT t,selected_group,selected_role,scope_id,'subtree','seed',ref,'active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.group_role gr WHERE gr.tenant_id=t AND gr.group_id=selected_group AND gr.role_id=selected_role AND gr.scope_target_id=scope_id AND gr.status='active');
 END LOOP;
END $$;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
