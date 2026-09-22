-- Local synthetic tenant only. Two principals allow real separation of duties.
BEGIN;
DO $local_hr_review$
DECLARE
  v_tenant uuid := '11111111-1111-4111-8111-111111111111';
  v_admin uuid := 'd4250b08-6e5e-5887-b4e1-6f3eb31d7c8c';
  v_reviewer uuid := 'ff3d770b-fc3f-5b2c-a5c1-901954691ddf';
  v_company uuid := '7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7';
  v_admin_group uuid; v_review_group uuid; v_tenant_scope uuid; v_company_scope uuid;
  v_role uuid; v_code text; v_group uuid; v_scope uuid; v_permissions text[];
BEGIN
  SELECT id INTO v_admin_group FROM authz.principal_group WHERE tenant_id=v_tenant AND code='local.athyper.admin.full-access';
  SELECT id INTO v_tenant_scope FROM authz.scope_target WHERE tenant_id=v_tenant AND scope_kind='tenant' AND target_id=v_tenant;
  SELECT id INTO v_company_scope FROM authz.scope_target WHERE tenant_id=v_tenant AND scope_kind='company_code' AND target_id=v_company;
  IF v_admin_group IS NULL OR v_tenant_scope IS NULL OR v_company_scope IS NULL THEN RAISE EXCEPTION 'Stage 0 local authorization fixtures missing'; END IF;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
  VALUES(v_tenant,'local.hr.stage2.reviewers','Local HR Stage 2 reviewers','system','seed','local-hr-stage2:v2','active',v_admin)
  ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO v_review_group FROM authz.principal_group WHERE tenant_id=v_tenant AND code='local.hr.stage2.reviewers';
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,status,created_by)
  SELECT v_tenant,v_review_group,v_reviewer,'seed','active',v_admin
  WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=v_tenant AND group_id=v_review_group AND principal_id=v_reviewer AND status='active');
  FOREACH v_code IN ARRAY ARRAY['local.hr.stage2.admin.tenant','local.hr.stage2.admin.publisher','local.hr.stage2.reviewer.tenant','local.hr.stage2.reviewer.publisher'] LOOP
    v_group := CASE WHEN v_code LIKE '%.admin.%' THEN v_admin_group ELSE v_review_group END;
    v_scope := CASE WHEN v_code LIKE '%.publisher' THEN v_company_scope ELSE v_tenant_scope END;
    v_permissions := CASE
      WHEN v_code='local.hr.stage2.admin.tenant' THEN ARRAY['neon.hr.policy.country.write','neon.user.admin.write','neon.user.profile.review']
      WHEN v_code='local.hr.stage2.admin.publisher' THEN ARRAY['neon.hr.policy.publish']
      WHEN v_code='local.hr.stage2.reviewer.tenant' THEN ARRAY['neon.user.profile.review']
      ELSE ARRAY['neon.hr.policy.publish'] END;
    SELECT id INTO v_role FROM authz.role WHERE tenant_id=v_tenant AND code=v_code;
    IF v_role IS NULL THEN
      INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
      VALUES(v_tenant,v_code,v_code,'managed','seed','local-hr-stage2:v2','draft',v_admin) RETURNING id INTO v_role;
    END IF;
    IF EXISTS(SELECT 1 FROM authz.role WHERE id=v_role AND status='draft') THEN
      INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
      SELECT v_tenant,v_role,id,v_admin FROM authz.permission WHERE canonical_code=ANY(v_permissions)
      ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING;
      UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=v_admin WHERE id=v_role;
    END IF;
    INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,status,created_by)
    SELECT v_tenant,v_group,v_role,v_scope,'exact','seed','active',v_admin
    WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=v_tenant AND group_id=v_group AND role_id=v_role AND scope_target_id=v_scope AND status='active');
  END LOOP;
END $local_hr_review$;
COMMIT;
