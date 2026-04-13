-- 900_seed_data/030_tenant/800_subscriptions/001_demo_module_subscriptions.sql
-- Seed: Subscribe all tenants to all modules
-- Schema: master | Table: tenant_module_subscription
-- Strategy: cross-join all tenants × all modules, status = 'active'
-- Updated: PRM workspace added (PCON, OMI, IMO, CCON, SOO, SII, LOGX)
-- Idempotent: ON CONFLICT (tenant_id, module_id) DO NOTHING

INSERT INTO master.tenant_module_subscription (id, tenant_id, module_id, status, created_by)
SELECT
  gen_random_uuid(),
  t.id,
  m.id,
  'active',
  '00000000-0000-0000-0000-000000000000'
FROM master.tenant t
CROSS JOIN shared.module m
ON CONFLICT (tenant_id, module_id) DO NOTHING;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM master.tenant_module_subscription;
  RAISE NOTICE 'master.tenant_module_subscription: % rows total', cnt;
END $$;
