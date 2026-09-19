-- seed-contract-version: 1
-- seed-pack: mesh.control.reference
-- seed-pack-version: 1.0.0
-- seed-dataset: control.owner_type
-- seed-data-class: production_reference
-- seed-provenance: {"source":"repository-owned-reference-contract","publisher":"Athyper","source_version":"1","retrieved_at":"2026-09-11","license":"internal"}
-- seed-plane: mesh
-- seed-tenant-scope: none
-- seed-natural-key: control.owner_type(code);control.owner_type_purpose(owner_type_id,capability,purpose_code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: minimum:2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$ BEGIN
 IF COALESCE(current_setting('app.database_plane', true), '') NOT IN ('mesh') THEN
  RAISE EXCEPTION 'mesh.control.reference: invalid database plane';
 END IF;
END $seed_plane_guard$;

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
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category, source_type=EXCLUDED.source_type, target_schema=EXCLUDED.target_schema, target_table=EXCLUDED.target_table, pk_column=EXCLUDED.pk_column, is_tenant_scoped=EXCLUDED.is_tenant_scoped, tenant_column=EXCLUDED.tenant_column, supports_address=EXCLUDED.supports_address, supports_contact=EXCLUDED.supports_contact, supports_external_reference=EXCLUDED.supports_external_reference, sort_order=EXCLUDED.sort_order, status=EXCLUDED.status WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, EXCLUDED.supports_contact, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, EXCLUDED.status) ;

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column, is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    sort_order, status, created_by
) VALUES (
    NULL, 'principal', 'Principal', 'Authenticated tenant principal contact owner.',
    'identity', 'platform', 'master', 'principal', 'id', true, 'tenant_id',
    false, true, true, 20, 'active', '00000000-0000-0000-0000-000000000000'::uuid
) ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category, source_type=EXCLUDED.source_type, target_schema=EXCLUDED.target_schema, target_table=EXCLUDED.target_table, pk_column=EXCLUDED.pk_column, is_tenant_scoped=EXCLUDED.is_tenant_scoped, tenant_column=EXCLUDED.tenant_column, supports_address=EXCLUDED.supports_address, supports_contact=EXCLUDED.supports_contact, supports_external_reference=EXCLUDED.supports_external_reference, sort_order=EXCLUDED.sort_order, status=EXCLUDED.status WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, EXCLUDED.supports_contact, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, EXCLUDED.status) ;

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
ON CONFLICT(owner_type_id,capability,purpose_code) DO NOTHING;
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
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category, source_type=EXCLUDED.source_type, target_schema=EXCLUDED.target_schema, target_table=EXCLUDED.target_table, pk_column=EXCLUDED.pk_column, is_tenant_scoped=EXCLUDED.is_tenant_scoped, tenant_column=EXCLUDED.tenant_column, supports_address=EXCLUDED.supports_address, supports_contact=EXCLUDED.supports_contact, supports_external_reference=EXCLUDED.supports_external_reference, sort_order=EXCLUDED.sort_order, status=EXCLUDED.status WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, EXCLUDED.supports_contact, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, EXCLUDED.status) ;

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
ON CONFLICT (code) WHERE tenant_id IS NULL DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category, source_type=EXCLUDED.source_type, target_schema=EXCLUDED.target_schema, target_table=EXCLUDED.target_table, pk_column=EXCLUDED.pk_column, is_tenant_scoped=EXCLUDED.is_tenant_scoped, tenant_column=EXCLUDED.tenant_column, supports_address=EXCLUDED.supports_address, supports_contact=EXCLUDED.supports_contact, supports_external_reference=EXCLUDED.supports_external_reference, sort_order=EXCLUDED.sort_order, status=EXCLUDED.status WHERE (control.owner_type.name, control.owner_type.description, control.owner_type.category, control.owner_type.source_type, control.owner_type.target_schema, control.owner_type.target_table, control.owner_type.pk_column, control.owner_type.is_tenant_scoped, control.owner_type.tenant_column, control.owner_type.supports_address, control.owner_type.supports_contact, control.owner_type.supports_external_reference, control.owner_type.sort_order, control.owner_type.status) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.category, EXCLUDED.source_type, EXCLUDED.target_schema, EXCLUDED.target_table, EXCLUDED.pk_column, EXCLUDED.is_tenant_scoped, EXCLUDED.tenant_column, EXCLUDED.supports_address, EXCLUDED.supports_contact, EXCLUDED.supports_external_reference, EXCLUDED.sort_order, EXCLUDED.status) ;

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
ON CONFLICT(owner_type_id,capability,purpose_code) DO NOTHING;

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
  metadata=authz.permission.metadata||EXCLUDED.metadata,status='published' WHERE (authz.permission.risk_tier, authz.permission.requires_mfa, authz.permission.metadata, authz.permission.status) IS DISTINCT FROM (EXCLUDED.risk_tier, EXCLUDED.requires_mfa, authz.permission.metadata||EXCLUDED.metadata, 'published') ;

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
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active' WHERE (authz.permission_scope_kind.status) IS DISTINCT FROM ('active') ;

DO $assertions$
BEGIN
  IF EXISTS(SELECT 1 FROM (VALUES ('mesh.business_partner_exchange.read'),('mesh.business_partner_exchange.relationship'),('mesh.business_partner_exchange.registration')) required(code) WHERE NOT EXISTS(SELECT 1 FROM authz.permission permission WHERE permission.canonical_code=required.code AND permission.status='published')) THEN
    RAISE EXCEPTION 'MESH Business Partner exchange permission contract is incomplete';
  END IF;
END $assertions$;

DO $seed_assertions$ BEGIN
 -- seed-assertion: expected-count
 IF (SELECT count(*) FROM control.owner_type WHERE tenant_id IS NULL AND code IN ('tenant','principal'))<>2 THEN RAISE EXCEPTION 'Missing required identity owners'; END IF;
 -- seed-assertion: orphan
 IF EXISTS(SELECT 1 FROM control.owner_type_purpose p LEFT JOIN control.owner_type o ON o.id=p.owner_type_id WHERE o.id IS NULL) THEN RAISE EXCEPTION 'Orphan owner purpose'; END IF;
 -- seed-assertion: uniqueness
 IF EXISTS(SELECT code FROM control.owner_type WHERE tenant_id IS NULL GROUP BY code HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate global owner'; END IF;
 -- seed-assertion: semantic
 IF EXISTS(SELECT 1 FROM control.owner_type WHERE tenant_id IS NULL AND code IN ('tenant','principal') AND (status<>'active' OR target_schema<>'master' OR target_table<>code)) THEN RAISE EXCEPTION 'Identity owner contract drift'; END IF;
END $seed_assertions$;
