-- Explicit DEV test grant: CATL admin, Restrictions read only, seven days.
-- Idempotent repeats never extend the expiry or change an existing role.
BEGIN;
DO $$
DECLARE t uuid; actor uuid; admin_id uuid; target uuid; rid uuid; gid uuid; permission uuid;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon DEV required'; END IF;
 SELECT id INTO STRICT t FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner';
 SELECT id INTO STRICT admin_id FROM master.principal WHERE tenant_id=t AND code='catl.admin' AND status='active';
 PERFORM set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',actor::text,true);
 SELECT id INTO STRICT target FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND target_id=t AND status='active';
 INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
 SELECT 'f289b345-8a8b-40ef-8a6b-3aa821320e59'::uuid,'neon.relationship.business_partner_restriction.read','entity_operation',id,'medium',false,false,false,false,false,
 '{"_seed":{"pack":"neon.partner-decision-views","version":"1.0.0"}}'::jsonb,'published',actor FROM control.module WHERE code='fnd' AND status='active'
 ON CONFLICT(canonical_code) DO NOTHING;
 SELECT id INTO STRICT permission FROM authz.permission WHERE canonical_code='neon.relationship.business_partner_restriction.read' AND status='published';
 INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
 SELECT id,'tenant','exact','active',actor FROM authz.permission
 WHERE canonical_code IN ('neon.relationship.business_partner_qualification.read','neon.relationship.business_partner_restriction.read')
 ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
 SELECT id INTO rid FROM authz.role WHERE tenant_id=t AND code='dev.bp.restriction.read.catl.admin';
 IF rid IS NULL THEN
  INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
  VALUES(t,'dev.bp.restriction.read.catl.admin','CATL admin restriction read test','custom','manual','approved-decision-view-test','draft',actor) RETURNING id INTO rid;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,rid,permission,actor);
  UPDATE authz.role SET status='active',updated_by=actor WHERE id=rid AND tenant_id=t;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
  VALUES(t,'dev.bp.restriction.read.catl.admin','CATL admin restriction read test','custom','manual','approved-decision-view-test','active',actor) RETURNING id INTO gid;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,created_by)
  VALUES(t,gid,admin_id,'manual','approved-decision-view-test','active',now()+interval '7 days',actor);
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,created_by)
  VALUES(t,gid,rid,target,'exact','manual','approved-decision-view-test','active',now()+interval '7 days',actor);
 END IF;
 IF (SELECT count(*) FROM authz.role_permission WHERE tenant_id=t AND role_id=rid)<>1
 OR NOT EXISTS(SELECT 1 FROM authz.role_permission WHERE tenant_id=t AND role_id=rid AND permission_id=permission)
 THEN RAISE EXCEPTION 'Unexpected test role permissions; refusing changes'; END IF;
END $$;
COMMIT;
