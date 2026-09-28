-- Exact capability catalog; no role grants, entity write permissions or activation.
-- UUIDv5: namespace UUIDv5(DNS, athyper.authorization.catalog.v2), name = code.
-- Reads/downloads are low risk; tenant-local mutations are medium risk.
-- Runtime parent, audience, ownership and attachment admission remain mandatory.
DO $$
DECLARE
  permission record;
  v_module_id uuid;
BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common collaboration catalog requires an exact local plane';
  END IF;
  SELECT id INTO STRICT v_module_id FROM control.module WHERE code='fnd' AND status='active';
  FOR permission IN SELECT * FROM (VALUES
    ('e7a9f5c1-6d92-5450-81f4-379245d64581'::uuid,'common.collaboration.comment.read','low'),
    ('1c2106f2-733d-5628-a6e2-7c491b4820d2'::uuid,'common.collaboration.comment.create','medium'),
    ('22364ed8-391c-5181-a543-8fa38b4ad6c0'::uuid,'common.collaboration.comment.update_own','medium'),
    ('245ae0df-4e44-56d7-afdf-4cbc28b2e926'::uuid,'common.collaboration.comment.archive_own','medium'),
    ('008df3d6-6ceb-5d34-8d73-b5b834dd9055'::uuid,'common.collaboration.attachment.read','low'),
    ('9197c880-0c7a-5b13-9f0e-bb03e588f838'::uuid,'common.collaboration.attachment.create','medium'),
    ('39c8e490-114a-587c-a69d-a6005ce72b61'::uuid,'common.collaboration.attachment.finalize','medium'),
    ('78fe3ae8-a4ea-5b6c-9c64-998834eae3d3'::uuid,'common.collaboration.attachment.download','low'),
    ('af2160ba-1da3-559a-bfbd-d29e123b466c'::uuid,'common.collaboration.attachment.archive','medium')
  ) AS expected(id,code,risk)
  LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
      requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(permission.id,permission.code,'capability',v_module_id,permission.risk::authz.risk_tier_d,
      false,false,false,false,false,
      '{"namespace":"common","capability":"tenant_local_collaboration","_seed":{"pack":"common.collaboration-permissions","version":"1.0.0"}}'::jsonb,
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
      RAISE EXCEPTION 'Common collaboration catalog conflict: %',permission.code;
    END IF;
  END LOOP;
END $$;
