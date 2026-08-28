-- seed-contract-version: 1
-- seed-pack: common.workflow-permission-overlay
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Workflow service authorization contract","publisher":"Athyper","source_version":"phase9","retrieved_at":"2026-08-26","license":"internal"}
-- seed-plane: common
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
  IF current_setting('app.database_plane', true) NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Workflow permission overlay requires an application plane';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module module WHERE module.code='wfl' AND module.status='active') THEN
    RAISE EXCEPTION 'Workflow permission overlay requires the active wfl module';
  END IF;
END
$guard$;

WITH desired(canonical_code,permission_kind,risk_tier) AS (
  VALUES
    ('workflow.work_item.read','capability','low'),
    ('workflow.work_item.create','system_action','medium'),
    ('workflow.work_item.claim','system_action','medium'),
    ('workflow.work_item.complete','system_action','medium'),
    ('workflow.work_item.cancel','system_action','medium')
), workflow_module AS (
  SELECT module.id
  FROM control.module module
  WHERE module.code='wfl' AND module.status='active'
)
INSERT INTO authz.permission (
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT
  md5('athyper:permission:' || desired.canonical_code)::uuid,
  desired.canonical_code,
  desired.permission_kind::authz.permission_kind_d,
  workflow_module.id,
  desired.risk_tier::authz.risk_tier_d,
  false,
  false,
  false,
  false,
  false,
  jsonb_build_object('_seed',jsonb_build_object(
    'pack','common.workflow-permission-overlay',
    'version','1.0.0'
  )),
  'published',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM desired
CROSS JOIN workflow_module
ON CONFLICT (canonical_code) DO NOTHING;

WITH compatibility(canonical_code,scope_kind,propagation_mode) AS (
  VALUES
    ('workflow.work_item.read','tenant','exact'),
    ('workflow.work_item.read','legal_entity','exact'),
    ('workflow.work_item.read','company_code','exact'),
    ('workflow.work_item.read','operating_organization','subtree'),
    ('workflow.work_item.create','tenant','exact'),
    ('workflow.work_item.claim','tenant','exact'),
    ('workflow.work_item.complete','tenant','exact'),
    ('workflow.work_item.cancel','tenant','exact')
)
INSERT INTO authz.permission_scope_kind (
  permission_id,scope_kind,propagation_mode,status,created_by
)
SELECT
  permission.id,
  compatibility.scope_kind::authz.scope_kind_d,
  compatibility.propagation_mode::authz.propagation_mode_d,
  'active',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM compatibility
JOIN authz.permission permission ON permission.canonical_code=compatibility.canonical_code
ON CONFLICT (permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $assertions$
BEGIN
  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN control.module module ON module.id=permission.module_id
    WHERE module.code='wfl'
      AND permission.status='published'
      AND permission.canonical_code IN (
        'workflow.work_item.read',
        'workflow.work_item.create',
        'workflow.work_item.claim',
        'workflow.work_item.complete',
        'workflow.work_item.cancel'
      )
  ) <> 5 THEN
    RAISE EXCEPTION 'Workflow permission overlay definition mismatch';
  END IF;

  IF (
    SELECT count(*)
    FROM authz.permission permission
    JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
    WHERE permission.canonical_code IN (
      'workflow.work_item.read',
      'workflow.work_item.create',
      'workflow.work_item.claim',
      'workflow.work_item.complete',
      'workflow.work_item.cancel'
    )
      AND compatibility.status='active'
  ) <> 8 THEN
    RAISE EXCEPTION 'Workflow permission overlay scope compatibility mismatch';
  END IF;
END
$assertions$;
