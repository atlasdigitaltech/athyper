INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
VALUES
    (
        'control.business_partner_qualification_type',
        'Business Partner Qualification Type',
        'Qualification programs used to approve a partner role.',
        'control', true,
        '{"configurability":"tenant_extensible"}'::jsonb,
        'active', '00000000-0000-0000-0000-000000000000'::uuid
    ),
    (
        'control.business_partner_block_operation',
        'Business Partner Block Operation',
        'Commercial operations that may be blocked for a partner.',
        'control', true,
        '{"configurability":"tenant_extensible"}'::jsonb,
        'active', '00000000-0000-0000-0000-000000000000'::uuid
    ),
    (
        'control.business_partner_block_reason',
        'Business Partner Block Reason',
        'Controlled reasons for applying a business-partner block.',
        'control', true,
        '{"configurability":"tenant_extensible"}'::jsonb,
        'active', '00000000-0000-0000-0000-000000000000'::uuid
    )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = EXCLUDED.is_extensible,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, seed.code, seed.name, seed.domain_code, seed.description,
       seed.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('basic', 'Basic Qualification',
     'control.business_partner_qualification_type',
     'General commercial onboarding qualification.', 10::smallint),
    ('commodity', 'Commodity Qualification',
     'control.business_partner_qualification_type',
     'Qualification for a specific commodity capability.', 20::smallint),
    ('compliance', 'Compliance Qualification',
     'control.business_partner_qualification_type',
     'Legal, regulatory, or policy qualification.', 30::smallint),
    ('purchasing', 'Purchasing',
     'control.business_partner_block_operation',
     'Prevents new purchasing commitments.', 10::smallint),
    ('ordering', 'Ordering',
     'control.business_partner_block_operation',
     'Prevents new purchase or sales orders.', 20::smallint),
    ('invoicing', 'Invoicing',
     'control.business_partner_block_operation',
     'Prevents invoice processing.', 30::smallint),
    ('payment', 'Payment',
     'control.business_partner_block_operation',
     'Prevents payment or settlement.', 40::smallint),
    ('compliance', 'Compliance',
     'control.business_partner_block_reason',
     'Compliance requirement is not satisfied.', 10::smallint),
    ('risk', 'Risk',
     'control.business_partner_block_reason',
     'Risk threshold or policy was breached.', 20::smallint),
    ('commercial', 'Commercial',
     'control.business_partner_block_reason',
     'Commercial decision or dispute.', 30::smallint),
    ('data_quality', 'Data Quality',
     'control.business_partner_block_reason',
     'Required master data is missing or invalid.', 40::smallint)
) AS seed(code, name, domain_code, description, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    status = 'active';
