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

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column, is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
) VALUES (
    NULL, 'principal', 'Principal', 'Authenticated tenant principal contact owner.',
    'identity', 'platform', 'master', 'principal', 'id', true, 'tenant_id',
    false, true, true, 20, 'active', '00000000-0000-0000-0000-000000000000'::uuid
) ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

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
   AND (ot.code = 'tenant' OR (ot.code = 'principal' AND p.capability = 'contact'))
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

-- seed-pack: mesh.business-partner-exchange-permissions
-- seed-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind

WITH desired(canonical_code,risk_tier,requires_mfa) AS (
  VALUES
    ('mesh.business_partner_profile.publish','medium',false),
    ('mesh.business_partner_profile.read','low',false),
    ('mesh.business_partner_profile.withdraw','medium',false),
    ('mesh.bank_disclosure.request','high',true),
    ('mesh.bank_disclosure.decide','high',true),
    ('mesh.bank_disclosure.read','medium',false),
    ('mesh.bank_disclosure.revoke','high',true),
    ('mesh.business_partner_exchange.read','low',false),
    ('mesh.business_partner_exchange.relationship','medium',false),
    ('mesh.business_partner_exchange.registration','medium',false)
)
INSERT INTO authz.permission(
  id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
  is_shareable,is_delegable,is_overridable,metadata,status,created_by
)
SELECT md5('athyper:permission:'||desired.canonical_code)::uuid,desired.canonical_code,
       'entity_operation',module.id,desired.risk_tier::authz.risk_tier_d,
       desired.requires_mfa,false,false,false,false,
       '{"_seed":{"pack":"mesh.business-partner-exchange-permissions","version":"1.0.0"}}'::jsonb,
       'published','00000000-0000-0000-0000-000000000000'::uuid
FROM desired
JOIN control.module module ON module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET
  risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,
  metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT permission.id,scope.kind,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
CROSS JOIN LATERAL (VALUES
  (CASE WHEN permission.canonical_code LIKE 'mesh.business_partner_exchange.%' THEN 'tenant' ELSE 'network_relationship' END::authz.scope_kind_d)
) scope(kind)
WHERE permission.canonical_code IN(
  'mesh.business_partner_profile.publish','mesh.business_partner_profile.read','mesh.business_partner_profile.withdraw',
  'mesh.bank_disclosure.request','mesh.bank_disclosure.decide','mesh.bank_disclosure.read','mesh.bank_disclosure.revoke',
  'mesh.business_partner_exchange.read','mesh.business_partner_exchange.relationship','mesh.business_partner_exchange.registration'
)
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'mesh.business_partner_exchange.%' AND status='published')<>3 THEN
    RAISE EXCEPTION 'MESH Business Partner exchange permission contract is incomplete';
  END IF;
END $assertions$;
