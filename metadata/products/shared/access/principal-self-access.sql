-- Principal onboarding grant recipe. Run through the authenticated provisioning
-- connection after tenants, memberships and the identity permission catalog exist.
-- All five permissions remain subject to owner RLS. Administer is never default.
DO $$
DECLARE t record; r uuid; g uuid; scope uuid; actor uuid; permission_ids uuid[];
  source constant text:='entity-onboarding:principal-self:v1';
BEGIN
 IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN RAISE EXCEPTION 'Exact plane required'; END IF;
 SELECT array_agg(id ORDER BY canonical_code) INTO permission_ids FROM authz.permission WHERE status='published' AND canonical_code IN (
  'common.identity.principal.read','common.identity.principal_profile.read','common.identity.principal_profile.edit',
  'common.identity.principal_notification_preference.read','common.identity.principal_notification_preference.edit');
 IF cardinality(permission_ids) IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'Identity catalog required'; END IF;
 FOR t IN SELECT tenant.id,tenant.code,tenant.created_by FROM master.tenant tenant WHERE tenant.status='active' AND EXISTS(SELECT 1 FROM master.principal p JOIN authz.plane_membership m ON m.tenant_id=p.tenant_id AND m.principal_id=p.id WHERE p.tenant_id=tenant.id AND p.principal_type='user' AND m.status='active') LOOP
  SELECT id INTO actor FROM master.principal WHERE tenant_id=t.id AND status='active' AND code='seed.three-plane-provisioner';
  IF actor IS NULL THEN RAISE EXCEPTION 'Tenant provisioning actor required for %',t.code; END IF;
  PERFORM set_config('app.current_tenant_id',t.id::text,true);
  PERFORM set_config('app.current_principal_id',actor::text,true);
  SELECT id INTO scope FROM authz.scope_target WHERE tenant_id=t.id AND scope_kind='tenant' AND target_id=t.id AND status='active';
  IF scope IS NULL THEN CONTINUE; END IF;
  SELECT id INTO r FROM authz.role WHERE tenant_id=t.id AND code='entity.principal.self';
  IF r IS NULL THEN
   INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,status,created_by)
   VALUES(t.id,'entity.principal.self','My principal profile','Read own identity; edit own profile and notifications.','system','seed',source,'draft',actor) RETURNING id INTO r;
   INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t.id,r,p,actor FROM unnest(permission_ids) p;
   UPDATE authz.role SET status='active',updated_by=actor WHERE id=r;
  ELSIF NOT EXISTS(SELECT 1 FROM authz.role WHERE id=r AND source_ref=source) OR
    (SELECT array_agg(permission_id ORDER BY permission_id) FROM authz.role_permission WHERE role_id=r) IS DISTINCT FROM (SELECT array_agg(p ORDER BY p) FROM unnest(permission_ids) p) THEN
    RAISE EXCEPTION 'Principal self role conflicts with onboarding recipe';
  END IF;
  SELECT id INTO g FROM authz.principal_group WHERE tenant_id=t.id AND code='entity.principal.self';
  IF g IS NULL THEN
   INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by)
   VALUES(t.id,'entity.principal.self','Principal self service','system','seed',source,'{"entityFrameworkDefaultAccess":true}','active',actor) RETURNING id INTO g;
   INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
   VALUES(t.id,g,r,scope,'exact','seed',source,'active',actor);
  ELSIF NOT EXISTS(SELECT 1 FROM authz.principal_group WHERE id=g AND source_ref=source AND metadata->>'entityFrameworkDefaultAccess'='true') THEN
   RAISE EXCEPTION 'Principal self group conflicts with onboarding recipe';
  END IF;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
   SELECT DISTINCT t.id,g,p.id,'seed',source,'active',actor FROM master.principal p JOIN authz.plane_membership m ON m.tenant_id=p.tenant_id AND m.principal_id=p.id
   WHERE p.tenant_id=t.id AND p.principal_type='user' AND p.status='active' AND m.status='active'
    AND NOT EXISTS(SELECT 1 FROM authz.group_member existing WHERE existing.tenant_id=t.id AND existing.group_id=g AND existing.principal_id=p.id);
 END LOOP;
END $$;
