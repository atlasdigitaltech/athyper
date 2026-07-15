-- Subscription plan version → module + feature access matrix. Depends on 012/013/014.

-- One-time backfill: promote version_number to GENERATED ALWAYS AS IDENTITY for tables
-- created before the DDL change. Safe to leave in place after the next clean reset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shared'
      AND table_name   = 'subscription_plan_version'
      AND column_name  = 'version_number'
      AND is_identity  = 'NO'
  ) THEN
    ALTER TABLE shared.subscription_plan_version
      ALTER COLUMN version_number ADD GENERATED ALWAYS AS IDENTITY;
  END IF;
END $$;

-- Initial active version per plan. spv_active_uq partial index enforces at most one active.
INSERT INTO shared.subscription_plan_version (plan_id, valid_from, status, created_by)
SELECT
    sp.id,
    CURRENT_DATE,
    'active',
    '00000000-0000-0000-0000-000000000000'
FROM shared.subscription_plan sp
WHERE NOT EXISTS (
    SELECT 1 FROM shared.subscription_plan_version spv
    WHERE spv.plan_id = sp.id AND spv.valid_to IS NULL AND spv.status = 'active'
);

-- plan_module_access matrix derived from module.config->>'tier'.
INSERT INTO shared.plan_module_access (plan_version_id, module_id, is_included, is_addon, created_by)
SELECT
    spv.id,
    m.id,
    CASE m.config->>'tier'
        WHEN 'Core'         THEN true
        WHEN 'Base'         THEN sp.code IN ('base','starter','professional','enterprise')
        WHEN 'Professional' THEN sp.code IN ('professional','enterprise')
        WHEN 'Enterprise'   THEN sp.code =  'enterprise'
        ELSE false
    END AS is_included,
    CASE m.config->>'tier'
        WHEN 'Base'         THEN sp.code =                'trial'
        WHEN 'Professional' THEN sp.code IN ('base','starter')
        WHEN 'Enterprise'   THEN sp.code =                'professional'
        ELSE false
    END AS is_addon,
    '00000000-0000-0000-0000-000000000000'
FROM shared.subscription_plan sp
JOIN shared.subscription_plan_version spv
  ON spv.plan_id = sp.id AND spv.valid_to IS NULL AND spv.status = 'active'
CROSS JOIN shared.module m
ON CONFLICT DO NOTHING;

-- plan_feature_access — feature → minimum tier:
--   starter      → THEME_CHANGE
--   professional → ADVANCED_ANALYTICS, CUSTOM_WORKFLOW, API_WEBHOOKS
--   enterprise   → AI_FORECASTING, DIAGNOSTIC_TOOL, WHITE_LABEL
INSERT INTO shared.plan_feature_access (plan_version_id, feature_id, is_included, is_addon, created_by)
SELECT
    spv.id,
    ef.id,
    CASE ft.tier
        WHEN 'starter'      THEN sp.code IN ('starter','professional','enterprise')
        WHEN 'professional' THEN sp.code IN ('professional','enterprise')
        WHEN 'enterprise'   THEN sp.code =  'enterprise'
        ELSE false
    END AS is_included,
    CASE ft.tier
        WHEN 'professional' THEN sp.code =  'starter'
        WHEN 'enterprise'   THEN sp.code =  'professional'
        ELSE false
    END AS is_addon,
    '00000000-0000-0000-0000-000000000000'
FROM shared.subscription_plan sp
JOIN shared.subscription_plan_version spv
  ON spv.plan_id = sp.id AND spv.valid_to IS NULL AND spv.status = 'active'
CROSS JOIN shared.enterprise_feature ef
JOIN (VALUES
    ('THEME_CHANGE',       'starter'),
    ('ADVANCED_ANALYTICS', 'professional'),
    ('CUSTOM_WORKFLOW',    'professional'),
    ('API_WEBHOOKS',       'professional'),
    ('AI_FORECASTING',     'enterprise'),
    ('DIAGNOSTIC_TOOL',    'enterprise'),
    ('WHITE_LABEL',        'enterprise')
) AS ft(code, tier) ON ef.code = ft.code
ON CONFLICT DO NOTHING;

DO $$ DECLARE spv int; pma int; pfa int; BEGIN
  SELECT count(*) INTO spv FROM shared.subscription_plan_version;
  SELECT count(*) INTO pma FROM shared.plan_module_access;
  SELECT count(*) INTO pfa FROM shared.plan_feature_access;
  RAISE NOTICE '[016_plan_module_access] subscription_plan_version: % rows | plan_module_access: % rows | plan_feature_access: % rows', spv, pma, pfa;
END $$;
