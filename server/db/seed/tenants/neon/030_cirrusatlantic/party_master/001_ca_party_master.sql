-- ============================================================================
-- CIRRUSATLANTIC — PARTY MASTER (SUPPLIERS & CUSTOMERS)
-- ============================================================================
-- File:     party_master/001_ca_party_master.sql
-- Tenant:   cirrusatlantic (code=CATL, UK, GBP, April FY)
-- Purpose:  Full party master — 2 suppliers + 2 customers with 100% field
--           coverage, all child tables, network capabilities, relations,
--           and app-index refresh.
--
-- Suppliers:
--   §SUP1  BRT-001 — BrightTech Solutions Ltd    (London, IT hardware/software)
--   §SUP2  CSM-001 — CloudServe Managed IT Ltd   (Birmingham, cloud/managed IT)
--
-- Customers:
--   §CUS1  APX-001 — Apex Digital Group PLC      (London, enterprise tech)
--   §CUS2  LAT-001 — Latitude Consulting Ltd     (Manchester, professional svcs)
--
-- Child table coverage per entity:
--   master.business_partner, address, address_link (one BP default link)
--   party_identifier (CRN, VAT, DUNS, LEI where applicable)
--   party_contact_person ×2, party_contact_role ×2
--   contact_link (email + phone per contact, billing channel)
--   party_governance_relation (director + UBO/majority shareholder)
--   party_tax_profile
--   certification ×2
--   bank_account + bank_account_link (suppliers)
--   supplier / customer (all writable columns)
--   company_code_supplier_profile / company_code_customer_profile
--   supplier_qualification / customer_qualification
--   supplier_commodity_category (both suppliers)
--   customer_block (APX-001: historical credit hold, lifted)
--   business_partner_network_capability (Peppol for all 4 BPs)
--   business_partner_network_link (Peppol GB + Ariba for BRT-001)
--   business_partner_relation (2 pairs)
--   supplier_app_index / customer_app_index refresh
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- Depends:    000_tenant.sql, 100_org_structure/200_legal_entities.sql
-- ============================================================================

DO $catl_pm$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_cc   uuid;   -- company code: CATL

    -- ── Reference data ───────────────────────────────────────────────────────
    v_jur_hmrc   uuid;
    v_tt_vat     uuid;
    v_trs_vat    uuid;
    v_tg_vat     uuid;
    v_pm_bacs    uuid;
    v_pm_chaps   uuid;
    v_pm_fps     uuid;
    v_pt_net30   uuid;
    v_pt_net45   uuid;
    v_ct_iso9001   uuid;
    v_ct_iso27001  uuid;
    v_ct_iso14001  uuid;
    v_ct_pcidss    uuid;

    -- ── BRT-001 working vars ─────────────────────────────────────────────────
    v_bp_brt   uuid;
    v_sup_brt  uuid;

    -- ── CSM-001 working vars ─────────────────────────────────────────────────
    v_bp_csm   uuid;
    v_sup_csm  uuid;

    -- ── APX-001 working vars ─────────────────────────────────────────────────
    v_bp_apx   uuid;
    v_cus_apx  uuid;

    -- ── LAT-001 working vars ─────────────────────────────────────────────────
    v_bp_lat   uuid;
    v_cus_lat  uuid;

    -- ── Shared scratch ───────────────────────────────────────────────────────
    v_addr  uuid;
    v_cp    uuid;
    v_ba    uuid;

    -- Condition_type catalog refs (system rows)
    v_ct_vat  uuid;

    v_seed  jsonb := '{"_seed":{"pack":"001_ca_party_master","version":"1.0.0"}}'::jsonb;
