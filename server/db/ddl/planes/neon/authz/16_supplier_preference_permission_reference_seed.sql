-- seed-contract-version: 1
-- seed-pack: neon.supplier-preference-permission
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"NEON governed supplier preference contract","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-28","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:1
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Supplier preference permission requires app.database_plane=neon';
  END IF;
END $guard$;

INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT 'b07a67cb-8bb7-5417-83a7-217eb7d2e13d'::uuid,
       'neon.supplier.preference.admin','entity_operation',module.id,'high',true,true,
       false,false,false,
       '{"_seed":{"pack":"neon.supplier-preference-permission","version":"1.0.0"}}'::jsonb,
       'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO UPDATE SET
  risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,
  metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission WHERE canonical_code='neon.supplier.preference.admin'
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code='neon.supplier.preference.admin' AND status='published') <> 1 THEN
    RAISE EXCEPTION 'Supplier preference permission count mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM authz.permission permission JOIN authz.permission_scope_kind scope ON scope.permission_id=permission.id WHERE permission.canonical_code='neon.supplier.preference.admin' AND scope.scope_kind='operating_organization' AND scope.propagation_mode='subtree' AND scope.status='active') THEN
    RAISE EXCEPTION 'Supplier preference permission scope mismatch';
  END IF;
END $assertions$;
