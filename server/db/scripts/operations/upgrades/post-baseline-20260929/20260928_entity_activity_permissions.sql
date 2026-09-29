BEGIN;
-- Exact capability catalog; no role grants, entity write permissions or activation.
-- UUIDv5: namespace UUIDv5(DNS, athyper.authorization.catalog.v2), name = code.
-- Reads are low risk; tenant-local snapshot captures are medium risk.
-- Runtime parent, tenant, plane and field admission remain mandatory.
DO $$
DECLARE
  permission record;
  v_module_id uuid;
BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common activity catalog requires an exact local plane';
  END IF;
  SELECT id INTO STRICT v_module_id FROM control.module WHERE code='fnd' AND status='active';
  FOR permission IN SELECT * FROM (VALUES
    ('d4a9fbc9-f403-5bbf-9555-1fb0c89753f6'::uuid,'common.audit.event.query','low'),
    ('e3b84293-5258-5042-941a-8571880da107'::uuid,'common.records.snapshot.read','low'),
    ('dc23c75b-461c-5e25-a142-50d6134127b5'::uuid,'common.records.snapshot.capture','medium')
  ) AS expected(id,code,risk)
  LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
      requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(permission.id,permission.code,'capability',v_module_id,permission.risk::authz.risk_tier_d,
      false,false,false,false,false,
      '{"namespace":"common","capability":"tenant_local_activity","_seed":{"pack":"common.activity-permissions","version":"1.0.0"}}'::jsonb,
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
      RAISE EXCEPTION 'Common activity catalog conflict: %',permission.code;
    END IF;
  END LOOP;
END $$;
COMMIT;
