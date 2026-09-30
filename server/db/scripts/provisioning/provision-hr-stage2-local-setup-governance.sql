-- Synthetic Stage 0 tenant only: maker and independent reviewer for setup publication.
BEGIN;
DO $setup_access$
DECLARE
 t uuid:='11111111-1111-4111-8111-111111111111'; a uuid:='d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c'; c uuid:='7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7';
 maker uuid; reviewer uuid; tenant_scope uuid; company_scope uuid; legal_scope uuid; v_role uuid; v_code text; v_group uuid; v_scope uuid; v_permission text;
BEGIN
 SELECT id INTO maker FROM authz.principal_group WHERE tenant_id=t AND code='local.athyper.admin.full-access';
 SELECT id INTO reviewer FROM authz.principal_group WHERE tenant_id=t AND code='local.hr.stage2.reviewers';
 SELECT id INTO tenant_scope FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND target_id=t;
 SELECT id INTO company_scope FROM authz.scope_target WHERE tenant_id=t AND scope_kind='company_code' AND target_id=c;
 SELECT id INTO legal_scope FROM authz.scope_target WHERE tenant_id=t AND scope_kind='legal_entity' AND target_id='a42d1e81-7e5d-5ecd-9294-d14b90a6b26f'::uuid;
 IF maker IS NULL OR reviewer IS NULL OR tenant_scope IS NULL OR company_scope IS NULL OR legal_scope IS NULL THEN RAISE EXCEPTION 'Synthetic Stage 2 authorization fixture missing'; END IF;
 FOREACH v_code IN ARRAY ARRAY['local.hr.setup.catalog.writer','local.hr.setup.catalog.publisher','local.hr.setup.company.publisher','local.hr.setup.company.reader','local.hr.setup.policy.simulator','local.hr.stage2.iam.retry'] LOOP
  v_group:=CASE WHEN v_code IN('local.hr.setup.catalog.writer','local.hr.setup.policy.simulator','local.hr.stage2.iam.retry') THEN maker ELSE reviewer END;
  v_scope:=CASE WHEN v_code='local.hr.stage2.iam.retry' THEN legal_scope WHEN v_code IN('local.hr.setup.company.publisher','local.hr.setup.company.reader') THEN company_scope ELSE tenant_scope END;
  v_permission:=CASE v_code WHEN 'local.hr.setup.catalog.writer' THEN 'neon.hr.setup.catalog.write' WHEN 'local.hr.setup.catalog.publisher' THEN 'neon.hr.setup.catalog.publish' WHEN 'local.hr.setup.company.reader' THEN 'neon.hr.setup.read' WHEN 'local.hr.setup.policy.simulator' THEN 'neon.policy.simulate' WHEN 'local.hr.stage2.iam.retry' THEN 'neon.workforce.iam.retry' ELSE 'neon.hr.setup.publish' END;
  SELECT id INTO v_role FROM authz.role WHERE tenant_id=t AND code=v_code;
  IF v_role IS NULL THEN
   INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
   VALUES(t,v_code,v_code,'managed','seed','local-hr-stage2:setup-v1','draft',a) RETURNING id INTO v_role;
  END IF;
  IF EXISTS(SELECT 1 FROM authz.role WHERE id=v_role AND status='draft') THEN
   INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
   SELECT t,v_role,id,a FROM authz.permission WHERE canonical_code=v_permission
   ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING;
   UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=a WHERE id=v_role;
  END IF;
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,status,created_by)
  SELECT t,v_group,v_role,v_scope,'exact','seed','active',a
  WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=t AND group_id=v_group AND role_id=v_role AND scope_target_id=v_scope AND status='active');
 END LOOP;
END $setup_access$;
COMMIT;
