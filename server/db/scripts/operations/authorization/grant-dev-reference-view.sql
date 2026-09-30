-- Execute only through an authenticated DEV maintenance connection, inside a
-- transaction after 20260926_common_reference_permission.sql. No wildcard grants.
DO $$
DECLARE r record; permission_uuid uuid; role_count integer := 0;
BEGIN
  IF current_database() <> 'athyper_'||current_setting('app.database_plane')
     OR current_setting('app.database_plane') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Exact DEV plane coordinate required';
  END IF;
  SELECT id INTO STRICT permission_uuid FROM authz.permission
    WHERE canonical_code='common.platform.reference.view' AND status='published' AND permission_kind='capability';
  FOR r IN SELECT role.id,role.tenant_id,role.created_by FROM authz.role role
    JOIN master.tenant tenant ON tenant.id=role.tenant_id
    WHERE role.code='test.full_admin' AND role.source_ref='dev:test-full-admin:v1'
      AND role.status='active' AND tenant.code IN ('athyper','cirrusatlantic')
    FOR UPDATE OF role LOOP
    role_count := role_count+1;
    PERFORM set_config('app.current_tenant_id',r.tenant_id::text,true);
    PERFORM set_config('app.current_principal_id',r.created_by::text,true);
    IF EXISTS (SELECT 1 FROM authz.group_role gr WHERE gr.role_id=r.id AND gr.tenant_id=r.tenant_id
      AND gr.status='active' AND NOT authz.fn_internal_permission_is_assignable_at_scope(permission_uuid,r.tenant_id,gr.scope_target_id,gr.propagation_mode)) THEN
      RAISE EXCEPTION 'Reference permission is incompatible with an existing role assignment';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM authz.role_permission WHERE tenant_id=r.tenant_id AND role_id=r.id AND permission_id=permission_uuid) THEN
      UPDATE authz.role SET status='suspended',updated_by=r.created_by WHERE tenant_id=r.tenant_id AND id=r.id;
      INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
        VALUES(r.tenant_id,r.id,permission_uuid,r.created_by);
      UPDATE authz.role SET status='active',updated_by=r.created_by WHERE tenant_id=r.tenant_id AND id=r.id;
    END IF;
  END LOOP;
  IF role_count<>2 THEN RAISE EXCEPTION 'Expected the two approved DEV test-admin roles'; END IF;
END $$;
