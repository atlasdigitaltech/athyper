-- ============================================================================
-- INDUSTRY ORG EXTENSIONS
-- ============================================================================
-- File:     030_industry/200_org_structure/000_industry_org_templates.sql
-- Schemas:  master.org_unit, master.cost_center, master.profit_center
-- Purpose:  Add industry-specific leaves onto the universal org foundation.
-- Depends:  020_universal/060_org_structure/300-302 and company_code metadata
--           industry tags.
--
-- Targeting rules:
--   * Multi-company tenants: tag each company_code with one of:
--       metadata._industry_vertical = 'utilities'
--       metadata._industry_pack     = 'pack_utilities'
--       metadata._industry_verticals / _industry_packs as JSON arrays
--   * Single-company tenants: if an industry blueprint is marked applied in
--     control.tenant_blueprint_application, that pack applies to the company.
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := 'org_industry_templates';
    v_version  text := '1.0.0';
    v_targets  int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
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
    -- Utilities
    ('org',    'pack_utilities',          'utilities',          'OPS', 'GRID',      'Grid Operations',              'department', 510),
    ('org',    'pack_utilities',          'utilities',          'OPS', 'GEN',       'Generation Operations',        'department', 520),
    ('org',    'pack_utilities',          'utilities',          'OPS', 'DIST',      'Distribution Operations',      'department', 530),
    ('cost',   'pack_utilities',          'utilities',          'OPS', 'GRID',      'Grid Operations',              'production', 510),
    ('cost',   'pack_utilities',          'utilities',          'OPS', 'GEN',       'Generation Operations',        'production', 520),
    ('cost',   'pack_utilities',          'utilities',          'OPS', 'DIST',      'Distribution Operations',      'production', 530),
    ('profit', 'pack_utilities',          'utilities',          'EXT', 'ELEC',      'Electricity Sales',            'revenue',    510),
    ('profit', 'pack_utilities',          'utilities',          'EXT', 'WATER',     'Water Supply',                 'revenue',    520),
    ('profit', 'pack_utilities',          'utilities',          'EXT', 'CONNECT',   'Connection Fees',              'revenue',    530),

    -- Construction
    ('org',    'pack_construction',       'construction',       'OPS', 'PROJECTS',  'Project Delivery',             'department', 510),
    ('org',    'pack_construction',       'construction',       'OPS', 'CIVIL',     'Civil Works',                  'department', 520),
    ('org',    'pack_construction',       'construction',       'OPS', 'MEP',       'MEP Works',                    'department', 530),
    ('cost',   'pack_construction',       'construction',       'OPS', 'PROJECTS',  'Project Delivery',             'production', 510),
    ('cost',   'pack_construction',       'construction',       'OPS', 'CIVIL',     'Civil Works',                  'production', 520),
    ('cost',   'pack_construction',       'construction',       'OPS', 'MEP',       'MEP Works',                    'production', 530),
    ('profit', 'pack_construction',       'construction',       'EXT', 'BLDG',      'Building Construction',        'revenue',    510),
    ('profit', 'pack_construction',       'construction',       'EXT', 'CIVIL',     'Civil Engineering',            'revenue',    520),
    ('profit', 'pack_construction',       'construction',       'EXT', 'MEP',       'MEP Contracting',              'revenue',    530),

    -- Real estate
    ('org',    'pack_real_estate',        'real_estate',        'OPS', 'PROPERTY',  'Property Operations',          'department', 510),
    ('org',    'pack_real_estate',        'real_estate',        'OPS', 'DEV',       'Development Operations',       'department', 520),
    ('org',    'pack_real_estate',        'real_estate',        'OPS', 'FACILITY',  'Facilities Operations',        'department', 530),
    ('cost',   'pack_real_estate',        'real_estate',        'OPS', 'PROPERTY',  'Property Operations',          'service',    510),
    ('cost',   'pack_real_estate',        'real_estate',        'OPS', 'DEV',       'Development Operations',       'production', 520),
    ('cost',   'pack_real_estate',        'real_estate',        'OPS', 'FACILITY',  'Facilities Operations',        'service',    530),
    ('profit', 'pack_real_estate',        'real_estate',        'EXT', 'RENTAL',    'Rental Income',                'revenue',    510),
    ('profit', 'pack_real_estate',        'real_estate',        'EXT', 'PRODEV',    'Property Development',         'revenue',    520),
    ('profit', 'pack_real_estate',        'real_estate',        'EXT', 'PROPSAL',   'Property Sales',               'revenue',    530),

    -- Transportation and storage
    ('org',    'pack_transport',          'transport',          'OPS', 'FLEET',     'Fleet Operations',             'department', 510),
    ('org',    'pack_transport',          'transport',          'OPS', 'WHSE',      'Warehouse Operations',         'department', 520),
    ('org',    'pack_transport',          'transport',          'OPS', 'LASTMILE',  'Last Mile Operations',         'department', 530),
    ('cost',   'pack_transport',          'transport',          'OPS', 'FLEET',     'Fleet Operations',             'logistics',  510),
    ('cost',   'pack_transport',          'transport',          'OPS', 'WHSE',      'Warehouse Operations',         'logistics',  520),
    ('cost',   'pack_transport',          'transport',          'OPS', 'LASTMILE',  'Last Mile Operations',         'logistics',  530),
    ('profit', 'pack_transport',          'transport',          'EXT', 'FREIGHT',   'Freight and Haulage',          'revenue',    510),
    ('profit', 'pack_transport',          'transport',          'EXT', 'WHSE',      'Warehousing and Storage',      'revenue',    520),
    ('profit', 'pack_transport',          'transport',          'EXT', 'LASTMILE',  'Last Mile Delivery',           'revenue',    530),

    -- Trading
    ('org',    'pack_trading',            'trading',            'OPS', 'BUYING',    'Buying and Merchandising',     'department', 510),
    ('org',    'pack_trading',            'trading',            'OPS', 'RETAIL',    'Retail Operations',            'department', 520),
    ('org',    'pack_trading',            'trading',            'OPS', 'ECOMM',     'E-Commerce Operations',        'department', 530),
    ('cost',   'pack_trading',            'trading',            'OPS', 'BUYING',    'Buying and Merchandising',     'sales',      510),
    ('cost',   'pack_trading',            'trading',            'OPS', 'RETAIL',    'Retail Operations',            'sales',      520),
    ('cost',   'pack_trading',            'trading',            'OPS', 'ECOMM',     'E-Commerce Operations',        'sales',      530),
    ('profit', 'pack_trading',            'trading',            'EXT', 'WHLSALE',   'Wholesale',                    'revenue',    510),
    ('profit', 'pack_trading',            'trading',            'EXT', 'RETAIL',    'Retail',                       'revenue',    520),
    ('profit', 'pack_trading',            'trading',            'EXT', 'ECOMM',     'E-Commerce',                   'revenue',    530),

    -- Hospitality
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

    -- Information and communication
    ('org',    'pack_infocomm',           'infocomm',           'OPS', 'CLOUD',     'Cloud Operations',             'department', 510),
    ('org',    'pack_infocomm',           'infocomm',           'OPS', 'RND',       'Research and Development',     'department', 520),
    ('org',    'pack_infocomm',           'infocomm',           'OPS', 'DELIVERY',  'Service Delivery',             'department', 530),
    ('cost',   'pack_infocomm',           'infocomm',           'OPS', 'CLOUD',     'Cloud Operations',             'service',    510),
    ('cost',   'pack_infocomm',           'infocomm',           'OPS', 'RND',       'Research and Development',     'r_and_d',    520),
    ('cost',   'pack_infocomm',           'infocomm',           'OPS', 'DELIVERY',  'Service Delivery',             'service',    530),
    ('profit', 'pack_infocomm',           'infocomm',           'EXT', 'SAAS',      'SaaS Recurring',               'revenue',    510),
    ('profit', 'pack_infocomm',           'infocomm',           'EXT', 'CONSULT',   'Consulting and Implementation','revenue',    520),
    ('profit', 'pack_infocomm',           'infocomm',           'EXT', 'LICENSE',   'License and IP',               'revenue',    530),

    -- Financial services
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

    -- Manufacturing: textiles and leather
    ('org',    'pack_mfg_textile',        'mfg_textile',        'OPS', 'CUTSEW',    'Cut and Sew Operations',       'department', 510),
    ('org',    'pack_mfg_textile',        'mfg_textile',        'OPS', 'FABRIC',    'Fabric Operations',            'department', 520),
    ('org',    'pack_mfg_textile',        'mfg_textile',        'OPS', 'QC',        'Quality Control',              'department', 530),
    ('cost',   'pack_mfg_textile',        'mfg_textile',        'OPS', 'CUTSEW',    'Cut and Sew Operations',       'production', 510),
    ('cost',   'pack_mfg_textile',        'mfg_textile',        'OPS', 'FABRIC',    'Fabric Operations',            'production', 520),
    ('cost',   'pack_mfg_textile',        'mfg_textile',        'OPS', 'QC',        'Quality Control',              'production', 530),
    ('profit', 'pack_mfg_textile',        'mfg_textile',        'EXT', 'GARMENT',   'Garments and Apparel',         'revenue',    510),
    ('profit', 'pack_mfg_textile',        'mfg_textile',        'EXT', 'FABRIC',    'Fabric Sales',                 'revenue',    520),
    ('profit', 'pack_mfg_textile',        'mfg_textile',        'EXT', 'LEATHER',   'Leather Goods',                'revenue',    530),

    -- Manufacturing: food and beverage
    ('org',    'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PROCESS',   'Processing Operations',        'department', 510),
    ('org',    'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PACKAGING', 'Packaging Operations',         'department', 520),
    ('org',    'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'QA',        'Quality Assurance',            'department', 530),
    ('cost',   'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PROCESS',   'Processing Operations',        'production', 510),
    ('cost',   'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'PACKAGING', 'Packaging Operations',         'production', 520),
    ('cost',   'pack_mfg_food_bev',       'mfg_food_bev',       'OPS', 'QA',        'Quality Assurance',            'production', 530),
    ('profit', 'pack_mfg_food_bev',       'mfg_food_bev',       'EXT', 'PACKAGED',  'Packaged Food',                'revenue',    510),
    ('profit', 'pack_mfg_food_bev',       'mfg_food_bev',       'EXT', 'BEVERAGE',  'Beverages',                    'revenue',    520),
    ('profit', 'pack_mfg_food_bev',       'mfg_food_bev',       'EXT', 'INGREDNT',  'Ingredient and B2B',           'revenue',    530),

    -- Manufacturing: pharmaceutical
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

    -- Manufacturing: electronics
    ('org',    'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'SMT',       'SMT Operations',               'department', 510),
    ('org',    'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'ASSEMBLY',  'Assembly Operations',          'department', 520),
    ('org',    'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'TEST',      'Test Operations',              'department', 530),
    ('cost',   'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'SMT',       'SMT Operations',               'production', 510),
    ('cost',   'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'ASSEMBLY',  'Assembly Operations',          'production', 520),
    ('cost',   'pack_mfg_electronics',    'mfg_electronics',    'OPS', 'TEST',      'Test Operations',              'production', 530),
    ('profit', 'pack_mfg_electronics',    'mfg_electronics',    'EXT', 'OEM',       'OEM Components',               'revenue',    510),
    ('profit', 'pack_mfg_electronics',    'mfg_electronics',    'EXT', 'MODULE',    'Module Assembly',              'revenue',    520),
    ('profit', 'pack_mfg_electronics',    'mfg_electronics',    'EXT', 'AFTERMKT',  'Aftermarket and Spares',       'revenue',    530),

    -- Mining and petroleum
    ('org',    'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'EXTRACT',   'Extraction Operations',        'department', 510),
    ('org',    'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'PROCESS',   'Processing Operations',        'department', 520),
    ('org',    'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'HSE',       'HSE Operations',               'department', 530),
    ('cost',   'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'EXTRACT',   'Extraction Operations',        'production', 510),
    ('cost',   'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'PROCESS',   'Processing Operations',        'production', 520),
    ('cost',   'pack_mining_petroleum',   'mining_petroleum',   'OPS', 'HSE',       'HSE Operations',               'admin',      530),
    ('profit', 'pack_mining_petroleum',   'mining_petroleum',   'EXT', 'CRUDE',     'Crude Oil Sales',              'revenue',    510),
    ('profit', 'pack_mining_petroleum',   'mining_petroleum',   'EXT', 'GAS',       'Natural Gas Sales',            'revenue',    520),
    ('profit', 'pack_mining_petroleum',   'mining_petroleum',   'EXT', 'NGL',       'NGL and Condensate',           'revenue',    530),

    -- Agriculture
    ('org',    'pack_agriculture',        'agriculture',        'OPS', 'CROP',      'Crop Operations',              'department', 510),
    ('org',    'pack_agriculture',        'agriculture',        'OPS', 'LIVESTOCK', 'Livestock Operations',         'department', 520),
    ('org',    'pack_agriculture',        'agriculture',        'OPS', 'DAIRY',     'Dairy Operations',             'department', 530),
    ('cost',   'pack_agriculture',        'agriculture',        'OPS', 'CROP',      'Crop Operations',              'production', 510),
    ('cost',   'pack_agriculture',        'agriculture',        'OPS', 'LIVESTOCK', 'Livestock Operations',         'production', 520),
    ('cost',   'pack_agriculture',        'agriculture',        'OPS', 'DAIRY',     'Dairy Operations',             'production', 530),
    ('profit', 'pack_agriculture',        'agriculture',        'EXT', 'CROP',      'Crop Sales',                   'revenue',    510),
    ('profit', 'pack_agriculture',        'agriculture',        'EXT', 'LIVESTOCK', 'Livestock Sales',              'revenue',    520),
    ('profit', 'pack_agriculture',        'agriculture',        'EXT', 'DAIRY',     'Dairy and Produce',            'revenue',    530),

    -- Education
    ('org',    'pack_education',          'education',          'OPS', 'ACADEMIC',  'Academic Operations',          'department', 510),
    ('org',    'pack_education',          'education',          'OPS', 'RESEARCH',  'Research Operations',          'department', 520),
    ('org',    'pack_education',          'education',          'OPS', 'EXEC',      'Executive Education',          'department', 530),
    ('cost',   'pack_education',          'education',          'OPS', 'ACADEMIC',  'Academic Operations',          'service',    510),
    ('cost',   'pack_education',          'education',          'OPS', 'RESEARCH',  'Research Operations',          'r_and_d',    520),
    ('cost',   'pack_education',          'education',          'OPS', 'EXEC',      'Executive Education',          'service',    530),
    ('profit', 'pack_education',          'education',          'EXT', 'TUITION',   'Tuition Fees',                 'revenue',    510),
    ('profit', 'pack_education',          'education',          'EXT', 'RESEARCH',  'Research Grants',              'revenue',    520),
    ('profit', 'pack_education',          'education',          'SVC', 'EXEC',      'Executive Education',          'service',    530),

    -- Healthcare
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
        SELECT id, code, name, legal_entity_id, metadata
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
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
    JOIN pack_map pm ON (
           cc.metadata->>'_industry_pack' = pm.pack_code
        OR cc.metadata->>'industry_pack' = pm.pack_code
        OR cc.metadata->>'_industry_vertical' = pm.industry_vertical
        OR cc.metadata->>'industry_vertical' = pm.industry_vertical
        OR (cc.metadata->'_industry_packs') ? pm.pack_code
        OR (cc.metadata->'industry_packs') ? pm.pack_code
        OR (cc.metadata->'_industry_verticals') ? pm.industry_vertical
        OR (cc.metadata->'industry_verticals') ? pm.industry_vertical
        OR (
            (SELECT count(*) FROM active_companies) = 1
            AND EXISTS (
                SELECT 1
                FROM control.tenant_blueprint_application tba
                WHERE tba.tenant_id = v_tid
                  AND tba.blueprint_code = pm.pack_code
                  AND tba.status = 'applied'
            )
        )
        OR (
            (SELECT count(*) FROM active_companies) = 1
            AND EXISTS (
                SELECT 1
                FROM master.tenant t
                WHERE t.id = v_tid
                  AND (
                         (t.metadata->'group'->'industries') ? pm.industry_vertical
                      OR (t.metadata->'_industry_verticals') ? pm.industry_vertical
                      OR (t.metadata->'_industry_packs') ? pm.pack_code
                  )
            )
        )
    );

    SELECT count(*) INTO v_targets FROM tmp_industry_targets;
    IF v_targets = 0 THEN
        RAISE NOTICE '[000_industry_org_templates] No company_code industry metadata matched; no industry org leaves applied';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_industry_targets t
        WHERE NOT EXISTS (
            SELECT 1 FROM master.org_unit ou
            WHERE ou.tenant_id = v_tid AND ou.code = t.company_code || '-ORG-OPS'
        )
        OR NOT EXISTS (
            SELECT 1 FROM master.cost_center cc
            WHERE cc.tenant_id = v_tid
              AND cc.company_code_id = t.company_code_id
              AND cc.code = t.company_code || '-CC-OPS'
        )
    ) THEN
        RAISE EXCEPTION '[000_industry_org_templates] Universal org foundation missing. Run 020_universal/060_org_structure first.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tmp_industry_targets t
        JOIN (SELECT DISTINCT parent_suffix FROM tmp_industry_template WHERE template_kind = 'profit') p ON true
        WHERE NOT EXISTS (
            SELECT 1 FROM master.profit_center pc
            WHERE pc.tenant_id = v_tid
              AND pc.company_code_id = t.company_code_id
              AND pc.code = t.company_code || '-PC-' || p.parent_suffix
        )
    ) THEN
        RAISE EXCEPTION '[000_industry_org_templates] Universal profit-center headers missing. Run 020_universal/060_org_structure first.';
    END IF;

    INSERT INTO master.org_unit (
        tenant_id, company_code_id, legal_entity_id,
        code, name, unit_type, parent_id, level_no,
        sort_order, valid_from, status, created_by, metadata
    )
    SELECT
        v_tid, t.company_code_id, t.legal_entity_id,
        t.company_code || '-ORG-' || tpl.parent_suffix || '-' || tpl.suffix,
        tpl.display_name,
        tpl.classification,
        parent.id,
        3,
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
     AND parent.code = t.company_code || '-ORG-' || tpl.parent_suffix
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        company_code_id = EXCLUDED.company_code_id,
        legal_entity_id = EXCLUDED.legal_entity_id,
        unit_type       = EXCLUDED.unit_type,
        parent_id       = EXCLUDED.parent_id,
        sort_order      = EXCLUDED.sort_order,
        metadata        = master.org_unit.metadata || EXCLUDED.metadata,
        updated_at      = now(),
        updated_by      = v_su
    WHERE (master.org_unit.name, master.org_unit.company_code_id,
           master.org_unit.legal_entity_id, master.org_unit.unit_type,
           master.org_unit.parent_id, master.org_unit.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.company_code_id,
           EXCLUDED.legal_entity_id, EXCLUDED.unit_type,
           EXCLUDED.parent_id, EXCLUDED.sort_order);

    INSERT INTO master.cost_center (
        tenant_id, company_code_id, code, name,
        node_type, cost_center_category, level_no, parent_id,
        valid_from, sort_order, status, created_by, metadata
    )
    SELECT
        v_tid, t.company_code_id,
        t.company_code || '-CC-' || tpl.parent_suffix || '-' || tpl.suffix,
        tpl.display_name,
        'posting',
        tpl.classification,
        3,
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
     AND parent.code = t.company_code || '-CC-' || tpl.parent_suffix
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
        name                 = EXCLUDED.name,
        node_type            = EXCLUDED.node_type,
        cost_center_category = EXCLUDED.cost_center_category,
        level_no             = EXCLUDED.level_no,
        parent_id            = EXCLUDED.parent_id,
        sort_order           = EXCLUDED.sort_order,
        metadata             = master.cost_center.metadata || EXCLUDED.metadata,
        updated_at           = now(),
        updated_by           = v_su
    WHERE (master.cost_center.name, master.cost_center.node_type,
           master.cost_center.cost_center_category, master.cost_center.level_no,
           master.cost_center.parent_id, master.cost_center.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.node_type,
           EXCLUDED.cost_center_category, EXCLUDED.level_no,
           EXCLUDED.parent_id, EXCLUDED.sort_order);

    INSERT INTO master.profit_center (
        tenant_id, company_code_id, code, name,
        node_type, profit_center_type, level_no, parent_id,
        valid_from, sort_order, status, created_by, metadata
    )
    SELECT
        v_tid, t.company_code_id,
        t.company_code || '-PC-' || tpl.parent_suffix || '-' || tpl.suffix,
        tpl.display_name,
        'posting',
        tpl.classification,
        3,
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
     AND parent.code = t.company_code || '-PC-' || tpl.parent_suffix
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
        name               = EXCLUDED.name,
        node_type          = EXCLUDED.node_type,
        profit_center_type = EXCLUDED.profit_center_type,
        level_no           = EXCLUDED.level_no,
        parent_id          = EXCLUDED.parent_id,
        sort_order         = EXCLUDED.sort_order,
        metadata           = master.profit_center.metadata || EXCLUDED.metadata,
        updated_at         = now(),
        updated_by         = v_su
    WHERE (master.profit_center.name, master.profit_center.node_type,
           master.profit_center.profit_center_type, master.profit_center.level_no,
           master.profit_center.parent_id, master.profit_center.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.node_type,
           EXCLUDED.profit_center_type, EXCLUDED.level_no,
           EXCLUDED.parent_id, EXCLUDED.sort_order);

    RAISE NOTICE '[000_industry_org_templates] Applied industry org templates for % company/industry mappings', v_targets;
END $seed$;
