-- HR policy applicability is an effective-dated assignment of an immutable
-- control.policy_definition version. The selected definition is copied into
-- the assignment for reproducible historical explanation.
CREATE TABLE master.hr_policy_assignment (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  command_key_hash text NOT NULL,
  policy_definition_id uuid NOT NULL REFERENCES control.policy_definition(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  policy_version_no integer NOT NULL,
  definition_hash text NOT NULL,
  scope_kind text NOT NULL,
  country_code char(2) NOT NULL,
  company_code_id uuid,
  site_id uuid,
  effective_from date NOT NULL,
  effective_until date,
  status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT hr_policy_assignment_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT hr_policy_assignment_command_key_uq UNIQUE(tenant_id,command_key_hash),
  CONSTRAINT hr_policy_assignment_command_key_chk CHECK(command_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT hr_policy_assignment_company_fk FOREIGN KEY(tenant_id,company_code_id)
    REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT hr_policy_assignment_site_fk FOREIGN KEY(tenant_id,site_id)
    REFERENCES master.site(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT hr_policy_assignment_scope_chk CHECK(
    (scope_kind='country' AND company_code_id IS NULL AND site_id IS NULL) OR
    (scope_kind='company' AND company_code_id IS NOT NULL AND site_id IS NULL) OR
    (scope_kind='site' AND company_code_id IS NOT NULL AND site_id IS NOT NULL)
  ),
  CONSTRAINT hr_policy_assignment_country_chk CHECK(country_code::text ~ '^[A-Z]{2}$'),
  CONSTRAINT hr_policy_assignment_entity_chk CHECK(entity_type ~ '^hr\.[a-z][a-z0-9_.-]+$'),
  CONSTRAINT hr_policy_assignment_version_chk CHECK(policy_version_no>0 AND row_version>0),
  CONSTRAINT hr_policy_assignment_hash_chk CHECK(definition_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT hr_policy_assignment_dates_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT hr_policy_assignment_status_chk CHECK(status IN('draft','active','retired')),
  CONSTRAINT hr_policy_assignment_approval_chk CHECK(
    (status='draft' AND approved_by IS NULL AND approved_at IS NULL) OR
    (status IN('active','retired') AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>created_by)
  ),
  CONSTRAINT hr_policy_assignment_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX hr_policy_assignment_lookup_idx ON master.hr_policy_assignment
  (tenant_id,entity_type,country_code,company_code_id,site_id,effective_from DESC)
  WHERE status='active';
-- NULL scope dimensions are normalized only for exclusion comparison. Ranges
-- are [from,until), matching employment and assignment effective dates.
ALTER TABLE master.hr_policy_assignment ADD CONSTRAINT hr_policy_assignment_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    entity_type WITH =,
    scope_kind WITH =,
    country_code WITH =,
    (coalesce(company_code_id,'00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    (coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    daterange(effective_from,effective_until,'[)') WITH &&
  ) WHERE(status='active');
-- A published fact may be retired, but its selected definition, scope,
-- effective interval and approval evidence cannot be rewritten.
CREATE FUNCTION master.hr_policy_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition control.policy_definition%ROWTYPE; company_country char(2); site_company uuid; site_country char(2);
BEGIN
  IF TG_OP='UPDATE' AND OLD.status<>'draft' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.policy_definition_id IS DISTINCT FROM OLD.policy_definition_id
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.policy_version_no IS DISTINCT FROM OLD.policy_version_no
       OR NEW.definition_hash IS DISTINCT FROM OLD.definition_hash OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
       OR NEW.country_code IS DISTINCT FROM OLD.country_code OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_until IS DISTINCT FROM OLD.effective_until OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR (OLD.status='retired' AND NEW.status IS DISTINCT FROM OLD.status)
      THEN RAISE EXCEPTION 'Published HR policy assignment facts are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT * INTO definition FROM control.policy_definition WHERE id=NEW.policy_definition_id;
  IF NOT FOUND OR (definition.tenant_id IS NOT NULL AND definition.tenant_id<>NEW.tenant_id)
     OR definition.entity_type<>NEW.entity_type OR definition.version_no<>NEW.policy_version_no
     OR definition.definition_hash<>NEW.definition_hash OR definition.status<>'active'
     OR NEW.effective_from<definition.effective_from
     OR (definition.effective_until IS NOT NULL AND (NEW.effective_until IS NULL OR NEW.effective_until>definition.effective_until))
    THEN RAISE EXCEPTION 'HR policy definition/version is incompatible with the assignment' USING ERRCODE='23514';
  END IF;
  IF NEW.company_code_id IS NOT NULL THEN
    SELECT country_code INTO company_country FROM master.company_code
      WHERE tenant_id=NEW.tenant_id AND id=NEW.company_code_id AND status='active';
    IF NOT FOUND OR company_country IS DISTINCT FROM NEW.country_code
      THEN RAISE EXCEPTION 'HR policy company/country mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.site_id IS NOT NULL THEN
    SELECT company_code_id,country_code INTO site_company,site_country FROM master.site
      WHERE tenant_id=NEW.tenant_id AND id=NEW.site_id AND status='active';
    IF NOT FOUND OR site_company IS DISTINCT FROM NEW.company_code_id OR site_country IS DISTINCT FROM NEW.country_code
      THEN RAISE EXCEPTION 'HR policy site/company/country mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_policy_assignment_guard BEFORE INSERT OR UPDATE ON master.hr_policy_assignment
  FOR EACH ROW EXECUTE FUNCTION master.hr_policy_assignment_guard();
ALTER TABLE master.hr_policy_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.hr_policy_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.hr_policy_assignment FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON master.hr_policy_assignment FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON master.hr_policy_assignment TO athyperapp;
