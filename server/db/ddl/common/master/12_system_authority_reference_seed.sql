-- seed-contract-version: 1
-- seed-pack: common.master.system-authority
-- seed-pack-version: 2.0.0
-- seed-dataset: common.master.system-authority
-- seed-data-class: production_reference
-- seed-provenance: {"source":"legacy platform/000_bootstrap merge","publisher":"Athyper","source_version":"wave4-system-authority.v2","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: master.tenant(id);master.principal(id)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-system-authority-v2
-- seed-expected-row-count: exact:2
-- seed-assertions: expected-count,orphan,uniqueness,semantic,idempotent-convergence
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) NOT IN ('athyper','neon','mesh') THEN
    RAISE EXCEPTION 'system authority seed requires app.database_plane=athyper|neon|mesh';
  END IF;
END $guard$;

-- The well-known authority is infrastructure identity, not a login-capable IAM
-- user. These inserts establish the circular tenant/principal audit root.
INSERT INTO master.tenant (
    id,code,name,display_name,realm_key,metadata,status,created_by
) VALUES (
    '00000000-0000-0000-0000-000000000000','system','System Tenant',
    'System','athyper','{"_seed":{"pack":"common.master.system-authority","version":"2.0.0"}}',
    'active','00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO UPDATE SET
  code=excluded.code,name=excluded.name,display_name=excluded.display_name,
  realm_key=excluded.realm_key,metadata=excluded.metadata,status=excluded.status,
  updated_at=now(),updated_by=excluded.created_by
WHERE (master.tenant.code,master.tenant.name,master.tenant.display_name,
       master.tenant.realm_key,master.tenant.metadata,master.tenant.status)
  IS DISTINCT FROM
      (excluded.code,excluded.name,excluded.display_name,
       excluded.realm_key,excluded.metadata,excluded.status);

INSERT INTO master.principal (
    id,tenant_id,code,name,principal_type,provisioning_source,metadata,status,created_by
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'systemadmin','System Administrator','service_account','internal',
    '{"_seed":{"pack":"common.master.system-authority","version":"2.0.0"}}',
    'active','00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO UPDATE SET
  code=excluded.code,name=excluded.name,principal_type=excluded.principal_type,
  provisioning_source=excluded.provisioning_source,metadata=excluded.metadata,status=excluded.status,
  updated_at=now(),updated_by=excluded.created_by
WHERE (master.principal.code,master.principal.name,master.principal.principal_type,
       master.principal.provisioning_source,master.principal.metadata,master.principal.status)
  IS DISTINCT FROM
      (excluded.code,excluded.name,excluded.principal_type,
       excluded.provisioning_source,excluded.metadata,excluded.status);

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM master.tenant WHERE id='00000000-0000-0000-0000-000000000000') <> 1
     OR (SELECT count(*) FROM master.principal WHERE id='00000000-0000-0000-0000-000000000000') <> 1 THEN
    RAISE EXCEPTION 'system authority expected-count assertion failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM master.principal p JOIN master.tenant t ON t.id=p.tenant_id
    WHERE p.id='00000000-0000-0000-0000-000000000000'
      AND t.id='00000000-0000-0000-0000-000000000000'
  ) THEN RAISE EXCEPTION 'system authority orphan assertion failed'; END IF;
  IF EXISTS (
    SELECT 1 FROM master.principal
    WHERE id='00000000-0000-0000-0000-000000000000'
      AND (code<>'systemadmin' OR principal_type<>'service_account' OR provisioning_source<>'internal' OR status<>'active')
  ) THEN RAISE EXCEPTION 'system authority semantic assertion failed'; END IF;
END $assertions$;
