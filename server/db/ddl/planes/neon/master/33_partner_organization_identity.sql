-- Canonical clean-install organization storage; no header shadow columns.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM master.business_partner) THEN
    RAISE EXCEPTION 'Organization identity baseline requires an empty partner store; this is not a live migration';
  END IF;
END $$;
CREATE TABLE master.business_partner_organization_identity (
    business_partner_id uuid NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    legal_name text NOT NULL,
    legal_form_value_id uuid REFERENCES control.lookup_value(id) ON DELETE RESTRICT,
    registration_country_code character(2) REFERENCES shared.country(code) ON DELETE RESTRICT,
    incorporation_date date,
    business_type_value_id uuid REFERENCES control.lookup_value(id) ON DELETE RESTRICT,
    founded_year smallint,
    employee_count integer,
    employee_count_as_of date,
    employee_count_scope text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT business_partner_org_identity_tenant_uq UNIQUE (tenant_id,business_partner_id),
    CONSTRAINT business_partner_org_identity_partner_fk FOREIGN KEY (tenant_id,business_partner_id)
      REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT business_partner_org_identity_creator_fk FOREIGN KEY (tenant_id,created_by)
      REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT business_partner_org_identity_updater_fk FOREIGN KEY (tenant_id,updated_by)
      REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    CONSTRAINT business_partner_org_identity_name_chk CHECK (btrim(legal_name)<>'' AND length(legal_name)<=320),
    CONSTRAINT business_partner_org_identity_country_chk CHECK(registration_country_code IS NULL OR registration_country_code::text ~ '^[A-Z]{2}$'),
    CONSTRAINT business_partner_org_identity_founded_chk CHECK(founded_year IS NULL OR founded_year BETWEEN 1 AND 9999),
    CONSTRAINT business_partner_org_identity_count_chk CHECK(employee_count IS NULL OR employee_count>=0),
    CONSTRAINT business_partner_org_identity_count_tuple_chk CHECK (
      (employee_count IS NULL AND employee_count_as_of IS NULL AND employee_count_scope IS NULL) OR
      (employee_count IS NOT NULL AND employee_count_as_of IS NOT NULL AND employee_count_scope IS NOT NULL AND employee_count_scope IN ('organization','consolidated_group'))),
    CONSTRAINT business_partner_org_identity_audit_chk CHECK ((updated_at IS NULL)=(updated_by IS NULL))
);
CREATE INDEX business_partner_org_identity_country_idx
  ON master.business_partner_organization_identity(tenant_id,registration_country_code) WHERE registration_country_code IS NOT NULL;

ALTER TABLE master.business_partner_organization_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.business_partner_organization_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.business_partner_organization_identity
  USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON master.business_partner_organization_identity TO CURRENT_USER
  USING (true) WITH CHECK (true);

-- Legacy pinned creation contracts supply name as the registered name. Initialize
-- the subtype once; later display-name updates must never overwrite legal_name.
CREATE FUNCTION master.trg_initialize_partner_organization_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,master SET row_security=on AS $$
BEGIN
  IF NEW.partner_category::text='organization' THEN
    INSERT INTO master.business_partner_organization_identity(tenant_id,business_partner_id,legal_name,created_by)
      VALUES(NEW.tenant_id,NEW.id,NEW.name,NEW.created_by);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_partner_initialize_organization_identity
  AFTER INSERT ON master.business_partner FOR EACH ROW
  EXECUTE FUNCTION master.trg_initialize_partner_organization_identity();

