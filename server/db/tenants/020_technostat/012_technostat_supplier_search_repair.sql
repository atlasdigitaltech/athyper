-- ============================================================================
-- FILE:    040_tenants/020_technostat/012_technostat_supplier_search_repair.sql
-- Purpose: Repair the supplier chooser seed surface when schema_provisions says
--          the large BP/supplier seed files ran, but the tenant supplier rows
--          were later dropped or truncated. Keeps the invoice Supplier picker
--          usable without forcing the full tenant pack.
-- ============================================================================

DO $technostat_supplier_search_repair$
DECLARE
    v_tid uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    SELECT id INTO v_tid
      FROM master.tenant
     WHERE code = 'technostat'
       AND realm_key = 'athyper'
     LIMIT 1;

    IF v_tid IS NULL THEN
        RAISE NOTICE '[technostat_supplier_search_repair] technostat tenant not found; skipping';
        RETURN;
    END IF;

    WITH supplier_seed (
        bp_code,
        supplier_code,
        name,
        display_name,
        legal_name,
        supplier_type,
        country_code,
        legal_form,
        registration_no,
        aliases,
        business_types
    ) AS (
        VALUES
            ('SUP-KSA-01', 'SUP-TKSA-AMTS-001', 'Al Madar Technology Solutions LLC', 'Al Madar Tech',
             'Al Madar Technology Solutions Limited Liability Company', 'service', 'SA', 'limited_liability',
             'CR-1010456789', ARRAY['Al Madar','AMTS','AlMadar Tech'], ARRAY['professional_services','technology']),
            ('SUP-KSA-02', 'SUP-SSK-ANIC-001', 'Arabian Network Infrastructure Co', 'Arabian Network',
             'Arabian Network Infrastructure Company', 'contractor', 'SA', 'limited_liability',
             'CR-2050987654', ARRAY['ANIC','Arabian Network'], ARRAY['technology','construction']),
            ('SUP-EGY-01', 'SUP-TEGY-NTP-001', 'Nile Technology Partners', 'Nile Tech Partners',
             'Nile Technology Partners S.A.E.', 'service', 'EG', 'joint_stock',
             'EG-REG-772100', ARRAY['NTP','Nile Tech'], ARRAY['professional_services','technology']),
            ('SUP-EGY-02', 'SUP-SDTX-CSI-001', 'Cairo Systems Integration LLC', 'Cairo Systems',
             'Cairo Systems Integration Limited Liability Company', 'contractor', 'EG', 'limited_liability',
             'EG-REG-884210', ARRAY['CSI','Cairo Systems'], ARRAY['technology','systems_integration']),
            ('SUP-GLB-01', 'SUP-GLB-GPS-001', 'Global Procurement Solutions Ltd', 'Global Procurement',
             'Global Procurement Solutions Limited', 'service', 'GB', 'limited_company',
             'GB-08345612', ARRAY['GPS','Global Procurement'], ARRAY['professional_services','procurement']),
            ('BOTH-GLB-01', 'SUP-GLB-MGI-001', 'Meridian Group International BV', 'Meridian Group',
             'Meridian Group International B.V.', 'service', 'NL', 'private_limited',
             'NL-55678124', ARRAY['MGI','Meridian'], ARRAY['managed_services','technology'])
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
        jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
        'active',
        v_sys,
        v_sys,
        now()
      FROM supplier_seed s
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                       = EXCLUDED.name,
        display_name               = EXCLUDED.display_name,
        legal_name                 = EXCLUDED.legal_name,
        registration_country_code  = EXCLUDED.registration_country_code,
        tax_residence_country_code = EXCLUDED.tax_residence_country_code,
        legal_form                 = EXCLUDED.legal_form,
        registration_no            = EXCLUDED.registration_no,
        aliases                    = EXCLUDED.aliases,
        business_types             = EXCLUDED.business_types,
        status                     = 'active',
        updated_by                 = EXCLUDED.updated_by,
        updated_at                 = now();

    WITH supplier_seed (bp_code, supplier_code, supplier_type) AS (
        VALUES
            ('SUP-KSA-01', 'SUP-TKSA-AMTS-001', 'service'),
            ('SUP-KSA-02', 'SUP-SSK-ANIC-001', 'contractor'),
            ('SUP-EGY-01', 'SUP-TEGY-NTP-001', 'service'),
            ('SUP-EGY-02', 'SUP-SDTX-CSI-001', 'contractor'),
            ('SUP-GLB-01', 'SUP-GLB-GPS-001', 'service'),
            ('BOTH-GLB-01', 'SUP-GLB-MGI-001', 'service')
    )
    INSERT INTO master.supplier (
        tenant_id,
        business_partner_id,
        supplier_code,
        supplier_type,
        is_payment_ready,
        payment_ready_at,
        payment_ready_by,
        payment_ready_reason,
        metadata,
        status,
        created_by,
        updated_by,
        updated_at
    )
    SELECT
        v_tid,
        bp.id,
        s.supplier_code,
        s.supplier_type,
        true,
        now(),
        v_sys,
        'Repair seed restored supplier picker baseline.',
        jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
        'active',
        v_sys,
        v_sys,
        now()
      FROM supplier_seed s
      JOIN master.business_partner bp
        ON bp.tenant_id = v_tid
       AND bp.code = s.bp_code
    ON CONFLICT (tenant_id, supplier_code) DO UPDATE SET
        business_partner_id    = EXCLUDED.business_partner_id,
        supplier_type          = EXCLUDED.supplier_type,
        is_payment_ready       = true,
        payment_ready_at       = COALESCE(master.supplier.payment_ready_at, EXCLUDED.payment_ready_at),
        payment_ready_by       = COALESCE(master.supplier.payment_ready_by, EXCLUDED.payment_ready_by),
        payment_ready_reason   = COALESCE(master.supplier.payment_ready_reason, EXCLUDED.payment_ready_reason),
        status                 = 'active',
        updated_by             = EXCLUDED.updated_by,
        updated_at             = now();

    INSERT INTO master.supplier_app_index (
        id,
        tenant_id,
        supplier_id,
        business_partner_id,
        supplier_code,
        supplier_type,
        supplier_status,
        is_payment_ready,
        business_partner_code,
        name,
        display_name,
        legal_name,
        legal_form,
        registration_no,
        registration_country_code,
        tax_residence_country_code,
        partner_category,
        aliases,
        business_types,
        search_text,
        updated_at
    )
    SELECT
        s.id,
        s.tenant_id,
        s.id,
        bp.id,
        s.supplier_code,
        s.supplier_type,
        s.status,
        s.is_payment_ready,
        bp.code,
        bp.name,
        COALESCE(bp.display_name, bp.name),
        bp.legal_name,
        bp.legal_form,
        bp.registration_no,
        bp.registration_country_code,
        bp.tax_residence_country_code,
        bp.partner_category,
        bp.aliases,
        COALESCE(bp.business_types, '{}'),
        lower(concat_ws(' ',
            s.supplier_code,
            bp.code,
            bp.name,
            bp.display_name,
            bp.legal_name,
            bp.registration_no,
            array_to_string(bp.aliases, ' '),
            array_to_string(bp.business_types, ' ')
        )),
        now()
      FROM master.supplier s
      JOIN master.business_partner bp
        ON bp.tenant_id = s.tenant_id
       AND bp.id = s.business_partner_id
     WHERE s.tenant_id = v_tid
       AND s.supplier_code IN (
           'SUP-TKSA-AMTS-001',
           'SUP-SSK-ANIC-001',
           'SUP-TEGY-NTP-001',
           'SUP-SDTX-CSI-001',
           'SUP-GLB-GPS-001',
           'SUP-GLB-MGI-001'
       )
    ON CONFLICT (tenant_id, supplier_id) DO UPDATE SET
        business_partner_id         = EXCLUDED.business_partner_id,
        supplier_code               = EXCLUDED.supplier_code,
        supplier_type               = EXCLUDED.supplier_type,
        supplier_status             = EXCLUDED.supplier_status,
        is_payment_ready            = EXCLUDED.is_payment_ready,
        business_partner_code       = EXCLUDED.business_partner_code,
        name                        = EXCLUDED.name,
        display_name                = EXCLUDED.display_name,
        legal_name                  = EXCLUDED.legal_name,
        legal_form                  = EXCLUDED.legal_form,
        registration_no             = EXCLUDED.registration_no,
        registration_country_code   = EXCLUDED.registration_country_code,
        tax_residence_country_code  = EXCLUDED.tax_residence_country_code,
        partner_category            = EXCLUDED.partner_category,
        aliases                     = EXCLUDED.aliases,
        business_types              = EXCLUDED.business_types,
        search_text                 = EXCLUDED.search_text,
        updated_at                  = now();

    RAISE NOTICE '[technostat_supplier_search_repair] supplier chooser baseline restored';
END;
$technostat_supplier_search_repair$;
