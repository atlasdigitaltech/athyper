-- ============================================================================
-- FINAL TENANT REFRESH - COMMODITY CATEGORY BUY POLICY DEFAULTS
-- ============================================================================
-- File:     020_universal/990_validation/910_commodity_category_buy_policy_defaults.sql
-- Schema:   control/master
-- Purpose:  Demo buy-policy defaults for the three tenant demo packs.
--           - Fills GL, tax, asset, budget, and capex screening defaults on
--             tenant-scope commodity_category_buy_policy rows.
--           - Adds sparse company-scope overrides for every active company
--             code, leaving roughly 90% of company/category resolution to the
--             tenant default fallback.
-- Idempotent: Yes
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_tenant_code text;
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '910_commodity_category_buy_policy_defaults';
    v_version text := '1.0.0';
    v_effective_from date := DATE '2026-05-16';
    v_seed_fiscal_year smallint := 2026;
    v_missing text;
    v_company_count integer;
    v_tenant_default_count integer;
    v_company_override_count integer;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[910_cc_buy_defaults] app.seed_tenant_id not set';
    END IF;

    SELECT t.code
      INTO v_tenant_code
      FROM master.tenant t
     WHERE t.id = v_tid;

    IF v_tenant_code NOT IN ('athyper', 'technostat', 'cirrusatlantic') THEN
        RAISE NOTICE '[910_cc_buy_defaults] tenant % skipped; demo defaults target athyper, technostat, cirrusatlantic', v_tid;
        RETURN;
    END IF;

    CREATE TEMP TABLE tmp_cc_buy_policy_defaults ON COMMIT DROP AS
    WITH policy_base AS (
        SELECT
            p.id AS policy_id,
            p.tenant_id,
            p.commodity_category_id,
            p.business_intent_id,
            p.is_default,
            p.is_selectable,
            p.sort_order,
            p.effective_from,
            p.effective_to,
            cc.code AS category_code,
            bi.code AS intent_code
        FROM control.commodity_category_buy_policy p
        JOIN master.commodity_category cc
          ON cc.tenant_id = p.tenant_id
         AND cc.id = p.commodity_category_id
        JOIN master.business_intent bi
          ON bi.tenant_id = p.tenant_id
         AND bi.id = p.business_intent_id
        WHERE p.tenant_id = v_tid
          AND p.scope_type = 'TENANT'
          AND p.scope_id IS NULL
          AND p.mapping_mode = 'ALLOW'
          AND p.is_active = true
          AND cc.buy_allowed = true
          AND cc.is_active = true
    ),
    classified AS (
        SELECT
            pb.*,
            CASE
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code IN ('SC-IT-SW','SC-IT-CLOUD','SC-IT-SEC','SC-SUBS-LIC')
                    THEN 'IFRS-A-FA-IT'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code LIKE 'SC-IT%'
                    THEN 'IFRS-A-FA-IT'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code = 'SC-FLEET-VEH'
                    THEN 'IFRS-A-FA-VEH'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code IN ('SC-OFFICE-FURN','SC-OFFICE-EQUIP')
                    THEN 'IFRS-A-FA-FURN'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code LIKE 'SC-CAPEQUIP%'
                    THEN 'IFRS-A-FA-PLANT'
                WHEN pb.intent_code = 'BI-CAPEX'
                    THEN 'IFRS-A-FA-CWIP'
                WHEN pb.category_code ~ '^(SC-RAW|SC-COMP|SC-CONSUM)'
                    THEN 'IFRS-E-COGS-MAT'
                WHEN pb.category_code LIKE 'SC-PKG%'
                    THEN 'IFRS-E-COGS-PACKAGING'
                WHEN pb.category_code ~ '^(SC-FREIGHT|SC-WHSE)'
                    THEN 'IFRS-E-COGS-FREIGHT'
                WHEN pb.category_code = 'SC-FREIGHT-CUST'
                    THEN 'IFRS-E-COGS-CUSTOMS'
                WHEN pb.category_code LIKE 'SC-CONTRACT%'
                    THEN 'IFRS-E-COGS-SUB'
                WHEN pb.category_code ~ '^(SC-PRODSVC|SC-QC)'
                    THEN 'IFRS-E-COGS-OH'
                WHEN pb.category_code LIKE 'SC-TAX%'
                  OR pb.intent_code = 'BI-REG'
                    THEN 'IFRS-E-TAX-CIT'
                WHEN pb.category_code LIKE 'SC-BANK%'
                    THEN 'IFRS-E-FIN-BANK'
                WHEN pb.category_code LIKE 'SC-IT%'
                  OR pb.category_code LIKE 'SC-ICT%'
                  OR pb.category_code LIKE 'SC-TELCO%'
                  OR pb.category_code LIKE 'SC-SUBS%'
                    THEN 'IFRS-E-GA-IT'
                WHEN pb.category_code = 'SC-HR-TRAIN'
                    THEN 'IFRS-E-HR-TRAIN'
                WHEN pb.category_code LIKE 'SC-HR%'
                    THEN 'IFRS-E-HR-SAL'
                WHEN pb.category_code = 'SC-PROF-LEGAL'
                    THEN 'IFRS-E-GA-LEGAL'
                WHEN pb.category_code = 'SC-PROF-AUDIT'
                    THEN 'IFRS-E-GA-AUDIT'
                WHEN pb.category_code LIKE 'SC-PROF%'
                    THEN 'IFRS-E-GA-CONSULT'
                WHEN pb.category_code LIKE 'SC-MKTG%'
                    THEN 'IFRS-E-SELL-ADVERT'
                WHEN pb.category_code LIKE 'SC-TRAVEL%'
                    THEN 'IFRS-E-GA-TRAVEL'
                WHEN pb.category_code = 'SC-FAC-RENT'
                    THEN 'IFRS-E-GA-RENT'
                WHEN pb.category_code LIKE 'SC-UTIL%'
                    THEN 'IFRS-E-GA-UTIL'
                WHEN pb.category_code LIKE 'SC-FLEET%'
                    THEN 'IFRS-E-GA-VEHICLE'
                ELSE 'IFRS-E-GA-OFFICE'
            END AS ifrs_gl_code,
            CASE
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code IN ('SC-IT-SW','SC-IT-CLOUD','SC-IT-SEC','SC-SUBS-LIC')
                    THEN 'USGAAP-A-FA-IT'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code LIKE 'SC-IT%'
                    THEN 'USGAAP-A-FA-IT'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code = 'SC-FLEET-VEH'
                    THEN 'USGAAP-A-FA-VEH'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code IN ('SC-OFFICE-FURN','SC-OFFICE-EQUIP')
                    THEN 'USGAAP-A-FA-FURN'
                WHEN pb.intent_code = 'BI-CAPEX'
                 AND pb.category_code LIKE 'SC-CAPEQUIP%'
                    THEN 'USGAAP-A-FA-MACH'
                WHEN pb.intent_code = 'BI-CAPEX'
                    THEN 'USGAAP-A-FA-CIP'
                WHEN pb.category_code ~ '^(SC-RAW|SC-COMP|SC-CONSUM|SC-PKG)'
                    THEN 'USGAAP-E-COGS-MAT'
                WHEN pb.category_code ~ '^(SC-FREIGHT|SC-WHSE)'
                    THEN 'USGAAP-E-COGS-FREIGHT'
                WHEN pb.category_code LIKE 'SC-CONTRACT%'
                    THEN 'USGAAP-E-COGS-SUB'
                WHEN pb.category_code ~ '^(SC-PRODSVC|SC-QC)'
                    THEN 'USGAAP-E-COGS-OH'
                WHEN pb.category_code LIKE 'SC-TAX%'
                  OR pb.intent_code = 'BI-REG'
                    THEN 'USGAAP-E-TAX-FED'
                WHEN pb.category_code LIKE 'SC-BANK%'
                    THEN 'USGAAP-E-FIN-BANK'
                WHEN pb.category_code LIKE 'SC-IT%'
                  OR pb.category_code LIKE 'SC-ICT%'
                  OR pb.category_code LIKE 'SC-TELCO%'
                  OR pb.category_code LIKE 'SC-SUBS%'
                    THEN 'USGAAP-E-GA-IT'
                WHEN pb.category_code = 'SC-HR-TRAIN'
                    THEN 'USGAAP-E-PAYROLL-TRAIN'
                WHEN pb.category_code LIKE 'SC-HR%'
                    THEN 'USGAAP-E-PAYROLL-WAGE'
                WHEN pb.category_code = 'SC-PROF-LEGAL'
                    THEN 'USGAAP-E-GA-LEGAL'
                WHEN pb.category_code = 'SC-PROF-AUDIT'
                    THEN 'USGAAP-E-GA-AUDIT'
                WHEN pb.category_code LIKE 'SC-PROF%'
                    THEN 'USGAAP-E-GA-CONSULT'
                WHEN pb.category_code LIKE 'SC-MKTG%'
                    THEN 'USGAAP-E-SALES-ADVERT'
                WHEN pb.category_code LIKE 'SC-TRAVEL%'
                    THEN 'USGAAP-E-SALES-TRAVEL'
                WHEN pb.category_code = 'SC-FAC-RENT'
                    THEN 'USGAAP-E-GA-OFFICE'
                WHEN pb.category_code LIKE 'SC-UTIL%'
                    THEN 'USGAAP-E-GA-UTIL'
                WHEN pb.category_code LIKE 'SC-FLEET%'
                    THEN 'USGAAP-E-GA-REPAIR'
                ELSE 'USGAAP-E-GA-OFFICE'
            END AS gaap_gl_code,
            CASE
                WHEN pb.category_code IN ('SC-IT-SW','SC-IT-CLOUD','SC-IT-SEC','SC-SUBS-LIC')
                    THEN 'SOFTWARE'
                WHEN pb.category_code LIKE 'SC-IT%'
                  OR pb.category_code LIKE 'SC-ICT%'
                  OR pb.category_code = 'SC-OFFICE-EQUIP'
                    THEN 'IT-EQUIP'
                WHEN pb.category_code = 'SC-FLEET-VEH'
                    THEN 'VEHICLES'
                WHEN pb.category_code = 'SC-OFFICE-FURN'
                    THEN 'FURNITURE'
                WHEN pb.category_code IN ('SC-MRO-TOOL','SC-QC-TEST')
                    THEN 'TOOLS'
                WHEN pb.intent_code = 'BI-CAPEX'
                  OR pb.category_code LIKE 'SC-CAPEQUIP%'
                    THEN 'PLANT'
                ELSE NULL
            END AS asset_class_code,
            CASE
                WHEN pb.intent_code = 'BI-CAPEX'
                  OR pb.category_code LIKE 'SC-CAPEQUIP%'
                    THEN 'CAPITAL'
                ELSE 'OPERATING'
            END AS budget_fund_type,
            CASE
                WHEN pb.intent_code = 'BI-CAPEX'
                  OR pb.category_code LIKE 'SC-CAPEQUIP%'
                    THEN 0.0000
                WHEN pb.category_code IN ('SC-IT-SW','SC-SUBS-LIC')
                    THEN 25000.0000
                WHEN pb.category_code LIKE 'SC-IT%'
                  OR pb.category_code = 'SC-FLEET-VEH'
                    THEN 5000.0000
                WHEN pb.category_code IN ('SC-FAC-RENT','SC-FAC-MAINT')
                    THEN 100000.0000
                WHEN pb.category_code IN ('SC-OFFICE-EQUIP','SC-OFFICE-FURN','SC-MRO-TOOL','SC-QC-TEST')
                    THEN 10000.0000
                ELSE 50000.0000
            END::numeric(18,4) AS capex_screening_threshold
        FROM policy_base pb
    ),
    enriched AS (
        SELECT
            c.*,
            CASE c.asset_class_code
                WHEN 'SOFTWARE' THEN 'ASSET-SOFTWARE'
                WHEN 'IT-EQUIP' THEN 'ASSET-IT-EQUIP'
                WHEN 'VEHICLES' THEN 'ASSET-VEHICLE'
                WHEN 'FURNITURE' THEN 'ASSET-FURNITURE'
                WHEN 'TOOLS' THEN 'ASSET-TOOL'
                WHEN 'PLANT' THEN 'ASSET-PLANT'
                ELSE NULL
            END AS asset_profile_code
        FROM classified c
    )
    SELECT
        e.policy_id,
        e.tenant_id,
        e.commodity_category_id,
        e.business_intent_id,
        e.is_default,
        e.is_selectable,
        e.sort_order,
        e.effective_from,
        e.effective_to,
        e.category_code,
        e.intent_code,
        e.ifrs_gl_code,
        e.gaap_gl_code,
        e.asset_class_code,
        e.asset_profile_code,
        e.budget_fund_type,
        COALESCE(gl.id, fallback_gl.id) AS default_gl_account_id,
        COALESCE(tg.id, fallback_tg.id) AS default_tax_group_id,
        ac.id AS default_asset_class_id,
        bp.id AS default_budget_profile_id,
        (e.asset_class_code IS NOT NULL AND e.asset_class_code <> 'SOFTWARE') AS is_asset_tag_required,
        e.capex_screening_threshold,
        tenant_locale.currency_code AS capex_screening_currency
    FROM enriched e
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(
                (SELECT tp.country_code::text
                   FROM master.tenant_profile tp
                  WHERE tp.tenant_id = e.tenant_id
                  LIMIT 1),
                (SELECT cc.country_code::text
                   FROM master.company_code cc
                  WHERE cc.tenant_id = e.tenant_id
                    AND cc.status = 'active'
                  ORDER BY cc.code
                  LIMIT 1),
                'US'
            ) AS country_code,
            COALESCE(
                (SELECT tp.currency_code
                   FROM master.tenant_profile tp
                  WHERE tp.tenant_id = e.tenant_id
                  LIMIT 1),
                (SELECT cc.functional_currency
                   FROM master.company_code cc
                  WHERE cc.tenant_id = e.tenant_id
                    AND cc.status = 'active'
                  ORDER BY cc.code
                  LIMIT 1),
                'USD'
            )::character(3) AS currency_code
    ) tenant_locale ON true
    LEFT JOIN LATERAL (
        SELECT CASE tenant_locale.country_code
            WHEN 'MY' THEN ARRAY['TG-MY-SST-SVC-6','TG-MY-SST-SALES-10','TG-MY-EXEMPT']
            WHEN 'QA' THEN ARRAY['TG-QA-EXEMPT']
            WHEN 'SA' THEN ARRAY['TG-SA-VAT-15-IN','TG-SA-VAT-ZERO']
            WHEN 'AE' THEN ARRAY['TG-AE-VAT-5-IN','TG-AE-VAT-ZERO']
            WHEN 'US' THEN ARRAY['TG-US-CA-SALES']
            WHEN 'SG' THEN ARRAY['TG-SG-GST-9-IN','TG-SG-GST-ZERO']
            WHEN 'IN' THEN ARRAY['TG-IN-IGST-18-IN','TG-IN-TN-GST-18-IN','TG-IN-MH-GST-18-IN']
            WHEN 'CA' THEN ARRAY['TG-CA-GST-5-IN']
            WHEN 'DE' THEN ARRAY['TG-DE-UST-19-IN','TG-DE-UST-7-IN']
            WHEN 'TW' THEN ARRAY['TG-TW-VAT-5-IN']
            WHEN 'ZA' THEN ARRAY['TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO']
            WHEN 'GB' THEN ARRAY['TG-GB-VAT-20-IN','TG-GB-VAT-5-IN','TG-GB-VAT-ZERO']
            WHEN 'JP' THEN ARRAY['TG-JP-CT-10-IN','TG-JP-CT-8-IN']
            WHEN 'PH' THEN ARRAY['TG-PH-VAT-12-IN']
            WHEN 'EG' THEN ARRAY['TG-EG-VAT-14-IN','TG-EGY-STD','TG-QA-EXEMPT']
            ELSE ARRAY['TG-QA-EXEMPT','TG-MY-EXEMPT','TG-US-CA-SALES']
        END AS codes
    ) tax_pref ON true
    LEFT JOIN LATERAL (
        SELECT coa.id, coa.code
          FROM master.chart_of_account coa
         WHERE coa.tenant_id = e.tenant_id
           AND coa.code IN ('COA-IFRS','COA-GAAP')
           AND coa.status = 'active'
         ORDER BY CASE coa.code WHEN 'COA-IFRS' THEN 0 WHEN 'COA-GAAP' THEN 1 ELSE 2 END
         LIMIT 1
    ) tenant_coa ON true
    LEFT JOIN LATERAL (
        SELECT ga.id
          FROM master.gl_account ga
         WHERE ga.tenant_id = e.tenant_id
           AND ga.chart_of_account_id = tenant_coa.id
           AND ga.code = CASE WHEN tenant_coa.code = 'COA-GAAP' THEN e.gaap_gl_code ELSE e.ifrs_gl_code END
           AND ga.node_type = 'posting'
           AND ga.is_active = true
         ORDER BY ga.created_at, ga.code
         LIMIT 1
    ) gl ON true
    LEFT JOIN LATERAL (
        SELECT ga.id
          FROM master.gl_account ga
         WHERE ga.tenant_id = e.tenant_id
           AND ga.chart_of_account_id = tenant_coa.id
           AND ga.node_type = 'posting'
           AND ga.is_active = true
         ORDER BY CASE
                    WHEN ga.code = CASE WHEN tenant_coa.code = 'COA-GAAP'
                                        THEN 'USGAAP-E-GA-OFFICE'
                                        ELSE 'IFRS-E-GA-OFFICE' END
                    THEN 0 ELSE 1
                  END,
                  ga.code
         LIMIT 1
    ) fallback_gl ON true
    LEFT JOIN LATERAL (
        SELECT tg.id
          FROM control.tax_group tg
         WHERE tg.tenant_id = e.tenant_id
           AND tg.code = ANY(tax_pref.codes)
           AND tg.is_active = true
         ORDER BY array_position(tax_pref.codes, tg.code), tg.code
         LIMIT 1
    ) tg ON true
    LEFT JOIN LATERAL (
        SELECT tg.id
          FROM control.tax_group tg
         WHERE tg.tenant_id = e.tenant_id
           AND tg.is_active = true
         ORDER BY CASE
                    WHEN tg.code LIKE '%-IN' THEN 0
                    WHEN tg.code LIKE '%EXEMPT%' THEN 1
                    ELSE 2
                  END,
                  tg.code
         LIMIT 1
    ) fallback_tg ON true
    LEFT JOIN master.asset_class ac
      ON ac.tenant_id = e.tenant_id
     AND ac.code = e.asset_class_code
     AND ac.is_active = true
    LEFT JOIN LATERAL (
        SELECT bp.id
          FROM master.budget_profile bp
         WHERE bp.tenant_id = e.tenant_id
           AND bp.fund_type = e.budget_fund_type
           AND bp.status = 'active'
         ORDER BY CASE WHEN bp.fiscal_year = v_seed_fiscal_year THEN 0 ELSE 1 END,
                  bp.valid_from DESC NULLS LAST,
                  bp.code
         LIMIT 1
    ) bp ON true;

    UPDATE control.commodity_category_buy_policy p
       SET default_gl_account_id = d.default_gl_account_id,
           default_tax_group_id = d.default_tax_group_id,
           default_asset_class_id = d.default_asset_class_id,
           default_asset_profile_code = d.asset_profile_code,
           default_budget_profile_id = d.default_budget_profile_id,
           is_asset_tag_required = d.is_asset_tag_required,
           capex_screening_threshold = d.capex_screening_threshold,
           capex_screening_currency = d.capex_screening_currency,
           metadata = p.metadata || jsonb_build_object('_buy_defaults', jsonb_build_object(
               'pack', v_pack,
               'version', v_version,
               'policy_kind', 'tenant_demo_default_fields',
               'default_source_ratio_target', 0.90,
               'source_table', 'control.commodity_category_buy_policy',
               'seeded_at', now()::text
           )),
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_buy_policy_defaults d
     WHERE p.id = d.policy_id;

    CREATE TEMP TABLE tmp_cc_buy_policy_company_defaults ON COMMIT DROP AS
    WITH tenant_defaults AS (
        SELECT
            d.*,
            row_number() OVER (ORDER BY d.category_code, d.policy_id) AS category_rank,
            count(*) OVER () AS category_count
        FROM tmp_cc_buy_policy_defaults d
        WHERE d.is_default = true
    ),
    companies AS (
        SELECT
            cc.tenant_id,
            cc.id AS company_code_id,
            cc.code AS company_code,
            COALESCE(cc.country_code::text, le.country_code::text, 'US') AS country_code,
            cc.functional_currency AS currency_code,
            row_number() OVER (ORDER BY cc.code) AS company_rank,
            COALESCE(assigned_coa.id, fallback_coa.id) AS chart_of_account_id,
            COALESCE(assigned_coa.code, fallback_coa.code) AS chart_of_account_code
        FROM master.company_code cc
        JOIN master.legal_entity le
          ON le.tenant_id = cc.tenant_id
         AND le.id = cc.legal_entity_id
        LEFT JOIN LATERAL (
            SELECT coa.id, coa.code
              FROM master.company_code_chart_assignment cca
              JOIN master.chart_of_account coa
                ON coa.tenant_id = cca.tenant_id
               AND coa.id = cca.chart_of_account_id
             WHERE cca.tenant_id = cc.tenant_id
               AND cca.company_code_id = cc.id
               AND cca.assignment_type = 'operating'
               AND cca.is_active = true
               AND coa.status = 'active'
               AND (cca.effective_from IS NULL OR cca.effective_from <= v_effective_from)
               AND (cca.effective_to IS NULL OR cca.effective_to >= v_effective_from)
             ORDER BY cca.is_primary DESC,
                      CASE coa.code WHEN 'COA-GAAP' THEN 0 WHEN 'COA-IFRS' THEN 1 ELSE 2 END,
                      coa.code
             LIMIT 1
        ) assigned_coa ON true
        LEFT JOIN LATERAL (
            SELECT coa.id, coa.code
              FROM master.chart_of_account coa
             WHERE coa.tenant_id = cc.tenant_id
               AND coa.code = CASE WHEN COALESCE(cc.regulatory_framework, le.regulatory_framework) = 'us_gaap'
                                   THEN 'COA-GAAP'
                                   ELSE 'COA-IFRS' END
               AND coa.status = 'active'
             LIMIT 1
        ) fallback_coa ON assigned_coa.id IS NULL
        WHERE cc.tenant_id = v_tid
          AND cc.status = 'active'
    )
    SELECT
        td.tenant_id,
        td.commodity_category_id,
        td.business_intent_id,
        co.company_code_id,
        co.company_code,
        td.is_selectable,
        10::smallint AS sort_order,
        td.effective_from,
        td.effective_to,
        td.category_code,
        td.intent_code,
        COALESCE(gl.id, fallback_gl.id, td.default_gl_account_id) AS default_gl_account_id,
        COALESCE(tg.id, fallback_tg.id, td.default_tax_group_id) AS default_tax_group_id,
        td.default_asset_class_id,
        td.asset_profile_code,
        COALESCE(bp.id, td.default_budget_profile_id) AS default_budget_profile_id,
        td.is_asset_tag_required,
        td.capex_screening_threshold,
        co.currency_code::character(3) AS capex_screening_currency
    FROM tenant_defaults td
    JOIN companies co
      ON co.tenant_id = td.tenant_id
    LEFT JOIN LATERAL (
        SELECT ga.id
          FROM master.gl_account ga
         WHERE ga.tenant_id = td.tenant_id
           AND ga.chart_of_account_id = co.chart_of_account_id
           AND ga.code = CASE WHEN co.chart_of_account_code = 'COA-GAAP'
                              THEN td.gaap_gl_code
                              ELSE td.ifrs_gl_code END
           AND ga.node_type = 'posting'
           AND ga.is_active = true
         ORDER BY ga.created_at, ga.code
         LIMIT 1
    ) gl ON true
    LEFT JOIN LATERAL (
        SELECT ga.id
          FROM master.gl_account ga
         WHERE ga.tenant_id = td.tenant_id
           AND ga.chart_of_account_id = co.chart_of_account_id
           AND ga.node_type = 'posting'
           AND ga.is_active = true
         ORDER BY CASE
                    WHEN ga.code = CASE WHEN co.chart_of_account_code = 'COA-GAAP'
                                        THEN 'USGAAP-E-GA-OFFICE'
                                        ELSE 'IFRS-E-GA-OFFICE' END
                    THEN 0 ELSE 1
                  END,
                  ga.code
         LIMIT 1
    ) fallback_gl ON true
    LEFT JOIN LATERAL (
        SELECT CASE co.country_code
            WHEN 'MY' THEN ARRAY['TG-MY-SST-SVC-6','TG-MY-SST-SALES-10','TG-MY-EXEMPT']
            WHEN 'QA' THEN ARRAY['TG-QA-EXEMPT']
            WHEN 'SA' THEN ARRAY['TG-SA-VAT-15-IN','TG-SA-VAT-ZERO']
            WHEN 'AE' THEN ARRAY['TG-AE-VAT-5-IN','TG-AE-VAT-ZERO']
            WHEN 'US' THEN ARRAY['TG-US-CA-SALES']
            WHEN 'SG' THEN ARRAY['TG-SG-GST-9-IN','TG-SG-GST-ZERO']
            WHEN 'IN' THEN ARRAY['TG-IN-IGST-18-IN','TG-IN-TN-GST-18-IN','TG-IN-MH-GST-18-IN']
            WHEN 'CA' THEN ARRAY['TG-CA-GST-5-IN']
            WHEN 'DE' THEN ARRAY['TG-DE-UST-19-IN','TG-DE-UST-7-IN']
            WHEN 'TW' THEN ARRAY['TG-TW-VAT-5-IN']
            WHEN 'ZA' THEN ARRAY['TG-ZA-VAT-15-IN','TG-ZA-VAT-ZERO']
            WHEN 'GB' THEN ARRAY['TG-GB-VAT-20-IN','TG-GB-VAT-5-IN','TG-GB-VAT-ZERO']
            WHEN 'JP' THEN ARRAY['TG-JP-CT-10-IN','TG-JP-CT-8-IN']
            WHEN 'PH' THEN ARRAY['TG-PH-VAT-12-IN']
            WHEN 'EG' THEN ARRAY['TG-EG-VAT-14-IN','TG-EGY-STD','TG-QA-EXEMPT']
            ELSE ARRAY['TG-QA-EXEMPT','TG-MY-EXEMPT','TG-US-CA-SALES']
        END AS codes
    ) tax_pref ON true
    LEFT JOIN LATERAL (
        SELECT tg.id
          FROM control.tax_group tg
         WHERE tg.tenant_id = td.tenant_id
           AND tg.code = ANY(tax_pref.codes)
           AND tg.is_active = true
         ORDER BY array_position(tax_pref.codes, tg.code), tg.code
         LIMIT 1
    ) tg ON true
    LEFT JOIN LATERAL (
        SELECT tg.id
          FROM control.tax_group tg
         WHERE tg.tenant_id = td.tenant_id
           AND tg.is_active = true
         ORDER BY CASE
                    WHEN tg.code LIKE '%-IN' THEN 0
                    WHEN tg.code LIKE '%EXEMPT%' THEN 1
                    ELSE 2
                  END,
                  tg.code
         LIMIT 1
    ) fallback_tg ON true
    LEFT JOIN LATERAL (
        SELECT bp.id
          FROM master.budget_profile bp
         WHERE bp.tenant_id = td.tenant_id
           AND bp.company_code_id = co.company_code_id
           AND bp.fund_type = td.budget_fund_type
           AND bp.status = 'active'
         ORDER BY CASE WHEN bp.fiscal_year = v_seed_fiscal_year THEN 0 ELSE 1 END,
                  bp.valid_from DESC NULLS LAST,
                  bp.code
         LIMIT 1
    ) bp ON true
    WHERE (
              td.category_count >= 10
          AND mod(td.category_rank - 1, 10) = mod(co.company_rank - 1, 10)
          )
       OR (
              td.category_count < 10
          AND td.category_rank = mod(co.company_rank - 1, td.category_count) + 1
          );

    UPDATE control.commodity_category_buy_policy p
       SET status = 'inactive',
           metadata = p.metadata || jsonb_build_object('_buy_defaults', jsonb_build_object(
               'pack', v_pack,
               'version', v_version,
               'policy_kind', 'company_default_demo_override',
               'status_reason', 'retired_by_current_demo_override_plan',
               'seeded_at', now()::text
           )),
           updated_at = now(),
           updated_by = v_su
     WHERE p.tenant_id = v_tid
       AND p.scope_type = 'COMPANY'
       AND p.metadata #>> '{_buy_defaults,policy_kind}' = 'company_default_demo_override'
       AND NOT EXISTS (
           SELECT 1
             FROM tmp_cc_buy_policy_company_defaults d
            WHERE d.tenant_id = p.tenant_id
              AND d.commodity_category_id = p.commodity_category_id
              AND d.company_code_id = p.company_code_id
       );

    UPDATE control.commodity_category_buy_policy p
       SET business_intent_id = d.business_intent_id,
           mapping_mode = 'ALLOW',
           is_selectable = d.is_selectable,
           sort_order = d.sort_order,
           default_gl_account_id = d.default_gl_account_id,
           default_tax_group_id = d.default_tax_group_id,
           default_asset_class_id = d.default_asset_class_id,
           default_asset_profile_code = d.asset_profile_code,
           default_budget_profile_id = d.default_budget_profile_id,
           is_asset_tag_required = d.is_asset_tag_required,
           capex_screening_threshold = d.capex_screening_threshold,
           capex_screening_currency = d.capex_screening_currency,
           effective_from = d.effective_from,
           effective_to = d.effective_to,
           metadata = p.metadata || jsonb_build_object('_buy_defaults', jsonb_build_object(
               'pack', v_pack,
               'version', v_version,
               'policy_kind', 'company_default_demo_override',
               'default_source_ratio_target', 0.90,
               'override_source', 'company_local_tax_gl_budget_currency',
               'source_table', 'control.commodity_category_buy_policy',
               'seeded_at', now()::text
           )),
           status = 'active',
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_buy_policy_company_defaults d
     WHERE p.tenant_id = d.tenant_id
       AND p.commodity_category_id = d.commodity_category_id
       AND p.company_code_id = d.company_code_id
       AND p.scope_type = 'COMPANY'
       AND p.scope_id = d.company_code_id
       AND p.is_default = true;

    INSERT INTO control.commodity_category_buy_policy (
        tenant_id,
        commodity_category_id,
        business_intent_id,
        company_code_id,
        scope_type,
        scope_id,
        mapping_mode,
        is_default,
        is_selectable,
        sort_order,
        default_gl_account_id,
        default_tax_group_id,
        default_asset_class_id,
        default_asset_profile_code,
        default_budget_profile_id,
        is_asset_tag_required,
        capex_screening_threshold,
        capex_screening_currency,
        effective_from,
        effective_to,
        metadata,
        status,
        created_by,
        updated_by
    )
    SELECT
        d.tenant_id,
        d.commodity_category_id,
        d.business_intent_id,
        d.company_code_id,
        'COMPANY',
        d.company_code_id,
        'ALLOW',
        true,
        d.is_selectable,
        d.sort_order,
        d.default_gl_account_id,
        d.default_tax_group_id,
        d.default_asset_class_id,
        d.asset_profile_code,
        d.default_budget_profile_id,
        d.is_asset_tag_required,
        d.capex_screening_threshold,
        d.capex_screening_currency,
        d.effective_from,
        d.effective_to,
        jsonb_build_object('_buy_defaults', jsonb_build_object(
            'pack', v_pack,
            'version', v_version,
            'policy_kind', 'company_default_demo_override',
            'default_source_ratio_target', 0.90,
            'override_source', 'company_local_tax_gl_budget_currency',
            'source_table', 'control.commodity_category_buy_policy',
            'seeded_at', now()::text
        )),
        'active',
        v_su,
        v_su
    FROM tmp_cc_buy_policy_company_defaults d
    WHERE NOT EXISTS (
        SELECT 1
          FROM control.commodity_category_buy_policy p
         WHERE p.tenant_id = d.tenant_id
           AND p.commodity_category_id = d.commodity_category_id
           AND p.company_code_id = d.company_code_id
           AND p.scope_type = 'COMPANY'
           AND p.scope_id = d.company_code_id
           AND p.is_default = true
    );

    SELECT string_agg(cc.code, ', ' ORDER BY cc.code)
      INTO v_missing
      FROM control.commodity_category_buy_policy p
      JOIN master.commodity_category cc
        ON cc.tenant_id = p.tenant_id
       AND cc.id = p.commodity_category_id
     WHERE p.tenant_id = v_tid
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.is_default = true
       AND p.is_active = true
       AND (
           p.default_gl_account_id IS NULL
           OR p.default_tax_group_id IS NULL
           OR p.default_budget_profile_id IS NULL
           OR p.is_asset_tag_required IS NULL
           OR p.capex_screening_threshold IS NULL
           OR p.capex_screening_currency IS NULL
       );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[910_cc_buy_defaults] tenant default buy policies missing default data: %', v_missing;
    END IF;

    SELECT string_agg(cc.code, ', ' ORDER BY cc.code)
      INTO v_missing
      FROM master.company_code cc
     WHERE cc.tenant_id = v_tid
       AND cc.status = 'active'
       AND NOT EXISTS (
           SELECT 1
             FROM control.commodity_category_buy_policy p
            WHERE p.tenant_id = cc.tenant_id
              AND p.company_code_id = cc.id
              AND p.scope_type = 'COMPANY'
              AND p.scope_id = cc.id
              AND p.is_default = true
              AND p.is_active = true
              AND p.metadata #>> '{_buy_defaults,policy_kind}' = 'company_default_demo_override'
       );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[910_cc_buy_defaults] active company codes missing demo company overrides: %', v_missing;
    END IF;

    SELECT count(*)
      INTO v_company_count
      FROM master.company_code cc
     WHERE cc.tenant_id = v_tid
       AND cc.status = 'active';

    SELECT count(*)
      INTO v_tenant_default_count
      FROM control.commodity_category_buy_policy p
     WHERE p.tenant_id = v_tid
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.is_default = true
       AND p.is_active = true;

    SELECT count(*)
      INTO v_company_override_count
      FROM control.commodity_category_buy_policy p
     WHERE p.tenant_id = v_tid
       AND p.scope_type = 'COMPANY'
       AND p.is_default = true
       AND p.is_active = true
       AND p.metadata #>> '{_buy_defaults,policy_kind}' = 'company_default_demo_override';

    IF v_company_count > 0
       AND v_tenant_default_count > 0
       AND v_company_override_count > ceil((v_company_count * v_tenant_default_count)::numeric * 0.15)::integer THEN
        RAISE EXCEPTION '[910_cc_buy_defaults] company overrides exceed sparse demo target: overrides %, companies %, tenant defaults %',
            v_company_override_count, v_company_count, v_tenant_default_count;
    END IF;

    RAISE NOTICE '[910_cc_buy_defaults] tenant %, tenant default policies %, companies %, company overrides %',
        v_tenant_code,
        v_tenant_default_count,
        v_company_count,
        v_company_override_count;
END $seed$;
