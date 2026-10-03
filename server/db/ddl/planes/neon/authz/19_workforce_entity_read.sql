-- Workforce Entity onboarding catalog. Definitions only; no role grants,
-- membership, table privileges, publication state or enforcement changes.
-- Exact tenant scope matches the independently approved platform Entity sources.
-- Standard Entity reads use exact metadata permissions without an MFA default.
-- UUIDv5: namespace UUIDv5(DNS, athyper.authorization.catalog.v2), name = code.
DO $$
DECLARE
  permission record;
  v_module_id uuid;
BEGIN
  IF current_database()<>'athyper_neon'
     OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' THEN
    RAISE EXCEPTION 'Workforce read catalog requires Neon';
  END IF;
  SELECT id INTO STRICT v_module_id FROM control.module WHERE code='fnd' AND status='active';
  FOR permission IN SELECT * FROM (VALUES
    ('c419be77-2067-5472-a4f6-b966f75d9f3d'::uuid,'neon.workforce.address.read'),
    ('e77ae60a-25f2-57ad-8f6b-91dc8a3d29cd'::uuid,'neon.workforce.employee.read'),
    ('d87ae277-ca75-5040-a567-7479c3dde2f3'::uuid,'neon.workforce.external_worker.read'),
    ('01abd0ed-bd7c-5e79-af7f-ac6ed940a3e4'::uuid,'neon.workforce.person.read'),
    ('7d7e0817-5628-5489-a6ae-5d60eddfa661'::uuid,'neon.workforce.person_address_use.read')
  ) AS expected(id,code)
  LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
      requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(permission.id,permission.code,'capability',v_module_id,'low',
      false,false,false,false,false,
      '{"namespace":"neon","capability":"tenant_workforce_entity_read","_seed":{"pack":"neon.workforce-entity-read","version":"1.0.0"}}'::jsonb,
      'published','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(canonical_code) DO NOTHING;
    INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
    VALUES(permission.id,'tenant','exact','active','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM authz.permission p
      WHERE p.id=permission.id AND p.canonical_code=permission.code AND p.module_id=v_module_id
        AND p.permission_kind='capability' AND p.status='published' AND p.risk_tier='low'
        AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable
        AND NOT p.is_delegable AND NOT p.is_overridable)
      OR (SELECT count(*) FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id AND s.status='active')<>1
      OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id
        AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active') THEN
      RAISE EXCEPTION 'Workforce read catalog conflict: %',permission.code;
    END IF;
  END LOOP;
END $$;
