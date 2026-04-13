-- 900_seed_data/010_system/001_shared/018_role.sql
-- Seed: shared.role — one role per (persona × module)
-- Schema: shared | Table: role
-- Scope lives on master.group_role; roles are platform-level, not per-tenant.
-- code pattern: {PERSONA_CODE}-{MODULE_CODE}  e.g. 'manager-ACC'
-- Idempotent: ON CONFLICT (code) DO UPDATE

INSERT INTO shared.role (code, name, persona_id, module_id, created_by)
SELECT
  lower(ps.code) || '-' || m.code,
  ps.name || ' / ' || m.name,
  ps.id,
  m.id,
  '00000000-0000-0000-0000-000000000000'
FROM shared.persona ps
CROSS JOIN shared.module m
ON CONFLICT (code) DO UPDATE SET
  name       = excluded.name,
  persona_id = excluded.persona_id,
  module_id  = excluded.module_id,
  updated_at = now(),
  updated_by = excluded.created_by;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM shared.role;
  RAISE NOTICE 'shared.role: % rows (% persona × % module)',
    cnt,
    (SELECT count(*) FROM shared.persona),
    (SELECT count(*) FROM shared.module);
END $$;
