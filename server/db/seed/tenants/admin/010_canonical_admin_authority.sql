-- DDL-native, plane-local Admin admission and authorization authority.
DO $canonical_admin_authority$
DECLARE
  v_su uuid := '00000000-0000-0000-0000-000000000000';
  v_tid uuid := '11111111-1111-4111-8111-111111111111';
  v_scope uuid := md5(v_tid::text || ':scope:tenant')::uuid;
  v_role uuid := md5(v_tid::text || ':role:platform-owner')::uuid;
  v_group uuid := md5(v_tid::text || ':group:platform-owners')::uuid;
BEGIN
  PERFORM set_config('app.current_tenant_id', v_tid::text, true);
  PERFORM set_config('app.current_principal_id', v_su::text, true);
  PERFORM set_config('app.database_plane', 'athyper', true);

  INSERT INTO authz.scope_target (
    id, tenant_id, scope_kind, scope_key, target_id, display_name,
    status, metadata, created_by
  ) VALUES (
    v_scope, v_tid, 'tenant', v_tid::text, v_tid, 'Admin tenant',
    'active', '{"seed":"admin-native"}', v_su
  ) ON CONFLICT (id) DO UPDATE SET
    status='active', display_name=excluded.display_name,
    updated_at=now(), updated_by=v_su;

  INSERT INTO authz.role (
    id, tenant_id, code, name, role_kind, source_type, source_ref,
    status, metadata, created_by
  ) VALUES (
    v_role, v_tid, 'admin.platform.owner', 'Platform Owner', 'system',
    'seed', 'admin-native:v1', 'draft', '{"seed":"admin-native"}', v_su
  ) ON CONFLICT (id) DO UPDATE SET
    status='suspended', status_changed_at=now(), status_changed_by=v_su,
    updated_at=now(), updated_by=v_su;

  INSERT INTO authz.role_permission (
    id, tenant_id, role_id, permission_id, created_by
  )
  SELECT md5(v_role::text || ':' || permission.id::text)::uuid,
         v_tid, v_role, permission.id, v_su
    FROM authz.permission permission
   WHERE permission.status='published'
  ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

  UPDATE authz.role SET status='active', status_changed_at=now(),
    status_changed_by=v_su, updated_at=now(), updated_by=v_su
  WHERE id=v_role;

  INSERT INTO authz.principal_group (
    id, tenant_id, code, name, group_kind, source_type, source_ref,
    status, metadata, created_by
  ) VALUES (
    v_group, v_tid, 'admin.platform.owners', 'Platform Owners', 'system',
    'seed', 'admin-native:v1', 'active', '{"seed":"admin-native"}', v_su
  ) ON CONFLICT (id) DO UPDATE SET
    status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.group_role (
    id, tenant_id, group_id, role_id, scope_target_id, source_type,
    source_ref, status, metadata, created_by
  ) VALUES (
    md5(v_group::text || ':' || v_role::text || ':' || v_scope::text)::uuid,
    v_tid, v_group, v_role, v_scope, 'seed', 'admin-native:v1', 'active',
    '{"seed":"admin-native"}', v_su
  ) ON CONFLICT (id) DO UPDATE SET
    status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.plane_membership (
    id, tenant_id, principal_id, membership_kind, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(principal.id::text || ':membership:admin')::uuid,
         v_tid, principal.id,
         CASE WHEN principal.principal_type='support' THEN 'support' ELSE 'standard' END,
         'seed', 'admin-native:v1', 'active', '{"seed":"admin-native"}', v_su
    FROM master.principal principal
   WHERE principal.tenant_id=v_tid
     AND principal.code IN ('platform.owner','platform.admin','support.agent')
  ON CONFLICT (id) DO UPDATE SET
    status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.group_member (
    id, tenant_id, group_id, principal_id, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(v_group::text || ':' || principal.id::text)::uuid,
         v_tid, v_group, principal.id, 'seed', 'admin-native:v1',
         'active', '{"seed":"admin-native"}', v_su
    FROM master.principal principal
   WHERE principal.tenant_id=v_tid
     AND principal.code IN ('platform.owner','platform.admin')
  ON CONFLICT (id) DO UPDATE SET
    status='active', updated_at=now(), updated_by=v_su;
END $canonical_admin_authority$;
