-- ============================================================================
-- FILE:    040_tenants/020_technostat/007_technostat_bp_supplier_customer_e2e.sql
-- Tenant:  technostat (019dedac-e40a-7a67-bd35-d34e3e2bf4bf) / Technostat Group
--
-- Scope:
--   §SAFE Preserves existing BP/supplier/customer data for this tenant.
--   §REF  Seeds shared reference data (SA + EG tax, payment methods, cert types).
--   §INT  4 internal BPs — one per legal entity (TKSA, SSK, TEGY, SDTX).
--   §SA1  KSA Supplier 1 — Al Madar Technology Solutions LLC  → TKSA
--   §SA2  KSA Supplier 2 — Arabian Network Infrastructure Co  → SSK
--   §SA3  KSA Customer 1 — Al Rajhi Digital Systems Co        → TKSA
--   §SA4  KSA Customer 2 — Saudi Telecom Holdings             → SSK
--   §EG1  Egypt Supplier 1 — Nile Technology Partners         → TEGY
--   §EG2  Egypt Supplier 2 — Cairo Systems Integration        → SDTX
--   §EG3  Egypt Customer 1 — Egyptian National Industries     → TEGY
--   §EG4  Egypt Customer 2 — Suez Canal Trading Company       → SDTX
--   §GL1  Global Supplier  — Global Procurement Solutions Ltd → all 4 companies
--   §GL2  Global Customer  — International Business Holdings  → all 4 companies
--   §GL3  Global Both      — Meridian Group International BV  → all 4 companies
--
-- Per-entity coverage (99-100% of writable columns):
--   master.business_partner, address ×3, address_link ×3
--   party_identifier ×5 (DUNS,LEI,CRN,TIN,VAT/PEPPOL)
--   party_contact_person ×2, party_contact_role ×2, named contact channels
--   via contact_link + contact_email/contact_phone
--   party_governance_relation ×3 (director, UBO, shareholder)
--   business_partner_network_link
--   supplier / customer (all writable cols)
--   company_code_supplier_profile / company_code_customer_profile
--   party_tax_profile (BP coverage/capability belongs to Business Network)
--   certification ×2, supplier_qualification / customer_qualification
--   bank_account + bank_account_link (suppliers)
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- Depends:    003_technostat_production_seed.sql
-- ============================================================================

-- ============================================================================
-- §SAFE  Preserve existing BP/supplier/customer data for technostat tenant
-- ============================================================================
DO $tksa_clean$
DECLARE
    v_tid  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    -- Production tenant seeds must never delete business partner master data.
    -- Supplier/customer rows may be referenced by invoices, payments, POs, goods
    -- receipts, advances, and snapshots. The rest of this file is idempotent and
    -- inserts missing master data only.
    RAISE NOTICE '[tksa_clean] Existing Technostat BP/supplier/customer data preserved; idempotent seed continues.';
END $tksa_clean$;


-- ============================================================================
-- §REF  Shared reference data — SA + EG tax, payment methods, payment terms,
--       certification types.  All idempotent.
-- ============================================================================
DO $tksa_ref$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_jur  uuid;
    v_tt   uuid;
    v_trs  uuid;
    v_tg   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    -- ── SA: Tax jurisdiction ──────────────────────────────────────────────
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, jurisdiction_type, country_code, status, created_by)
    SELECT v_tid,'SA-ZATCA','Zakat Tax and Customs Authority','COUNTRY','SA','active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='SA-ZATCA');

    -- SA: VAT type (15% since July 2020)
    INSERT INTO master.tax_type (tenant_id, code, name, category, is_recoverable, status, created_by)
    SELECT v_tid,'VAT-SA','Saudi Arabia VAT 15%','INDIRECT',true,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_type WHERE tenant_id=v_tid AND code='VAT-SA');

    -- SA: WHT on services (5%)
    INSERT INTO master.tax_type (tenant_id, code, name, category, is_deducted_at_source, status, created_by)
    SELECT v_tid,'WHT-SA-SVC','Saudi WHT on Services 5%','WITHHOLDING',true,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_type WHERE tenant_id=v_tid AND code='WHT-SA-SVC');

    -- SA: VAT rate schedule
    SELECT id INTO v_jur FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='SA-ZATCA';
    SELECT id INTO v_tt  FROM master.tax_type          WHERE tenant_id=v_tid AND code='VAT-SA';
    SELECT id INTO v_trs FROM control.tax_rate_schedule
     WHERE tenant_id=v_tid AND jurisdiction_id=v_jur AND tax_type_id=v_tt
       AND tax_direction='PURCHASE' AND COALESCE(component_code,'')='MAIN' LIMIT 1;
    IF v_trs IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value, recoverability_mode, recoverability_percent,
            calculation_basis, rounding_stage, effective_from, status, created_by
        ) VALUES (
            v_tid, v_jur, v_tt, 'PURCHASE',
            'MAIN','PERCENT',15.00,'FULL',100.00,
            'LINE_NET','LINE','2020-07-01','active',v_sys
        ) RETURNING id INTO v_trs;
    END IF;

    -- SA: VAT tax group
    SELECT id INTO v_tg FROM control.tax_group WHERE tenant_id=v_tid AND code='TG-SA-VAT-15-IN';
    IF v_tg IS NULL THEN
        INSERT INTO control.tax_group (tenant_id, code, name, status, created_by)
        VALUES (v_tid,'TG-SA-VAT-15-IN','Saudi VAT 15% Input','active',v_sys)
        RETURNING id INTO v_tg;
        INSERT INTO control.tax_group_component (tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, status, created_by)
        VALUES (v_tid, v_tg, v_trs, 10, 'active', v_sys);
    END IF;

    -- SA: WHT rate schedule
    SELECT id INTO v_tt FROM master.tax_type WHERE tenant_id=v_tid AND code='WHT-SA-SVC';
    SELECT id INTO v_trs FROM control.tax_rate_schedule
     WHERE tenant_id=v_tid AND jurisdiction_id=v_jur AND tax_type_id=v_tt
       AND tax_direction='PAYMENT' AND COALESCE(component_code,'')='MAIN' LIMIT 1;
    IF v_trs IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value, recoverability_mode,
            calculation_basis, rounding_stage, wht_basis, wht_certificate_required,
            effective_from, status, created_by
        ) VALUES (
            v_tid, v_jur, v_tt, 'PAYMENT',
            'MAIN','PERCENT',5.00,'NONE',
            'LINE_NET','LINE','GROSS',true,
            '2018-01-01','active',v_sys
        ) RETURNING id INTO v_trs;
    END IF;

    SELECT id INTO v_tg FROM control.tax_group WHERE tenant_id=v_tid AND code='TG-SA-WHT-5-SVC';
    IF v_tg IS NULL THEN
        INSERT INTO control.tax_group (tenant_id, code, name, status, created_by)
        VALUES (v_tid,'TG-SA-WHT-5-SVC','Saudi WHT 5% Services','active',v_sys)
        RETURNING id INTO v_tg;
        INSERT INTO control.tax_group_component (tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, status, created_by)
        VALUES (v_tid, v_tg, v_trs, 10, 'active', v_sys);
    END IF;

    -- ── EG: Tax jurisdiction ──────────────────────────────────────────────
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, jurisdiction_type, country_code, status, created_by)
    SELECT v_tid,'EG-ETA','Egyptian Tax Authority','COUNTRY','EG','active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='EG-ETA');

    INSERT INTO master.tax_type (tenant_id, code, name, category, is_recoverable, status, created_by)
    SELECT v_tid,'VAT-EG','Egypt VAT 14%','INDIRECT',true,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_type WHERE tenant_id=v_tid AND code='VAT-EG');

    INSERT INTO master.tax_type (tenant_id, code, name, category, is_deducted_at_source, status, created_by)
    SELECT v_tid,'WHT-EG-SVC','Egypt WHT on Services 10%','WITHHOLDING',true,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_type WHERE tenant_id=v_tid AND code='WHT-EG-SVC');

    SELECT id INTO v_jur FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='EG-ETA';
    SELECT id INTO v_tt  FROM master.tax_type          WHERE tenant_id=v_tid AND code='VAT-EG';
    SELECT id INTO v_trs FROM control.tax_rate_schedule
     WHERE tenant_id=v_tid AND jurisdiction_id=v_jur AND tax_type_id=v_tt
       AND tax_direction='PURCHASE' AND COALESCE(component_code,'')='MAIN' LIMIT 1;
    IF v_trs IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value, recoverability_mode, recoverability_percent,
            calculation_basis, rounding_stage, effective_from, status, created_by
        ) VALUES (
            v_tid, v_jur, v_tt, 'PURCHASE',
            'MAIN','PERCENT',14.00,'FULL',100.00,
            'LINE_NET','LINE','2016-09-08','active',v_sys
        ) RETURNING id INTO v_trs;
    END IF;
    SELECT id INTO v_tg FROM control.tax_group WHERE tenant_id=v_tid AND code='TG-EG-VAT-14-IN';
    IF v_tg IS NULL THEN
        INSERT INTO control.tax_group (tenant_id, code, name, status, created_by)
        VALUES (v_tid,'TG-EG-VAT-14-IN','Egypt VAT 14% Input','active',v_sys)
        RETURNING id INTO v_tg;
        INSERT INTO control.tax_group_component (tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, status, created_by)
        VALUES (v_tid, v_tg, v_trs, 10, 'active', v_sys);
    END IF;

    SELECT id INTO v_tt FROM master.tax_type WHERE tenant_id=v_tid AND code='WHT-EG-SVC';
    SELECT id INTO v_trs FROM control.tax_rate_schedule
     WHERE tenant_id=v_tid AND jurisdiction_id=v_jur AND tax_type_id=v_tt
       AND tax_direction='PAYMENT' AND COALESCE(component_code,'')='MAIN' LIMIT 1;
    IF v_trs IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value, recoverability_mode,
            calculation_basis, rounding_stage, wht_basis, wht_certificate_required,
            effective_from, status, created_by
        ) VALUES (
            v_tid, v_jur, v_tt, 'PAYMENT',
            'MAIN','PERCENT',10.00,'NONE',
            'LINE_NET','LINE','GROSS',true,
            '2016-09-08','active',v_sys
        ) RETURNING id INTO v_trs;
    END IF;
    SELECT id INTO v_tg FROM control.tax_group WHERE tenant_id=v_tid AND code='TG-EG-WHT-10-SVC';
    IF v_tg IS NULL THEN
        INSERT INTO control.tax_group (tenant_id, code, name, status, created_by)
        VALUES (v_tid,'TG-EG-WHT-10-SVC','Egypt WHT 10% Services','active',v_sys)
        RETURNING id INTO v_tg;
        INSERT INTO control.tax_group_component (tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, status, created_by)
        VALUES (v_tid, v_tg, v_trs, 10, 'active', v_sys);
    END IF;

    -- ── Payment methods ───────────────────────────────────────────────────
    INSERT INTO master.payment_method (tenant_id, code, name, direction, instrument_mode, status, created_by)
    SELECT v_tid, code, name, direction, 'bank_transfer', 'active', v_sys
    FROM (VALUES
        ('SARIE-SAR','SAR Wire Transfer (SARIE)','outbound'),
        ('SADAD-SAR','SAR Collection (SADAD)','inbound'),
        ('WIRE-EGP','EGP Wire Transfer','outbound'),
        ('RTGS-EGP','EGP RTGS Collection','inbound'),
        ('WIRE-GBP','GBP Wire Transfer','outbound'),
        ('WIRE-USD','USD Wire Transfer','outbound'),
        ('WIRE-EUR','EUR Wire Transfer','outbound')
    ) AS v(code,name,direction)
    WHERE NOT EXISTS (SELECT 1 FROM master.payment_method WHERE tenant_id=v_tid AND code=v.code);

    -- ── Payment terms ─────────────────────────────────────────────────────
    INSERT INTO master.payment_term (
        tenant_id, code, name, version, is_current_version,
        applicable_to, base_event, due_rule_type, due_days,
        due_date_flexibility, business_day_convention, status, created_by)
    SELECT v_tid, code, name, 1, true, 'BOTH', 'INVOICE_DATE',
           'NET_DAYS', days, 'FIXED', 'FOLLOWING', 'active', v_sys
    FROM (VALUES
        ('PT-NET30','Net 30 Days',30),
        ('PT-NET45','Net 45 Days',45),
        ('PT-NET60','Net 60 Days',60)
    ) AS v(code,name,days)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.payment_term
         WHERE tenant_id=v_tid AND code=v.code AND is_current_version=true);

    -- ── Certification types (platform-level: tenant_id = NULL) ────────────
    INSERT INTO master.certification_type (
        tenant_id, code, name, issuing_body, category, description, is_custom, metadata, status, created_by)
    SELECT NULL, code, name, body, cat, descr, false,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb, 'active', v_sys
    FROM (VALUES
        ('iso-9001',
         'ISO 9001 Quality Management Systems',
         'International Organization for Standardization',
         'quality',
         'Requirements for a quality management system (QMS).'),
        ('iso-14001',
         'ISO 14001 Environmental Management Systems',
         'International Organization for Standardization',
         'esg',
         'Framework for managing environmental responsibilities.'),
        ('iso-27001',
         'ISO/IEC 27001 Information Security Management',
         'International Organization for Standardization',
         'information_security',
         'Requirements for establishing and maintaining an ISMS.'),
        ('iso-45001',
         'ISO 45001 Occupational Health and Safety',
         'International Organization for Standardization',
         'safety',
         'Requirements for an OH&S management system.'),
        ('halal-gsas',
         'GSAS Halal Certification',
         'Gulf Standardization Organization',
         'halal',
         'GCC Halal Standard conformity for products and processes.'),
        ('zatca-einv',
         'ZATCA Phase 2 e-Invoicing Compliance',
         'Zakat Tax and Customs Authority',
         'financial',
         'Saudi Arabia mandatory e-invoicing (Fatoorah) Phase 2 compliance.')
    ) AS v(code,name,body,cat,descr)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.certification_type
         WHERE tenant_id IS NULL AND code = v.code);

    RAISE NOTICE '[tksa_ref] Reference data ensured (SA+EG tax, payment methods, cert types).';
END $tksa_ref$;


