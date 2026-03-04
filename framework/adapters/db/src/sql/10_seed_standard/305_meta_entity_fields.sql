/* ============================================================================
   Athyper v2.1 — Meta Field Dictionary
   Populates meta.field for all entities with governance_level 'full' or 'light'.

   Infrastructure columns (id, tenant_id, entity_code, created_at, created_by,
   updated_at, updated_by) are omitted — they are implicit on every entity.

   Dependencies: meta.entity, meta.entity_version
                 (from 300_meta_entity_registration.sql)
   ============================================================================ */

-- Temporary helper: resolve entity_version v1 id by entity name
CREATE OR REPLACE FUNCTION pg_temp.ev_id(p_tenant uuid, p_name text)
RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT ev.id
    FROM meta.entity_version ev
    JOIN meta.entity e ON ev.entity_id = e.id AND ev.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant AND e.name = p_name AND ev.version_no = 1
    LIMIT 1;
$$;

DO $$
DECLARE
    v_tenant uuid;
    v_vid    uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'No tenant — skipping field dictionary';
        RETURN;
    END IF;

    -- ====================================================================
    -- §1  REF SCHEMA — Reference Entities (light governance)
    -- ====================================================================

    -- ---- Country ----
    v_vid := pg_temp.ev_id(v_tenant, 'Country');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code (Alpha-2)',  'code2',         'char(2)',  'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Code (Alpha-3)',  'code3',         'char(3)',  'code',   false, true,  true,  false, 2,  'system'),
        (v_tenant, v_vid, 'Numeric Code',    'numeric3',      'char(3)',  'code',   false, true,  false, false, 3,  'system'),
        (v_tenant, v_vid, 'Name',            'name',          'text',     'text',   true,  false, true,  true,  4,  'system'),
        (v_tenant, v_vid, 'Official Name',   'official_name', 'text',     'text',   false, false, true,  false, 5,  'system'),
        (v_tenant, v_vid, 'Region',          'region',        'text',     'select', false, false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Subregion',       'subregion',     'text',     'select', false, false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Status',          'status',        'text',     'select', true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Metadata',        'metadata',      'jsonb',    'json',   false, false, false, false, 9,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- StateRegion ----
    v_vid := pg_temp.ev_id(v_tenant, 'StateRegion');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',          'code',           'text',    'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Country',       'country_code2',  'char(2)', 'lookup', true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Name',          'name',           'text',    'text',   true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Category',      'category',       'text',    'select', false, false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Parent',        'parent_code',    'text',    'lookup', false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Status',        'status',         'text',    'select', true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Metadata',      'metadata',       'jsonb',   'json',   false, false, false, false, 7,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Currency ----
    v_vid := pg_temp.ev_id(v_tenant, 'Currency');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',         'code',        'char(3)',  'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',         'name',        'text',     'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Symbol',       'symbol',      'text',     'text',   false, false, false, false, 3,  'system'),
        (v_tenant, v_vid, 'Minor Units',  'minor_units', 'int',      'number', false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Numeric Code', 'numeric3',    'char(3)',  'code',   false, true,  false, false, 5,  'system'),
        (v_tenant, v_vid, 'Status',       'status',      'text',     'select', true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Metadata',     'metadata',    'jsonb',    'json',   false, false, false, false, 7,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Language ----
    v_vid := pg_temp.ev_id(v_tenant, 'Language');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',        'code',        'text',  'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',        'name',        'text',  'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Native Name', 'native_name', 'text',  'text',   false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'ISO 639-2',   'iso639_2',    'text',  'code',   false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Direction',   'direction',    'text',  'select', true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Status',      'status',       'text',  'select', true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Metadata',    'metadata',     'jsonb', 'json',   false, false, false, false, 7,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Locale ----
    v_vid := pg_temp.ev_id(v_tenant, 'Locale');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',     'code',           'text',    'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Language', 'language_code',   'text',    'lookup', true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Country',  'country_code2',   'char(2)', 'lookup', false, false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Script',   'script',          'text',    'text',   false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Name',     'name',            'text',    'text',   true,  false, true,  true,  5,  'system'),
        (v_tenant, v_vid, 'Direction','direction',        'text',    'select', false, false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Status',   'status',           'text',    'select', true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Metadata', 'metadata',         'jsonb',   'json',   false, false, false, false, 8,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Timezone ----
    v_vid := pg_temp.ev_id(v_tenant, 'Timezone');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'TZID',         'tzid',           'text',    'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Display Name', 'display_name',   'text',    'text',    false, false, true,  false, 2,  'system'),
        (v_tenant, v_vid, 'UTC Offset',   'utc_offset',     'text',    'text',    false, false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Is Alias',     'is_alias',       'boolean', 'boolean', true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Canonical',    'canonical_tzid',  'text',    'lookup',  false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Status',       'status',          'text',    'select',  true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Metadata',     'metadata',        'jsonb',   'json',    false, false, false, false, 7,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- UnitOfMeasure ----
    v_vid := pg_temp.ev_id(v_tenant, 'UnitOfMeasure');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',          'code',          'text',  'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',          'name',          'text',  'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Symbol',        'symbol',        'text',  'text',   false, false, false, false, 3,  'system'),
        (v_tenant, v_vid, 'Quantity Type', 'quantity_type',  'text',  'select', false, false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Status',        'status',         'text',  'select', true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Metadata',      'metadata',       'jsonb', 'json',   false, false, false, false, 6,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- CommodityDomain ----
    v_vid := pg_temp.ev_id(v_tenant, 'CommodityDomain');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',     'code',     'text', 'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',     'name',     'text', 'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Standard', 'standard', 'text', 'text',   false, false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Version',  'version',  'text', 'text',   false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Status',   'status',   'text', 'select', true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Metadata', 'metadata', 'jsonb','json',   false, false, false, false, 6,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- CommodityCode ----
    v_vid := pg_temp.ev_id(v_tenant, 'CommodityCode');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Domain',      'domain_code', 'text', 'lookup',  true,  false, false, true,  1,  'system'),
        (v_tenant, v_vid, 'Code',        'code',        'text', 'code',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Name',        'name',        'text', 'text',    true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Description', 'description', 'text', 'textarea',false, false, true,  false, 4,  'system'),
        (v_tenant, v_vid, 'Parent',      'parent_code', 'text', 'lookup',  false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Level',       'level_no',    'int',  'number',  false, false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Status',      'status',      'text', 'select',  true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Metadata',    'metadata',    'jsonb','json',    false, false, false, false, 8,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- IndustryDomain ----
    v_vid := pg_temp.ev_id(v_tenant, 'IndustryDomain');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',     'code',     'text', 'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',     'name',     'text', 'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Standard', 'standard', 'text', 'text',   false, false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Version',  'version',  'text', 'text',   false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Status',   'status',   'text', 'select', true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Metadata', 'metadata', 'jsonb','json',   false, false, false, false, 6,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- IndustryCode ----
    v_vid := pg_temp.ev_id(v_tenant, 'IndustryCode');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Domain',      'domain_code', 'text', 'lookup',  true,  false, false, true,  1,  'system'),
        (v_tenant, v_vid, 'Code',        'code',        'text', 'code',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Name',        'name',        'text', 'text',    true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Description', 'description', 'text', 'textarea',false, false, true,  false, 4,  'system'),
        (v_tenant, v_vid, 'Parent',      'parent_code', 'text', 'lookup',  false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Level',       'level_no',    'int',  'number',  false, false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Status',      'status',      'text', 'select',  true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Metadata',    'metadata',    'jsonb','json',    false, false, false, false, 8,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Label ----
    v_vid := pg_temp.ev_id(v_tenant, 'Label');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Entity',      'entity',      'text', 'text',    true,  false, true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Code',        'code',        'text', 'code',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Locale',      'locale_code', 'text', 'lookup',  true,  false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Name',        'name',        'text', 'text',    true,  false, true,  true,  4,  'system'),
        (v_tenant, v_vid, 'Description', 'description', 'text', 'textarea',false, false, true,  false, 5,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §2  ENT SCHEMA — Master Data Entities
    -- ====================================================================

    -- ---- Customer (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Customer');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',               'code',               'text',   'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',               'name',               'text',   'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Display Name',       'display_name',       'text',   'text',   false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Customer Type',      'customer_type',      'text',   'select', true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Status',             'status',             'text',   'select', true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Tax ID',             'tax_id',             'text',   'text',   false, false, true,  false, 6,  'system'),
        (v_tenant, v_vid, 'Industry Code',      'industry_code',      'text',   'lookup', false, false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Primary Contact',    'primary_contact_id', 'uuid',   'lookup', false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Primary Address',    'primary_address_id', 'uuid',   'lookup', false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Metadata',           'metadata',           'jsonb',  'json',   false, false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Tags',               'tags',               'text[]', 'tags',   false, false, true,  true,  11, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Supplier (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Supplier');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',               'code',               'text',   'code',   true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',               'name',               'text',   'text',   true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Display Name',       'display_name',       'text',   'text',   false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Supplier Type',      'supplier_type',      'text',   'select', true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Status',             'status',             'text',   'select', true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Tax ID',             'tax_id',             'text',   'text',   false, false, true,  false, 6,  'system'),
        (v_tenant, v_vid, 'Industry Code',      'industry_code',      'text',   'lookup', false, false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Primary Contact',    'primary_contact_id', 'uuid',   'lookup', false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Primary Address',    'primary_address_id', 'uuid',   'lookup', false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Payment Terms',      'payment_terms',      'text',   'select', false, false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Currency',           'currency_code',      'text',   'lookup', false, false, false, true,  11, 'system'),
        (v_tenant, v_vid, 'Metadata',           'metadata',           'jsonb',  'json',   false, false, false, false, 12, 'system'),
        (v_tenant, v_vid, 'Tags',               'tags',               'text[]', 'tags',   false, false, true,  true,  13, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Employee (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Employee');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Principal',        'principal_id',    'uuid',   'lookup',  false, false, false, false, 1,  'system'),
        (v_tenant, v_vid, 'Employee Number',  'employee_number', 'text',   'code',    true,  true,  true,  true,  2,  'system'),
        (v_tenant, v_vid, 'First Name',       'first_name',      'text',   'text',    true,  false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Last Name',        'last_name',       'text',   'text',    true,  false, true,  false, 4,  'system'),
        (v_tenant, v_vid, 'Display Name',     'display_name',    'text',   'text',    false, false, true,  false, 5,  'system'),
        (v_tenant, v_vid, 'Email',            'email',           'text',   'text',    false, false, true,  false, 6,  'system'),
        (v_tenant, v_vid, 'Phone',            'phone',           'text',   'text',    false, false, false, false, 7,  'system'),
        (v_tenant, v_vid, 'Status',           'status',          'text',   'select',  true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Employment Type',  'employment_type', 'text',   'select',  true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Department',       'department',      'text',   'select',  false, false, true,  true,  10, 'system'),
        (v_tenant, v_vid, 'Title',            'title',           'text',   'text',    false, false, true,  true,  11, 'system'),
        (v_tenant, v_vid, 'Manager',          'manager_id',      'uuid',   'lookup',  false, false, false, true,  12, 'system'),
        (v_tenant, v_vid, 'Org Unit',         'ou_id',           'uuid',   'lookup',  false, false, false, true,  13, 'system'),
        (v_tenant, v_vid, 'Hire Date',        'hire_date',       'date',   'date',    false, false, false, true,  14, 'system'),
        (v_tenant, v_vid, 'Termination Date', 'termination_date','date',   'date',    false, false, false, true,  15, 'system'),
        (v_tenant, v_vid, 'Metadata',         'metadata',        'jsonb',  'json',    false, false, false, false, 16, 'system'),
        (v_tenant, v_vid, 'Tags',             'tags',            'text[]', 'tags',    false, false, true,  true,  17, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- ProductCategory (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'ProductCategory');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',        'code',        'text',    'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',        'name',        'text',    'text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Description', 'description', 'text',    'textarea',false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Parent',      'parent_id',   'uuid',    'lookup',  false, false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Sort Order',  'sort_order',  'int',     'number',  false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Active',      'is_active',   'boolean', 'boolean', true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Metadata',    'metadata',    'jsonb',   'json',    false, false, false, false, 7,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Product (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Product');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',            'code',            'text',       'code',     true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'SKU',             'sku',             'text',       'code',     false, false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Name',            'name',            'text',       'text',     true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Description',     'description',     'text',       'textarea', false, false, true,  false, 4,  'system'),
        (v_tenant, v_vid, 'Category',        'category_id',     'uuid',       'lookup',   false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Status',          'status',          'text',       'select',   true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Product Type',    'product_type',    'text',       'select',   true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Unit of Measure', 'unit_of_measure', 'text',       'lookup',   false, false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Base Price',      'base_price',      'decimal',    'currency', false, false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Currency',        'currency_code',   'text',       'lookup',   false, false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Taxable',         'is_taxable',      'boolean',    'boolean',  true,  false, false, true,  11, 'system'),
        (v_tenant, v_vid, 'Tax Code',        'tax_code',        'text',       'lookup',   false, false, false, true,  12, 'system'),
        (v_tenant, v_vid, 'Metadata',        'metadata',        'jsonb',      'json',     false, false, false, false, 13, 'system'),
        (v_tenant, v_vid, 'Tags',            'tags',            'text[]',     'tags',     false, false, true,  true,  14, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- EntityRelationship (light) ----
    v_vid := pg_temp.ev_id(v_tenant, 'EntityRelationship');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Relationship Type', 'relationship_type', 'text',        'select',  true,  false, true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Entity A Type',     'entity_a_type',     'text',        'select',  true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Entity A ID',       'entity_a_id',       'uuid',        'lookup',  true,  false, false, false, 3,  'system'),
        (v_tenant, v_vid, 'Entity B Type',     'entity_b_type',     'text',        'select',  true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Entity B ID',       'entity_b_id',       'uuid',        'lookup',  true,  false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Bidirectional',     'is_bidirectional',  'boolean',     'boolean', true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Status',            'status',            'text',        'select',  true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Effective From',    'effective_from',    'timestamptz', 'datetime',false, false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Effective Until',   'effective_until',   'timestamptz', 'datetime',false, false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Metadata',          'metadata',          'jsonb',       'json',    false, false, false, false, 10, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §3  DOC SCHEMA — Document Entities
    -- ====================================================================

    -- ---- Attachment (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Attachment');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'File Name',       'file_name',       'text',    'text',    true,  false, true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Content Type',    'content_type',    'text',    'text',    false, false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Size (bytes)',    'size_bytes',      'bigint',  'number',  false, false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Storage Bucket',  'storage_bucket',  'text',    'text',    true,  false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Storage Key',     'storage_key',     'text',    'text',    true,  false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Kind',            'kind',            'text',    'select',  true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'SHA-256',         'sha256',          'text',    'text',    false, false, true,  false, 7,  'system'),
        (v_tenant, v_vid, 'Original Name',   'original_filename','text',   'text',    false, false, true,  false, 8,  'system'),
        (v_tenant, v_vid, 'Virus Scanned',   'is_virus_scanned','boolean', 'boolean', true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Owner Entity',    'owner_entity',    'text',    'select',  false, false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Owner Entity ID', 'owner_entity_id', 'text',    'text',    false, false, false, false, 11, 'system'),
        (v_tenant, v_vid, 'Version',         'version_no',      'int',     'number',  false, false, false, false, 12, 'system'),
        (v_tenant, v_vid, 'Is Current',      'is_current',      'boolean', 'boolean', false, false, false, true,  13, 'system'),
        (v_tenant, v_vid, 'Parent',          'parent_attachment_id','uuid', 'lookup',  false, false, false, false, 14, 'system'),
        (v_tenant, v_vid, 'Retention Until', 'retention_until',  'timestamptz','datetime',false,false,false,true,  15, 'system'),
        (v_tenant, v_vid, 'Expires At',      'expires_at',       'timestamptz','datetime',false,false,false,true,  16, 'system'),
        (v_tenant, v_vid, 'Metadata',        'metadata',         'jsonb',  'json',    false, false, false, false, 17, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Document (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Document');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',     'code',     'text',   'code',  false, false, true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Title',    'title',    'text',   'text',  false, false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Tags',     'tags',     'text[]', 'tags',  false, false, true,  true,  3, 'system'),
        (v_tenant, v_vid, 'Metadata', 'metadata', 'jsonb',  'json',  false, false, false, false, 4, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Template (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Template');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',                'code',                'text',    'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',                'name',                'text',    'text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Kind',                'kind',                'text',    'select',  true,  false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Engine',              'engine',              'text',    'select',  true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Status',              'status',              'text',    'select',  true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Current Version',     'current_version_id',  'uuid',    'lookup',  false, false, false, false, 6,  'system'),
        (v_tenant, v_vid, 'Supports RTL',        'supports_rtl',        'boolean', 'boolean', true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Requires Letterhead', 'requires_letterhead', 'boolean', 'boolean', true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Allowed Operations',  'allowed_operations',  'text[]',  'tags',    false, false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Supported Locales',   'supported_locales',   'text[]',  'tags',    false, false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Metadata',            'metadata',            'jsonb',   'json',    false, false, false, false, 11, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- TemplateVersion (light) ----
    v_vid := pg_temp.ev_id(v_tenant, 'TemplateVersion');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Template',         'template_id',     'uuid',        'lookup',   true,  false, false, true,  1,  'system'),
        (v_tenant, v_vid, 'Version',          'version',         'int',         'number',   true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Content HTML',     'content_html',    'text',        'textarea', false, false, false, false, 3,  'system'),
        (v_tenant, v_vid, 'Content JSON',     'content_json',    'jsonb',       'json',     false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Header HTML',      'header_html',     'text',        'textarea', false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Footer HTML',      'footer_html',     'text',        'textarea', false, false, false, false, 6,  'system'),
        (v_tenant, v_vid, 'Styles CSS',       'styles_css',      'text',        'textarea', false, false, false, false, 7,  'system'),
        (v_tenant, v_vid, 'Variables Schema', 'variables_schema','jsonb',       'json',     false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Assets Manifest',  'assets_manifest', 'jsonb',       'json',     false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Checksum',         'checksum',        'text',        'text',     true,  false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Published At',     'published_at',    'timestamptz', 'datetime', false, false, false, true,  11, 'system'),
        (v_tenant, v_vid, 'Effective From',   'effective_from',  'timestamptz', 'datetime', false, false, false, true,  12, 'system'),
        (v_tenant, v_vid, 'Effective To',     'effective_to',    'timestamptz', 'datetime', false, false, false, true,  13, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- TemplateBinding (light) ----
    v_vid := pg_temp.ev_id(v_tenant, 'TemplateBinding');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Template',    'template_id', 'uuid',    'lookup',  true,  false, false, true,  1, 'system'),
        (v_tenant, v_vid, 'Entity Name', 'entity_name', 'text',    'select',  true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Operation',   'operation',   'text',    'select',  true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'Variant',     'variant',     'text',    'text',    true,  false, false, true,  4, 'system'),
        (v_tenant, v_vid, 'Priority',    'priority',    'int',     'number',  true,  false, false, false, 5, 'system'),
        (v_tenant, v_vid, 'Active',      'active',      'boolean', 'boolean', true,  false, false, true,  6, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Letterhead (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'Letterhead');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',              'code',              'text',    'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',              'name',              'text',    'text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Org Unit',          'org_unit_id',       'uuid',    'lookup',  false, false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Logo Key',          'logo_storage_key',  'text',    'text',    false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Header HTML',       'header_html',       'text',    'textarea',false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Footer HTML',       'footer_html',       'text',    'textarea',false, false, false, false, 6,  'system'),
        (v_tenant, v_vid, 'Watermark Text',    'watermark_text',    'text',    'text',    false, false, false, false, 7,  'system'),
        (v_tenant, v_vid, 'Watermark Opacity', 'watermark_opacity', 'decimal', 'number',  false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Default Fonts',     'default_fonts',     'jsonb',   'json',    false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Page Margins',      'page_margins',      'jsonb',   'json',    false, false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Is Default',        'is_default',        'boolean', 'boolean', true,  false, false, true,  11, 'system'),
        (v_tenant, v_vid, 'Metadata',          'metadata',          'jsonb',   'json',    false, false, false, false, 12, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- BrandProfile (full) ----
    v_vid := pg_temp.ev_id(v_tenant, 'BrandProfile');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',              'code',              'text',    'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',              'name',              'text',    'text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Palette',           'palette',           'jsonb',   'json',    false, false, false, false, 3,  'system'),
        (v_tenant, v_vid, 'Typography',        'typography',        'jsonb',   'json',    false, false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Spacing Scale',     'spacing_scale',     'jsonb',   'json',    false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Direction',         'direction',         'text',    'select',  true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Default Locale',    'default_locale',    'text',    'lookup',  true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Supported Locales', 'supported_locales', 'text[]',  'tags',    false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Is Default',        'is_default',        'boolean', 'boolean', true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Metadata',          'metadata',          'jsonb',   'json',    false, false, false, false, 10, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §4  FIN SCHEMA — Finance Master Entities (full governance)
    -- ====================================================================

    -- ---- ChartOfAccounts ----
    v_vid := pg_temp.ev_id(v_tenant, 'ChartOfAccounts');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Account Code',         'account_code',         'varchar(20)', 'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Account Name',         'account_name',         'varchar(200)','text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Account Type',         'account_type',         'varchar(20)', 'select',  true,  false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Normal Balance',       'normal_balance',       'varchar(10)', 'select',  true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Parent Account',       'parent_id',            'uuid',        'lookup',  false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Level',                'level',                'smallint',    'number',  true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Is Group',             'is_group',             'boolean',     'boolean', true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Active',               'is_active',            'boolean',     'boolean', true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Allow Direct Posting', 'allow_direct_posting', 'boolean',     'boolean', true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Subledger Type',       'subledger_type',       'varchar(20)', 'select',  false, false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Currency',             'currency_code',        'varchar(3)',  'lookup',  false, false, false, true,  11, 'system'),
        (v_tenant, v_vid, 'Tags',                 'tags',                 'jsonb',       'tags',    false, false, true,  true,  12, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;

        -- Field-level UI hints: read-only and lockOnEdit
        UPDATE meta.field SET validation = '{"ui": {"readOnly": true}}'::jsonb
        WHERE tenant_id = v_tenant AND entity_version_id = v_vid AND column_name = 'level';

        UPDATE meta.field SET validation = '{"ui": {"lockOnEdit": true}}'::jsonb
        WHERE tenant_id = v_tenant AND entity_version_id = v_vid AND column_name = 'account_code';
    END IF;

    -- ---- CostCenter ----
    v_vid := pg_temp.ev_id(v_tenant, 'CostCenter');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',    'code',      'varchar(20)', 'code',    true,  true,  true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Name',    'name',      'varchar(200)','text',    true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Parent',  'parent_id', 'uuid',        'lookup',  false, false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'Active',  'is_active', 'boolean',     'boolean', true,  false, false, true,  4, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- ProfitCenter ----
    v_vid := pg_temp.ev_id(v_tenant, 'ProfitCenter');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',   'code',      'varchar(20)', 'code',    true,  true,  true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Name',   'name',      'varchar(200)','text',    true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Active', 'is_active', 'boolean',     'boolean', true,  false, false, true,  3, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- FiscalPeriod ----
    v_vid := pg_temp.ev_id(v_tenant, 'FiscalPeriod');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Fiscal Year',    'fiscal_year',    'smallint',    'number',   true,  false, true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Period Number',  'period_number',  'smallint',    'number',   true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Period Name',    'period_name',    'varchar(50)', 'text',     true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Start Date',     'start_date',     'date',        'date',     true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'End Date',       'end_date',       'date',        'date',     true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Status',         'status',         'varchar(20)', 'select',   true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Opened At',      'opened_at',      'timestamptz', 'datetime', false, false, false, false, 7,  'system'),
        (v_tenant, v_vid, 'Soft Closed At', 'soft_closed_at', 'timestamptz', 'datetime', false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Hard Closed At', 'hard_closed_at', 'timestamptz', 'datetime', false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Closed By',      'closed_by',      'uuid',        'lookup',   false, false, false, false, 10, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- AccountingProfile ----
    v_vid := pg_temp.ev_id(v_tenant, 'AccountingProfile');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',             'code',             'varchar(50)', 'code',     true,  true,  true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Name',             'name',             'varchar(200)','text',     true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Description',      'description',      'text',        'textarea', false, false, true,  false, 3, 'system'),
        (v_tenant, v_vid, 'Intent Filter',    'intent_filter',    'jsonb',       'json',     false, false, false, false, 4, 'system'),
        (v_tenant, v_vid, 'Category Filter',  'category_filter',  'jsonb',       'json',     false, false, false, false, 5, 'system'),
        (v_tenant, v_vid, 'Posting Pattern',  'posting_pattern',  'jsonb',       'json',     true,  false, false, false, 6, 'system'),
        (v_tenant, v_vid, 'Active',           'is_active',        'boolean',     'boolean',  true,  false, false, true,  7, 'system'),
        (v_tenant, v_vid, 'Version',          'version',          'int',         'number',   true,  false, false, false, 8, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- OperatingUnit ----
    v_vid := pg_temp.ev_id(v_tenant, 'OperatingUnit');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Org Unit',                'org_unit_id',              'uuid',        'lookup',  true,  false, false, true,  1,  'system'),
        (v_tenant, v_vid, 'Code',                    'code',                     'varchar(50)', 'code',    true,  true,  true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Name',                    'name',                     'varchar(200)','text',    true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Description',             'description',              'text',        'textarea',false, false, true,  false, 4,  'system'),
        (v_tenant, v_vid, 'Parent',                  'parent_id',                'uuid',        'lookup',  false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Level',                   'level',                    'smallint',    'number',  true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Status',                  'status',                   'varchar(20)', 'select',  true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Activated At',            'activated_at',             'timestamptz', 'datetime',false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Sunset At',               'sunset_at',               'timestamptz', 'datetime',false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Default Funding Profile', 'default_fp_id',            'uuid',        'lookup',  false, false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Default Cost Center',     'default_cost_center_id',   'uuid',        'lookup',  false, false, false, false, 11, 'system'),
        (v_tenant, v_vid, 'Default Profit Center',   'default_profit_center_id', 'uuid',        'lookup',  false, false, false, false, 12, 'system'),
        (v_tenant, v_vid, 'Default Currency',        'default_currency_code',    'varchar(3)',  'lookup',  false, false, false, true,  13, 'system'),
        (v_tenant, v_vid, 'Inherit From Parent',     'inherit_from_parent',      'boolean',     'boolean', true,  false, false, true,  14, 'system'),
        (v_tenant, v_vid, 'Metadata',                'metadata',                 'jsonb',       'json',    false, false, false, false, 15, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;

        -- Field-level UI hints: read-only and lockOnEdit
        UPDATE meta.field SET validation = '{"ui": {"readOnly": true}}'::jsonb
        WHERE tenant_id = v_tenant AND entity_version_id = v_vid AND column_name = 'level';

        UPDATE meta.field SET validation = '{"ui": {"lockOnEdit": true}}'::jsonb
        WHERE tenant_id = v_tenant AND entity_version_id = v_vid AND column_name = 'code';
    END IF;

    -- ---- BusinessIntent ----
    v_vid := pg_temp.ev_id(v_tenant, 'BusinessIntent');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',                   'code',                            'varchar(50)', 'code',       true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',                   'name',                            'varchar(200)','text',       true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Description',            'description',                     'text',        'textarea',   false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Domain',                 'domain',                          'varchar(50)', 'select',     true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Subtype',                'subtype',                         'varchar(50)', 'select',     false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Parent',                 'parent_id',                       'uuid',        'lookup',     false, false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Requires Approval',      'requires_approval',               'boolean',     'boolean',    true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Max Auto-Approve Amount','max_auto_approve_amount',         'decimal',     'currency',   false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Max Auto-Approve CCY',   'max_auto_approve_currency',       'varchar(3)',  'lookup',     false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Visibility',             'visibility',                      'varchar(20)', 'select',     true,  false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Default GL Account',     'default_gl_account',              'varchar(20)', 'lookup',     false, false, false, false, 11, 'system'),
        (v_tenant, v_vid, 'Default Tax Code',       'default_tax_code',                'varchar(20)', 'lookup',     false, false, false, false, 12, 'system'),
        (v_tenant, v_vid, 'Default Asset Profile',  'default_asset_profile_code',      'varchar(50)', 'lookup',     false, false, false, false, 13, 'system'),
        (v_tenant, v_vid, 'Default Acct Profile',   'default_accounting_profile_code', 'varchar(50)', 'lookup',     false, false, false, false, 14, 'system'),
        (v_tenant, v_vid, 'Active',                 'is_active',                       'boolean',     'boolean',    true,  false, false, true,  15, 'system'),
        (v_tenant, v_vid, 'Sort Order',             'sort_order',                      'int',         'number',     true,  false, false, false, 16, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- FundingProfile ----
    v_vid := pg_temp.ev_id(v_tenant, 'FundingProfile');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',                     'code',                      'varchar(50)', 'code',       true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',                     'name',                      'varchar(200)','text',       true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Description',              'description',               'text',        'textarea',   false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Level',                    'level',                     'smallint',    'select',     true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Parent',                   'parent_id',                 'uuid',        'lookup',     false, false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Operating Unit',           'ou_id',                     'uuid',        'lookup',     false, false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Intent',                   'intent_id',                 'uuid',        'lookup',     false, false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Total Limit',              'total_limit',               'decimal',     'currency',   true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Currency',                 'currency_code',             'varchar(3)',  'lookup',     true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Reserved Amount',          'reserved_amount',           'decimal',     'currency',   true,  false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Committed Amount',         'committed_amount',          'decimal',     'currency',   true,  false, false, false, 11, 'system'),
        (v_tenant, v_vid, 'Consumed Amount',          'consumed_amount',           'decimal',     'currency',   true,  false, false, false, 12, 'system'),
        (v_tenant, v_vid, 'Released Amount',          'released_amount',           'decimal',     'currency',   true,  false, false, false, 13, 'system'),
        (v_tenant, v_vid, 'Health Status',            'health_status',             'varchar(10)', 'select',     true,  false, false, true,  14, 'system'),
        (v_tenant, v_vid, 'Utilization %',            'utilization_pct',           'decimal',     'percentage', true,  false, false, true,  15, 'system'),
        (v_tenant, v_vid, 'Trend',                    'trend',                     'varchar(15)', 'select',     true,  false, false, true,  16, 'system'),
        (v_tenant, v_vid, 'Predicted Exhaustion',     'predicted_exhaustion_date', 'date',        'date',       false, false, false, false, 17, 'system'),
        (v_tenant, v_vid, 'Fiscal Year',              'fiscal_year',               'smallint',    'number',     true,  false, true,  true,  18, 'system'),
        (v_tenant, v_vid, 'Multi-Year',               'is_multi_year',             'boolean',     'boolean',    true,  false, false, true,  19, 'system'),
        (v_tenant, v_vid, 'Carry Forward Rule',       'carry_forward_rule',        'varchar(10)', 'select',     true,  false, false, true,  20, 'system'),
        (v_tenant, v_vid, 'Carry Forward Cap',        'carry_forward_cap',         'decimal',     'currency',   false, false, false, false, 21, 'system'),
        (v_tenant, v_vid, 'Status',                   'status',                    'varchar(20)', 'select',     true,  false, false, true,  22, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Warehouse ----
    v_vid := pg_temp.ev_id(v_tenant, 'Warehouse');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',   'code',      'varchar(20)', 'code',    true,  true,  true,  true, 1, 'system'),
        (v_tenant, v_vid, 'Name',   'name',      'varchar(200)','text',    true,  false, true,  true, 2, 'system'),
        (v_tenant, v_vid, 'Active', 'is_active', 'boolean',     'boolean', true,  false, false, true, 3, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- ItemMaster ----
    v_vid := pg_temp.ev_id(v_tenant, 'ItemMaster');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Product',          'product_id',       'uuid',        'lookup',  true,  false, false, true,  1,  'system'),
        (v_tenant, v_vid, 'Valuation Method', 'valuation_method', 'text',        'select',  true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Standard Cost',    'standard_cost',    'decimal',     'currency',false, false, false, false, 3,  'system'),
        (v_tenant, v_vid, 'Currency',         'currency_code',    'varchar(3)',  'lookup',  true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Reorder Point',    'reorder_point',    'decimal',     'number',  false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Reorder Qty',      'reorder_qty',      'decimal',     'number',  false, false, false, false, 6,  'system'),
        (v_tenant, v_vid, 'Safety Stock',     'safety_stock',     'decimal',     'number',  false, false, false, false, 7,  'system'),
        (v_tenant, v_vid, 'Lot Tracking',     'lot_tracking',     'boolean',     'boolean', true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Serial Tracking',  'serial_tracking',  'boolean',     'boolean', true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'UOM',              'uom_code',         'varchar(20)', 'lookup',  true,  false, false, true,  10, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Asset ----
    v_vid := pg_temp.ev_id(v_tenant, 'Asset');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Asset Number',        'asset_number',        'varchar(40)', 'code',     true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',                'name',                'varchar(255)','text',     true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Description',         'description',         'text',        'textarea', false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'Asset Class',         'asset_class',         'varchar(30)', 'select',   true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Status',              'status',              'varchar(20)', 'select',   true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Acquisition Date',    'acquisition_date',    'date',        'date',     true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Acquisition Cost',    'acquisition_cost',    'decimal',     'currency', true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Currency',            'currency_code',       'varchar(3)',  'lookup',   true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Residual Value',      'residual_value',      'decimal',     'currency', true,  false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Useful Life (months)','useful_life_months',  'int',         'number',   true,  false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Operating Unit',      'ou_id',               'uuid',        'lookup',   false, false, false, true,  11, 'system'),
        (v_tenant, v_vid, 'Cost Center',         'cost_center_id',      'uuid',        'lookup',   false, false, false, true,  12, 'system'),
        (v_tenant, v_vid, 'Location',            'location',            'varchar(255)','text',     false, false, true,  true,  13, 'system'),
        (v_tenant, v_vid, 'Vendor',              'vendor_id',           'uuid',        'lookup',   false, false, false, true,  14, 'system'),
        (v_tenant, v_vid, 'Commitment',          'commitment_id',       'uuid',        'lookup',   false, false, false, false, 15, 'system'),
        (v_tenant, v_vid, 'Capitalized from WIP','capitalized_from_wip','boolean',     'boolean',  true,  false, false, true,  16, 'system'),
        (v_tenant, v_vid, 'Parent Asset',        'parent_asset_id',     'uuid',        'lookup',   false, false, false, true,  17, 'system'),
        (v_tenant, v_vid, 'Tags',                'tags',                'jsonb',       'tags',     false, false, true,  true,  18, 'system'),
        (v_tenant, v_vid, 'Metadata',            'metadata',            'jsonb',       'json',     false, false, false, false, 19, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- CommissionPlan ----
    v_vid := pg_temp.ev_id(v_tenant, 'CommissionPlan');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',                'code',                 'varchar(50)', 'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',                'name',                 'varchar(200)','text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Plan Type',           'plan_type',            'varchar(20)', 'select',  true,  false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Base Metric',         'base_metric',          'varchar(20)', 'select',  true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Tiers',               'tiers',                'jsonb',       'json',    false, false, false, false, 5,  'system'),
        (v_tenant, v_vid, 'Formula',             'formula',              'text',        'textarea',false, false, false, false, 6,  'system'),
        (v_tenant, v_vid, 'Effective From',      'effective_from',       'date',        'date',    true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Effective To',        'effective_to',         'date',        'date',    false, false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Clawback Window',     'clawback_window_days','int',         'number',  true,  false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Clawback Triggers',   'clawback_triggers',   'text[]',      'tags',    false, false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Active',              'is_active',            'boolean',     'boolean', true,  false, false, true,  11, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- LegalEntity ----
    v_vid := pg_temp.ev_id(v_tenant, 'LegalEntity');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',                  'code',                  'varchar(20)', 'code',       true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',                  'name',                  'varchar(200)','text',       true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Country',               'country_code',          'varchar(2)',  'lookup',     true,  false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Functional Currency',   'functional_currency',   'varchar(3)',  'lookup',     true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Reporting Currency',    'reporting_currency',    'varchar(3)',  'lookup',     true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Entity Type',           'entity_type',           'varchar(20)', 'select',     true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Parent Entity',         'parent_entity_id',      'uuid',        'lookup',     false, false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Consolidation Method',  'consolidation_method',  'varchar(20)', 'select',     true,  false, false, true,  8,  'system'),
        (v_tenant, v_vid, 'Ownership %',           'ownership_pct',         'decimal',     'percentage', false, false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Active',                'is_active',             'boolean',     'boolean',    true,  false, false, true,  10, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- TaxJurisdiction ----
    v_vid := pg_temp.ev_id(v_tenant, 'TaxJurisdiction');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',              'code',              'varchar(20)', 'code',   true,  true,  true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Name',              'name',              'varchar(200)','text',   true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Country',           'country_code',      'varchar(2)',  'lookup', true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'State/Region',      'state_region_code', 'varchar(10)', 'lookup', false, false, false, true,  4, 'system'),
        (v_tenant, v_vid, 'Jurisdiction Type', 'jurisdiction_type', 'varchar(20)', 'select', true,  false, false, true,  5, 'system'),
        (v_tenant, v_vid, 'Parent',            'parent_id',         'uuid',        'lookup', false, false, false, true,  6, 'system'),
        (v_tenant, v_vid, 'Active',            'is_active',         'boolean',     'boolean',true,  false, false, true,  7, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- AIModelRegistry ----
    v_vid := pg_temp.ev_id(v_tenant, 'AIModelRegistry');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Model Code',          'model_code',          'varchar(50)', 'code',     true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Model Name',          'model_name',          'varchar(200)','text',     true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Model Version',       'model_version',       'varchar(20)', 'code',     true,  false, false, true,  3,  'system'),
        (v_tenant, v_vid, 'Model Type',          'model_type',          'varchar(30)', 'select',   true,  false, false, true,  4,  'system'),
        (v_tenant, v_vid, 'Target Engine',       'target_engine',       'varchar(50)', 'select',   true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Capability Level',    'capability_level',    'varchar(5)',  'select',   true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Status',              'status',              'varchar(20)', 'select',   true,  false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Config',              'config',              'jsonb',       'json',     false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Performance Metrics', 'performance_metrics', 'jsonb',       'json',     false, false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Deployed At',         'deployed_at',         'timestamptz', 'datetime', false, false, false, true,  10, 'system'),
        (v_tenant, v_vid, 'Deployed By',         'deployed_by',         'uuid',        'lookup',   false, false, false, false, 11, 'system'),
        (v_tenant, v_vid, 'Last Prediction At',  'last_prediction_at',  'timestamptz', 'datetime', false, false, false, false, 12, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §5  FIN SCHEMA — Finance Config Entities (light governance)
    -- ====================================================================

    -- ---- PolicyModule ----
    v_vid := pg_temp.ev_id(v_tenant, 'PolicyModule');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Module ID',      'module_id',      'varchar(20)', 'code',    true,  false, true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Module Name',    'module_name',    'varchar(100)','text',    true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Module Version', 'module_version', 'varchar(20)', 'code',    true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'Scope',          'scope',          'text',        'text',    true,  false, false, true,  4, 'system'),
        (v_tenant, v_vid, 'Status',         'status',         'varchar(20)', 'select',  true,  false, false, true,  5, 'system'),
        (v_tenant, v_vid, 'Config Hash',    'config_hash',    'varchar(64)', 'text',    true,  false, false, false, 6, 'system'),
        (v_tenant, v_vid, 'Config',         'config',         'jsonb',       'json',    true,  false, false, false, 7, 'system'),
        (v_tenant, v_vid, 'Extensible',     'is_extensible',  'boolean',     'boolean', true,  false, false, true,  8, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- SmartDefaultRule ----
    v_vid := pg_temp.ev_id(v_tenant, 'SmartDefaultRule');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Field Name',  'field_name', 'varchar(50)', 'text',    true,  false, true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Source',      'source',     'varchar(50)', 'text',    true,  false, false, true,  2, 'system'),
        (v_tenant, v_vid, 'Method',      'method',     'varchar(20)', 'select',  true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'Priority',    'priority',   'int',         'number',  true,  false, false, false, 4, 'system'),
        (v_tenant, v_vid, 'Conditions',  'conditions', 'jsonb',       'json',    true,  false, false, false, 5, 'system'),
        (v_tenant, v_vid, 'Resolution',  'resolution', 'jsonb',       'json',    true,  false, false, false, 6, 'system'),
        (v_tenant, v_vid, 'Active',      'is_active',  'boolean',     'boolean', true,  false, false, true,  7, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- IntercompanyAgreement ----
    v_vid := pg_temp.ev_id(v_tenant, 'IntercompanyAgreement');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Source Entity',     'source_entity_code',       'varchar(20)', 'lookup',     true,  false, true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Dest Entity',       'dest_entity_code',         'varchar(20)', 'lookup',     true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Agreement Type',    'agreement_type',           'varchar(20)', 'select',     true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'TP Method',         'transfer_pricing_method',  'varchar(30)', 'select',     true,  false, false, true,  4, 'system'),
        (v_tenant, v_vid, 'Markup %',          'markup_pct',               'decimal',     'percentage', false, false, false, false, 5, 'system'),
        (v_tenant, v_vid, 'Effective From',    'effective_from',           'date',        'date',       true,  false, false, true,  6, 'system'),
        (v_tenant, v_vid, 'Effective To',      'effective_to',             'date',        'date',       false, false, false, true,  7, 'system'),
        (v_tenant, v_vid, 'Active',            'is_active',                'boolean',     'boolean',    true,  false, false, true,  8, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- FxRate ----
    v_vid := pg_temp.ev_id(v_tenant, 'FxRate');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'From Currency',  'from_currency',  'varchar(3)',  'lookup', true,  false, false, true, 1, 'system'),
        (v_tenant, v_vid, 'To Currency',    'to_currency',    'varchar(3)',  'lookup', true,  false, false, true, 2, 'system'),
        (v_tenant, v_vid, 'Rate Type',      'rate_type',      'varchar(20)', 'select', true,  false, false, true, 3, 'system'),
        (v_tenant, v_vid, 'Rate',           'rate',           'decimal',     'number', true,  false, false, false,4, 'system'),
        (v_tenant, v_vid, 'Effective Date', 'effective_date', 'date',        'date',   true,  false, false, true, 5, 'system'),
        (v_tenant, v_vid, 'Source',         'source',         'varchar(50)', 'text',   false, false, false, true, 6, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- TaxRate ----
    v_vid := pg_temp.ev_id(v_tenant, 'TaxRate');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Jurisdiction',     'jurisdiction_id',    'uuid',        'lookup',     true,  false, false, true,  1,  'system'),
        (v_tenant, v_vid, 'Tax Type',         'tax_type',           'varchar(20)', 'select',     true,  false, false, true,  2,  'system'),
        (v_tenant, v_vid, 'Tax Code',         'tax_code',           'varchar(20)', 'code',       true,  false, true,  true,  3,  'system'),
        (v_tenant, v_vid, 'Rate',             'rate',               'decimal',     'percentage', true,  false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'Description',      'description',        'varchar(200)','text',       false, false, true,  false, 5,  'system'),
        (v_tenant, v_vid, 'Effective From',   'effective_from',     'date',        'date',       true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Effective To',     'effective_to',       'date',        'date',       false, false, false, true,  7,  'system'),
        (v_tenant, v_vid, 'Category Filter',  'category_filter',    'jsonb',       'json',       false, false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Reverse Charge',   'is_reverse_charge',  'boolean',     'boolean',    true,  false, false, true,  9,  'system'),
        (v_tenant, v_vid, 'Treaty Rate',      'treaty_rate',        'decimal',     'percentage', false, false, false, false, 10, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- BillOfMaterials ----
    v_vid := pg_temp.ev_id(v_tenant, 'BillOfMaterials');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Product',        'product_id',     'uuid',        'lookup', true,  false, false, true,  1, 'system'),
        (v_tenant, v_vid, 'Version',        'version',        'int',         'number', true,  false, false, true,  2, 'system'),
        (v_tenant, v_vid, 'Status',         'status',         'varchar(20)', 'select', true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'Effective From', 'effective_from', 'date',        'date',   false, false, false, true,  4, 'system'),
        (v_tenant, v_vid, 'Effective To',   'effective_to',   'date',        'date',   false, false, false, true,  5, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- Routing ----
    v_vid := pg_temp.ev_id(v_tenant, 'Routing');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Product',         'product_id',       'uuid',        'lookup',   true,  false, false, true,  1, 'system'),
        (v_tenant, v_vid, 'Operation Seq',   'operation_seq',    'smallint',    'number',   true,  false, false, false, 2, 'system'),
        (v_tenant, v_vid, 'Operation Name',  'operation_name',   'varchar(200)','text',     true,  false, true,  true,  3, 'system'),
        (v_tenant, v_vid, 'Work Center',     'work_center',      'varchar(50)', 'text',     false, false, true,  true,  4, 'system'),
        (v_tenant, v_vid, 'Setup Time (h)',  'setup_time_hours', 'decimal',     'number',   false, false, false, false, 5, 'system'),
        (v_tenant, v_vid, 'Run Time (h)',    'run_time_hours',   'decimal',     'number',   false, false, false, false, 6, 'system'),
        (v_tenant, v_vid, 'Labor Rate',      'labor_rate',       'decimal',     'currency', false, false, false, false, 7, 'system'),
        (v_tenant, v_vid, 'Overhead Rate',   'overhead_rate',    'decimal',     'currency', false, false, false, false, 8, 'system'),
        (v_tenant, v_vid, 'Currency',        'currency_code',    'varchar(3)',  'lookup',   false, false, false, true,  9, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- CommissionAssignment ----
    v_vid := pg_temp.ev_id(v_tenant, 'CommissionAssignment');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Partner',        'partner_id',     'uuid',        'lookup',     true,  false, false, true,  1, 'system'),
        (v_tenant, v_vid, 'Partner Type',   'partner_type',   'varchar(20)', 'select',     true,  false, false, true,  2, 'system'),
        (v_tenant, v_vid, 'Plan',           'plan_id',        'uuid',        'lookup',     true,  false, false, true,  3, 'system'),
        (v_tenant, v_vid, 'Split %',        'split_pct',      'decimal',     'percentage', true,  false, false, false, 4, 'system'),
        (v_tenant, v_vid, 'Effective From', 'effective_from', 'date',        'date',       true,  false, false, true,  5, 'system'),
        (v_tenant, v_vid, 'Effective To',   'effective_to',   'date',        'date',       false, false, false, true,  6, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §6  INT SCHEMA — Integration Entities (light governance)
    -- ====================================================================

    -- ---- IntegrationEndpoint ----
    v_vid := pg_temp.ev_id(v_tenant, 'IntegrationEndpoint');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',             'code',              'text',    'code',    true,  true,  true,  true,  1,  'system'),
        (v_tenant, v_vid, 'Name',             'name',              'text',    'text',    true,  false, true,  true,  2,  'system'),
        (v_tenant, v_vid, 'Description',      'description',       'text',    'textarea',false, false, true,  false, 3,  'system'),
        (v_tenant, v_vid, 'URL',              'url',               'text',    'text',    true,  false, false, false, 4,  'system'),
        (v_tenant, v_vid, 'HTTP Method',      'http_method',       'text',    'select',  true,  false, false, true,  5,  'system'),
        (v_tenant, v_vid, 'Auth Type',        'auth_type',         'text',    'select',  true,  false, false, true,  6,  'system'),
        (v_tenant, v_vid, 'Auth Config',      'auth_config',       'jsonb',   'json',    true,  false, false, false, 7,  'system'),
        (v_tenant, v_vid, 'Default Headers',  'default_headers',   'jsonb',   'json',    true,  false, false, false, 8,  'system'),
        (v_tenant, v_vid, 'Timeout (ms)',     'timeout_ms',        'int',     'number',  true,  false, false, false, 9,  'system'),
        (v_tenant, v_vid, 'Retry Policy',     'retry_policy',      'jsonb',   'json',    true,  false, false, false, 10, 'system'),
        (v_tenant, v_vid, 'Rate Limit Config','rate_limit_config', 'jsonb',   'json',    false, false, false, false, 11, 'system'),
        (v_tenant, v_vid, 'Active',           'is_active',         'boolean', 'boolean', true,  false, false, true,  12, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- IntegrationFlow ----
    v_vid := pg_temp.ev_id(v_tenant, 'IntegrationFlow');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',           'code',           'text',    'code',    true,  true,  true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Name',           'name',           'text',    'text',    true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Description',    'description',    'text',    'textarea',false, false, true,  false, 3, 'system'),
        (v_tenant, v_vid, 'Steps',          'steps',          'jsonb',   'json',    true,  false, false, false, 4, 'system'),
        (v_tenant, v_vid, 'Trigger Type',   'trigger_type',   'text',    'select',  true,  false, false, true,  5, 'system'),
        (v_tenant, v_vid, 'Trigger Config', 'trigger_config', 'jsonb',   'json',    true,  false, false, false, 6, 'system'),
        (v_tenant, v_vid, 'Active',         'is_active',      'boolean', 'boolean', true,  false, false, true,  7, 'system'),
        (v_tenant, v_vid, 'Version',        'version',        'int',     'number',  true,  false, false, false, 8, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ---- WebhookSubscription ----
    v_vid := pg_temp.ev_id(v_tenant, 'WebhookSubscription');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, is_unique, is_searchable, is_filterable, sort_order, created_by) VALUES
        (v_tenant, v_vid, 'Code',             'code',              'text',        'code',    true,  true,  true,  true,  1, 'system'),
        (v_tenant, v_vid, 'Name',             'name',              'text',        'text',    true,  false, true,  true,  2, 'system'),
        (v_tenant, v_vid, 'Endpoint URL',     'endpoint_url',      'text',        'text',    true,  false, false, false, 3, 'system'),
        (v_tenant, v_vid, 'Secret Hash',      'secret_hash',       'text',        'text',    true,  false, false, false, 4, 'system'),
        (v_tenant, v_vid, 'Event Types',      'event_types',       'text[]',      'tags',    true,  false, true,  true,  5, 'system'),
        (v_tenant, v_vid, 'Active',           'is_active',         'boolean',     'boolean', true,  false, false, true,  6, 'system'),
        (v_tenant, v_vid, 'Metadata',         'metadata',          'jsonb',       'json',    false, false, false, false, 7, 'system'),
        (v_tenant, v_vid, 'Last Triggered At','last_triggered_at', 'timestamptz', 'datetime',false, false, false, true,  8, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    RAISE NOTICE 'Field dictionary populated: % fields',
        (SELECT count(*) FROM meta.field WHERE tenant_id = v_tenant);

END $$;

-- ============================================================================
-- Replicate field dictionary to all other demo tenants
-- ============================================================================
DO $$
DECLARE
    v_source_tenant uuid;
    v_target_tenant uuid;
    v_source_vid    uuid;
    v_target_vid    uuid;
    r_entity        record;
    r_field         record;
BEGIN
    SELECT id INTO v_source_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_source_tenant IS NULL THEN RETURN; END IF;

    FOR v_target_tenant IN
        SELECT id FROM core.tenant WHERE id != v_source_tenant
    LOOP
        -- For each entity with fields in source tenant
        FOR r_entity IN
            SELECT DISTINCT e.name
            FROM meta.field f
            JOIN meta.entity_version ev ON f.entity_version_id = ev.id
            JOIN meta.entity e ON ev.entity_id = e.id
            WHERE f.tenant_id = v_source_tenant
        LOOP
            -- Resolve source and target version IDs
            v_source_vid := pg_temp.ev_id(v_source_tenant, r_entity.name);
            v_target_vid := pg_temp.ev_id(v_target_tenant, r_entity.name);

            IF v_source_vid IS NOT NULL AND v_target_vid IS NOT NULL THEN
                INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                        is_required, is_unique, is_searchable, is_filterable,
                                        default_value, validation, lookup_config,
                                        sort_order, is_active, created_by)
                SELECT v_target_tenant, v_target_vid, f.name, f.column_name, f.data_type, f.ui_type,
                       f.is_required, f.is_unique, f.is_searchable, f.is_filterable,
                       f.default_value, f.validation, f.lookup_config,
                       f.sort_order, f.is_active, 'system'
                FROM meta.field f
                WHERE f.tenant_id = v_source_tenant AND f.entity_version_id = v_source_vid
                ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Field dictionary replicated to all tenants. Total fields: %',
        (SELECT count(*) FROM meta.field);
END $$;
