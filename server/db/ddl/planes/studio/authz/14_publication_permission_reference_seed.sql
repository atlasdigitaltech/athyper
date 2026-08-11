-- seed-contract-version: 1
-- seed-pack: athyper.publication-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Phase 9 Publication","publisher":"Athyper","source_version":"server-phase9-publication.v1","retrieved_at":"2026-08-10","license":"internal"}
-- seed-plane: studio
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-id-strategy: deterministic-uuid:athyper-publication-permission-v1
-- seed-expected-row-count: exact:5
-- seed-demo-data: false

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'publication permission pack requires app.database_plane=studio';
  END IF;
END $guard$;

INSERT INTO authz.permission
  (id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,metadata,status,created_by)
SELECT md5('athyper:publication-permission:' || value.code)::uuid,value.code,
       'system_action'::authz.permission_kind_d,module.id,
       value.risk::authz.risk_tier_d,value.requires_mfa,
       jsonb_build_object('_seed',jsonb_build_object('pack','athyper.publication-permissions','version','1.0.0'),'name',value.name),
       'draft','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module AS module
CROSS JOIN (VALUES
  ('publication.release.view','View Publication Releases','low',false),
  ('publication.deployment.view','View Publication Deployments','low',false),
  ('publication.release.publish','Publish Release','critical',true),
  ('publication.deployment.retry','Retry Publication Deployment','high',true),
  ('publication.release.rollback','Rollback Publication Release','critical',true)
) AS value(code,name,risk,requires_mfa)
WHERE module.code='pub'
ON CONFLICT (canonical_code) DO UPDATE SET
  permission_kind=excluded.permission_kind,module_id=excluded.module_id,risk_tier=excluded.risk_tier,
  requires_mfa=excluded.requires_mfa,metadata=excluded.metadata,
  status='suspended',status_changed_at=now(),status_changed_by=excluded.created_by,
  updated_at=now(),updated_by=excluded.created_by
WHERE (authz.permission.permission_kind,authz.permission.module_id,authz.permission.risk_tier,
       authz.permission.requires_mfa,authz.permission.metadata)
  IS DISTINCT FROM (excluded.permission_kind,excluded.module_id,excluded.risk_tier,
                    excluded.requires_mfa,excluded.metadata);

UPDATE authz.permission
SET status='published',status_changed_at=now(),status_changed_by='00000000-0000-0000-0000-000000000000'::uuid,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE metadata->'_seed'->>'pack'='athyper.publication-permissions' AND status IN ('draft','suspended');

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM authz.permission WHERE metadata->'_seed'->>'pack'='athyper.publication-permissions' AND status='published') <> 5 THEN RAISE EXCEPTION 'publication permission count mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM authz.permission permission LEFT JOIN control.module module ON module.id=permission.module_id WHERE permission.metadata->'_seed'->>'pack'='athyper.publication-permissions' AND module.id IS NULL) THEN RAISE EXCEPTION 'publication permission module orphan'; END IF;
  IF EXISTS (SELECT canonical_code FROM authz.permission WHERE metadata->'_seed'->>'pack'='athyper.publication-permissions' GROUP BY canonical_code HAVING count(*)<>1) THEN RAISE EXCEPTION 'publication permission uniqueness mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM authz.permission permission JOIN control.module module ON module.id=permission.module_id WHERE permission.metadata->'_seed'->>'pack'='athyper.publication-permissions' AND (module.code<>'pub' OR permission.permission_kind<>'system_action' OR permission.status<>'published')) THEN RAISE EXCEPTION 'publication permission semantic mismatch'; END IF;
END $assertions$;
