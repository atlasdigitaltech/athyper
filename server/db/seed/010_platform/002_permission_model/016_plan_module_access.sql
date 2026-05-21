-- seed/010_platform/002_permission_model/016_plan_module_access.sql
-- Seed: Subscription plan version → module and feature access matrix
-- Schema: shared | Tables: subscription_plan_version, plan_module_access, plan_feature_access
-- Depends on: 012_module.sql, 013_enterprise_feature.sql, 014_subscription_plan.sql
-- Idempotent: ON CONFLICT DO NOTHING

-- One-time schema fix: if subscription_plan_version was created before the
-- GENERATED ALWAYS AS IDENTITY DDL landed, promote the column now.
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

-- ============================================================================
-- subscription_plan_version — create the initial active version for each plan
-- (one version per plan; the spv_active_uq partial index enforces at most one
-- active version per plan at any time)
-- ============================================================================
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

-- ============================================================================
-- plan_module_access — driven by module tier in shared.module.config
-- ============================================================================
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

-- ============================================================================
-- plan_feature_access — feature tier defined inline via VALUES
--
--   starter      → THEME_CHANGE
--   professional → ADVANCED_ANALYTICS, CUSTOM_WORKFLOW, API_WEBHOOKS
--   enterprise   → AI_FORECASTING, DIAGNOSTIC_TOOL, WHITE_LABEL
-- ============================================================================
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
