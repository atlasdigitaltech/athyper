-- 002_permission_model/015_plan_module_access.sql
-- Seed: Subscription plan → module and feature access matrix
-- Schema: shared | Tables: plan_module_access, plan_feature_access
-- Depends on: 012_module.sql, 013_enterprise_feature.sql, 014_subscription_plan.sql
-- Idempotent: ON CONFLICT (plan_id, module_id/feature_id) DO NOTHING
--
-- Plan tiers:
--   trial        → Core modules only
--   base         → Core + Base tier modules
--   starter      → Core + Base tier modules + THEME_CHANGE feature
--   professional → Core + Base + Professional tier modules + productivity features
--   enterprise   → All modules + all features

-- ============================================================================
-- plan_module_access — module availability per subscription plan
-- ============================================================================

DO $pma$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- Core modules (tier="Core") — included in ALL plans
INSERT INTO shared.plan_module_access (plan_id, module_id, is_included, is_addon, created_by)
SELECT sp.id, m.id, true, false, v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.module m
WHERE m.code IN ('FND','META','IAM','AUD','POL','WFL','JOB','DOC','NTF','INT','CMS','ACT','REL')
ON CONFLICT (plan_id, module_id) DO NOTHING;

-- Base tier modules (tier="Base") — included from base plan upward; addon on trial
INSERT INTO shared.plan_module_access (plan_id, module_id, is_included, is_addon, created_by)
SELECT sp.id, m.id,
       CASE WHEN sp.code IN ('base','starter','professional','enterprise') THEN true ELSE false END,
       CASE WHEN sp.code = 'trial' THEN true ELSE false END,
       v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.module m
WHERE m.code IN (
    -- Finance
    'ACC','PAY','TREASURY',
    -- Supply chain
    'SRM','SOURCE','CONTRACT','BUY','INVENTORY','QMS','SUBCON',
    -- Commercial
    'CRM','SALE',
    -- People
    'HR','PAYROLL',
    -- Projects & Services
    'PRJCOST','ITSM',
    -- Operations
    'MAINT','MFG',
    -- Assets & Facilities
    'ASSETFM',
    -- Partner Collaboration
    'PCON','OMI','IMO','CCON','SOO','SII','LOGX'
)
ON CONFLICT (plan_id, module_id) DO NOTHING;

-- Professional tier modules (tier="Professional") — included from professional upward; addon on base/starter
INSERT INTO shared.plan_module_access (plan_id, module_id, is_included, is_addon, created_by)
SELECT sp.id, m.id,
       CASE WHEN sp.code IN ('professional','enterprise') THEN true ELSE false END,
       CASE WHEN sp.code IN ('base','starter') THEN true ELSE false END,
       v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.module m
WHERE m.code IN ('PAYG')
ON CONFLICT (plan_id, module_id) DO NOTHING;

-- Enterprise tier modules (tier="Enterprise") — included in enterprise only; addon on professional
INSERT INTO shared.plan_module_access (plan_id, module_id, is_included, is_addon, created_by)
SELECT sp.id, m.id,
       CASE WHEN sp.code = 'enterprise' THEN true ELSE false END,
       CASE WHEN sp.code = 'professional' THEN true ELSE false END,
       v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.module m
WHERE m.code IN ('BUDGET','DEMAND','WMS','LOGISTICS','ASSET','ASSETREMS')
ON CONFLICT (plan_id, module_id) DO NOTHING;

RAISE NOTICE '[015_plan_module_access] plan_module_access seeded';

-- ============================================================================
-- plan_feature_access — feature availability per subscription plan
--
-- trial        → no features
-- base         → no features
-- starter      → THEME_CHANGE
-- professional → THEME_CHANGE, ADVANCED_ANALYTICS, CUSTOM_WORKFLOW, API_WEBHOOKS
-- enterprise   → all features
-- ============================================================================

-- THEME_CHANGE: starter and above included; trial/base excluded
INSERT INTO shared.plan_feature_access (plan_id, feature_id, is_included, is_addon, created_by)
SELECT sp.id, ef.id,
       CASE WHEN sp.code IN ('starter','professional','enterprise') THEN true ELSE false END,
       false,
       v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.enterprise_feature ef
WHERE ef.code = 'THEME_CHANGE'
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- ADVANCED_ANALYTICS, CUSTOM_WORKFLOW, API_WEBHOOKS: professional and above
INSERT INTO shared.plan_feature_access (plan_id, feature_id, is_included, is_addon, created_by)
SELECT sp.id, ef.id,
       CASE WHEN sp.code IN ('professional','enterprise') THEN true ELSE false END,
       CASE WHEN sp.code = 'starter' THEN true ELSE false END,
       v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.enterprise_feature ef
WHERE ef.code IN ('ADVANCED_ANALYTICS','CUSTOM_WORKFLOW','API_WEBHOOKS')
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- AI_FORECASTING, DIAGNOSTIC_TOOL, WHITE_LABEL: enterprise only; addon on professional
INSERT INTO shared.plan_feature_access (plan_id, feature_id, is_included, is_addon, created_by)
SELECT sp.id, ef.id,
       CASE WHEN sp.code = 'enterprise' THEN true ELSE false END,
       CASE WHEN sp.code = 'professional' THEN true ELSE false END,
       v_su
FROM shared.subscription_plan sp
CROSS JOIN shared.enterprise_feature ef
WHERE ef.code IN ('AI_FORECASTING','DIAGNOSTIC_TOOL','WHITE_LABEL')
ON CONFLICT (plan_id, feature_id) DO NOTHING;

RAISE NOTICE '[015_plan_module_access] plan_feature_access seeded';

END $pma$;
