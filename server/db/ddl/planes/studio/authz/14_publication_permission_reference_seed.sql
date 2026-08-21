-- seed-contract-version: 1
-- seed-pack: studio.publication-permission-overlay
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Publication authority route contract","publisher":"Athyper","source_version":"phase9","retrieved_at":"2026-08-21","license":"internal"}
-- seed-plane: studio
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper-permission-code
-- seed-expected-row-count: 5
-- seed-assertions: expected-count,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: semantic

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'Publication permission overlay requires app.database_plane=studio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module module WHERE module.code='pub' AND module.status='active') THEN
    RAISE EXCEPTION 'Publication permission overlay requires the active pub module';
  END IF;
END
$guard$;

WITH desired(canonical_code,permission_kind,risk_tier,requires_mfa,requires_sod) AS (
  VALUES
    ('publication.release.view','capability','low',false,false),
    ('publication.deployment.view','capability','low',false,false),
    ('publication.release.publish','system_action','critical',true,true),
    ('publication.deployment.retry','system_action','high',false,false),
    ('publication.release.rollback','system_action','critical',true,true)
), publication_module AS (
  SELECT module.id
  FROM control.module module
  WHERE module.code='pub' AND module.status='active'
)
INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT
  md5('athyper:permission:' || desired.canonical_code)::uuid,
  desired.canonical_code,
  desired.permission_kind::authz.permission_kind_d,
  publication_module.id,
  desired.risk_tier::authz.risk_tier_d,
  desired.requires_mfa,
  desired.requires_sod,
  false,
  false,
  false,
  jsonb_build_object('_seed',jsonb_build_object(
    'pack','studio.publication-permission-overlay',
    'version','1.0.0'
  )),
  'published',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM desired
CROSS JOIN publication_module
ON CONFLICT (canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind (
  permission_id,scope_kind,propagation_mode,status,created_by
)
SELECT
  permission.id,
  'tenant'::authz.scope_kind_d,
  'exact'::authz.propagation_mode_d,
  'active',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.canonical_code IN (
  'publication.release.view',
  'publication.deployment.view',
  'publication.release.publish',
  'publication.deployment.retry',
  'publication.release.rollback'
)
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $assertions$
BEGIN
  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN control.module module ON module.id=permission.module_id
    WHERE module.code='pub'
      AND permission.status='published'
      AND (permission.canonical_code,permission.permission_kind,permission.risk_tier,permission.requires_mfa,permission.requires_sod)
          IN (
            ('publication.release.view','capability','low',false,false),
            ('publication.deployment.view','capability','low',false,false),
            ('publication.release.publish','system_action','critical',true,true),
            ('publication.deployment.retry','system_action','high',false,false),
            ('publication.release.rollback','system_action','critical',true,true)
          )
  ) <> 5 THEN
    RAISE EXCEPTION 'Publication permission overlay definition mismatch';
  END IF;

  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
    WHERE permission.canonical_code IN (
      'publication.release.view',
      'publication.deployment.view',
      'publication.release.publish',
      'publication.deployment.retry',
      'publication.release.rollback'
    )
      AND compatibility.scope_kind='tenant'
      AND compatibility.propagation_mode='exact'
      AND compatibility.status='active'
  ) <> 5 THEN
    RAISE EXCEPTION 'Publication permission overlay scope compatibility mismatch';
  END IF;
END
$assertions$;
