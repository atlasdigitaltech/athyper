-- seed-contract-version: 1
-- seed-pack: neon.business-partner-list-permission-overlay
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Neon business-partner list authorization contract","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-26","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper-permission-code
-- seed-expected-row-count: 1
-- seed-assertions: expected-count,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: semantic

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Business-partner list permission overlay requires app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module module WHERE module.code='fnd' AND module.status='active') THEN
    RAISE EXCEPTION 'Business-partner list permission overlay requires the active fnd module';
  END IF;
END
$guard$;

INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT
  '04a1f105-978d-5906-b6df-0e7eb5c938bd'::uuid,
  'neon.relationship.business_partner.read',
  'entity_operation',
  module.id,
  'low',
  false,false,false,false,false,
  '{"_seed":{"pack":"neon.business-partner-list-permission-overlay","version":"1.0.0"}}'::jsonb,
  'published',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module
WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind (
  permission_id,scope_kind,propagation_mode,status,created_by
)
SELECT
  permission.id,
  'operating_organization',
  'subtree',
  'active',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code='neon.relationship.business_partner.read'
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $assertions$
BEGIN
  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
    WHERE permission.canonical_code='neon.relationship.business_partner.read'
      AND permission.permission_kind='entity_operation'
      AND permission.status='published'
      AND compatibility.scope_kind='operating_organization'
      AND compatibility.propagation_mode='subtree'
      AND compatibility.status='active'
  ) <> 1 THEN
    RAISE EXCEPTION 'Business-partner list permission overlay mismatch';
  END IF;
END
$assertions$;
