-- The 7 user-facing product workspaces.
-- CORE and PTR are intentionally NOT here — owned by their respective seed scripts.

insert into shared.workspace (code, name, description, sort_order, is_shared_infrastructure, created_by) values
  ('FIN',  'Finance',                    'Accounting, payments, treasury, and budgeting',                                                                        20, false, '00000000-0000-0000-0000-000000000000'),
  ('SCM',  'Supply Chain',               'Suppliers, sourcing, contracts, procurement, inventory, warehousing, quality, demand planning, and logistics',          30, false, '00000000-0000-0000-0000-000000000000'),
  ('COM',  'Commercial',                 'Customer relationships, opportunities, sales orders, and invoicing',                                                    40, false, '00000000-0000-0000-0000-000000000000'),
  ('PPL',  'People',                     'Employee lifecycle and payroll',                                                                                        50, false, '00000000-0000-0000-0000-000000000000'),
  ('PRS',  'Projects & Services',        'Projects, costing, tasks, and service desk',                                                                           60, false, '00000000-0000-0000-0000-000000000000'),
  ('OPS',  'Operations',                 'Production, BOMs, work orders, MRP, and maintenance',                                                                  70, false, '00000000-0000-0000-0000-000000000000'),
  ('AST',  'Assets & Facilities',        'Fixed assets, real estate, leases, and facilities',                                                                    80, false, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    sort_order  = excluded.sort_order,
    is_shared_infrastructure = excluded.is_shared_infrastructure,
    updated_at  = now(),
    updated_by  = excluded.created_by;
