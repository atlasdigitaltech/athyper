INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
)
VALUES (
    NULL, 'tenant', 'Tenant',
    'Plane-local tenant root with headquarters address and functional contacts.',
    'identity', 'platform',
    'master', 'tenant', 'id',
    true, 'id',
    true, true, true,
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
        ('contact', 'support')
 ) AS p(capability, purpose_code)
 WHERE ot.tenant_id IS NULL
   AND ot.code = 'tenant'
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
)
VALUES
(
    NULL, 'catalog', 'Mesh Catalog',
    'Supplier-owned exchange catalog published to public, connected, or explicitly targeted buyers.',
    'asset', 'platform',
    'mesh', 'catalog', 'id',
    true, 'tenant_id',
    false, false, true,
    30, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
),
(
    NULL, 'catalog_item', 'Mesh Catalog Item',
    'Supplier offer identity that a buyer may map to its own plane-local item.',
    'asset', 'platform',
    'mesh', 'catalog_item', 'id',
    true, 'tenant_id',
    false, false, true,
    40, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
)
VALUES (
    NULL, 'network_account', 'Network Account',
    'Mesh buyer, supplier, or dual-role network participant.',
    'party', 'platform',
    'mesh', 'network_account', 'id',
    true, 'tenant_id',
    true, true, true,
    20, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
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
   AND ot.code = 'network_account'
ON CONFLICT DO NOTHING;
