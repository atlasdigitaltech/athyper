INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible, metadata, status, created_by
)
VALUES (
    'master.warehouse_type',
    'Warehouse Type',
    'Inventory storage classification used by Neon warehouse master data.',
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
    is_extensible = EXCLUDED.is_extensible,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'master.warehouse_type',
       value.description, value.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM (VALUES
      ('raw', 'Raw Materials', 'Raw material and purchased component storage.', 10::smallint),
      ('finished_goods', 'Finished Goods', 'Finished product and trading-goods storage.', 20::smallint),
      ('spares', 'Spares', 'Maintenance, repair and operating spare-parts storage.', 30::smallint),
      ('transit', 'In Transit', 'Goods currently controlled in transit.', 40::smallint),
      ('returns', 'Returns', 'Customer or supplier return staging.', 50::smallint)
  ) AS value(code, name, description, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    status = 'active';

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    supports_bank_account,
    sort_order, status, created_by
)
VALUES (
    NULL, 'tenant', 'Tenant',
    'Plane-local tenant root with headquarters address and functional contacts.',
    'identity', 'platform',
    'master', 'tenant', 'id',
    true, 'id',
    true, true, true, true,
    10, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT ot.id, p.capability, p.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type ot
 CROSS JOIN (
    VALUES
        ('address', 'default'),
        ('address', 'correspondence'),
        ('address', 'bill_from'),
        ('address', 'bill_to'),
        ('address', 'ship_from'),
        ('address', 'ship_to'),
        ('address', 'place_of_service'),
        ('address', 'remit_to'),
        ('contact', 'default'),
        ('contact', 'correspondence'),
        ('contact', 'notification'),
        ('contact', 'support'),
        ('bank_account', 'default'),
        ('bank_account', 'treasury'),
        ('bank_account', 'escrow')
 ) AS p(capability, purpose_code)
 WHERE ot.tenant_id IS NULL
   AND ot.code = 'tenant'
ON CONFLICT DO NOTHING;

-- Canonical business-partner identity and its thin commercial roles.
INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    supports_bank_account,
    sort_order, status, created_by
)
VALUES
    (NULL, 'business_partner', 'Business Partner',
     'Canonical Neon commercial counterparty identity.',
     'party', 'platform',
     'master', 'business_partner', 'id', true, 'tenant_id',
     true, true, true, true, 60, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'supplier', 'Supplier',
     'Procurement/AP role. Address and contact links are role overrides; bank ownership resolves through the business partner.',
     'party', 'platform',
     'master', 'supplier', 'id', true, 'tenant_id',
     true, true, true, false, 70, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'customer', 'Customer',
     'Sales/AR role. Address and contact links are role overrides; bank ownership resolves through the business partner.',
     'party', 'platform',
     'master', 'customer', 'id', true, 'tenant_id',
     true, true, true, false, 80, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT owner_type.id, purpose.capability, purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS owner_type
 CROSS JOIN (
    VALUES
        ('address', 'default'),
        ('address', 'correspondence'),
        ('address', 'bill_from'),
        ('address', 'bill_to'),
        ('address', 'ship_from'),
        ('address', 'ship_to'),
        ('address', 'remit_to'),
        ('contact', 'default'),
        ('contact', 'correspondence'),
        ('contact', 'notification'),
        ('contact', 'sales'),
        ('contact', 'procurement')
 ) AS purpose(capability, purpose_code)
 WHERE owner_type.tenant_id IS NULL
   AND owner_type.code IN ('business_partner', 'supplier', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT owner_type.id, 'bank_account', purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS owner_type
 CROSS JOIN (
    VALUES
        ('default'),
        ('disbursement'),
        ('collection'),
        ('escrow')
 ) AS purpose(purpose_code)
 WHERE owner_type.tenant_id IS NULL
   AND owner_type.code = 'business_partner'
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    supports_bank_account,
    sort_order, status, created_by
)
VALUES
    (NULL, 'legal_entity', 'Legal Entity',
     'Neon statutory organization.', 'organization', 'platform',
     'master', 'legal_entity', 'id', true, 'tenant_id',
     true, true, true, true, 20, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'company_code', 'Company Code',
     'Neon accounting and balancing entity.', 'organization', 'platform',
     'master', 'company_code', 'id', true, 'tenant_id',
     true, true, true, true, 30, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'operating_organization', 'Operating Organization',
     'Neon procurement or sales coordination boundary.', 'organization', 'platform',
     'master', 'operating_organization', 'id', true, 'tenant_id',
     true, true, true, false, 40, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'org_unit', 'Organization Unit',
     'Neon workforce hierarchy node.', 'organization', 'platform',
     'master', 'org_unit', 'id', true, 'tenant_id',
     true, true, true, false, 50, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT ot.id, purpose.capability, purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS ot
 CROSS JOIN (
    VALUES
        ('address', 'default'),
        ('address', 'correspondence'),
        ('address', 'bill_from'),
        ('address', 'bill_to'),
        ('address', 'ship_from'),
        ('address', 'ship_to'),
        ('address', 'remit_to'),
        ('contact', 'default'),
        ('contact', 'correspondence'),
        ('contact', 'notification')
 ) AS purpose(capability, purpose_code)
 WHERE ot.tenant_id IS NULL
   AND ot.code IN (
       'legal_entity', 'company_code', 'operating_organization', 'org_unit'
   )
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT ot.id, 'bank_account', purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS ot
 CROSS JOIN (
    VALUES
        ('default'),
        ('disbursement'),
        ('collection'),
        ('payroll'),
        ('treasury'),
        ('escrow'),
        ('petty_cash'),
        ('tax')
 ) AS purpose(purpose_code)
 WHERE ot.tenant_id IS NULL
   AND ot.code IN ('legal_entity', 'company_code')
ON CONFLICT DO NOTHING;
