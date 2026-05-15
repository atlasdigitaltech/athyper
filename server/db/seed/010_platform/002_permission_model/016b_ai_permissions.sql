-- 002_permission_model/016b_ai_permissions.sql
-- Three AI governance permissions.
-- Depends on: 015b_ai_governance_permission_category.sql
-- Idempotent: ON CONFLICT (code) DO NOTHING

INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, v.scope_type, v.risk_level, v.plan_restricted, v.sort_order,
       '00000000-0000-0000-0000-000000000000'::uuid
FROM shared.permission_category c
JOIN (VALUES
    ('ai.use_extraction',
     'Use AI Extraction',
     'ai_governance', 'tenant', 'medium', true, 10),

    ('ai.review_ai_output',
     'Review AI Output',
     'ai_governance', 'tenant', 'low', false, 20),

    ('ai.calibrate_thresholds',
     'Calibrate AI Thresholds',
     'ai_governance', 'tenant', 'high', true, 30)
) AS v(code, name, cat, scope_type, risk_level, plan_restricted, sort_order)
  ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;
