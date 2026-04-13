-- 900_seed_data/001_shared/011_workspace.sql
-- Seed: Product workspaces
-- Schema: shared | Table: workspace
-- Idempotent: on conflict (code) do update

insert into shared.workspace (code, name, description, sort_order, created_by) values
  ('CORE', 'Core Platform',         'Cross-cutting platform infrastructure and shared services',              10, '00000000-0000-0000-0000-000000000000'),
  ('FIN',  'Finance',               'Financial accounting, payments, treasury, and budgeting',               20, '00000000-0000-0000-0000-000000000000'),
  ('SCM',  'Supply Chain',          'Procurement, inventory, warehousing, and logistics',                    30, '00000000-0000-0000-0000-000000000000'),
  ('COM',  'Commercial',            'Sales, customer relationship management, and commercial operations',    40, '00000000-0000-0000-0000-000000000000'),
  ('PPL',  'People',                'Human resources and payroll',                                           50, '00000000-0000-0000-0000-000000000000'),
  ('PRS',  'Projects & Services',   'Projects, tasks, and service management',                               60, '00000000-0000-0000-0000-000000000000'),
  ('OPS',  'Operations',            'Manufacturing, maintenance, and production operations',                 70, '00000000-0000-0000-0000-000000000000'),
  ('AST',  'Assets & Facilities',   'Fixed assets, real estate, and facility management',                   80, '00000000-0000-0000-0000-000000000000'),
  ('PTR',  'Partner Collaboration', 'Partner portals, collaborative ordering, invoicing, and logistics exchange', 90, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    sort_order  = excluded.sort_order,
    updated_at  = now(),
    updated_by  = excluded.created_by;
