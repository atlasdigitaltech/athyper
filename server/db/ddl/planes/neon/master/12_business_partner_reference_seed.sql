INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
SELECT value.code, value.name, value.description, 'master', true,
       '{"configurability":"tenant_extensible"}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('master.business_partner_relationship_type', 'Business Partner Relationship Type',
     'Commercial relationship between two business partners.'),
    ('master.business_partner_governance_role', 'Business Partner Governance Role',
     'Ownership, control, leadership, and authority roles.'),
    ('master.business_partner_identifier_scheme', 'Business Partner Identifier Scheme',
     'External legal, registry, and network identifier schemes.'),
    ('master.business_partner_tax_registration_type', 'Business Partner Tax Registration Type',
     'Tax-registration kinds recorded by jurisdiction.')
) AS value(code, name, description)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = 'master',
    is_extensible = true,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, category, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, value.domain_code, value.category,
       value.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('affiliate', 'Affiliate', 'master.business_partner_relationship_type', 'corporate', 10::smallint),
    ('parent', 'Parent', 'master.business_partner_relationship_type', 'corporate', 20::smallint),
    ('subsidiary', 'Subsidiary', 'master.business_partner_relationship_type', 'corporate', 30::smallint),
    ('distributor', 'Distributor', 'master.business_partner_relationship_type', 'commercial', 40::smallint),
    ('reseller', 'Reseller', 'master.business_partner_relationship_type', 'commercial', 50::smallint),
    ('agent', 'Agent', 'master.business_partner_relationship_type', 'commercial', 60::smallint),
    ('joint_venture', 'Joint Venture', 'master.business_partner_relationship_type', 'corporate', 70::smallint),

    ('shareholder', 'Shareholder', 'master.business_partner_governance_role', 'ownership', 10::smallint),
    ('beneficial_owner', 'Beneficial Owner', 'master.business_partner_governance_role', 'ownership', 20::smallint),
    ('director', 'Director', 'master.business_partner_governance_role', 'leadership', 30::smallint),
    ('officer', 'Officer', 'master.business_partner_governance_role', 'leadership', 40::smallint),
    ('authorized_signatory', 'Authorized Signatory', 'master.business_partner_governance_role', 'authority', 50::smallint),

    ('business_registration', 'Business Registration', 'master.business_partner_identifier_scheme', 'legal', 10::smallint),
    ('duns', 'DUNS', 'master.business_partner_identifier_scheme', 'registry', 20::smallint),
    ('lei', 'LEI', 'master.business_partner_identifier_scheme', 'registry', 30::smallint),
    ('gln', 'GLN', 'master.business_partner_identifier_scheme', 'network', 40::smallint),
    ('peppol_id', 'Peppol ID', 'master.business_partner_identifier_scheme', 'network', 50::smallint),
    ('mesh_account', 'Mesh Account', 'master.business_partner_identifier_scheme', 'network', 60::smallint),

    ('vat', 'VAT', 'master.business_partner_tax_registration_type', 'indirect_tax', 10::smallint),
    ('gst', 'GST', 'master.business_partner_tax_registration_type', 'indirect_tax', 20::smallint),
    ('sales_tax', 'Sales Tax', 'master.business_partner_tax_registration_type', 'indirect_tax', 30::smallint),
    ('service_tax', 'Service Tax', 'master.business_partner_tax_registration_type', 'indirect_tax', 40::smallint),
    ('withholding_tax', 'Withholding Tax', 'master.business_partner_tax_registration_type', 'withholding', 50::smallint),
    ('taxpayer_id', 'Taxpayer ID', 'master.business_partner_tax_registration_type', 'direct_tax', 60::smallint)
) AS value(code, name, domain_code, category, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    status = 'active';
