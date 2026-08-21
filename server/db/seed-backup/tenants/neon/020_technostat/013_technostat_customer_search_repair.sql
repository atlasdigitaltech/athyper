-- ============================================================================
-- FILE:    tenants/neon/020_technostat/013_technostat_customer_search_repair.sql
-- Purpose: Repair Technostat customer/business-partner seed surface against the
--          current lean tenant schema.
--
-- This variant is intentionally conservative: it only uses columns that are
-- present in the current tenant DDL and skips legacy denormalized tables when
-- they are not available.
-- ============================================================================

DO $technostat_customer_search_repair$
DECLARE
    v_tid uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_customer_count integer;
    v_profile_count integer;
    v_has_customer_app_index boolean;
    v_has_customer_qualification boolean;
BEGIN
    SELECT id INTO v_tid
      FROM master.tenant
     WHERE realm_key = 'athyper' AND code = 'technostat'
     LIMIT 1;

    IF v_tid IS NULL THEN
        RAISE NOTICE '[technostat_customer_search_repair] technostat tenant not found; skipping';
        RETURN;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname='master' AND tablename='customer_app_index'
    ) INTO v_has_customer_app_index;

    SELECT EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname='master' AND tablename='customer_qualification'
    ) INTO v_has_customer_qualification;

    -- 1) Restore the fixed internal business partners.
    WITH internal_bp_seed (
        id, bp_code, name, display_name, legal_name,
        country_code, legal_form, aliases
    ) AS (
        VALUES
            ('dd002000-0000-0000-0000-000000000001'::uuid, 'BP-TKSA', 'Technostat Group HQ', 'Technostat Group', 'Technostat Group Holdings Co.', 'SA', 'private_limited', ARRAY['Technostat Group','TKSA']),
            ('dd002000-0000-0000-0000-000000000002'::uuid, 'BP-SSK',  'SSK Saudi', 'SSK Saudi', 'SSK Saudi Co. for Construction W.L.L.', 'SA', 'private_limited', ARRAY['SSK','SSK Saudi']),
            ('dd002000-0000-0000-0000-000000000003'::uuid, 'BP-TEGY', 'Technostat Egypt', 'Technostat Egypt', 'Technostat Egypt for Trading S.A.E.', 'EG', 'private_limited', ARRAY['Technostat Egypt','TEGY']),
            ('dd002000-0000-0000-0000-000000000004'::uuid, 'BP-SDTX', 'Satellites DT', 'Satellites for Digital Transformation', 'Satellites for Digital Transformation S.A.E.', 'EG', 'private_limited', ARRAY['Satellites DT','SDTX'])
    )
    UPDATE master.business_partner bp
       SET name = s.name,
           display_name = s.display_name,
           legal_name = s.legal_name,
           partner_category = 'internal',
           legal_form = s.legal_form,
           registration_country_code = s.country_code,
           aliases = s.aliases,
           metadata = coalesce(bp.metadata, '{}'::jsonb)
                     || jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
           updated_by = v_sys,
           status = 'active',
           updated_at = now()
      FROM internal_bp_seed s
     WHERE bp.id = s.id;

    WITH internal_bp_seed (
        id, bp_code, name, display_name, legal_name,
        country_code, legal_form, aliases
    ) AS (
        VALUES
            ('dd002000-0000-0000-0000-000000000001'::uuid, 'BP-TKSA', 'Technostat Group HQ', 'Technostat Group', 'Technostat Group Holdings Co.', 'SA', 'private_limited', ARRAY['Technostat Group','TKSA']),
            ('dd002000-0000-0000-0000-000000000002'::uuid, 'BP-SSK',  'SSK Saudi', 'SSK Saudi', 'SSK Saudi Co. for Construction W.L.L.', 'SA', 'private_limited', ARRAY['SSK','SSK Saudi']),
            ('dd002000-0000-0000-0000-000000000003'::uuid, 'BP-TEGY', 'Technostat Egypt', 'Technostat Egypt', 'Technostat Egypt for Trading S.A.E.', 'EG', 'private_limited', ARRAY['Technostat Egypt','TEGY']),
            ('dd002000-0000-0000-0000-000000000004'::uuid, 'BP-SDTX', 'Satellites DT', 'Satellites for Digital Transformation', 'Satellites for Digital Transformation S.A.E.', 'EG', 'private_limited', ARRAY['Satellites DT','SDTX'])
    )
    INSERT INTO master.business_partner (
        id,
        tenant_id,
        code,
        name,
        display_name,
        legal_name,
        partner_category,
        legal_form,
        registration_country_code,
        aliases,
        metadata,
        status,
        created_by,
        updated_by,
        created_at,
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
        s.legal_form,
        s.country_code,
        s.aliases,
        jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
        'active',
        v_sys,
        v_sys,
        now(),
        now()
      FROM internal_bp_seed s
     WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner existing WHERE existing.id = s.id
     );

    -- 2) Restore external customer business partners.
    WITH customer_bp_seed (
        bp_code, name, display_name, legal_name, country_code, legal_form, aliases
    ) AS (
        VALUES
            ('CUS-KSA-01', 'Al Rajhi Digital Systems Co.', 'Al Rajhi Digital', 'Al Rajhi Digital Systems Company', 'SA', 'joint_stock', ARRAY['Al Rajhi Digital','ARDS','ARD Systems']),
            ('CUS-KSA-02', 'Saudi Telecom Holdings', 'STH', 'Saudi Telecom Holdings Company', 'SA', 'joint_stock', ARRAY['STH','Saudi Telecom Holdings','ST Holdings']),
            ('CUS-EGY-01', 'Egyptian National Industries', 'ENI', 'Egyptian National Industries S.A.E.', 'EG', 'joint_stock', ARRAY['ENI','Egyptian National Industries']),
            ('CUS-EGY-02', 'Suez Canal Trading Company', 'SCTC', 'Suez Canal Trading Company S.A.E.', 'EG', 'joint_stock', ARRAY['SCTC','Suez Canal Trading']),
            ('CUS-GLB-01', 'International Business Holdings Inc', 'IBH Inc', 'International Business Holdings Incorporated', 'US', 'corporation', ARRAY['IBH','IBH Inc','International Business Holdings']),
            ('BOTH-GLB-01', 'Meridian Group International BV', 'Meridian Group', 'Meridian Group International B.V.', 'NL', 'private_limited', ARRAY['MGI','Meridian','Meridian Group'])
    )
    UPDATE master.business_partner bp
       SET name = s.name,
           display_name = s.display_name,
           legal_name = s.legal_name,
           partner_category = 'organization',
           legal_form = s.legal_form,
           registration_country_code = s.country_code,
           aliases = s.aliases,
           metadata = coalesce(bp.metadata, '{}'::jsonb)
                     || jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
           updated_by = v_sys,
           status = 'active',
           updated_at = now()
      FROM customer_bp_seed s
     WHERE bp.tenant_id = v_tid
       AND bp.code = s.bp_code;

    WITH customer_bp_seed (
        bp_code, name, display_name, legal_name, country_code, legal_form, aliases
    ) AS (
        VALUES
            ('CUS-KSA-01', 'Al Rajhi Digital Systems Co.', 'Al Rajhi Digital', 'Al Rajhi Digital Systems Company', 'SA', 'joint_stock', ARRAY['Al Rajhi Digital','ARDS','ARD Systems']),
            ('CUS-KSA-02', 'Saudi Telecom Holdings', 'STH', 'Saudi Telecom Holdings Company', 'SA', 'joint_stock', ARRAY['STH','Saudi Telecom Holdings','ST Holdings']),
            ('CUS-EGY-01', 'Egyptian National Industries', 'ENI', 'Egyptian National Industries S.A.E.', 'EG', 'joint_stock', ARRAY['ENI','Egyptian National Industries']),
            ('CUS-EGY-02', 'Suez Canal Trading Company', 'SCTC', 'Suez Canal Trading Company S.A.E.', 'EG', 'joint_stock', ARRAY['SCTC','Suez Canal Trading']),
            ('CUS-GLB-01', 'International Business Holdings Inc', 'IBH Inc', 'International Business Holdings Incorporated', 'US', 'corporation', ARRAY['IBH','IBH Inc','International Business Holdings']),
            ('BOTH-GLB-01', 'Meridian Group International BV', 'Meridian Group', 'Meridian Group International B.V.', 'NL', 'private_limited', ARRAY['MGI','Meridian','Meridian Group'])
    )
    INSERT INTO master.business_partner (
        tenant_id,
        code,
        name,
        display_name,
        legal_name,
        partner_category,
        legal_form,
        registration_country_code,
        aliases,
        metadata,
        status,
        created_by,
        updated_by,
        created_at,
        updated_at
    )
    SELECT
        v_tid,
        s.bp_code,
        s.name,
        s.display_name,
        s.legal_name,
        'organization',
        s.legal_form,
        s.country_code,
        s.aliases,
        jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
        'active',
        v_sys,
        v_sys,
        now(),
        now()
      FROM customer_bp_seed s
     WHERE NOT EXISTS (
        SELECT 1
          FROM master.business_partner existing
         WHERE existing.tenant_id = v_tid
           AND existing.code = s.bp_code
     );

    -- 3) Restore key customer rows.
    WITH customer_seed (
        customer_code, bp_code, customer_type, is_key_account, fallback_id
    ) AS (
        VALUES
            ('CUS-TKSA',          'BP-TKSA',    'intercompany', false, 'dd002000-0000-0000-0000-000000000021'::uuid),
            ('CUS-SSK',           'BP-SSK',     'intercompany', false, 'dd002000-0000-0000-0000-000000000022'::uuid),
            ('CUS-TEGY',          'BP-TEGY',    'intercompany', false, 'dd002000-0000-0000-0000-000000000023'::uuid),
            ('CUS-SDTX',          'BP-SDTX',    'intercompany', false, 'dd002000-0000-0000-0000-000000000024'::uuid),
            ('CUS-TKSA-ARDS-001', 'CUS-KSA-01', 'corporate',    true,  'dd002000-0000-0000-0000-000000000025'::uuid),
            ('CUS-SSK-STH-001',   'CUS-KSA-02', 'government',   true,  'dd002000-0000-0000-0000-000000000026'::uuid),
            ('CUS-TEGY-ENI-001',  'CUS-EGY-01', 'corporate',    true,  'dd002000-0000-0000-0000-000000000027'::uuid),
            ('CUS-SDTX-SCTC-001', 'CUS-EGY-02', 'government',   true,  'dd002000-0000-0000-0000-000000000028'::uuid),
            ('CUS-GLB-IBH-001',   'CUS-GLB-01', 'corporate',    true,  'dd002000-0000-0000-0000-000000000029'::uuid),
            ('CUS-GLB-MGI-001',   'BOTH-GLB-01', 'corporate',   true,  'dd002000-0000-0000-0000-000000000030'::uuid)
    ),
    resolved AS (
        SELECT
            s.customer_code,
            bp.id AS business_partner_id,
            s.fallback_id::uuid AS customer_id,
            s.customer_type,
            s.is_key_account
          FROM customer_seed s
          JOIN master.business_partner bp
            ON bp.tenant_id = v_tid
           AND bp.code = s.bp_code
    )
    UPDATE master.customer c
       SET business_partner_id = r.business_partner_id,
           customer_type = r.customer_type,
           is_key_account = r.is_key_account,
           metadata = coalesce(c.metadata, '{}'::jsonb)
                      || jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
           status='active',
           updated_by=v_sys,
           updated_at=now()
      FROM resolved r
     WHERE c.tenant_id = v_tid
       AND c.customer_code = r.customer_code;

    WITH customer_seed (
        customer_code, bp_code, customer_type, is_key_account, fallback_id
    ) AS (
        VALUES
            ('CUS-TKSA',          'BP-TKSA',    'intercompany', false, 'dd002000-0000-0000-0000-000000000021'::uuid),
            ('CUS-SSK',           'BP-SSK',     'intercompany', false, 'dd002000-0000-0000-0000-000000000022'::uuid),
            ('CUS-TEGY',          'BP-TEGY',    'intercompany', false, 'dd002000-0000-0000-0000-000000000023'::uuid),
            ('CUS-SDTX',          'BP-SDTX',    'intercompany', false, 'dd002000-0000-0000-0000-000000000024'::uuid),
            ('CUS-TKSA-ARDS-001', 'CUS-KSA-01', 'corporate',    true,  'dd002000-0000-0000-0000-000000000025'::uuid),
            ('CUS-SSK-STH-001',   'CUS-KSA-02', 'government',   true,  'dd002000-0000-0000-0000-000000000026'::uuid),
            ('CUS-TEGY-ENI-001',  'CUS-EGY-01', 'corporate',    true,  'dd002000-0000-0000-0000-000000000027'::uuid),
            ('CUS-SDTX-SCTC-001', 'CUS-EGY-02', 'government',   true,  'dd002000-0000-0000-0000-000000000028'::uuid),
            ('CUS-GLB-IBH-001',   'CUS-GLB-01', 'corporate',    true,  'dd002000-0000-0000-0000-000000000029'::uuid),
            ('CUS-GLB-MGI-001',   'BOTH-GLB-01', 'corporate',   true,  'dd002000-0000-0000-0000-000000000030'::uuid)
    )
    INSERT INTO master.customer (
        id,
        tenant_id,
        business_partner_id,
        customer_code,
        customer_type,
        is_key_account,
        metadata,
        status,
        created_by,
        updated_by,
        created_at,
        updated_at
    )
    SELECT
        r.customer_id,
        v_tid,
        r.business_partner_id,
        r.customer_code,
        r.customer_type,
        r.is_key_account,
        jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair')),
        'active',
        v_sys,
        v_sys,
        now(),
        now()
      FROM (
            SELECT
                s.customer_code,
                bp.id AS business_partner_id,
                s.fallback_id::uuid AS customer_id,
                s.customer_type,
                s.is_key_account
              FROM customer_seed s
              JOIN master.business_partner bp
                ON bp.tenant_id = v_tid
               AND bp.code = s.bp_code
          ) r
     WHERE NOT EXISTS (
        SELECT 1
          FROM master.customer existing
         WHERE existing.tenant_id = v_tid
           AND existing.customer_code = r.customer_code
     );

    -- 4) Restore minimal company-code customer profiles.
    WITH profile_seed AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA-ARDS-001', 'TKSA', 'SAR', 10000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'direct_ar', 'Saudi key account AR profile for TKSA.'),
            ('CUS-SSK-STH-001',   'SSK',  'SAR', 50000000.0000::numeric, 'SAR', 'PT-NET45', 'monthly', 'direct_ar', 'Strategic Saudi public-sector AR profile for SSK.'),
            ('CUS-TEGY-ENI-001',  'TEGY', 'EGP', 20000000.0000::numeric, 'EGP', 'PT-NET45', 'monthly', 'direct_ar', 'Egypt industrial AR profile for TEGY.'),
            ('CUS-SDTX-SCTC-001', 'SDTX', 'EGP', 15000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'direct_ar', 'Egypt public-sector AR profile for SDTX.')
        ) AS v(customer_code, company_code, currency_code, credit_limit,
               credit_currency_code, payment_term_code, statement_cycle_code,
               profile_class, notes)
    ),
    resolved_profiles AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            cc.id AS company_code_id,
            p.currency_code,
            p.credit_limit,
            p.credit_currency_code,
            p.payment_term_code,
            p.statement_cycle_code,
            p.notes
          FROM profile_seed p
          JOIN master.customer c
            ON c.tenant_id = v_tid
           AND c.customer_code = p.customer_code
          JOIN master.company_code cc
            ON cc.tenant_id = v_tid
           AND cc.code = p.company_code
    )
    UPDATE master.company_code_customer_profile p
       SET credit_limit = r.credit_limit,
           credit_limit_currency_code = r.credit_currency_code,
           statement_cycle_code = r.statement_cycle_code,
           metadata = coalesce(p.metadata, '{}'::jsonb)
                      || jsonb_build_object('_seed', jsonb_build_object('file', '013_technostat_customer_search_repair'), 'notes', r.notes),
           status = 'active',
           updated_by = v_sys,
           updated_at = now()
      FROM resolved_profiles r
     WHERE p.tenant_id = v_tid
       AND p.customer_id = r.customer_id
       AND p.company_code_id = r.company_code_id;

    WITH profile_seed AS (
        SELECT *
        FROM (VALUES
            ('CUS-TKSA-ARDS-001', 'TKSA', 'SAR', 10000000.0000::numeric, 'SAR', 'PT-NET30', 'monthly', 'direct_ar', 'Saudi key account AR profile for TKSA.'),
            ('CUS-SSK-STH-001',   'SSK',  'SAR', 50000000.0000::numeric, 'SAR', 'PT-NET45', 'monthly', 'direct_ar', 'Strategic Saudi public-sector AR profile for SSK.'),
            ('CUS-TEGY-ENI-001',  'TEGY', 'EGP', 20000000.0000::numeric, 'EGP', 'PT-NET45', 'monthly', 'direct_ar', 'Egypt industrial AR profile for TEGY.'),
            ('CUS-SDTX-SCTC-001', 'SDTX', 'EGP', 15000000.0000::numeric, 'EGP', 'PT-NET30', 'monthly', 'direct_ar', 'Egypt public-sector AR profile for SDTX.')
        ) AS v(customer_code, company_code, currency_code, credit_limit,
               credit_currency_code, payment_term_code, statement_cycle_code,
               profile_class, notes)
    ),
    resolved_profiles AS (
        SELECT
            v_tid AS tenant_id,
            c.id AS customer_id,
            cc.id AS company_code_id,
            p.currency_code,
            p.credit_limit,
            p.credit_currency_code,
            p.payment_term_code,
            p.statement_cycle_code,
            p.notes
          FROM profile_seed p
          JOIN master.customer c
            ON c.tenant_id = v_tid
           AND c.customer_code = p.customer_code
          JOIN master.company_code cc
            ON cc.tenant_id = v_tid
           AND cc.code = p.company_code
          LEFT JOIN master.payment_term pt
            ON pt.tenant_id = v_tid
           AND pt.code = p.payment_term_code
    )
    INSERT INTO master.company_code_customer_profile (
        tenant_id,
        customer_id,
        company_code_id,
        currency_code,
        credit_limit,
        credit_limit_currency_code,
        status,
        created_by,
        updated_by,
        created_at,
        updated_at
    )
    SELECT
        r.tenant_id,
        r.customer_id,
        r.company_code_id,
        r.currency_code,
        r.credit_limit,
        r.credit_currency_code,
        'active',
        v_sys,
        v_sys,
        now(),
        now()
      FROM resolved_profiles r
     WHERE NOT EXISTS (
        SELECT 1
          FROM master.company_code_customer_profile existing
         WHERE existing.tenant_id = v_tid
           AND existing.customer_id = r.customer_id
           AND existing.company_code_id = r.company_code_id
     );

    IF v_has_customer_app_index THEN
        RAISE NOTICE '[technostat_customer_search_repair] customer_app_index exists; skipping restore step in this tenant-safe variant.';
    END IF;

    IF v_has_customer_qualification THEN
        RAISE NOTICE '[technostat_customer_search_repair] customer_qualification exists; skipping restore step in this tenant-safe variant.';
    END IF;

    SELECT count(*) INTO v_customer_count
      FROM master.customer
     WHERE tenant_id = v_tid
       AND customer_code IN ('CUS-TKSA-ARDS-001','CUS-SSK-STH-001','CUS-TEGY-ENI-001','CUS-SDTX-SCTC-001');

    SELECT count(*) INTO v_profile_count
      FROM master.company_code_customer_profile
     WHERE tenant_id = v_tid
       AND status <> 'archived';

    RAISE NOTICE
        '[technostat_customer_search_repair] customer chooser baseline restored (customers=% baseline rows=%)',
        v_customer_count,
        v_profile_count;
END;
$technostat_customer_search_repair$;

