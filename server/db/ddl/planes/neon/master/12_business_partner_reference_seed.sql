-- seed-contract-version: 1
-- seed-pack: neon.master.partner-reference
-- seed-pack-version: 1.0.0
-- seed-dataset: control.lookup_domain
-- seed-data-class: production_reference
-- seed-provenance: {"source":"existing-repository-reference-data","publisher":"Athyper","source_version":"1","retrieved_at":"2026-09-30","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code);control.owner_type(code);control.owner_type_purpose(owner_type_id,capability,purpose_code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: minimum:6
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$ BEGIN
 IF COALESCE(current_setting('app.database_plane', true),'') NOT IN ('neon') THEN
  RAISE EXCEPTION 'neon.master.partner-reference: invalid database plane';
 END IF;
END $seed_plane_guard$;

-- A submitted bank address belongs to the provisional reference, not the partner.
INSERT INTO control.owner_type (
 tenant_id,code,name,description,category,source_type,target_schema,target_table,
 pk_column,is_tenant_scoped,tenant_column,supports_address,supports_contact,
 supports_external_reference,sort_order,status,created_by
) VALUES (
 NULL,'bank_provisional_reference','Provisional bank reference','Pending bank-directory identification.',
 'asset','platform','master','bank_provisional_reference','id',true,'tenant_id',true,false,false,37,'active',
 '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    source_type = EXCLUDED.source_type,
    target_schema = EXCLUDED.target_schema,
    target_table = EXCLUDED.target_table,
    pk_column = EXCLUDED.pk_column,
    is_tenant_scoped = EXCLUDED.is_tenant_scoped,
    tenant_column = EXCLUDED.tenant_column,
    supports_address = EXCLUDED.supports_address,
    supports_contact = EXCLUDED.supports_contact,
    supports_external_reference = EXCLUDED.supports_external_reference,
    sort_order = EXCLUDED.sort_order,
    status = EXCLUDED.status
WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, EXCLUDED.supports_contact, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, EXCLUDED.status);
INSERT INTO control.owner_type_purpose(owner_type_id,capability,purpose_code,created_by)
 SELECT id,'address','default','00000000-0000-0000-0000-000000000000'::uuid
 FROM control.owner_type WHERE tenant_id IS NULL AND code='bank_provisional_reference'
ON CONFLICT (owner_type_id, capability, purpose_code) DO NOTHING;

INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
SELECT value.code, value.name, value.description, 'master', true,
       '{"configurability":"tenant_extensible"}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('master.supplier_type', 'Supplier Type',
     'Governed procurement role classification for a supplier.'),
    ('master.customer_type', 'Customer Type',
     'Governed sales role classification for a customer.'),
    ('master.business_partner_relationship_type', 'Business Partner Relationship Type',
     'Commercial relationship between two business partners.'),
    ('master.business_partner_governance_role', 'Business Partner Governance Role',
     'Ownership, control, leadership, and authority roles.'),
    ('master.business_partner_identifier_scheme', 'Business Partner Identifier Scheme',
     'External legal, registry, and network identifier schemes.'),
    ('master.business_partner_tax_registration_type', 'Business Partner Tax Registration Type',
     'Tax-registration kinds recorded by jurisdiction.')
) AS value(code, name, description)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = 'master',
    is_extensible = true,
    metadata = EXCLUDED.metadata,
    status = 'active'
WHERE (control.lookup_domain.name, control.lookup_domain.description, control.lookup_domain.source_schema, control.lookup_domain.is_extensible, control.lookup_domain.metadata, control.lookup_domain.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, 'master', true, EXCLUDED.metadata, 'active');

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, category, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, value.domain_code, value.category,
       value.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('general', 'General', 'master.supplier_type', 'commercial', 10::smallint),
    ('strategic', 'Strategic', 'master.supplier_type', 'commercial', 20::smallint),
    ('service', 'Service Provider', 'master.supplier_type', 'commercial', 30::smallint),
    ('carrier', 'Carrier', 'master.supplier_type', 'logistics', 40::smallint),
    ('intercompany', 'Intercompany', 'master.supplier_type', 'internal', 50::smallint),

    ('corporate', 'Corporate', 'master.customer_type', 'organization', 10::smallint),
    ('government', 'Government', 'master.customer_type', 'organization', 20::smallint),
    ('individual', 'Individual (legacy)', 'master.customer_type', 'legacy', 30::smallint),
    ('intercompany', 'Intercompany', 'master.customer_type', 'internal', 40::smallint),

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
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    is_system = EXCLUDED.is_system,
    metadata = EXCLUDED.metadata,
    status = 'active'
WHERE (control.lookup_value.name, control.lookup_value.category, control.lookup_value.sort_order, control.lookup_value.is_system, control.lookup_value.metadata, control.lookup_value.status)
 IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category, EXCLUDED.sort_order, EXCLUDED.is_system, EXCLUDED.metadata, 'active');

DO $seed_assertions$ BEGIN
 -- seed-assertion: expected-count
 IF (SELECT count(*) FROM control.lookup_domain WHERE code IN ('master.supplier_type','master.customer_type','master.business_partner_relationship_type','master.business_partner_governance_role','master.business_partner_identifier_scheme','master.business_partner_tax_registration_type'))<>6 THEN RAISE EXCEPTION 'neon.master.partner-reference: expected-count failed'; END IF;
 -- seed-assertion: orphan
 IF EXISTS(SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.domain_code IN ('master.supplier_type','master.customer_type','master.business_partner_relationship_type','master.business_partner_governance_role','master.business_partner_identifier_scheme','master.business_partner_tax_registration_type') AND d.id IS NULL) THEN RAISE EXCEPTION 'neon.master.partner-reference: orphan failed'; END IF;
 -- seed-assertion: uniqueness
 IF EXISTS(SELECT domain_code,code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code IN ('master.supplier_type','master.customer_type','master.business_partner_relationship_type','master.business_partner_governance_role','master.business_partner_identifier_scheme','master.business_partner_tax_registration_type') GROUP BY domain_code,code HAVING count(*)>1) THEN RAISE EXCEPTION 'neon.master.partner-reference: uniqueness failed'; END IF;
 -- seed-assertion: semantic
 IF NOT EXISTS(SELECT 1 FROM control.owner_type WHERE tenant_id IS NULL AND code='bank_provisional_reference' AND target_schema='master' AND target_table='bank_provisional_reference' AND supports_address AND status='active') THEN RAISE EXCEPTION 'neon.master.partner-reference: semantic failed'; END IF;
END $seed_assertions$;
