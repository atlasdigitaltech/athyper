-- seed-contract-version: 1
-- seed-pack: common.reference-view-permission
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Authorization Catalog v2 common reference capability","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-26","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- Catalog only. No role grants, memberships, SQL SELECT grants or activation.
DO $$ BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common reference permission requires an exact local plane';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN
    RAISE EXCEPTION 'Common reference permission requires the active fnd module';
  END IF;
END $$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
  requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT '51f45819-773a-566d-a4bc-69784c28afb2'::uuid,'common.platform.reference.view',
  'capability',module.id,'low',false,false,false,false,false,
  '{"namespace":"common","capability":"read_only_shared_reference","_seed":{"pack":"common.reference-view-permission","version":"1.0.0"}}'::jsonb,
  'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
VALUES ('51f45819-773a-566d-a4bc-69784c28afb2','tenant','exact','active','00000000-0000-0000-0000-000000000000')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM authz.permission p JOIN control.module m ON m.id=p.module_id
    WHERE p.id='51f45819-773a-566d-a4bc-69784c28afb2' AND p.canonical_code='common.platform.reference.view'
      AND p.permission_kind='capability' AND p.status='published' AND p.risk_tier='low'
      AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable
      AND NOT p.is_delegable AND NOT p.is_overridable AND m.code='fnd')
    OR (SELECT count(*) FROM authz.permission_scope_kind WHERE permission_id='51f45819-773a-566d-a4bc-69784c28afb2' AND status='active')<>1
    OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind WHERE permission_id='51f45819-773a-566d-a4bc-69784c28afb2' AND scope_kind='tenant' AND propagation_mode='exact' AND status='active') THEN
    RAISE EXCEPTION 'Common reference permission catalog conflict';
  END IF;
END $$;
