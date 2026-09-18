-- seed-contract-version: 1
-- seed-pack: neon.currency-reference-permission
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Neon Currency read contract","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-18","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Currency permission seed requires app.database_plane=neon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code = 'rel' AND status = 'active') THEN
    RAISE EXCEPTION 'Currency permission seed requires the active rel module';
  END IF;
END
$guard$;

INSERT INTO authz.permission (
  id, canonical_code, permission_kind, module_id, risk_tier,
  requires_mfa, requires_sod, is_shareable, is_delegable, is_overridable,
  metadata, status, created_by
)
SELECT
  'd2d82f25-5ea5-5acb-8d91-693e4e6e9cf6'::uuid,
  'neon.reference.currency.read',
  'entity_operation', module.id, 'low',
  false, false, false, false, false,
  '{"_seed":{"pack":"neon.currency-reference-permission","version":"1.0.0"}}'::jsonb,
  'published', '00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module
WHERE module.code = 'rel' AND module.status = 'active'
ON CONFLICT (canonical_code) DO UPDATE SET
  risk_tier = EXCLUDED.risk_tier,
  requires_mfa = EXCLUDED.requires_mfa,
  requires_sod = EXCLUDED.requires_sod,
  metadata = authz.permission.metadata || EXCLUDED.metadata,
  status = 'published'
WHERE (authz.permission.risk_tier, authz.permission.requires_mfa,
       authz.permission.requires_sod, authz.permission.status)
  IS DISTINCT FROM (EXCLUDED.risk_tier, EXCLUDED.requires_mfa,
                    EXCLUDED.requires_sod, EXCLUDED.status);

INSERT INTO authz.permission_scope_kind (
  permission_id, scope_kind, propagation_mode, status, created_by
)
SELECT id, 'tenant', 'exact', 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission
WHERE canonical_code = 'neon.reference.currency.read'
ON CONFLICT (permission_id, scope_kind, propagation_mode) DO UPDATE SET status = 'active'
WHERE authz.permission_scope_kind.status IS DISTINCT FROM EXCLUDED.status;

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code = 'neon.reference.currency.read' AND permission_kind = 'entity_operation' AND status = 'published') <> 1 THEN
    RAISE EXCEPTION 'Currency read permission mismatch';
  END IF;
  IF (SELECT count(*) FROM authz.permission permission JOIN authz.permission_scope_kind scope ON scope.permission_id = permission.id WHERE permission.canonical_code = 'neon.reference.currency.read' AND scope.scope_kind = 'tenant' AND scope.propagation_mode = 'exact' AND scope.status = 'active') <> 1 THEN
    RAISE EXCEPTION 'Currency read permission scope mismatch';
  END IF;
END
$assertions$;