CREATE FUNCTION master.trg_guard_partner_organization_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,master SET row_security=on AS $$
DECLARE category text; selection record;
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.business_partner_id,NEW.created_at,NEW.created_by)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.business_partner_id,OLD.created_at,OLD.created_by) THEN
    RAISE EXCEPTION 'Organization identity coordinates are immutable' USING ERRCODE='23514';
  END IF;
  SELECT partner_category::text INTO category FROM master.business_partner
    WHERE tenant_id=NEW.tenant_id AND id=NEW.business_partner_id FOR UPDATE;
  IF category IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'Organization identity requires an organization partner' USING ERRCODE='23514';
  END IF;
  NEW.legal_name:=btrim(NEW.legal_name);
  NEW.registration_country_code:=nullif(upper(btrim(NEW.registration_country_code::text)),'')::character(2);
  IF NEW.founded_year>extract(year FROM CURRENT_DATE) OR NEW.employee_count_as_of>CURRENT_DATE THEN
    RAISE EXCEPTION 'Organization profile dates cannot be in the future' USING ERRCODE='23514';
  END IF;
  FOR selection IN SELECT * FROM (VALUES
    ('master.legal_form',NEW.legal_form_value_id,CASE WHEN TG_OP='UPDATE' THEN OLD.legal_form_value_id ELSE NULL END),
    ('master.business_type',NEW.business_type_value_id,CASE WHEN TG_OP='UPDATE' THEN OLD.business_type_value_id ELSE NULL END)
  ) AS choices(domain_code,value_id,old_value_id) LOOP
    IF selection.value_id IS NOT NULL AND (TG_OP='INSERT' OR selection.value_id IS DISTINCT FROM selection.old_value_id) THEN
      PERFORM 1 FROM control.lookup_value v JOIN control.lookup_domain d ON d.code=v.domain_code
        WHERE v.id=selection.value_id AND v.domain_code=selection.domain_code
          AND (v.tenant_id IS NULL OR v.tenant_id=NEW.tenant_id) AND v.status='active' AND d.status='active' FOR SHARE OF v,d;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid organization lookup selection' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  IF TG_OP='UPDATE' THEN
    IF NEW.updated_by IS NULL OR NEW.updated_by IS DISTINCT FROM master.current_principal_id_soft() THEN
      RAISE EXCEPTION 'Organization identity actor mismatch' USING ERRCODE='42501';
    END IF;
    IF ROW(NEW.legal_name,NEW.legal_form_value_id,NEW.registration_country_code,NEW.incorporation_date,
      NEW.business_type_value_id,NEW.founded_year,NEW.employee_count,NEW.employee_count_as_of,NEW.employee_count_scope)
      IS NOT DISTINCT FROM ROW(OLD.legal_name,OLD.legal_form_value_id,OLD.registration_country_code,OLD.incorporation_date,
      OLD.business_type_value_id,OLD.founded_year,OLD.employee_count,OLD.employee_count_as_of,OLD.employee_count_scope) THEN RETURN OLD; END IF;
    NEW.updated_at:=clock_timestamp();
    -- The existing header trigger owns the aggregate version increment.
    UPDATE master.business_partner SET updated_at=NEW.updated_at,updated_by=NEW.updated_by
      WHERE tenant_id=NEW.tenant_id AND id=NEW.business_partner_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_partner_organization_identity_guard
  BEFORE INSERT OR UPDATE ON master.business_partner_organization_identity FOR EACH ROW
  EXECUTE FUNCTION master.trg_guard_partner_organization_identity();

CREATE FUNCTION master.trg_check_partner_organization_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,master SET row_security=on AS $$
DECLARE partner uuid; tenant uuid; category text; present boolean;
BEGIN
  IF TG_TABLE_NAME='business_partner' THEN partner:=NEW.id;tenant:=NEW.tenant_id;
  ELSIF TG_OP='DELETE' THEN partner:=OLD.business_partner_id;tenant:=OLD.tenant_id;
  ELSE partner:=NEW.business_partner_id;tenant:=NEW.tenant_id; END IF;
  SELECT partner_category::text INTO category FROM master.business_partner WHERE tenant_id=tenant AND id=partner FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM master.business_partner_organization_identity
    WHERE tenant_id=tenant AND business_partner_id=partner) INTO present;
  IF (category='organization') IS DISTINCT FROM present THEN
    RAISE EXCEPTION 'Partner organization subtype is missing or incompatible' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER business_partner_organization_identity_required
  AFTER INSERT OR UPDATE ON master.business_partner DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION master.trg_check_partner_organization_identity();
