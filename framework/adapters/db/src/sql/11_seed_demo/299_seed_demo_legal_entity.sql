/* ============================================================================
   Athyper v2.1 — Legal Entity, IC Agreements, FX Rates Seed (Blueprint F only)
   Tables: fin.legal_entity, fin.intercompany_agreement, fin.fx_rate
   Dependencies: core.tenant, ref.currency, ref.country

   Blueprint F only (demo_ca):
     4 legal entities: LE-CA (holding), LE-MY, LE-SA, LE-IN (subsidiaries)
     3 IC agreements with transfer pricing
     FX rates (PERIOD_AVG for 2026-01-01)

   Legal entity ↔ OU mapping: each fin.legal_entity.code has a matching
   fin.operating_unit with entity_code = legal_entity.code (canonical link).
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_le_ca  uuid;
    v_le_my  uuid;
    v_le_sa  uuid;
    v_le_in  uuid;
BEGIN
    -- Only Blueprint F (demo_ca)
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca' AND status = 'active';
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'Legal entity seed: demo_ca tenant not found, skipping';
        RETURN;
    END IF;

    -- ====================================================================
    -- Legal Entities (4 rows)
    -- ====================================================================

    -- LE-CA: Canada Holding (Parent)
    INSERT INTO fin.legal_entity (
        id, tenant_id, code, name, country_code,
        functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-CA', 'Athyper Canada Holdings Inc.',
        'CA', 'CAD', 'CAD', 'PARENT', NULL, 'FULL', NULL
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_le_ca;

    -- LE-MY: Malaysia Subsidiary
    INSERT INTO fin.legal_entity (
        id, tenant_id, code, name, country_code,
        functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-MY', 'Athyper Malaysia Sdn Bhd',
        'MY', 'MYR', 'CAD', 'SUBSIDIARY', v_le_ca, 'FULL', 100.00
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_le_my;

    -- LE-SA: Saudi Subsidiary
    INSERT INTO fin.legal_entity (
        id, tenant_id, code, name, country_code,
        functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-SA', 'Athyper Saudi Arabia LLC',
        'SA', 'SAR', 'CAD', 'SUBSIDIARY', v_le_ca, 'FULL', 100.00
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_le_sa;

    -- LE-IN: India Subsidiary
    INSERT INTO fin.legal_entity (
        id, tenant_id, code, name, country_code,
        functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-IN', 'Athyper India Pvt Ltd',
        'IN', 'INR', 'CAD', 'SUBSIDIARY', v_le_ca, 'FULL', 100.00
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_le_in;

    -- ====================================================================
    -- Intercompany Agreements (3 rows)
    -- ====================================================================

    -- LE-MY → LE-SA: Services, COST_PLUS 10%
    INSERT INTO fin.intercompany_agreement (
        id, tenant_id, source_entity_code, dest_entity_code,
        agreement_type, transfer_pricing_method, markup_pct,
        effective_from
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-MY', 'LE-SA',
        'SERVICES', 'COST_PLUS', 10.0000, '2026-01-01'
    )
    ON CONFLICT (tenant_id, source_entity_code, dest_entity_code, agreement_type)
    DO NOTHING;

    -- LE-SA → LE-IN: Goods, CUP
    INSERT INTO fin.intercompany_agreement (
        id, tenant_id, source_entity_code, dest_entity_code,
        agreement_type, transfer_pricing_method, markup_pct,
        effective_from
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-SA', 'LE-IN',
        'GOODS', 'CUP', NULL, '2026-01-01'
    )
    ON CONFLICT (tenant_id, source_entity_code, dest_entity_code, agreement_type)
    DO NOTHING;

    -- LE-MY → LE-IN: Management Fee, COST_PLUS 5%
    INSERT INTO fin.intercompany_agreement (
        id, tenant_id, source_entity_code, dest_entity_code,
        agreement_type, transfer_pricing_method, markup_pct,
        effective_from
    ) VALUES (
        gen_random_uuid(), v_tenant, 'LE-MY', 'LE-IN',
        'MANAGEMENT_FEE', 'COST_PLUS', 5.0000, '2026-01-01'
    )
    ON CONFLICT (tenant_id, source_entity_code, dest_entity_code, agreement_type)
    DO NOTHING;

    -- ====================================================================
    -- FX Rates (PERIOD_AVG, effective 2026-01-01)
    -- Demo-approximate rates
    -- ====================================================================

    -- MYR ↔ CAD
    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'MYR', 'CAD', 'PERIOD_AVG', 0.3050000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'CAD', 'MYR', 'PERIOD_AVG', 3.2787000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    -- SAR ↔ CAD
    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'SAR', 'CAD', 'PERIOD_AVG', 0.3650000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'CAD', 'SAR', 'PERIOD_AVG', 2.7397000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    -- INR ↔ CAD
    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'INR', 'CAD', 'PERIOD_AVG', 0.0163000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'CAD', 'INR', 'PERIOD_AVG', 61.3497000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    -- Cross-rates: MYR ↔ SAR
    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'MYR', 'SAR', 'PERIOD_AVG', 0.8356000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    INSERT INTO fin.fx_rate (id, tenant_id, from_currency, to_currency, rate_type, rate, effective_date, source)
    VALUES (gen_random_uuid(), v_tenant, 'SAR', 'MYR', 'PERIOD_AVG', 1.1968000000, '2026-01-01', 'demo-seed')
    ON CONFLICT (tenant_id, from_currency, to_currency, rate_type, effective_date) DO UPDATE SET rate = EXCLUDED.rate;

    RAISE NOTICE 'Legal entities, IC agreements, and FX rates seeded for demo_ca';
END $$;
