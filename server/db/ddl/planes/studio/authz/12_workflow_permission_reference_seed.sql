-- seed-contract-version: 1
-- seed-pack: athyper.workflow-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Phase 9 workflow capability","publisher":"Athyper","source_version":"server-phase9-workflow.v1","retrieved_at":"2026-08-09","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper-workflow-permission-v1
-- seed-expected-row-count: exact:5
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'workflow permission pack requires app.database_plane=athyper';
  END IF;
END $guard$;

INSERT INTO authz.permission
  (id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,metadata,status,created_by)
SELECT
  md5('athyper:workflow-permission:' || source.canonical_code)::uuid,
  source.canonical_code,
  'system_action'::authz.permission_kind_d,
  module.id,
  source.risk_tier::authz.risk_tier_d,
  false,
  jsonb_build_object(
    '_seed',jsonb_build_object('pack','athyper.workflow-permissions','version','1.0.0'),
    'name',source.name
  ),
  'draft',
  '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
  ('workflow.work_item.read',     'low',    'Read Workflow Inbox'),
  ('workflow.work_item.create',   'medium', 'Create Workflow Work Items'),
  ('workflow.work_item.claim',    'medium', 'Claim Workflow Work Items'),
  ('workflow.work_item.complete', 'high',   'Complete Workflow Work Items'),
  ('workflow.work_item.cancel',   'high',   'Cancel Workflow Work Items')
) AS source(canonical_code,risk_tier,name)
JOIN control.module AS module ON module.code = 'wfl'
ON CONFLICT (canonical_code) DO UPDATE SET
  permission_kind=excluded.permission_kind,
  module_id=excluded.module_id,
  risk_tier=excluded.risk_tier,
  requires_mfa=excluded.requires_mfa,
  metadata=excluded.metadata,
  status='suspended',status_changed_at=now(),status_changed_by=excluded.created_by,
  updated_at=now(),updated_by=excluded.created_by
WHERE (authz.permission.permission_kind,authz.permission.module_id,authz.permission.risk_tier,
       authz.permission.requires_mfa,authz.permission.metadata)
  IS DISTINCT FROM (excluded.permission_kind,excluded.module_id,excluded.risk_tier,
                    excluded.requires_mfa,excluded.metadata);

UPDATE authz.permission
SET status='published',status_changed_at=now(),status_changed_by='00000000-0000-0000-0000-000000000000'::uuid,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE metadata->'_seed'->>'pack' = 'athyper.workflow-permissions'
  AND status IN ('draft','suspended');

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM authz.permission
       WHERE metadata->'_seed'->>'pack'='athyper.workflow-permissions' AND status='published') <> 5 THEN
    RAISE EXCEPTION 'workflow permission count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM authz.permission permission LEFT JOIN control.module module ON module.id=permission.module_id WHERE permission.metadata->'_seed'->>'pack'='athyper.workflow-permissions' AND module.id IS NULL) THEN RAISE EXCEPTION 'workflow permission module orphan'; END IF;
  IF EXISTS (SELECT canonical_code FROM authz.permission WHERE metadata->'_seed'->>'pack'='athyper.workflow-permissions' GROUP BY canonical_code HAVING count(*)<>1) THEN RAISE EXCEPTION 'workflow permission uniqueness mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM authz.permission permission JOIN control.module module ON module.id=permission.module_id WHERE permission.metadata->'_seed'->>'pack'='athyper.workflow-permissions' AND (module.code<>'wfl' OR permission.permission_kind<>'system_action' OR permission.status<>'published')) THEN RAISE EXCEPTION 'workflow permission semantic mismatch'; END IF;
END $assertions$;