-- ============================================================================
-- §INT  Internal BPs — one per legal entity (TKSA, SSK, TEGY, SDTX)
--       partner_category = 'internal'; no supplier/customer extension.
-- ============================================================================
DO $tksa_internal_bps$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_bp   uuid;
    v_addr uuid;
    v_cp   uuid;

    -- group holding BP (TKSA is the parent)
    v_parent_bp uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    -- ── INT-1: Technostat Group HQ (TKSA) ────────────────────────────────
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        tags, metadata, status, created_by)
    SELECT
        v_tid, 'INT-TKSA', 'Technostat Group HQ', 'Technostat HQ',
        'Technostat Group Company',
        'internal',
        'Principal holding entity for the Technostat Group, registered in Saudi Arabia.',
        'CR-1010123456', 'SA',
        'https://www.technostat.com.sa', 'ERP-INT-TKSA',
        'Technostat Group HQ (TKSA) is the Saudi-registered parent entity of the group, '
        'headquartered in Riyadh. Oversees KSA operations across ICT, digital transformation, '
        'and satellite communication sectors.',
        ARRAY['Technostat KSA','TKSA HQ'],
        ARRAY['professional_services','technology'],
        'joint_stock',   2010,
        'e201_500',      'r50m_100m',
        '2010-03-15'::date,
        '["ksa","ict","holding","internal"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','100000001','legacy','TKSA-INT')
        ),
        'active', v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-TKSA');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-TKSA';
    v_parent_bp := v_bp;

    -- TKSA: HQ address
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-int-tksa-hq','Technostat HQ — Riyadh','commercial',
        'Attn: Group Secretariat',
        'King Fahd Road, Al Olaya District','Al Faisaliah Tower, 22nd Floor',
        'Riyadh','Riyadh Region','12214','SA',
        'Al Faisaliah Tower, 22nd Floor, King Fahd Road, Al Olaya, Riyadh 12214, Saudi Arabia',
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-int-tksa-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN
        SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-int-tksa-hq';
    END IF;
    INSERT INTO master.address_link (tenant_id, owner_type, owner_id, address_id, purpose, is_primary, effective_from, metadata, created_by)
    VALUES (v_tid,'business_partner',v_bp,v_addr,'hq',true,'2010-03-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,address_id) DO NOTHING;

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-int-tksa-po','Technostat HQ — PO Box','po_box','Attn: Finance Department',
        'P.O. Box 10234','Riyadh','Riyadh Region','11433','SA',
        'P.O. Box 10234, Riyadh 11433, Saudi Arabia',
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-int-tksa-po')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-int-tksa-po'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp,v_addr,'mailing',true,'2010-03-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,address_id) DO NOTHING;

    -- TKSA: identifiers
    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('crn','CR-1010123456','Ministry of Commerce KSA','2010-03-15',true),
        ('tin','310100145600003','ZATCA','2010-04-01',false),
        ('vat_reg','310100145600003','ZATCA','2018-01-01',false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    -- TKSA: contact person
    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Mohammed Al-Qahtani','Group CEO',true,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Mohammed Al-Qahtani')
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp,'email','m.alqahtani@technostat.com.sa','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966112341234','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- TKSA: governance
    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,cname,title,pct,scls,apt::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','HRH Prince Abdulaziz Al-Saud','individual',NULL,'Chairman of the Board',NULL,NULL,'2010-03-15'),
        ('ubo','Al-Madar Investments Holding WLL','company','Al-Madar Investments Holding WLL','Ultimate Beneficial Owner',68.50,'ordinary','2010-03-15'),
        ('shareholder','Public Investment Fund (PIF)','company','Public Investment Fund (PIF)','Strategic Shareholder',31.50,'ordinary','2015-06-01')
    ) AS v(rel,name,mtype,cname,title,pct,scls,apt)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp
           AND relation_type=v.rel AND member_name=v.name);

    RAISE NOTICE '[tksa_internal_bps] INT-TKSA seeded (id=%)', v_bp;

    -- ── INT-2: SSK Saudi Operations (SSK) ────────────────────────────────
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        parent_business_partner_id,
        tags, metadata, status, created_by)
    SELECT
        v_tid, 'INT-SSK', 'SSK Saudi Operations', 'SSK Saudi',
        'Saudi Systems and Knowhow Company',
        'internal',
        'Subsidiary of Technostat Group providing IT systems integration services in Saudi Arabia.',
        'CR-4030234567', 'SA',
        'https://www.ssk.com.sa', 'ERP-INT-SSK',
        'SSK Saudi Operations (SSK) is the Jeddah-based subsidiary of Technostat Group, '
        'specialising in enterprise systems integration and managed IT services for the Western Region.',
        ARRAY['SSK','Saudi Systems'],
        ARRAY['professional_services','technology'],
        'limited_liability', 2014,
        'e51_200',          'r10m_50m',
        '2014-06-20'::date,
        v_parent_bp,
        '["ksa","systems-integration","subsidiary","internal"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','100000002','legacy','SSK-INT')
        ),
        'active', v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-SSK');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-SSK';

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, region, postal_code, country_code, formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-int-ssk-hq','SSK Jeddah HQ','commercial','Attn: Managing Director',
        'Prince Mohammed Bin Abdulaziz Road','Al Hamra Business Center, 8th Floor',
        'Jeddah','Makkah Region','23332','SA',
        'Al Hamra Business Center, 8th Floor, Prince Mohammed Bin Abdulaziz Road, Jeddah 23332, Saudi Arabia',
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-int-ssk-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-int-ssk-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp,v_addr,'hq',true,'2014-06-20','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,address_id) DO NOTHING;

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('crn','CR-4030234567','Ministry of Commerce KSA','2014-06-20',true),
        ('tin','310200234500003','ZATCA','2014-07-01',false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Faisal Al-Harbi','Managing Director',true,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Faisal Al-Harbi')
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp,'email','f.alharbi@ssk.com.sa','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966126543210','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,cname,title,pct,scls,apt::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Faisal Al-Harbi','individual',NULL,'Managing Director',NULL,NULL,'2014-06-20'),
        ('ubo','Technostat Group HQ (TKSA)','company','Technostat Group HQ (TKSA)','Parent Shareholder',100.0,'ordinary','2014-06-20')
    ) AS v(rel,name,mtype,cname,title,pct,scls,apt)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp
           AND relation_type=v.rel AND member_name=v.name);

    RAISE NOTICE '[tksa_internal_bps] INT-SSK seeded (id=%)', v_bp;

    -- ── INT-3: Technostat Egypt Ops (TEGY) ───────────────────────────────
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        parent_business_partner_id,
        tags, metadata, status, created_by)
    SELECT
        v_tid, 'INT-TEGY', 'Technostat Egypt Ops', 'Technostat Egypt',
        'Technostat Egypt for Information Technology S.A.E.',
        'internal',
        'Egyptian subsidiary of Technostat Group focused on IT solutions and digital services.',
        'EG-COM-2015-123456', 'EG',
        'https://www.technostat.com.eg', 'ERP-INT-TEGY',
        'Technostat Egypt Ops (TEGY) is the Cairo-based Egyptian subsidiary of Technostat Group, '
        'providing digital transformation services, cloud solutions, and IT consulting '
        'to public and private sector clients across Egypt and North Africa.',
        ARRAY['Technostat Egypt','TEGY'],
        ARRAY['professional_services','technology'],
        'joint_stock',   2015,
        'e51_200',       'r10m_50m',
        '2015-09-01'::date,
        v_parent_bp,
        '["egypt","ict","digital","subsidiary","internal"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','100000003','legacy','TEGY-INT')
        ),
        'active', v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-TEGY');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-TEGY';

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, line3, city, region, postal_code, country_code, formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-int-tegy-hq','Technostat Egypt — Smart Village','commercial','Attn: Country Manager',
        'Smart Village, Cairo–Alexandria Desert Road','Building B174, 3rd Floor',NULL,
        'Giza','Giza Governorate','12577','EG',
        'Building B174, 3rd Floor, Smart Village, Cairo–Alexandria Desert Road, Giza 12577, Egypt',
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-int-tegy-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-int-tegy-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp,v_addr,'hq',true,'2015-09-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,address_id) DO NOTHING;

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('crn','EG-COM-2015-123456','Egyptian GAFI','2015-09-01',true),
        ('tin','200-456-789','Egyptian Tax Authority','2015-10-01',false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Dr. Ahmed Nasser','Country General Manager',true,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Dr. Ahmed Nasser')
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp,'email','a.nasser@technostat.com.eg','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20223456789','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,cname,title,pct,scls,apt::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Dr. Ahmed Nasser','individual',NULL,'Country General Manager',NULL,NULL,'2015-09-01'),
        ('ubo','Technostat Group HQ (TKSA)','company','Technostat Group HQ (TKSA)','Parent Shareholder',100.0,'ordinary','2015-09-01')
    ) AS v(rel,name,mtype,cname,title,pct,scls,apt)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp
           AND relation_type=v.rel AND member_name=v.name);

    RAISE NOTICE '[tksa_internal_bps] INT-TEGY seeded (id=%)', v_bp;

    -- ── INT-4: Satellites for Digital Transformation (SDTX) ──────────────
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        parent_business_partner_id,
        tags, metadata, status, created_by)
    SELECT
        v_tid, 'INT-SDTX', 'Satellites for Digital Transformation', 'SDTX',
        'Satellites for Digital Transformation Egypt LLC',
        'internal',
        'Egyptian specialist subsidiary providing satellite communications and digital transformation solutions.',
        'EG-COM-2018-789012', 'EG',
        'https://www.sdtx.com.eg', 'ERP-INT-SDTX',
        'SDTX (Satellites for Digital Transformation) is an Egyptian LLC specialising in '
        'satellite connectivity, IoT, and digital transformation infrastructure for '
        'government and enterprise clients across Egypt and sub-Saharan Africa.',
        ARRAY['SDTX','Satellites DT'],
        ARRAY['technology','professional_services'],
        'limited_liability', 2018,
        'e11_50',            'r1m_10m',
        '2018-04-10'::date,
        v_parent_bp,
        '["egypt","satellite","iot","digital","subsidiary","internal"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','100000004','legacy','SDTX-INT')
        ),
        'active', v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-SDTX');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='INT-SDTX';

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, region, postal_code, country_code, formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-int-sdtx-hq','SDTX Cairo Office','commercial','Attn: Operations Director',
        'Al-Nozha Street, Heliopolis','Nile City Towers, North Tower, 15th Floor',
        'Cairo','Cairo Governorate','11843','EG',
        'Nile City Towers, North Tower, 15th Floor, Al-Nozha Street, Heliopolis, Cairo 11843, Egypt',
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-int-sdtx-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-int-sdtx-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp,v_addr,'hq',true,'2018-04-10','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,address_id) DO NOTHING;

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('crn','EG-COM-2018-789012','Egyptian GAFI','2018-04-10',true),
        ('tin','201-987-654','Egyptian Tax Authority','2018-05-01',false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Eng. Rania Ibrahim','Managing Director',true,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Eng. Rania Ibrahim')
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp,'email','r.ibrahim@sdtx.com.eg','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20226543210','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,cname,title,pct,scls,apt::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Eng. Rania Ibrahim','individual',NULL,'Managing Director',NULL,NULL,'2018-04-10'),
        ('ubo','Technostat Egypt Ops (TEGY)','company','Technostat Egypt Ops (TEGY)','Parent Shareholder',70.0,'ordinary','2018-04-10'),
        ('shareholder','Egyptian Space Agency','company','Egyptian Space Agency','Strategic Partner',30.0,'ordinary','2018-04-10')
    ) AS v(rel,name,mtype,cname,title,pct,scls,apt)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp
           AND relation_type=v.rel AND member_name=v.name);

    RAISE NOTICE '[tksa_internal_bps] INT-SDTX seeded (id=%)', v_bp;
    RAISE NOTICE '[tksa_internal_bps] Done — 4 internal BPs seeded.';
END $tksa_internal_bps$;


