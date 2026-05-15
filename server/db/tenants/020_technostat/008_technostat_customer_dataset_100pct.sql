-- ============================================================================
-- FILE:    040_tenants/020_technostat/008_technostat_customer_dataset_100pct.sql
-- Tenant:  technostat
-- Purpose: 100% customer data coverage for the core customer record set.
--
-- Covers:
--   master.customer
--   master.customer_app_index
--   master.company_code_customer_profile
--   master.customer_block
--   master.customer_qualification
--
-- Notes:
--   - Runs after 006_technostat_intercompany_master.sql and
--     007_technostat_bp_supplier_customer_e2e.sql.
--   - Preserves the existing customer records. This file enriches/upserts
--     related rows and does not create new business partners or customers.
--   - customer_block rows are historical/lifted rows, so no customer becomes
--     actively blocked by this dataset.
-- ============================================================================

DO $technostat_customer_100pct$
DECLARE
    v_tid uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_missing_customers integer;
    v_customer_count integer;
    v_real_customer_count integer;  -- excludes universal demo customers (CUS-DEMO-*)
    v_index_count integer;
    v_profiled_count integer;
    v_qualified_count integer;
    v_block_history_count integer;
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
        risk_rating    = d.risk_rating,
        metadata       = coalesce(c.metadata, '{}'::jsonb)
                         || jsonb_build_object(
                            'customer_dataset', jsonb_build_object(
                                'pack', '008_technostat_customer_100pct',
                                'coverage', 'core_customer_tables',
                                'segment_code', d.segment_code,
                                'relationship_class', d.relationship_class,
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
            ('CUS-TKSA-ARDS-001', 'TKSA', 'SAR', 10000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'direct_ar',       'Saudi key account AR profile for TKSA.'),
            ('CUS-SSK-STH-001',   'SSK',  'SAR', 50000000.0000::numeric, 'SAR', 'aaa', 'PT-NET45', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'direct_ar',       'Strategic Saudi public-sector AR profile for SSK.'),
            ('CUS-TEGY-ENI-001',  'TEGY', 'EGP', 20000000.0000::numeric, 'EGP', 'a',   'PT-NET45', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'direct_ar',       'Egypt industrial AR profile for TEGY.'),
            ('CUS-SDTX-SCTC-001', 'SDTX', 'EGP', 15000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'direct_ar',       'Egypt public-sector AR profile for SDTX.'),

            -- Global customers available to all operating entities.
            ('CUS-GLB-IBH-001',   'TKSA', 'SAR', 25000000.0000::numeric, 'SAR', 'aa',  'PT-NET45', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'global_account',  'IBH global account profile for TKSA.'),
            ('CUS-GLB-IBH-001',   'SSK',  'SAR', 20000000.0000::numeric, 'SAR', 'aa',  'PT-NET45', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'global_account',  'IBH global account profile for SSK.'),
            ('CUS-GLB-IBH-001',   'TEGY', 'EGP', 10000000.0000::numeric, 'EGP', 'aa',  'PT-NET45', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'global_account',  'IBH global account profile for TEGY.'),
            ('CUS-GLB-IBH-001',   'SDTX', 'EGP',  8000000.0000::numeric, 'EGP', 'aa',  'PT-NET45', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'global_account',  'IBH global account profile for SDTX.'),
            ('CUS-GLB-MGI-001',   'TKSA', 'SAR', 12000000.0000::numeric, 'SAR', 'a',   'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'dual_role',       'MGI dual-role account profile for TKSA.'),
            ('CUS-GLB-MGI-001',   'SSK',  'SAR', 10000000.0000::numeric, 'SAR', 'a',   'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'dual_role',       'MGI dual-role account profile for SSK.'),
            ('CUS-GLB-MGI-001',   'TEGY', 'EGP',  6000000.0000::numeric, 'EGP', 'a',   'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'dual_role',       'MGI dual-role account profile for TEGY.'),
            ('CUS-GLB-MGI-001',   'SDTX', 'EGP',  5000000.0000::numeric, 'EGP', 'a',   'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'dual_role',       'MGI dual-role account profile for SDTX.'),

            -- Internal customers. Profiles are non-self AR views so each group
            -- entity can bill the other entities when an IC route is enabled.
            ('CUS-TKSA',          'SSK',  'SAR',  5000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',    'SSK AR profile for billing Technostat Group HQ.'),
            ('CUS-TKSA',          'TEGY', 'EGP',  6000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',    'TEGY AR profile for billing Technostat Group HQ.'),
            ('CUS-TKSA',          'SDTX', 'EGP',  4000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',    'SDTX AR profile for billing Technostat Group HQ.'),
            ('CUS-SSK',           'TKSA', 'SAR',  7500000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',    'TKSA AR profile for billing SSK Saudi.'),
            ('CUS-SSK',           'TEGY', 'EGP',  2500000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',    'TEGY AR profile for billing SSK Saudi.'),
            ('CUS-SSK',           'SDTX', 'EGP',  2000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',    'SDTX AR profile for billing SSK Saudi.'),
            ('CUS-TEGY',          'TKSA', 'SAR',  9000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',    'TKSA AR profile for billing Technostat Egypt.'),
            ('CUS-TEGY',          'SSK',  'SAR',  3000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',    'SSK AR profile for billing Technostat Egypt.'),
            ('CUS-TEGY',          'SDTX', 'EGP',  3500000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',    'SDTX AR profile for billing Technostat Egypt.'),
            ('CUS-SDTX',          'TKSA', 'SAR',  5000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',    'TKSA AR profile for billing Satellites DT.'),
            ('CUS-SDTX',          'SSK',  'SAR',  2500000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',    'SSK AR profile for billing Satellites DT.'),
            ('CUS-SDTX',          'TEGY', 'EGP',  2500000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',    'TEGY AR profile for billing Satellites DT.')
        ) AS v(customer_code, company_code, currency_code, credit_limit, credit_currency_code,
               credit_rating, payment_term_code, receipt_method_code, tax_group_code,
               statement_cycle_code, profile_class, notes)
    ),
    resolved AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            cc.id AS company_code_id,
            d.currency_code,
            d.credit_limit,
            d.credit_currency_code,
            d.credit_rating,
            ap.id AS accounting_profile_id,
            pm.id AS receipt_method_id,
            pt.id AS payment_term_id,
            tg.id AS tax_group_id,
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
        LEFT JOIN master.payment_method pm
          ON pm.tenant_id = v_tid AND pm.code = d.receipt_method_code
        LEFT JOIN master.payment_term pt
          ON pt.tenant_id = v_tid AND pt.code = d.payment_term_code
        LEFT JOIN control.tax_group tg
          ON tg.tenant_id = v_tid AND tg.code = d.tax_group_code
    )
    INSERT INTO master.company_code_customer_profile (
        tenant_id,
        customer_id,
        company_code_id,
        credit_limit,
        credit_limit_currency_code,
        credit_rating,
        is_blocked,
        block_reason,
        default_accounting_profile_id,
        default_receipt_method_id,
        tax_group_id,
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
        credit_rating,
        false,
        NULL,
        accounting_profile_id,
        receipt_method_id,
        tax_group_id,
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
        credit_rating                 = EXCLUDED.credit_rating,
        is_blocked                    = false,
        block_reason                  = NULL,
        default_accounting_profile_id = coalesce(EXCLUDED.default_accounting_profile_id, master.company_code_customer_profile.default_accounting_profile_id),
        default_receipt_method_id     = coalesce(EXCLUDED.default_receipt_method_id, master.company_code_customer_profile.default_receipt_method_id),
        tax_group_id                  = coalesce(EXCLUDED.tax_group_id, master.company_code_customer_profile.tax_group_id),
        payment_term_id               = coalesce(EXCLUDED.payment_term_id, master.company_code_customer_profile.payment_term_id),
        currency_code                 = EXCLUDED.currency_code,
        statement_cycle_code          = EXCLUDED.statement_cycle_code,
        metadata                      = coalesce(master.company_code_customer_profile.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        status                        = 'active',
        updated_at                    = now(),
        updated_by                    = v_sys;

    -- ------------------------------------------------------------------------
    -- 3. Upsert one qualification row for every customer.
    -- ------------------------------------------------------------------------
    WITH qualification_dataset AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA',          'approved', 'ic_0_10m',     930, 'aa',  0,  'excellent', false, 'passed', 'clear', 'passed', '2025-01-05'::date, '2027-01-04'::date, false, true,  'Intercompany netting; dunning handled by group settlement.', '2025-01-05'::date, '2026-01-05'::date, 'HQ internal customer role cleared for group AR settlement.'),
            ('CUS-SSK',           'approved', 'ic_0_10m',     910, 'aa',  4,  'excellent', false, 'passed', 'clear', 'passed', '2025-01-05'::date, '2027-01-04'::date, false, true,  'Intercompany netting; dunning handled by group settlement.', '2025-01-05'::date, '2026-01-05'::date, 'SSK internal customer role cleared for group AR settlement.'),
            ('CUS-TEGY',          'approved', 'ic_0_10m',     900, 'aa',  6,  'good',      false, 'passed', 'clear', 'passed', '2025-01-05'::date, '2027-01-04'::date, false, true,  'Intercompany netting; dunning handled by group settlement.', '2025-01-05'::date, '2026-01-05'::date, 'TEGY internal customer role cleared for group AR settlement.'),
            ('CUS-SDTX',          'approved', 'ic_0_10m',     895, 'aa',  7,  'good',      false, 'passed', 'clear', 'passed', '2025-01-05'::date, '2027-01-04'::date, false, true,  'Intercompany netting; dunning handled by group settlement.', '2025-01-05'::date, '2026-01-05'::date, 'SDTX internal customer role cleared for group AR settlement.'),
            ('CUS-TKSA-ARDS-001', 'approved', 'sar_5m_50m',   890, 'aa',  22, 'excellent', false, 'passed', 'clear', 'passed', '2025-02-15'::date, '2027-02-14'::date, true,  true,  NULL,                                                        '2025-02-15'::date, '2026-02-15'::date, 'Excellent payment history and top-tier KSA banking group ownership.'),
            ('CUS-SSK-STH-001',   'approved', 'sar_50m_plus', 950, 'aaa', 28, 'good',      false, 'passed', 'clear', 'passed', '2025-01-30'::date, '2027-01-29'::date, true,  true,  NULL,                                                        '2025-01-30'::date, '2026-01-30'::date, 'Government-backed telecom customer with high approved credit limit.'),
            ('CUS-TEGY-ENI-001',  'approved', 'egp_10m_50m',  800, 'a',   35, 'good',      false, 'passed', 'clear', 'passed', '2025-01-20'::date, '2027-01-19'::date, true,  true,  NULL,                                                        '2025-01-20'::date, '2026-01-20'::date, 'Large industrial group with annual review cycle.'),
            ('CUS-SDTX-SCTC-001', 'approved', 'egp_10m_50m',  830, 'aa',  31, 'good',      false, 'passed', 'clear', 'passed', '2025-02-01'::date, '2027-01-31'::date, true,  true,  NULL,                                                        '2025-02-01'::date, '2026-02-01'::date, 'Public-sector trading customer with clean payment record.'),
            ('CUS-GLB-IBH-001',   'approved', 'multi_cc_key', 920, 'aa',  18, 'excellent', false, 'passed', 'clear', 'passed', '2025-03-01'::date, '2027-02-28'::date, true,  true,  NULL,                                                        '2025-03-01'::date, '2026-03-01'::date, 'Global strategic account approved across all Technostat company codes.'),
            ('CUS-GLB-MGI-001',   'approved', 'multi_cc_dual',860, 'a',   27, 'good',      false, 'passed', 'clear', 'passed', '2025-03-10'::date, '2027-03-09'::date, true,  true,  NULL,                                                        '2025-03-10'::date, '2026-03-10'::date, 'Dual-role account approved with monthly netting controls.')
        ) AS v(customer_code, credit_status, credit_limit_band, credit_score, credit_rating,
               dso_days, payment_behavior, has_overdue_history, kyc_status,
               aml_sanctions_status, beneficial_owner_check_status, kyc_check_date,
               kyc_expiry_date, is_dunning_eligible, is_statement_eligible,
               dunning_hold_reason, last_credit_review_date, next_credit_review_date,
               credit_notes)
    ),
    resolved AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            d.*
        FROM qualification_dataset d
        JOIN master.customer c
          ON c.tenant_id = v_tid AND c.customer_code = d.customer_code
    )
    INSERT INTO master.customer_qualification (
        tenant_id,
        customer_id,
        credit_status,
        credit_limit_band,
        credit_score,
        credit_rating,
        dso_days,
        payment_behavior,
        has_overdue_history,
        kyc_status,
        aml_sanctions_status,
        beneficial_owner_check_status,
        kyc_check_date,
        kyc_expiry_date,
        is_dunning_eligible,
        is_statement_eligible,
        dunning_hold_reason,
        last_credit_review_date,
        next_credit_review_date,
        reviewer_id,
        metadata,
        status,
        created_by
    )
    SELECT
        tenant_id,
        customer_id,
        credit_status,
        credit_limit_band,
        credit_score,
        credit_rating,
        dso_days,
        payment_behavior,
        has_overdue_history,
        kyc_status,
        aml_sanctions_status,
        beneficial_owner_check_status,
        kyc_check_date,
        kyc_expiry_date,
        is_dunning_eligible,
        is_statement_eligible,
        dunning_hold_reason,
        last_credit_review_date,
        next_credit_review_date,
        v_sys,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '008_technostat_customer_100pct'),
            'credit_notes', credit_notes
        ),
        'active',
        v_sys
    FROM resolved
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        credit_status                  = EXCLUDED.credit_status,
        credit_limit_band              = EXCLUDED.credit_limit_band,
        credit_score                   = EXCLUDED.credit_score,
        credit_rating                  = EXCLUDED.credit_rating,
        dso_days                       = EXCLUDED.dso_days,
        payment_behavior               = EXCLUDED.payment_behavior,
        has_overdue_history            = EXCLUDED.has_overdue_history,
        kyc_status                     = EXCLUDED.kyc_status,
        aml_sanctions_status           = EXCLUDED.aml_sanctions_status,
        beneficial_owner_check_status  = EXCLUDED.beneficial_owner_check_status,
        kyc_check_date                 = EXCLUDED.kyc_check_date,
        kyc_expiry_date                = EXCLUDED.kyc_expiry_date,
        is_dunning_eligible            = EXCLUDED.is_dunning_eligible,
        is_statement_eligible          = EXCLUDED.is_statement_eligible,
        dunning_hold_reason            = EXCLUDED.dunning_hold_reason,
        last_credit_review_date        = EXCLUDED.last_credit_review_date,
        next_credit_review_date        = EXCLUDED.next_credit_review_date,
        reviewer_id                    = EXCLUDED.reviewer_id,
        metadata                       = coalesce(master.customer_qualification.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        status                         = 'active',
        updated_at                     = now(),
        updated_by                     = v_sys;

    -- ------------------------------------------------------------------------
    -- 4. Insert lifted customer_block history rows for every customer.
    --    These rows prove block lifecycle coverage without creating active holds.
    -- ------------------------------------------------------------------------
    WITH block_dataset AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA',          'invoice',    'Intercompany AR role pending 2025 settlement activation review.', '2025-01-05 09:00+03'::timestamptz, '2025-01-05 11:00+03'::timestamptz, 'Internal customer role approved for group settlement.', 'Routine intercompany onboarding control.'),
            ('CUS-SSK',           'invoice',    'Intercompany AR role pending 2025 settlement activation review.', '2025-01-05 09:05+03'::timestamptz, '2025-01-05 11:05+03'::timestamptz, 'Internal customer role approved for group settlement.', 'Routine intercompany onboarding control.'),
            ('CUS-TEGY',          'invoice',    'Intercompany AR role pending 2025 settlement activation review.', '2025-01-05 08:10+02'::timestamptz, '2025-01-05 10:10+02'::timestamptz, 'Internal customer role approved for group settlement.', 'Routine intercompany onboarding control.'),
            ('CUS-SDTX',          'invoice',    'Intercompany AR role pending 2025 settlement activation review.', '2025-01-05 08:15+02'::timestamptz, '2025-01-05 10:15+02'::timestamptz, 'Internal customer role approved for group settlement.', 'Routine intercompany onboarding control.'),
            ('CUS-TKSA-ARDS-001', 'credit',     'Initial credit committee approval hold.',                           '2025-02-14 09:00+03'::timestamptz, '2025-02-15 09:30+03'::timestamptz, 'Credit committee approved SAR 10M limit.',             'Customer activated after bank group ownership validation.'),
            ('CUS-SSK-STH-001',   'credit',     'Large public-sector credit limit pending executive approval.',       '2025-01-29 10:00+03'::timestamptz, '2025-01-30 10:30+03'::timestamptz, 'Executive credit approval completed.',                 'High-limit government customer review.'),
            ('CUS-TEGY-ENI-001',  'collection', 'AR onboarding temporarily held pending tax registration validation.', '2025-01-19 08:30+02'::timestamptz, '2025-01-20 09:00+02'::timestamptz, 'Egypt VAT registration validated.',                    'Manufacturing customer onboarding control.'),
            ('CUS-SDTX-SCTC-001', 'collection', 'AR onboarding temporarily held pending public-sector due diligence.', '2025-01-31 08:45+02'::timestamptz, '2025-02-01 09:15+02'::timestamptz, 'Public-sector due diligence completed.',                'Government trading customer onboarding control.'),
            ('CUS-GLB-IBH-001',   'credit',     'Cross-company-code credit exposure review hold.',                    '2025-02-28 09:00+03'::timestamptz, '2025-03-01 09:00+03'::timestamptz, 'Global credit exposure approved across entities.',      'Strategic global account annual review.'),
            ('CUS-GLB-MGI-001',   'credit',     'Dual-role netting controls pending treasury sign-off.',              '2025-03-09 09:00+03'::timestamptz, '2025-03-10 09:00+03'::timestamptz, 'Treasury approved monthly netting controls.',          'Dual-role account control review.')
        ) AS v(customer_code, block_type, block_reason, blocked_at, lifted_at, lift_reason, notes)
    ),
    resolved AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            d.*
        FROM block_dataset d
        JOIN master.customer c
          ON c.tenant_id = v_tid AND c.customer_code = d.customer_code
    )
    INSERT INTO master.customer_block (
        tenant_id,
        customer_id,
        block_type,
        block_reason,
        blocked_at,
        blocked_by,
        lifted_at,
        lifted_by,
        lift_reason,
        notes,
        metadata,
        status,
        status_changed_at,
        status_changed_by,
        created_by
    )
    SELECT
        tenant_id,
        customer_id,
        block_type,
        block_reason,
        blocked_at,
        v_sys,
        lifted_at,
        v_sys,
        lift_reason,
        notes,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '008_technostat_customer_100pct'),
            'customer_code', customer_code
        ),
        'lifted',
        lifted_at,
        v_sys,
        v_sys
    FROM resolved r
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.customer_block cb
        WHERE cb.tenant_id = r.tenant_id
          AND cb.customer_id = r.customer_id
          AND cb.metadata -> '_seed' ->> 'pack' = '008_technostat_customer_100pct'
    );

    -- ------------------------------------------------------------------------
    -- 5. Resync customer_app_index for all Technostat customers.
    -- ------------------------------------------------------------------------
    DELETE FROM master.customer_app_index i
    WHERE i.tenant_id = v_tid
      AND NOT EXISTS (
          SELECT 1
          FROM master.customer c
          WHERE c.tenant_id = i.tenant_id AND c.id = i.customer_id
      );

    INSERT INTO master.customer_app_index (
        id,
        tenant_id,
        customer_id,
        business_partner_id,
        customer_code,
        customer_type,
        customer_status,
        is_key_account,
        risk_rating,
        business_partner_code,
        name,
        display_name,
        legal_name,
        legal_form,
        registration_no,
        registration_country_code,
        aliases,
        business_types,
        search_text,
        updated_at
    )
    SELECT
        c.id,
        c.tenant_id,
        c.id,
        c.business_partner_id,
        c.customer_code,
        c.customer_type,
        c.status,
        coalesce(c.is_key_account, false),
        c.risk_rating,
        bp.code,
        bp.name,
        coalesce(bp.display_name, bp.name),
        bp.legal_name,
        bp.legal_form,
        bp.registration_no,
        bp.registration_country_code,
        bp.aliases,
        coalesce(bp.business_types, '{}'),
        lower(
            coalesce(c.customer_code, '')                        || ' ' ||
            coalesce(bp.code, '')                                || ' ' ||
            coalesce(bp.name, '')                                || ' ' ||
            coalesce(bp.display_name, '')                        || ' ' ||
            coalesce(bp.legal_name, '')                          || ' ' ||
            coalesce(bp.registration_no, '')                     || ' ' ||
            coalesce(array_to_string(bp.aliases, ' '), '')       || ' ' ||
            coalesce(array_to_string(bp.business_types, ' '), '')
        ),
        now()
    FROM master.customer c
    JOIN master.business_partner bp
      ON bp.tenant_id = c.tenant_id AND bp.id = c.business_partner_id
    WHERE c.tenant_id = v_tid
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        id                        = EXCLUDED.id,
        business_partner_id       = EXCLUDED.business_partner_id,
        customer_code             = EXCLUDED.customer_code,
        customer_type             = EXCLUDED.customer_type,
        customer_status           = EXCLUDED.customer_status,
        is_key_account            = EXCLUDED.is_key_account,
        risk_rating               = EXCLUDED.risk_rating,
        business_partner_code     = EXCLUDED.business_partner_code,
        name                      = EXCLUDED.name,
        display_name              = EXCLUDED.display_name,
        legal_name                = EXCLUDED.legal_name,
        legal_form                = EXCLUDED.legal_form,
        registration_no           = EXCLUDED.registration_no,
        registration_country_code = EXCLUDED.registration_country_code,
        aliases                   = EXCLUDED.aliases,
        business_types            = EXCLUDED.business_types,
        search_text               = EXCLUDED.search_text,
        updated_at                = now();

    -- ------------------------------------------------------------------------
    -- 6. Validation: every current Technostat customer is represented in each
    --    requested table. customer_block requires a history row, not active hold.
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_customer_count
    FROM master.customer
    WHERE tenant_id = v_tid;

    -- Universal blueprint seed (020_universal/080_party_risk) inserts CUS-DEMO-*
    -- customers for every tenant before tenant post-org files run.  Those demo
    -- fixtures are not expected to have company-code profiles, qualifications, or
    -- block history rows, so exclude them from the coverage checks below.
    SELECT count(*) INTO v_real_customer_count
    FROM master.customer
    WHERE tenant_id = v_tid
      AND customer_code NOT LIKE 'CUS-DEMO-%';

    SELECT count(DISTINCT customer_id) INTO v_index_count
    FROM master.customer_app_index
    WHERE tenant_id = v_tid;

    SELECT count(DISTINCT customer_id) INTO v_profiled_count
    FROM master.company_code_customer_profile
    WHERE tenant_id = v_tid
      AND status <> 'archived';

    SELECT count(DISTINCT customer_id) INTO v_qualified_count
    FROM master.customer_qualification
    WHERE tenant_id = v_tid
      AND status = 'active';

    SELECT count(DISTINCT customer_id) INTO v_block_history_count
    FROM master.customer_block
    WHERE tenant_id = v_tid
      AND metadata -> '_seed' ->> 'pack' = '008_technostat_customer_100pct';

    IF v_index_count <> v_customer_count THEN
        RAISE EXCEPTION '[technostat_customer_100pct] customer_app_index coverage %/%',
            v_index_count, v_customer_count;
    END IF;

    IF v_profiled_count <> v_real_customer_count THEN
        RAISE EXCEPTION '[technostat_customer_100pct] company_code_customer_profile coverage %/%',
            v_profiled_count, v_real_customer_count;
    END IF;

    IF v_qualified_count <> v_real_customer_count THEN
        RAISE EXCEPTION '[technostat_customer_100pct] customer_qualification coverage %/%',
            v_qualified_count, v_real_customer_count;
    END IF;

    IF v_block_history_count <> v_real_customer_count THEN
        RAISE EXCEPTION '[technostat_customer_100pct] customer_block history coverage %/%',
            v_block_history_count, v_real_customer_count;
    END IF;

    RAISE NOTICE
        '[technostat_customer_100pct] customers=% (real=%), app_index=%, profiled=%, qualified=%, block_history=%',
        v_customer_count, v_real_customer_count, v_index_count, v_profiled_count, v_qualified_count, v_block_history_count;
END $technostat_customer_100pct$;
