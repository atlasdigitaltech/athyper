-- Minimal DDL-native Mesh login, scope-selection and exchange fixture.
DO $mesh_fixture$
DECLARE
  v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  PERFORM set_config('app.current_principal_id', v_su::text, true);
  PERFORM set_config('app.database_plane', 'mesh', true);

  INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, canonical_party_id, status, metadata, created_by
  ) VALUES
    ('11111111-1111-4111-8111-111111111111', 'athyper', 'Athyper Group',
     'Athyper Group', 'athyper', md5('athyper:canonical-party:athyper-group')::uuid, 'active',
     '{"keycloak_organization_alias":"11111111-1111-4111-8111-111111111111"}', v_su),
    ('33333333-3333-4333-8333-333333333333', 'nimubus', 'Nimubus Solutions',
     'Nimubus Solutions', 'athyper', md5('athyper:canonical-party:nimubus')::uuid, 'active',
     '{"keycloak_organization_alias":"33333333-3333-4333-8333-333333333333"}', v_su)
  ON CONFLICT (id) DO UPDATE SET
    name=excluded.name, display_name=excluded.display_name,
    canonical_party_id=excluded.canonical_party_id,
    status=excluded.status, metadata=excluded.metadata,
    updated_at=now(), updated_by=v_su;

  INSERT INTO master.principal (
    id, tenant_id, code, name, principal_type, provisioning_source,
    status, metadata, created_by
  ) VALUES
    ('aa010107-0000-0000-0000-000000000000',
     '11111111-1111-4111-8111-111111111111', 'athq.admin', 'ATHQ Admin',
     'user', 'sync', 'active', '{"seed":"mesh-native"}', v_su),
    ('ee001000-0000-0000-0000-000000000011',
     '33333333-3333-4333-8333-333333333333', 'nim.owner', 'Nimubus Owner',
     'user', 'sync', 'active', '{"seed":"mesh-native"}', v_su)
  ON CONFLICT (tenant_id, code) DO UPDATE SET
    name=excluded.name, status=excluded.status, metadata=excluded.metadata,
    updated_at=now(), updated_by=v_su;

  INSERT INTO master.principal_identity_binding (
    tenant_id, principal_id, provider_code, realm_key, subject_id, username,
    status, last_verified_at, synced_at, sync_status, provider_attributes,
    created_by
  )
  SELECT principal.tenant_id, principal.id, 'keycloak', 'athyper',
         principal.id::text, principal.code, 'active', now(), now(), 'synced',
         '{"seed":"mesh-native"}'::jsonb, v_su
    FROM master.principal principal
   WHERE principal.id IN (
     'aa010107-0000-0000-0000-000000000000',
     'ee001000-0000-0000-0000-000000000011'
   )
  ON CONFLICT (tenant_id, provider_code, realm_key, subject_id) DO UPDATE SET
    username=excluded.username,
    status='active', last_verified_at=now(), synced_at=now(), sync_status='synced',
    updated_at=now(), updated_by=v_su
  WHERE master.principal_identity_binding.principal_id=excluded.principal_id;

  INSERT INTO mesh.network_account (
    id, tenant_id, canonical_party_id, account_purpose_code, account_code, display_name, legal_name, network_role,
    country_code, default_currency, capabilities, status, metadata, created_by
  ) VALUES
    ('a1111111-1111-4111-8111-111111111111',
     '11111111-1111-4111-8111-111111111111', md5('athyper:canonical-party:athyper-group')::uuid, 'primary', 'bna-1000000001',
     'Athyper Buyer', 'Athyper Group', 'buyer', 'MY', 'MYR',
     '{"documents":["purchase_order"]}', 'active', '{"seed":"mesh-native"}', v_su),
    ('b3333333-3333-4333-8333-333333333333',
     '33333333-3333-4333-8333-333333333333', md5('athyper:canonical-party:nimubus')::uuid, 'primary', 'bna-3000000001',
     'Nimubus Supplier', 'Nimubus Solutions', 'supplier', 'SG', 'SGD',
     '{"documents":["invoice"]}', 'active', '{"seed":"mesh-native"}', v_su)
  ON CONFLICT (id) DO UPDATE SET
    display_name=excluded.display_name, capabilities=excluded.capabilities,
    canonical_party_id=excluded.canonical_party_id,account_purpose_code=excluded.account_purpose_code,
    status=excluded.status, updated_at=now(), updated_by=v_su;

  INSERT INTO authz.scope_target (
    id, tenant_id, scope_kind, scope_key, target_id, display_name,
    status, metadata, created_by
  )
  SELECT md5(tenant.id::text || ':scope:tenant')::uuid, tenant.id,
         'tenant', tenant.id::text, tenant.id, tenant.display_name,
         'active', '{"seed":"mesh-native"}'::jsonb, v_su
    FROM master.tenant tenant
   WHERE tenant.id IN (
     '11111111-1111-4111-8111-111111111111',
     '33333333-3333-4333-8333-333333333333'
   )
  ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.scope_target (
    id, tenant_id, scope_kind, scope_key, target_id, parent_scope_target_id,
    display_name, status, metadata, created_by
  )
  SELECT md5(account.tenant_id::text || ':scope:network-account:' || account.id::text)::uuid,
         account.tenant_id, 'network_account', account.account_code, account.id,
         md5(account.tenant_id::text || ':scope:tenant')::uuid,
         account.display_name, 'active', '{"seed":"mesh-native"}'::jsonb, v_su
    FROM mesh.network_account account
   WHERE account.id IN (
     'a1111111-1111-4111-8111-111111111111',
     'b3333333-3333-4333-8333-333333333333'
   )
  ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.role (
    id, tenant_id, code, name, role_kind, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(tenant.id::text || ':role:network-operator')::uuid,
         tenant.id, 'mesh.network.operator', 'Mesh Network Operator',
         'system', 'seed', 'mesh-native:v1', 'draft',
         '{"seed":"mesh-native"}'::jsonb, v_su
    FROM master.tenant tenant
   WHERE tenant.id IN (
     '11111111-1111-4111-8111-111111111111',
     '33333333-3333-4333-8333-333333333333'
   )
  ON CONFLICT (id) DO UPDATE SET
    status='suspended', status_changed_at=now(), status_changed_by=v_su,
    updated_at=now(), updated_by=v_su;

  INSERT INTO authz.role_permission (id, tenant_id, role_id, permission_id, created_by)
  SELECT md5(role.id::text || ':' || permission.id::text)::uuid,
         role.tenant_id, role.id, permission.id, v_su
    FROM authz.role role
    CROSS JOIN authz.permission permission
   WHERE role.code='mesh.network.operator' AND permission.status='published'
  ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

  UPDATE authz.role SET status='active', status_changed_at=now(),
    status_changed_by=v_su, updated_at=now(), updated_by=v_su
  WHERE code='mesh.network.operator';

  INSERT INTO authz.principal_group (
    id, tenant_id, code, name, group_kind, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(tenant.id::text || ':group:network-operators')::uuid,
         tenant.id, 'mesh.network.operators', 'Mesh Network Operators',
         'system', 'seed', 'mesh-native:v1', 'active',
         '{"seed":"mesh-native"}'::jsonb, v_su
    FROM master.tenant tenant
   WHERE tenant.id IN (
     '11111111-1111-4111-8111-111111111111',
     '33333333-3333-4333-8333-333333333333'
   )
  ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.plane_membership (
    id, tenant_id, principal_id, membership_kind, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(principal.id::text || ':membership:mesh')::uuid,
         principal.tenant_id, principal.id, 'standard', 'seed', 'mesh-native:v1',
         'active', '{"seed":"mesh-native"}'::jsonb, v_su
    FROM master.principal principal
   WHERE principal.id IN (
     'aa010107-0000-0000-0000-000000000000',
     'ee001000-0000-0000-0000-000000000011'
   )
  ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.group_member (
    id, tenant_id, group_id, principal_id, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(principal.tenant_id::text || ':group-member:' || principal.id::text)::uuid,
         principal.tenant_id,
         md5(principal.tenant_id::text || ':group:network-operators')::uuid,
         principal.id, 'seed', 'mesh-native:v1', 'active',
         '{"seed":"mesh-native"}'::jsonb, v_su
    FROM master.principal principal
   WHERE principal.id IN (
     'aa010107-0000-0000-0000-000000000000',
     'ee001000-0000-0000-0000-000000000011'
   )
  ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO authz.group_role (
    id, tenant_id, group_id, role_id, scope_target_id, source_type, source_ref,
    status, metadata, created_by
  )
  SELECT md5(account.tenant_id::text || ':group-role:' || account.id::text)::uuid,
         account.tenant_id,
         md5(account.tenant_id::text || ':group:network-operators')::uuid,
         md5(account.tenant_id::text || ':role:network-operator')::uuid,
         md5(account.tenant_id::text || ':scope:network-account:' || account.id::text)::uuid,
         'seed', 'mesh-native:v1', 'active', '{"seed":"mesh-native"}'::jsonb, v_su
    FROM mesh.network_account account
   WHERE account.id IN (
     'a1111111-1111-4111-8111-111111111111',
     'b3333333-3333-4333-8333-333333333333'
   )
  ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now(), updated_by=v_su;

  INSERT INTO mesh.network_relationship (
    id, buyer_tenant_id, buyer_account_id, supplier_tenant_id,
    supplier_account_id, relationship_kind, effective_from, status,
    created_by_tenant_id, metadata, created_by
  ) VALUES (
    'c1234567-1234-4123-8123-123456789abc',
    '11111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'b3333333-3333-4333-8333-333333333333',
    'commercial', current_date, 'active',
    '11111111-1111-4111-8111-111111111111',
    '{"seed":"mesh-native"}',
    'aa010107-0000-0000-0000-000000000000'
  ) ON CONFLICT (id) DO UPDATE SET
    status='active', updated_at=now(), updated_by=v_su;
END $mesh_fixture$;
