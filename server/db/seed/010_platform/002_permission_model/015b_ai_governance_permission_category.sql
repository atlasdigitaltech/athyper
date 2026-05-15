-- 002_permission_model/015b_ai_governance_permission_category.sql
-- Adds the ai_governance permission category for the AI foundation.
-- Must run AFTER 015_permission_category.sql (which seeds the base categories).
-- Idempotent: ON CONFLICT (code) DO NOTHING

INSERT INTO shared.permission_category (code, name, sort_order, created_by)
VALUES
    ('ai_governance', 'AI Governance', 90, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;
