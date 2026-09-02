-- seed-contract-version: 1
-- seed-pack: neon.control-platform-catalog
-- seed-pack-version: 2.0.0
-- seed-dataset: control.workspace-module-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 2 catalog simplification","publisher":"Athyper","source_version":"wave2-catalog-v2","retrieved_at":"2026-08-04","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.workspace(code);control.module(code);control.workspace_module(workspace_id,module_id)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:legacy-master-catalog-identities
-- seed-expected-row-count: query:wave2_neon_control_catalog
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane',true) <> 'neon' THEN
  RAISE EXCEPTION 'control catalog pack requires app.database_plane=neon'; END IF; END $guard$;

INSERT INTO control.workspace (id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by)
SELECT id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by FROM master.workspace
ON CONFLICT (code) DO UPDATE SET name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,is_shared_infrastructure=excluded.is_shared_infrastructure,metadata=excluded.metadata,status=excluded.status,updated_at=now(),updated_by=excluded.created_by
WHERE (control.workspace.name,control.workspace.description,control.workspace.sort_order,control.workspace.is_shared_infrastructure,control.workspace.metadata,control.workspace.status) IS DISTINCT FROM (excluded.name,excluded.description,excluded.sort_order,excluded.is_shared_infrastructure,excluded.metadata,excluded.status);

INSERT INTO control.module (id,code,name,description,config,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by)
SELECT id,code,name,description,config,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by FROM master.module
ON CONFLICT (code) DO UPDATE SET name=excluded.name,description=excluded.description,config=excluded.config,metadata=excluded.metadata,status=excluded.status,updated_at=now(),updated_by=excluded.created_by
WHERE (control.module.name,control.module.description,control.module.config,control.module.metadata,control.module.status) IS DISTINCT FROM (excluded.name,excluded.description,excluded.config,excluded.metadata,excluded.status);

INSERT INTO control.workspace_module (workspace_id,module_id,is_primary,sort_order,metadata,status,created_by)
SELECT m.workspace_id,m.id,true,row_number() OVER (PARTITION BY m.workspace_id ORDER BY m.code)::smallint,
       '{"_seed":{"pack":"neon.control-platform-catalog","version":"2.0.0"}}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
FROM master.module m WHERE m.status='active'
ON CONFLICT (workspace_id,module_id) DO UPDATE SET is_primary=true,sort_order=excluded.sort_order,metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (control.workspace_module.is_primary,control.workspace_module.sort_order,control.workspace_module.metadata,control.workspace_module.status) IS DISTINCT FROM (excluded.is_primary,excluded.sort_order,excluded.metadata,excluded.status);

UPDATE control.workspace_module wm SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE wm.status='active' AND wm.metadata #>> '{_seed,pack}'='neon.control-platform-catalog'
  AND NOT EXISTS (
    SELECT 1 FROM master.module m
    WHERE m.id=wm.module_id AND m.workspace_id=wm.workspace_id AND m.status='active'
  );

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.workspace WHERE status='active') <> 9
     OR (SELECT count(*) FROM control.module WHERE status='active') <> 51
     OR (SELECT count(*) FROM control.workspace_module WHERE status='active' AND is_primary) <> 51 THEN
    RAISE EXCEPTION 'neon control catalog backfill count mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM master.workspace m JOIN control.workspace c USING(id) WHERE m.code<>c.code)
     OR EXISTS (SELECT 1 FROM master.module m JOIN control.module c USING(id) WHERE m.code<>c.code) THEN
    RAISE EXCEPTION 'neon control catalog failed UUID-preserving backfill'; END IF;
END $assertions$;
