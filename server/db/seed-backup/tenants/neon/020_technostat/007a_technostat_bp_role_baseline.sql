-- ============================================================================
-- FILE:    tenants/neon/020_technostat/007a_technostat_bp_role_baseline.sql
-- Tenant:  Technostat Group (tenant code: technostat)
-- Purpose: Restore the canonical external business-partner role baseline used
--          by the downstream 008 customer and 009 supplier coverage packs.
--
-- This is an append-only follow-up to the immutable 007 seed pack. It keeps the
-- modernized fixture on current business_partner, supplier, and customer
-- contracts and does not reintroduce retired party_* tables.
-- ============================================================================

DO $technostat_bp_role_baseline$
DECLARE
    v_tid uuid;
    v_sys uuid;
    v_missing_customers integer;
    v_missing_suppliers integer;
BEGIN
    SELECT id, created_by
      INTO v_tid, v_sys
      FROM master.tenant
     WHERE realm_key = 'athyper'
       AND code = 'technostat'
     LIMIT 1;

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[technostat_bp_role_baseline] technostat tenant not found';
    END IF;

    IF v_sys IS NULL THEN
        RAISE EXCEPTION '[technostat_bp_role_baseline] tenant.created_by is required';
    END IF;

    WITH external_bp_seed (
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
            ('SUP-KSA-01', 'Al Madar Technology Solutions LLC', 'Al Madar Tech',
             'Al Madar Technology Solutions Limited Liability Company', 'SA', 'limited_liability',
             'CR-1010456789', ARRAY['Al Madar','AMTS','AlMadar Tech'], ARRAY['professional_services','technology']),
            ('SUP-KSA-02', 'Arabian Network Infrastructure Co', 'Arabian Network',
             'Arabian Network Infrastructure Company', 'SA', 'limited_liability',
             'CR-2050987654', ARRAY['ANIC','Arabian Network'], ARRAY['technology','construction']),
            ('SUP-EGY-01', 'Nile Technology Partners', 'Nile Tech Partners',
             'Nile Technology Partners S.A.E.', 'EG', 'joint_stock',
             'EG-REG-772100', ARRAY['NTP','Nile Tech'], ARRAY['professional_services','technology']),
            ('SUP-EGY-02', 'Cairo Systems Integration LLC', 'Cairo Systems',
             'Cairo Systems Integration Limited Liability Company', 'EG', 'limited_liability',
             'EG-REG-884210', ARRAY['CSI','Cairo Systems'], ARRAY['technology','systems_integration']),
            ('SUP-GLB-01', 'Global Procurement Solutions Ltd', 'Global Procurement',
             'Global Procurement Solutions Limited', 'GB', 'limited_company',
             'GB-08345612', ARRAY['GPS','Global Procurement'], ARRAY['professional_services','procurement']),
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
        tenant_id, code, name, display_name, legal_name,
        partner_category, registration_country_code,
        legal_form, aliases,
        metadata, status, created_by, updated_by, updated_at
    )
    SELECT
        v_tid, s.bp_code, s.name, s.display_name, s.legal_name,
        'organization', s.country_code,
        s.legal_form, s.aliases,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '007a_technostat_bp_role_baseline'),
            'registration_no', s.registration_no,
            'business_types', to_jsonb(s.business_types)
        ),
        'active', v_sys, v_sys, now()
      FROM external_bp_seed s
     WHERE NOT EXISTS (
         SELECT 1
           FROM master.business_partner bp
          WHERE bp.tenant_id = v_tid
            AND bp.code = s.bp_code
     );

    WITH supplier_seed (bp_code, supplier_code, supplier_type) AS (
        VALUES
            ('SUP-KSA-01',  'SUP-TKSA-AMTS-001', 'service'),
            ('SUP-KSA-02',  'SUP-SSK-ANIC-001',  'contractor'),
            ('SUP-EGY-01',  'SUP-TEGY-NTP-001',  'service'),
            ('SUP-EGY-02',  'SUP-SDTX-CSI-001',  'contractor'),
            ('SUP-GLB-01',  'SUP-GLB-GPS-001',   'service'),
            ('BOTH-GLB-01', 'SUP-GLB-MGI-001',   'service')
    )
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code, supplier_type,
        metadata, status, created_by, updated_by, updated_at
    )
    SELECT
        v_tid, bp.id, s.supplier_code, s.supplier_type,
        jsonb_build_object('_seed', jsonb_build_object('pack', '007a_technostat_bp_role_baseline')),
        'active', v_sys, v_sys, now()
      FROM supplier_seed s
      JOIN master.business_partner bp
        ON bp.tenant_id = v_tid
       AND bp.code = s.bp_code
     WHERE NOT EXISTS (
         SELECT 1
           FROM master.supplier existing
          WHERE existing.tenant_id = v_tid
            AND existing.supplier_code = s.supplier_code
     );

    WITH customer_seed (
        bp_code,
        customer_code,
        customer_type,
        is_key_account
    ) AS (
        VALUES
            ('CUS-KSA-01',  'CUS-TKSA-ARDS-001', 'corporate',  true),
            ('CUS-KSA-02',  'CUS-SSK-STH-001',   'government', true),
            ('CUS-EGY-01',  'CUS-TEGY-ENI-001',  'corporate',  true),
            ('CUS-EGY-02',  'CUS-SDTX-SCTC-001', 'government', true),
            ('CUS-GLB-01',  'CUS-GLB-IBH-001',   'corporate',  true),
            ('BOTH-GLB-01', 'CUS-GLB-MGI-001',   'corporate',  true)
    )
    INSERT INTO master.customer (
        tenant_id, business_partner_id, customer_code,
        customer_type, is_key_account,
        metadata, status, created_by, updated_by, updated_at
    )
    SELECT
        v_tid, bp.id, s.customer_code,
        s.customer_type, s.is_key_account,
        jsonb_build_object('_seed', jsonb_build_object('pack', '007a_technostat_bp_role_baseline')),
        'active', v_sys, v_sys, now()
      FROM customer_seed s
      JOIN master.business_partner bp
        ON bp.tenant_id = v_tid
       AND bp.code = s.bp_code
     WHERE NOT EXISTS (
         SELECT 1
           FROM master.customer existing
          WHERE existing.tenant_id = v_tid
            AND existing.customer_code = s.customer_code
     );

    SELECT count(*) INTO v_missing_customers
      FROM (VALUES
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
          WHERE c.tenant_id = v_tid
            AND c.customer_code = expected.customer_code
     );

    SELECT count(*) INTO v_missing_suppliers
      FROM (VALUES
          ('SUP-TKSA-AMTS-001'),
          ('SUP-SSK-ANIC-001'),
          ('SUP-TEGY-NTP-001'),
          ('SUP-SDTX-CSI-001'),
          ('SUP-GLB-GPS-001'),
          ('SUP-GLB-MGI-001')
      ) AS expected(supplier_code)
     WHERE NOT EXISTS (
         SELECT 1
           FROM master.supplier s
          WHERE s.tenant_id = v_tid
            AND s.supplier_code = expected.supplier_code
     );

    IF v_missing_customers > 0 OR v_missing_suppliers > 0 THEN
        RAISE EXCEPTION
            '[technostat_bp_role_baseline] baseline incomplete: missing customers=%, suppliers=%',
            v_missing_customers,
            v_missing_suppliers;
    END IF;

    RAISE NOTICE
        '[technostat_bp_role_baseline] external customer and supplier role baseline restored';
END;
$technostat_bp_role_baseline$;