-- ============================================================================
-- §SA1  KSA Supplier 1 — Al Madar Technology Solutions LLC  (SA → TKSA)
-- ============================================================================
DO $tksa_sa_sup1$
DECLARE
    v_tid  uuid;
    v_sys   uuid := '00000000-0000-0000-0000-000000000000';
    v_bp    uuid;
    v_sup   uuid;
    v_cc    uuid;
    v_addr  uuid;
    v_ba    uuid;
    v_bal   uuid;
    v_cp1   uuid;
    v_cp2   uuid;
    v_ct1   uuid;
    v_ct2   uuid;
    v_tg_vat uuid;
    v_tg_wht uuid;
    v_pm    uuid;
    v_pt    uuid;
    v_acct  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code      WHERE tenant_id=v_tid AND code='TKSA';
    SELECT id INTO v_tg_vat  FROM control.tax_group        WHERE tenant_id=v_tid AND code='TG-SA-VAT-15-IN';
    SELECT id INTO v_tg_wht  FROM control.tax_group        WHERE tenant_id=v_tid AND code='TG-SA-WHT-5-SVC';
    SELECT id INTO v_pm      FROM master.payment_method    WHERE tenant_id=v_tid AND code='SARIE-SAR';
    SELECT id INTO v_pt      FROM master.payment_term      WHERE tenant_id=v_tid AND code='PT-NET30' AND is_current_version=true LIMIT 1;
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AP_NON_PO_STANDARD';
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-45001';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_sa_sup1] TKSA company code not found'; END IF;

    -- §BP
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        tags, metadata, status, created_by)
    SELECT v_tid,
        'SUP-KSA-01','Al Madar Technology Solutions LLC','Al Madar Tech',
        'Al Madar Technology Solutions Limited Liability Company',
        'organization',
        'Leading Saudi ICT solutions provider specialising in enterprise infrastructure and managed services.',
        'CR-1010456789','SA',
        'https://www.almadar-tech.com.sa','ERP-SUP-AMTS-001',
        'Al Madar Technology Solutions LLC was founded in 2012 in Riyadh. '
        'The company delivers end-to-end ICT infrastructure design, implementation, and managed services '
        'to major Saudi government and private sector clients. ZATCA Phase 2 e-invoicing compliant.',
        ARRAY['Al Madar','AMTS','AlMadar Tech'],
        ARRAY['professional_services','technology'],
        'limited_liability', 2012,
        'e201_500',          'r50m_100m',
        '2012-07-01'::date,
        '["ksa","ict","managed-services","preferred-supplier"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','400000101','ariba','AN01234567890'),
            'procurement', jsonb_build_object('category','ict_services','lead_time_days',14,'preferred',true)
        ),
        'active', v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-01';

    -- §Addresses
    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-amts-hq','Al Madar HQ Riyadh','commercial','Attn: Accounts Payable',
         'King Abdulaziz Road, Al Malga District','Malga Business Park, Tower B, 12th Floor',
         'Riyadh','Riyadh Region','13521','SA',
         'Malga Business Park, Tower B, 12F, King Abdulaziz Road, Al Malga, Riyadh 13521, SA'),
        ('addr-amts-billing','Al Madar Billing Address','po_box','Attn: Finance Department',
         'P.O. Box 54321',NULL,
         'Riyadh','Riyadh Region','11544','SA',
         'P.O. Box 54321, Riyadh 11544, Saudi Arabia'),
        ('addr-amts-wh','Al Madar Logistics Hub','warehouse','Attn: Logistics Manager',
         'Second Industrial City, Street 14','Warehouse Block C, Unit 7',
         'Riyadh','Riyadh Region','14511','SA',
         'Warehouse Block C/7, Second Industrial City, Riyadh 14511, Saudi Arabia')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    -- §Supplier
    INSERT INTO master.supplier (tenant_id,business_partner_id,supplier_code,supplier_type,
        is_payment_ready,payment_ready_at,payment_ready_by,payment_ready_reason,
        metadata,status,created_by)
    SELECT v_tid,v_bp,'SUP-TKSA-AMTS-001','service',
        true,'2023-03-01 09:00+03'::timestamptz,v_sys,'Bank account verified; onboarding complete.',
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TKSA-AMTS-001');

    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TKSA-AMTS-001';

    -- §Address links — HQ and billing anchored at BP (fn_resolve_party_address fallback chain)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2012-07-01',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-amts-hq','hq',true),('addr-amts-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (
        SELECT 1 FROM master.address_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    -- Logistics warehouse is supplier-operational, not a canonical BP address
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,'remittance',true,'2012-07-01',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM master.address a
    WHERE a.tenant_id=v_tid AND a.code='addr-amts-wh'
      AND NOT EXISTS (
        SELECT 1 FROM master.address_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose='remittance' AND address_id=a.id);

    -- §Bank account
    SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-amts-sar-01';
    IF v_ba IS NULL THEN
        INSERT INTO master.bank_account (
            tenant_id,code,name,account_holder_name,
            account_id_type,account_id_value,account_last4,
            currency_code,bic_override,bank_name_override,bank_country_override,
            account_nature,is_verified,verified_at,metadata,status,created_by)
        VALUES (v_tid,'ba-amts-sar-01','Al Madar — Al Rajhi Bank SAR',
            'Al Madar Technology Solutions LLC',
            'iban','SA0420000001100123456789','6789',
            'SAR','RJHISASS','Al Rajhi Bank','SA',
            'direct',true,now(),
            '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        RETURNING id INTO v_ba;
    END IF;

    SELECT id INTO v_bal FROM master.bank_account_link
     WHERE tenant_id=v_tid AND bank_account_id=v_ba AND owner_type='business_partner' AND owner_id=v_bp AND purpose='disbursement';
    IF v_bal IS NULL THEN
        INSERT INTO master.bank_account_link (tenant_id,bank_account_id,owner_type,owner_id,
            company_code_id,purpose,is_primary,effective_from,metadata,created_by)
        VALUES (v_tid,v_ba,'business_partner',v_bp,v_cc,'disbursement',true,'2023-03-01',
            '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
        RETURNING id INTO v_bal;
    END IF;

    -- §Company profile
    INSERT INTO master.company_code_supplier_profile (
        tenant_id,supplier_id,company_code_id,
        payment_term_id,payment_method_id,currency_code,
        default_accounting_profile_id,preferred_remittance_bank_link_id,
        tax_group_id,default_wht_tax_group_id,
        default_dimension_set_id,invoice_hold_policy_id,
        is_blocked,block_reason,metadata,status,created_by)
    SELECT v_tid,v_sup,v_cc,
        v_pt,v_pm,'SAR',
        v_acct,v_bal,
        v_tg_vat,v_tg_wht,
        NULL,NULL,false,NULL,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),
                           'notes','Primary AP profile — TKSA/SAR'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile WHERE tenant_id=v_tid AND supplier_id=v_sup AND company_code_id=v_cc);

    -- §Identifiers: DUNS, LEI, CRN, TIN, VAT, PEPPOL
    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',       '310100001',            'Dun & Bradstreet',        '2018-01-01', NULL,         true),
        ('lei',        '984500AMTSSA0000SA01', 'GLEIF',                   '2021-03-01', '2026-03-01', false),
        ('crn',        'CR-1010456789',        'Ministry of Commerce KSA','2012-07-01', NULL,         false),
        ('tin',        '310000456789000001',   'ZATCA',                   '2012-08-01', NULL,         false),
        ('vat_reg',    '310000456789000001',   'ZATCA',                   '2018-01-01', NULL,         false),
        ('peppol_id',  '0193:3100004567890000','ZATCA',                   '2023-01-01', NULL,         false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    -- §Tax profile (SA)
    INSERT INTO master.party_tax_profile (
        tenant_id,owner_type,owner_id,country_code,
        penalty_information,discount_information,global_location_number,
        tax_classification,taxation_type,
        tax_id,vat_id,vat_registered,
        has_tax_clearance,tax_clearance_number,tax_clearance_expiry_date,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,'SA',
        'Late payment: 2% per month after 30 days per ZATCA guidelines.',
        'Early settlement: 1.5% discount if paid within 7 days of invoice.',
        '6281100045678',
        'company','standard',
        '310000456789000001','310000456789000001',true,
        true,'TCN-SA-2024-AMTS-001','2025-12-31'::date,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND country_code='SA');

    -- §Certifications
    INSERT INTO master.certification (
        tenant_id,owner_type,owner_id,certification_type_id,custom_name,
        certificate_number,certified_by,certified_location,additional_info,
        effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,ct_id,NULL,cert_no,cert_by,cert_loc,info,
           eff_from::date,eff_until::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-SA-AMTS-2022-0081','Bureau Veritas Saudi Arabia','Riyadh, KSA',
         'Scope: Design, supply and support of enterprise ICT infrastructure.','2022-11-01','2025-10-31'),
        (v_ct2,'ISO45001-SA-AMTS-2023-0034','SGS Saudi Arabia','Riyadh, KSA',
         'Scope: Occupational health and safety for field engineering operations.','2023-05-15','2026-05-14')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Khalid Al-Dosari','Procurement Director',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Khalid Al-Dosari')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Sara Al-Zahrani','Accounts Payable Manager',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Sara Al-Zahrani')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp1,'bid_proposal_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp,'email','k.aldosari@almadar-tech.com.sa','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966114567890','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp2,'accounts_payable',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp,'email','ap@almadar-tech.com.sa','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966114567891','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §Governance: CEO (director), holding company (UBO), minority shareholder
    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,
        ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,co,title,pct,scls,apt::date,notes,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Abdulrahman Al-Shammari','individual',NULL,'Chief Executive Officer',NULL,NULL,'2012-07-01','Founding CEO.'),
        ('ubo','Al-Madar Group Holding LLC','company','Al-Madar Group Holding LLC','Ultimate Beneficial Owner',70.0,'ordinary','2012-07-01','Majority owner, registered in Riyadh.'),
        ('shareholder','Riyadh Venture Capital Fund','company','Riyadh Venture Capital Fund','Growth Investor',30.0,'preference','2019-01-10','Series B preferred shareholder since 2019.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND relation_type=v.rel AND member_name=v.name);

    -- §Network link (Ariba)
    INSERT INTO master.business_partner_network_link (
        tenant_id,business_partner_id,provider_code,network_account_id,
        connection_status,verification_status,match_confidence,sync_status,last_synced_at,
        network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'ariba','AN01234567890',
        'connected','verified',98,'synced',now(),
        '{"profile":{"name":"Al Madar Technology Solutions","country":"SA"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner_network_link
         WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='ariba');

    -- §Qualification
    INSERT INTO master.supplier_qualification (
        tenant_id,supplier_id,
        onboarding_status,profile_completeness_pct,
        onboarding_approved_at,onboarding_approved_by,
        is_approved_supplier,is_preferred_supplier,is_blocked,
        risk_tier,sanctions_status,aml_kyc_status,
        sanctions_check_date,kyc_expiry_date,
        sourcing_event_count,bid_count,awarded_count,
        delivery_score,quality_score,sla_score,
        score_period_start,score_period_end,
        last_review_date,next_review_date,reviewed_by,
        metadata,status,created_by)
    SELECT v_tid,v_sup,
        'approved',100,
        '2023-03-01 09:00+03'::timestamptz,v_sys,
        true,true,false,
        'low','clear','passed',
        '2025-01-15'::date,'2026-01-15'::date,
        18,14,11,
        97.50,95.80,98.10,
        '2024-01-01'::date,'2024-12-31'::date,
        '2025-01-15'::date,'2026-01-15'::date,v_sys,
        jsonb_build_object(
            '_seed',jsonb_build_object('pack','tksa_party_master_v1'),
            'review_notes','Annual review passed. Preferred status maintained. No adverse findings.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup);

    RAISE NOTICE '[tksa_sa_sup1] SUP-TKSA-AMTS-001 seeded (bp=%, sup=%)', v_bp, v_sup;
END $tksa_sa_sup1$;


-- ============================================================================
-- §SA2  KSA Supplier 2 — Arabian Network Infrastructure Co.  (SA → SSK)
-- ============================================================================
DO $tksa_sa_sup2$
DECLARE
    v_tid  uuid;
    v_sys   uuid := '00000000-0000-0000-0000-000000000000';
    v_bp    uuid;
    v_sup   uuid;
    v_cc    uuid;
    v_addr  uuid;
    v_ba    uuid;
    v_bal   uuid;
    v_cp1   uuid;
    v_cp2   uuid;
    v_ct1   uuid;
    v_ct2   uuid;
    v_tg_vat uuid;
    v_tg_wht uuid;
    v_pm    uuid;
    v_pt    uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code   WHERE tenant_id=v_tid AND code='SSK';
    SELECT id INTO v_tg_vat  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-SA-VAT-15-IN';
    SELECT id INTO v_tg_wht  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-SA-WHT-5-SVC';
    SELECT id INTO v_pm      FROM master.payment_method WHERE tenant_id=v_tid AND code='SARIE-SAR';
    SELECT id INTO v_pt      FROM master.payment_term   WHERE tenant_id=v_tid AND code='PT-NET45' AND is_current_version=true LIMIT 1;
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-14001';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_sa_sup2] SSK company code not found'; END IF;

    -- §BP
    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'SUP-KSA-02','Arabian Network Infrastructure Co.','ANIC',
        'Arabian Network Infrastructure Company',
        'organization',
        'Saudi specialist contractor for network infrastructure, civil works and data centre builds.',
        'CR-4030567890','SA',
        'https://www.anic-sa.com','ERP-SUP-ANIC-001',
        'Arabian Network Infrastructure Co. (ANIC), established 2016 in Jeddah, provides '
        'full-lifecycle network infrastructure services including fibre optic deployment, '
        'passive network components, and data centre fit-out across the Kingdom.',
        ARRAY['ANIC','Arabian Network','Arabian Net Infra'],
        ARRAY['construction','technology'],
        'limited_liability', 2016,
        'e51_200',           'r10m_50m',
        '2016-02-15'::date,
        '["ksa","network-infra","contractor","jeddah"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','400000102'),
            'procurement', jsonb_build_object('category','network_infrastructure','lead_time_days',21)
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-02');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-02';

    -- §Addresses
    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-anic-hq','ANIC HQ Jeddah','commercial','Attn: Contracts Department',
         'Prince Sultan Street, Al-Rawdah District','Al-Rawdah Business Tower, 6th Floor',
         'Jeddah','Makkah Region','23523','SA',
         'Al-Rawdah Business Tower, 6F, Prince Sultan St, Al-Rawdah, Jeddah 23523, SA'),
        ('addr-anic-billing','ANIC PO Box','po_box','Attn: Finance',
         'P.O. Box 33456',NULL,
         'Jeddah','Makkah Region','21471','SA',
         'P.O. Box 33456, Jeddah 21471, Saudi Arabia'),
        ('addr-anic-site','ANIC KAEC Operations Site','industrial','Attn: Site Manager',
         'King Abdullah Economic City, Technology Zone','Plot 14, Phase 2',
         'Rabigh','Makkah Region','25964','SA',
         'Plot 14 Phase 2, Technology Zone, King Abdullah Economic City, Rabigh 25964, SA')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    -- §Supplier
    INSERT INTO master.supplier (tenant_id,business_partner_id,supplier_code,supplier_type,
        is_payment_ready,payment_ready_at,payment_ready_by,payment_ready_reason,
        metadata,status,created_by)
    SELECT v_tid,v_bp,'SUP-SSK-ANIC-001','contractor',
        true,'2024-01-10 09:00+03'::timestamptz,v_sys,'Approved contractor — bank details verified.',
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SSK-ANIC-001');

    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SSK-ANIC-001';

    -- §Address links — HQ and billing anchored at BP; KAEC site stays at supplier (operational)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2016-02-15',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-anic-hq','hq',true),('addr-anic-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (
        SELECT 1 FROM master.address_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,'remittance',true,'2016-02-15',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM master.address a
    WHERE a.tenant_id=v_tid AND a.code='addr-anic-site'
      AND NOT EXISTS (
        SELECT 1 FROM master.address_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose='remittance' AND address_id=a.id);

    -- §Bank account
    SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-anic-sar-01';
    IF v_ba IS NULL THEN
        INSERT INTO master.bank_account (
            tenant_id,code,name,account_holder_name,
            account_id_type,account_id_value,account_last4,
            currency_code,bic_override,bank_name_override,bank_country_override,
            account_nature,is_verified,verified_at,metadata,status,created_by)
        VALUES (v_tid,'ba-anic-sar-01','ANIC — NCB/SNB SAR Account',
            'Arabian Network Infrastructure Company',
            'iban','SA0420000002200234567890','7890',
            'SAR','NCBKSAJE','Saudi National Bank','SA',
            'direct',true,now(),
            '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        RETURNING id INTO v_ba;
    END IF;

    SELECT id INTO v_bal FROM master.bank_account_link
     WHERE tenant_id=v_tid AND bank_account_id=v_ba AND owner_type='business_partner' AND owner_id=v_bp AND purpose='disbursement';
    IF v_bal IS NULL THEN
        INSERT INTO master.bank_account_link (tenant_id,bank_account_id,owner_type,owner_id,
            company_code_id,purpose,is_primary,effective_from,metadata,created_by)
        VALUES (v_tid,v_ba,'business_partner',v_bp,v_cc,'disbursement',true,'2024-01-10',
            '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
        RETURNING id INTO v_bal;
    END IF;

    -- §Company profile
    INSERT INTO master.company_code_supplier_profile (
        tenant_id,supplier_id,company_code_id,
        payment_term_id,payment_method_id,currency_code,
        preferred_remittance_bank_link_id,
        tax_group_id,default_wht_tax_group_id,
        is_blocked,metadata,status,created_by)
    SELECT v_tid,v_sup,v_cc,
        v_pt,v_pm,'SAR',
        v_bal,v_tg_vat,v_tg_wht,
        false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),
                           'notes','AP profile — SSK/SAR contractor'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile WHERE tenant_id=v_tid AND supplier_id=v_sup AND company_code_id=v_cc);

    -- §Identifiers
    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',      '310200002',            'Dun & Bradstreet',        '2020-06-01',NULL,         true),
        ('lei',       '984500ANICSA0000SA02','GLEIF',                   '2022-04-01','2027-04-01', false),
        ('crn',       'CR-4030567890',        'Ministry of Commerce KSA','2016-02-15',NULL,         false),
        ('tin',       '310000567890000002',   'ZATCA',                   '2016-03-01',NULL,         false),
        ('vat_reg',   '310000567890000002',   'ZATCA',                   '2018-01-01',NULL,         false),
        ('peppol_id', '0193:3100005678900002','ZATCA',                   '2023-06-01',NULL,         false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    -- §Tax profile
    INSERT INTO master.party_tax_profile (
        tenant_id,owner_type,owner_id,country_code,
        penalty_information,discount_information,global_location_number,
        tax_classification,taxation_type,
        tax_id,vat_id,vat_registered,
        has_tax_clearance,tax_clearance_number,tax_clearance_expiry_date,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,'SA',
        'Late payment: 2% per month after 45 days.',
        'No early settlement discount.',
        '6284200056789',
        'company','standard',
        '310000567890000002','310000567890000002',true,
        true,'TCN-SA-2024-ANIC-001','2025-12-31'::date,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_tax_profile WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND country_code='SA');

    -- §Certifications
    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-SA-ANIC-2023-0112','Intertek Saudi Arabia','Jeddah, KSA','Scope: Network infrastructure installation and commissioning.','2023-03-01','2026-02-28'),
        (v_ct2,'ISO14001-SA-ANIC-2023-0045','Intertek Saudi Arabia','Jeddah, KSA','Scope: Environmental management for construction and field operations.','2023-03-01','2026-02-28')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Tariq Al-Ghamdi','Chief Commercial Officer',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Tariq Al-Ghamdi')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Reem Al-Otaibi','Billing & Collections Officer',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Reem Al-Otaibi')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'bid_proposal_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','t.alghamdi@anic-sa.com','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966126789012','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'accounts_payable',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','billing@anic-sa.com','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966126789013','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §Governance
    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,co,title,pct,scls,apt::date,notes,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Nasser Al-Zahrani','individual',NULL,'Managing Director',NULL,NULL,'2016-02-15','Founding partner and MD.'),
        ('ubo','Arabian Communications Group','company','Arabian Communications Group','Principal Shareholder',65.0,'ordinary','2016-02-15','KSA-registered holding group.'),
        ('shareholder','Infrastructure Growth Partners','company','Infrastructure Growth Partners','Minority Investor',35.0,'preference','2021-03-01','PE fund — Series A preferred.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND relation_type=v.rel AND member_name=v.name);

    -- §Network link (PEPPOL)
    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'peppol','0193:3100005678900002','connected','verified',95,'synced',now(),
        '{"profile":{"name":"Arabian Network Infrastructure Co","country":"SA"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='peppol');

    -- §Qualification
    INSERT INTO master.supplier_qualification (
        tenant_id,supplier_id,onboarding_status,profile_completeness_pct,
        onboarding_approved_at,onboarding_approved_by,
        is_approved_supplier,is_preferred_supplier,is_blocked,
        risk_tier,sanctions_status,aml_kyc_status,
        sanctions_check_date,kyc_expiry_date,
        sourcing_event_count,bid_count,awarded_count,
        delivery_score,quality_score,sla_score,
        score_period_start,score_period_end,
        last_review_date,next_review_date,reviewed_by,
        metadata,status,created_by)
    SELECT v_tid,v_sup,'approved',98,
        '2024-01-10 09:00+03'::timestamptz,v_sys,
        true,false,false,
        'low','clear','passed',
        '2025-02-01'::date,'2026-02-01'::date,
        9,7,6,
        94.00,93.50,95.00,
        '2024-01-01'::date,'2024-12-31'::date,
        '2025-02-01'::date,'2026-02-01'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),
                           'review_notes','Approved contractor — not yet preferred status (3-year assessment cycle).'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup);

    RAISE NOTICE '[tksa_sa_sup2] SUP-SSK-ANIC-001 seeded (bp=%, sup=%)', v_bp, v_sup;
END $tksa_sa_sup2$;