BEGIN
    SELECT id INTO v_ct_vat FROM master.condition_type
     WHERE code = 'TAX_VAT' AND tenant_id IS NULL;

    -- ── Resolve tenant ───────────────────────────────────────────────────────
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_ca_party_master] CirrusAtlantic tenant not found';
    END IF;

    SELECT id INTO v_cc
    FROM master.company_code
    WHERE tenant_id = v_tid AND code = 'CATL';

    IF v_cc IS NULL THEN
        RAISE EXCEPTION '[001_ca_party_master] Company code CATL not found';
    END IF;

    -- ============================================================================
    -- §REF  Reference data — UK tax, payment methods, payment terms, cert types
    -- ============================================================================

    -- UK: HMRC tax jurisdiction
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, jurisdiction_type, country_code, status, created_by)
    SELECT v_tid,'GB-HMRC','HM Revenue & Customs','country','GB','active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='GB-HMRC'
    );

    -- UK: VAT (kind classified via condition_type_id → TAX_VAT)
    INSERT INTO master.tax_type
        (tenant_id, code, name, condition_type_id, status, created_by)
    SELECT v_tid,'VAT-GB','UK VAT 20%',v_ct_vat,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.tax_type WHERE tenant_id=v_tid AND code='VAT-GB');

    SELECT id INTO v_jur_hmrc FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='GB-HMRC';
    SELECT id INTO v_tt_vat   FROM master.tax_type          WHERE tenant_id=v_tid AND code='VAT-GB';

    SELECT id INTO v_trs_vat FROM control.tax_rate_schedule
     WHERE tenant_id=v_tid AND jurisdiction_id=v_jur_hmrc AND tax_type_id=v_tt_vat
       AND tax_direction='PURCHASE' AND COALESCE(component_code,'')='MAIN' LIMIT 1;

    IF v_trs_vat IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value,
            recoverability_mode, recoverability_percent,
            calculation_basis, effective_from, status, created_by
        ) VALUES (
            v_tid, v_jur_hmrc, v_tt_vat, 'PURCHASE',
            'MAIN','PERCENT',20.00,'FULL',100.00,
            'LINE_NET','2011-01-04','active',v_sys
        ) RETURNING id INTO v_trs_vat;
    END IF;

    SELECT id INTO v_tg_vat FROM control.tax_group
     WHERE tenant_id=v_tid AND code='TG-GB-VAT-20-IN';
    IF v_tg_vat IS NULL THEN
        INSERT INTO control.tax_group (tenant_id, code, name, status, created_by)
        VALUES (v_tid,'TG-GB-VAT-20-IN','UK VAT 20% Input','active',v_sys)
        RETURNING id INTO v_tg_vat;
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq, status, created_by)
        VALUES (v_tid, v_tg_vat, v_trs_vat, 10, 'active', v_sys);
    END IF;

    -- Payment methods (UK domestic)
    INSERT INTO master.payment_method (
        tenant_id, code, name, direction, instrument_mode, status, created_by)
    SELECT v_tid, code, name, direction, mode, 'active', v_sys
    FROM (VALUES
        ('BACS-GBP', 'GBP BACS Bank Transfer',     'outbound', 'bank_transfer'),
        ('CHAPS-GBP','GBP CHAPS Same-Day Payment',  'outbound', 'bank_transfer'),
        ('FPS-GBP',  'GBP Faster Payments',         'outbound', 'bank_transfer'),
        ('DD-GBP',   'GBP Direct Debit',            'inbound',  'bank_transfer')
    ) AS v(code,name,direction,mode)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.payment_method WHERE tenant_id=v_tid AND code=v.code
    );

    SELECT id INTO v_pm_bacs  FROM master.payment_method WHERE tenant_id=v_tid AND code='BACS-GBP';
    SELECT id INTO v_pm_chaps FROM master.payment_method WHERE tenant_id=v_tid AND code='CHAPS-GBP';
    SELECT id INTO v_pm_fps   FROM master.payment_method WHERE tenant_id=v_tid AND code='FPS-GBP';

    -- Payment terms
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
         WHERE tenant_id=v_tid AND code=v.code AND is_current_version=true
    );

    SELECT id INTO v_pt_net30 FROM master.payment_term WHERE tenant_id=v_tid AND code='PT-NET30' AND is_current_version=true;
    SELECT id INTO v_pt_net45 FROM master.payment_term WHERE tenant_id=v_tid AND code='PT-NET45' AND is_current_version=true;

    -- Certification types — resolved from platform seed
    --   Guaranteed present by platform/003_master/003_certification_type.sql.
    SELECT id INTO v_ct_iso9001  FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-9001';
    SELECT id INTO v_ct_iso27001 FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-27001';
    SELECT id INTO v_ct_iso14001 FROM master.certification_type WHERE tenant_id IS NULL AND code='iso-14001';
    SELECT id INTO v_ct_pcidss   FROM master.certification_type WHERE tenant_id IS NULL AND code='pci-dss';

    RAISE NOTICE '[001_ca_party_master] §REF: UK reference data ensured';

    -- ============================================================================
    -- §SUP1  BRT-001 — BrightTech Solutions Ltd
    --        London IT hardware/software supplier. ISO 9001 + ISO 27001 certified.
    --        Peppol + Ariba network participant. BACS payment.
    -- ============================================================================

    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        tags, metadata, status, created_by
    )
    SELECT
        v_tid,
        'BP-CATL-BRT-001',
        'BrightTech Solutions Ltd',
        'BrightTech',
        'BrightTech Solutions Limited',
        'organization',
        'UK IT hardware and enterprise software reseller headquartered in the City of London.',
        '09876543', 'GB',
        'https://www.brighttech.co.uk', 'ERP-SUP-BRT-001',
        'BrightTech Solutions Ltd is a UK-registered IT hardware and enterprise software '
        'reseller with a strong public sector client base across Central Government and NHS. '
        'Crown Commercial Service (CCS) approved supplier. ISO 9001 and ISO 27001 certified.',
        ARRAY['BrightTech','Bright Tech Solutions'],
        ARRAY['technology','hardware','software'],
        'private_limited', 2008,
        'e51_200', 'r10m_50m',
        '2008-04-22'::date,
        '["uk","london","it-hardware","software","ccs-approved","public-sector"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','001_ca_party_master','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('legacy','BRT-001')
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-BRT-001'
    );

    SELECT id INTO v_bp_brt FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-BRT-001';

    -- BRT-001: Addresses
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-brt-hq','BrightTech — City of London HQ','commercial',
        'Attn: Accounts Receivable',
        '45 Moorgate','3rd Floor',
        'London',NULL,'EC2R 6AP','GB',
        '45 Moorgate, 3rd Floor, London EC2R 6AP, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-brt-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-brt-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp_brt,v_addr,'default',true,'2008-04-22',v_seed,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,role_qualifier,address_id) DO NOTHING;

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-brt-wh','BrightTech — Logistics & Warehouse','warehouse',
        'Attn: Goods-In',
        'Unit 7 Acton Industrial Park','London','W3 8QJ','GB',
        'Unit 7 Acton Industrial Park, London W3 8QJ, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-brt-wh')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-brt-wh'; END IF;
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-brt-rem','BrightTech — Remittance / Billing','po_box',
        'Attn: Finance — Remittances',
        'PO Box 4500','London','EC1A 1BB','GB',
        'PO Box 4500, London EC1A 1BB, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-brt-rem')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-brt-rem'; END IF;
    -- BRT-001: Identifiers
    INSERT INTO master.party_identifier (
        tenant_id,owner_type,owner_id,scheme,value,
        issuing_authority,issued_at,is_verified,verified_at,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_brt,scheme,val,auth,issued::date,true,now(),pri,v_seed,'active',v_sys
    FROM (VALUES
        ('crn',  '09876543',          'Companies House UK',        '2008-04-22', true),
        ('vat',  'GB987654321',       'HMRC',                      '2009-01-01', false),
        ('duns', '234567890',         'Dun & Bradstreet',          '2010-06-15', false),
        ('peppol','0009:GB987654321', 'Peppol Authority UK',       '2022-03-01', false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner'
           AND owner_id=v_bp_brt AND scheme=v.scheme
    );

    -- BRT-001: Tax profile
    INSERT INTO master.party_tax_profile (
        tenant_id,owner_type,owner_id,
        country_code,vat_id,
        vat_registered,
        metadata,created_by)
    SELECT v_tid,'business_partner',v_bp_brt,
        'GB','GB987654321',
        true,
        v_seed,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp_brt
           AND country_code='GB'
    );

    -- BRT-001: Certifications
    IF v_ct_iso9001 IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_brt,v_ct_iso9001,
            'ISO9001-BRT-2023-4421','2023-06-01'::date,'2026-05-31'::date,
            'BSI Group',
            'IT hardware procurement, resale and distribution operations.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_brt AND certification_type_id=v_ct_iso9001
        );
    END IF;
    IF v_ct_iso27001 IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_brt,v_ct_iso27001,
            'ISO27001-BRT-2022-1187','2022-11-15'::date,'2025-11-14'::date,
            'LRQA',
            'Information security management for enterprise software and hardware supply chain.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_brt AND certification_type_id=v_ct_iso27001
        );
    END IF;

    -- BRT-001: Contact persons
    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_brt,NULL,
        'Sarah Whitfield','Account Manager',true,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_brt AND contact_name='Sarah Whitfield'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_brt,'email','s.whitfield@brighttech.co.uk',
         'default',true,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_brt,'phone','+44 20 7946 0100',
         'default',true,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_cp IS NULL THEN
        SELECT id INTO v_cp FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_brt AND contact_name='Sarah Whitfield';
    END IF;

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_brt,NULL,
        'James Thornton','Finance Director',false,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_brt AND contact_name='James Thornton'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'billing_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_brt,'email','finance@brighttech.co.uk',
         'default',false,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_brt,'phone','+44 20 7946 0101',
         'default',false,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- BRT-001: Governance relations
    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,
        relation_type,member_type,member_name,company_name,
        ownership_pct,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_brt,
        role,mtype,dname,cname,
        opct,appt::date,notes,v_seed,'active',v_sys
    FROM (VALUES
        ('director',    'individual', 'Oliver Hargreaves',  NULL,         NULL::numeric,
         '2008-04-22', 'Founder and Managing Director.'),
        ('ubo',         'individual', 'Oliver Hargreaves',  NULL,         75.0000,
         '2008-04-22', 'Beneficial owner — 75% ordinary shares. PSC registered at Companies House.'),
        ('shareholder', 'trust',      'BRT Holdings Trust', 'BRT Holdings Trust', 25.0000,
         '2015-01-01', 'Family trust holding remaining 25% shares.')
    ) AS v(role,mtype,dname,cname,opct,appt,notes)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_id=v_bp_brt AND relation_type=v.role AND member_name=v.dname
    );

    -- BRT-001: Bank account (NatWest GBP)
    INSERT INTO master.bank_account (
        tenant_id, code, name,
        bank_name_override, account_holder_name, account_id_type, account_id_value,
        bic_override, bank_country_override,
        currency_code,
        metadata, status, created_by)
    SELECT v_tid,
        'ba-brt-001-gbp','BrightTech — NatWest GBP',
        'NatWest Bank PLC','BrightTech Solutions Limited','iban','GB29NWBK60161331926819',
        'NWBKGB2L','GB',
        'GBP',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-brt-001-gbp'
    )
    RETURNING id INTO v_ba;
    IF v_ba IS NULL THEN SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-brt-001-gbp'; END IF;
    INSERT INTO master.bank_account_link (
        tenant_id,owner_type,owner_id,bank_account_id,purpose,is_primary,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp_brt,v_ba,'default',true,v_seed,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.bank_account_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp_brt
           AND bank_account_id=v_ba AND purpose='default'
    );

    -- BRT-001: Supplier role
    INSERT INTO master.supplier (
        tenant_id,business_partner_id,supplier_code,supplier_type,
        is_payment_ready,payment_ready_at,
        payment_method_id,payment_term_id,
        metadata,status,created_by)
    SELECT v_tid,v_bp_brt,'SUP-CATL-BRT-001','general',
        true,'2009-03-01'::timestamptz,
        v_pm_bacs,v_pt_net30,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-CATL-BRT-001'
    );
    SELECT id INTO v_sup_brt FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-CATL-BRT-001';

    -- BRT-001: Company code supplier profile (CATL)
    INSERT INTO master.company_code_supplier_profile (
        tenant_id,company_code_id,supplier_id,
        currency_code,payment_method_id,payment_term_id,
        metadata,status,created_by)
    SELECT v_tid,v_cc,v_sup_brt,
        'GBP',v_pm_bacs,v_pt_net30,
        v_seed,'active',v_sys
    WHERE v_sup_brt IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_profile
         WHERE tenant_id=v_tid AND company_code_id=v_cc AND supplier_id=v_sup_brt
    );

    -- BRT-001: Supplier qualification
    INSERT INTO master.supplier_qualification (
        tenant_id,supplier_id,
        onboarding_status,is_approved_supplier,
        onboarding_approved_at,onboarding_approved_by,
        next_review_date,
        risk_tier,aml_kyc_status,
        metadata,created_by)
    SELECT v_tid,v_sup_brt,
        'approved',true,
        '2009-03-01'::timestamptz,v_sys,
        '2026-03-01'::date,
        'low','passed',
        v_seed,v_sys
    WHERE v_sup_brt IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup_brt
    );

    -- BRT-001: Spend categories
    IF v_sup_brt IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id,supplier_id,commodity_category_id,is_primary,metadata,created_by)
        SELECT v_tid,v_sup_brt,sc.id,is_pri,v_seed,v_sys
        FROM (VALUES ('SC-IT',true),('SC-SUBS',false)) AS v(code,is_pri)
        JOIN master.commodity_category sc ON sc.tenant_id=v_tid AND sc.code=v.code
        ON CONFLICT (tenant_id,supplier_id,commodity_category_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[001_ca_party_master] §SUP1: BRT-001 BrightTech Solutions seeded (bp=%, sup=%)', v_bp_brt, v_sup_brt;

    -- ============================================================================
    -- §SUP2  CSM-001 — CloudServe Managed IT Ltd
    --        Birmingham cloud/managed services supplier. ISO 27001 + SOC 2.
    --        Peppol network participant. CHAPS payment for large engagements.
    -- ============================================================================

    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        tags, metadata, status, created_by
    )
    SELECT
        v_tid,
        'BP-CATL-CSM-001',
        'CloudServe Managed IT Ltd',
        'CloudServe',
        'CloudServe Managed Information Technology Limited',
        'organization',
        'UK managed cloud services provider with UK data-residency guarantee, G-Cloud supplier.',
        '11234567', 'GB',
        'https://www.cloudserve.co.uk', 'ERP-SUP-CSM-001',
        'CloudServe Managed IT Ltd (CSM) provides IaaS, PaaS and managed SOC services '
        'from UK-only data centres. G-Cloud 14 framework supplier. ISO 27001 certified '
        'and SOC 2 Type II attested. Primary sectors: Financial Services, Public Sector, NHS.',
        ARRAY['CloudServe','Cloud Serve Managed IT'],
        ARRAY['technology','cloud','managed_services'],
        'private_limited', 2015,
        'e51_200', 'r10m_50m',
        '2015-09-10'::date,
        '["uk","birmingham","cloud","managed-it","g-cloud","nhs","financial-services"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','001_ca_party_master','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('legacy','CSM-001')
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-CSM-001'
    );

    SELECT id INTO v_bp_csm FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-CSM-001';

    -- CSM-001: Addresses
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-csm-hq','CloudServe — Birmingham HQ','commercial',
        'Attn: Client Operations',
        '1 Centenary Square','Alpha Tower, Floor 10',
        'Birmingham','West Midlands','B1 1HQ','GB',
        '1 Centenary Square, Alpha Tower, Floor 10, Birmingham B1 1HQ, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-csm-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-csm-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp_csm,v_addr,'default',true,'2015-09-10',v_seed,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,role_qualifier,address_id) DO NOTHING;

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-csm-dc','CloudServe — Primary Datacentre Mgmt','commercial',
        'Attn: NOC',
        'Agecroft Commerce Park','Salford','Greater Manchester','M27 8UW','GB',
        'Agecroft Commerce Park, Salford, Greater Manchester M27 8UW, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-csm-dc')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-csm-dc'; END IF;
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-csm-rem','CloudServe — Remittance Address','po_box',
        'Attn: Finance — Accounts Receivable',
        'PO Box 7800','Birmingham','B1 9ZZ','GB',
        'PO Box 7800, Birmingham B1 9ZZ, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-csm-rem')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-csm-rem'; END IF;
    -- CSM-001: Identifiers
    INSERT INTO master.party_identifier (
        tenant_id,owner_type,owner_id,scheme,value,
        issuing_authority,issued_at,is_verified,verified_at,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_csm,scheme,val,auth,issued::date,true,now(),pri,v_seed,'active',v_sys
    FROM (VALUES
        ('crn',   '11234567',          'Companies House UK',  '2015-09-10', true),
        ('vat',   'GB123456789',       'HMRC',                '2016-04-06', false),
        ('duns',  '345678901',         'Dun & Bradstreet',    '2017-02-10', false),
        ('peppol','0009:GB123456789',  'Peppol Authority UK', '2023-01-15', false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner'
           AND owner_id=v_bp_csm AND scheme=v.scheme
    );

    -- CSM-001: Tax profile
    INSERT INTO master.party_tax_profile (
        tenant_id,owner_type,owner_id,
        country_code,vat_id,
        vat_registered,
        metadata,created_by)
    SELECT v_tid,'business_partner',v_bp_csm,
        'GB','GB123456789',
        true,
        v_seed,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp_csm
           AND country_code='GB'
    );

    -- CSM-001: Certifications (ISO 27001 + SOC 2)
    IF v_ct_iso27001 IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_csm,v_ct_iso27001,
            'ISO27001-CSM-2024-0892','2024-02-20'::date,'2027-02-19'::date,
            'BSI Group',
            'Cloud infrastructure management, managed security operations, '
            'and data processing for UK-resident workloads.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_csm AND certification_type_id=v_ct_iso27001
        );
    END IF;
    IF v_ct_pcidss IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_csm,v_ct_pcidss,
            'PCIDSS-CSM-2024-QSA-0443','2024-07-01'::date,'2025-06-30'::date,
            'Control Case Ltd (QSA)',
            'Hosted payment processing environment — PCI DSS Level 2 Service Provider.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_csm AND certification_type_id=v_ct_pcidss
        );
    END IF;

    -- CSM-001: Contact persons
    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_csm,NULL,
        'Priya Nair','Customer Success Manager',true,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_csm AND contact_name='Priya Nair'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_csm,'email','p.nair@cloudserve.co.uk',
         'default',true,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_csm,'phone','+44 121 496 0200',
         'default',true,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_csm,NULL,
        'David Patel','Head of Finance',false,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_csm AND contact_name='David Patel'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'billing_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_csm,'email','accounts@cloudserve.co.uk',
         'default',false,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_csm,'phone','+44 121 496 0201',
         'default',false,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- CSM-001: Governance relations
    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,
        relation_type,member_type,member_name,company_name,
        ownership_pct,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_csm,
        role,mtype,dname,cname,opct,appt::date,notes,v_seed,'active',v_sys
    FROM (VALUES
        ('director','individual','Anand Krishnamurthy',NULL,NULL::numeric,
         '2015-09-10','Co-founder and CEO. Registered director at Companies House.'),
        ('director','individual','Sanjay Mehta',NULL,NULL::numeric,
         '2015-09-10','Co-founder and CTO.'),
        ('ubo','individual','Anand Krishnamurthy',NULL,52.0000,
         '2015-09-10','52% beneficial owner. PSC registered.')
    ) AS v(role,mtype,dname,cname,opct,appt,notes)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_id=v_bp_csm AND relation_type=v.role AND member_name=v.dname
    );

    -- CSM-001: Bank account (Lloyds GBP)
    INSERT INTO master.bank_account (
        tenant_id, code, name,
        bank_name_override, account_holder_name, account_id_type, account_id_value,
        bic_override, bank_country_override,
        currency_code,
        metadata, status, created_by)
    SELECT v_tid,
        'ba-csm-001-gbp','CloudServe — Lloyds GBP',
        'Lloyds Bank PLC','CloudServe Managed IT Limited','iban','GB12LOYD30949302519176',
        'LOYDGB21','GB',
        'GBP',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-csm-001-gbp'
    )
    RETURNING id INTO v_ba;
    IF v_ba IS NULL THEN SELECT id INTO v_ba FROM master.bank_account WHERE tenant_id=v_tid AND code='ba-csm-001-gbp'; END IF;
    INSERT INTO master.bank_account_link (
        tenant_id,owner_type,owner_id,bank_account_id,purpose,is_primary,metadata,created_by)
    SELECT v_tid,'business_partner',v_bp_csm,v_ba,'default',true,v_seed,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.bank_account_link
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp_csm
           AND bank_account_id=v_ba AND purpose='default'
    );

    -- CSM-001: Supplier role
    INSERT INTO master.supplier (
        tenant_id,business_partner_id,supplier_code,supplier_type,
        is_payment_ready,payment_ready_at,
        payment_method_id,payment_term_id,
        metadata,status,created_by)
    SELECT v_tid,v_bp_csm,'SUP-CATL-CSM-001','service',
        true,'2016-09-01'::timestamptz,
        v_pm_chaps,v_pt_net45,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-CATL-CSM-001'
    );
    SELECT id INTO v_sup_csm FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-CATL-CSM-001';

    -- CSM-001: Company code supplier profile
    INSERT INTO master.company_code_supplier_profile (
        tenant_id,company_code_id,supplier_id,
        currency_code,payment_method_id,payment_term_id,
        metadata,status,created_by)
    SELECT v_tid,v_cc,v_sup_csm,
        'GBP',v_pm_chaps,v_pt_net45,
        v_seed,'active',v_sys
    WHERE v_sup_csm IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_profile
         WHERE tenant_id=v_tid AND company_code_id=v_cc AND supplier_id=v_sup_csm
    );

    -- CSM-001: Supplier qualification
    INSERT INTO master.supplier_qualification (
        tenant_id,supplier_id,
        onboarding_status,is_approved_supplier,
        onboarding_approved_at,onboarding_approved_by,
        next_review_date,
        risk_tier,aml_kyc_status,
        metadata,created_by)
    SELECT v_tid,v_sup_csm,
        'approved',true,
        '2016-09-01'::timestamptz,v_sys,
        '2026-09-01'::date,
        'low','passed',
        v_seed,v_sys
    WHERE v_sup_csm IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.supplier_qualification WHERE tenant_id=v_tid AND supplier_id=v_sup_csm
    );

    -- CSM-001: Spend categories
    IF v_sup_csm IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id,supplier_id,commodity_category_id,is_primary,metadata,created_by)
        SELECT v_tid,v_sup_csm,sc.id,is_pri,v_seed,v_sys
        FROM (VALUES ('SC-IT',true),('SC-OUTSRC',false)) AS v(code,is_pri)
        JOIN master.commodity_category sc ON sc.tenant_id=v_tid AND sc.code=v.code
        ON CONFLICT (tenant_id,supplier_id,commodity_category_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[001_ca_party_master] §SUP2: CSM-001 CloudServe Managed IT seeded (bp=%, sup=%)', v_bp_csm, v_sup_csm;

    -- ============================================================================
    -- §CUS1  APX-001 — Apex Digital Group PLC
    --        London enterprise technology group. Key account. Credit limit GBP 2M.
    --        Historical credit hold (lifted 2024-07-01).
    -- ============================================================================

    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        tags, metadata, status, created_by
    )
    SELECT
        v_tid,
        'BP-CATL-APX-001',
        'Apex Digital Group PLC',
        'Apex Digital',
        'Apex Digital Group Public Limited Company',
        'organization',
        'FTSE 250 enterprise technology holding group with digital transformation practices across EMEA.',
        '07654321', 'GB',
        'https://www.apexdigitalgroup.com', 'CRM-CUS-APX-001',
        'Apex Digital Group PLC is a UK-listed (FTSE 250) enterprise technology group '
        'delivering digital transformation, cloud migration, and data analytics services '
        'across the EMEA region. Registered in England & Wales. Annual revenue £280M.',
        ARRAY['Apex Digital','ADG','Apex Group'],
        ARRAY['technology','consulting','digital_transformation'],
        'plc', 2001,
        'e501_1000', 'r100m_500m',
        '2001-06-15'::date,
        '["uk","london","ftse250","enterprise","digital-transformation","emea"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','001_ca_party_master','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','300000001','legacy','APX-001')
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-APX-001'
    );

    SELECT id INTO v_bp_apx FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-APX-001';

    -- APX-001: Addresses
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-apx-hq','Apex Digital — The Shard (HQ)','commercial',
        'Attn: Group Procurement',
        '32 London Bridge Street','Level 24',
        'London','SE1 9SG','GB',
        '32 London Bridge Street, Level 24, London SE1 9SG, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-apx-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-apx-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp_apx,v_addr,'default',true,'2001-06-15',v_seed,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,role_qualifier,address_id) DO NOTHING;

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-apx-ops','Apex Digital — Operations Centre','commercial',
        'Attn: Finance Operations',
        '100 Wood Street','London','EC2V 7AN','GB',
        '100 Wood Street, London EC2V 7AN, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-apx-ops')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-apx-ops'; END IF;
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-apx-bill','Apex Digital — Billing Address','commercial',
        'Attn: Accounts Payable',
        '32 London Bridge Street','London','SE1 9SG','GB',
        '32 London Bridge Street, London SE1 9SG, United Kingdom',
        v_seed,'active',v_sys
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'
    DO NOTHING
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN
        SELECT id INTO v_addr FROM master.address
        WHERE tenant_id=v_tid
          AND (code='addr-apx-bill'
               OR (line1='32 London Bridge Street' AND postal_code='SE1 9SG'
                   AND city='London' AND country_code='GB' AND status='active'))
        LIMIT 1;
    END IF;
    -- APX-001: Identifiers
    INSERT INTO master.party_identifier (
        tenant_id,owner_type,owner_id,scheme,value,
        issuing_authority,issued_at,is_verified,verified_at,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_apx,scheme,val,auth,issued::date,true,now(),pri,v_seed,'active',v_sys
    FROM (VALUES
        ('crn',  '07654321',            'Companies House UK',       '2001-06-15', true),
        ('vat',  'GB765432100',         'HMRC',                     '2002-01-01', false),
        ('duns', '123456789',           'Dun & Bradstreet',         '2003-08-01', false),
        ('lei',  '213800APXDIGUK000001', 'LSEG (GLEIF endorsed)',    '2016-03-01', false),
        ('peppol','0009:GB765432100',   'Peppol Authority UK',      '2023-05-01', false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner'
           AND owner_id=v_bp_apx AND scheme=v.scheme
    );

    -- APX-001: Tax profile
    INSERT INTO master.party_tax_profile (
        tenant_id,owner_type,owner_id,
        country_code,vat_id,
        vat_registered,
        metadata,created_by)
    SELECT v_tid,'business_partner',v_bp_apx,
        'GB','GB765432100',
        true,
        v_seed,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp_apx
           AND country_code='GB'
    );

    -- APX-001: Certifications (ISO 9001 + ISO 14001)
    IF v_ct_iso9001 IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_apx,v_ct_iso9001,
            'ISO9001-APX-2024-7610','2024-04-01'::date,'2027-03-31'::date,
            'BSI Group',
            'Digital transformation project delivery, IT consultancy, and managed services.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_apx AND certification_type_id=v_ct_iso9001
        );
    END IF;
    IF v_ct_iso14001 IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_apx,v_ct_iso14001,
            'ISO14001-APX-2023-3300','2023-10-01'::date,'2026-09-30'::date,
            'SGS United Kingdom Ltd',
            'Corporate environmental management — UK operations and datacentre footprint.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_apx AND certification_type_id=v_ct_iso14001
        );
    END IF;

    -- APX-001: Contact persons
    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_apx,NULL,
        'Charlotte Sinclair','Group Procurement Director',true,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_apx AND contact_name='Charlotte Sinclair'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_apx,'email','c.sinclair@apexdigitalgroup.com',
         'default',true,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_apx,'phone','+44 20 7946 0500',
         'default',true,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_apx,NULL,
        'Marcus Webb','Group CFO',false,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_apx AND contact_name='Marcus Webb'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'billing_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_apx,'email','m.webb@apexdigitalgroup.com',
         'default',false,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_apx,'phone','+44 20 7946 0501',
         'default',false,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- APX-001: Governance relations
    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,
        relation_type,member_type,member_name,company_name,
        ownership_pct,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_apx,
        role,mtype,dname,cname,opct,appt::date,notes,v_seed,'active',v_sys
    FROM (VALUES
        ('director','individual','Richard Ashworth',NULL,NULL::numeric,
         '2019-05-01','Non-Executive Chairman, appointed 2019.'),
        ('director','individual','Victoria Clarke',NULL,NULL::numeric,
         '2016-01-01','Group CEO since 2016.'),
        ('shareholder','company','Apex Institutional Holdings Ltd','Apex Institutional Holdings Ltd',41.0000,
         '2001-06-15','Major institutional holder — 41% ordinary shares.')
    ) AS v(role,mtype,dname,cname,opct,appt,notes)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_id=v_bp_apx AND relation_type=v.role AND member_name=v.dname
    );

    -- APX-001: Customer role
    INSERT INTO master.customer (
        tenant_id,business_partner_id,customer_code,customer_type,
        is_key_account,
        metadata,status,created_by)
    SELECT v_tid,v_bp_apx,'CUS-CATL-APX-001','corporate',
        true,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-CATL-APX-001'
    );
    SELECT id INTO v_cus_apx FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-CATL-APX-001';

    -- APX-001: Company code customer profile
    INSERT INTO master.company_code_customer_profile (
        tenant_id,company_code_id,customer_id,
        currency_code,payment_term_id,
        credit_limit,credit_limit_currency_code,
        metadata,status,created_by)
    SELECT v_tid,v_cc,v_cus_apx,
        'GBP',v_pt_net30,
        2000000.00,'GBP',
        v_seed,'active',v_sys
    WHERE v_cus_apx IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.company_code_customer_profile
         WHERE tenant_id=v_tid AND company_code_id=v_cc AND customer_id=v_cus_apx
    );

    -- APX-001: Customer qualification
    INSERT INTO master.customer_qualification (
        tenant_id,customer_id,
        credit_status,
        last_credit_review_date,reviewer_id,
        next_credit_review_date,
        kyc_status,kyc_check_date,
        metadata,created_by)
    SELECT v_tid,v_cus_apx,
        'approved',
        '2016-09-01'::date,v_sys,
        '2026-04-01'::date,
        'passed','2025-02-10'::date,
        v_seed,v_sys
    WHERE v_cus_apx IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus_apx
    );

    -- APX-001: Customer block — historical credit hold (lifted 2024-07-01)
    IF v_cus_apx IS NOT NULL THEN
        INSERT INTO master.customer_block (
            tenant_id,customer_id,block_type,block_reason,
            blocked_at,blocked_by,
            lifted_at,lifted_by,lift_reason,
            status,metadata,created_by)
        SELECT v_tid,v_cus_apx,
            'credit','Late payment on Q1 2024 invoice batch (resolved — payment received 2024-06-28).',
            '2024-04-15'::timestamptz,v_sys,
            '2024-07-01'::timestamptz,v_sys,'Payment received in full 2024-06-28; block lifted.',
            'lifted',v_seed,v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id=v_tid AND customer_id=v_cus_apx AND block_type='credit'
               AND blocked_at='2024-04-15'::timestamptz
        );
    END IF;

    RAISE NOTICE '[001_ca_party_master] §CUS1: APX-001 Apex Digital Group seeded (bp=%, cus=%)', v_bp_apx, v_cus_apx;

    -- ============================================================================
    -- §CUS2  LAT-001 — Latitude Consulting Ltd
    --        Manchester professional services / IT consultancy. Mid-market.
    -- ============================================================================

    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description, registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band, incorporation_date,
        tags, metadata, status, created_by
    )
    SELECT
        v_tid,
        'BP-CATL-LAT-001',
        'Latitude Consulting Ltd',
        'Latitude Consulting',
        'Latitude Consulting Limited',
        'organization',
        'Northern England IT and management consultancy, specialising in infrastructure and ERP advisory.',
        '10123456', 'GB',
        'https://www.latitudeconsulting.co.uk', 'CRM-CUS-LAT-001',
        'Latitude Consulting Ltd is a Manchester-based IT and management consultancy '
        'providing infrastructure advisory, ERP selection, and digital readiness assessments '
        'primarily to SME and mid-market clients across the North of England.',
        ARRAY['Latitude Consulting','Latitude IT'],
        ARRAY['consulting','technology'],
        'private_limited', 2013,
        'e11_50', 'r1m_10m',
        '2013-02-14'::date,
        '["uk","manchester","consulting","erp","infrastructure","north-england"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','001_ca_party_master','seeded_at',now()::text),
            'erp_codes', jsonb_build_object('crm','300000002','legacy','LAT-001')
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-LAT-001'
    );

    SELECT id INTO v_bp_lat FROM master.business_partner WHERE tenant_id=v_tid AND code='BP-CATL-LAT-001';

    -- LAT-001: Addresses
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-lat-hq','Latitude Consulting — Manchester Office','commercial',
        'Attn: Finance',
        '3 Piccadilly Place','Suite 400',
        'Manchester','Greater Manchester','M1 3BN','GB',
        '3 Piccadilly Place, Suite 400, Manchester M1 3BN, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-lat-hq')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-lat-hq'; END IF;
    INSERT INTO master.address_link (tenant_id,owner_type,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by)
    VALUES (v_tid,'business_partner',v_bp_lat,v_addr,'default',true,'2013-02-14',v_seed,v_sys)
    ON CONFLICT (tenant_id,owner_type,owner_id,purpose,role_qualifier,address_id) DO NOTHING;

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-lat-op','Latitude Consulting — Leeds Delivery Hub','commercial',
        'Attn: Project Delivery',
        '12 Wellington Street','Leeds','West Yorkshire','LS1 2DE','GB',
        '12 Wellington Street, Leeds LS1 2DE, United Kingdom',
        v_seed,'active',v_sys
    WHERE NOT EXISTS (SELECT 1 FROM master.address WHERE tenant_id=v_tid AND code='addr-lat-op')
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN SELECT id INTO v_addr FROM master.address WHERE tenant_id=v_tid AND code='addr-lat-op'; END IF;
    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, city, region, postal_code, country_code,
        formatted_address, metadata, status, created_by)
    SELECT v_tid,'addr-lat-bill','Latitude Consulting — Billing Address','commercial',
        'Attn: Accounts Payable',
        '3 Piccadilly Place','Manchester','Greater Manchester','M1 3BN','GB',
        '3 Piccadilly Place, Manchester M1 3BN, United Kingdom',
        v_seed,'active',v_sys
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'
    DO NOTHING
    RETURNING id INTO v_addr;
    IF v_addr IS NULL THEN
        SELECT id INTO v_addr FROM master.address
        WHERE tenant_id=v_tid
          AND (code='addr-lat-bill'
               OR (line1='3 Piccadilly Place' AND postal_code='M1 3BN'
                   AND city='Manchester' AND country_code='GB' AND status='active'))
        LIMIT 1;
    END IF;
    -- LAT-001: Identifiers
    INSERT INTO master.party_identifier (
        tenant_id,owner_type,owner_id,scheme,value,
        issuing_authority,issued_at,is_verified,verified_at,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_lat,scheme,val,auth,issued::date,true,now(),pri,v_seed,'active',v_sys
    FROM (VALUES
        ('crn',  '10123456',           'Companies House UK',  '2013-02-14', true),
        ('vat',  'GB101234560',        'HMRC',                '2014-01-01', false),
        ('duns', '567890123',          'Dun & Bradstreet',    '2015-05-01', false),
        ('peppol','0009:GB101234560',  'Peppol Authority UK', '2024-01-10', false)
    ) AS v(scheme,val,auth,issued,pri)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id=v_tid AND owner_type='business_partner'
           AND owner_id=v_bp_lat AND scheme=v.scheme
    );

    -- LAT-001: Tax profile
    INSERT INTO master.party_tax_profile (
        tenant_id,owner_type,owner_id,
        country_code,vat_id,
        vat_registered,
        metadata,created_by)
    SELECT v_tid,'business_partner',v_bp_lat,
        'GB','GB101234560',
        true,
        v_seed,v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id=v_tid AND owner_type='business_partner' AND owner_id=v_bp_lat
           AND country_code='GB'
    );

    -- LAT-001: Certifications (ISO 9001)
    IF v_ct_iso9001 IS NOT NULL THEN
        INSERT INTO master.certification (
            tenant_id,owner_type,owner_id,certification_type_id,
            certificate_number,effective_from,effective_until,certified_by,
            additional_info,metadata,status,created_by)
        SELECT v_tid,'business_partner',v_bp_lat,v_ct_iso9001,
            'ISO9001-LAT-2024-2241','2024-01-15'::date,'2027-01-14'::date,
            'NQA',
            'IT consultancy and management advisory services.',
            v_seed,'active',v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.certification
             WHERE tenant_id=v_tid AND owner_id=v_bp_lat AND certification_type_id=v_ct_iso9001
        );
    END IF;

    -- LAT-001: Contact persons
    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_lat,NULL,
        'Emily Cartwright','Managing Director',true,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_lat AND contact_name='Emily Cartwright'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'main_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_lat,'email','e.cartwright@latitudeconsulting.co.uk',
         'default',true,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_lat,'phone','+44 161 850 3300',
         'default',true,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO master.party_contact_person (
        tenant_id,party_type,party_id,company_code_id,
        contact_name,business_title,is_primary,
        metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_lat,NULL,
        'Tom Barker','Finance Manager',false,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id=v_tid AND party_type='business_partner'
           AND party_id=v_bp_lat AND contact_name='Tom Barker'
    )
    RETURNING id INTO v_cp;
    IF v_cp IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id,party_contact_person_id,role_code,created_by)
        VALUES (v_tid,v_cp,'billing_contact',v_sys)
        ON CONFLICT (tenant_id,party_contact_person_id,role_code) DO NOTHING;
        INSERT INTO master.contact_link (
            tenant_id,owner_type,owner_id,channel_type,value,
            purpose,is_primary,is_verified,verified_at,
            metadata,status,created_by)
        VALUES
        (v_tid,'business_partner',v_bp_lat,'email','finance@latitudeconsulting.co.uk',
         'default',false,true,now(),v_seed,'active',v_sys),
        (v_tid,'business_partner',v_bp_lat,'phone','+44 161 850 3301',
         'default',false,false,NULL,v_seed,'active',v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- LAT-001: Governance relations
    INSERT INTO master.party_governance_relation (
        tenant_id,party_type,party_id,
        relation_type,member_type,member_name,company_name,
        ownership_pct,appointed_date,notes,metadata,status,created_by)
    SELECT v_tid,'business_partner',v_bp_lat,
        role,mtype,dname,cname,opct,appt::date,notes,v_seed,'active',v_sys
    FROM (VALUES
        ('director','individual','Emily Cartwright',NULL,NULL::numeric,
         '2013-02-14','Founder and sole director.'),
        ('ubo','individual','Emily Cartwright',NULL,100.0000,
         '2013-02-14','100% beneficial owner. PSC registered at Companies House.')
    ) AS v(role,mtype,dname,cname,opct,appt,notes)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id=v_tid AND party_id=v_bp_lat AND relation_type=v.role AND member_name=v.dname
    );

    -- LAT-001: Customer role
    INSERT INTO master.customer (
        tenant_id,business_partner_id,customer_code,customer_type,
        is_key_account,
        metadata,status,created_by)
    SELECT v_tid,v_bp_lat,'CUS-CATL-LAT-001','corporate',
        false,
        v_seed,'active',v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-CATL-LAT-001'
    );
    SELECT id INTO v_cus_lat FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-CATL-LAT-001';

    -- LAT-001: Company code customer profile
    INSERT INTO master.company_code_customer_profile (
        tenant_id,company_code_id,customer_id,
        currency_code,payment_term_id,
        credit_limit,credit_limit_currency_code,
        metadata,status,created_by)
    SELECT v_tid,v_cc,v_cus_lat,
        'GBP',v_pt_net45,
        500000.00,'GBP',
        v_seed,'active',v_sys
    WHERE v_cus_lat IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.company_code_customer_profile
         WHERE tenant_id=v_tid AND company_code_id=v_cc AND customer_id=v_cus_lat
    );

    -- LAT-001: Customer qualification
    INSERT INTO master.customer_qualification (
        tenant_id,customer_id,
        credit_status,
        last_credit_review_date,reviewer_id,
        next_credit_review_date,
        kyc_status,kyc_check_date,
        metadata,created_by)
    SELECT v_tid,v_cus_lat,
        'approved',
        '2020-01-15'::date,v_sys,
        '2026-01-15'::date,
        'passed','2025-01-15'::date,
        v_seed,v_sys
    WHERE v_cus_lat IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM master.customer_qualification WHERE tenant_id=v_tid AND customer_id=v_cus_lat
    );

    RAISE NOTICE '[001_ca_party_master] §CUS2: LAT-001 Latitude Consulting seeded (bp=%, cus=%)', v_bp_lat, v_cus_lat;

    -- ============================================================================
    -- §NET  Network capabilities + network links (Peppol GB; Ariba for BRT-001)
    -- ============================================================================

    -- BRT-001 capabilities: Peppol invoice + PO + credit_note; Ariba invoice + PO
    IF v_bp_brt IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id,business_partner_id,
            provider_code,document_type_id,document_direction,
            profile_id,profile_version,
            is_supported,verified_at,metadata,created_by)
        VALUES
        (v_tid,v_bp_brt,'peppol','invoice','send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0','3.0',
         true,'2022-03-01'::timestamptz,v_seed,v_sys),
        (v_tid,v_bp_brt,'peppol','order','receive',
         'urn:fdc:peppol.eu:2017:poacc:ordering:3.0','3.0',
         true,'2022-03-01'::timestamptz,v_seed,v_sys),
        (v_tid,v_bp_brt,'peppol','credit_note','send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0','3.0',
         true,'2022-03-01'::timestamptz,v_seed,v_sys),
        (v_tid,v_bp_brt,'ariba','invoice','send',
         'ariba:billing:standard','2.0',
         true,'2020-11-01'::timestamptz,v_seed,v_sys),
        (v_tid,v_bp_brt,'ariba','order','receive',
         'ariba:ordering:standard','2.0',
         true,'2020-11-01'::timestamptz,v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code,document_type_id,document_direction)
        DO NOTHING;

        -- BRT-001 network links
        INSERT INTO master.business_partner_network_link (
            tenant_id,business_partner_id,provider_code,network_account_id,
            connection_status,verification_status,match_confidence,sync_status,
            last_synced_at,network_snapshot,metadata,created_by)
        VALUES
        (v_tid,v_bp_brt,'peppol','0009:GB987654321',
         'connected','verified',1.0,'synced',
         now(),
         jsonb_build_object('profile','BIS Billing 3.0','country','GB','vat','GB987654321'),
         v_seed,v_sys),
        (v_tid,v_bp_brt,'ariba','AN01987654321',
         'connected','verified',1.0,'synced',
         now(),
         jsonb_build_object('profile','ariba:standard','country','GB'),
         v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code) DO NOTHING;
    END IF;

    -- CSM-001 capabilities: Peppol invoice + PO
    IF v_bp_csm IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id,business_partner_id,
            provider_code,document_type_id,document_direction,
            profile_id,profile_version,
            is_supported,verified_at,metadata,created_by)
        VALUES
        (v_tid,v_bp_csm,'peppol','invoice','send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0','3.0',
         true,'2023-01-15'::timestamptz,v_seed,v_sys),
        (v_tid,v_bp_csm,'peppol','order','receive',
         'urn:fdc:peppol.eu:2017:poacc:ordering:3.0','3.0',
         true,'2023-01-15'::timestamptz,v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code,document_type_id,document_direction)
        DO NOTHING;

        INSERT INTO master.business_partner_network_link (
            tenant_id,business_partner_id,provider_code,network_account_id,
            connection_status,verification_status,match_confidence,sync_status,
            last_synced_at,network_snapshot,metadata,created_by)
        VALUES
        (v_tid,v_bp_csm,'peppol','0009:GB123456789',
         'connected','verified',1.0,'synced',
         now(),
         jsonb_build_object('profile','BIS Billing 3.0','country','GB','vat','GB123456789'),
         v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code) DO NOTHING;
    END IF;

    -- APX-001 capabilities: Peppol invoice (customer sending invoices to CATL is unlikely,
    -- but Peppol e-ordering capability means CATL can send e-orders to APX)
    IF v_bp_apx IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id,business_partner_id,
            provider_code,document_type_id,document_direction,
            profile_id,profile_version,
            is_supported,verified_at,metadata,created_by)
        VALUES
        (v_tid,v_bp_apx,'peppol','invoice','receive',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0','3.0',
         true,'2023-05-01'::timestamptz,v_seed,v_sys),
        (v_tid,v_bp_apx,'peppol','order','send',
         'urn:fdc:peppol.eu:2017:poacc:ordering:3.0','3.0',
         true,'2023-05-01'::timestamptz,v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code,document_type_id,document_direction)
        DO NOTHING;

        INSERT INTO master.business_partner_network_link (
            tenant_id,business_partner_id,provider_code,network_account_id,
            connection_status,verification_status,match_confidence,sync_status,
            last_synced_at,network_snapshot,metadata,created_by)
        VALUES
        (v_tid,v_bp_apx,'peppol','0009:GB765432100',
         'connected','verified',1.0,'synced',
         now(),
         jsonb_build_object('profile','BIS Billing 3.0','country','GB','vat','GB765432100'),
         v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code) DO NOTHING;
    END IF;

    -- LAT-001 capabilities: Peppol invoice (registered 2024)
    IF v_bp_lat IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id,business_partner_id,
            provider_code,document_type_id,document_direction,
            profile_id,profile_version,
            is_supported,verified_at,metadata,created_by)
        VALUES
        (v_tid,v_bp_lat,'peppol','invoice','receive',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0','3.0',
         true,'2024-01-10'::timestamptz,v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code,document_type_id,document_direction)
        DO NOTHING;

        INSERT INTO master.business_partner_network_link (
            tenant_id,business_partner_id,provider_code,network_account_id,
            connection_status,verification_status,match_confidence,sync_status,
            last_synced_at,network_snapshot,metadata,created_by)
        VALUES
        (v_tid,v_bp_lat,'peppol','0009:GB101234560',
         'connected','verified',0.95,'synced',
         now(),
         jsonb_build_object('profile','BIS Billing 3.0','country','GB','vat','GB101234560'),
         v_seed,v_sys)
        ON CONFLICT (tenant_id,business_partner_id,provider_code) DO NOTHING;
    END IF;

    RAISE NOTICE '[001_ca_party_master] §NET: network capabilities + links seeded for 4 BPs';

    -- ============================================================================
    -- §REL  Business partner relations
    -- ============================================================================

    -- Relation 1: BP-CATL-BRT-001 ↔ BP-CATL-CSM-001 — strategic_partner
    -- BrightTech and CloudServe have a preferred-reseller arrangement: BrightTech
    -- resells CloudServe IaaS as part of its public-sector device bundles.
    IF v_bp_brt IS NOT NULL AND v_bp_csm IS NOT NULL THEN
        INSERT INTO master.business_partner_relation (
            tenant_id,from_bp_id,to_bp_id,
            relation_type,direction,
            country_scope,effective_from,
            notes,metadata,status,created_by)
        VALUES (
            v_tid,v_bp_brt,v_bp_csm,
            'reseller_of','directional',
            ARRAY['GB'],
            '2020-04-01',
            'BrightTech resells CloudServe IaaS under CCS Technology Products 2 lot; CloudServe is preferred infrastructure partner.',
            v_seed,'active',v_sys
        )
        ON CONFLICT (tenant_id,from_bp_id,to_bp_id,relation_type) DO NOTHING;
    END IF;

    -- Relation 2: BP-CATL-APX-001 ↔ BP-CATL-LAT-001 — jv_partner_of
    -- Apex Digital Group and Latitude Consulting have a subcontractor framework:
    -- Apex engages Latitude for Northern England client delivery.
    IF v_bp_apx IS NOT NULL AND v_bp_lat IS NOT NULL THEN
        INSERT INTO master.business_partner_relation (
            tenant_id,from_bp_id,to_bp_id,
            relation_type,direction,
            country_scope,effective_from,
            notes,metadata,status,created_by)
        VALUES (
            v_tid,v_bp_apx,v_bp_lat,
            'jv_partner_of','directional',
            ARRAY['GB'],
            '2021-10-01',
            'Apex Digital engages Latitude Consulting as preferred subcontractor for Northern England delivery under Apex framework contracts.',
            v_seed,'active',v_sys
        )
        ON CONFLICT (tenant_id,from_bp_id,to_bp_id,relation_type) DO NOTHING;
    END IF;

    RAISE NOTICE '[001_ca_party_master] §REL: 2 BP relations seeded';

    -- ============================================================================
    -- §IDX  App index refresh — supplier_app_index + customer_app_index
    -- ============================================================================

    -- supplier_app_index: BRT-001
    INSERT INTO master.supplier_app_index (
        id, tenant_id,
        supplier_id, business_partner_id,
        supplier_code,
        business_partner_code, name, display_name, legal_name,
        registration_no, registration_country_code,
        partner_category,
        supplier_type, supplier_status,
        is_payment_ready
    )
    SELECT
        s.id, s.tenant_id,
        s.id, bp.id,
        s.supplier_code,
        bp.code, bp.name, bp.display_name, bp.legal_name,
        bp.registration_no, bp.registration_country_code,
        bp.partner_category,
        s.supplier_type, s.status,
        s.is_payment_ready
    FROM master.supplier s
    JOIN master.business_partner bp ON bp.tenant_id = s.tenant_id AND bp.id = s.business_partner_id
    WHERE s.tenant_id = v_tid AND s.supplier_code = 'SUP-CATL-BRT-001'
    ON CONFLICT (id) DO UPDATE SET
        supplier_code                = EXCLUDED.supplier_code,
        name                         = EXCLUDED.name,
        display_name                 = EXCLUDED.display_name,
        supplier_type                = EXCLUDED.supplier_type,
        supplier_status              = EXCLUDED.supplier_status,
        is_payment_ready             = EXCLUDED.is_payment_ready,
        updated_at                   = now();

    -- supplier_app_index: CSM-001
    INSERT INTO master.supplier_app_index (
        id, tenant_id,
        supplier_id, business_partner_id,
        supplier_code,
        business_partner_code, name, display_name, legal_name,
        registration_no, registration_country_code,
        partner_category,
        supplier_type, supplier_status,
        is_payment_ready
    )
    SELECT
        s.id, s.tenant_id,
        s.id, bp.id,
        s.supplier_code,
        bp.code, bp.name, bp.display_name, bp.legal_name,
        bp.registration_no, bp.registration_country_code,
        bp.partner_category,
        s.supplier_type, s.status,
        s.is_payment_ready
    FROM master.supplier s
    JOIN master.business_partner bp ON bp.tenant_id = s.tenant_id AND bp.id = s.business_partner_id
    WHERE s.tenant_id = v_tid AND s.supplier_code = 'SUP-CATL-CSM-001'
    ON CONFLICT (id) DO UPDATE SET
        supplier_code                = EXCLUDED.supplier_code,
        name                         = EXCLUDED.name,
        display_name                 = EXCLUDED.display_name,
        supplier_type                = EXCLUDED.supplier_type,
        supplier_status              = EXCLUDED.supplier_status,
        is_payment_ready             = EXCLUDED.is_payment_ready,
        updated_at                   = now();

    -- customer_app_index: APX-001
    INSERT INTO master.customer_app_index (
        id, tenant_id,
        customer_id, business_partner_id,
        customer_code,
        business_partner_code, name, display_name, legal_name,
        registration_no, registration_country_code,
        customer_type, customer_status,
        is_key_account
    )
    SELECT
        c.id, c.tenant_id,
        c.id, bp.id,
        c.customer_code,
        bp.code, bp.name, bp.display_name, bp.legal_name,
        bp.registration_no, bp.registration_country_code,
        c.customer_type, c.status,
        c.is_key_account
    FROM master.customer c
    JOIN master.business_partner bp ON bp.tenant_id = c.tenant_id AND bp.id = c.business_partner_id
    WHERE c.tenant_id = v_tid AND c.customer_code = 'CUS-CATL-APX-001'
    ON CONFLICT (id) DO UPDATE SET
        customer_code                = EXCLUDED.customer_code,
        name                         = EXCLUDED.name,
        display_name                 = EXCLUDED.display_name,
        customer_type                = EXCLUDED.customer_type,
        customer_status              = EXCLUDED.customer_status,
        is_key_account               = EXCLUDED.is_key_account,
        updated_at                   = now();

    -- customer_app_index: LAT-001
    INSERT INTO master.customer_app_index (
        id, tenant_id,
        customer_id, business_partner_id,
        customer_code,
        business_partner_code, name, display_name, legal_name,
        registration_no, registration_country_code,
        customer_type, customer_status,
        is_key_account
    )
    SELECT
        c.id, c.tenant_id,
        c.id, bp.id,
        c.customer_code,
        bp.code, bp.name, bp.display_name, bp.legal_name,
        bp.registration_no, bp.registration_country_code,
        c.customer_type, c.status,
        c.is_key_account
    FROM master.customer c
    JOIN master.business_partner bp ON bp.tenant_id = c.tenant_id AND bp.id = c.business_partner_id
    WHERE c.tenant_id = v_tid AND c.customer_code = 'CUS-CATL-LAT-001'
    ON CONFLICT (id) DO UPDATE SET
        customer_code                = EXCLUDED.customer_code,
        name                         = EXCLUDED.name,
        display_name                 = EXCLUDED.display_name,
        customer_type                = EXCLUDED.customer_type,
        customer_status              = EXCLUDED.customer_status,
        is_key_account               = EXCLUDED.is_key_account,
        updated_at                   = now();

    RAISE NOTICE '[001_ca_party_master] §IDX: supplier + customer app index refreshed for 2+2 entities';
    RAISE NOTICE '[001_ca_party_master] Complete — 2 suppliers (BRT-001, CSM-001) + 2 customers (APX-001, LAT-001) seeded for CirrusAtlantic';

END $catl_pm$;
