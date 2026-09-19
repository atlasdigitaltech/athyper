-- Optional organization attributes belong to the canonical Business Partner row.
-- A single primary business type is intentional for this initial scope.
ALTER TABLE master.business_partner
    ADD COLUMN legal_form_value_id uuid REFERENCES control.lookup_value(id),
    ADD COLUMN business_type_value_id uuid REFERENCES control.lookup_value(id),
    ADD COLUMN founded_year smallint,
    ADD COLUMN employee_count integer,
    ADD COLUMN employee_count_as_of date,
    ADD COLUMN employee_count_scope text,
    ADD CONSTRAINT business_partner_founded_year_check CHECK (founded_year IS NULL OR founded_year BETWEEN 1 AND 9999),
    ADD CONSTRAINT business_partner_employee_count_check CHECK (employee_count IS NULL OR employee_count >= 0),
    ADD CONSTRAINT business_partner_employee_count_evidence_check
      CHECK ((employee_count IS NULL AND employee_count_as_of IS NULL AND employee_count_scope IS NULL)
        OR (employee_count IS NOT NULL AND employee_count_as_of IS NOT NULL AND employee_count_scope IN ('organization', 'consolidated_group')));

CREATE FUNCTION master.guard_business_partner_organization_attributes() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,master,control,shared AS $$
DECLARE selected_code text;
BEGIN
    IF TG_OP='UPDATE' AND NEW.legal_form_value_id IS NOT DISTINCT FROM OLD.legal_form_value_id
       AND NEW.legal_form IS NOT DISTINCT FROM OLD.legal_form AND NEW.business_type_value_id IS NOT DISTINCT FROM OLD.business_type_value_id
       AND NEW.partner_category IS NOT DISTINCT FROM OLD.partner_category AND NEW.founded_year IS NOT DISTINCT FROM OLD.founded_year
       AND NEW.employee_count IS NOT DISTINCT FROM OLD.employee_count AND NEW.employee_count_as_of IS NOT DISTINCT FROM OLD.employee_count_as_of
       AND NEW.employee_count_scope IS NOT DISTINCT FROM OLD.employee_count_scope THEN RETURN NEW; END IF;
    IF NEW.partner_category::text <> 'organization' AND (NEW.legal_form_value_id IS NOT NULL OR NEW.business_type_value_id IS NOT NULL
       OR NEW.founded_year IS NOT NULL OR NEW.employee_count IS NOT NULL OR NEW.employee_count_as_of IS NOT NULL OR NEW.employee_count_scope IS NOT NULL) THEN
        RAISE EXCEPTION 'Organization attributes require organizational Business Partner' USING ERRCODE='23514';
    END IF;
    IF NEW.founded_year > extract(year FROM CURRENT_DATE) OR NEW.employee_count_as_of > CURRENT_DATE THEN
        RAISE EXCEPTION 'Organization profile dates cannot be in the future' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NEW.legal_form_value_id IS DISTINCT FROM OLD.legal_form_value_id AND NEW.legal_form_value_id IS NULL THEN NEW.legal_form:=NULL;
    ELSIF TG_OP='UPDATE' AND NEW.legal_form IS DISTINCT FROM OLD.legal_form AND NEW.legal_form_value_id IS NOT DISTINCT FROM OLD.legal_form_value_id THEN NEW.legal_form_value_id:=NULL;
    END IF;
    IF NEW.legal_form_value_id IS NULL AND NEW.legal_form IS NOT NULL THEN
        SELECT v.id INTO NEW.legal_form_value_id FROM control.lookup_value v WHERE v.domain_code='master.legal_form' AND v.code=NEW.legal_form
          AND v.status='active' AND (v.tenant_id IS NULL OR v.tenant_id=NEW.tenant_id) ORDER BY (v.tenant_id IS NOT NULL) DESC LIMIT 1;
        IF NEW.legal_form_value_id IS NULL THEN RAISE EXCEPTION 'Legal form must be a registered lookup code' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.legal_form_value_id IS NOT NULL THEN
        SELECT v.code INTO selected_code FROM control.lookup_value v JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.id=NEW.legal_form_value_id
          AND v.domain_code='master.legal_form' AND (v.tenant_id IS NULL OR v.tenant_id=NEW.tenant_id) AND v.status='active' AND d.status='active' FOR SHARE OF v,d;
        IF NOT FOUND THEN RAISE EXCEPTION 'Invalid legal form lookup' USING ERRCODE='23514'; END IF;
        NEW.legal_form:=selected_code;
    ELSE NEW.legal_form:=NULL;
    END IF;
    IF NEW.business_type_value_id IS NOT NULL THEN
        PERFORM 1 FROM control.lookup_value v JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.id=NEW.business_type_value_id
          AND v.domain_code='master.business_type' AND (v.tenant_id IS NULL OR v.tenant_id=NEW.tenant_id) AND v.status='active' AND d.status='active' FOR SHARE OF v,d;
        IF NOT FOUND THEN RAISE EXCEPTION 'Invalid business type lookup' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER business_partner_organization_attributes_guard
BEFORE INSERT OR UPDATE OF legal_form, legal_form_value_id, business_type_value_id, partner_category, founded_year, employee_count, employee_count_as_of, employee_count_scope
ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.guard_business_partner_organization_attributes();

REVOKE ALL ON FUNCTION master.guard_business_partner_organization_attributes() FROM PUBLIC;
COMMENT ON COLUMN master.business_partner.legal_form_value_id IS 'Controlled master.legal_form lookup. Historical unresolved legal_form text is retained until explicit normalization.';
COMMENT ON COLUMN master.business_partner.business_type_value_id IS 'Optional primary master.business_type lookup. Multi-type classification is deferred until a demonstrated domain need.';
COMMENT ON COLUMN master.business_partner.founded_year IS 'Optional organization founding year; distinct from incorporation_date.';
COMMENT ON COLUMN master.business_partner.employee_count IS 'Optional external organization headcount. Requires reporting date and scope.';
COMMENT ON COLUMN master.business_partner.employee_count_as_of IS 'As-of date for employee_count.';
COMMENT ON COLUMN master.business_partner.employee_count_scope IS 'Whether employee_count describes the organization or a consolidated group.';
