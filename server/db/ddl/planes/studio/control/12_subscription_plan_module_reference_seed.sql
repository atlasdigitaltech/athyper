-- seed-contract-version: 1
-- seed-pack: athyper.subscription-plan-modules
-- seed-pack-version: 2.0.0
-- seed-dataset: platform.subscription-plan-module
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 2 catalog simplification","publisher":"Athyper","source_version":"wave2-catalog-v2","retrieved_at":"2026-08-04","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: control.subscription_plan_module(subscription_plan_id,module_id)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave2-plan-module-v2
-- seed-expected-row-count: exact:33
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane',true) <> 'studio' THEN
  RAISE EXCEPTION 'subscription plan module pack requires app.database_plane=athyper'; END IF; END $guard$;

INSERT INTO control.subscription_plan_module (
  id,subscription_plan_id,module_id,entitlement_mode,metadata,status,created_by
)
SELECT md5('athyper:plan-module:' || p.code || ':' || m.code)::uuid,p.id,m.id,'included',
       '{"_seed":{"pack":"athyper.subscription-plan-modules","version":"2.0.0"}}'::jsonb,
       'active','00000000-0000-0000-0000-000000000000'::uuid
FROM control.subscription_plan p
CROSS JOIN control.module m
WHERE p.code='platform_internal' AND p.status='active' AND m.status='active'
ON CONFLICT (subscription_plan_id,module_id) DO UPDATE SET
  entitlement_mode='included',metadata=excluded.metadata,status='active',
  updated_at=now(),updated_by=excluded.created_by
WHERE (control.subscription_plan_module.entitlement_mode,control.subscription_plan_module.metadata,control.subscription_plan_module.status)
  IS DISTINCT FROM (excluded.entitlement_mode,excluded.metadata,excluded.status);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.subscription_plan_module WHERE status='active') <> 33 THEN
    RAISE EXCEPTION 'athyper plan-module count mismatch'; END IF;
END $assertions$;
