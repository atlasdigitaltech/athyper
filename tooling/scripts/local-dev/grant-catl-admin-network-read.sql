-- CATL admin only: seven-day, exact-tenant, read-only test grant.
-- Caller wraps this file and the clean-install permission overlay in one transaction.
DO $$
DECLARE t uuid; actor uuid; admin_id uuid; target uuid; rid uuid; gid uuid; permission uuid;
 ref constant text := 'approved-catl-admin-network-read-20260925';
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon DEV required'; END IF;
 SELECT id INTO STRICT t FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 SELECT id INTO STRICT admin_id FROM master.principal WHERE tenant_id=t AND code='catl.admin' AND status='active';
 PERFORM set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',actor::text,true);
 SELECT id INTO STRICT target FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND target_id=t AND status='active';
 SELECT id INTO STRICT permission FROM authz.permission WHERE canonical_code='neon.relationship.bp_target.network_read' AND status='published' AND permission_kind='entity_operation' AND risk_tier='low' AND NOT requires_mfa AND NOT requires_sod;
 SELECT id INTO rid FROM authz.role WHERE tenant_id=t AND code='dev.bp.network.read.catl.admin';
 IF rid IS NULL THEN
  INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
  VALUES(t,'dev.bp.network.read.catl.admin','CATL admin network read test','custom','manual',ref,'draft',actor) RETURNING id INTO rid;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,rid,permission,actor);
  UPDATE authz.role SET status='active',updated_by=actor WHERE id=rid AND tenant_id=t;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
  VALUES(t,'dev.bp.network.read.catl.admin','CATL admin network read test','custom','manual',ref,'active',actor) RETURNING id INTO gid;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,created_by)
  VALUES(t,gid,admin_id,'manual',ref,'active',now()+interval '7 days',actor);
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,created_by)
  VALUES(t,gid,rid,target,'exact','manual',ref,'active',now()+interval '7 days',actor);
 END IF;
 IF (SELECT count(*) FROM authz.role_permission WHERE tenant_id=t AND role_id=rid)<>1
 OR NOT EXISTS(SELECT 1 FROM authz.role_permission WHERE tenant_id=t AND role_id=rid AND permission_id=permission)
 THEN RAISE EXCEPTION 'Unexpected role permissions'; END IF;
 -- Replays validate instead of extending access or touching unrelated grants.
 IF NOT EXISTS(SELECT 1 FROM authz.principal_group g JOIN authz.group_member gm ON gm.group_id=g.id AND gm.tenant_id=t
 JOIN authz.group_role gr ON gr.group_id=g.id AND gr.tenant_id=t
 WHERE g.tenant_id=t AND g.code='dev.bp.network.read.catl.admin' AND g.source_ref=ref
 AND gm.principal_id=admin_id AND gm.status='active' AND gm.effective_until>now()
 AND gr.role_id=rid AND gr.scope_target_id=target AND gr.propagation_mode='exact' AND gr.status='active' AND gr.effective_until>now())
 THEN RAISE EXCEPTION 'Expected grant absent or expired'; END IF;
END $$;
