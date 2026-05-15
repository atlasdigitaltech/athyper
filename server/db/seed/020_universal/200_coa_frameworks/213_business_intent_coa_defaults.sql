-- ============================================================================
-- UNIVERSAL - BUSINESS INTENT COA DEFAULTS
-- ============================================================================
-- File:     213_business_intent_coa_defaults.sql
-- Schema:   master.business_intent
-- Purpose:  Backfill business-intent GL defaults after COA-IFRS/COA-GAAP
--           accounts are seeded. The early taxonomy seed can run before COA
--           accounts exist; this file is the post-COA reconciliation point.
-- Depends:  021_business_intents.sql
--           211_framework_ifrs_accounts.sql
--           212_framework_gaap_accounts.sql
-- Idempotent: Yes
-- ============================================================================

DO $seed$
DECLARE
    v_tid            uuid;
    v_su             uuid := '00000000-0000-0000-0000-000000000000';
    v_pack           text := '213_business_intent_coa_defaults';
    v_version        text := '1.0.0';
    v_ifrs_coa_id    uuid;
    v_gaap_coa_id    uuid;
    v_ifrs_ready     boolean := false;
    v_gaap_ready     boolean := false;
    v_missing        text;
    v_gl_ok          int := 0;
    v_gaap_ok        int := 0;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT id INTO v_ifrs_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS';

    SELECT id INTO v_gaap_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-GAAP';

    CREATE TEMP TABLE tmp_bi_gl_defaults (
        bi_code           text PRIMARY KEY,
        ifrs_account_code text NOT NULL,
        gaap_account_code text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi_gl_defaults (bi_code, ifrs_account_code, gaap_account_code) VALUES
    ('BI-OPEX-IT',       'IFRS-E-GA-IT',        'USGAAP-E-GA-IT'),
    ('BI-OPEX-HR',       'IFRS-E-HR-SAL',       'USGAAP-E-PAYROLL-WAGE'),
    ('BI-OPEX-FAC',      'IFRS-E-GA-RENT',      'USGAAP-E-GA-RENT'),
    ('BI-OPEX-UTIL',     'IFRS-E-GA-UTIL',      'USGAAP-E-GA-UTIL'),
    ('BI-OPEX-FUEL',     'IFRS-E-GA-VEHICLE',   'USGAAP-E-GA-MISC'),
    ('BI-OPEX-INS',      'IFRS-E-GA-INS',       'USGAAP-E-GA-INS'),
    ('BI-OPEX-PROF',     'IFRS-E-GA-CONSULT',   'USGAAP-E-GA-CONSULT'),
    ('BI-OPEX-MKTG',     'IFRS-E-SELL-ADVERT',  'USGAAP-E-SALES-ADVERT'),
    ('BI-OPEX-FLEET',    'IFRS-E-GA-VEHICLE',   'USGAAP-E-GA-MISC'),
    ('BI-OPEX-SAFETY',   'IFRS-E-GA-SECURITY',  'USGAAP-E-GA-OFFICE'),
    ('BI-OPEX-ENV',      'IFRS-E-OTHER-ENVIRO', 'USGAAP-E-OTHER-MISC'),
    ('BI-OPEX-MRO',      'IFRS-E-GA-REPAIR',    'USGAAP-E-GA-REPAIR'),
    ('BI-OPEX-MAINT',    'IFRS-E-GA-REPAIR',    'USGAAP-E-GA-REPAIR'),
    ('BI-OPEX-OUTSRC',   'IFRS-E-GA-CONSULT',   'USGAAP-E-GA-CONSULT'),
    ('BI-CAPEX-IT',      'IFRS-A-FA-IT',        'USGAAP-A-FA-IT'),
    ('BI-CAPEX-PLANT',   'IFRS-A-FA-PLANT',     'USGAAP-A-FA-MACH'),
    ('BI-CAPEX-EQUIP',   'IFRS-A-FA-PLANT',     'USGAAP-A-FA-MACH'),
    ('BI-CAPEX-MACH',    'IFRS-A-FA-PLANT',     'USGAAP-A-FA-MACH'),
    ('BI-CAPEX-FLEET',   'IFRS-A-FA-VEH',       'USGAAP-A-FA-VEH'),
    ('BI-CAPEX-TOOL',    'IFRS-A-FA-TOOLS',     'USGAAP-A-FA-MACH'),
    ('BI-CAPEX-LEASE',   'IFRS-A-ROU-EQUIP',    'USGAAP-A-ROU-EQUIP'),
    ('BI-CAPEX-PROP',    'IFRS-A-FA-BLDG',      'USGAAP-A-FA-BLDG'),
    ('BI-CAPEX-INFRA',   'IFRS-A-FA-CWIP',      'USGAAP-A-FA-CIP'),
    ('BI-COGS-MAT',      'IFRS-E-COGS-MAT',     'USGAAP-E-COGS-MAT'),
    ('BI-COGS-SUB',      'IFRS-E-COGS-SUB',     'USGAAP-E-COGS-SUB'),
    ('BI-COGS-LABOUR',   'IFRS-E-COGS-LABOUR',  'USGAAP-E-COGS-LABOR'),
    ('BI-COGS-OH',       'IFRS-E-COGS-OH',      'USGAAP-E-COGS-OH'),
    ('BI-COGS-FREIGHT',  'IFRS-E-COGS-FREIGHT', 'USGAAP-E-COGS-FREIGHT'),
    ('BI-ADMIN-GEN',     'IFRS-E-GA-OFFICE',    'USGAAP-E-GA-OFFICE'),
    ('BI-ADMIN-LEGAL',   'IFRS-E-GA-LEGAL',     'USGAAP-E-GA-LEGAL'),
    ('BI-ADMIN-AUDIT',   'IFRS-E-GA-AUDIT',     'USGAAP-E-GA-AUDIT'),
    ('BI-REG-TAX',       'IFRS-E-TAX-CIT',      'USGAAP-E-TAX-FED'),
    ('BI-REG-COMP',      'IFRS-E-GA-LICENSE',   'USGAAP-E-GA-DUES'),
    ('BI-REG-ENV',       'IFRS-E-OTHER-ENVIRO', 'USGAAP-E-OTHER-MISC'),
    ('BI-TRANSFER-IC',   'IFRS-E-ICE-MGMT',     'USGAAP-E-ICE-MGMT'),
    ('BI-TRANSFER-RECL', 'IFRS-E-ICE-SVCS',     'USGAAP-E-ICE-SVC');

    IF (SELECT count(*) FROM tmp_bi_gl_defaults) <> 36 THEN
        RAISE EXCEPTION '[213_business_intent_coa_defaults] Expected 36 leaf mappings, got %',
            (SELECT count(*) FROM tmp_bi_gl_defaults);
    END IF;

    v_ifrs_ready := v_ifrs_coa_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM tmp_bi_gl_defaults m
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.gl_account a
            WHERE a.tenant_id = v_tid
              AND a.chart_of_account_id = v_ifrs_coa_id
              AND a.code = m.ifrs_account_code
              AND a.is_active = true
              AND a.node_type = 'posting'
              AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true
        )
    );

    v_gaap_ready := v_gaap_coa_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM tmp_bi_gl_defaults m
        WHERE m.gaap_account_code IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM master.gl_account a
            WHERE a.tenant_id = v_tid
              AND a.chart_of_account_id = v_gaap_coa_id
              AND a.code = m.gaap_account_code
              AND a.is_active = true
              AND a.node_type = 'posting'
              AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true
        )
    );

    IF NOT v_ifrs_ready THEN
        RAISE EXCEPTION '[213_business_intent_coa_defaults] COA-IFRS posting accounts are not ready - run 211_framework_ifrs_accounts.sql first';
    END IF;

    IF NOT v_gaap_ready THEN
        RAISE EXCEPTION '[213_business_intent_coa_defaults] COA-GAAP posting accounts are not ready - run 212_framework_gaap_accounts.sql first';
    END IF;

    CREATE TEMP TABLE tmp_bi_coa_resolved ON COMMIT DROP AS
    SELECT
        m.bi_code,
        m.ifrs_account_code,
        ifrs.id AS ifrs_account_id,
        ifrs.metadata->>'_group_map' AS group_account_code,
        gaap.code AS gaap_account_code
    FROM tmp_bi_gl_defaults m
    LEFT JOIN master.gl_account ifrs
      ON ifrs.tenant_id = v_tid
     AND ifrs.chart_of_account_id = v_ifrs_coa_id
     AND ifrs.code = m.ifrs_account_code
     AND ifrs.is_active = true
     AND ifrs.node_type = 'posting'
     AND COALESCE((ifrs.metadata->>'_journal_postable')::boolean, true) = true
    LEFT JOIN LATERAL (
        SELECT a.code
        FROM master.gl_account a
        WHERE a.tenant_id = v_tid
          AND a.chart_of_account_id = v_gaap_coa_id
          AND a.is_active = true
          AND a.node_type = 'posting'
          AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true
          AND (
              a.code = m.gaap_account_code
              OR (
                  m.gaap_account_code IS NULL
                  AND ifrs.metadata ? '_group_map'
                  AND a.metadata->>'_group_map' = ifrs.metadata->>'_group_map'
              )
          )
        ORDER BY CASE WHEN a.code = m.gaap_account_code THEN 0 ELSE 1 END,
                 a.sort_order,
                 a.code
        LIMIT 1
    ) gaap ON true;

    UPDATE master.business_intent bi
    SET default_gl_account_id = r.ifrs_account_id,
        metadata = bi.metadata
                   || jsonb_build_object(
                        '_coa_defaults',
                        jsonb_strip_nulls(jsonb_build_object(
                            'ifrs_code',     r.ifrs_account_code,
                            'usgaap_code',   r.gaap_account_code,
                            'group_map',     r.group_account_code,
                            'asset_profile', bi.default_asset_profile_code
                        ))
                      )
                   || jsonb_build_object('_seed_coa_defaults', jsonb_build_object(
                        'pack',      v_pack,
                        'version',   v_version,
                        'seeded_at', now()::text
                      ))
                   || CASE WHEN bi.code = 'BI-REG-TAX' THEN
                        jsonb_build_object(
                            '_tax_policy',
                            jsonb_build_object(
                                'tax_context_required', true,
                                'recommendation', 'Resolve tax_group from company, party, jurisdiction, and document-line context; do not set a tenant-global business-intent tax group for BI-REG-TAX.',
                                'purchase_tax_source', 'company_code_spend_policy.default_tax_group_id or supplier profile tax_group_id',
                                'withholding_tax_source', 'company_code_supplier_profile.default_wht_tax_group_id',
                                'expense_gl_role', 'corporate_income_tax_expense'
                            )
                        )
                      ELSE '{}'::jsonb END,
        updated_at = now(),
        updated_by = v_su
    FROM tmp_bi_coa_resolved r
    WHERE bi.tenant_id = v_tid
      AND bi.code = r.bi_code
      AND (
          bi.default_gl_account_id IS DISTINCT FROM r.ifrs_account_id
          OR bi.metadata->'_coa_defaults' IS DISTINCT FROM
              jsonb_strip_nulls(jsonb_build_object(
                  'ifrs_code',     r.ifrs_account_code,
                  'usgaap_code',   r.gaap_account_code,
                  'group_map',     r.group_account_code,
                  'asset_profile', bi.default_asset_profile_code
              ))
          OR bi.metadata->'_seed_coa_defaults'->>'pack' IS DISTINCT FROM v_pack
          OR (
              bi.code = 'BI-REG-TAX'
              AND NOT (bi.metadata ? '_tax_policy')
          )
      );

    SELECT string_agg(m.bi_code, ', ' ORDER BY m.bi_code)
    INTO v_missing
    FROM tmp_bi_gl_defaults m
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.business_intent bi
        WHERE bi.tenant_id = v_tid
          AND bi.code = m.bi_code
          AND bi.is_active = true
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[213_business_intent_coa_defaults] Business intents missing before COA backfill: %', v_missing;
    END IF;

    SELECT count(*) INTO v_gl_ok
    FROM tmp_bi_coa_resolved r
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid
     AND bi.code = r.bi_code
    WHERE r.ifrs_account_id IS NOT NULL
      AND bi.default_gl_account_id = r.ifrs_account_id
      AND bi.metadata #>> '{_coa_defaults,ifrs_code}' = r.ifrs_account_code
      AND bi.metadata #>> '{_coa_defaults,group_map}' = r.group_account_code;

    IF v_gl_ok <> 36 THEN
        SELECT string_agg(r.bi_code, ', ' ORDER BY r.bi_code)
        INTO v_missing
        FROM tmp_bi_coa_resolved r
        JOIN master.business_intent bi
          ON bi.tenant_id = v_tid
         AND bi.code = r.bi_code
        WHERE r.ifrs_account_id IS NULL
           OR bi.default_gl_account_id IS DISTINCT FROM r.ifrs_account_id
           OR bi.metadata #>> '{_coa_defaults,ifrs_code}' IS DISTINCT FROM r.ifrs_account_code
           OR bi.metadata #>> '{_coa_defaults,group_map}' IS DISTINCT FROM r.group_account_code;

        RAISE EXCEPTION '[213_business_intent_coa_defaults] Missing IFRS GL defaults: %', v_missing;
    END IF;

    SELECT count(*) INTO v_gaap_ok
    FROM tmp_bi_coa_resolved r
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid
     AND bi.code = r.bi_code
    WHERE r.gaap_account_code IS NOT NULL
      AND bi.metadata #>> '{_coa_defaults,usgaap_code}' = r.gaap_account_code;

    IF v_gaap_ok <> 36 THEN
        SELECT string_agg(r.bi_code, ', ' ORDER BY r.bi_code)
        INTO v_missing
        FROM tmp_bi_coa_resolved r
        JOIN master.business_intent bi
          ON bi.tenant_id = v_tid
         AND bi.code = r.bi_code
        WHERE r.gaap_account_code IS NULL
           OR bi.metadata #>> '{_coa_defaults,usgaap_code}' IS DISTINCT FROM r.gaap_account_code;

        RAISE EXCEPTION '[213_business_intent_coa_defaults] Missing US GAAP semantic defaults: %', v_missing;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM master.business_intent bi
        WHERE bi.tenant_id = v_tid
          AND bi.code = 'BI-REG-TAX'
          AND bi.metadata #>> '{_tax_policy,tax_context_required}' = 'true'
    ) THEN
        RAISE EXCEPTION '[213_business_intent_coa_defaults] BI-REG-TAX tax policy metadata was not populated';
    END IF;

    RAISE NOTICE '[213_business_intent_coa_defaults] Business intent COA defaults backfilled: IFRS %/36, US GAAP %/36. Tax policy metadata confirmed for BI-REG-TAX.',
        v_gl_ok, v_gaap_ok;
END $seed$;
