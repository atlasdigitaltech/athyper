-- shared.role = persona × module cross-product (e.g. 'manager-ACC'). Depends on 010 + 012.
-- Roles are platform-level; tenant scope is applied at master.auth_group_role binding time.

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
      ('MAINT'), ('MFG'), ('ASSET'), ('ASSETREMS'), ('ASSETFM')
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
      ('MAINT'), ('MFG'), ('ASSET'), ('ASSETREMS'), ('ASSETFM')
  ) AS allowed_modules(code);

  SELECT count(*) INTO v_role_count FROM shared.role;

  RAISE NOTICE '[019_role] shared.role: % rows (% persona × % module)',
    v_role_count,
    v_persona_count,
    v_module_count;
END $$;
