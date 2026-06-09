-- ============================================================================
-- FILE:    tenants/neon/020_technostat/013_technostat_customer_search_repair.sql
-- Purpose: Repair the customer chooser/list seed surface when schema_provisions
--          says the large Technostat BP/customer seed files ran, but the tenant
--          customer rows were later dropped or truncated.
--
-- Mirrors 012_technostat_supplier_search_repair.sql, but reuses orphaned
-- customer_block customer_id values when present so qualification/block history
-- is reattached instead of duplicated.
-- ============================================================================

DO $technostat_customer_search_repair$
DECLARE
    v_tid uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_customer_count integer;
    v_index_count integer;
    v_profile_count integer;
BEGIN
    SELECT id INTO v_tid
      FROM master.tenant
     WHERE realm_key = 'athyper' AND code = 'technostat'
       AND realm_key = 'athyper'
     LIMIT 1;

    IF v_tid IS NULL THEN
        RAISE NOTICE '[technostat_customer_search_repair] technostat tenant not found; skipping';
        RETURN;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1. Restore the fixed internal BP identities referenced by IC links.
    -- ------------------------------------------------------------------------
    WITH internal_bp_seed (
        id,
        bp_code,
        name,
        display_name,
        legal_name,
        country_code,
        legal_form,
        aliases,
        business_types
    ) AS (
        VALUES
            ('dd002000-0000-0000-0000-000000000001'::uuid, 'BP-TKSA',
             'Technostat Group HQ', 'Technostat Group',
             'Technostat Group Holdings Co.', 'SA', 'private_limited',
             ARRAY['Technostat Group','TKSA'], ARRAY['internal','intercompany']),
            ('dd002000-0000-0000-0000-000000000002'::uuid, 'BP-SSK',
             'SSK Saudi', 'SSK Saudi',
             'SSK Saudi Co. for Construction W.L.L.', 'SA', 'private_limited',
             ARRAY['SSK','SSK Saudi'], ARRAY['internal','intercompany']),
            ('dd002000-0000-0000-0000-000000000003'::uuid, 'BP-TEGY',
             'Technostat Egypt', 'Technostat Egypt',
             'Technostat Egypt for Trading S.A.E.', 'EG', 'private_limited',
             ARRAY['Technostat Egypt','TEGY'], ARRAY['internal','intercompany']),
            ('dd002000-0000-0000-0000-000000000004'::uuid, 'BP-SDTX',
             'Satellites DT', 'Satellites for Digital Transformation',
             'Satellites for Digital Transformation S.A.E.', 'EG', 'private_limited',
             ARRAY['Satellites DT','SDTX'], ARRAY['internal','intercompany'])
    )
    INSERT INTO master.business_partner (
        id,
        tenant_id,
        code,
        name,
        display_name,
        legal_name,
        partner_category,
        registration_country_code,
        tax_residence_country_code,
        legal_form,
        aliases,
        business_types,
        metadata,
        status,
        created_by,
        updated_by,
        updated_at
    )
    SELECT
        s.id,
        v_tid,
        s.bp_code,
        s.name,
        s.display_name,
        s.legal_name,
        'internal',
        s.country_code,
        s.country_code,
        s.legal_form,
        s.aliases,
        s.business_types,
        jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
        'active',
        v_sys,
        v_sys,
        now()
      FROM internal_bp_seed s
    ON CONFLICT (id) DO UPDATE SET
        code                       = EXCLUDED.code,
        name                       = EXCLUDED.name,
        display_name               = EXCLUDED.display_name,
        legal_name                 = EXCLUDED.legal_name,
        partner_category           = 'internal',
        registration_country_code  = EXCLUDED.registration_country_code,
        tax_residence_country_code = EXCLUDED.tax_residence_country_code,
        legal_form                 = EXCLUDED.legal_form,
        aliases                    = EXCLUDED.aliases,
        business_types             = EXCLUDED.business_types,
        status                     = 'active',
        updated_by                 = EXCLUDED.updated_by,
        updated_at                 = now();

    -- ------------------------------------------------------------------------
    -- 2. Restore external customer BP identities.  The dual-role MGI customer is
    --    intentionally attached to the canonical dual-role BP (BOTH-GLB-01).
    -- ------------------------------------------------------------------------
    WITH customer_bp_seed (
        bp_code,
        name,
        display_name,
        legal_name,
        country_code,
        legal_form,
        registration_no,
        aliases,
        business_types
    ) AS (
        VALUES
            ('CUS-KSA-01', 'Al Rajhi Digital Systems Co.', 'Al Rajhi Digital',
             'Al Rajhi Digital Systems Company', 'SA', 'joint_stock',
             'CR-1010789012', ARRAY['Al Rajhi Digital','ARDS','ARD Systems'], ARRAY['financial_services','technology']),
            ('CUS-KSA-02', 'Saudi Telecom Holdings', 'STH',
             'Saudi Telecom Holdings Company', 'SA', 'joint_stock',
             'CR-1010901234', ARRAY['STH','Saudi Telecom Holdings','ST Holdings'], ARRAY['telecommunications','professional_services']),
            ('CUS-EGY-01', 'Egyptian National Industries', 'ENI',
             'Egyptian National Industries S.A.E.', 'EG', 'joint_stock',
             'EG-COM-2005-567890', ARRAY['ENI','Egyptian National Industries'], ARRAY['industrial','manufacturing']),
            ('CUS-EGY-02', 'Suez Canal Trading Company', 'Suez Canal Trading',
             'Suez Canal Trading Company S.A.E.', 'EG', 'joint_stock',
             'EG-COM-2010-678901', ARRAY['SCTC','Suez Canal Trading'], ARRAY['public_sector','logistics']),
            ('CUS-GLB-01', 'International Business Holdings Inc', 'IBH Inc',
             'International Business Holdings Incorporated', 'US', 'corporation',
             'US-DEL-5678901', ARRAY['IBH','IBH Inc','International Business Holdings'], ARRAY['financial_services','professional_services']),
            ('BOTH-GLB-01', 'Meridian Group International BV', 'Meridian Group',
             'Meridian Group International B.V.', 'NL', 'private_limited',
             'NL-55678124', ARRAY['MGI','Meridian','Meridian Group'], ARRAY['managed_services','technology'])
    )
    INSERT INTO master.business_partner (
        tenant_id,
        code,
        name,
        display_name,
        legal_name,
        partner_category,
        registration_country_code,
        tax_residence_country_code,
        legal_form,
        registration_no,
        aliases,
        business_types,
        metadata,
        status,
        created_by,
        updated_by,
        updated_at
    )
    SELECT
        v_tid,
        s.bp_code,
        s.name,
        s.display_name,
        s.legal_name,
        'organization',
        s.country_code,
        s.country_code,
        s.legal_form,
        s.registration_no,
        s.aliases,
        s.business_types,
        jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
        'active',
        v_sys,
        v_sys,
        now()
      FROM customer_bp_seed s
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                       = EXCLUDED.name,
        display_name               = EXCLUDED.display_name,
        legal_name                 = EXCLUDED.legal_name,
        partner_category           = 'organization',
        registration_country_code  = EXCLUDED.registration_country_code,
        tax_residence_country_code = EXCLUDED.tax_residence_country_code,
        legal_form                 = EXCLUDED.legal_form,
        registration_no            = EXCLUDED.registration_no,
        aliases                    = EXCLUDED.aliases,
        business_types             = EXCLUDED.business_types,
        status                     = 'active',
        updated_by                 = EXCLUDED.updated_by,
        updated_at                 = now();

    -- ------------------------------------------------------------------------
    -- 3. Restore customer role rows.  Prefer orphaned customer_block IDs from
    --    the 008 coverage seed so existing qualification/block rows reattach.
    -- ------------------------------------------------------------------------
    WITH customer_seed (
        customer_code,
        bp_code,
        customer_type,
        is_key_account,
        risk_rating,
        fallback_id
    ) AS (
        VALUES
            ('CUS-TKSA',          'BP-TKSA',    'intercompany', false, 'low',    'dd002000-0000-0000-0000-000000000021'::uuid),
            ('CUS-SSK',           'BP-SSK',     'intercompany', false, 'low',    'dd002000-0000-0000-0000-000000000022'::uuid),
            ('CUS-TEGY',          'BP-TEGY',    'intercompany', false, 'low',    'dd002000-0000-0000-0000-000000000023'::uuid),
            ('CUS-SDTX',          'BP-SDTX',    'intercompany', false, 'low',    'dd002000-0000-0000-0000-000000000024'::uuid),
            ('CUS-TKSA-ARDS-001', 'CUS-KSA-01', 'corporate',    true,  'low',    'dd002000-0000-0000-0000-000000000025'::uuid),
            ('CUS-SSK-STH-001',   'CUS-KSA-02', 'government',   true,  'low',    'dd002000-0000-0000-0000-000000000026'::uuid),
            ('CUS-TEGY-ENI-001',  'CUS-EGY-01', 'corporate',    true,  'medium', 'dd002000-0000-0000-0000-000000000027'::uuid),
            ('CUS-SDTX-SCTC-001', 'CUS-EGY-02', 'government',   true,  'medium', 'dd002000-0000-0000-0000-000000000028'::uuid),
            ('CUS-GLB-IBH-001',   'CUS-GLB-01', 'corporate',    true,  'low',    'dd002000-0000-0000-0000-000000000029'::uuid),
            ('CUS-GLB-MGI-001',   'BOTH-GLB-01', 'corporate',   true,  'medium', 'dd002000-0000-0000-0000-000000000030'::uuid)
    ),
    block_ids AS (
        SELECT DISTINCT ON (cb.metadata ->> 'customer_code')
               cb.metadata ->> 'customer_code' AS customer_code,
               cb.customer_id
          FROM master.customer_block cb
         WHERE cb.tenant_id = v_tid
           AND cb.metadata -> '_seed' ->> 'pack' = '008_technostat_customer_100pct'
           AND cb.metadata ? 'customer_code'
         ORDER BY cb.metadata ->> 'customer_code', cb.created_at NULLS LAST
    ),
    resolved AS (
        SELECT
            s.customer_code,
            s.bp_code,
            s.customer_type,
            s.is_key_account,
            s.risk_rating,
            coalesce(b.customer_id, s.fallback_id) AS customer_id
          FROM customer_seed s
          LEFT JOIN block_ids b
            ON b.customer_code = s.customer_code
    )
    INSERT INTO master.customer (
        id,
        tenant_id,
        business_partner_id,
        customer_code,
        customer_type,
        is_key_account,
        risk_rating,
        metadata,
        status,
        created_by,
        updated_by,
        updated_at
    )
    SELECT
        r.customer_id,
        v_tid,
        bp.id,
        r.customer_code,
        r.customer_type,
        r.is_key_account,
        r.risk_rating,
        jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
        'active',
        v_sys,
        v_sys,
        now()
      FROM resolved r
      JOIN master.business_partner bp
        ON bp.tenant_id = v_tid
       AND bp.code = r.bp_code
    ON CONFLICT (tenant_id, customer_code) DO UPDATE SET
        business_partner_id = EXCLUDED.business_partner_id,
        customer_type       = EXCLUDED.customer_type,
        is_key_account      = EXCLUDED.is_key_account,
        risk_rating         = EXCLUDED.risk_rating,
        status              = 'active',
        updated_by          = EXCLUDED.updated_by,
        updated_at          = now();

    -- Meridian's canonical BP in the Technostat tenant pack is BOTH-GLB-01.
    -- Older repair runs created SUP-GLB-02 as a duplicate BP identity; once the
    -- supplier/customer roles above have been rehomed, remove that repair-only
    -- identity so the BP meta list stays one row per real-world partner.
    DELETE FROM master.business_partner bp
     WHERE bp.tenant_id = v_tid
       AND bp.code = 'SUP-GLB-02'
       AND bp.metadata -> '_seed' ->> 'file' IN (
           '012_technostat_supplier_search_repair',
           '013_technostat_customer_search_repair'
       )
       AND EXISTS (
           SELECT 1
             FROM master.business_partner canonical
            WHERE canonical.tenant_id = v_tid
              AND canonical.code = 'BOTH-GLB-01'
       )
       AND NOT EXISTS (
           SELECT 1
             FROM master.supplier s
            WHERE s.tenant_id = v_tid
              AND s.business_partner_id = bp.id
       )
       AND NOT EXISTS (
           SELECT 1
             FROM master.customer c
            WHERE c.tenant_id = v_tid
              AND c.business_partner_id = bp.id
       );

    -- Any remaining orphaned rows from the Technostat customer seed packs should
    -- not survive the repair, or FK re-application will fail on the next DDL pass.
    DELETE FROM master.customer_qualification q
     WHERE q.tenant_id = v_tid
       AND q.metadata -> '_seed' ->> 'pack' = '008_technostat_customer_100pct'
       AND NOT EXISTS (
           SELECT 1
             FROM master.customer c
            WHERE c.tenant_id = q.tenant_id
              AND c.id = q.customer_id
       );

    DELETE FROM master.customer_block cb
     WHERE cb.tenant_id = v_tid
       AND cb.metadata -> '_seed' ->> 'pack' IN (
           '008_technostat_customer_100pct',
           'tksa_bp_advanced_v1',
           'tksa_bp_comprehensive_v2'
       )
       AND NOT EXISTS (
           SELECT 1
             FROM master.customer c
            WHERE c.tenant_id = cb.tenant_id
             AND c.id = cb.customer_id
       );

    -- Remove stale denormalized index rows left behind by partial/truncated
    -- customer repairs. The customer_app_index FK was not present on some
    -- existing databases, so do this explicitly before rebuilding the surface.
    DELETE FROM master.customer_app_index cai
     WHERE cai.tenant_id = v_tid
       AND cai.customer_code IN (
           'CUS-TKSA',
           'CUS-SSK',
           'CUS-TEGY',
           'CUS-SDTX',
           'CUS-TKSA-ARDS-001',
           'CUS-SSK-STH-001',
           'CUS-TEGY-ENI-001',
           'CUS-SDTX-SCTC-001',
           'CUS-GLB-IBH-001',
           'CUS-GLB-MGI-001'
       )
       AND NOT EXISTS (
           SELECT 1
             FROM master.customer c
            WHERE c.tenant_id = cai.tenant_id
              AND c.id = cai.customer_id
       );

    -- ------------------------------------------------------------------------
    -- 4. Restore minimal AR qualification rows when they are absent.  Existing
    --    rows are preserved because later seeds may have adjusted statuses.
    -- ------------------------------------------------------------------------
    WITH qualification_seed AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA',          'approved', 'ic_0_10m',     930, 'aa',  0,  'excellent', false, 'passed', 'clear', 'passed', true, true,  'HQ internal customer role cleared for group AR settlement.'),
            ('CUS-SSK',           'approved', 'ic_0_10m',     910, 'aa',  4,  'excellent', false, 'passed', 'clear', 'passed', true, true,  'SSK internal customer role cleared for group AR settlement.'),
            ('CUS-TEGY',          'approved', 'ic_0_10m',     900, 'aa',  6,  'good',      false, 'passed', 'clear', 'passed', true, true,  'TEGY internal customer role cleared for group AR settlement.'),
            ('CUS-SDTX',          'approved', 'ic_0_10m',     895, 'aa',  7,  'good',      false, 'passed', 'clear', 'passed', true, true,  'SDTX internal customer role cleared for group AR settlement.'),
            ('CUS-TKSA-ARDS-001', 'approved', 'sar_5m_50m',   890, 'aa',  22, 'excellent', false, 'passed', 'clear', 'passed', true, true,  'Excellent payment history and top-tier KSA banking group ownership.'),
            ('CUS-SSK-STH-001',   'approved', 'sar_50m_plus', 950, 'aaa', 28, 'good',      false, 'passed', 'clear', 'passed', true, true,  'Government-backed telecom customer with high approved credit limit.'),
            ('CUS-TEGY-ENI-001',  'approved', 'egp_10m_50m',  800, 'a',   35, 'good',      false, 'passed', 'clear', 'passed', true, true,  'Large industrial group with annual review cycle.'),
            ('CUS-SDTX-SCTC-001', 'approved', 'egp_10m_50m',  830, 'aa',  31, 'good',      false, 'passed', 'clear', 'passed', true, true,  'Public-sector trading customer with clean payment record.'),
            ('CUS-GLB-IBH-001',   'approved', 'multi_cc_key', 920, 'aa',  18, 'excellent', false, 'passed', 'clear', 'passed', true, true,  'Global strategic account approved across all Technostat company codes.'),
            ('CUS-GLB-MGI-001',   'approved', 'multi_cc_dual',860, 'a',   27, 'good',      false, 'passed', 'clear', 'passed', true, true,  'Dual-role account approved with monthly netting controls.')
        ) AS v(customer_code, credit_status, credit_limit_band, credit_score, credit_rating,
               dso_days, payment_behavior, has_overdue_history, kyc_status,
               aml_sanctions_status, beneficial_owner_check_status,
               is_dunning_eligible, is_statement_eligible, credit_notes)
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
        is_dunning_eligible,
        is_statement_eligible,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tid,
        c.id,
        q.credit_status,
        q.credit_limit_band,
        q.credit_score,
        q.credit_rating,
        q.dso_days,
        q.payment_behavior,
        q.has_overdue_history,
        q.kyc_status,
        q.aml_sanctions_status,
        q.beneficial_owner_check_status,
        q.is_dunning_eligible,
        q.is_statement_eligible,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '013_technostat_customer_search_repair'),
            'credit_notes', q.credit_notes
        ),
        'active',
        v_sys
      FROM qualification_seed q
      JOIN master.customer c
        ON c.tenant_id = v_tid
       AND c.customer_code = q.customer_code
    ON CONFLICT (tenant_id, customer_id) DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 5. Restore company-code customer profiles for all expected customers.
    -- ------------------------------------------------------------------------
    WITH profile_seed AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA-ARDS-001', 'TKSA', 'SAR', 10000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'direct_ar',      'Saudi key account AR profile for TKSA.'),
            ('CUS-SSK-STH-001',   'SSK',  'SAR', 50000000.0000::numeric, 'SAR', 'aaa', 'PT-NET45', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'direct_ar',      'Strategic Saudi public-sector AR profile for SSK.'),
            ('CUS-TEGY-ENI-001',  'TEGY', 'EGP', 20000000.0000::numeric, 'EGP', 'a',   'PT-NET45', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'direct_ar',      'Egypt industrial AR profile for TEGY.'),
            ('CUS-SDTX-SCTC-001', 'SDTX', 'EGP', 15000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'direct_ar',      'Egypt public-sector AR profile for SDTX.'),
            ('CUS-GLB-IBH-001',   'TKSA', 'SAR', 25000000.0000::numeric, 'SAR', 'aa',  'PT-NET45', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'global_account', 'IBH global account profile for TKSA.'),
            ('CUS-GLB-IBH-001',   'SSK',  'SAR', 20000000.0000::numeric, 'SAR', 'aa',  'PT-NET45', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'global_account', 'IBH global account profile for SSK.'),
            ('CUS-GLB-IBH-001',   'TEGY', 'EGP', 10000000.0000::numeric, 'EGP', 'aa',  'PT-NET45', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'global_account', 'IBH global account profile for TEGY.'),
            ('CUS-GLB-IBH-001',   'SDTX', 'EGP',  8000000.0000::numeric, 'EGP', 'aa',  'PT-NET45', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'global_account', 'IBH global account profile for SDTX.'),
            ('CUS-GLB-MGI-001',   'TKSA', 'SAR', 12000000.0000::numeric, 'SAR', 'a',   'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'dual_role',      'MGI dual-role account profile for TKSA.'),
            ('CUS-GLB-MGI-001',   'SSK',  'SAR', 10000000.0000::numeric, 'SAR', 'a',   'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'dual_role',      'MGI dual-role account profile for SSK.'),
            ('CUS-GLB-MGI-001',   'TEGY', 'EGP',  6000000.0000::numeric, 'EGP', 'a',   'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'dual_role',      'MGI dual-role account profile for TEGY.'),
            ('CUS-GLB-MGI-001',   'SDTX', 'EGP',  5000000.0000::numeric, 'EGP', 'a',   'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'dual_role',      'MGI dual-role account profile for SDTX.'),
            ('CUS-TKSA',          'SSK',  'SAR',  5000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',   'SSK AR profile for billing Technostat Group HQ.'),
            ('CUS-TKSA',          'TEGY', 'EGP',  6000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',   'TEGY AR profile for billing Technostat Group HQ.'),
            ('CUS-TKSA',          'SDTX', 'EGP',  4000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',   'SDTX AR profile for billing Technostat Group HQ.'),
            ('CUS-SSK',           'TKSA', 'SAR',  7500000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',   'TKSA AR profile for billing SSK Saudi.'),
            ('CUS-SSK',           'TEGY', 'EGP',  2500000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',   'TEGY AR profile for billing SSK Saudi.'),
            ('CUS-SSK',           'SDTX', 'EGP',  2000000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',   'SDTX AR profile for billing SSK Saudi.'),
            ('CUS-TEGY',          'TKSA', 'SAR',  9000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',   'TKSA AR profile for billing Technostat Egypt.'),
            ('CUS-TEGY',          'SSK',  'SAR',  3000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',   'SSK AR profile for billing Technostat Egypt.'),
            ('CUS-TEGY',          'SDTX', 'EGP',  3500000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',   'SDTX AR profile for billing Technostat Egypt.'),
            ('CUS-SDTX',          'TKSA', 'SAR',  5000000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',   'TKSA AR profile for billing Satellites DT.'),
            ('CUS-SDTX',          'SSK',  'SAR',  2500000.0000::numeric, 'SAR', 'aa',  'PT-NET30', 'SADAD-SAR', 'TG-SA-VAT-15-IN', 'monthly', 'intercompany',   'SSK AR profile for billing Satellites DT.'),
            ('CUS-SDTX',          'TEGY', 'EGP',  2500000.0000::numeric, 'EGP', 'aa',  'PT-NET30', 'RTGS-EGP',  'TG-EG-VAT-14-IN', 'monthly', 'intercompany',   'TEGY AR profile for billing Satellites DT.')
        ) AS v(customer_code, company_code, currency_code, credit_limit, credit_currency_code,
               credit_rating, payment_term_code, receipt_method_code, tax_group_code,
               statement_cycle_code, profile_class, notes)
    ),
    resolved_profiles AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            cc.id AS company_code_id,
            p.currency_code,
            p.credit_limit,
            p.credit_currency_code,
            p.credit_rating,
            ap.id AS accounting_profile_id,
            pm.id AS receipt_method_id,
            pt.id AS payment_term_id,
            tg.id AS tax_group_id,
            p.statement_cycle_code,
            p.profile_class,
            p.notes
          FROM profile_seed p
          JOIN master.customer c
            ON c.tenant_id = v_tid
           AND c.customer_code = p.customer_code
          JOIN master.company_code cc
            ON cc.tenant_id = v_tid
           AND cc.code = p.company_code
          LEFT JOIN master.accounting_profile ap
            ON ap.tenant_id = v_tid
           AND ap.code = 'AR_STANDARD'
          LEFT JOIN master.payment_method pm
            ON pm.tenant_id = v_tid
           AND pm.code = p.receipt_method_code
          LEFT JOIN master.payment_term pt
            ON pt.tenant_id = v_tid
           AND pt.code = p.payment_term_code
          LEFT JOIN control.tax_group tg
            ON tg.tenant_id = v_tid
           AND tg.code = p.tax_group_code
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
            '_seed', jsonb_build_object('file', '013_technostat_customer_search_repair'),
            'profile_class', profile_class,
            'notes', notes
        ),
        'active',
        v_sys
      FROM resolved_profiles
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
    -- 6. Restore the denormalized Customer list/search surface.
    -- ------------------------------------------------------------------------
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
        lower(concat_ws(' ',
            c.customer_code,
            bp.code,
            bp.name,
            bp.display_name,
            bp.legal_name,
            bp.registration_no,
            array_to_string(bp.aliases, ' '),
            array_to_string(bp.business_types, ' ')
        )),
        now()
      FROM master.customer c
      JOIN master.business_partner bp
        ON bp.tenant_id = c.tenant_id
       AND bp.id = c.business_partner_id
     WHERE c.tenant_id = v_tid
       AND c.customer_code IN (
           'CUS-TKSA',
           'CUS-SSK',
           'CUS-TEGY',
           'CUS-SDTX',
           'CUS-TKSA-ARDS-001',
           'CUS-SSK-STH-001',
           'CUS-TEGY-ENI-001',
           'CUS-SDTX-SCTC-001',
           'CUS-GLB-IBH-001',
           'CUS-GLB-MGI-001'
       )
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
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

    SELECT count(*) INTO v_customer_count
      FROM master.customer
     WHERE tenant_id = v_tid
       AND customer_code IN (
           'CUS-TKSA',
           'CUS-SSK',
           'CUS-TEGY',
           'CUS-SDTX',
           'CUS-TKSA-ARDS-001',
           'CUS-SSK-STH-001',
           'CUS-TEGY-ENI-001',
           'CUS-SDTX-SCTC-001',
           'CUS-GLB-IBH-001',
           'CUS-GLB-MGI-001'
       );

    SELECT count(*) INTO v_index_count
      FROM master.customer_app_index
     WHERE tenant_id = v_tid
       AND customer_code IN (
           'CUS-TKSA',
           'CUS-SSK',
           'CUS-TEGY',
           'CUS-SDTX',
           'CUS-TKSA-ARDS-001',
           'CUS-SSK-STH-001',
           'CUS-TEGY-ENI-001',
           'CUS-SDTX-SCTC-001',
           'CUS-GLB-IBH-001',
           'CUS-GLB-MGI-001'
       );

    SELECT count(DISTINCT customer_id) INTO v_profile_count
      FROM master.company_code_customer_profile
     WHERE tenant_id = v_tid
       AND status <> 'archived';

    IF v_customer_count <> 10 THEN
        RAISE EXCEPTION '[technostat_customer_search_repair] expected 10 customers, restored %',
            v_customer_count;
    END IF;

    IF v_index_count <> 10 THEN
        RAISE EXCEPTION '[technostat_customer_search_repair] expected 10 customer_app_index rows, restored %',
            v_index_count;
    END IF;

    RAISE NOTICE
        '[technostat_customer_search_repair] customer chooser baseline restored (customers=%, app_index=%, profiled_customers=%)',
        v_customer_count,
        v_index_count,
        v_profile_count;
END;
$technostat_customer_search_repair$;
