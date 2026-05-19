-- ============================================================================
-- UNIVERSAL - DOMAIN BUSINESS INTENTS
-- ============================================================================
-- Schema:   master.business_intent
-- Purpose:  Seed one standard business intent per domain. Commodity-category
--           buy/sell policies own allowed intent selection and accounting,
--           tax, approval, asset, and capex defaults.
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '021_domain_intents';
    v_version text := '2.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    INSERT INTO master.business_intent (
        tenant_id, code, name, description, domain, subtype,
        parent_id, path, depth, sort_order,
        visibility, metadata, status, created_by
    )
    SELECT
        v_tid,
        s.code,
        s.name,
        s.description,
        s.domain,
        NULL,
        NULL,
        s.code,
        0,
        s.sort_order,
        s.visibility,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack,
            'version', v_version,
            'seeded_at', now()::text,
            'domain_level', true,
            'policy_defaults', 'control.commodity_category_buy_policy/control.commodity_category_sell_policy'
        )),
        'active',
        v_su
    FROM (VALUES
        ('BI-OPEX',     'Operating Expenditure',  'Day-to-day operational spending',                                'OPEX',             10, 'STANDARD'),
        ('BI-CAPEX',    'Capital Expenditure',    'Long-term asset acquisition and improvement',                    'CAPEX',            20, 'STANDARD'),
        ('BI-COGS',     'Cost of Sales',          'Direct costs of goods sold or services delivered',               'COST_OF_SALES',    30, 'STANDARD'),
        ('BI-ADMIN',    'Administrative Expense', 'General and administrative overhead',                            'ADMIN',            40, 'STANDARD'),
        ('BI-REG',      'Regulatory Compliance',  'Taxes, statutory fees, and compliance-driven costs',             'REGULATORY',       50, 'STANDARD'),
        ('BI-TRANSFER', 'Internal Transfer',      'Inter-company charges and cost re-allocations',                  'TRANSFER',         60, 'RESTRICTED'),
        ('BI-REV',      'Revenue',                'Earned income and revenue recognition intents',                  'REVENUE',          70, 'STANDARD'),
        ('BI-DEFREV',   'Deferred Revenue',       'Customer billings and contract liabilities deferred to revenue', 'DEFERRED_REVENUE', 80, 'STANDARD')
    ) AS s(code, name, description, domain, sort_order, visibility)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = NULL,
        parent_id   = NULL,
        path        = EXCLUDED.path,
        depth       = 0,
        sort_order  = EXCLUDED.sort_order,
        visibility  = EXCLUDED.visibility,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                            'pack', v_pack,
                            'version', v_version,
                            'seeded_at', now()::text,
                            'domain_level', true,
                            'policy_defaults', 'control.commodity_category_buy_policy/control.commodity_category_sell_policy'
                         )),
        status      = 'active',
        updated_at  = now(),
        updated_by  = v_su;

    CREATE TEMP TABLE tmp_business_intent_domain_map (
        tenant_id uuid NOT NULL,
        old_id uuid NOT NULL,
        new_id uuid NOT NULL,
        old_code text NOT NULL,
        new_code text NOT NULL,
        PRIMARY KEY (tenant_id, old_id)
    ) ON COMMIT DROP;

    INSERT INTO tmp_business_intent_domain_map (tenant_id, old_id, new_id, old_code, new_code)
    SELECT old_bi.tenant_id,
           old_bi.id,
           new_bi.id,
           old_bi.code,
           domain_map.new_code
      FROM master.business_intent old_bi
      JOIN LATERAL (
          SELECT CASE
              WHEN old_bi.code IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV') THEN NULL
              WHEN old_bi.code = 'OPEX_GENERAL' OR old_bi.code LIKE 'OPEX-%' OR old_bi.code LIKE 'BI-OPEX-%' THEN 'BI-OPEX'
              WHEN old_bi.code = 'CAPEX_GENERAL' OR old_bi.code LIKE 'CAPEX-%' OR old_bi.code LIKE 'BI-CAPEX-%' THEN 'BI-CAPEX'
              WHEN old_bi.code = 'ADMIN_GENERAL' OR old_bi.code LIKE 'ADMIN-%' OR old_bi.code LIKE 'BI-ADMIN-%' THEN 'BI-ADMIN'
              WHEN old_bi.code LIKE 'COGS-%' OR old_bi.code LIKE 'BI-COGS-%' THEN 'BI-COGS'
              WHEN old_bi.code LIKE 'REG-%' OR old_bi.code LIKE 'BI-REG-%' THEN 'BI-REG'
              WHEN old_bi.code LIKE 'TRANSFER-%' OR old_bi.code LIKE 'BI-TRANSFER-%' THEN 'BI-TRANSFER'
              WHEN old_bi.code LIKE 'REV-%' OR old_bi.code LIKE 'BI-REV-%' THEN 'BI-REV'
              WHEN old_bi.code LIKE 'DEFREV-%' OR old_bi.code LIKE 'BI-DEFREV-%' THEN 'BI-DEFREV'
              WHEN old_bi.domain = 'OPEX' THEN 'BI-OPEX'
              WHEN old_bi.domain = 'CAPEX' THEN 'BI-CAPEX'
              WHEN old_bi.domain = 'COST_OF_SALES' THEN 'BI-COGS'
              WHEN old_bi.domain = 'ADMIN' THEN 'BI-ADMIN'
              WHEN old_bi.domain = 'REGULATORY' THEN 'BI-REG'
              WHEN old_bi.domain = 'TRANSFER' THEN 'BI-TRANSFER'
              WHEN old_bi.domain = 'REVENUE' THEN 'BI-REV'
              WHEN old_bi.domain = 'DEFERRED_REVENUE' THEN 'BI-DEFREV'
              ELSE NULL
          END AS new_code
      ) domain_map ON domain_map.new_code IS NOT NULL
      JOIN master.business_intent new_bi
        ON new_bi.tenant_id = old_bi.tenant_id
       AND new_bi.code = domain_map.new_code
     WHERE old_bi.tenant_id = v_tid
       AND old_bi.code <> domain_map.new_code;

    UPDATE master.business_intent bi
       SET parent_id = NULL,
           path = bi.code,
           depth = 0,
           updated_at = now(),
           updated_by = v_su
      FROM tmp_business_intent_domain_map m
     WHERE bi.tenant_id = m.tenant_id
       AND (bi.id = m.old_id OR bi.parent_id = m.old_id);

    UPDATE master.spend_category sc
       SET default_intent_id = m.new_id,
           updated_at = now(),
           updated_by = v_su
      FROM tmp_business_intent_domain_map m
     WHERE sc.tenant_id = m.tenant_id
       AND sc.default_intent_id = m.old_id;

    IF to_regclass('master.company_code_spend_policy') IS NOT NULL THEN
        EXECUTE $sql$
            UPDATE master.company_code_spend_policy csp
               SET default_intent_id = m.new_id,
                   updated_at = now(),
                   updated_by = $1
              FROM tmp_business_intent_domain_map m
             WHERE csp.tenant_id = m.tenant_id
               AND csp.default_intent_id = m.old_id
        $sql$ USING v_su;
    END IF;

    IF to_regclass('control.commodity_classification_to_intent_rule') IS NOT NULL THEN
        UPDATE control.commodity_classification_to_intent_rule r
           SET resolved_intent_id = m.new_id,
               resolved_domain = new_bi.domain,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
          JOIN master.business_intent new_bi
            ON new_bi.tenant_id = m.tenant_id
           AND new_bi.id = m.new_id
         WHERE r.tenant_id = m.tenant_id
           AND r.resolved_intent_id = m.old_id;
    END IF;

    IF to_regclass('control.commodity_category_buy_policy') IS NOT NULL THEN
        UPDATE control.commodity_category_buy_policy p
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE p.tenant_id = m.tenant_id
           AND p.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('control.commodity_category_sell_policy') IS NOT NULL THEN
        UPDATE control.commodity_category_sell_policy p
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE p.tenant_id = m.tenant_id
           AND p.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('control.intent_to_accounting_profile_rule') IS NOT NULL THEN
        UPDATE control.intent_to_accounting_profile_rule r
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE r.tenant_id = m.tenant_id
           AND r.intent_id = m.old_id;
    END IF;

    IF to_regclass('control.intent_profile_override') IS NOT NULL THEN
        UPDATE control.intent_profile_override o
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE o.tenant_id = m.tenant_id
           AND o.intent_id = m.old_id;
    END IF;

    IF to_regclass('control.forecast_line') IS NOT NULL THEN
        UPDATE control.forecast_line f
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE f.tenant_id = m.tenant_id
           AND f.intent_id = m.old_id;
    END IF;

    IF to_regclass('document.purchase_invoice_line') IS NOT NULL THEN
        UPDATE document.purchase_invoice_line l
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE l.tenant_id = m.tenant_id
           AND l.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('document.invoice_line') IS NOT NULL THEN
        UPDATE document.invoice_line l
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE l.tenant_id = m.tenant_id
           AND l.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('document.accounting_distribution') IS NOT NULL THEN
        UPDATE document.accounting_distribution d
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE d.tenant_id = m.tenant_id
           AND d.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('document.commitment') IS NOT NULL THEN
        UPDATE document.commitment c
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE c.tenant_id = m.tenant_id
           AND c.intent_id = m.old_id;
    END IF;

    IF to_regclass('document.commitment_line') IS NOT NULL THEN
        UPDATE document.commitment_line l
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE l.tenant_id = m.tenant_id
           AND l.business_intent_id = m.old_id;
    END IF;

    DELETE FROM master.business_intent bi
     WHERE bi.tenant_id = v_tid
       AND bi.code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV');

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid
          AND code IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV')
          AND is_active = true) <> 8 THEN
        RAISE EXCEPTION '[021_domain_intents] Expected 8 active domain intents';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.business_intent
        WHERE tenant_id = v_tid
          AND code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV')
    ) THEN
        RAISE EXCEPTION '[021_domain_intents] Non-domain business intents remain after cleanup: %',
            (SELECT string_agg(code, ', ' ORDER BY code)
             FROM master.business_intent
             WHERE tenant_id = v_tid
               AND code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV'));
    END IF;

    RAISE NOTICE '[021_domain_intents] Loaded 8 domain business intents; remapped % legacy rows; defaults live on commodity category policy tables',
        (SELECT count(*) FROM tmp_business_intent_domain_map);
END $seed$;