-- ============================================================================
-- §SA3  KSA Customer 1 — Al Rajhi Digital Systems Co.  (SA → TKSA)
-- ============================================================================
DO $tksa_sa_cus1$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_cus    uuid;
    v_cc     uuid;
    v_addr   uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_tg_vat uuid;
    v_pm_in  uuid;
    v_pt     uuid;
    v_acct   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code    WHERE tenant_id=v_tid AND code='TKSA';
    SELECT id INTO v_tg_vat  FROM control.tax_group      WHERE tenant_id=v_tid AND code='TG-SA-VAT-15-IN';
    SELECT id INTO v_pm_in   FROM master.payment_method  WHERE tenant_id=v_tid AND code='SADAD-SAR';
    SELECT id INTO v_pt      FROM master.payment_term    WHERE tenant_id=v_tid AND code='PT-NET30' AND is_current_version=true LIMIT 1;
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AR_STANDARD' LIMIT 1;
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='zatca-einv';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_sa_cus1] TKSA company code not found'; END IF;

    -- §BP
    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'CUS-KSA-01','Al Rajhi Digital Systems Co.','Al Rajhi Digital',
        'Al Rajhi Digital Systems Company',
        'organization',
        'Saudi FinTech and digital banking solutions company, subsidiary of Al Rajhi Bank Group.',
        'CR-1010789012','SA',
        'https://www.ardigital.com.sa','CRM-CUS-ARDS-001',
        'Al Rajhi Digital Systems Co. is a wholly-owned subsidiary of Al Rajhi Banking & '
        'Investment Corporation, specialising in digital banking platforms, payment gateways, '
        'and financial technology infrastructure for the Saudi market.',
        ARRAY['Al Rajhi Digital','ARDS','ARD Systems'],
        ARRAY['financial_services','technology'],
        'joint_stock', 2017,
        'e201_500',    'r100m_500m',
        '2017-05-01'::date,
        '["ksa","fintech","digital-banking","key-account"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','200000201','legacy','CUS-ARDS-001'),
            'account_management', jsonb_build_object('tier','key','segment','enterprise')
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-KSA-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-KSA-01';

    -- §Addresses
    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-ards-hq','Al Rajhi Digital HQ','commercial','Attn: Supplier Management',
         'Al Rajhi Tower, King Abdulaziz Road','Digital Innovation Centre, 18th Floor',
         'Riyadh','Riyadh Region','11535','SA',
         'Al Rajhi Tower, 18F, King Abdulaziz Road, Riyadh 11535, Saudi Arabia'),
        ('addr-ards-billing','Al Rajhi Digital Billing','po_box','Attn: Accounts Payable',
         'P.O. Box 88812',NULL,
         'Riyadh','Riyadh Region','11462','SA',
         'P.O. Box 88812, Riyadh 11462, Saudi Arabia'),
        ('addr-ards-legal','Al Rajhi Digital Registered Office','commercial','Attn: Legal Affairs',
         'King Fahd Road, Al Olaya','Al Rajhi Headquarters Tower, 4th Floor (Legal)',
         'Riyadh','Riyadh Region','12214','SA',
         'Al Rajhi HQ Tower, 4F, King Fahd Road, Al Olaya, Riyadh 12214, Saudi Arabia')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    -- §Customer
    INSERT INTO master.customer (tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by)
    SELECT v_tid,v_bp,'CUS-TKSA-ARDS-001','corporate',true,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TKSA-ARDS-001');

    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TKSA-ARDS-001';

    -- §Address links — all three anchored at BP (hq/billing/legal are canonical identity)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2017-05-01',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-ards-hq','hq',true),('addr-ards-billing','billing',true),('addr-ards-legal','legal',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (
        SELECT 1 FROM master.address_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    -- §Company customer profile
    INSERT INTO master.company_code_customer_profile (
        tenant_id,customer_id,company_code_id,
        currency_code,credit_limit,credit_limit_currency_code,credit_rating,
        default_accounting_profile_id,default_receipt_method_id,tax_group_id,
        statement_cycle_code,is_blocked,metadata,status,created_by)
    SELECT v_tid,v_cus,v_cc,
        'SAR',10000000.0000,'SAR','aa',
        v_acct,v_pm_in,v_tg_vat,
        'monthly',false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),
                           'notes','Key account AR profile — TKSA/SAR'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile WHERE tenant_id=v_tid AND customer_id=v_cus AND company_code_id=v_cc);

    -- §Identifiers
    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',    '310300003',             'Dun & Bradstreet',        '2019-01-01',NULL,        true),
        ('lei',     '984500ARDSSA0000SA03', 'GLEIF',                   '2020-06-01','2025-06-01',false),
        ('crn',     'CR-1010789012',         'Ministry of Commerce KSA','2017-05-01',NULL,        false),
        ('tin',     '310000789012000003',    'ZATCA',                   '2017-06-01',NULL,        false),
        ('vat_reg', '310000789012000003',    'ZATCA',                   '2018-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND scheme=v.scheme);

    -- §Certifications
    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO27001-SA-ARDS-2024-0031','KPMG Al Fozan & Partners','Riyadh, KSA','Scope: Digital banking platform and payment infrastructure.','2024-02-01','2027-01-31'),
        (v_ct2,'ZATCA-EINV-ARDS-2023-PH2','ZATCA','Riyadh, KSA','Phase 2 e-invoicing integration approved.','2023-07-01','2099-12-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Bandar Al-Saud','Chief Financial Officer',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Bandar Al-Saud')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Mona Al-Rashidi','Supplier Relations Manager',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Mona Al-Rashidi')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'finance_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','b.alsaud@ardigital.com.sa','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966114501234','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'customer_care_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','vendor.relations@ardigital.com.sa','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966114501235','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §Governance
    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,rel,name,mtype,co,title,pct,scls,apt::date,notes,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Sulaiman Al-Rajhi','individual',NULL,'Chairman',NULL,NULL,'2017-05-01','Group Chairman overseeing digital subsidiary.'),
        ('ubo','Al Rajhi Banking & Investment Corporation','company','Al Rajhi Banking & Investment Corporation','100% Parent Shareholder',100.0,'ordinary','2017-05-01','Wholly-owned subsidiary of Al Rajhi Bank.'),
        ('signatory','Bandar Al-Saud','individual',NULL,'Authorised Signatory',NULL,NULL,'2020-01-01','CFO — authorised for contracts up to SAR 50M.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='customer' AND party_id=v_cus AND relation_type=v.rel AND member_name=v.name);

    -- §Network link
    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'peppol','0193:3100007890120003','connected','verified',96,'synced',now(),
        '{"profile":{"name":"Al Rajhi Digital Systems Co","country":"SA"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='peppol');

    -- §Qualification
    INSERT INTO master.customer_qualification (
        tenant_id,customer_id,
        credit_status,credit_limit_band,credit_score,credit_rating,
        dso_days,payment_behavior,has_overdue_history,
        kyc_status,aml_sanctions_status,beneficial_owner_check_status,
        kyc_check_date,kyc_expiry_date,
        is_dunning_eligible,is_statement_eligible,
        last_credit_review_date,next_credit_review_date,reviewer_id,
        metadata,status,created_by)
    SELECT v_tid,v_cus,
        'approved','sar_5m_50m',890,'aa',
        22,'excellent',false,
        'passed','clear','passed',
        '2025-02-15'::date,'2027-02-14'::date,
        true,true,
        '2025-02-15'::date,'2026-02-15'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),
                           'credit_notes','Excellent payment history. Al Rajhi Bank Group entity — top-tier credit rating.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus);

    RAISE NOTICE '[tksa_sa_cus1] CUS-TKSA-ARDS-001 seeded (bp=%, cus=%)', v_bp, v_cus;
END $tksa_sa_cus1$;


-- ============================================================================
-- §SA4  KSA Customer 2 — Saudi Telecom Holdings  (SA → SSK)
-- ============================================================================
DO $tksa_sa_cus2$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_cus    uuid;
    v_cc     uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_tg_vat uuid;
    v_pm_in  uuid;
    v_pt     uuid;
    v_acct   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code   WHERE tenant_id=v_tid AND code='SSK';
    SELECT id INTO v_tg_vat  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-SA-VAT-15-IN';
    SELECT id INTO v_pm_in   FROM master.payment_method WHERE tenant_id=v_tid AND code='SADAD-SAR';
    SELECT id INTO v_pt      FROM master.payment_term   WHERE tenant_id=v_tid AND code='PT-NET45' AND is_current_version=true LIMIT 1;
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AR_STANDARD' LIMIT 1;
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_sa_cus2] SSK company code not found'; END IF;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'CUS-KSA-02','Saudi Telecom Holdings','STH',
        'Saudi Telecom Holdings Company',
        'organization',
        'Diversified telecommunications holding company operating across fixed, mobile, and satellite services in KSA.',
        'CR-1010901234','SA',
        'https://www.sth.com.sa','CRM-CUS-STH-001',
        'Saudi Telecom Holdings (STH) is a government-linked entity managing diversified '
        'telecom assets in Saudi Arabia, including majority stakes in fixed-line, mobile, '
        'and broadband subsidiaries. Significant ICT infrastructure procurement. NEOM project partner.',
        ARRAY['STH','Saudi Telecom Holdings','ST Holdings'],
        ARRAY['telecommunications','professional_services'],
        'joint_stock', 2008,
        'e201_500',    'r500m_plus',
        '2008-11-01'::date,
        '["ksa","telecom","government-linked","strategic-account"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','200000202','legacy','CUS-STH-001'),
            'account_management', jsonb_build_object('tier','strategic','segment','government')
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-KSA-02');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-KSA-02';

    -- §Addresses (3 types)
    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-sth-hq','STH Headquarters','commercial','Attn: Procurement Office',
         'Al Madinah Al Munawarah Road, Al Wurud District','Telecom Tower, 28th Floor',
         'Riyadh','Riyadh Region','12391','SA',
         'Telecom Tower, 28F, Al Madinah Al Munawarah Road, Riyadh 12391, Saudi Arabia'),
        ('addr-sth-billing','STH Finance Division','commercial','Attn: Accounts Receivable',
         'King Salman Road','STH Finance Center, Building 3',
         'Riyadh','Riyadh Region','12271','SA',
         'STH Finance Center Building 3, King Salman Road, Riyadh 12271, Saudi Arabia'),
        ('addr-sth-legal','STH Legal Department','government','Attn: Legal & Compliance',
         'Ministry Road, Diplomatic Quarter','STH Legal Affairs Office',
         'Riyadh','Riyadh Region','11594','SA',
         'STH Legal Affairs Office, Diplomatic Quarter, Riyadh 11594, Saudi Arabia')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    INSERT INTO master.customer (tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by)
    SELECT v_tid,v_bp,'CUS-SSK-STH-001','government',true,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SSK-STH-001');

    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SSK-STH-001';

    -- §Address links — all three anchored at BP (hq/billing/legal are canonical identity)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2008-11-01',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-sth-hq','hq',true),('addr-sth-billing','billing',true),('addr-sth-legal','legal',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    INSERT INTO master.company_code_customer_profile (
        tenant_id,customer_id,company_code_id,
        currency_code,credit_limit,credit_limit_currency_code,credit_rating,
        default_accounting_profile_id,default_receipt_method_id,tax_group_id,
        statement_cycle_code,is_blocked,metadata,status,created_by)
    SELECT v_tid,v_cus,v_cc,
        'SAR',50000000.0000,'SAR','aaa',
        v_acct,v_pm_in,v_tg_vat,
        'monthly',false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'notes','Strategic government account — SSK/SAR'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile WHERE tenant_id=v_tid AND customer_id=v_cus AND company_code_id=v_cc);

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',    '310400004',             'Dun & Bradstreet',        '2015-01-01',NULL,        true),
        ('lei',     '984500STHSA00000SA04','GLEIF',                   '2021-09-01','2026-09-01',false),
        ('crn',     'CR-1010901234',         'Ministry of Commerce KSA','2008-11-01',NULL,        false),
        ('tin',     '300000901234000004',    'ZATCA',                   '2009-01-01',NULL,        false),
        ('vat_reg', '300000901234000004',    'ZATCA',                   '2018-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND scheme=v.scheme);

    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO27001-SA-STH-2023-0078','Ernst & Young KSA','Riyadh, KSA','Scope: Enterprise information security and network operations.','2023-09-01','2026-08-31'),
        (v_ct2,'ISO9001-SA-STH-2022-0056','SGS Saudi Arabia','Riyadh, KSA','Scope: Quality management for telecom service delivery.','2022-06-01','2025-05-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Waleed Al-Mubarak','Chief Procurement Officer',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Waleed Al-Mubarak')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Hana Al-Qahtani','Finance Operations Manager',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Hana Al-Qahtani')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'operations_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','w.almubarak@sth.com.sa','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966114441234','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'finance_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','finance@sth.com.sa','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+966114441235','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,rel,name,mtype,co,title,pct,scls,apt::date,notes,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','HH Prince Turki Al-Faisal','individual',NULL,'Board Chairman',NULL,NULL,'2008-11-01','Royal family board appointment.'),
        ('ubo','Public Investment Fund (PIF)','company','Public Investment Fund (PIF)','Strategic Shareholder',51.0,'ordinary','2008-11-01','Government sovereign wealth fund — majority owner.'),
        ('shareholder','STC Group (Saudi Telecom)','company','STC Group','Founding Shareholder',49.0,'ordinary','2008-11-01','STC joint venture partner.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='customer' AND party_id=v_cus AND relation_type=v.rel AND member_name=v.name);

    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'peppol','0193:3000009012340004','connected','verified',97,'synced',now(),
        '{"profile":{"name":"Saudi Telecom Holdings","country":"SA"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='peppol');

    INSERT INTO master.customer_qualification (
        tenant_id,customer_id,
        credit_status,credit_limit_band,credit_score,credit_rating,
        dso_days,payment_behavior,has_overdue_history,
        kyc_status,aml_sanctions_status,beneficial_owner_check_status,
        kyc_check_date,kyc_expiry_date,
        is_dunning_eligible,dunning_hold_reason,is_statement_eligible,
        last_credit_review_date,next_credit_review_date,reviewer_id,
        metadata,status,created_by)
    SELECT v_tid,v_cus,
        'approved','sar_50m_plus',950,'aaa',
        30,'good',false,
        'passed','clear','passed',
        '2025-01-10'::date,'2027-01-09'::date,
        false,'Government-linked entity (PIF majority) — dunning not applicable.',true,
        '2025-01-10'::date,'2026-01-10'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),
                           'credit_notes','Government-linked entity. PIF majority. No dunning applicable. Quarterly statement cycle.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus);

    RAISE NOTICE '[tksa_sa_cus2] CUS-SSK-STH-001 seeded (bp=%, cus=%)', v_bp, v_cus;
END $tksa_sa_cus2$;


-- ============================================================================
-- §EG1  Egypt Supplier 1 — Nile Technology Partners  (EG → TEGY)
-- ============================================================================
DO $tksa_eg_sup1$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_sup    uuid;
    v_cc     uuid;
    v_ba     uuid;
    v_bal    uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_tg_vat uuid;
    v_tg_wht uuid;
    v_pm     uuid;
    v_pt     uuid;
    v_acct   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code    WHERE tenant_id=v_tid AND code='TEGY';
    SELECT id INTO v_tg_vat  FROM control.tax_group      WHERE tenant_id=v_tid AND code='TG-EG-VAT-14-IN';
    SELECT id INTO v_tg_wht  FROM control.tax_group      WHERE tenant_id=v_tid AND code='TG-EG-WHT-10-SVC';
    SELECT id INTO v_pm      FROM master.payment_method  WHERE tenant_id=v_tid AND code='WIRE-EGP';
    SELECT id INTO v_pt      FROM master.payment_term    WHERE tenant_id=v_tid AND code='PT-NET30' AND is_current_version=true LIMIT 1;
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AP_NON_PO_STANDARD';
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_eg_sup1] TEGY company code not found'; END IF;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'SUP-EGY-01','Nile Technology Partners','Nile Tech Partners',
        'Nile Technology Partners S.A.E.',
        'organization',
        'Egyptian IT services and cloud solutions firm with public sector focus.',
        'EG-COM-2013-234567','EG',
        'https://www.niletek.com.eg','ERP-SUP-NTP-001',
        'Nile Technology Partners (NTP) is a Cairo-based Egyptian joint stock company founded '
        'in 2013, delivering cloud infrastructure, cybersecurity, and managed IT services '
        'to government ministries, banks, and large private sector enterprises in Egypt.',
        ARRAY['Nile Tech','NTP','Nile Technology'],
        ARRAY['professional_services','technology'],
        'joint_stock', 2013,
        'e51_200',     'r10m_50m',
        '2013-03-01'::date,
        '["egypt","ict","cloud","managed-services","preferred-supplier"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','400000301','legacy','NTP-EGY'),
            'procurement', jsonb_build_object('category','ict_services','lead_time_days',10)
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-01';

    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,line3,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-ntp-hq','Nile Tech Smart Village HQ','commercial','Attn: Procurement',
         'Smart Village, Cairo-Alexandria Desert Road','Building B174, 5th Floor',NULL,
         'Giza','Giza Governorate','12577','EG',
         'Building B174, 5F, Smart Village, Cairo-Alexandria Desert Road, Giza 12577, Egypt'),
        ('addr-ntp-billing','Nile Tech Maadi Office','commercial','Attn: Accounts Payable',
         '90 Corniche El Nil Street','Maadi Business Park, Tower 2, 3rd Floor',NULL,
         'Cairo','Cairo Governorate','11728','EG',
         'Maadi Business Park, Tower 2, 3F, 90 Corniche El Nil, Maadi, Cairo 11728, Egypt'),
        ('addr-ntp-dc','Nile Tech Data Centre','industrial','Attn: Operations',
         '6th of October City, Industrial Zone 3','Plot 45, Data Centre Building',NULL,
         'Giza','Giza Governorate','12566','EG',
         'Plot 45 Data Centre Building, Industrial Zone 3, 6th of October City, Giza 12566, Egypt')
    ) AS v(code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    INSERT INTO master.supplier (tenant_id,business_partner_id,supplier_code,supplier_type,
        is_payment_ready,payment_ready_at,payment_ready_by,payment_ready_reason,
        metadata,status,created_by)
    SELECT v_tid,v_bp,'SUP-TEGY-NTP-001','service',
        true,'2023-07-01 10:00+02'::timestamptz,v_sys,'EGP bank account verified.',
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001');

    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001';

    -- §Address links — HQ and billing anchored at BP; data centre stays at supplier (operational)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2013-03-01',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-ntp-hq','hq',true),('addr-ntp-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,'remittance',true,'2013-03-01',
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM master.address a
    WHERE a.tenant_id=v_tid AND a.code='addr-ntp-dc'
      AND NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose='remittance' AND address_id=a.id);

    SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-ntp-egp-01';
    IF v_ba IS NULL THEN
        INSERT INTO master.bank_account (tenant_id,code,name,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bic_override,bank_name_override,bank_country_override,account_nature,is_verified,verified_at,metadata,status,created_by)
        VALUES (v_tid,'ba-ntp-egp-01','Nile Tech Partners — CIB EGP',
            'Nile Technology Partners S.A.E.',
            'iban','EG380040100001234567890123456','3456',
            'EGP','CIBEEGCX','Commercial International Bank','EG',
            'direct',true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        RETURNING id INTO v_ba;
    END IF;

    SELECT id INTO v_bal FROM master.bank_account_link WHERE tenant_id=v_tid AND bank_account_id=v_ba AND owner_type='business_partner' AND owner_id=v_bp AND purpose='disbursement';
    IF v_bal IS NULL THEN
        INSERT INTO master.bank_account_link (tenant_id,bank_account_id,owner_type,owner_id,company_code_id,purpose,is_primary,effective_from,metadata,created_by)
        VALUES (v_tid,v_ba,'business_partner',v_bp,v_cc,'disbursement',true,'2023-07-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
        RETURNING id INTO v_bal;
    END IF;

    INSERT INTO master.company_code_supplier_profile (tenant_id,supplier_id,company_code_id,payment_term_id,payment_method_id,currency_code,default_accounting_profile_id,preferred_remittance_bank_link_id,tax_group_id,default_wht_tax_group_id,is_blocked,metadata,status,created_by)
    SELECT v_tid,v_sup,v_cc,v_pt,v_pm,'EGP',v_acct,v_bal,v_tg_vat,v_tg_wht,false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'notes','AP profile — TEGY/EGP'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile WHERE tenant_id=v_tid AND supplier_id=v_sup AND company_code_id=v_cc);

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,
           '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',      '200100001',              'Dun & Bradstreet',   '2019-01-01',NULL,        true),
        ('lei',       '984500NTPEGY0000EG01', 'GLEIF',              '2021-06-01','2026-06-01',false),
        ('crn',       'EG-COM-2013-234567',     'Egyptian GAFI',      '2013-03-01',NULL,        false),
        ('tin',       '200-234-567',            'Egyptian Tax Auth',  '2013-04-01',NULL,        false),
        ('vat_reg',   'EG-VAT-200234567-001',   'Egyptian Tax Auth',  '2016-09-08',NULL,        false),
        ('peppol_id', '0088:6284200100001',     'PEPPOL Authority',   '2022-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    INSERT INTO master.party_tax_profile (tenant_id,owner_type,owner_id,country_code,penalty_information,discount_information,global_location_number,tax_classification,taxation_type,tax_id,vat_id,vat_registered,has_tax_clearance,tax_clearance_number,tax_clearance_expiry_date,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,'EG',
        'Late payment: 2% monthly per Egyptian civil code.',
        'Early settlement: 1% if settled within 10 days.',
        '6284200100001',
        'company','standard',
        '200-234-567','EG-VAT-200234567-001',true,
        true,'TCN-EG-2024-NTP-001','2025-12-31'::date,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_tax_profile WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND country_code='EG');

    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-EG-NTP-2023-0067','Bureau Veritas Egypt','Cairo, Egypt','Scope: Design and delivery of managed IT services.','2023-01-15','2026-01-14'),
        (v_ct2,'ISO27001-EG-NTP-2023-0022','KPMG Egypt','Cairo, Egypt','Scope: Information security management for cloud operations.','2023-06-01','2026-05-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Eng. Omar Farouk','Chief Executive Officer',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Eng. Omar Farouk')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Nadia Hassan','AP & Collections Manager',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Nadia Hassan')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'bid_proposal_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','o.farouk@niletek.com.eg','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20223456001','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'accounts_payable',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','ap@niletek.com.eg','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20223456002','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Eng. Omar Farouk','individual',NULL,'CEO & Founding Partner',NULL,NULL,'2013-03-01','Founding CEO.'),
        ('ubo','Farouk Family Holdings Egypt','company','Farouk Family Holdings Egypt','Majority Owner',60.0,'ordinary','2013-03-01','Egyptian family holding company.'),
        ('shareholder','Egypt Ventures Fund II','company','Egypt Ventures Fund II','PE Investor',40.0,'preference','2018-05-01','Series B preferred — growth PE.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND relation_type=v.rel AND member_name=v.name);

    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'peppol','0088:6284200100001','connected','verified',93,'synced',now(),
        '{"profile":{"name":"Nile Technology Partners S.A.E.","country":"EG"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='peppol');

    INSERT INTO master.supplier_qualification (tenant_id,supplier_id,onboarding_status,profile_completeness_pct,onboarding_approved_at,onboarding_approved_by,is_approved_supplier,is_preferred_supplier,is_blocked,risk_tier,sanctions_status,aml_kyc_status,sanctions_check_date,kyc_expiry_date,sourcing_event_count,bid_count,awarded_count,delivery_score,quality_score,sla_score,score_period_start,score_period_end,last_review_date,next_review_date,reviewed_by,metadata,status,created_by)
    SELECT v_tid,v_sup,'approved',100,'2023-07-01 10:00+02'::timestamptz,v_sys,true,true,false,
        'low','clear','passed','2025-03-01'::date,'2026-03-01'::date,
        15,11,9,95.00,94.50,96.80,
        '2024-01-01'::date,'2024-12-31'::date,'2025-03-01'::date,'2026-03-01'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'review_notes','Approved & preferred. Strong performance in Egypt public sector projects.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup);

    RAISE NOTICE '[tksa_eg_sup1] SUP-TEGY-NTP-001 seeded (bp=%, sup=%)', v_bp, v_sup;
END $tksa_eg_sup1$;


-- ============================================================================
-- §EG2  Egypt Supplier 2 — Cairo Systems Integration  (EG → SDTX)
-- ============================================================================
DO $tksa_eg_sup2$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_sup    uuid;
    v_cc     uuid;
    v_ba     uuid;
    v_bal    uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_tg_vat uuid;
    v_tg_wht uuid;
    v_pm     uuid;
    v_pt     uuid;
    v_acct   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code   WHERE tenant_id=v_tid AND code='SDTX';
    SELECT id INTO v_tg_vat  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-EG-VAT-14-IN';
    SELECT id INTO v_tg_wht  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-EG-WHT-10-SVC';
    SELECT id INTO v_pm      FROM master.payment_method WHERE tenant_id=v_tid AND code='WIRE-EGP';
    SELECT id INTO v_pt      FROM master.payment_term   WHERE tenant_id=v_tid AND code='PT-NET45' AND is_current_version=true LIMIT 1;
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AP_NON_PO_STANDARD';
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-45001';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_eg_sup2] SDTX company code not found'; END IF;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'SUP-EGY-02','Cairo Systems Integration LLC','Cairo Systems',
        'Cairo Systems Integration Limited Liability Company',
        'organization',
        'Egyptian specialist in satellite systems, RF engineering, and telecom infrastructure.',
        'EG-COM-2017-456789','EG',
        'https://www.cairosystems.com.eg','ERP-SUP-CSI-001',
        'Cairo Systems Integration LLC was founded in 2017 by a team of satellite engineers. '
        'The company delivers RF systems integration, VSAT network deployment, and satellite '
        'ground station installation across Egypt and East Africa.',
        ARRAY['Cairo Systems','CSI','Cairo Sys'],
        ARRAY['technology','construction'],
        'limited_liability', 2017,
        'e11_50',            'r1m_10m',
        '2017-08-15'::date,
        '["egypt","satellite","rf-engineering","contractor","sdtx-partner"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','400000302'),
            'procurement', jsonb_build_object('category','satellite_systems','lead_time_days',30)
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-02');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-02';

    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,line3,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-csi-hq','Cairo Systems HQ Heliopolis','commercial','Attn: Managing Director',
         'Sheraton Heliopolis, El-Nozha Street','Nile City Commercial Complex, 7th Floor',NULL,
         'Cairo','Cairo Governorate','11361','EG',
         'Nile City Commercial Complex, 7F, El-Nozha Street, Heliopolis, Cairo 11361, Egypt'),
        ('addr-csi-billing','Cairo Systems Finance Office','commercial','Attn: Finance',
         'Zamalek Island, 26 July Street','Al-Nil Tower, 4th Floor',NULL,
         'Cairo','Cairo Governorate','11211','EG',
         'Al-Nil Tower, 4F, 26 July Street, Zamalek, Cairo 11211, Egypt'),
        ('addr-csi-ops','Cairo Systems Alexandria Site','industrial','Attn: Site Engineer',
         'Alexandria Industrial Zone Phase 2','Plot 78, Satellite Ground Station',NULL,
         'Alexandria','Alexandria Governorate','21625','EG',
         'Plot 78, Satellite Ground Station, Industrial Zone Ph2, Alexandria 21625, Egypt')
    ) AS v(code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    INSERT INTO master.supplier (tenant_id,business_partner_id,supplier_code,supplier_type,is_payment_ready,payment_ready_at,payment_ready_by,payment_ready_reason,metadata,status,created_by)
    SELECT v_tid,v_bp,'SUP-SDTX-CSI-001','contractor',
        true,'2024-03-01 10:00+02'::timestamptz,v_sys,'Specialist contractor — verified.',
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SDTX-CSI-001');

    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SDTX-CSI-001';

    -- §Address links — HQ and billing anchored at BP; Alexandria site stays at supplier (operational)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2017-08-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-csi-hq','hq',true),('addr-csi-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,'remittance',true,'2017-08-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM master.address a
    WHERE a.tenant_id=v_tid AND a.code='addr-csi-ops'
      AND NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose='remittance' AND address_id=a.id);

    SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-csi-egp-01';
    IF v_ba IS NULL THEN
        INSERT INTO master.bank_account (tenant_id,code,name,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bic_override,bank_name_override,bank_country_override,account_nature,is_verified,verified_at,metadata,status,created_by)
        VALUES (v_tid,'ba-csi-egp-01','Cairo Systems — NBE EGP',
            'Cairo Systems Integration LLC',
            'iban','EG380040100001234567890123789','3789',
            'EGP','NBEGEGCX','National Bank of Egypt','EG',
            'direct',true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        RETURNING id INTO v_ba;
    END IF;
    SELECT id INTO v_bal FROM master.bank_account_link WHERE tenant_id=v_tid AND bank_account_id=v_ba AND owner_type='business_partner' AND owner_id=v_bp AND purpose='disbursement';
    IF v_bal IS NULL THEN
        INSERT INTO master.bank_account_link (tenant_id,bank_account_id,owner_type,owner_id,company_code_id,purpose,is_primary,effective_from,metadata,created_by)
        VALUES (v_tid,v_ba,'business_partner',v_bp,v_cc,'disbursement',true,'2024-03-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
        RETURNING id INTO v_bal;
    END IF;

    INSERT INTO master.company_code_supplier_profile (tenant_id,supplier_id,company_code_id,payment_term_id,payment_method_id,currency_code,default_accounting_profile_id,preferred_remittance_bank_link_id,tax_group_id,default_wht_tax_group_id,is_blocked,metadata,status,created_by)
    SELECT v_tid,v_sup,v_cc,v_pt,v_pm,'EGP',v_acct,v_bal,v_tg_vat,v_tg_wht,false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'notes','AP profile — SDTX/EGP'),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile WHERE tenant_id=v_tid AND supplier_id=v_sup AND company_code_id=v_cc);

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',      '200200002',             'Dun & Bradstreet', '2021-01-01',NULL,        true),
        ('lei',       '984500CSIEGY0000EG02','GLEIF',            '2022-01-01','2027-01-01',false),
        ('crn',       'EG-COM-2017-456789',    'Egyptian GAFI',    '2017-08-15',NULL,        false),
        ('tin',       '200-456-789',           'Egyptian Tax Auth','2017-09-01',NULL,        false),
        ('vat_reg',   'EG-VAT-200456789-001',  'Egyptian Tax Auth','2017-09-08',NULL,        false),
        ('peppol_id', '0088:6284200200002',    'PEPPOL Authority', '2023-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    INSERT INTO master.party_tax_profile (tenant_id,owner_type,owner_id,country_code,penalty_information,discount_information,global_location_number,tax_classification,taxation_type,tax_id,vat_id,vat_registered,has_tax_clearance,tax_clearance_number,tax_clearance_expiry_date,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,'EG','Late payment: 2% monthly after 45 days.','No discount terms.',
        '6284200200002','company','standard',
        '200-456-789','EG-VAT-200456789-001',true,
        true,'TCN-EG-2025-CSI-001','2026-06-30'::date,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_tax_profile WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND country_code='EG');

    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-EG-CSI-2024-0023','SGS Egypt','Cairo, Egypt','Scope: Satellite systems integration and installation.','2024-01-15','2027-01-14'),
        (v_ct2,'ISO45001-EG-CSI-2024-0011','Bureau Veritas Egypt','Cairo, Egypt','Scope: Occupational health and safety for field operations.','2024-01-15','2027-01-14')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Hossam Abdel-Aziz','Managing Director',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Hossam Abdel-Aziz')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Yasmine Khalil','Finance Manager',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Yasmine Khalil')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'bid_proposal_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','h.abdelaziz@cairosystems.com.eg','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20226012345','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'accounts_payable',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','finance@cairosystems.com.eg','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20226012346','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Hossam Abdel-Aziz','individual',NULL,'Managing Director & Founder',NULL,NULL,'2017-08-15','Co-founder and MD.'),
        ('director','Dr. Sherif Mansour','individual',NULL,'Technical Director',NULL,NULL,'2017-08-15','Co-founder — RF engineering lead.'),
        ('ubo','Abdel-Aziz Family Trust','company','Abdel-Aziz Family Trust','Majority Owner',80.0,'ordinary','2017-08-15','Egyptian family trust.'),
        ('shareholder','Cairo Tech Investments','company','Cairo Tech Investments','Minority Shareholder',20.0,'ordinary','2020-01-01','Angel investor syndicate.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND relation_type=v.rel AND member_name=v.name);

    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'peppol','0088:6284200200002','connected','matched',88,'synced',now(),
        '{"profile":{"name":"Cairo Systems Integration LLC","country":"EG"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='peppol');

    INSERT INTO master.supplier_qualification (tenant_id,supplier_id,onboarding_status,profile_completeness_pct,onboarding_approved_at,onboarding_approved_by,is_approved_supplier,is_preferred_supplier,is_blocked,risk_tier,sanctions_status,aml_kyc_status,sanctions_check_date,kyc_expiry_date,sourcing_event_count,bid_count,awarded_count,delivery_score,quality_score,sla_score,score_period_start,score_period_end,last_review_date,next_review_date,reviewed_by,metadata,status,created_by)
    SELECT v_tid,v_sup,'approved',96,'2024-03-01 10:00+02'::timestamptz,v_sys,true,false,false,
        'medium','clear','passed','2025-04-01'::date,'2026-04-01'::date,
        7,5,4,91.00,89.50,92.00,
        '2024-01-01'::date,'2024-12-31'::date,'2025-04-01'::date,'2026-04-01'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'review_notes','Approved specialist contractor. Medium risk due to small team size. Not yet preferred.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup);

    RAISE NOTICE '[tksa_eg_sup2] SUP-SDTX-CSI-001 seeded (bp=%, sup=%)', v_bp, v_sup;
END $tksa_eg_sup2$;


-- ============================================================================
-- §EG3  Egypt Customer 1 — Egyptian National Industries  (EG → TEGY)
-- ============================================================================
DO $tksa_eg_cus1$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_cus    uuid;
    v_cc     uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_tg_vat uuid;
    v_pm_in  uuid;
    v_acct   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code   WHERE tenant_id=v_tid AND code='TEGY';
    SELECT id INTO v_tg_vat  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-EG-VAT-14-IN';
    SELECT id INTO v_pm_in   FROM master.payment_method WHERE tenant_id=v_tid AND code='RTGS-EGP';
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AR_STANDARD' LIMIT 1;
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-14001';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_eg_cus1] TEGY company code not found'; END IF;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'CUS-EGY-01','Egyptian National Industries','ENI',
        'Egyptian National Industries S.A.E.',
        'organization',
        'Large Egyptian industrial conglomerate operating manufacturing, energy, and chemicals plants.',
        'EG-COM-2005-111222','EG',
        'https://www.eni.com.eg','CRM-CUS-ENI-001',
        'Egyptian National Industries (ENI) is a Cairo-based SAE, established in 2005, '
        'operating across chemicals, fertilisers, building materials, and energy. '
        'A significant buyer of enterprise ICT and digital transformation services.',
        ARRAY['ENI','Egyptian National Industries','Egyptian NI'],
        ARRAY['manufacturing','energy'],
        'joint_stock', 2005,
        'e201_500',    'r100m_500m',
        '2005-06-01'::date,
        '["egypt","manufacturing","industrial","large-account"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','200000401','legacy','CUS-ENI-001'),
            'account_management', jsonb_build_object('tier','large','segment','industrial')
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-01';

    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,line3,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-eni-hq','ENI Corporate HQ Cairo','commercial','Attn: IT Procurement',
         'Ring Road, New Cairo','ENI Corporate Park, Building 5',NULL,
         'Cairo','Cairo Governorate','11435','EG',
         'ENI Corporate Park, Building 5, Ring Road, New Cairo 11435, Egypt'),
        ('addr-eni-billing','ENI Finance Department','commercial','Attn: Accounts Payable',
         '15 Hassan Sabry Street, Zamalek','Finance Tower, 9th Floor',NULL,
         'Cairo','Cairo Governorate','11211','EG',
         'Finance Tower, 9F, 15 Hassan Sabry Street, Zamalek, Cairo 11211, Egypt'),
        ('addr-eni-plant','ENI Industrial Plant Suez','industrial','Attn: Plant Manager',
         'Suez Industrial Zone, Phase 4','ENI Chemicals Plant',NULL,
         'Suez','Suez Governorate','43511','EG',
         'ENI Chemicals Plant, Phase 4, Suez Industrial Zone, Suez 43511, Egypt')
    ) AS v(code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    INSERT INTO master.customer (tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by)
    SELECT v_tid,v_bp,'CUS-TEGY-ENI-001','corporate',true,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TEGY-ENI-001');

    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TEGY-ENI-001';

    -- §Address links — HQ and billing anchored at BP; industrial plant stays at customer (operational delivery)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2005-06-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-eni-hq','hq',true),('addr-eni-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'customer',v_cus,a.id,'shipping',true,'2005-06-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM master.address a
    WHERE a.tenant_id=v_tid AND a.code='addr-eni-plant'
      AND NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND purpose='shipping' AND address_id=a.id);

    INSERT INTO master.company_code_customer_profile (tenant_id,customer_id,company_code_id,currency_code,credit_limit,credit_limit_currency_code,credit_rating,default_accounting_profile_id,default_receipt_method_id,tax_group_id,statement_cycle_code,is_blocked,metadata,status,created_by)
    SELECT v_tid,v_cus,v_cc,'EGP',20000000.0000,'EGP','a',v_acct,v_pm_in,v_tg_vat,'monthly',false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'notes','AR profile — TEGY/EGP'),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile WHERE tenant_id=v_tid AND customer_id=v_cus AND company_code_id=v_cc);

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',    '200300003',             'Dun & Bradstreet','2016-01-01',NULL,        true),
        ('lei',     '984500ENIEGY0000EG03','GLEIF',           '2020-01-01','2025-01-01',false),
        ('crn',     'EG-COM-2005-111222',    'Egyptian GAFI',   '2005-06-01',NULL,        false),
        ('tin',     '200-111-222',           'Egyptian Tax Auth','2005-07-01',NULL,        false),
        ('vat_reg', 'EG-VAT-200111222-001',  'Egyptian Tax Auth','2016-09-08',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND scheme=v.scheme);

    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-EG-ENI-2022-0091','Bureau Veritas Egypt','Cairo, Egypt','Scope: Manufacturing quality management for chemicals and materials.','2022-08-01','2025-07-31'),
        (v_ct2,'ISO14001-EG-ENI-2022-0041','SGS Egypt','Cairo, Egypt','Scope: Environmental management for industrial plants.','2022-08-01','2025-07-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Ahmed Naguib','Group CFO',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Ahmed Naguib')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Layla Ibrahim','IT Procurement Manager',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Layla Ibrahim')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'finance_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','a.naguib@eni.com.eg','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20223001234','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'operations_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','it.procurement@eni.com.eg','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20223001235','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Dr. Magdi Nasser','individual',NULL,'Board Chairman',NULL,NULL,'2005-06-01','Founding chairman.'),
        ('ubo','Nasser Industrial Group','company','Nasser Industrial Group','Majority Shareholder',55.0,'ordinary','2005-06-01','Egyptian family conglomerate.'),
        ('shareholder','National Investment Bank Egypt','company','National Investment Bank Egypt','Strategic Shareholder',30.0,'ordinary','2005-06-01','State-backed bank as anchor investor.'),
        ('shareholder','IFC — International Finance Corp','company','IFC — International Finance Corp','Development Finance',15.0,'preference','2010-04-01','World Bank Group member.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='customer' AND party_id=v_cus AND relation_type=v.rel AND member_name=v.name);

    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'ariba','AN09876543210','connected','verified',91,'synced',now(),
        '{"profile":{"name":"Egyptian National Industries SAE","country":"EG"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='ariba');

    INSERT INTO master.customer_qualification (tenant_id,customer_id,credit_status,credit_limit_band,credit_score,credit_rating,dso_days,payment_behavior,has_overdue_history,kyc_status,aml_sanctions_status,beneficial_owner_check_status,kyc_check_date,kyc_expiry_date,is_dunning_eligible,is_statement_eligible,last_credit_review_date,next_credit_review_date,reviewer_id,metadata,status,created_by)
    SELECT v_tid,v_cus,
        'approved','egp_10m_50m',800,'a',
        35,'good',false,'passed','clear','passed',
        '2025-01-20'::date,'2027-01-19'::date,
        true,true,'2025-01-20'::date,'2026-01-20'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'credit_notes','Large industrial group. Good payment history. Annual credit review.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus);

    RAISE NOTICE '[tksa_eg_cus1] CUS-TEGY-ENI-001 seeded (bp=%, cus=%)', v_bp, v_cus;
END $tksa_eg_cus1$;


-- ============================================================================
-- §EG4  Egypt Customer 2 — Suez Canal Trading Company  (EG → SDTX)
-- ============================================================================
DO $tksa_eg_cus2$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_cus    uuid;
    v_cc     uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_tg_vat uuid;
    v_pm_in  uuid;
    v_acct   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_cc      FROM master.company_code   WHERE tenant_id=v_tid AND code='SDTX';
    SELECT id INTO v_tg_vat  FROM control.tax_group     WHERE tenant_id=v_tid AND code='TG-EG-VAT-14-IN';
    SELECT id INTO v_pm_in   FROM master.payment_method WHERE tenant_id=v_tid AND code='RTGS-EGP';
    SELECT id INTO v_acct    FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AR_STANDARD' LIMIT 1;
    SELECT id INTO v_ct1     FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';
    SELECT id INTO v_ct2     FROM master.certification_type WHERE tenant_id IS NULL AND code='halal-gsas';

    IF v_cc IS NULL THEN RAISE EXCEPTION '[tksa_eg_cus2] SDTX company code not found'; END IF;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'CUS-EGY-02','Suez Canal Trading Company','Suez Canal Trading',
        'Suez Canal Trading Company S.A.E.',
        'organization',
        'Egyptian government-linked trading company operating in the Suez Canal Free Zone.',
        'EG-COM-2001-333444','EG',
        'https://www.sctc.com.eg','CRM-CUS-SCTC-001',
        'Suez Canal Trading Company (SCTC) is an Egyptian state-affiliated trading company '
        'operating in the Suez Free Zone. It manages import/export facilitation, logistics, '
        'and technology procurement for government and canal authority projects.',
        ARRAY['SCTC','Suez Canal Trading','SC Trading'],
        ARRAY['professional_services','logistics'],
        'joint_stock', 2001,
        'e51_200',     'r50m_100m',
        '2001-04-15'::date,
        '["egypt","government-linked","suez","free-zone","trading"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','200000402','legacy','CUS-SCTC-001'),
            'account_management', jsonb_build_object('tier','key','segment','government')
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-02');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-02';

    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,line3,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-sctc-hq','SCTC HQ Suez','government','Attn: General Manager',
         'Suez Free Zone, Zone A','SCTC Administration Building',NULL,
         'Suez','Suez Governorate','43511','EG',
         'SCTC Administration Building, Zone A, Suez Free Zone, Suez 43511, Egypt'),
        ('addr-sctc-billing','SCTC Cairo Office','commercial','Attn: Finance',
         '12 Salah Salem Road, Nasr City','Trade Centre Tower, 11th Floor',NULL,
         'Cairo','Cairo Governorate','11471','EG',
         'Trade Centre Tower, 11F, 12 Salah Salem Road, Nasr City, Cairo 11471, Egypt'),
        ('addr-sctc-port','SCTC Port Said Warehouse','customs_zone','Attn: Port Operations',
         'Port Said Free Zone','Berth 7, Logistics Hub',NULL,
         'Port Said','Port Said Governorate','42511','EG',
         'Berth 7 Logistics Hub, Port Said Free Zone, Port Said 42511, Egypt')
    ) AS v(code,name,atype,attn,l1,l2,l3,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    INSERT INTO master.customer (tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by)
    SELECT v_tid,v_bp,'CUS-SDTX-SCTC-001','government',true,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SDTX-SCTC-001');

    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SDTX-SCTC-001';

    -- §Address links — HQ and billing anchored at BP; Port Said logistics hub stays at customer (operational)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2001-04-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-sctc-hq','hq',true),('addr-sctc-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'customer',v_cus,a.id,'shipping',true,'2001-04-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM master.address a
    WHERE a.tenant_id=v_tid AND a.code='addr-sctc-port'
      AND NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND purpose='shipping' AND address_id=a.id);

    INSERT INTO master.company_code_customer_profile (tenant_id,customer_id,company_code_id,currency_code,credit_limit,credit_limit_currency_code,credit_rating,default_accounting_profile_id,default_receipt_method_id,tax_group_id,statement_cycle_code,is_blocked,metadata,status,created_by)
    SELECT v_tid,v_cus,v_cc,'EGP',15000000.0000,'EGP','aa',v_acct,v_pm_in,v_tg_vat,'monthly',false,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'notes','AR profile — SDTX/EGP government entity'),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile WHERE tenant_id=v_tid AND customer_id=v_cus AND company_code_id=v_cc);

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',    '200400004',             'Dun & Bradstreet','2015-01-01',NULL,        true),
        ('lei',     '984500SCTCEG0000EG04','GLEIF',          '2019-01-01','2024-01-01',false),
        ('crn',     'EG-COM-2001-333444',    'Egyptian GAFI',   '2001-04-15',NULL,        false),
        ('tin',     '200-333-444',           'Egyptian Tax Auth','2001-05-01',NULL,        false),
        ('vat_reg', 'EG-VAT-200333444-001',  'Egyptian Tax Auth','2016-09-08',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND scheme=v.scheme);

    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO27001-EG-SCTC-2023-0019','KPMG Egypt','Suez, Egypt','Scope: Trade data and customs systems security.','2023-04-01','2026-03-31'),
        (v_ct2,'GSAS-HALAL-SCTC-2024-0003','Gulf Standards Organization','Cairo, Egypt','Halal food trade facilitation certification.','2024-01-01','2025-12-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Adm. (Ret.) Hassan Al-Masri','General Manager',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Adm. (Ret.) Hassan Al-Masri')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Sahar Fouad','Accounts Payable Supervisor',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Sahar Fouad')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'main_contact',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','gm@sctc.com.eg','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20623201234','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'accounts_payable',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','ap@sctc.com.eg','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+20623201235','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Adm. (Ret.) Hassan Al-Masri','individual',NULL,'General Manager',NULL,NULL,'2001-04-15','Government-appointed GM.'),
        ('ubo','Suez Canal Authority','company','Suez Canal Authority','Parent Entity',70.0,'ordinary','2001-04-15','Egyptian government body.'),
        ('shareholder','Egyptian Holding Company for Maritime & Land Transport','company','EHCMLT','Co-Shareholder',30.0,'ordinary','2001-04-15','State-owned transport holding.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='customer' AND party_id=v_cus AND relation_type=v.rel AND member_name=v.name);

    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'ariba','AN05556667778','invited','unverified',70,'pending',now(),
        '{"profile":{"name":"Suez Canal Trading Company SAE","country":"EG"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='ariba');

    INSERT INTO master.customer_qualification (tenant_id,customer_id,credit_status,credit_limit_band,credit_score,credit_rating,dso_days,payment_behavior,has_overdue_history,kyc_status,aml_sanctions_status,beneficial_owner_check_status,kyc_check_date,kyc_expiry_date,is_dunning_eligible,dunning_hold_reason,is_statement_eligible,last_credit_review_date,next_credit_review_date,reviewer_id,metadata,status,created_by)
    SELECT v_tid,v_cus,
        'approved','egp_10m_50m',830,'aa',
        42,'good',false,'passed','clear','passed',
        '2025-01-05'::date,'2027-01-04'::date,
        false,'Government-linked entity (Suez Canal Authority backing) — dunning not applicable.',true,'2025-01-05'::date,'2026-01-05'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'credit_notes','Government-linked entity. Suez Canal Authority backing. No dunning. Quarterly statements.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus);

    RAISE NOTICE '[tksa_eg_cus2] CUS-SDTX-SCTC-001 seeded (bp=%, cus=%)', v_bp, v_cus;
END $tksa_eg_cus2$;


-- ============================================================================
-- §GL1  Global Supplier — Global Procurement Solutions Ltd (GB → all 4 cos)
--       Supplier profile per company, bank account per company currency.
-- ============================================================================
DO $tksa_glb_sup$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_sup    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ba     uuid;
    v_bal    uuid;
    v_acct   uuid;
    v_pm     uuid;
    v_pt     uuid;
    v_tg     uuid;
    v_tg_wht uuid;
    cc_rec   record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_ct1 FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2 FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';
    SELECT id INTO v_acct FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AP_NON_PO_STANDARD';

    -- §BP
    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'SUP-GLB-01','Global Procurement Solutions Ltd','GPS Ltd',
        'Global Procurement Solutions Limited',
        'organization',
        'UK-based global procurement and supply chain management solutions provider.',
        'GB-CH-08765432','GB',
        'https://www.gps-global.com','ERP-SUP-GPS-001',
        'Global Procurement Solutions Ltd (GPS) is a UK-registered company with offices '
        'in London, Dubai, Cairo, and Riyadh, providing strategic sourcing, category management, '
        'and supply chain optimisation services to multinationals and government entities worldwide.',
        ARRAY['GPS Ltd','GPS Global','Global Procurement'],
        ARRAY['professional_services'],
        'private_limited', 2009,
        'e201_500',        'r50m_100m',
        '2009-01-15'::date,
        '["global","procurement","UK","multi-region","preferred-supplier"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap','400000501','ariba','AN09988776655'),
            'procurement', jsonb_build_object('category','procurement_services','lead_time_days',5,'global',true)
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-GLB-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-GLB-01';

    -- §Addresses (HQ London, Regional Dubai, Billing)
    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-gps-hq','GPS London HQ','commercial','Attn: Accounts Payable',
         '10 Dowgate Hill, Level 3','Cannon Bridge House',
         'London','England','EC4R 2SU','GB',
         'Cannon Bridge House, 10 Dowgate Hill, London EC4R 2SU, United Kingdom'),
        ('addr-gps-billing','GPS Billing Address','po_box','Attn: Finance Team',
         'P.O. Box 27841',NULL,
         'London','England','EC1A 1AB','GB',
         'P.O. Box 27841, London EC1A 1AB, United Kingdom'),
        ('addr-gps-mena','GPS MENA Hub — Dubai','commercial','Attn: MENA Director',
         'One Central, Level 7','Dubai World Trade Centre',
         'Dubai','Dubai Emirate','00000','AE',
         'One Central, Level 7, Dubai World Trade Centre, Dubai, UAE')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    -- §Supplier
    INSERT INTO master.supplier (tenant_id,business_partner_id,supplier_code,supplier_type,is_payment_ready,payment_ready_at,payment_ready_by,payment_ready_reason,metadata,status,created_by)
    SELECT v_tid,v_bp,'SUP-GLB-GPS-001','service',
        true,'2022-06-01 09:00+00'::timestamptz,v_sys,'Multi-currency banking verified for all 4 companies.',
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-GPS-001');

    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-GPS-001';

    -- §Address links — all three anchored at BP (London HQ, billing PO box, Dubai MENA hub are all canonical)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2009-01-15','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-gps-hq','hq',true),('addr-gps-billing','billing',true),('addr-gps-mena','office',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    -- §One bank account + profile per company code
    FOR cc_rec IN
        SELECT co.id AS cc_id, co.code AS cc_code, co.functional_currency AS curr,
               CASE co.code
                   WHEN 'TKSA' THEN 'SARIE-SAR'
                   WHEN 'SSK'  THEN 'SARIE-SAR'
                   WHEN 'TEGY' THEN 'WIRE-EGP'
                   WHEN 'SDTX' THEN 'WIRE-EGP'
               END AS pm_code,
               CASE co.code
                   WHEN 'TKSA' THEN 'TG-SA-VAT-15-IN'
                   WHEN 'SSK'  THEN 'TG-SA-VAT-15-IN'
                   WHEN 'TEGY' THEN 'TG-EG-VAT-14-IN'
                   WHEN 'SDTX' THEN 'TG-EG-VAT-14-IN'
               END AS tg_code,
               CASE co.code
                   WHEN 'TKSA' THEN 'TG-SA-WHT-5-SVC'
                   WHEN 'SSK'  THEN 'TG-SA-WHT-5-SVC'
                   WHEN 'TEGY' THEN 'TG-EG-WHT-10-SVC'
                   WHEN 'SDTX' THEN 'TG-EG-WHT-10-SVC'
               END AS tg_wht_code,
               CASE co.code
                   WHEN 'TKSA' THEN 'SA0420000003300345678901'
                   WHEN 'SSK'  THEN 'SA0420000003300345678902'
                   WHEN 'TEGY' THEN 'EG380040100001234567890124111'
                   WHEN 'SDTX' THEN 'EG380040100001234567890124222'
               END AS iban,
               CASE co.code
                   WHEN 'TKSA' THEN 'RJHISASS'
                   WHEN 'SSK'  THEN 'RJHISASS'
                   WHEN 'TEGY' THEN 'CIBEEGCX'
                   WHEN 'SDTX' THEN 'CIBEEGCX'
               END AS bic,
               CASE co.code
                   WHEN 'TKSA' THEN 'Al Rajhi Bank'
                   WHEN 'SSK'  THEN 'Al Rajhi Bank'
                   WHEN 'TEGY' THEN 'Commercial International Bank'
                   WHEN 'SDTX' THEN 'Commercial International Bank'
               END AS bank_name,
               CASE co.code WHEN 'TKSA' THEN 'SA' WHEN 'SSK' THEN 'SA' ELSE 'EG' END AS bank_country
        FROM master.company_code co
        WHERE co.tenant_id = v_tid AND co.code IN ('TKSA','SSK','TEGY','SDTX')
    LOOP
        SELECT id INTO v_pm FROM master.payment_method WHERE tenant_id=v_tid AND code=cc_rec.pm_code;
        SELECT id INTO v_tg FROM control.tax_group      WHERE tenant_id=v_tid AND code=cc_rec.tg_code;
        SELECT id INTO v_tg_wht FROM control.tax_group  WHERE tenant_id=v_tid AND code=cc_rec.tg_wht_code;
        SELECT id INTO v_pt FROM master.payment_term    WHERE tenant_id=v_tid AND code='PT-NET30' AND is_current_version=true LIMIT 1;

        SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-gps-'||lower(cc_rec.cc_code);
        IF v_ba IS NULL THEN
            INSERT INTO master.bank_account (tenant_id,code,name,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bic_override,bank_name_override,bank_country_override,account_nature,is_verified,verified_at,metadata,status,created_by)
            VALUES (v_tid,'ba-gps-'||lower(cc_rec.cc_code),
                'GPS Ltd — '||cc_rec.curr||' ('||cc_rec.cc_code||')',
                'Global Procurement Solutions Limited',
                'iban',cc_rec.iban,right(cc_rec.iban,4),
                cc_rec.curr,cc_rec.bic,cc_rec.bank_name,cc_rec.bank_country,
                'direct',true,now(),
                '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
            RETURNING id INTO v_ba;
        END IF;

        SELECT id INTO v_bal FROM master.bank_account_link
         WHERE tenant_id=v_tid AND bank_account_id=v_ba AND owner_type='business_partner' AND owner_id=v_bp AND company_code_id=cc_rec.cc_id AND purpose='disbursement';
        IF v_bal IS NULL THEN
            INSERT INTO master.bank_account_link (tenant_id,bank_account_id,owner_type,owner_id,company_code_id,purpose,is_primary,effective_from,metadata,created_by)
            VALUES (v_tid,v_ba,'business_partner',v_bp,cc_rec.cc_id,'disbursement',true,'2022-06-01',
                '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
            RETURNING id INTO v_bal;
        END IF;

        INSERT INTO master.company_code_supplier_profile (tenant_id,supplier_id,company_code_id,payment_term_id,payment_method_id,currency_code,default_accounting_profile_id,preferred_remittance_bank_link_id,tax_group_id,default_wht_tax_group_id,is_blocked,metadata,status,created_by)
        SELECT v_tid,v_sup,cc_rec.cc_id,v_pt,v_pm,cc_rec.curr,v_acct,v_bal,v_tg,v_tg_wht,false,
            jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'cc',cc_rec.cc_code),'active',v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile WHERE tenant_id=v_tid AND supplier_id=v_sup AND company_code_id=cc_rec.cc_id);
    END LOOP;

    -- §Identifiers
    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',      '441500001',              'Dun & Bradstreet',  '2015-01-01',NULL,        true),
        ('lei',       '984500GPSGBL0000GB01', 'GLEIF',             '2020-01-01','2025-01-01',false),
        ('crn',       'GB-CH-08765432',         'UK Companies House','2009-01-15',NULL,        false),
        ('tin',       'GB-UTR-1234567890',      'HMRC',              '2009-02-01',NULL,        false),
        ('vat_reg',   'GB234567890',            'HMRC',              '2009-02-01',NULL,        false),
        ('peppol_id', '0002:9834000001001',     'PEPPOL Authority',  '2021-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    -- §Tax profile (GB)
    INSERT INTO master.party_tax_profile (tenant_id,owner_type,owner_id,country_code,penalty_information,discount_information,global_location_number,tax_classification,taxation_type,tax_id,vat_id,vat_registered,has_tax_clearance,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,'GB',
        'Interest on late payments per Late Payment of Commercial Debts Act 1998.',
        'No standard early payment discount.',
        '5012345678901',
        'company','standard',
        'GB-UTR-1234567890','GB234567890',true,false,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_tax_profile WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND country_code='GB');

    -- §Certifications
    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-GB-GPS-2023-0199','Lloyd''s Register Quality Assurance','London, UK','Scope: Procurement consulting and category management.','2023-04-01','2026-03-31'),
        (v_ct2,'ISO27001-GB-GPS-2024-0044','BSI Group','London, UK','Scope: Information security for supplier data and procurement platforms.','2024-01-01','2027-12-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND certification_type_id=v.ct_id);

    -- §Contacts — BP level (shown on Business Partner > Contacts tab)
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Jonathan Clarke','Chief Executive Officer',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Jonathan Clarke')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Priya Sharma','MENA Finance Director',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Priya Sharma')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'bid_proposal_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','j.clarke@gps-global.com','billing',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+442071234567','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'finance_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','p.sharma@gps-global.com','billing',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+97143456789','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §Governance
    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Jonathan Clarke','individual',NULL,'CEO & Co-Founder',NULL,NULL,'2009-01-15','Founding CEO.'),
        ('director','Dr. Elena Vassiliev','individual',NULL,'Non-Executive Director',NULL,NULL,'2020-03-01','Independent NED.'),
        ('ubo','Clarke Family Trust','company','Clarke Family Trust','Majority Owner',52.0,'ordinary','2009-01-15','UK family trust.'),
        ('shareholder','Procure Growth Fund LP','company','Procure Growth Fund LP','PE Investor',48.0,'preference','2018-07-01','Growth PE — Fund III.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND relation_type=v.rel AND member_name=v.name);

    -- §Network link
    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'ariba','AN09988776655','connected','verified',99,'synced',now(),
        '{"profile":{"name":"Global Procurement Solutions Ltd","country":"GB"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='ariba');

    -- §Qualification
    INSERT INTO master.supplier_qualification (tenant_id,supplier_id,onboarding_status,profile_completeness_pct,onboarding_approved_at,onboarding_approved_by,is_approved_supplier,is_preferred_supplier,is_blocked,risk_tier,sanctions_status,aml_kyc_status,sanctions_check_date,kyc_expiry_date,sourcing_event_count,bid_count,awarded_count,delivery_score,quality_score,sla_score,score_period_start,score_period_end,last_review_date,next_review_date,reviewed_by,metadata,status,created_by)
    SELECT v_tid,v_sup,'approved',100,'2022-06-01 09:00+00'::timestamptz,v_sys,true,true,false,
        'low','clear','passed','2025-06-01'::date,'2026-06-01'::date,
        32,25,22,98.20,97.50,99.00,
        '2024-01-01'::date,'2024-12-31'::date,'2025-06-01'::date,'2026-06-01'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'review_notes','Global preferred supplier — top decile performance across all 4 companies.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup);

    RAISE NOTICE '[tksa_glb_sup] SUP-GLB-GPS-001 seeded across all 4 companies (bp=%, sup=%)', v_bp, v_sup;
END $tksa_glb_sup$;


-- ============================================================================
-- §GL2  Global Customer — International Business Holdings Inc (US → all 4 cos)
-- ============================================================================
DO $tksa_glb_cus$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_cus    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_acct   uuid;
    v_pm_in  uuid;
    v_tg     uuid;
    cc_rec   record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_ct1  FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';
    SELECT id INTO v_ct2  FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_acct FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AR_STANDARD' LIMIT 1;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'CUS-GLB-01','International Business Holdings Inc','IBH Inc',
        'International Business Holdings Incorporated',
        'organization',
        'US-based diversified holding company with technology and professional services subsidiaries worldwide.',
        'US-DEL-5678901','US',
        'https://www.ibh-global.com','CRM-CUS-IBH-001',
        'International Business Holdings Inc (IBH) is a Delaware-incorporated holding company '
        'managing strategic investments in ICT, digital media, and professional services across '
        'the Americas, EMEA, and APAC regions. Active buyer of managed services and consulting.',
        ARRAY['IBH','IBH Inc','International Business Holdings'],
        ARRAY['financial_services','professional_services'],
        'corporation', 2003,
        'e201_500',    'r500m_plus',
        '2003-09-01'::date,
        '["global","us","holding","strategic-account","key-account"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','200000601','legacy','CUS-IBH-001'),
            'account_management', jsonb_build_object('tier','strategic','segment','global-enterprise')
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-GLB-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-GLB-01';

    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-ibh-hq','IBH US HQ Washington DC','commercial','Attn: Global Procurement',
         '1201 Pennsylvania Ave NW','Suite 600',
         'Washington DC','District of Columbia','20004','US',
         '1201 Pennsylvania Ave NW, Suite 600, Washington DC 20004, USA'),
        ('addr-ibh-billing','IBH Finance Office','commercial','Attn: Accounts Payable',
         '100 Wall Street, 23rd Floor',NULL,
         'New York','New York','10005','US',
         '100 Wall Street, 23F, New York NY 10005, USA'),
        ('addr-ibh-mena','IBH MENA Regional Office','commercial','Attn: MENA Director',
         'DIFC, Gate Avenue South','Level 14, Tower 1',
         'Dubai','Dubai Emirate','00000','AE',
         'Level 14, Tower 1, Gate Avenue South, DIFC, Dubai, UAE')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    INSERT INTO master.customer (tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by)
    SELECT v_tid,v_bp,'CUS-GLB-IBH-001','corporate',true,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1')),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-IBH-001');

    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-IBH-001';

    -- §Address links — all three anchored at BP (DC HQ, NY billing, Dubai MENA hub are all canonical)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2003-09-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-ibh-hq','hq',true),('addr-ibh-billing','billing',true),('addr-ibh-mena','office',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    -- §One customer profile per company
    FOR cc_rec IN
        SELECT co.id AS cc_id, co.code AS cc_code, co.functional_currency AS curr,
               CASE co.code WHEN 'TKSA' THEN 'SADAD-SAR' WHEN 'SSK' THEN 'SADAD-SAR' ELSE 'RTGS-EGP' END AS pm_code,
               CASE co.code WHEN 'TKSA' THEN 'TG-SA-VAT-15-IN' WHEN 'SSK' THEN 'TG-SA-VAT-15-IN' ELSE 'TG-EG-VAT-14-IN' END AS tg_code,
               CASE co.code WHEN 'TKSA' THEN 25000000 WHEN 'SSK' THEN 20000000 WHEN 'TEGY' THEN 10000000 ELSE 8000000 END AS credit_lim
        FROM master.company_code co
        WHERE co.tenant_id = v_tid AND co.code IN ('TKSA','SSK','TEGY','SDTX')
    LOOP
        SELECT id INTO v_pm_in FROM master.payment_method WHERE tenant_id=v_tid AND code=cc_rec.pm_code;
        SELECT id INTO v_tg    FROM control.tax_group      WHERE tenant_id=v_tid AND code=cc_rec.tg_code;

        INSERT INTO master.company_code_customer_profile (tenant_id,customer_id,company_code_id,currency_code,credit_limit,credit_limit_currency_code,credit_rating,default_accounting_profile_id,default_receipt_method_id,tax_group_id,statement_cycle_code,is_blocked,metadata,status,created_by)
        SELECT v_tid,v_cus,cc_rec.cc_id,cc_rec.curr,cc_rec.credit_lim::numeric,cc_rec.curr,'aa',v_acct,v_pm_in,v_tg,'monthly',false,
            jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'cc',cc_rec.cc_code),'active',v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile WHERE tenant_id=v_tid AND customer_id=v_cus AND company_code_id=cc_rec.cc_id);
    END LOOP;

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',    '123456789',            'Dun & Bradstreet',     '2010-01-01',NULL,        true),
        ('lei',     '984500IBHUSA0000US01','GLEIF',               '2019-01-01','2024-01-01',false),
        ('crn',     'US-DEL-5678901',       'Delaware Div of Corps','2003-09-01',NULL,        false),
        ('tin',     'US-EIN-12-3456789',    'IRS',                  '2003-09-01',NULL,        false),
        ('peppol_id','0060:9834000001006',  'PEPPOL Authority',     '2022-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND scheme=v.scheme);

    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO27001-US-IBH-2023-0201','Deloitte & Touche','Washington DC, USA','Scope: Global information security management.','2023-11-01','2026-10-31'),
        (v_ct2,'ISO9001-US-IBH-2022-0158','KPMG LLP','New York, USA','Scope: Professional services and consulting quality management.','2022-06-01','2025-05-31')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; fn_resolve_party_contact falls through here
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Margaret Sullivan','Executive Vice President — EMEA',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Margaret Sullivan')
    RETURNING id INTO v_cp1;

    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Tariq Siddiqui','MENA Finance Controller',false,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Tariq Siddiqui')
    RETURNING id INTO v_cp2;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'main_contact',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','m.sullivan@ibh-global.com','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+12025551234','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;
    IF v_cp2 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp2,'finance_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','t.siddiqui@ibh-global.com','notification',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+97144501234','support',false,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys) ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Robert J. Whitfield','individual',NULL,'Chairman & CEO',NULL,NULL,'2003-09-01','Founding chairman.'),
        ('ubo','Whitfield Capital Group LLC','company','Whitfield Capital Group LLC','Principal Owner',44.0,'ordinary','2003-09-01','Family office.'),
        ('shareholder','Apex Growth Partners LP','company','Apex Growth Partners LP','Institutional Investor',36.0,'preference','2012-04-01','Growth PE fund.'),
        ('shareholder','Sovereign Tech Fund SWF','company','Sovereign Tech Fund SWF','Sovereign Investor',20.0,'ordinary','2018-09-01','Gulf SWF co-investor.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='customer' AND party_id=v_cus AND relation_type=v.rel AND member_name=v.name);

    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'ariba','AN01122334455','connected','verified',97,'synced',now(),
        '{"profile":{"name":"International Business Holdings Inc","country":"US"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='ariba');

    INSERT INTO master.customer_qualification (tenant_id,customer_id,credit_status,credit_limit_band,credit_score,credit_rating,dso_days,payment_behavior,has_overdue_history,kyc_status,aml_sanctions_status,beneficial_owner_check_status,kyc_check_date,kyc_expiry_date,is_dunning_eligible,is_statement_eligible,last_credit_review_date,next_credit_review_date,reviewer_id,metadata,status,created_by)
    SELECT v_tid,v_cus,
        'approved','multi_currency_50m_plus',920,'aa',
        27,'excellent',false,'passed','clear','passed',
        '2025-03-01'::date,'2027-02-28'::date,
        true,true,'2025-03-01'::date,'2026-03-01'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'credit_notes','Global strategic account. Excellent payment history across all 4 companies.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus);

    RAISE NOTICE '[tksa_glb_cus] CUS-GLB-IBH-001 seeded across all 4 companies (bp=%, cus=%)', v_bp, v_cus;
END $tksa_glb_cus$;


-- ============================================================================
-- §GL3  Global Both — Meridian Group International BV (DE → all 4 cos)
--       Both supplier AND customer across TKSA, SSK, TEGY, SDTX.
-- ============================================================================
DO $tksa_glb_both$
DECLARE
    v_tid  uuid;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
    v_bp     uuid;
    v_sup    uuid;
    v_cus    uuid;
    v_ct1    uuid;
    v_ct2    uuid;
    v_cp1    uuid;
    v_cp2    uuid;
    v_ba     uuid;
    v_bal    uuid;
    v_acct_ap uuid;
    v_acct_ar uuid;
    v_pm     uuid;
    v_pm_in  uuid;
    v_pt     uuid;
    v_tg     uuid;
    v_tg_wht uuid;
    cc_rec   record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'technostat tenant not found'; END IF;
    SELECT id INTO v_ct1    FROM master.certification_type  WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct2    FROM master.certification_type  WHERE tenant_id IS NULL AND code='iso-14001';
    SELECT id INTO v_acct_ap FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AP_NON_PO_STANDARD';
    SELECT id INTO v_acct_ar FROM master.accounting_profile WHERE tenant_id=v_tid AND code='AR_STANDARD' LIMIT 1;

    INSERT INTO master.business_partner (
        tenant_id,code,name,display_name,legal_name,
        partner_category,description,registration_no,registration_country_code,
        website_url,external_ref,long_description,
        aliases,business_types,legal_form,founded_year,
        employee_count_band,annual_revenue_band,incorporation_date,
        tags,metadata,status,created_by)
    SELECT v_tid,
        'BOTH-GLB-01','Meridian Group International BV','Meridian Group',
        'Meridian Group International Besloten Vennootschap',
        'organization',
        'Dutch-registered international group providing consulting services and procuring specialised technology.',
        'NL-KVK-12345678','DE',
        'https://www.meridian-group.com','ERP-BOTH-MGI-001',
        'Meridian Group International BV is a Dutch-incorporated entity (German operations HQ) '
        'that functions as both a technology services provider and a significant buyer of ICT '
        'infrastructure. It sells consulting and systems integration to Technostat entities '
        'while simultaneously procuring satellite comms and digital transformation services.',
        ARRAY['Meridian Group','MGI','Meridian International'],
        ARRAY['professional_services','technology'],
        'private_limited', 2007,
        'e201_500',        'r50m_100m',
        '2007-11-01'::date,
        '["global","eu","germany","netherlands","dual-role","strategic"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v1','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('sap_supplier','400000601','sap_customer','200000701'),
            'dual_role', jsonb_build_object('is_supplier',true,'is_customer',true,'note','Intercompany netting applies monthly')
        ),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='BOTH-GLB-01');

    SELECT id INTO v_bp FROM master.business_partner WHERE tenant_id=v_tid AND code='BOTH-GLB-01';

    -- §Addresses
    INSERT INTO master.address (tenant_id,code,name,address_type,attention_line,line1,line2,city,region,postal_code,country_code,formatted_address,metadata,status,created_by)
    SELECT v_tid,code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('addr-mgi-hq','Meridian HQ Frankfurt','commercial','Attn: Group Finance',
         'Siemensstraße 12','Main Tower, 31st Floor',
         'Frankfurt am Main','Hessen','60594','DE',
         'Main Tower, 31F, Siemensstraße 12, Frankfurt am Main 60594, Germany'),
        ('addr-mgi-legal','Meridian Registered Office NL','commercial','Attn: Legal Affairs',
         'Keizersgracht 281',NULL,
         'Amsterdam','North Holland','1016 ED','NL',
         'Keizersgracht 281, 1016 ED Amsterdam, Netherlands'),
        ('addr-mgi-billing','Meridian Billing Address','po_box','Attn: Accounts',
         'Postbus 87654',NULL,
         'Amsterdam','North Holland','1008 AC','NL',
         'Postbus 87654, 1008 AC Amsterdam, Netherlands')
    ) AS v(code,name,atype,attn,l1,l2,city,reg,pc,cc,fmt)
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code=v.code);

    -- §Supplier
    INSERT INTO master.supplier (tenant_id,business_partner_id,supplier_code,supplier_type,is_payment_ready,payment_ready_at,payment_ready_by,payment_ready_reason,metadata,status,created_by)
    SELECT v_tid,v_bp,'SUP-GLB-MGI-001','service',
        true,'2023-01-01 09:00+01'::timestamptz,v_sys,'Multi-currency banking verified.',
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'role','both'),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-MGI-001');

    SELECT id INTO v_sup FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-MGI-001';

    -- §Customer
    INSERT INTO master.customer (tenant_id,business_partner_id,customer_code,customer_type,is_key_account,metadata,status,created_by)
    SELECT v_tid,v_bp,'CUS-GLB-MGI-001','corporate',true,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'role','both'),'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-MGI-001');

    SELECT id INTO v_cus FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-MGI-001';

    -- §Address links — all three anchored at BP once (dual-role entity shares the same physical addresses)
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp,a.id,al.purpose,al.is_primary,'2007-11-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    FROM (VALUES ('addr-mgi-hq','hq',true),('addr-mgi-legal','legal',true),('addr-mgi-billing','billing',true)) AS al(code,purpose,is_primary)
    JOIN master.address a ON a.tenant_id=v_tid AND a.code=al.code
    WHERE NOT EXISTS (SELECT 1 FROM master.address_link WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND purpose=al.purpose AND address_id=a.id);

    -- §Supplier + customer profiles per company
    FOR cc_rec IN
        SELECT co.id AS cc_id, co.code AS cc_code, co.functional_currency AS curr,
               CASE co.code WHEN 'TKSA' THEN 'SARIE-SAR' WHEN 'SSK' THEN 'SARIE-SAR' ELSE 'WIRE-EGP' END AS pm_sup,
               CASE co.code WHEN 'TKSA' THEN 'SADAD-SAR' WHEN 'SSK' THEN 'SADAD-SAR' ELSE 'RTGS-EGP' END AS pm_cus,
               CASE co.code WHEN 'TKSA' THEN 'TG-SA-VAT-15-IN' WHEN 'SSK' THEN 'TG-SA-VAT-15-IN' ELSE 'TG-EG-VAT-14-IN' END AS tg_code,
               CASE co.code WHEN 'TKSA' THEN 'TG-SA-WHT-5-SVC' WHEN 'SSK' THEN 'TG-SA-WHT-5-SVC' ELSE 'TG-EG-WHT-10-SVC' END AS tg_wht_code,
               CASE co.code
                   WHEN 'TKSA' THEN 'SA0420000004400456789012'
                   WHEN 'SSK'  THEN 'SA0420000004400456789013'
                   WHEN 'TEGY' THEN 'EG380040100001234567890125001'
                   WHEN 'SDTX' THEN 'EG380040100001234567890125002'
               END AS iban,
               CASE co.code WHEN 'TKSA' THEN 'NCBKSAJE' WHEN 'SSK' THEN 'NCBKSAJE' ELSE 'NBEGEGCX' END AS bic,
               CASE co.code WHEN 'TKSA' THEN 'Saudi National Bank' WHEN 'SSK' THEN 'Saudi National Bank' ELSE 'National Bank of Egypt' END AS bank_name,
               CASE co.code WHEN 'TKSA' THEN 'SA' WHEN 'SSK' THEN 'SA' ELSE 'EG' END AS bank_country,
               CASE co.code WHEN 'TKSA' THEN 12000000 WHEN 'SSK' THEN 10000000 WHEN 'TEGY' THEN 6000000 ELSE 5000000 END AS credit_lim
        FROM master.company_code co
        WHERE co.tenant_id = v_tid AND co.code IN ('TKSA','SSK','TEGY','SDTX')
    LOOP
        SELECT id INTO v_pm     FROM master.payment_method WHERE tenant_id=v_tid AND code=cc_rec.pm_sup;
        SELECT id INTO v_pm_in  FROM master.payment_method WHERE tenant_id=v_tid AND code=cc_rec.pm_cus;
        SELECT id INTO v_tg     FROM control.tax_group     WHERE tenant_id=v_tid AND code=cc_rec.tg_code;
        SELECT id INTO v_tg_wht FROM control.tax_group     WHERE tenant_id=v_tid AND code=cc_rec.tg_wht_code;
        SELECT id INTO v_pt     FROM master.payment_term   WHERE tenant_id=v_tid AND code='PT-NET30' AND is_current_version=true LIMIT 1;

        SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-mgi-'||lower(cc_rec.cc_code);
        IF v_ba IS NULL THEN
            INSERT INTO master.bank_account (tenant_id,code,name,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bic_override,bank_name_override,bank_country_override,account_nature,is_verified,verified_at,metadata,status,created_by)
            VALUES (v_tid,'ba-mgi-'||lower(cc_rec.cc_code),
                'Meridian Group — '||cc_rec.curr||' ('||cc_rec.cc_code||')',
                'Meridian Group International BV',
                'iban',cc_rec.iban,right(cc_rec.iban,4),
                cc_rec.curr,cc_rec.bic,cc_rec.bank_name,cc_rec.bank_country,
                'direct',true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
            RETURNING id INTO v_ba;
        END IF;

        SELECT id INTO v_bal FROM master.bank_account_link WHERE tenant_id=v_tid AND bank_account_id=v_ba AND owner_type='business_partner' AND owner_id=v_bp AND company_code_id=cc_rec.cc_id AND purpose='disbursement';
        IF v_bal IS NULL THEN
            INSERT INTO master.bank_account_link (tenant_id,bank_account_id,owner_type,owner_id,company_code_id,purpose,is_primary,effective_from,metadata,created_by)
            VALUES (v_tid,v_ba,'business_partner',v_bp,cc_rec.cc_id,'disbursement',true,'2023-01-01','{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys)
            RETURNING id INTO v_bal;
        END IF;

        INSERT INTO master.company_code_supplier_profile (tenant_id,supplier_id,company_code_id,payment_term_id,payment_method_id,currency_code,default_accounting_profile_id,preferred_remittance_bank_link_id,tax_group_id,default_wht_tax_group_id,is_blocked,metadata,status,created_by)
        SELECT v_tid,v_sup,cc_rec.cc_id,v_pt,v_pm,cc_rec.curr,v_acct_ap,v_bal,v_tg,v_tg_wht,false,
            jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'cc',cc_rec.cc_code,'role','supplier'),'active',v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile WHERE tenant_id=v_tid AND supplier_id=v_sup AND company_code_id=cc_rec.cc_id);

        INSERT INTO master.company_code_customer_profile (tenant_id,customer_id,company_code_id,currency_code,credit_limit,credit_limit_currency_code,credit_rating,default_accounting_profile_id,default_receipt_method_id,tax_group_id,statement_cycle_code,is_blocked,metadata,status,created_by)
        SELECT v_tid,v_cus,cc_rec.cc_id,cc_rec.curr,cc_rec.credit_lim::numeric,cc_rec.curr,'a',v_acct_ar,v_pm_in,v_tg,'monthly',false,
            jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'cc',cc_rec.cc_code,'role','customer'),'active',v_sys
        WHERE NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile WHERE tenant_id=v_tid AND customer_id=v_cus AND company_code_id=cc_rec.cc_id);
    END LOOP;

    -- §Identifiers
    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',      '491700001',             'Dun & Bradstreet',  '2016-01-01',NULL,        true),
        ('lei',       '984500MGIDEU0000DE01','GLEIF',             '2019-01-01','2024-01-01',false),
        ('crn',       'NL-KVK-12345678',       'Dutch KVK',         '2007-11-01',NULL,        false),
        ('tin',       'NL-BTW-NL123456789B01', 'Dutch Belastingdienst','2007-11-01',NULL,     false),
        ('vat_reg',   'NL123456789B01',        'Dutch Belastingdienst','2007-11-01',NULL,     false),
        ('peppol_id', '9922:DE12345678901',    'PEPPOL Authority',  '2021-01-01',NULL,        false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND scheme=v.scheme);

    INSERT INTO master.party_identifier (tenant_id,owner_type,owner_id,scheme,value,issuing_authority,issued_at,valid_until,is_verified,verified_at,is_primary,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,scheme,val,auth,issued::date,vuntil::date,true,now(),pri,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('duns',    '491700001',             'Dun & Bradstreet',  '2016-01-01',NULL,       true),
        ('lei',     '984500MGIDEU0000DE01','GLEIF',             '2019-01-01','2024-01-01',false),
        ('crn',     'NL-KVK-12345678',       'Dutch KVK',         '2007-11-01',NULL,       false)
    ) AS v(scheme,val,auth,issued,vuntil,pri)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_identifier WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND scheme=v.scheme);

    -- §Tax profiles
    INSERT INTO master.party_tax_profile (tenant_id,owner_type,owner_id,country_code,penalty_information,discount_information,global_location_number,tax_classification,taxation_type,tax_id,vat_id,vat_registered,has_tax_clearance,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,'NL',
        'Statutory interest per Dutch civil code section 6:119.',
        '2% if settled within 14 days.',
        '8712345678901',
        'company','standard',
        'NL-BTW-NL123456789B01','NL123456789B01',true,false,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_tax_profile WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND country_code='NL');

    -- §Certifications (supplier)
    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-DE-MGI-2023-0311','TÜV Rheinland','Frankfurt, Germany','Scope: ICT consulting and managed services delivery.','2023-07-01','2026-06-30'),
        (v_ct2,'ISO14001-DE-MGI-2023-0088','TÜV Rheinland','Frankfurt, Germany','Scope: Environmental management for European operations.','2023-07-01','2026-06-30')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp AND certification_type_id=v.ct_id);

    -- §Certifications (customer — same standards, separate rows)
    INSERT INTO master.certification (tenant_id,owner_type,owner_id,certification_type_id,custom_name,certificate_number,certified_by,certified_location,additional_info,effective_from,effective_until,metadata,status,created_by)
    SELECT v_tid,'customer',v_cus,ct_id,NULL,cert_no,cert_by,cert_loc,info,eff_from::date,eff_until::date,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        (v_ct1,'ISO9001-DE-MGI-2023-0311','TÜV Rheinland','Frankfurt, Germany','As buyer — QMS verified by same certification body.','2023-07-01','2026-06-30'),
        (v_ct2,'ISO14001-DE-MGI-2023-0088','TÜV Rheinland','Frankfurt, Germany','Environmental scope covers procurement activities.','2023-07-01','2026-06-30')
    ) AS v(ct_id,cert_no,cert_by,cert_loc,info,eff_from,eff_until)
    WHERE NOT EXISTS (SELECT 1 FROM master.certification WHERE tenant_id=v_tid AND owner_type='customer' AND owner_id=v_cus AND certification_type_id=v.ct_id);

    -- §Contacts — BP is source of truth; dual-role entity has one identity spine
    INSERT INTO master.party_contact_person (tenant_id,party_type,party_id,company_code_id,contact_name,business_title,is_primary,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,NULL,'Hans Müller','Chief Executive Officer',true,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.party_contact_person WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND contact_name='Hans Müller')
    RETURNING id INTO v_cp1;

    IF v_cp1 IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by) VALUES (v_tid,v_cp1,'bid_proposal_manager',v_sys) ON CONFLICT DO NOTHING;
        INSERT INTO master.contact_link (tenant_id,owner_type,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,metadata,status,created_by) VALUES
        (v_tid,'business_partner',v_bp,'email','h.mueller@meridian-group.com','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys),
        (v_tid,'business_partner',v_bp,'phone','+496912345678','notification',true,true,now(),'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §Governance
    INSERT INTO master.party_governance_relation (tenant_id,party_type,party_id,relation_type,member_name,member_type,company_name,business_title,ownership_pct,share_class,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp,rel,name,mtype,co,title,pct,scls,apt::date,notes,'{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,'active',v_sys
    FROM (VALUES
        ('director','Hans Müller','individual',NULL,'CEO & Managing Director',NULL,NULL,'2007-11-01','Founding CEO — dual role entity.'),
        ('director','Katrin Weber','individual',NULL,'CFO',NULL,NULL,'2015-01-01','Finance director across both roles.'),
        ('ubo','Meridian Capital Partners GmbH','company','Meridian Capital Partners GmbH','Majority Shareholder',60.0,'ordinary','2007-11-01','German family holding.'),
        ('shareholder','EIF — European Investment Fund','company','EIF — European Investment Fund','Strategic Investor',40.0,'preference','2013-06-01','EU-backed growth investor.')
    ) AS v(rel,name,mtype,co,title,pct,scls,apt,notes)
    WHERE NOT EXISTS (SELECT 1 FROM master.party_governance_relation WHERE tenant_id=v_tid AND party_type='business_partner' AND party_id=v_bp AND relation_type=v.rel AND member_name=v.name);

    -- §Network link
    INSERT INTO master.business_partner_network_link (tenant_id,business_partner_id,provider_code,network_account_id,connection_status,verification_status,match_confidence,sync_status,last_synced_at,network_snapshot,metadata,created_by)
    SELECT v_tid,v_bp,'peppol','9922:DE12345678901','connected','verified',96,'synced',now(),
        '{"profile":{"name":"Meridian Group International BV","country":"NL"}}'::jsonb,
        '{"_seed":{"pack":"tksa_party_master_v1"}}'::jsonb,v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.business_partner_network_link WHERE tenant_id=v_tid AND business_partner_id=v_bp AND provider_code='peppol');

    -- §Supplier qualification
    INSERT INTO master.supplier_qualification (tenant_id,supplier_id,onboarding_status,profile_completeness_pct,onboarding_approved_at,onboarding_approved_by,is_approved_supplier,is_preferred_supplier,is_blocked,risk_tier,sanctions_status,aml_kyc_status,sanctions_check_date,kyc_expiry_date,sourcing_event_count,bid_count,awarded_count,delivery_score,quality_score,sla_score,score_period_start,score_period_end,last_review_date,next_review_date,reviewed_by,metadata,status,created_by)
    SELECT v_tid,v_sup,'approved',100,'2023-01-01 09:00+01'::timestamptz,v_sys,true,false,false,
        'low','clear','passed','2025-01-15'::date,'2026-01-15'::date,
        20,16,14,93.00,94.20,95.50,
        '2024-01-01'::date,'2024-12-31'::date,'2025-01-15'::date,'2026-01-15'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'review_notes','Dual-role approved supplier. Performance good across all 4 companies.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup);

    -- §Customer qualification
    INSERT INTO master.customer_qualification (tenant_id,customer_id,credit_status,credit_limit_band,credit_score,credit_rating,dso_days,payment_behavior,has_overdue_history,kyc_status,aml_sanctions_status,beneficial_owner_check_status,kyc_check_date,kyc_expiry_date,is_dunning_eligible,is_statement_eligible,last_credit_review_date,next_credit_review_date,reviewer_id,metadata,status,created_by)
    SELECT v_tid,v_cus,
        'approved','multi_currency_10m_50m',860,'a',
        33,'good',false,'passed','clear','passed',
        '2025-01-15'::date,'2027-01-14'::date,
        true,true,'2025-01-15'::date,'2026-01-15'::date,v_sys,
        jsonb_build_object('_seed',jsonb_build_object('pack','tksa_party_master_v1'),'credit_notes','Dual-role entity. Intercompany netting reduces net exposure. Monthly netting advised.'),
        'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus);

    RAISE NOTICE '[tksa_glb_both] BOTH-GLB-01 (Meridian) seeded across all 4 companies (bp=%, sup=%, cus=%)', v_bp, v_sup, v_cus;
    RAISE NOTICE '[tksa_glb_both] Done — full technostat BP/supplier/customer dataset complete.';
END $tksa_glb_both$;

-- ============================================================================
-- §CONTACT_CHANNELS  Link seeded BP contacts to channel rows + extensions
-- ============================================================================
DO $tksa_contact_channels$
DECLARE
    v_tid             uuid;
    v_sys             uuid := '00000000-0000-0000-0000-000000000000';
    v_row             record;
    v_contact_link_id uuid;
    v_slug            text;
    v_calling_code    text;
    v_national_number text;
    v_count           integer := 0;
BEGIN
    SELECT id INTO v_tid
      FROM master.tenant
     WHERE realm_key = 'athyper'
       AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'technostat tenant not found';
    END IF;

    FOR v_row IN
        SELECT
            pcp.id AS party_contact_person_id,
            pcp.party_id AS business_partner_id,
            pcp.contact_name,
            pcp.is_primary AS contact_is_primary,
            src.channel_type,
            src.value,
            src.purpose,
            src.is_primary,
            src.is_verified,
            src.verified_at
        FROM master.party_contact_person pcp
        JOIN master.contact_link src
          ON src.tenant_id = pcp.tenant_id
         AND src.owner_type = 'business_partner'
         AND src.owner_id = pcp.party_id
         AND src.channel_type IN ('email', 'phone', 'sms', 'whatsapp')
         AND src.is_primary = pcp.is_primary
         AND src.status = 'active'
        WHERE pcp.tenant_id = v_tid
          AND pcp.party_type = 'business_partner'
          AND pcp.status = 'active'
        ORDER BY pcp.party_id, pcp.is_primary DESC, pcp.contact_name, src.channel_type
    LOOP
        v_slug := btrim(regexp_replace(lower(v_row.contact_name), '[^a-z0-9]+', '-', 'g'), '-');
        IF v_slug = '' THEN
            v_slug := replace(v_row.party_contact_person_id::text, '-', '');
        END IF;

        INSERT INTO master.contact_link (
            tenant_id, code, name,
            owner_type, owner_id,
            channel_type, value, purpose,
            is_primary, is_verified, verified_at,
            metadata, status, created_by)
        VALUES (
            v_tid,
            'bp-contact-' || v_slug || '-' || v_row.channel_type,
            v_row.contact_name || ' ' || v_row.channel_type,
            'business_partner_contact_person',
            v_row.party_contact_person_id,
            v_row.channel_type,
            v_row.value,
            v_row.purpose,
            v_row.is_primary,
            v_row.is_verified,
            CASE WHEN v_row.is_verified THEN COALESCE(v_row.verified_at, now()) ELSE NULL END,
            jsonb_build_object(
                '_seed', jsonb_build_object(
                    'pack', 'tksa_party_master_v1',
                    'channel_owner', 'party_contact_person',
                    'source_owner_type', 'business_partner'
                ),
                'business_partner_id', v_row.business_partner_id,
                'party_contact_person_id', v_row.party_contact_person_id
            ),
            'active',
            v_sys
        )
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose)
        DO UPDATE SET
            code        = EXCLUDED.code,
            name        = EXCLUDED.name,
            is_primary  = EXCLUDED.is_primary,
            is_verified = EXCLUDED.is_verified,
            verified_at = EXCLUDED.verified_at,
            metadata    = COALESCE(master.contact_link.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            status      = 'active',
            updated_at  = now(),
            updated_by  = v_sys
        RETURNING id INTO v_contact_link_id;

        IF v_row.channel_type = 'email' THEN
            INSERT INTO master.contact_email (
                tenant_id, contact_link_id,
                local_part, domain,
                is_disposable, mx_checked_at, mx_valid,
                bounce_count, last_bounce_at, last_bounce_reason,
                metadata, created_by)
            VALUES (
                v_tid,
                v_contact_link_id,
                lower(split_part(v_row.value, '@', 1)),
                lower(split_part(v_row.value, '@', 2)),
                false,
                now(),
                true,
                0,
                NULL,
                NULL,
                jsonb_build_object(
                    '_seed', jsonb_build_object('pack', 'tksa_party_master_v1'),
                    'party_contact_person_id', v_row.party_contact_person_id
                ),
                v_sys
            )
            ON CONFLICT (tenant_id, contact_link_id)
            DO UPDATE SET
                local_part         = EXCLUDED.local_part,
                domain             = EXCLUDED.domain,
                is_disposable      = EXCLUDED.is_disposable,
                mx_checked_at      = EXCLUDED.mx_checked_at,
                mx_valid           = EXCLUDED.mx_valid,
                bounce_count       = EXCLUDED.bounce_count,
                last_bounce_at     = EXCLUDED.last_bounce_at,
                last_bounce_reason = EXCLUDED.last_bounce_reason,
                metadata           = COALESCE(master.contact_email.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                updated_at         = now(),
                updated_by         = v_sys;
        ELSE
            v_calling_code := CASE
                WHEN v_row.value LIKE '+966%' THEN '966'
                WHEN v_row.value LIKE '+971%' THEN '971'
                WHEN v_row.value LIKE '+20%'  THEN '20'
                WHEN v_row.value LIKE '+44%'  THEN '44'
                WHEN v_row.value LIKE '+49%'  THEN '49'
                WHEN v_row.value LIKE '+1%'   THEN '1'
                ELSE NULL
            END;

            v_national_number := CASE v_calling_code
                WHEN '966' THEN substring(v_row.value FROM 5)
                WHEN '971' THEN substring(v_row.value FROM 5)
                WHEN '20'  THEN substring(v_row.value FROM 4)
                WHEN '44'  THEN substring(v_row.value FROM 4)
                WHEN '49'  THEN substring(v_row.value FROM 4)
                WHEN '1'   THEN substring(v_row.value FROM 3)
                ELSE regexp_replace(v_row.value, '^\+', '')
            END;

            INSERT INTO master.contact_phone (
                tenant_id, contact_link_id,
                e164, calling_code, national_number,
                carrier_hint, line_type,
                metadata, created_by)
            VALUES (
                v_tid,
                v_contact_link_id,
                v_row.value,
                v_calling_code,
                v_national_number,
                CASE
                    WHEN v_row.value LIKE '+966%' THEN 'KSA fixed line'
                    WHEN v_row.value LIKE '+971%' THEN 'UAE fixed line'
                    WHEN v_row.value LIKE '+20%'  THEN 'Egypt fixed line'
                    WHEN v_row.value LIKE '+44%'  THEN 'UK fixed line'
                    WHEN v_row.value LIKE '+49%'  THEN 'Germany fixed line'
                    WHEN v_row.value LIKE '+1%'   THEN 'North America fixed line'
                    ELSE 'Unknown carrier'
                END,
                CASE
                    WHEN v_row.value LIKE '+9665%' OR v_row.value LIKE '+9715%' THEN 'mobile'
                    ELSE 'landline'
                END,
                jsonb_build_object(
                    '_seed', jsonb_build_object('pack', 'tksa_party_master_v1'),
                    'party_contact_person_id', v_row.party_contact_person_id
                ),
                v_sys
            )
            ON CONFLICT (tenant_id, contact_link_id)
            DO UPDATE SET
                e164            = EXCLUDED.e164,
                calling_code    = EXCLUDED.calling_code,
                national_number = EXCLUDED.national_number,
                carrier_hint    = EXCLUDED.carrier_hint,
                line_type       = EXCLUDED.line_type,
                metadata        = COALESCE(master.contact_phone.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                updated_at      = now(),
                updated_by      = v_sys;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE '[tksa_contact_channels] Seeded % named contact channel links with email/phone extensions.', v_count;
END $tksa_contact_channels$;
