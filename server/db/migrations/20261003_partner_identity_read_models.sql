BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Read-only Entity projections. No permission grants or publication activation.
CREATE OR REPLACE VIEW master.v_partner_identity_read
WITH (security_invoker=true, security_barrier=true) AS
SELECT
       bp.tenant_id AS tenant_id,
       bp.supplier_enabled AS supplier_enabled,
       bp.customer_enabled AS customer_enabled,
       bp.id AS id,
       bp.code AS code,
       bp.name AS name,
       org.legal_name AS legal_name,
       org.registration_country_code AS registration_country_code,
       bp.partner_category AS partner_category,
       bp.ownership_class AS ownership_class,
       org.incorporation_date AS incorporation_date,
       bp.website_url AS website_url,
       bp.description AS description,
       bp.status AS status,
       bp.record_version AS record_version,
       org.legal_form_value_id AS legal_form_value_id,
       org.business_type_value_id AS business_type_value_id,
       org.founded_year AS founded_year,
       org.employee_count AS employee_count,
       org.employee_count_as_of AS employee_count_as_of,
       org.employee_count_scope AS employee_count_scope,
       legal_form.name AS legal_form_label,
       business_type.name AS business_type_label,
       bp.legal_classification AS legal_classification,
       person.code AS person_code,
       person.first_name AS person_first_name,
       person.middle_name AS person_middle_name,
       person.last_name AS person_last_name,
       person.preferred_name AS person_preferred_name,
       bp.is_active AS is_active,
       bp.updated_at AS updated_at
FROM master.business_partner bp
LEFT JOIN master.business_partner_organization_identity org ON org.tenant_id=bp.tenant_id AND org.business_partner_id=bp.id AND bp.partner_category='organization'
LEFT JOIN master.person person ON person.tenant_id=bp.tenant_id AND person.id=bp.person_id
LEFT JOIN control.lookup_value legal_form ON legal_form.id=org.legal_form_value_id
  AND legal_form.domain_code='master.legal_form'
  AND (legal_form.tenant_id IS NULL OR legal_form.tenant_id=bp.tenant_id)
LEFT JOIN control.lookup_value business_type ON business_type.id=org.business_type_value_id
  AND business_type.domain_code='master.business_type'
  AND (business_type.tenant_id IS NULL OR business_type.tenant_id=bp.tenant_id);

CREATE OR REPLACE VIEW master.v_partner_identifier_read
WITH (security_invoker=true, security_barrier=true) AS
SELECT
       source.tenant_id AS tenant_id,
       source.id AS id,
       source.business_partner_id AS business_partner_id,
       CASE WHEN source.identifier_value IS NULL THEN NULL ELSE '••••'::text END AS identifier_value,
       source.scheme_code AS scheme_code,
       source.issuing_country_code AS issuing_country_code,
       source.issued_at AS issued_at,
       source.effective_until AS effective_until
FROM master.business_partner_identifier source;

CREATE OR REPLACE VIEW master.v_partner_tax_read
WITH (security_invoker=true, security_barrier=true) AS
SELECT
       source.tenant_id AS tenant_id,
       source.id AS id,
       source.business_partner_id AS business_partner_id,
       source.registration_type_code AS registration_type_code,
       source.jurisdiction_id AS jurisdiction_id,
       source.tax_type_id AS tax_type_id,
       CASE WHEN source.registration_number IS NULL THEN NULL ELSE '••••'::text END AS registration_number,
       source.effective_from AS effective_from,
       source.effective_until AS effective_until
FROM master.business_partner_tax_registration source;

REVOKE ALL ON master.v_partner_identity_read, master.v_partner_identifier_read, master.v_partner_tax_read FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON master.v_partner_identity_read, master.v_partner_identifier_read, master.v_partner_tax_read TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT ON master.v_partner_identity_read, master.v_partner_identifier_read, master.v_partner_tax_read TO athyperadmin;
  END IF;
END $$;
COMMIT;
