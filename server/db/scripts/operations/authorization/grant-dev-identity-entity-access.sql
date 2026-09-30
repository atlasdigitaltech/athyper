-- Explicit DEV onboarding grants for the existing full-admin roles. Does not
-- create roles, memberships, publication authority, or cross-tenant scope.
DO $$
DECLARE r record; permission uuid; permissions uuid[]; role_count integer:=0; actor uuid;
BEGIN
 IF current_database()<>'athyper_'||current_setting('app.database_plane') OR current_setting('app.database_plane') NOT IN ('studio','neon','mesh') THEN RAISE EXCEPTION 'Exact DEV plane required'; END IF;
 SELECT array_agg(id ORDER BY canonical_code) INTO permissions FROM authz.permission WHERE status='published' AND canonical_code IN (
  'common.identity.principal.read','common.identity.principal_profile.read','common.identity.principal_profile.edit',
  'common.identity.principal_notification_preference.read','common.identity.principal_notification_preference.edit','common.identity.principal.administer');
 IF cardinality(permissions) IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'Identity catalog required'; END IF;
 FOR r IN SELECT role.id,role.tenant_id FROM authz.role role JOIN master.tenant tenant ON tenant.id=role.tenant_id
   WHERE role.code='test.full_admin' AND role.source_ref='dev:test-full-admin:v1' AND role.status='active'
     AND tenant.code IN ('athyper','cirrusatlantic') FOR UPDATE OF role LOOP
   role_count:=role_count+1;
   SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=r.tenant_id AND code='seed.three-plane-provisioner' AND status='active';
   PERFORM set_config('app.current_tenant_id',r.tenant_id::text,true);
   PERFORM set_config('app.current_principal_id',actor::text,true);
   FOREACH permission IN ARRAY permissions LOOP
     IF EXISTS(SELECT 1 FROM authz.group_role g WHERE g.role_id=r.id AND g.status='active'
       AND NOT authz.fn_internal_permission_is_assignable_at_scope(permission,r.tenant_id,g.scope_target_id,g.propagation_mode)) THEN RAISE EXCEPTION 'Admin role scope is incompatible'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM unnest(permissions) p WHERE NOT EXISTS(SELECT 1 FROM authz.role_permission rp WHERE rp.tenant_id=r.tenant_id AND rp.role_id=r.id AND rp.permission_id=p)) THEN
     UPDATE authz.role SET status='suspended',updated_by=actor WHERE id=r.id AND tenant_id=r.tenant_id;
     INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
       SELECT r.tenant_id,r.id,p,actor FROM unnest(permissions) p ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING;
     UPDATE authz.role SET status='active',updated_by=actor WHERE id=r.id AND tenant_id=r.tenant_id;
   END IF;
 END LOOP;
 IF role_count<>2 THEN RAISE EXCEPTION 'Expected the two existing DEV full-admin roles'; END IF;
END $$;
