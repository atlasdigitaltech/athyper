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

    UPDATE master.business_intent bi
       SET status = 'archived',
           metadata = bi.metadata || jsonb_build_object(
               '_archived_by', jsonb_build_object(
                   'pack', v_pack,
                   'reason', 'Standard seed now keeps one business intent per domain',
                   'archived_at', now()::text
               )
           ),
           updated_at = now(),
           updated_by = v_su
     WHERE bi.tenant_id = v_tid
       AND bi.code LIKE 'BI-%-%'
       AND COALESCE(bi.metadata->'_seed'->>'pack', '') IN ('021_base', '021_base_direct_ops');

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid
          AND code IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV')
          AND is_active = true) <> 8 THEN
        RAISE EXCEPTION '[021_domain_intents] Expected 8 active domain intents';
    END IF;

    RAISE NOTICE '[021_domain_intents] Loaded 8 domain business intents; defaults live on commodity category policy tables';
END $seed$;
