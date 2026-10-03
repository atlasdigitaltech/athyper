-- Finite, fresh-baseline-only data correction: retire seven redundant BP child
-- read permissions after the historical catalog seeds have run. Preserve those
-- seed bytes and the catalog identities. Existing DEV is NOT a fresh baseline:
-- use the reviewed successor and prepare-permission-cleanup.py there instead.
-- Plane: Neon. Tenant scope: no tenant grants/publications may depend on these
-- records. This correction never changes roles, groups, denies or memberships.
-- No publication or human approval is asserted by this bootstrap correction.
DO $correction$
DECLARE
  codes constant text[] := ARRAY[
    'neon.business_partner_banking.read',
    'neon.business_partner_governance_relation.read',
    'neon.business_partner_identifier.read',
    'neon.business_partner_industry_classification.read',
    'neon.business_partner_operating_organization_assignment.read',
    'neon.business_partner_qualification.read',
    'neon.business_partner_tax_registration.read'
  ];
  ref record;
  dependencies bigint;
BEGIN
  PERFORM set_config('row_security','off',true);
  IF current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' THEN
    RAISE EXCEPTION 'BP child-read baseline correction requires Neon';
  END IF;
  LOCK TABLE authz.permission IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE runtime_meta.release_activation_head IN SHARE MODE;
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code=ANY(codes))<>7 THEN
    RAISE EXCEPTION 'BP child-read baseline catalog is incomplete';
  END IF;
  -- A populated target needs per-tenant reconciliation, never a bootstrap shortcut.
  IF EXISTS (SELECT 1 FROM runtime_meta.release_activation_head) THEN
    RAISE EXCEPTION 'BP child-read baseline correction refuses active publications';
  END IF;
  FOR ref IN
    SELECT c.conrelid::regclass relation,a.attname column_name
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.contype='f' AND c.confrelid='authz.permission'::regclass
      AND c.conrelid<>'authz.permission_scope_kind'::regclass
  LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',ref.relation);
    EXECUTE format('SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM authz.permission WHERE canonical_code=ANY($1))',ref.relation,ref.column_name)
      INTO dependencies USING codes;
    IF dependencies>0 THEN
      RAISE EXCEPTION 'BP child-read baseline correction refuses existing dependencies in %',ref.relation;
    END IF;
  END LOOP;
  -- The installed lifecycle/audit triggers own transition evidence. Retired is
  -- terminal: replaying a seed that republishes a retired code must fail.
  UPDATE authz.permission SET status='retired',updated_by='00000000-0000-0000-0000-000000000000'::uuid
    WHERE canonical_code=ANY(codes) AND status<>'retired';
END $correction$;
