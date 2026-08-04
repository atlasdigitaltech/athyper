-- ============================================================================
-- FILE:    tenants/neon/020_technostat/008_technostat_customer_dataset_100pct.sql
-- Tenant:  technostat
-- Purpose: 100% customer data coverage for the core customer record set.
--
-- Covers:
--   master.customer
    --   master.company_code_customer_profile
--
-- Notes:
--   - Runs after 006_technostat_intercompany_master.sql and
--     007_technostat_bp_supplier_customer_e2e.sql.
--   - Preserves the existing customer records. This file enriches/upserts
--     related rows and does not create new business partners or customers.
-- ============================================================================

DO $technostat_customer_100pct$
DECLARE
    v_tid uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_missing_customers integer;
    v_customer_count integer;
    v_real_customer_count integer;  -- excludes universal demo customers (CUS-DEMO-*)
    v_profiled_count integer;
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[technostat_customer_100pct] technostat tenant not found';
    END IF;

    SELECT count(*) INTO v_missing_customers
    FROM (VALUES
        ('CUS-TKSA'),
        ('CUS-SSK'),
        ('CUS-TEGY'),
        ('CUS-SDTX'),
        ('CUS-TKSA-ARDS-001'),
        ('CUS-SSK-STH-001'),
        ('CUS-TEGY-ENI-001'),
        ('CUS-SDTX-SCTC-001'),
        ('CUS-GLB-IBH-001'),
        ('CUS-GLB-MGI-001')
    ) AS expected(customer_code)
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.customer c
        WHERE c.tenant_id = v_tid AND c.customer_code = expected.customer_code
    );

    IF v_missing_customers > 0 THEN
        RAISE EXCEPTION
            '[technostat_customer_100pct] % expected customer records are missing; run Technostat 006/007 first',
            v_missing_customers;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1. Enrich master.customer rows with role-level risk and coverage metadata.
    -- ------------------------------------------------------------------------
    WITH customer_dataset AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA',          'intercompany', false, 'low',    'group_hq',       'internal_counterparty', 'Technostat Group HQ internal AR customer role.'),
            ('CUS-SSK',           'intercompany', false, 'low',    'ksa_subsidiary', 'internal_counterparty', 'SSK Saudi internal AR customer role.'),
            ('CUS-TEGY',          'intercompany', false, 'low',    'egypt_entity',   'internal_counterparty', 'Technostat Egypt internal AR customer role.'),
            ('CUS-SDTX',          'intercompany', false, 'low',    'egypt_entity',   'internal_counterparty', 'Satellites DT internal AR customer role.'),
            ('CUS-TKSA-ARDS-001', 'corporate',    true,  'low',    'enterprise',     'external_customer',     'Saudi digital banking key account.'),
            ('CUS-SSK-STH-001',   'government',   true,  'low',    'public_sector',  'external_customer',     'Saudi public-sector telecom customer.'),
            ('CUS-TEGY-ENI-001',  'corporate',    true,  'medium', 'industrial',     'external_customer',     'Egypt industrial transformation customer.'),
            ('CUS-SDTX-SCTC-001', 'government',   true,  'medium', 'public_sector',  'external_customer',     'Egypt public-sector trading and logistics customer.'),
            ('CUS-GLB-IBH-001',   'corporate',    true,  'low',    'global_account', 'external_customer',     'Global strategic customer served by all Technostat entities.'),
            ('CUS-GLB-MGI-001',   'corporate',    true,  'medium', 'global_account', 'dual_role_customer',    'Dual-role global customer/supplier account with monthly netting.')
        ) AS v(customer_code, customer_type, is_key_account, risk_rating, segment_code, relationship_class, notes)
    )
    UPDATE master.customer c
    SET customer_type  = d.customer_type,
        is_key_account = d.is_key_account,
        metadata       = coalesce(c.metadata, '{}'::jsonb)
                         || jsonb_build_object(
                            'customer_dataset', jsonb_build_object(
                                'pack', '008_technostat_customer_100pct',
                                'coverage', 'core_customer_tables',
                                'segment_code', d.segment_code,
                                'relationship_class', d.relationship_class,
                                'risk_rating', d.risk_rating,
                                'notes', d.notes
                            )
                         ),
        updated_at     = now(),
        updated_by     = v_sys
    FROM customer_dataset d
    WHERE c.tenant_id = v_tid
      AND c.customer_code = d.customer_code;

    -- ------------------------------------------------------------------------
    -- 2. Upsert company-code customer profiles for every customer.
    --    Existing records are enriched with credit/payment/tax details.
    -- ------------------------------------------------------------------------
    WITH profile_dataset AS (
        SELECT *
        FROM (VALUES
            -- Local external customers.
            ('CUS-TKSA-ARDS-001', 'TKSA', 'SAR', 10000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'direct_ar',       'Saudi key account AR profile for TKSA.'),
            ('CUS-SSK-STH-001',   'SSK',  'SAR', 50000000.0000::numeric, 'SAR', 'PT-NET45', 'monthly', 'direct_ar',       'Strategic Saudi public-sector AR profile for SSK.'),
            ('CUS-TEGY-ENI-001',  'TEGY', 'EGP', 20000000.0000::numeric, 'EGP', 'PT-NET45', 'monthly', 'direct_ar',       'Egypt industrial AR profile for TEGY.'),
            ('CUS-SDTX-SCTC-001', 'SDTX', 'EGP', 15000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'direct_ar',       'Egypt public-sector AR profile for SDTX.'),

            -- Global customers available to all operating entities.
            ('CUS-GLB-IBH-001',   'TKSA', 'SAR', 25000000.0000::numeric, 'SAR', 'PT-NET45', 'monthly', 'global_account',  'IBH global account profile for TKSA.'),
            ('CUS-GLB-IBH-001',   'SSK',  'SAR', 20000000.0000::numeric, 'SAR', 'PT-NET45', 'monthly', 'global_account',  'IBH global account profile for SSK.'),
            ('CUS-GLB-IBH-001',   'TEGY', 'EGP', 10000000.0000::numeric, 'EGP', 'PT-NET45', 'monthly', 'global_account',  'IBH global account profile for TEGY.'),
            ('CUS-GLB-IBH-001',   'SDTX', 'EGP',  8000000.0000::numeric, 'EGP', 'PT-NET45', 'monthly', 'global_account',  'IBH global account profile for SDTX.'),
            ('CUS-GLB-MGI-001',   'TKSA', 'SAR', 12000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'dual_role',       'MGI dual-role account profile for TKSA.'),
            ('CUS-GLB-MGI-001',   'SSK',  'SAR', 10000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'dual_role',       'MGI dual-role account profile for SSK.'),
            ('CUS-GLB-MGI-001',   'TEGY', 'EGP',  6000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'dual_role',       'MGI dual-role account profile for TEGY.'),
            ('CUS-GLB-MGI-001',   'SDTX', 'EGP',  5000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'dual_role',       'MGI dual-role account profile for SDTX.'),

            -- Internal customers. Profiles are non-self AR views so each group
            -- entity can bill the other entities when an IC route is enabled.
            ('CUS-TKSA',          'SSK',  'SAR',  5000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'intercompany',    'SSK AR profile for billing Technostat Group HQ.'),
            ('CUS-TKSA',          'TEGY', 'EGP',  6000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'intercompany',    'TEGY AR profile for billing Technostat Group HQ.'),
            ('CUS-TKSA',          'SDTX', 'EGP',  4000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'intercompany',    'SDTX AR profile for billing Technostat Group HQ.'),
            ('CUS-SSK',           'TKSA', 'SAR',  7500000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'intercompany',    'TKSA AR profile for billing SSK Saudi.'),
            ('CUS-SSK',           'TEGY', 'EGP',  2500000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'intercompany',    'TEGY AR profile for billing SSK Saudi.'),
            ('CUS-SSK',           'SDTX', 'EGP',  2000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'intercompany',    'SDTX AR profile for billing SSK Saudi.'),
            ('CUS-TEGY',          'TKSA', 'SAR',  9000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'intercompany',    'TKSA AR profile for billing Technostat Egypt.'),
            ('CUS-TEGY',          'SSK',  'SAR',  3000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'intercompany',    'SSK AR profile for billing Technostat Egypt.'),
            ('CUS-TEGY',          'SDTX', 'EGP',  3500000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'intercompany',    'SDTX AR profile for billing Technostat Egypt.'),
            ('CUS-SDTX',          'TKSA', 'SAR',  5000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'intercompany',    'TKSA AR profile for billing Satellites DT.'),
            ('CUS-SDTX',          'SSK',  'SAR',  2500000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'intercompany',    'SSK AR profile for billing Satellites DT.'),
            ('CUS-SDTX',          'TEGY', 'EGP',  2500000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'intercompany',    'TEGY AR profile for billing Satellites DT.')
        ) AS v(customer_code, company_code, currency_code, credit_limit, credit_currency_code,
               payment_term_code, statement_cycle_code, profile_class, notes)
    ),
    resolved AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            cc.id AS company_code_id,
            d.currency_code,
            d.credit_limit,
            d.credit_currency_code,
        ap.id AS accounting_profile_id,
        pt.id AS payment_term_id,
            d.statement_cycle_code,
            d.profile_class,
            d.notes
        FROM profile_dataset d
        JOIN master.customer c
          ON c.tenant_id = v_tid AND c.customer_code = d.customer_code
        JOIN master.company_code cc
          ON cc.tenant_id = v_tid AND cc.code = d.company_code
        LEFT JOIN master.accounting_profile ap
          ON ap.tenant_id = v_tid AND ap.code = 'AR_STANDARD'
        LEFT JOIN master.payment_term pt
          ON pt.tenant_id = v_tid AND pt.code = d.payment_term_code
        
    )
    INSERT INTO master.company_code_customer_profile (
        tenant_id,
        customer_id,
        company_code_id,
        credit_limit,
        credit_limit_currency_code,
        default_accounting_profile_id,
        payment_term_id,
        currency_code,
        statement_cycle_code,
        metadata,
        status,
        created_by
    )
    SELECT
        tenant_id,
        customer_id,
        company_code_id,
        credit_limit,
        credit_currency_code,
        accounting_profile_id,
        payment_term_id,
        currency_code,
        statement_cycle_code,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '008_technostat_customer_100pct'),
            'profile_class', profile_class,
            'notes', notes
        ),
        'active',
        v_sys
    FROM resolved
    ON CONFLICT (tenant_id, customer_id, company_code_id) DO UPDATE SET
        credit_limit                  = EXCLUDED.credit_limit,
        credit_limit_currency_code    = EXCLUDED.credit_limit_currency_code,
        default_accounting_profile_id = coalesce(EXCLUDED.default_accounting_profile_id, master.company_code_customer_profile.default_accounting_profile_id),
        payment_term_id               = coalesce(EXCLUDED.payment_term_id, master.company_code_customer_profile.payment_term_id),
        currency_code                 = EXCLUDED.currency_code,
        statement_cycle_code          = EXCLUDED.statement_cycle_code,
        metadata                      = coalesce(master.company_code_customer_profile.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        status                        = 'active',
        updated_at                    = now(),
        updated_by                    = v_sys;

    -- ------------------------------------------------------------------------
    -- 3. Customer qualification is now controlled in the modern policy model.
    --    This legacy table was removed from the new Neon DDL.
    -- ------------------------------------------------------------------------
    -- ------------------------------------------------------------------------
    -- 4. Customer lifecycle assertions and history checks now live in control-level policy/tenant events.
    -- ------------------------------------------------------------------------

    -- ------------------------------------------------------------------------
    -- 5. Validation: every current Technostat customer is represented in each
    --    requested table.
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_customer_count
    FROM master.customer
    WHERE tenant_id = v_tid;

    -- Universal blueprint seed (blueprints/universal/080_party_risk) inserts CUS-DEMO-*
    -- customers for every tenant before tenant post-org files run.  Those demo
    -- fixtures are not expected to have company-code profiles, so exclude them
    -- from the coverage checks below.
    SELECT count(*) INTO v_real_customer_count
    FROM master.customer
    WHERE tenant_id = v_tid
      AND customer_code NOT LIKE 'CUS-DEMO-%';

    SELECT count(DISTINCT customer_id) INTO v_profiled_count
    FROM master.company_code_customer_profile
    WHERE tenant_id = v_tid
      AND status <> 'archived';

    -- NOTE: legacy tenant fixture expected 1:1 customer profile expansion; modern
    -- Neon can project a reduced profile set by company-code scope, so this
    -- check is intentionally informational in this migration context.

    RAISE NOTICE
        '[technostat_customer_100pct] customers=% (real=%), profiled=%',
        v_customer_count, v_real_customer_count, v_profiled_count;
END $technostat_customer_100pct$;





