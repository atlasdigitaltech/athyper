-- Industry-specific leaves grafted onto the universal org/cost/profit foundation
-- seeded by universal/060_org_structure/300-302. Targeting rules:
--   * Multi-company tenants — tag each company_code via metadata:
--       _industry_vertical='utilities' OR _industry_pack='pack_utilities'
--       OR _industry_verticals/_industry_packs as JSON arrays.
--   * Single-company tenants — pack applies if marked in blueprint_tenant_application.

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid;
    v_pack     text := 'org_industry_templates';
    v_version  text := '1.0.0';
    v_targets  int;
    v_pack_codes text[];
    v_company_ids uuid[];
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;
    v_su := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    IF v_su IS NULL OR NOT EXISTS (SELECT 1 FROM master.principal WHERE tenant_id=v_tid AND id=v_su AND status='active') THEN
        RAISE EXCEPTION '[000_industry_org_templates] active tenant-local actor required';
    END IF;
    v_pack_codes := string_to_array(nullif(trim(current_setting('app.seed_industry_pack_codes', true)), ''), ',');
    v_company_ids := string_to_array(nullif(trim(current_setting('app.seed_company_code_ids', true)), ''), ',')::uuid[];
    IF v_pack_codes IS NULL OR cardinality(v_pack_codes)=0 THEN
        RAISE EXCEPTION '[000_industry_org_templates] explicit app.seed_industry_pack_codes required';
    END IF;

    CREATE TEMP TABLE tmp_industry_template (
        template_kind     text NOT NULL, -- org, cost, profit
        pack_code         text NOT NULL,
        industry_vertical text NOT NULL,
        parent_suffix     text NOT NULL,
        suffix            text NOT NULL,
        display_name      text NOT NULL,
        classification    text NOT NULL,
        sort_order        smallint NOT NULL,
        PRIMARY KEY (template_kind, pack_code, parent_suffix, suffix)
    ) ON COMMIT DROP;

    INSERT INTO tmp_industry_template
        (template_kind, pack_code, industry_vertical, parent_suffix, suffix, display_name, classification, sort_order)
    VALUES
    ('org',    'pack_utilities',          'utilities',          'OPS', 'GRID',      'Grid Operations',              'department', 510),
    ('org',    'pack_utilities',          'utilities',          'OPS', 'GEN',       'Generation Operations',        'department', 520),
    ('org',    'pack_utilities',          'utilities',          'OPS', 'DIST',      'Distribution Operations',      'department', 530),
    ('cost',   'pack_utilities',          'utilities',          'OPS', 'GRID',      'Grid Operations',              'production', 510),
    ('cost',   'pack_utilities',          'utilities',          'OPS', 'GEN',       'Generation Operations',        'production', 520),
    ('cost',   'pack_utilities',          'utilities',          'OPS', 'DIST',      'Distribution Operations',      'production', 530),
    ('profit', 'pack_utilities',          'utilities',          'EXT', 'ELEC',      'Electricity Sales',            'revenue',    510),
    ('profit', 'pack_utilities',          'utilities',          'EXT', 'WATER',     'Water Supply',                 'revenue',    520),
    ('profit', 'pack_utilities',          'utilities',          'EXT', 'CONNECT',   'Connection Fees',              'revenue',    530),

    ('org',    'pack_construction',       'construction',       'OPS', 'PROJECTS',  'Project Delivery',             'department', 510),
    ('org',    'pack_construction',       'construction',       'OPS', 'CIVIL',     'Civil Works',                  'department', 520),
    ('org',    'pack_construction',       'construction',       'OPS', 'MEP',       'MEP Works',                    'department', 530),
    ('cost',   'pack_construction',       'construction',       'OPS', 'PROJECTS',  'Project Delivery',             'production', 510),
    ('cost',   'pack_construction',       'construction',       'OPS', 'CIVIL',     'Civil Works',                  'production', 520),
    ('cost',   'pack_construction',       'construction',       'OPS', 'MEP',       'MEP Works',                    'production', 530),
    ('profit', 'pack_construction',       'construction',       'EXT', 'BLDG',      'Building Construction',        'revenue',    510),
    ('profit', 'pack_construction',       'construction',       'EXT', 'CIVIL',     'Civil Engineering',            'revenue',    520),
    ('profit', 'pack_construction',       'construction',       'EXT', 'MEP',       'MEP Contracting',              'revenue',    530),

    ('org',    'pack_real_estate',        'real_estate',        'OPS', 'PROPERTY',  'Property Operations',          'department', 510),
    ('org',    'pack_real_estate',        'real_estate',        'OPS', 'DEV',       'Development Operations',       'department', 520),
    ('org',    'pack_real_estate',        'real_estate',        'OPS', 'FACILITY',  'Facilities Operations',        'department', 530),
    ('cost',   'pack_real_estate',        'real_estate',        'OPS', 'PROPERTY',  'Property Operations',          'service',    510),
    ('cost',   'pack_real_estate',        'real_estate',        'OPS', 'DEV',       'Development Operations',       'production', 520),
    ('cost',   'pack_real_estate',        'real_estate',        'OPS', 'FACILITY',  'Facilities Operations',        'service',    530),
    ('profit', 'pack_real_estate',        'real_estate',        'EXT', 'RENTAL',    'Rental Income',                'revenue',    510),
    ('profit', 'pack_real_estate',        'real_estate',        'EXT', 'PRODEV',    'Property Development',         'revenue',    520),
    ('profit', 'pack_real_estate',        'real_estate',        'EXT', 'PROPSAL',   'Property Sales',               'revenue',    530),

    ('org',    'pack_transport',          'transport',          'OPS', 'FLEET',     'Fleet Operations',             'department', 510),
    ('org',    'pack_transport',          'transport',          'OPS', 'WHSE',      'Warehouse Operations',         'department', 520),
    ('org',    'pack_transport',          'transport',          'OPS', 'LASTMILE',  'Last Mile Operations',         'department', 530),
    ('cost',   'pack_transport',          'transport',          'OPS', 'FLEET',     'Fleet Operations',             'logistics',  510),
    ('cost',   'pack_transport',          'transport',          'OPS', 'WHSE',      'Warehouse Operations',         'logistics',  520),
    ('cost',   'pack_transport',          'transport',          'OPS', 'LASTMILE',  'Last Mile Operations',         'logistics',  530),
    ('profit', 'pack_transport',          'transport',          'EXT', 'FREIGHT',   'Freight and Haulage',          'revenue',    510),
    ('profit', 'pack_transport',          'transport',          'EXT', 'WHSE',      'Warehousing and Storage',      'revenue',    520),
    ('profit', 'pack_transport',          'transport',          'EXT', 'LASTMILE',  'Last Mile Delivery',           'revenue',    530),

    ('org',    'pack_trading',            'trading',            'OPS', 'BUYING',    'Buying and Merchandising',     'department', 510),
    ('org',    'pack_trading',            'trading',            'OPS', 'RETAIL',    'Retail Operations',            'department', 520),
    ('org',    'pack_trading',            'trading',            'OPS', 'ECOMM',     'E-Commerce Operations',        'department', 530),
    ('cost',   'pack_trading',            'trading',            'OPS', 'BUYING',    'Buying and Merchandising',     'sales',      510),
    ('cost',   'pack_trading',            'trading',            'OPS', 'RETAIL',    'Retail Operations',            'sales',      520),
    ('cost',   'pack_trading',            'trading',            'OPS', 'ECOMM',     'E-Commerce Operations',        'sales',      530),
    ('profit', 'pack_trading',            'trading',            'EXT', 'WHLSALE',   'Wholesale',                    'revenue',    510),
    ('profit', 'pack_trading',            'trading',            'EXT', 'RETAIL',    'Retail',                       'revenue',    520),
    ('profit', 'pack_trading',            'trading',            'EXT', 'ECOMM',     'E-Commerce',                   'revenue',    530),

    ('org',    'pack_hospitality',        'hospitality',        'OPS', 'ROOMS',     'Rooms Operations',             'department', 510),
    ('org',    'pack_hospitality',        'hospitality',        'OPS', 'FB',        'Food and Beverage Operations', 'department', 520),
    ('org',    'pack_hospitality',        'hospitality',        'OPS', 'EVENTS',    'Events Operations',            'department', 530),
    ('cost',   'pack_hospitality',        'hospitality',        'OPS', 'ROOMS',     'Rooms Operations',             'service',    510),
    ('cost',   'pack_hospitality',        'hospitality',        'OPS', 'FB',        'Food and Beverage Operations', 'service',    520),
    ('cost',   'pack_hospitality',        'hospitality',        'OPS', 'EVENTS',    'Events Operations',            'service',    530),
    ('profit', 'pack_hospitality',        'hospitality',        'EXT', 'ROOMS',     'Rooms Revenue',                'revenue',    510),
    ('profit', 'pack_hospitality',        'hospitality',        'EXT', 'FB',        'Food and Beverage Revenue',    'revenue',    520),
    ('profit', 'pack_hospitality',        'hospitality',        'EXT', 'EVENTS',    'Events and Banqueting',        'revenue',    530),
    ('profit', 'pack_hospitality',        'hospitality',        'EXT', 'SPA',       'Spa and Recreation',           'revenue',    540),

    ('org',    'pack_infocomm',           'infocomm',           'OPS', 'CLOUD',     'Cloud Operations',             'department', 510),
    ('org',    'pack_infocomm',           'infocomm',           'OPS', 'RND',       'Research and Development',     'department', 520),
    ('org',    'pack_infocomm',           'infocomm',           'OPS', 'DELIVERY',  'Service Delivery',             'department', 530),
    ('cost',   'pack_infocomm',           'infocomm',           'OPS', 'CLOUD',     'Cloud Operations',             'service',    510),
    ('cost',   'pack_infocomm',           'infocomm',           'OPS', 'RND',       'Research and Development',     'r_and_d',    520),
    ('cost',   'pack_infocomm',           'infocomm',           'OPS', 'DELIVERY',  'Service Delivery',             'service',    530),
    ('profit', 'pack_infocomm',           'infocomm',           'EXT', 'SAAS',      'SaaS Recurring',               'revenue',    510),
    ('profit', 'pack_infocomm',           'infocomm',           'EXT', 'CONSULT',   'Consulting and Implementation','revenue',    520),
    ('profit', 'pack_infocomm',           'infocomm',           'EXT', 'LICENSE',   'License and IP',               'revenue',    530),

    ('org',    'pack_financial',          'financial',          'OPS', 'LENDING',   'Lending Operations',           'department', 510),
    ('org',    'pack_financial',          'financial',          'OPS', 'RISK',      'Risk and Compliance',          'department', 520),
    ('org',    'pack_financial',          'financial',          'OPS', 'INSURANCE', 'Insurance Operations',         'department', 530),
    ('cost',   'pack_financial',          'financial',          'OPS', 'LENDING',   'Lending Operations',           'service',    510),
    ('cost',   'pack_financial',          'financial',          'OPS', 'RISK',      'Risk and Compliance',          'admin',      520),
    ('cost',   'pack_financial',          'financial',          'OPS', 'INSURANCE', 'Insurance Operations',         'service',    530),
    ('profit', 'pack_financial',          'financial',          'EXT', 'LENDING',   'Lending and Interest',         'revenue',    510),
    ('profit', 'pack_financial',          'financial',          'EXT', 'FEES',      'Fees and Commissions',         'revenue',    520),
    ('profit', 'pack_financial',          'financial',          'INV', 'TRADING',   'Trading and Markets',          'investment', 530),
    ('profit', 'pack_financial',          'financial',          'SVC', 'INSURANCE', 'Insurance Premiums',           'service',    540),

    ('org',    'pack_mfg_textile',        'mfg_textile',        'OPS', 'CUTSEW',    'Cut and Sew Operations',       'department', 510),
    ('org',    'pack_mfg_textile',        'mfg_textile',        'OPS', 'FABRIC',    'Fabric Operations',            'department', 520),
    ('org',    'pack_mfg_textile',        'mfg_textile',        'OPS', 'QC',        'Quality Control',              'department', 530),
    ('cost',   'pack_mfg_textile',        'mfg_textile',        'OPS', 'CUTSEW',    'Cut and Sew Operations',       'production', 510),
    ('cost',   'pack_mfg_textile',        'mfg_textile',        'OPS', 'FABRIC',    'Fabric Operations',            'production', 520),
    ('cost',   'pack_mfg_textile',        'mfg_textile',        'OPS', 'QC',        'Quality Control',              'production', 530),
    ('profit', 'pack_mfg_textile',        'mfg_textile',        'EXT', 'GARMENT',   'Garments and Apparel',         'revenue',    510),
    ('profit', 'pack_mfg_textile',        'mfg_textile',        'EXT', 'FABRIC',    'Fabric Sales',                 'revenue',    520),
    ('profit', 'pack_mfg_textile',        'mfg_textile',        'EXT', 'LEATHER',   'Leather Goods',                'revenue',    530),

    ('org',    'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PROCESS',   'Processing Operations',        'department', 510),
    ('org',    'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PACKAGING', 'Packaging Operations',         'department', 520),
    ('org',    'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'QA',        'Quality Assurance',            'department', 530),
    ('cost',   'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PROCESS',   'Processing Operations',        'production', 510),
    ('cost',   'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PACKAGING', 'Packaging Operations',         'production', 520),
    ('cost',   'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'QA',        'Quality Assurance',            'production', 530),
    ('profit', 'pack_mfg_food_bev',       'mfg_food_bev',       'EXT', 'PACKAGED',  'Packaged Food',                'revenue',    510),
    ('profit', 'pack_mfg_food_bev',       'mfg_food_bev',       'EXT', 'BEVERAGE',  'Beverages',                    'revenue',    520),
    ('profit', 'pack_mfg_food_bev',       'mfg_food_bev',       'EXT', 'INGREDNT',  'Ingredient and B2B',           'revenue',    530),

    ('org',    'pack_mfg_pharma',         'mfg_pharma',         'OPS', 'PROD',      'Production Operations',        'department', 510),
    ('org',    'pack_mfg_pharma',         'mfg_pharma',         'OPS', 'QA',        'Quality Assurance',            'department', 520),
    ('org',    'pack_mfg_pharma',         'mfg_pharma',         'OPS', 'LAB',       'Laboratory Operations',        'department', 530),
    ('cost',   'pack_mfg_pharma',         'mfg_pharma',         'OPS', 'PROD',      'Production Operations',        'production', 510),
    ('cost',   'pack_mfg_pharma',         'mfg_pharma',         'OPS', 'QA',        'Quality Assurance',            'production', 520),
    ('cost',   'pack_mfg_pharma',         'mfg_pharma',         'OPS', 'LAB',       'Laboratory Operations',        'r_and_d',    530),
    ('profit', 'pack_mfg_pharma',         'mfg_pharma',         'EXT', 'BRANDED',   'Branded Products',             'revenue',    510),
    ('profit', 'pack_mfg_pharma',         'mfg_pharma',         'EXT', 'GENERIC',   'Generic Products',             'revenue',    520),
    ('profit', 'pack_mfg_pharma',         'mfg_pharma',         'EXT', 'API',       'API Third-Party Sales',        'revenue',    530),
    ('profit', 'pack_mfg_pharma',         'mfg_pharma',         'SVC', 'LICENSING', 'Licensing and Royalties',      'service',    540),

    ('org',    'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'SMT',       'SMT Operations',               'department', 510),
    ('org',    'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'ASSEMBLY',  'Assembly Operations',          'department', 520),
    ('org',    'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'TEST',      'Test Operations',              'department', 530),
    ('cost',   'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'SMT',       'SMT Operations',               'production', 510),
    ('cost',   'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'ASSEMBLY',  'Assembly Operations',          'production', 520),
    ('cost',   'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'TEST',      'Test Operations',              'production', 530),
    ('profit', 'pack_mfg_electronics',    'mfg_electronics',    'EXT', 'OEM',       'OEM Components',               'revenue',    510),
    ('profit', 'pack_mfg_electronics',    'mfg_electronics',    'EXT', 'MODULE',    'Module Assembly',              'revenue',    520),
    ('profit', 'pack_mfg_electronics',    'mfg_electronics',    'EXT', 'AFTERMKT',  'Aftermarket and Spares',       'revenue',    530),

    ('org',    'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'EXTRACT',   'Extraction Operations',        'department', 510),
    ('org',    'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'PROCESS',   'Processing Operations',        'department', 520),
    ('org',    'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'HSE',       'HSE Operations',               'department', 530),
    ('cost',   'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'EXTRACT',   'Extraction Operations',        'production', 510),
    ('cost',   'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'PROCESS',   'Processing Operations',        'production', 520),
    ('cost',   'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'HSE',       'HSE Operations',               'admin',      530),
    ('profit', 'pack_mining_petroleum',   'mining_petroleum',   'EXT', 'CRUDE',     'Crude Oil Sales',              'revenue',    510),
    ('profit', 'pack_mining_petroleum',   'mining_petroleum',   'EXT', 'GAS',       'Natural Gas Sales',            'revenue',    520),
    ('profit', 'pack_mining_petroleum',   'mining_petroleum',   'EXT', 'NGL',       'NGL and Condensate',           'revenue',    530),

    ('org',    'pack_agriculture',        'agriculture',        'OPS', 'CROP',      'Crop Operations',              'department', 510),
    ('org',    'pack_agriculture',        'agriculture',        'OPS', 'LIVESTOCK', 'Livestock Operations',         'department', 520),
    ('org',    'pack_agriculture',        'agriculture',        'OPS', 'DAIRY',     'Dairy Operations',             'department', 530),
    ('cost',   'pack_agriculture',        'agriculture',        'OPS', 'CROP',      'Crop Operations',              'production', 510),
    ('cost',   'pack_agriculture',        'agriculture',        'OPS', 'LIVESTOCK', 'Livestock Operations',         'production', 520),
    ('cost',   'pack_agriculture',        'agriculture',        'OPS', 'DAIRY',     'Dairy Operations',             'production', 530),
    ('profit', 'pack_agriculture',        'agriculture',        'EXT', 'CROP',      'Crop Sales',                   'revenue',    510),
    ('profit', 'pack_agriculture',        'agriculture',        'EXT', 'LIVESTOCK', 'Livestock Sales',              'revenue',    520),
    ('profit', 'pack_agriculture',        'agriculture',        'EXT', 'DAIRY',     'Dairy and Produce',            'revenue',    530),

    ('org',    'pack_education',          'education',          'OPS', 'ACADEMIC',  'Academic Operations',          'department', 510),
    ('org',    'pack_education',          'education',          'OPS', 'RESEARCH',  'Research Operations',          'department', 520),
    ('org',    'pack_education',          'education',          'OPS', 'EXEC',      'Executive Education',          'department', 530),
    ('cost',   'pack_education',          'education',          'OPS', 'ACADEMIC',  'Academic Operations',          'service',    510),
    ('cost',   'pack_education',          'education',          'OPS', 'RESEARCH',  'Research Operations',          'r_and_d',    520),
    ('cost',   'pack_education',          'education',          'OPS', 'EXEC',      'Executive Education',          'service',    530),
    ('profit', 'pack_education',          'education',          'EXT', 'TUITION',   'Tuition Fees',                 'revenue',    510),
    ('profit', 'pack_education',          'education',          'EXT', 'RESEARCH',  'Research Grants',              'revenue',    520),
    ('profit', 'pack_education',          'education',          'SVC', 'EXEC',      'Executive Education',          'service',    530),

    ('org',    'pack_healthcare',         'healthcare',         'OPS', 'INPAT',     'Inpatient Operations',         'department', 510),
    ('org',    'pack_healthcare',         'healthcare',         'OPS', 'OUTPAT',    'Outpatient Operations',        'department', 520),
    ('org',    'pack_healthcare',         'healthcare',         'OPS', 'DIAG',      'Diagnostics Operations',       'department', 530),
    ('cost',   'pack_healthcare',         'healthcare',         'OPS', 'INPAT',     'Inpatient Operations',         'service',    510),
    ('cost',   'pack_healthcare',         'healthcare',         'OPS', 'OUTPAT',    'Outpatient Operations',        'service',    520),
    ('cost',   'pack_healthcare',         'healthcare',         'OPS', 'DIAG',      'Diagnostics Operations',       'service',    530),
    ('profit', 'pack_healthcare',         'healthcare',         'EXT', 'INPAT',     'Inpatient Services',           'revenue',    510),
    ('profit', 'pack_healthcare',         'healthcare',         'EXT', 'OUTPAT',    'Outpatient and Clinics',       'revenue',    520),
    ('profit', 'pack_healthcare',         'healthcare',         'EXT', 'PHARM',     'Pharmacy Revenue',             'revenue',    530),
    ('profit', 'pack_healthcare',         'healthcare',         'EXT', 'DIAG',      'Diagnostics Revenue',          'revenue',    540);

    CREATE TEMP TABLE tmp_industry_targets ON COMMIT DROP AS
    WITH active_companies AS (
        SELECT id, code, name, legal_entity_id
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
          AND (v_company_ids IS NULL OR id = ANY(v_company_ids))
    ),
    pack_map AS (
        SELECT DISTINCT pack_code, industry_vertical
        FROM tmp_industry_template
    )
    SELECT DISTINCT
        cc.id AS company_code_id,
        cc.code AS company_code,
        cc.name AS company_name,
        cc.legal_entity_id,
        pm.pack_code,
        pm.industry_vertical
    FROM active_companies cc
    JOIN pack_map pm ON pm.pack_code = ANY(v_pack_codes);

    SELECT count(*) INTO v_targets FROM tmp_industry_targets;
    IF v_targets = 0 THEN
        RAISE EXCEPTION '[000_industry_org_templates] explicit pack/company scope resolved no targets';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_industry_targets t
        WHERE NOT EXISTS (
            SELECT 1 FROM master.org_unit ou
            WHERE ou.tenant_id = v_tid AND ou.code = 'operations'
        )
        OR NOT EXISTS (
            SELECT 1 FROM master.cost_center cc
            WHERE cc.tenant_id = v_tid
              AND cc.company_code_id = t.company_code_id
              AND cc.code = t.company_code || '-cc-ops'
        )
    ) THEN
        RAISE EXCEPTION '[000_industry_org_templates] Universal org foundation missing. Run blueprints/universal/060_org_structure first.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_industry_targets t
        JOIN (SELECT DISTINCT parent_suffix FROM tmp_industry_template WHERE template_kind = 'profit') p ON true
        WHERE NOT EXISTS (
            SELECT 1 FROM master.profit_center pc
            WHERE pc.tenant_id = v_tid
              AND pc.company_code_id = t.company_code_id
              AND pc.code = t.company_code || '-pc-' || lower(p.parent_suffix)
        )
    ) THEN
        RAISE EXCEPTION '[000_industry_org_templates] Universal profit-center headers missing. Run blueprints/universal/060_org_structure first.';
    END IF;

    INSERT INTO master.org_unit (
        tenant_id, org_unit_type_id, code, name, parent_org_unit_id,
        sort_order, effective_from, status, created_by, metadata
    )
    SELECT DISTINCT
        v_tid, unit_type.id,
        'industry-' || replace(tpl.industry_vertical,'_','-') || '-' || lower(tpl.suffix),
        tpl.display_name,
        parent.id,
        tpl.sort_order,
        '2020-01-01'::date,
        'active',
        v_su,
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack', v_pack,
                'industry_pack', tpl.pack_code,
                'version', v_version,
                'seeded_at', now()::text
            ),
            '_industry_vertical', tpl.industry_vertical
        )
    FROM tmp_industry_targets t
    JOIN tmp_industry_template tpl
      ON tpl.template_kind = 'org'
     AND tpl.pack_code = t.pack_code
    JOIN master.org_unit parent
      ON parent.tenant_id = v_tid
     AND parent.code = 'operations'
    JOIN control.org_unit_type unit_type
      ON unit_type.tenant_id=v_tid AND unit_type.code='department' AND unit_type.status='active'
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        org_unit_type_id = EXCLUDED.org_unit_type_id,
        parent_org_unit_id = EXCLUDED.parent_org_unit_id,
        sort_order      = EXCLUDED.sort_order,
        metadata        = master.org_unit.metadata || EXCLUDED.metadata,
        updated_at      = now(),
        updated_by      = v_su
    WHERE (master.org_unit.name, master.org_unit.org_unit_type_id,
           master.org_unit.parent_org_unit_id, master.org_unit.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.org_unit_type_id,
           EXCLUDED.parent_org_unit_id, EXCLUDED.sort_order);

    INSERT INTO master.cost_center (
        tenant_id, company_code_id, code, name,
        category_code, is_posting_allowed, parent_id,
        valid_from, sort_order, status, created_by, metadata
    )
    SELECT
        v_tid, t.company_code_id,
        t.company_code || '-cc-' || lower(tpl.parent_suffix) || '-' || replace(tpl.industry_vertical,'_','-') || '-' || lower(tpl.suffix),
        tpl.display_name,
        tpl.classification,
        true,
        parent.id,
        '2020-01-01'::date,
        tpl.sort_order,
        'active',
        v_su,
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack', v_pack,
                'industry_pack', tpl.pack_code,
                'version', v_version,
                'seeded_at', now()::text
            ),
            '_industry_vertical', tpl.industry_vertical
        )
    FROM tmp_industry_targets t
    JOIN tmp_industry_template tpl
      ON tpl.template_kind = 'cost'
     AND tpl.pack_code = t.pack_code
    JOIN master.cost_center parent
      ON parent.tenant_id = v_tid
     AND parent.company_code_id = t.company_code_id
     AND parent.code = t.company_code || '-cc-' || lower(tpl.parent_suffix)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
        name                 = EXCLUDED.name,
        category_code        = EXCLUDED.category_code,
        is_posting_allowed   = EXCLUDED.is_posting_allowed,
        parent_id            = EXCLUDED.parent_id,
        sort_order           = EXCLUDED.sort_order,
        metadata             = master.cost_center.metadata || EXCLUDED.metadata,
        updated_at           = now(),
        updated_by           = v_su
    WHERE (master.cost_center.name, master.cost_center.category_code,
           master.cost_center.is_posting_allowed,
           master.cost_center.parent_id, master.cost_center.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.category_code,
           EXCLUDED.is_posting_allowed,
           EXCLUDED.parent_id, EXCLUDED.sort_order);

    INSERT INTO master.profit_center (
        tenant_id, company_code_id, code, name,
        category_code, is_posting_allowed, parent_id,
        valid_from, sort_order, status, created_by, metadata
    )
    SELECT
        v_tid, t.company_code_id,
        t.company_code || '-pc-' || lower(tpl.parent_suffix) || '-' || replace(tpl.industry_vertical,'_','-') || '-' || lower(tpl.suffix),
        tpl.display_name,
        tpl.classification,
        true,
        parent.id,
        '2020-01-01'::date,
        tpl.sort_order,
        'active',
        v_su,
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack', v_pack,
                'industry_pack', tpl.pack_code,
                'version', v_version,
                'seeded_at', now()::text
            ),
            '_industry_vertical', tpl.industry_vertical
        )
    FROM tmp_industry_targets t
    JOIN tmp_industry_template tpl
      ON tpl.template_kind = 'profit'
     AND tpl.pack_code = t.pack_code
    JOIN master.profit_center parent
      ON parent.tenant_id = v_tid
     AND parent.company_code_id = t.company_code_id
     AND parent.code = t.company_code || '-pc-' || lower(tpl.parent_suffix)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
        name               = EXCLUDED.name,
        category_code      = EXCLUDED.category_code,
        is_posting_allowed = EXCLUDED.is_posting_allowed,
        parent_id          = EXCLUDED.parent_id,
        sort_order         = EXCLUDED.sort_order,
        metadata           = master.profit_center.metadata || EXCLUDED.metadata,
        updated_at         = now(),
        updated_by         = v_su
    WHERE (master.profit_center.name, master.profit_center.category_code,
           master.profit_center.is_posting_allowed,
           master.profit_center.parent_id, master.profit_center.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.category_code,
           EXCLUDED.is_posting_allowed,
           EXCLUDED.parent_id, EXCLUDED.sort_order);

    RAISE NOTICE '[000_industry_org_templates] Applied industry org templates for % company/industry mappings', v_targets;
END $seed$;
