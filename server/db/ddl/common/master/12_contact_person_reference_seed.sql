INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
VALUES (
    'master.contact_role',
    'Contact Role',
    'Platform and tenant-defined business roles held by named contacts.',
    'master',
    true,
    '{"configurability":"tenant_extensible"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = true,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, category,
    sort_order, is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'master.contact_role',
       value.description, value.category, value.sort_order,
       true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('main_contact', 'Main Contact', 'Primary general business contact.', 'general', 10::smallint),
    ('commercial', 'Commercial', 'Commercial relationship contact.', 'commercial', 20::smallint),
    ('procurement', 'Procurement', 'Procurement and sourcing contact.', 'procurement', 30::smallint),
    ('sales', 'Sales', 'Sales contact.', 'sales', 40::smallint),
    ('finance', 'Finance', 'General finance contact.', 'finance', 50::smallint),
    ('accounts_payable', 'Accounts Payable', 'Payables and remittance contact.', 'finance', 60::smallint),
    ('accounts_receivable', 'Accounts Receivable', 'Receivables and collection contact.', 'finance', 70::smallint),
    ('credit_control', 'Credit Control', 'Credit-control contact.', 'finance', 80::smallint),
    ('collection', 'Collection', 'Debt collection contact.', 'finance', 90::smallint),
    ('logistics', 'Logistics', 'Shipping and logistics contact.', 'logistics', 100::smallint),
    ('tax', 'Tax', 'Tax and registration contact.', 'tax', 110::smallint),
    ('legal', 'Legal', 'Legal contact.', 'legal', 120::smallint),
    ('compliance', 'Compliance', 'Compliance and governance contact.', 'legal', 130::smallint),
    ('technical', 'Technical', 'Technical integration contact.', 'technical', 140::smallint),
    ('support', 'Support', 'Service and support contact.', 'support', 150::smallint),
    ('project_coordinator', 'Project Coordinator', 'Project delivery contact.', 'operations', 160::smallint),
    ('escalation', 'Escalation', 'Escalation contact.', 'general', 170::smallint)
) AS value(code, name, description, category, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    status = 'active';

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
)
VALUES (
    NULL, 'contact_person', 'Contact Person',
    'Named owner-scoped business contact.',
    'party', 'platform',
    'master', 'contact_person', 'id',
    true, 'tenant_id',
    false, true, false,
    35, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    target_schema = EXCLUDED.target_schema,
    target_table = EXCLUDED.target_table,
    supports_contact = true,
    status = 'active';

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT owner.id, 'contact', purpose.code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type owner
 CROSS JOIN (VALUES
    ('default'), ('business'), ('notification'), ('escalation')
 ) AS purpose(code)
 WHERE owner.tenant_id IS NULL
   AND owner.code = 'contact_person'
ON CONFLICT DO NOTHING;