CREATE CONSTRAINT TRIGGER business_partner_organization_identity_consistent
  AFTER INSERT OR UPDATE OR DELETE ON master.business_partner_organization_identity DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION master.trg_check_partner_organization_identity();

-- Compatibility is a read projection, never a second editable store.
CREATE VIEW master.business_partner_identity_current WITH (security_invoker=true) AS
 SELECT bp.*,
   (SELECT r.target_business_partner_id FROM master.business_partner_relationship r
    WHERE r.tenant_id=bp.tenant_id AND r.source_business_partner_id=bp.id AND r.relationship_type_code='parent'
    AND r.status='active' AND r.effective_from<=CURRENT_DATE AND (r.effective_until IS NULL OR r.effective_until>CURRENT_DATE)) AS parent_business_partner_id,
   org.legal_name,org.legal_form_value_id,form.code AS legal_form,
   org.registration_country_code,org.incorporation_date,org.business_type_value_id,
   org.founded_year,org.employee_count,org.employee_count_as_of,org.employee_count_scope
 FROM master.business_partner bp
 LEFT JOIN master.business_partner_organization_identity org ON org.tenant_id=bp.tenant_id AND org.business_partner_id=bp.id AND bp.partner_category='organization'
 LEFT JOIN control.lookup_value form ON form.id=org.legal_form_value_id;

CREATE FUNCTION master.update_business_partner_organization_identity(p_tenant uuid,p_partner uuid,p_patch jsonb,p_actor uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,master,control,shared SET row_security=on AS $$
DECLARE form_id uuid; form_code text;
BEGIN
  IF shared.current_tenant_id() IS DISTINCT FROM p_tenant OR master.current_principal_id_soft() IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Organization identity context mismatch' USING ERRCODE='42501'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch-ARRAY['legalName','legalForm','legalFormValueId','registrationCountryCode','incorporationDate','businessTypeValueId','foundedYear','employeeCount','employeeCountAsOf','employeeCountScope']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Unsupported organization identity patch' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE
    (e.key IN ('foundedYear','employeeCount') AND jsonb_typeof(e.value) NOT IN ('number','null')) OR
    (e.key NOT IN ('foundedYear','employeeCount') AND jsonb_typeof(e.value) NOT IN ('string','null'))) THEN
    RAISE EXCEPTION 'Invalid organization identity field type' USING ERRCODE='23514'; END IF;
  IF nullif(p_patch->>'registrationCountryCode','') IS NOT NULL AND
     (p_patch->>'registrationCountryCode') !~ '^[A-Za-z]{2}$' THEN
    RAISE EXCEPTION 'Invalid registration country code' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM master.business_partner WHERE tenant_id=p_tenant AND id=p_partner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner unavailable' USING ERRCODE='P0002'; END IF;
  IF p_patch ? 'legalForm' THEN
    form_code:=nullif(lower(btrim(p_patch->>'legalForm')),'');
    IF form_code='private_limited_company' THEN form_code:='private_limited'; END IF;
    IF form_code IS NOT NULL THEN
      -- Retaining an existing selection is not a new selection, even if retired.
      SELECT v.id INTO form_id FROM master.business_partner_organization_identity i
        JOIN control.lookup_value v ON v.id=i.legal_form_value_id
        WHERE i.tenant_id=p_tenant AND i.business_partner_id=p_partner AND v.code=form_code;
      IF NOT FOUND THEN
        SELECT v.id INTO form_id FROM control.lookup_value v JOIN control.lookup_domain d ON d.code=v.domain_code
        WHERE v.domain_code='master.legal_form' AND v.code=form_code AND v.status='active' AND d.status='active'
          AND (v.tenant_id IS NULL OR v.tenant_id=p_tenant) ORDER BY (v.tenant_id IS NOT NULL) DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'Unknown legal form code' USING ERRCODE='23514'; END IF;
      END IF;
    END IF;
    IF p_patch ? 'legalFormValueId' AND (p_patch->>'legalFormValueId')::uuid IS DISTINCT FROM form_id THEN
      RAISE EXCEPTION 'Legal form code and ID disagree' USING ERRCODE='23514'; END IF;
  ELSE form_id:=(p_patch->>'legalFormValueId')::uuid; END IF;
  UPDATE master.business_partner_organization_identity SET
    legal_name=CASE WHEN p_patch?'legalName' THEN p_patch->>'legalName' ELSE legal_name END,
    legal_form_value_id=CASE WHEN p_patch?'legalForm' OR p_patch?'legalFormValueId' THEN form_id ELSE legal_form_value_id END,
    registration_country_code=CASE WHEN p_patch?'registrationCountryCode' THEN nullif(p_patch->>'registrationCountryCode','')::character(2) ELSE registration_country_code END,
    incorporation_date=CASE WHEN p_patch?'incorporationDate' THEN nullif(p_patch->>'incorporationDate','')::date ELSE incorporation_date END,
    business_type_value_id=CASE WHEN p_patch?'businessTypeValueId' THEN (p_patch->>'businessTypeValueId')::uuid ELSE business_type_value_id END,
    founded_year=CASE WHEN p_patch?'foundedYear' THEN (p_patch->>'foundedYear')::smallint ELSE founded_year END,
    employee_count=CASE WHEN p_patch?'employeeCount' THEN (p_patch->>'employeeCount')::integer ELSE employee_count END,
    employee_count_as_of=CASE WHEN p_patch?'employeeCountAsOf' THEN (p_patch->>'employeeCountAsOf')::date ELSE employee_count_as_of END,
    employee_count_scope=CASE WHEN p_patch?'employeeCountScope' THEN p_patch->>'employeeCountScope' ELSE employee_count_scope END,
    updated_by=p_actor
    WHERE tenant_id=p_tenant AND business_partner_id=p_partner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization identity unavailable' USING ERRCODE='P0002'; END IF;
