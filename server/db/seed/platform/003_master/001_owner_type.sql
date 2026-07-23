-- System owner types for the polymorphic routing registry.
-- Each row defines which master.* table is a valid target of contact_link.owner_type /
-- address_link.owner_type, plus the schema/table routing contract and advisory purpose filters.

-- operating_unit was retired when company_code consolidation dropped its table.
DELETE FROM master.owner_type WHERE code = 'operating_unit';

INSERT INTO master.owner_type
    (code, name, description, category, sort_order,
     schema_name, table_name, pk_column,
     is_tenant_scoped, tenant_column,
     supports_address, supports_contact,
     allowed_address_purposes, allowed_contact_purposes,
     is_system, is_extensible_by_tenant, status, created_by)
VALUES

-- identity

('principal', 'Principal',
 'User, service account, or bot. Core identity actor.',
 'identity', 10,
 'master', 'principal', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['correspondence', 'default'],
 ARRAY['login', 'recovery', 'mfa', 'verification', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- party

('business_partner', 'Business Partner',
 'Commercial identity root. Customer and Supplier roles point to this entity.',
 'party', 19,
 'master', 'business_partner', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['bill_from', 'bill_to', 'ship_to', 'ship_from', 'remit_to', 'correspondence', 'default'],
 ARRAY['correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('business_partner_contact_person', 'Business Partner Contact Person',
 'Named contact person for a business partner. Used as contact_link owner_type for channels.',
 'party', 19,
 'master', 'party_contact_person', 'id',
 true, 'tenant_id',
 false, true,
 ARRAY[]::text[],
 ARRAY['bill_from', 'support', 'correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('customer', 'Customer',
 'AR role for a business partner within a tenant.',
 'party', 20,
 'master', 'customer', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['bill_to', 'ship_to', 'correspondence', 'default'],
 ARRAY['bill_to', 'bill_from', 'support', 'marketing', 'notification', 'correspondence', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('supplier', 'Supplier',
 'AP role for a business partner within a tenant.',
 'party', 21,
 'master', 'supplier', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['bill_from', 'remit_to', 'ship_from', 'correspondence', 'default'],
 ARRAY['remit_to', 'bill_from', 'correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('employee', 'Employee',
 'Internal employee entity.',
 'party', 22,
 'master', 'employee', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['remit_to', 'correspondence', 'default'],
 ARRAY['login', 'recovery', 'mfa', 'verification', 'correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- structure

('legal_entity', 'Legal Entity',
 'Registered legal entity (company, subsidiary, branch).',
 'structure', 30,
 'master', 'legal_entity', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['bill_to', 'bill_from', 'ship_to', 'ship_from', 'place_of_service', 'remit_to', 'correspondence', 'default'],
 ARRAY['correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ('operating_unit') removed — table dropped in company_code migration.

('warehouse', 'Warehouse',
 'Inventory warehouse or distribution centre.',
 'structure', 32,
 'master', 'warehouse', 'id',
 true, 'tenant_id',
 true, false,
 ARRAY['ship_to', 'ship_from', 'correspondence', 'default'],
 ARRAY[]::text[],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('company_code', 'Company Code',
 'Accounting / posting unit. Registered address for tax and regulatory filings.',
 'structure', 33,
 'master', 'company_code', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['bill_to', 'ship_to', 'ship_from', 'place_of_service', 'bill_from', 'remit_to', 'correspondence', 'default'],
 ARRAY['correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('site', 'Site',
 'Physical location (plant, office, store, branch, yard, depot).',
 'structure', 34,
 'master', 'site', 'id',
 true, 'tenant_id',
 true, true,
 ARRAY['ship_to', 'ship_from', 'bill_to', 'place_of_service', 'bill_from', 'remit_to', 'correspondence', 'default'],
 ARRAY['correspondence', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('project', 'Project',
 'Project with optional site-level address for field offices.',
 'structure', 35,
 'master', 'project', 'id',
 true, 'tenant_id',
 true, false,
 ARRAY['ship_to', 'place_of_service', 'correspondence', 'default'],
 ARRAY[]::text[],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('cost_center', 'Cost Center',
 'Responsibility center. Address inherited from linked site.',
 'structure', 36,
 'master', 'cost_center', 'id',
 true, 'tenant_id',
 false, true,
 ARRAY[]::text[],
 ARRAY['notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('profit_center', 'Profit Center',
 'P&L responsibility center.',
 'structure', 37,
 'master', 'profit_center', 'id',
 true, 'tenant_id',
 false, true,
 ARRAY[]::text[],
 ARRAY['notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

-- Organizational identity roots expose controlled functional contact channels.
UPDATE master.owner_type
   SET allowed_contact_purposes = ARRAY['correspondence', 'notification', 'default'],
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE tenant_id IS NULL
   AND code IN ('tenant', 'legal_entity', 'company_code', 'site', 'business_partner');

-- tenant — root entity; NOT tenant-scoped (master.tenant has no tenant_id FK).

INSERT INTO master.owner_type (
    code, name, description, category, sort_order,
    schema_name, table_name, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact,
    allowed_address_purposes, allowed_contact_purposes,
    is_system, is_extensible_by_tenant, status, created_by
) VALUES (
    'tenant', 'Tenant',
    'Top-level tenant entity. Supports HQ address and primary support contacts.',
    'identity', 5,
    'master', 'tenant', 'id',
    false, 'id',
    true, true,
    ARRAY['bill_from', 'bill_to', 'ship_to', 'ship_from', 'place_of_service', 'remit_to', 'correspondence', 'default'],
    ARRAY['correspondence', 'notification', 'default'],
    true, false, 'active',
    '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

UPDATE master.owner_type
   SET allowed_contact_purposes = ARRAY['correspondence', 'notification', 'default'],
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE tenant_id IS NULL AND code = 'tenant';


-- bank_party

INSERT INTO master.owner_type (
    tenant_id, code, name, description,
    schema_name, table_name, pk_column,
    is_tenant_scoped, tenant_column,
    is_system, category,
    allowed_address_purposes, allowed_contact_purposes,
    status, created_by
) VALUES (
    NULL, 'bank_party', 'Bank Party',
    'Bank institution / branch. Address for branch location, contact for branch phone/email.',
    'master', 'bank_party', 'id',
    true, 'tenant_id',
    true, 'party',
    ARRAY['remit_to', 'correspondence', 'default'],
    ARRAY['correspondence', 'notification', 'default'],
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL
DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    schema_name = EXCLUDED.schema_name, table_name = EXCLUDED.table_name,
    allowed_address_purposes = EXCLUDED.allowed_address_purposes,
    allowed_contact_purposes = EXCLUDED.allowed_contact_purposes,
    updated_at = now(), updated_by = EXCLUDED.created_by;


-- commodity_category

UPDATE master.owner_type
   SET status = 'deprecated',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE tenant_id IS NULL
   AND code = 'spend_category'
   AND status <> 'deprecated';

INSERT INTO master.owner_type (
    tenant_id, code, name, description,
    schema_name, table_name, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact,
    is_system, category,
    allowed_address_purposes, allowed_contact_purposes,
    status, created_by
) VALUES
(
    NULL, 'commodity_category', 'Commodity Category',
    'Shared commodity category. Target for commodity classification bridges across spend, sales, and inventory.',
    'master', 'commodity_category', 'id',
    true, 'tenant_id',
    false, false,
    true, 'custom',
    ARRAY[]::text[], ARRAY[]::text[],
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;
