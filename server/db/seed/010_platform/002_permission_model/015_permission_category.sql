-- seed/010_platform/002_permission_model/015_permission_category.sql
-- Seed: Permission categories
-- Schema: shared | Table: permission_category
-- Idempotent: on conflict (code) do nothing

insert into shared.permission_category (code, name, sort_order, created_by) values
  ('entity',        'Entity Operations',        10, '00000000-0000-0000-0000-000000000000'),
  ('workflow',      'Workflow Operations',       20, '00000000-0000-0000-0000-000000000000'),
  ('finance',       'Finance Operations',        30, '00000000-0000-0000-0000-000000000000'),
  ('utility',       'Utility Operations',        40, '00000000-0000-0000-0000-000000000000'),
  ('bulk',          'Bulk Operations',           50, '00000000-0000-0000-0000-000000000000'),
  ('delegation',    'Delegation Operations',     60, '00000000-0000-0000-0000-000000000000'),
  ('collaboration', 'Collaboration Operations',  70, '00000000-0000-0000-0000-000000000000'),
  ('special',       'Special Operations',        80, '00000000-0000-0000-0000-000000000000'),
  ('ai_governance',  'AI Governance',             90, '00000000-0000-0000-0000-000000000000'),
  ('platform_admin', 'Platform Administration',  100, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;
