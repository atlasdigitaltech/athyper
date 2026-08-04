-- Minimal canonical module coordinates required by the P5-E2 pilot catalogs.
-- This intentionally does not copy the legacy full module catalog.
INSERT INTO master.workspace (
    id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,created_by
) VALUES (
    md5('athyper:workspace:core')::uuid,'core','Core Platform',
    'Shared runtime and platform capabilities',10,true,
    '{"seed_owner":"athyper.operation-scope","phase":"P5-E2"}'::jsonb,
    'active','00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master.module (
    id,code,name,description,workspace_id,config,metadata,status,created_by
)
SELECT md5('athyper:module:' || lower(seed.code))::uuid,
       seed.code,seed.name,seed.description,workspace.id,
       '{"tier":"Core"}'::jsonb,
       '{"seed_owner":"athyper.operation-scope","phase":"P5-E2"}'::jsonb,
       'active','00000000-0000-0000-0000-000000000000'
  FROM (VALUES
    ('rel','Reference & Shared Data','Canonical reference and shared-data capability'),
    ('int','Integration Hub','Canonical API, event and integration capability')
  ) AS seed(code,name,description)
  JOIN master.workspace workspace ON workspace.code='core' AND workspace.status='active'
ON CONFLICT (code) DO NOTHING;

DO $$ BEGIN
    IF (SELECT count(*) FROM master.module WHERE code IN ('rel','int') AND status='active') <> 2 THEN
        RAISE EXCEPTION '[P5-E2] canonical REL and INT module coordinates are required';
    END IF;
END $$;
