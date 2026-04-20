-- 900_seed_data/001_shared/010_persona.sql
-- Seed: System personas (role templates)
-- Schema: shared | Table: persona
-- Idempotent: on conflict (code) do nothing

insert into shared.persona (code, name, description, scope_mode, priority, is_system, created_by) values
  ('viewer',      'Viewer',       'Read-only access to records',         'tenant', 10,  true, '00000000-0000-0000-0000-000000000000'),
  ('reporter',    'Reporter',     'Viewer plus reporting capabilities',  'tenant', 20,  true, '00000000-0000-0000-0000-000000000000'),
  ('requester',   'Requester',    'Can create and manage own requests',  'tenant', 30,  true, '00000000-0000-0000-0000-000000000000'),
  ('agent',       'Agent',        'Process requests within assigned OU', 'tenant', 40,  true, '00000000-0000-0000-0000-000000000000'),
  ('manager',     'Manager',      'Manage and approve within OU scope',  'tenant', 50,  true, '00000000-0000-0000-0000-000000000000'),
  ('owner',       'Owner',        'Full operational control within scope','tenant', 55,  true, '00000000-0000-0000-0000-000000000000'),
  ('admin',       'Admin',        'Administrative operations, no workflow/finance', 'tenant', 70, true, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;
