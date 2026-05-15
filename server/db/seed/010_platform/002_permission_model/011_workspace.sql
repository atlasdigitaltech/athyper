-- 900_seed_data/001_shared/011_workspace.sql
-- Seed: Product workspaces
-- Schema: shared | Table: workspace
-- Idempotent: on conflict (code) do update
--
-- Canonical workspace set (7 user-facing):
--   FIN  Finance                      Accounting, payments, treasury, and budgeting
--   SCM  Supply Chain                 Suppliers, sourcing, contracts, procurement, inventory, warehousing, quality, demand planning, and logistics
--   COM  Sales & CRM                  Customer relationships, opportunities, sales orders, and invoicing
--   PPL  People                       Employee lifecycle and payroll
--   PRS  Projects & Services          Projects, costing, tasks, and service desk
--   OPS  Manufacturing & Maintenance  Production, BOMs, work orders, MRP, and maintenance
--   AST  Assets & Facilities          Fixed assets, real estate, leases, and facilities
--
-- CORE and PTR are not managed here — their rows are owned by their respective seed scripts.

insert into shared.workspace (code, name, description, sort_order, created_by) values
  ('FIN',  'Finance',                    'Accounting, payments, treasury, and budgeting',                                                                        20, '00000000-0000-0000-0000-000000000000'),
  ('SCM',  'Supply Chain',               'Suppliers, sourcing, contracts, procurement, inventory, warehousing, quality, demand planning, and logistics',          30, '00000000-0000-0000-0000-000000000000'),
  ('COM',  'Sales & CRM',                'Customer relationships, opportunities, sales orders, and invoicing',                                                    40, '00000000-0000-0000-0000-000000000000'),
  ('PPL',  'People',                     'Employee lifecycle and payroll',                                                                                        50, '00000000-0000-0000-0000-000000000000'),
  ('PRS',  'Projects & Services',        'Projects, costing, tasks, and service desk',                                                                           60, '00000000-0000-0000-0000-000000000000'),
  ('OPS',  'Manufacturing & Maintenance','Production, BOMs, work orders, MRP, and maintenance',                                                                  70, '00000000-0000-0000-0000-000000000000'),
  ('AST',  'Assets & Facilities',        'Fixed assets, real estate, leases, and facilities',                                                                    80, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    sort_order  = excluded.sort_order,
    updated_at  = now(),
    updated_by  = excluded.created_by;
