-- Isolated local QA only. Run with psql -v ON_ERROR_STOP=1 -v apply=false first.
-- System provisioning; this does not authenticate either actor or approve a release.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL application_name = 'cirrusatlantic-publication-provisioner';
SELECT set_config('app.current_actor_type','service_account',true);
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
SELECT set_config('app.current_principal_id',id::text,true) FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
DO $$
DECLARE
 t uuid := '44444444-4444-4444-8444-444444444444';
 actor uuid;
 ref text := 'local-qa:cirrusatlantic-publication-authority:v1';
 admin_id uuid; owner_id uuid; admin_group uuid; owner_group uuid;
 old_role uuid; author_role uuid; reviewer_role uuid; scope_id uuid;
BEGIN
 IF current_database()<>'athyper_studio' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id=t AND code='cirrusatlantic' AND status='active') THEN
  RAISE EXCEPTION 'Studio QA tenant fingerprint mismatch';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
 SELECT id INTO STRICT admin_id FROM master.principal WHERE tenant_id=t AND code='catl.admin' AND status='active';
 SELECT id INTO STRICT owner_id FROM master.principal WHERE tenant_id=t AND code='catl.owner' AND status='active';
 IF admin_id=owner_id THEN RAISE EXCEPTION 'Distinct actors required'; END IF;
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND scope_key='cirrusatlantic' AND status='active';
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'studio.business_partner_definition.%' AND status='published')<>3 THEN RAISE EXCEPTION 'Definition permission catalog incomplete'; END IF;

 INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
 VALUES(t,'qa.studio.catl.definition-author','CirrusAtlantic QA author','Read and author definitions at exact tenant scope','system','seed',ref,'{"environment":"qa","purpose":"separate-publication-actors"}','draft',actor)
 ON CONFLICT(tenant_id,code) DO NOTHING;
 SELECT id INTO STRICT author_role FROM authz.role WHERE tenant_id=t AND code='qa.studio.catl.definition-author' AND source_ref=ref;
 IF EXISTS(SELECT 1 FROM authz.role WHERE id=author_role AND status='draft') THEN
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
  SELECT t,author_role,id,actor FROM authz.permission WHERE canonical_code IN('studio.business_partner_definition.read','studio.business_partner_definition.author');
  UPDATE authz.role SET status='active',updated_by=actor WHERE id=author_role;
 END IF;
 INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
 VALUES(t,'qa.studio.catl.definition-reviewer','CirrusAtlantic QA reviewer','Read and independently approve definitions at exact tenant scope','system','seed',ref,'{"environment":"qa","purpose":"separate-publication-actors"}','draft',actor)
 ON CONFLICT(tenant_id,code) DO NOTHING;
 SELECT id INTO STRICT reviewer_role FROM authz.role WHERE tenant_id=t AND code='qa.studio.catl.definition-reviewer' AND source_ref=ref;
 IF EXISTS(SELECT 1 FROM authz.role WHERE id=reviewer_role AND status='draft') THEN
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
  SELECT t,reviewer_role,id,actor FROM authz.permission WHERE canonical_code IN('studio.business_partner_definition.read','studio.business_partner_definition.publish');
  UPDATE authz.role SET status='active',updated_by=actor WHERE id=reviewer_role;
 END IF;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by)
 VALUES(t,'qa.studio.catl.definition-reviewer','CirrusAtlantic definition reviewer','system','seed',ref,'{"environment":"qa"}','active',actor)
 ON CONFLICT(tenant_id,code) DO NOTHING;
 SELECT id INTO STRICT owner_group FROM authz.principal_group WHERE tenant_id=t AND code='qa.studio.catl.definition-reviewer' AND source_ref=ref;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
 SELECT t,owner_group,owner_id,'seed',ref,'active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=t AND group_id=owner_group AND principal_id=owner_id AND status='active');
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by)
 VALUES(t,'qa.studio.catl.definition-author','CirrusAtlantic QA definition author','system','seed',ref,'{"environment":"qa"}','active',actor)
 ON CONFLICT(tenant_id,code) DO NOTHING;
 SELECT id INTO STRICT admin_group FROM authz.principal_group WHERE tenant_id=t AND code='qa.studio.catl.definition-author' AND source_ref=ref;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
 SELECT t,admin_group,admin_id,'seed',ref,'active',actor WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=t AND group_id=admin_group AND principal_id=admin_id AND status='active');
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
 SELECT t,g,r,scope_id,'exact','seed',ref,'active',actor FROM (VALUES(admin_group,author_role),(owner_group,reviewer_role)) desired(g,r)
 WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=t AND group_id=g AND role_id=r AND scope_target_id=scope_id AND status='active');
END $$;
CREATE TEMP VIEW actual_definition_grants AS
 SELECT DISTINCT p.code,p.id principal_id,pe.canonical_code,s.scope_kind,s.scope_key,gr.propagation_mode
 FROM master.principal p
 JOIN authz.group_member gm ON gm.tenant_id=p.tenant_id AND gm.principal_id=p.id AND gm.status='active'
 JOIN authz.principal_group g ON g.tenant_id=p.tenant_id AND g.id=gm.group_id AND g.status='active'
 JOIN authz.group_role gr ON gr.tenant_id=p.tenant_id AND gr.group_id=g.id AND gr.status='active'
 JOIN authz.role r ON r.tenant_id=p.tenant_id AND r.id=gr.role_id AND r.status='active'
 JOIN authz.role_permission rp ON rp.tenant_id=p.tenant_id AND rp.role_id=r.id
 JOIN authz.permission pe ON pe.id=rp.permission_id AND pe.status='published'
 JOIN authz.scope_target s ON s.tenant_id=p.tenant_id AND s.id=gr.scope_target_id AND s.status='active'
 WHERE p.tenant_id='44444444-4444-4444-8444-444444444444' AND p.code IN('catl.admin','catl.owner')
 AND pe.canonical_code LIKE 'studio.business_partner_definition.%';
DO $$ BEGIN
 IF (SELECT count(*) FROM actual_definition_grants)<>4
 OR EXISTS(SELECT 1 FROM actual_definition_grants WHERE scope_kind<>'tenant' OR scope_key<>'cirrusatlantic' OR propagation_mode<>'exact'
 OR (code='catl.admin' AND canonical_code='studio.business_partner_definition.publish')
 OR (code='catl.owner' AND canonical_code='studio.business_partner_definition.author')) THEN
 RAISE EXCEPTION 'Publication role separation verification failed'; END IF;
END $$;
SELECT jsonb_build_object('schema','athyper.local-publication-authority-provisioning/1','environment','qa','database',current_database(),'observedAt',clock_timestamp(),'executionIdentity',current_user,'nativeApproval',false,'grants',jsonb_agg(to_jsonb(g) ORDER BY code,canonical_code)) FROM actual_definition_grants g;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
