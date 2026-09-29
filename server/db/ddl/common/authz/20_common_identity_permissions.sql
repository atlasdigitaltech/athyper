-- Exact capability catalog; no role grants, entity write permissions or activation.
-- UUIDv5: namespace UUIDv5(DNS, athyper.authorization.catalog.v2), name = code.
-- Self-edit permissions do not grant cross-owner access; administer is separate.
-- Runtime parent, tenant, plane and field admission remain mandatory.
DO $$
DECLARE
  permission record;
  v_module_id uuid;
BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common identity catalog requires an exact local plane';
  END IF;
  SELECT id INTO STRICT v_module_id FROM control.module WHERE code='fnd' AND status='active';
  FOR permission IN SELECT * FROM (VALUES
    ('97e9de3d-36e7-5917-bc9b-614bdc681c49'::uuid,'common.identity.principal.read','low'),
    ('52ba2285-9bed-5ad6-a9bb-05e5798f9f06'::uuid,'common.identity.principal_profile.read','low'),
    ('76df2a11-bfef-54cb-8ee0-8a50853d1e8c'::uuid,'common.identity.principal_profile.edit','medium'),
    ('32e58242-82cb-5dee-8aa8-3758b66bb8d6'::uuid,'common.identity.principal_notification_preference.read','low'),
    ('9d6eb3ab-e6f0-5008-ad01-9a146eda365f'::uuid,'common.identity.principal_notification_preference.edit','medium'),
    ('cea6db1a-4c78-5a69-8340-b9e065b0da17'::uuid,'common.identity.principal.administer','high')
  ) AS expected(id,code,risk)
  LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
      requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(permission.id,permission.code,'capability',v_module_id,permission.risk::authz.risk_tier_d,
      false,false,false,false,false,
      '{"namespace":"common","capability":"tenant_local_identity","_seed":{"pack":"common.identity-permissions","version":"1.0.0"}}'::jsonb,
      'published','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(canonical_code) DO NOTHING;
    INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
    VALUES(permission.id,'tenant','exact','active','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM authz.permission p
      WHERE p.id=permission.id AND p.canonical_code=permission.code AND p.module_id=v_module_id
        AND p.permission_kind='capability' AND p.status='published' AND p.risk_tier::text=permission.risk
        AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable
        AND NOT p.is_delegable AND NOT p.is_overridable)
      OR (SELECT count(*) FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id AND s.status='active')<>1
      OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id
        AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active') THEN
      RAISE EXCEPTION 'Common identity catalog conflict: %',permission.code;
    END IF;
  END LOOP;
END $$;
