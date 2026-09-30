-- Local Stage 2 demo access. Run only against the existing Stage 0 synthetic tenant.
BEGIN;
DO $stage2_access$
DECLARE
  v_tenant uuid := '11111111-1111-4111-8111-111111111111';
  v_actor uuid := 'd4250b08-6e5e-5887-b4e1-6f3eb31d7c8c';
  v_company uuid := '7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7';
  v_group uuid;
  v_tenant_scope uuid;
  v_company_scope uuid;
  v_role uuid;
  v_code text;
BEGIN
  SELECT id INTO v_group FROM authz.principal_group WHERE tenant_id=v_tenant AND code='local.athyper.admin.full-access';
  SELECT id INTO v_tenant_scope FROM authz.scope_target WHERE tenant_id=v_tenant AND scope_kind='tenant' AND target_id=v_tenant;
  SELECT id INTO v_company_scope FROM authz.scope_target WHERE tenant_id=v_tenant AND scope_kind='company_code' AND target_id=v_company;
  IF v_group IS NULL OR v_tenant_scope IS NULL OR v_company_scope IS NULL THEN
    RAISE EXCEPTION 'Stage 0 tenant, admin group or company scope is missing';
  END IF;
  FOREACH v_code IN ARRAY ARRAY['local.hr.stage2.company','local.hr.stage2.tenant'] LOOP
    SELECT id INTO v_role FROM authz.role WHERE tenant_id=v_tenant AND code=v_code;
    IF v_role IS NULL THEN
      INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
      VALUES(v_tenant,v_code,v_code,'managed','seed','local-hr-stage2:v1','draft',v_actor) RETURNING id INTO v_role;
    END IF;
    IF EXISTS(SELECT 1 FROM authz.role WHERE id=v_role AND status='draft') THEN
      INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
      SELECT v_tenant,v_role,p.id,v_actor FROM authz.permission p
      WHERE p.canonical_code=ANY(CASE WHEN v_code='local.hr.stage2.company'
        THEN ARRAY['neon.hr.setup.read','neon.hr.setup.write']
        ELSE ARRAY['neon.user.directory.read','neon.user.profile.request'] END)
      ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING;
      UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=v_actor WHERE id=v_role;
    END IF;
    INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,status,created_by)
    SELECT v_tenant,v_group,v_role,
      CASE WHEN v_code='local.hr.stage2.company' THEN v_company_scope ELSE v_tenant_scope END,
      'exact','seed','active',v_actor
    WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=v_tenant AND group_id=v_group AND role_id=v_role
      AND scope_target_id=CASE WHEN v_code='local.hr.stage2.company' THEN v_company_scope ELSE v_tenant_scope END
      AND status='active');
  END LOOP;
END $stage2_access$;
COMMIT;
