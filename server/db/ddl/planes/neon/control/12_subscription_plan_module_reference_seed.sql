-- seed-contract-version: 1
-- seed-pack: neon.subscription-plan-modules
-- seed-pack-version: 2.0.0
-- seed-dataset: platform.subscription-plan-module
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 2 catalog simplification","publisher":"Athyper","source_version":"wave2-catalog-v2","retrieved_at":"2026-08-04","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.subscription_plan_module(subscription_plan_id,module_id)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave2-plan-module-v2
-- seed-expected-row-count: exact:65
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane',true) <> 'neon' THEN
  RAISE EXCEPTION 'subscription plan module pack requires app.database_plane=neon'; END IF; END $guard$;

INSERT INTO control.subscription_plan_module (
  id,subscription_plan_id,module_id,entitlement_mode,metadata,status,created_by
)
SELECT md5('neon:plan-module:' || p.code || ':' || m.code)::uuid,p.id,m.id,'included',
       '{"_seed":{"pack":"neon.subscription-plan-modules","version":"2.0.0"}}'::jsonb,
       'active','00000000-0000-0000-0000-000000000000'::uuid
FROM (
  SELECT 'finance_free' AS plan_code,code AS module_code FROM control.module
   WHERE status='active' AND code IN (
     'fnd','meta','iam','aud','pol','wfl','job','doc','ntf','int','cms','act','rel','acc'
   )
  UNION ALL
  SELECT 'erp_enterprise' AS plan_code,code AS module_code
  FROM control.module WHERE status='active'
) e
JOIN control.subscription_plan p ON p.code=e.plan_code AND p.status='active'
JOIN control.module m ON m.code=e.module_code AND m.status='active'
ON CONFLICT (subscription_plan_id,module_id) DO UPDATE SET
  entitlement_mode='included',metadata=excluded.metadata,status='active',
  updated_at=now(),updated_by=excluded.created_by
WHERE (control.subscription_plan_module.entitlement_mode,control.subscription_plan_module.metadata,control.subscription_plan_module.status)
  IS DISTINCT FROM (excluded.entitlement_mode,excluded.metadata,excluded.status);

UPDATE control.subscription_plan_module pm SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
FROM control.subscription_plan p,control.module m
WHERE pm.subscription_plan_id=p.id AND pm.module_id=m.id AND pm.status='active'
  AND pm.metadata #>> '{_seed,pack}'='neon.subscription-plan-modules'
  AND NOT (
    (p.code='erp_enterprise' AND p.status='active' AND m.status='active')
    OR (p.code='finance_free' AND p.status='active' AND m.status='active' AND m.code IN (
      'fnd','meta','iam','aud','pol','wfl','job','doc','ntf','int','cms','act','rel','acc'
    ))
  );

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.subscription_plan_module WHERE status='active') <> 65 THEN
    RAISE EXCEPTION 'neon plan-module count mismatch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM control.subscription_plan_module pm
    JOIN control.subscription_plan p ON p.id=pm.subscription_plan_id
    JOIN control.module m ON m.id=pm.module_id
    WHERE p.code='finance_free' AND m.code='acc' AND pm.status='active'
  ) THEN RAISE EXCEPTION 'finance_free must include ACC'; END IF;
END $assertions$;
