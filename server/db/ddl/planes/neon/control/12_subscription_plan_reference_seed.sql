-- seed-contract-version: 1
-- seed-pack: neon.subscription-plans
-- seed-pack-version: 1.0.0
-- seed-dataset: platform.subscription-plan
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 4 subscription plan rewrite","publisher":"Athyper","source_version":"wave4-platform-catalog.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.subscription_plan(code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave4-neon-subscription-plan-v1
-- seed-expected-row-count: exact:5
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane', true) <> 'neon' THEN
  RAISE EXCEPTION 'subscription plan pack requires app.database_plane=neon'; END IF; END $guard$;

INSERT INTO control.subscription_plan (id,code,name,max_users,sort_order,metadata,status,created_by)
SELECT md5('neon:subscription-plan:' || v.code)::uuid,v.code,v.name,v.max_users,v.sort_order,
       '{"_seed":{"pack":"neon.subscription-plans","version":"1.0.0"}}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
 ('trial','Trial',5,10::smallint),('base','Base',50,20::smallint),
 ('starter','Starter',200,30::smallint),('professional','Professional',1000,40::smallint),
 ('enterprise','Enterprise',NULL::integer,50::smallint)
) v(code,name,max_users,sort_order)
ON CONFLICT (code) DO UPDATE SET name=excluded.name,max_users=excluded.max_users,sort_order=excluded.sort_order,
 metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (control.subscription_plan.name,control.subscription_plan.max_users,control.subscription_plan.sort_order,control.subscription_plan.metadata,control.subscription_plan.status)
 IS DISTINCT FROM (excluded.name,excluded.max_users,excluded.sort_order,excluded.metadata,'active'::shared.ref_status_d);

DO $assertions$ BEGIN IF (SELECT count(*) FROM control.subscription_plan WHERE status='active') <> 5 THEN
  RAISE EXCEPTION 'neon subscription plan count mismatch'; END IF; END $assertions$;
