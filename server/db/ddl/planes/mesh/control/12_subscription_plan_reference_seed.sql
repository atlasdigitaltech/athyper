-- seed-contract-version: 1
-- seed-pack: mesh.subscription-plans
-- seed-pack-version: 2.0.0
-- seed-dataset: platform.subscription-plan
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 2 catalog simplification","publisher":"Athyper","source_version":"wave2-catalog-v2","retrieved_at":"2026-08-04","license":"internal"}
-- seed-plane: mesh
-- seed-tenant-scope: none
-- seed-natural-key: control.subscription_plan(code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave2-subscription-plans-v2
-- seed-expected-row-count: exact:3
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane',true) <> 'mesh' THEN
  RAISE EXCEPTION 'subscription plan pack requires app.database_plane=mesh'; END IF; END $guard$;

INSERT INTO control.subscription_plan (id,code,name,max_users,sort_order,metadata,status,created_by)
VALUES
  (md5('mesh:subscription-plan:supplier_free')::uuid,'supplier_free','Supplier Free',5,10,'{"_seed":{"pack":"mesh.subscription-plans","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('mesh:subscription-plan:neon_buyer_included')::uuid,'neon_buyer_included','Neon Buyer Included',10,20,'{"_seed":{"pack":"mesh.subscription-plans","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('mesh:subscription-plan:network_enterprise')::uuid,'network_enterprise','Network Enterprise',NULL,30,'{"_seed":{"pack":"mesh.subscription-plans","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,max_users=excluded.max_users,sort_order=excluded.sort_order,
  metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (control.subscription_plan.name,control.subscription_plan.max_users,control.subscription_plan.sort_order,control.subscription_plan.metadata,control.subscription_plan.status)
  IS DISTINCT FROM (excluded.name,excluded.max_users,excluded.sort_order,excluded.metadata,excluded.status);

UPDATE control.subscription_plan
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE code NOT IN ('supplier_free','neon_buyer_included','network_enterprise')
  AND metadata #>> '{_seed,pack}' = 'mesh.subscription-plans'
  AND status <> 'deprecated';

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.subscription_plan WHERE status='active') <> 3 THEN
    RAISE EXCEPTION 'mesh subscription plan count mismatch'; END IF;
END $assertions$;
