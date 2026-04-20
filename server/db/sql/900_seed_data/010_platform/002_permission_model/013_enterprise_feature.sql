-- 900_seed_data/001_shared/013_enterprise_feature.sql
-- Seed: Enterprise feature registry (Special Ops toggles)
-- Schema: shared | Table: enterprise_feature
-- Idempotent: on conflict (code) do nothing

insert into shared.enterprise_feature (code, name, description, view_key, edit_key, sort_order, created_by) values
  ('THEME_CHANGE',       'Theme Change',             'Customisable UI theming',       'feature:theme:view',     'feature:theme:edit',     10, '00000000-0000-0000-0000-000000000000'),
  ('ADVANCED_ANALYTICS', 'Advanced Analytics',        'Extended dashboards and drill-down','feature:analytics:view','feature:analytics:edit', 20, '00000000-0000-0000-0000-000000000000'),
  ('CUSTOM_WORKFLOW',    'Custom Workflow Builder',   'Visual workflow designer',       'feature:workflow:view',  'feature:workflow:edit',  30, '00000000-0000-0000-0000-000000000000'),
  ('API_WEBHOOKS',       'API & Webhooks',            'External API and webhook access','feature:api:view',       'feature:api:edit',       40, '00000000-0000-0000-0000-000000000000'),
  ('AI_FORECASTING',     'AI Forecasting',            'ML-powered financial forecasts', 'feature:ai:view',        'feature:ai:edit',        50, '00000000-0000-0000-0000-000000000000'),
  ('DIAGNOSTIC_TOOL',    'Self Diagnostic Tool',      'System health and diagnostics',  'feature:diag:view',      'feature:diag:edit',      60, '00000000-0000-0000-0000-000000000000'),
  ('WHITE_LABEL',        'White Label Branding',      'Full brand customisation',       'feature:brand:view',     'feature:brand:edit',     70, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;
