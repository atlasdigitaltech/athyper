BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_studio' OR current_setting('app.database_plane', true) <> 'studio' THEN
    RAISE EXCEPTION 'Studio platform catalog alignment requires the STUDIO plane';
  END IF;
END $$;

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('athyper:module:' || seed.code)::uuid,seed.code,seed.name,seed.description,workspace.id,seed.config,
       '{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
  ('exp','Experience & Navigation Design','Experience surfaces, navigation, responsive layout, and publication','{"tier":"Core","dependencies":["meta","pol","wfl","pub"]}'::jsonb,'entity'),
  ('pcat','Platform Catalog Management','Workspace, module, route slug, and catalog publication governance','{"tier":"Core","dependencies":["fnd","rel","pub"]}'::jsonb,'plans')
) AS seed(code,name,description,config,workspace_code)
JOIN master.workspace workspace ON workspace.code=seed.workspace_code AND workspace.status='active'
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,workspace_id=excluded.workspace_id,config=excluded.config,
  metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by;

INSERT INTO control.module (id,code,name,description,config,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by)
SELECT id,code,name,description,config,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by
FROM master.module WHERE code IN ('exp','pcat')
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,config=excluded.config,metadata=excluded.metadata,
  status=excluded.status,updated_at=now(),updated_by=excluded.created_by;

INSERT INTO control.workspace_module (workspace_id,module_id,is_primary,sort_order,metadata,status,created_by)
SELECT master_module.workspace_id,master_module.id,true,
       row_number() OVER (PARTITION BY master_module.workspace_id ORDER BY master_module.code)::smallint,
       '{"_seed":{"pack":"athyper.control-platform-catalog","version":"2.0.0"}}','active',
       '00000000-0000-0000-0000-000000000000'
FROM master.module master_module
WHERE master_module.status='active'
ON CONFLICT (workspace_id,module_id) DO UPDATE SET
  is_primary=true,sort_order=excluded.sort_order,metadata=excluded.metadata,status='active',
  updated_at=now(),updated_by=excluded.created_by;

INSERT INTO control.subscription_plan_module (id,subscription_plan_id,module_id,entitlement_mode,metadata,status,created_by)
SELECT md5('athyper:plan-module:' || plan.code || ':' || module.code)::uuid,plan.id,module.id,'included',
       '{"_seed":{"pack":"athyper.subscription-plan-modules","version":"2.0.0"}}','active',
       '00000000-0000-0000-0000-000000000000'
FROM control.subscription_plan plan
CROSS JOIN control.module module
WHERE plan.code='platform_internal' AND plan.status='active'
  AND module.status='active'
ON CONFLICT (subscription_plan_id,module_id) DO UPDATE SET
  entitlement_mode='included',metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by;

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 10
    OR (SELECT count(*) FROM master.module WHERE status='active') <> 33
    OR (SELECT count(*) FROM control.workspace WHERE status='active') <> 10
    OR (SELECT count(*) FROM control.module WHERE status='active') <> 33
    OR (SELECT count(*) FROM control.workspace_module WHERE status='active' AND is_primary) <> 33
    OR (SELECT count(*) FROM control.subscription_plan_module entitlement
        JOIN control.subscription_plan plan ON plan.id=entitlement.subscription_plan_id
        WHERE entitlement.status='active' AND plan.status='active' AND plan.code='platform_internal') <> 33 THEN
    RAISE EXCEPTION 'Studio canonical catalog count mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM control.workspace_module association
    JOIN control.workspace workspace ON workspace.id=association.workspace_id
    JOIN control.module module ON module.id=association.module_id
    WHERE association.status='active' AND workspace.code='entity' AND module.code='exp'
  ) OR NOT EXISTS (
    SELECT 1 FROM control.workspace_module association
    JOIN control.workspace workspace ON workspace.id=association.workspace_id
    JOIN control.module module ON module.id=association.module_id
    WHERE association.status='active' AND workspace.code='plans' AND module.code='pcat'
  ) THEN
    RAISE EXCEPTION 'Studio canonical module ownership mismatch';
  END IF;
END $assertions$;

COMMIT;
