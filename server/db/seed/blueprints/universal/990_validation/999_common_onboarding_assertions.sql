-- Final guardrail for tenant onboarding. Runs once per tenant folder after all
-- tenant-specific files and asserts that the universal data (frameworks, charts,
-- org/cost/profit centres, payment terms, asset classes, tax jurisdictions,
-- FX rates) exists and links correctly to every active legal entity/company_code.
-- Any failure here is fatal — tenant is not safely usable yet.

DO $seed$
DECLARE
    v_tid     uuid;
    v_missing text;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] app.seed_tenant_id not set';
    END IF;

    SELECT string_agg(le.code || ':' || le.country_code || ':' || COALESCE(le.regulatory_framework, '<null>'), ', ' ORDER BY le.code)
    INTO v_missing
    FROM master.legal_entity le
    WHERE le.tenant_id = v_tid
      AND le.status = 'active'
      AND COALESCE(le.regulatory_framework, '') <>
          CASE WHEN le.country_code = 'US' THEN 'us_gaap' ELSE 'ifrs' END;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Legal entity framework mismatch (US=us_gaap, non-US=ifrs): %', v_missing;
    END IF;

    SELECT string_agg(cc.code || ':' || COALESCE(cc.country_code, '<null>') || ':' || COALESCE(cc.regulatory_framework, '<null>'), ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    JOIN master.legal_entity le
      ON le.tenant_id = cc.tenant_id
     AND le.id = cc.legal_entity_id
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND (
          cc.country_code IS NULL
          OR cc.country_code <> le.country_code
          OR COALESCE(cc.regulatory_framework, '') <>
             CASE WHEN cc.country_code = 'US' THEN 'us_gaap' ELSE 'ifrs' END
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Company code country/framework mismatch: %', v_missing;
    END IF;

    SELECT string_agg(required.coa_code, ', ' ORDER BY required.coa_code)
    INTO v_missing
    FROM (VALUES ('COA-IFRS'), ('COA-GAAP')) AS required(coa_code)
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.chart_of_account coa
        JOIN master.gl_account ga
          ON ga.tenant_id = coa.tenant_id
         AND ga.chart_of_account_id = coa.id
         AND ga.node_type = 'posting'
         AND ga.is_active = true
        WHERE coa.tenant_id = v_tid
          AND coa.code = required.coa_code
          AND coa.status = 'active'
    );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing universal COA posting accounts: %', v_missing;
    END IF;

    SELECT string_agg(cc.code, ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND NOT EXISTS (
          SELECT 1
          FROM master.company_code_chart_assignment cca
          JOIN master.chart_of_account coa
            ON coa.tenant_id = cca.tenant_id
           AND coa.id = cca.chart_of_account_id
          WHERE cca.tenant_id = cc.tenant_id
            AND cca.company_code_id = cc.id
            AND cca.assignment_type = 'operating'
            AND cca.is_active = true
            AND coa.code = CASE WHEN cc.regulatory_framework = 'us_gaap' THEN 'COA-GAAP' ELSE 'COA-IFRS' END
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing framework-matched operating COA assignment for company code(s): %', v_missing;
    END IF;

    SELECT string_agg(cc.code, ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND (
          NOT EXISTS (
              SELECT 1
              FROM master.org_unit ou
              WHERE ou.tenant_id = cc.tenant_id
                AND ou.company_code_id = cc.id
                AND ou.code = cc.code || '-ORG'
          )
          OR NOT EXISTS (
              SELECT 1
              FROM master.cost_center c
              WHERE c.tenant_id = cc.tenant_id
                AND c.company_code_id = cc.id
                AND c.code = cc.code || '-CC-OPS-GEN'
                AND c.node_type = 'posting'
          )
          OR NOT EXISTS (
              SELECT 1
              FROM master.profit_center pc
              WHERE pc.tenant_id = cc.tenant_id
                AND pc.company_code_id = cc.id
                AND pc.code = cc.code || '-PC-EXT-GEN'
                AND pc.node_type = 'posting'
          )
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing universal org/cost/profit-center rows for company code(s): %', v_missing;
    END IF;

    SELECT string_agg(required.code, ', ' ORDER BY required.code)
    INTO v_missing
    FROM (VALUES
        ('PT-NET30'), ('PT-NET60'), ('PT-NET90'),
        ('PT-CONST-60'), ('PT-CONST-ADV'), ('PT-2-10-N30')
    ) AS required(code)
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.payment_term pt
        WHERE pt.tenant_id = v_tid
          AND pt.code = required.code
          AND pt.status = 'active'
    );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing universal payment terms: %', v_missing;
    END IF;

    IF (SELECT count(*) FROM master.asset_class
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = '340_asset'
          AND status = 'active') < 16
    THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing universal asset class taxonomy';
    END IF;

    IF (SELECT count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid
          AND jurisdiction_type = 'country'
          AND status = 'active') < 14
    THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing universal country-level tax jurisdictions';
    END IF;

    IF (SELECT count(DISTINCT from_currency) FROM master.fx_rate
        WHERE tenant_id = v_tid
          AND to_currency = 'MYR'
          AND metadata->'_seed'->>'pack' = '330_org') < 150
    THEN
        RAISE EXCEPTION '[common_onboarding_assertions] Missing universal FX rates to MYR';
    END IF;

    -- Phase 2: every active tax_group must carry a scoping jurisdiction.
    -- Catches tenant seeds that forget to set jurisdiction_id at INSERT.
    IF EXISTS (
        SELECT 1 FROM control.tax_group
        WHERE tenant_id = v_tid
          AND status = 'active'
          AND jurisdiction_id IS NULL
    ) THEN
        RAISE EXCEPTION '[common_onboarding_assertions] active tax_group(s) without jurisdiction_id: %',
            (SELECT string_agg(code, ', ' ORDER BY code) FROM control.tax_group
              WHERE tenant_id = v_tid AND status = 'active' AND jurisdiction_id IS NULL);
    END IF;

    RAISE NOTICE '[common_onboarding_assertions] tenant % passed common onboarding assertions', v_tid;
END $seed$;
