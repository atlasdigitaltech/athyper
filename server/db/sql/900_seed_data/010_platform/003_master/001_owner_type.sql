-- 900_seed_data/003_master/001_owner_type.sql
-- Seed: System owner types for the polymorphic routing registry.
-- Schema: master | Table: owner_type
-- Depends on: 04_tables/003_master.sql (owner_type table)
-- Idempotent: yes — ON CONFLICT on owner_type_system_code_uq DO NOTHING throughout
--
-- System rows define which master.* tables can be referenced by
-- contact_link.owner_type and address_link.owner_type. Each row
-- encodes the schema/table routing contract and advisory purpose filters.
-- ============================================================================

-- Retire operating_unit owner_type (table dropped in company_code migration)
DELETE FROM master.owner_type WHERE code = 'operating_unit';

INSERT INTO master.owner_type
    (code, name, description, category, sort_order,
     schema_name, table_name, pk_column,
     supports_address, supports_contact,
     allowed_address_purposes, allowed_contact_purposes,
     is_system, is_extensible_by_tenant, status, created_by)
VALUES

-- ── Category: identity ───────────────────────────────────────────────────────

('principal', 'Principal',
 'User, service account, or bot. Core identity actor.',
 'identity', 10,
 'master', 'principal', 'id',
 true, true,
 ARRAY['home', 'work', 'mailing', 'default'],
 ARRAY['login', 'recovery', 'mfa', 'verification', 'notification', 'billing'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ── Category: party ──────────────────────────────────────────────────────────

('business_partner', 'Business Partner',
 'Commercial identity root. Customer and Supplier roles point to this entity.',
 'party', 19,
 'master', 'business_partner', 'id',
 true, true,
 ARRAY['billing', 'legal', 'hq', 'mailing', 'default'],
 ARRAY['billing', 'support', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('business_partner_contact_person', 'Business Partner Contact Person',
 'Named contact person for a business partner. Used as contact_link owner_type for channels.',
 'party', 19,
 'master', 'party_contact_person', 'id',
 false, true,
 ARRAY[]::text[],
 ARRAY['work', 'mobile', 'email', 'phone', 'notification', 'default'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('customer', 'Customer',
 'AR role for a business partner within a tenant.',
 'party', 20,
 'master', 'customer', 'id',
 true, true,
 ARRAY['billing', 'shipping', 'legal', 'mailing', 'default'],
 ARRAY['billing', 'support', 'notification', 'marketing'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('supplier', 'Supplier',
 'AP role for a business partner within a tenant.',
 'party', 21,
 'master', 'supplier', 'id',
 true, true,
 ARRAY['billing', 'remittance', 'receiving', 'legal', 'mailing', 'default'],
 ARRAY['billing', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('employee', 'Employee',
 'Internal employee entity.',
 'party', 22,
 'master', 'employee', 'id',
 true, true,
 ARRAY['home', 'work', 'payroll', 'emergency', 'mailing', 'default'],
 ARRAY['notification', 'billing'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ── Category: structure ──────────────────────────────────────────────────────

('legal_entity', 'Legal Entity',
 'Registered legal entity (company, subsidiary, branch).',
 'structure', 30,
 'master', 'legal_entity', 'id',
 true, true,
 ARRAY['legal', 'hq', 'billing', 'tax', 'regulatory', 'mailing', 'default'],
 ARRAY['billing', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

-- ('operating_unit') removed — table dropped in company_code migration.

('warehouse', 'Warehouse',
 'Inventory warehouse or distribution centre.',
 'structure', 32,
 'master', 'warehouse', 'id',
 true, false,
 ARRAY['warehouse', 'shipping', 'receiving', 'default'],
 ARRAY[]::text[],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('company_code', 'Company Code',
 'Accounting / posting unit. Registered address for tax and regulatory filings.',
 'structure', 33,
 'master', 'company_code', 'id',
 true, true,
 ARRAY['legal', 'billing', 'tax', 'regulatory', 'mailing', 'default'],
 ARRAY['billing', 'tax', 'notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('site', 'Site',
 'Physical location (plant, office, store, branch, yard, depot).',
 'structure', 34,
 'master', 'site', 'id',
 true, true,
 ARRAY['site', 'shipping', 'receiving', 'mailing', 'default'],
 ARRAY['notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('project', 'Project',
 'Project with optional site-level address for field offices.',
 'structure', 35,
 'master', 'project', 'id',
 true, false,
 ARRAY['site', 'mailing', 'default'],
 ARRAY[]::text[],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('cost_center', 'Cost Center',
 'Responsibility center. Address inherited from linked site.',
 'structure', 36,
 'master', 'cost_center', 'id',
 false, true,
 ARRAY[]::text[],
 ARRAY['notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000'),

('profit_center', 'Profit Center',
 'P&L responsibility center.',
 'structure', 37,
 'master', 'profit_center', 'id',
 false, true,
 ARRAY[]::text[],
 ARRAY['notification'],
 true, false, 'active',
 '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;


-- ── bank_party ───────────────────────────────────────────────────────────────

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
    ARRAY['default', 'legal', 'branch'],
    ARRAY['default', 'operations', 'swift'],
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL
DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    schema_name = EXCLUDED.schema_name, table_name = EXCLUDED.table_name,
    allowed_address_purposes = EXCLUDED.allowed_address_purposes,
    allowed_contact_purposes = EXCLUDED.allowed_contact_purposes,
    updated_at = now(), updated_by = EXCLUDED.created_by;


-- ── spend_category / item_category ──────────────────────────────────────────

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
    NULL, 'spend_category', 'Spend Category',
    'Procurement spend category. Target for commodity classification bridges.',
    'master', 'spend_category', 'id',
    true, 'tenant_id',
    false, false,
    true, 'custom',
    ARRAY[]::text[], ARRAY[]::text[],
    'active', '00000000-0000-0000-0000-000000000000'
),
(
    NULL, 'item_category', 'Item Category',
    'Inventory item category. Target for commodity classification bridges.',
    'master', 'item_category', 'id',
    true, 'tenant_id',
    false, false,
    true, 'custom',
    ARRAY[]::text[], ARRAY[]::text[],
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;
