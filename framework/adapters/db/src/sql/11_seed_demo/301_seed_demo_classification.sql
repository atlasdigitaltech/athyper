/* ============================================================================
   Athyper v2.1 -- Classification Engine Seed Data
   Dependencies: core.tenant, fin.business_intent (from 290),
                 ref.commodity_domain, ref.commodity_code (from 200),
                 fin.spend_category (from 157), ent.classification_config (from 071)
   ============================================================================ */

DO $$
DECLARE
    v_tenant       uuid;
    v_code         text;
    v_intent_map   jsonb;
    v_cat_id       uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- ====================================================================
        -- 1. Classification Config (one per tenant)
        -- ====================================================================
        INSERT INTO ent.classification_config (
            tenant_id, primary_commodity_domain, trade_commodity_domain,
            primary_industry_domain,
            require_commodity_code, require_trade_code,
            require_for_capex_above, require_for_capex_currency,
            require_for_regulated,
            auto_classify_enabled, auto_crosswalk_enabled,
            min_confidence_auto, min_confidence_suggest,
            crosswalk_strategy,
            cross_border_triggers,
            created_by
        ) VALUES (
            v_tenant, 'unspsc', 'hs',
            'isic',
            false, false,
            5000.0000, 'USD',
            true,
            true, true,
            90.00, 60.00,
            'BEST_MATCH',
            '["SUPPLIER_COUNTRY_MISMATCH","SHIP_TO_MISMATCH","IMPORT_TAX","CUSTOMS_REQUIRED"]'::jsonb,
            'seed'
        ) ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now();

        -- ====================================================================
        -- 2. Spend Categories (23 base categories, all tenants)
        -- ====================================================================

        -- OPEX categories
        INSERT INTO fin.spend_category (id, tenant_id, code, name, description, primary_domain, allowed_domains, procurement_type, visibility, capitalization_threshold, capitalization_currency, requires_asset_tagging, hs_required, is_regulated, classification_required, sort_order)
        VALUES
            (gen_random_uuid(), v_tenant, 'CAT-IT-HW',       'IT Hardware',                 'Computers, peripherals, networking equipment',           'CAPEX', '{OPEX,CAPEX}', 'GOODS',    'STANDARD',     1000.0000, 'USD', true,  false, false, false, 10),
            (gen_random_uuid(), v_tenant, 'CAT-IT-SW',        'Software & SaaS',             'Software licenses, SaaS subscriptions, cloud services',  'OPEX',  '{OPEX,CAPEX}', 'SERVICES', 'STANDARD',     5000.0000, 'USD', false, false, false, false, 20),
            (gen_random_uuid(), v_tenant, 'CAT-IT-INFRA',     'IT Infrastructure',           'Servers, data center, network infrastructure',            'CAPEX', '{OPEX,CAPEX}', 'GOODS',    'STANDARD',     2500.0000, 'USD', true,  false, false, false, 30),
            (gen_random_uuid(), v_tenant, 'CAT-OFFICE',       'Office Supplies',             'Stationery, consumables, small office items',             'OPEX',  '{OPEX}',       'GOODS',    'STANDARD',     null,      null,  false, false, false, false, 40),
            (gen_random_uuid(), v_tenant, 'CAT-FACILITIES',   'Facilities & Maintenance',    'Building repairs, renovations, facility services',        'OPEX',  '{OPEX,CAPEX}', 'SERVICES', 'STANDARD',     10000.0000,'USD', false, false, false, false, 50),
            (gen_random_uuid(), v_tenant, 'CAT-PROF-SVC',     'Professional Services',       'Consulting, legal, audit, advisory services',             'OPEX',  '{OPEX}',       'SERVICES', 'STANDARD',     null,      null,  false, false, false, false, 60),
            (gen_random_uuid(), v_tenant, 'CAT-MARKETING',    'Marketing & Advertising',     'Campaigns, media buys, branding, events',                'OPEX',  '{OPEX}',       'SERVICES', 'STANDARD',     null,      null,  false, false, false, false, 70),
            (gen_random_uuid(), v_tenant, 'CAT-TRAVEL',       'Travel & Entertainment',      'Flights, hotels, meals, client entertainment',            'OPEX',  '{OPEX}',       'SERVICES', 'STANDARD',     null,      null,  false, false, false, false, 80),
            (gen_random_uuid(), v_tenant, 'CAT-HR',           'HR & Recruitment',            'Recruitment fees, training, employee benefits',           'OPEX',  '{OPEX}',       'SERVICES', 'STANDARD',     null,      null,  false, false, false, false, 90),
            (gen_random_uuid(), v_tenant, 'CAT-INSURANCE',    'Insurance',                   'Business insurance, liability, property coverage',        'OPEX',  '{OPEX}',       'SERVICES', 'STANDARD',     null,      null,  false, false, false, false, 100),
            (gen_random_uuid(), v_tenant, 'CAT-TELECOM',      'Telecom & Network',           'Phone lines, internet, mobile plans, networking',         'OPEX',  '{OPEX,CAPEX}', 'MIXED',    'STANDARD',     2500.0000, 'USD', false, false, false, false, 110),
            (gen_random_uuid(), v_tenant, 'CAT-RAW-MAT',      'Raw Materials',               'Production inputs, raw materials, components',            'OPEX',  '{OPEX}',       'GOODS',    'STANDARD',     null,      null,  false, false, false, false, 120),

            -- CAPEX categories
            (gen_random_uuid(), v_tenant, 'CAT-VEHICLES',     'Vehicles & Fleet',            'Company vehicles, fleet management',                      'CAPEX', '{CAPEX}',      'GOODS',    'STANDARD',     0,         'USD', true,  false, false, true,  200),
            (gen_random_uuid(), v_tenant, 'CAT-FURNITURE',    'Furniture & Fixtures',        'Office furniture, fixtures, fittings',                    'CAPEX', '{OPEX,CAPEX}', 'GOODS',    'STANDARD',     500.0000,  'USD', true,  false, false, false, 210),

            -- Regulated categories (restricted visibility + compliance flags)
            (gen_random_uuid(), v_tenant, 'CAT-LAB',          'Laboratory & Scientific',     'Lab equipment, scientific instruments, reagents',         'CAPEX', '{OPEX,CAPEX}', 'GOODS',    'STANDARD',     2000.0000, 'USD', true,  true,  true,  true,  300),
            (gen_random_uuid(), v_tenant, 'CAT-CHEMICALS',    'Chemicals & Hazardous',       'Chemical supplies, hazardous materials, safety equipment','OPEX',  '{OPEX}',       'GOODS',    'RESTRICTED',   null,      null,  false, true,  true,  true,  310),
            (gen_random_uuid(), v_tenant, 'CAT-MEDICAL',      'Medical & Pharmaceutical',    'Medical devices, pharmaceuticals, healthcare supplies',   'CAPEX', '{OPEX,CAPEX}', 'GOODS',    'RESTRICTED',   500.0000,  'USD', true,  true,  true,  true,  320),

            -- Confidential categories
            (gen_random_uuid(), v_tenant, 'CAT-LEGAL',        'Legal Settlements',           'Legal settlements, dispute resolution, M&A costs',        'OPEX',  '{OPEX}',       'SERVICES', 'CONFIDENTIAL', null,      null,  false, false, false, false, 400),
            (gen_random_uuid(), v_tenant, 'CAT-EXECUTIVE',    'Executive Spend',             'Executive compensation, board expenses, retreats',        'OPEX',  '{OPEX}',       'MIXED',    'CONFIDENTIAL', null,      null,  false, false, false, false, 410),

            -- Revenue / Other
            (gen_random_uuid(), v_tenant, 'CAT-PRODUCT-SALES','Product Sales',               'Revenue from product sales',                              'REVENUE','{}',          'GOODS',    'STANDARD',     null,      null,  false, false, false, false, 500),
            (gen_random_uuid(), v_tenant, 'CAT-SERVICE-REV',  'Service Revenue',             'Revenue from services rendered',                          'REVENUE','{}',          'SERVICES', 'STANDARD',     null,      null,  false, false, false, false, 510),
            (gen_random_uuid(), v_tenant, 'CAT-REGULATORY',   'Regulatory & Compliance',     'Tax payments, license fees, regulatory filings',          'REGULATORY','{}',       'SERVICES', 'RESTRICTED',   null,      null,  false, false, false, false, 600),
            (gen_random_uuid(), v_tenant, 'CAT-ADMIN',        'Admin & Adjustments',         'Journal adjustments, reclassifications, accruals',        'ADMIN', '{}',           'MIXED',    'RESTRICTED',   null,      null,  false, false, false, false, 700)
        ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now();

        -- ====================================================================
        -- 3. Category-Intent Rules (with explanation templates)
        -- ====================================================================

        -- CAT-IT-HW rules
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-IT-HW';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'IS_RECURRING',
                    '{"recurring": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 10,
                    'OPEX because procurement method is subscription/lease for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_BELOW',
                    '{"amount": 1000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 20,
                    'OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 1000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT'),
                    'CAPEX', 99,
                    'CAPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-IT-SW rules
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-IT-SW';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'IS_RECURRING',
                    '{"recurring": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 10,
                    'OPEX because procurement method is subscription/SaaS for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_BELOW',
                    '{"amount": 5000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 20,
                    'OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 5000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-IT-INFRA rules
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-IT-INFRA';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'IS_RECURRING',
                    '{"recurring": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 10,
                    'OPEX because procurement method is subscription/lease for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_BELOW',
                    '{"amount": 2500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 20,
                    'OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 2500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT'),
                    'CAPEX', 99,
                    'CAPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-OFFICE rules (always OPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-OFFICE';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (office supplies are always operating expense)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-FACILITIES rules
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-FACILITIES';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 10000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-FACILITIES'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-FACILITIES'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-TRAVEL rules (always OPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-TRAVEL';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-TRAVEL'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (travel is always operating expense)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-PROF-SVC rules (always OPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-PROF-SVC';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-PROFESSIONAL'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (professional services are operating expense)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-MARKETING rules (always OPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-MARKETING';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-MARKETING'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (marketing is operating expense)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-HR rules (always OPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-HR';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-HR'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (HR is operating expense)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-INSURANCE rules (always OPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-INSURANCE';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-INSURANCE'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (insurance is operating expense)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-TELECOM rules
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-TELECOM';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'IS_RECURRING',
                    '{"recurring": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 10,
                    'OPEX because procurement method is subscription/lease for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 2500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-IT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-IT'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-VEHICLES rules (always CAPEX)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-VEHICLES';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-VEHICLE'),
                    'CAPEX', 99,
                    'CAPEX by default for {category_name} (vehicles are always capital expenditure)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-FURNITURE rules
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-FURNITURE';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_BELOW',
                    '{"amount": 500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-FACILITIES'),
                    'OPEX', 20,
                    'OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 99,
                    'CAPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-LAB rules (regulated, cross-border aware)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-LAB';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'CROSS_BORDER',
                    '{"requires_hs": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 5,
                    'HS code required because cross-border flag is true for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_BELOW',
                    '{"amount": 2000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL'),
                    'OPEX', 20,
                    'OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 2000, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 99,
                    'CAPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-CHEMICALS rules (regulated)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-CHEMICALS';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'CROSS_BORDER',
                    '{"requires_hs": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL'),
                    'OPEX', 5,
                    'HS code required because cross-border flag is true for {category_name} (regulated material)'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL'),
                    'OPEX', 99,
                    'OPEX by default for {category_name} (consumable regulated material)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        -- CAT-MEDICAL rules (regulated)
        SELECT id INTO v_cat_id FROM fin.spend_category WHERE tenant_id = v_tenant AND code = 'CAT-MEDICAL';
        IF v_cat_id IS NOT NULL THEN
            INSERT INTO fin.category_intent_rule (id, tenant_id, category_id, condition_type, condition_config, resolved_intent_id, resolved_domain, priority, explanation_template)
            VALUES
                (gen_random_uuid(), v_tenant, v_cat_id, 'CROSS_BORDER',
                    '{"requires_hs": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 5,
                    'HS code required because cross-border flag is true for {category_name} (regulated medical)'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'IS_RECURRING',
                    '{"recurring": true}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL'),
                    'OPEX', 10,
                    'OPEX because procurement method is subscription/recurring for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_BELOW',
                    '{"amount": 500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'OPEX-GENERAL'),
                    'OPEX', 20,
                    'OPEX because amount {amount} < capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'AMOUNT_ABOVE',
                    '{"amount": 500, "currency": "USD"}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 30,
                    'CAPEX because amount {amount} > capitalization threshold {threshold} for {category_name}'),
                (gen_random_uuid(), v_tenant, v_cat_id, 'FALLBACK',
                    '{}'::jsonb,
                    (SELECT id FROM fin.business_intent WHERE tenant_id = v_tenant AND code = 'CAPEX-EQUIPMENT'),
                    'CAPEX', 99,
                    'CAPEX by default for {category_name} (primary domain)')
            ON CONFLICT (tenant_id, category_id, condition_type, priority) DO NOTHING;
        END IF;

        RAISE NOTICE 'Classification seed data inserted for tenant %', v_code;
    END LOOP;
END $$;
