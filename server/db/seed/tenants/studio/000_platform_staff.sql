-- DDL-native Admin tenant and exact Keycloak identities.
DO $platform_staff$
DECLARE
  v_su uuid := '00000000-0000-0000-0000-000000000000';
  v_tid uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  PERFORM set_config('app.current_tenant_id', v_tid::text, true);
  PERFORM set_config('app.current_principal_id', v_su::text, true);
  PERFORM set_config('app.database_plane', 'athyper', true);

  INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, status, metadata, created_by
  ) VALUES (
    v_tid, 'athyper', 'Athyper Platform', 'Athyper Platform', 'athyper',
    'active', '{"keycloak_organization_alias":"11111111-1111-4111-8111-111111111111"}', v_su
  )
  ON CONFLICT (id) DO UPDATE SET
    name=excluded.name, display_name=excluded.display_name,
    status=excluded.status, metadata=excluded.metadata,
    updated_at=now(), updated_by=v_su;

  INSERT INTO master.principal (
    id, tenant_id, code, name, principal_type, provisioning_source,
    status, metadata, created_by
  ) VALUES
    ('ff001000-0000-0000-0000-000000000001', v_tid, 'platform.owner',
     'Platform Owner', 'user', 'sync', 'active', '{"seed":"admin-native"}', v_su),
    ('ff001000-0000-0000-0000-000000000002', v_tid, 'platform.admin',
     'Platform Administrator', 'user', 'sync', 'active', '{"seed":"admin-native"}', v_su),
    ('ff001000-0000-0000-0000-000000000003', v_tid, 'support.agent',
     'Support Agent', 'support', 'sync', 'active', '{"seed":"admin-support"}', v_su)
  ON CONFLICT (tenant_id, code) DO UPDATE SET
    name=excluded.name, principal_type=excluded.principal_type,
    status=excluded.status, metadata=excluded.metadata,
    updated_at=now(), updated_by=v_su;

  INSERT INTO master.principal_profile (
    tenant_id, principal_id, given_name, family_name, display_name,
    attributes, created_by
  )
  SELECT v_tid, principal.id,
         split_part(principal.name, ' ', 1),
         nullif(substring(principal.name from position(' ' in principal.name) + 1), ''),
         principal.name, '{}'::jsonb, v_su
    FROM master.principal principal
   WHERE principal.tenant_id=v_tid
     AND principal.code IN ('platform.owner','platform.admin','support.agent')
  ON CONFLICT (tenant_id, principal_id) DO UPDATE SET
    display_name=excluded.display_name, updated_at=now(), updated_by=v_su;

  INSERT INTO master.principal_identity_binding (
    tenant_id, principal_id, provider_code, realm_key, subject_id, username,
    status, last_verified_at, synced_at, sync_status, provider_attributes,
    created_by
  )
  SELECT v_tid, principal.id, 'keycloak',
         CASE WHEN principal.code='support.agent' THEN 'platform-control' ELSE 'athyper' END,
         principal.id::text, principal.code, 'active', now(), now(), 'synced',
         jsonb_build_object('seed','admin-identity'), v_su
    FROM master.principal principal
   WHERE principal.tenant_id=v_tid
     AND principal.code IN ('platform.owner','platform.admin','support.agent')
  ON CONFLICT (tenant_id, provider_code, realm_key, subject_id) DO UPDATE SET
    username=excluded.username,
    status='active', last_verified_at=now(), synced_at=now(), sync_status='synced',
    updated_at=now(), updated_by=v_su
  WHERE master.principal_identity_binding.principal_id=excluded.principal_id;

  IF (SELECT count(*) FROM master.principal_identity_binding
       WHERE tenant_id=v_tid AND subject_id IN (
         'ff001000-0000-0000-0000-000000000001',
         'ff001000-0000-0000-0000-000000000002',
         'ff001000-0000-0000-0000-000000000003'
       )) <> 3 THEN
    RAISE EXCEPTION 'Admin identity coordinate conflict';
  END IF;
END $platform_staff$;
