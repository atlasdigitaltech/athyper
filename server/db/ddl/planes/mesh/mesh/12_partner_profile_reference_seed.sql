INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
VALUES (
    'mesh.tax_registration_type',
    'Mesh Tax Registration Type',
    'Published tax-registration kinds for Mesh network accounts.',
    'mesh',
    true,
    '{"configurability":"tenant_extensible"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_extensible = true,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, category, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'mesh.tax_registration_type',
       value.category, value.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('business_registration', 'Business Registration', 'identity', 10::smallint),
    ('vat', 'VAT', 'indirect_tax', 20::smallint),
    ('gst', 'GST', 'indirect_tax', 30::smallint),
    ('sales_tax', 'Sales Tax', 'indirect_tax', 40::smallint),
    ('service_tax', 'Service Tax', 'indirect_tax', 50::smallint),
    ('withholding_tax', 'Withholding Tax', 'withholding', 60::smallint),
    ('taxpayer_id', 'Taxpayer ID', 'direct_tax', 70::smallint)
) AS value(code, name, category, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    status = 'active';