END $$;

REVOKE ALL ON master.business_partner_organization_identity FROM PUBLIC;
REVOKE ALL ON master.business_partner_identity_current FROM PUBLIC;
REVOKE ALL ON FUNCTION master.update_business_partner_organization_identity(uuid,uuid,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION master.trg_initialize_partner_organization_identity(),
  master.trg_guard_partner_organization_identity(),master.trg_check_partner_organization_identity() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON master.business_partner_organization_identity,master.business_partner_identity_current TO athyperapp;
    GRANT UPDATE(legal_name,legal_form_value_id,registration_country_code,incorporation_date,business_type_value_id,founded_year,employee_count,employee_count_as_of,employee_count_scope,updated_by) ON master.business_partner_organization_identity TO athyperapp;
    GRANT EXECUTE ON FUNCTION master.update_business_partner_organization_identity(uuid,uuid,jsonb,uuid) TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT ON master.business_partner_organization_identity,master.business_partner_identity_current TO athyperadmin;
    GRANT UPDATE(legal_name,legal_form_value_id,registration_country_code,incorporation_date,business_type_value_id,founded_year,employee_count,employee_count_as_of,employee_count_scope,updated_by) ON master.business_partner_organization_identity TO athyperadmin;
    GRANT EXECUTE ON FUNCTION master.update_business_partner_organization_identity(uuid,uuid,jsonb,uuid) TO athyperadmin;
  END IF;
END $$;
COMMENT ON COLUMN master.business_partner.name IS 'Partner display label; organization legal name is owned by business_partner_organization_identity.';
COMMENT ON TABLE master.business_partner_organization_identity IS 'Single tenant-consistent organization identity/profile authority. Partner header owns display and lifecycle; legal form text is derived from the controlled lookup.';
