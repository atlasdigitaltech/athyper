-- Seeds the 8 canonical domain-level business_intent rows
-- (BI-OPEX/CAPEX/COGS/ADMIN/REG/TRANSFER/REV/DEFREV).
-- Posting, tax, approval, asset, capex defaults live in
-- control.commodity_category_buy_policy / sell_policy — not on business_intent itself.

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid;
    v_pack    text := '021_domain_intents';
    v_version text := '2.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
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
        s.code, -- domain-level roots use code as path
        0,
        s.sort_order,
        s.visibility,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
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
        sort_order  = EXCLUDED.sort_order,
        visibility  = EXCLUDED.visibility,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                         )),
        status      = 'active',
        updated_at  = now(),
        updated_by  = v_su;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND status = 'active') <> 8 THEN
        RAISE EXCEPTION '[021_domain_intents] Expected 8 active domain intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND status = 'active');
    END IF;

    RAISE NOTICE '[021_domain_intents] 8 domain business intents loaded (BI-OPEX/CAPEX/COGS/ADMIN/REG/TRANSFER/REV/DEFREV)';
END $seed$;
