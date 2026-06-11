-- seed/platform/002_permission_model/019_role.sql
-- Seed: shared.role — one role per (persona × module)
-- Schema: shared | Table: role
-- Depends on: 010_persona.sql, 012_module.sql
-- Scope lives on master.auth_group_role; roles are platform-level, not per-tenant.
-- code pattern: {persona_code}-{MODULE_CODE}  e.g. 'manager-ACC'
-- Idempotent: ON CONFLICT (code) DO UPDATE

INSERT INTO shared.role (code, name, persona_id, module_id, created_by)
SELECT
  lower(ps.code) || '-' || m.code,
  ps.name || ' / ' || m.name,
  ps.id,
  m.id,
  '00000000-0000-0000-0000-000000000000'
FROM shared.persona ps
JOIN (
    VALUES
      ('viewer'), ('reporter'), ('requester'), ('agent'),
      ('manager'), ('owner'), ('admin')
) AS personas(code)
  ON personas.code = ps.code
CROSS JOIN (
    VALUES
      ('ACC'), ('PAY'), ('TREASURY'), ('BUDGET'), ('PAYG'),
      ('SRM'), ('SOURCE'), ('CONTRACT'), ('BUY'), ('INVENTORY'),
      ('QMS'), ('SUBCON'), ('DEMAND'), ('WMS'), ('LOGISTICS'),
      ('CRM'), ('SALE'), ('HR'), ('PAYROLL'), ('PRJCOST'), ('ITSM'),
      ('MAINT'), ('MFG'), ('ASSET'), ('ASSETREMS'), ('ASSETFM'),
      ('PCON'), ('OMI'), ('IMO'), ('CCON'), ('SOO'),
      ('SII'), ('LOGX')
  ) AS allowed_modules (code)
JOIN shared.module m
  ON m.code = allowed_modules.code
ON CONFLICT (code) DO UPDATE SET
  name       = excluded.name,
  persona_id = excluded.persona_id,
  module_id  = excluded.module_id,
  updated_at = now(),
  updated_by = excluded.created_by;

DO $$ DECLARE
  v_persona_count int;
  v_module_count int;
  v_role_count int;
BEGIN
  SELECT count(*) INTO v_persona_count
  FROM (
    VALUES ('viewer'), ('reporter'), ('requester'), ('agent'),
           ('manager'), ('owner'), ('admin')
  ) AS personas(code);

  SELECT count(*) INTO v_module_count
  FROM (
    VALUES
      ('ACC'), ('PAY'), ('TREASURY'), ('BUDGET'), ('PAYG'),
      ('SRM'), ('SOURCE'), ('CONTRACT'), ('BUY'), ('INVENTORY'),
      ('QMS'), ('SUBCON'), ('DEMAND'), ('WMS'), ('LOGISTICS'),
      ('CRM'), ('SALE'), ('HR'), ('PAYROLL'), ('PRJCOST'), ('ITSM'),
      ('MAINT'), ('MFG'), ('ASSET'), ('ASSETREMS'), ('ASSETFM'),
      ('PCON'), ('OMI'), ('IMO'), ('CCON'), ('SOO'),
      ('SII'), ('LOGX')
  ) AS allowed_modules(code);

  SELECT count(*) INTO v_role_count FROM shared.role;

  RAISE NOTICE '[019_role] shared.role: % rows (% persona × % module)',
    v_role_count,
    v_persona_count,
    v_module_count;
END $$;
