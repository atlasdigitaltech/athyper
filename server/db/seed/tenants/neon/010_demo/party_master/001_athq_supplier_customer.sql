-- ============================================================================
-- FILE: tenants/neon/010_demo/party_master/001_athq_supplier_customer.sql
-- Tenant:  athyper / ATHQ (Athyper Group Holdings, AE, AED)
-- Purpose: 100%-field-coverage seed for one supplier + one customer under
--          company code ATHQ, including every child table.
--
-- Supplier: Gulf Construction Materials LLC (SUP-ATHQ-GCM-001)
-- Customer: Emirates Property Group LLC    (CUS-ATHQ-EPG-001)
--
-- Tables written:
--   master.supplier                         (30 writable cols)
--   master.bank_account                     (supplier remittance bank)
--   master.bank_account_link                (supplier → bank)
--   master.company_code_supplier_profile    (all current cols)
--   master.party_identifier × 2             (DUNS + LEI for supplier)
--   BP coverage/capability is handled by Business Network, not BP master data
--   master.party_tax_profile (supplier)     (UAE / AE)
--   master.certification_type × 2           (iso-9001, iso-27001)
--   master.certification (supplier)         (ISO 9001)
--   master.party_contact_person (supplier)  (name/title/primary — channels via contact_link)
--   master.contact_link × 2 (supplier)      (email + phone for supplier contact)
--   master.party_contact_role (supplier)
--   master.party_governance_relation × 2    (director + UBO for supplier)
--   master.supplier_qualification           (all cols)
--   master.customer                         (30 writable cols)
--   master.company_code_customer_profile    (all cols incl. deprecated)
--   master.party_identifier (customer)      (DUNS)
--   master.party_tax_profile (customer)     (UAE / AE)
--   master.certification (customer)         (ISO 27001)
--   master.party_contact_person (customer)  (name/title/primary — channels via contact_link)
--   master.contact_link × 2 (customer)      (email + phone for customer contact)
--   master.party_contact_role (customer)
--   master.party_governance_relation × 2    (director + UBO for customer)
--   master.customer_qualification           (all cols)
--
-- Supporting (created if absent):
--   master.tax_jurisdiction                 (AE-FED)
--   master.tax_type × 2                     (VAT-AE, WHT-AE-SVC)
--   control.tax_rate_schedule × 2           (5% VAT purchase, 5% WHT payment)
--   control.tax_group × 2                   (TG-AE-VAT-5-IN, TG-AE-WHT-5-SVC)
--   master.payment_method × 2               (WIRE-AED outbound, RTGS-AED inbound)
--   master.payment_term × 2                 (PT-NET30, PT-NET60 — fallback only)
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout
-- Depends:   000_tenant.sql, 200_demo_legal_entities.sql
-- ============================================================================

DO $athq_party_master$
DECLARE
    v_sys        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id  uuid;
    v_cc_id      uuid;

    -- Supporting reference data
    v_jur_ae_id  uuid;
    v_tt_vat_id  uuid;
    v_tt_wht_id  uuid;
    v_trs_vat_id uuid;
    v_trs_wht_id uuid;
    v_tg_vat_id  uuid;
    v_tg_wht_id  uuid;
    v_pm_wire_id uuid;
    v_pm_rtgs_id uuid;
    v_pt_net30   uuid;
    v_pt_net60   uuid;
    v_acct_ap_id uuid;
    v_acct_ar_id uuid;
    v_ct_iso9001  uuid;
    v_ct_iso27001 uuid;

    -- Supplier
    v_sup_bp_id  uuid;
    v_sup_id     uuid;
    v_sup_ba_id  uuid;
    v_sup_bal_id uuid;
    v_sup_cp_id  uuid;
    v_sup_addr_id uuid;

    -- Customer
    v_cus_bp_id  uuid;
    v_cus_id     uuid;
    v_cus_cp_id  uuid;
    v_cus_addr_id uuid;
BEGIN

    -- ── Resolve tenant + company code ──────────────────────────────────────
    SELECT id INTO v_tenant_id
      FROM master.tenant
     WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[001_athq_party_master] athyper tenant not found';
    END IF;

    SELECT id INTO v_cc_id
      FROM master.company_code
     WHERE tenant_id = v_tenant_id AND code = 'ATHQ';
    IF v_cc_id IS NULL THEN
        RAISE EXCEPTION '[001_athq_party_master] ATHQ company code not found';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §1  SUPPORTING REFERENCE DATA
    -- ══════════════════════════════════════════════════════════════════════

    -- §1a  Tax jurisdiction — UAE Federal
    SELECT id INTO v_jur_ae_id FROM master.tax_jurisdiction
     WHERE tenant_id = v_tenant_id AND code = 'AE-FED';
    IF v_jur_ae_id IS NULL THEN
        INSERT INTO master.tax_jurisdiction (
            tenant_id, code, name, jurisdiction_type, country_code, status, created_by
        ) VALUES (
            v_tenant_id, 'AE-FED', 'UAE Federal', 'COUNTRY', 'AE', 'active', v_sys
        ) RETURNING id INTO v_jur_ae_id;
    END IF;

    -- §1b  Tax types
    SELECT id INTO v_tt_vat_id FROM master.tax_type
     WHERE tenant_id = v_tenant_id AND code = 'VAT-AE';
    IF v_tt_vat_id IS NULL THEN
        INSERT INTO master.tax_type (
            tenant_id, code, name, category, is_recoverable, status, created_by
        ) VALUES (
            v_tenant_id, 'VAT-AE', 'UAE Standard VAT',
            'INDIRECT', true, 'active', v_sys
        ) RETURNING id INTO v_tt_vat_id;
    END IF;

    SELECT id INTO v_tt_wht_id FROM master.tax_type
     WHERE tenant_id = v_tenant_id AND code = 'WHT-AE-SVC';
    IF v_tt_wht_id IS NULL THEN
        INSERT INTO master.tax_type (
            tenant_id, code, name, category, is_deducted_at_source, status, created_by
        ) VALUES (
            v_tenant_id, 'WHT-AE-SVC', 'UAE WHT on Services',
            'WITHHOLDING', true, 'active', v_sys
        ) RETURNING id INTO v_tt_wht_id;
    END IF;

    -- §1c  Tax rate schedules
    SELECT id INTO v_trs_vat_id FROM control.tax_rate_schedule
     WHERE tenant_id = v_tenant_id
       AND jurisdiction_id = v_jur_ae_id
       AND tax_type_id = v_tt_vat_id
       AND tax_direction = 'PURCHASE'
       AND COALESCE(component_code, '') = 'MAIN'
     LIMIT 1;
    IF v_trs_vat_id IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value,
            recoverability_mode, recoverability_percent,
            calculation_basis, rounding_stage,
            effective_from, status, created_by
        ) VALUES (
            v_tenant_id, v_jur_ae_id, v_tt_vat_id, 'PURCHASE',
            'MAIN', 'PERCENT', 5.00,
            'FULL', 100.00,
            'LINE_NET', 'LINE',
            '2018-01-01'::date, 'active', v_sys
        ) RETURNING id INTO v_trs_vat_id;
    END IF;

    SELECT id INTO v_trs_wht_id FROM control.tax_rate_schedule
     WHERE tenant_id = v_tenant_id
       AND jurisdiction_id = v_jur_ae_id
       AND tax_type_id = v_tt_wht_id
       AND tax_direction = 'PAYMENT'
       AND COALESCE(component_code, '') = 'MAIN'
     LIMIT 1;
    IF v_trs_wht_id IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value,
            recoverability_mode,
            calculation_basis, rounding_stage,
            wht_basis, wht_certificate_required,
            effective_from, status, created_by
        ) VALUES (
            v_tenant_id, v_jur_ae_id, v_tt_wht_id, 'PAYMENT',
            'MAIN', 'PERCENT', 5.00,
            'NONE',
            'LINE_NET', 'LINE',
            'GROSS', true,
            '2018-01-01'::date, 'active', v_sys
        ) RETURNING id INTO v_trs_wht_id;
    END IF;

    -- §1d  Tax groups
    SELECT id INTO v_tg_vat_id FROM control.tax_group
     WHERE tenant_id = v_tenant_id AND code = 'TG-AE-VAT-5-IN';
    IF v_tg_vat_id IS NULL THEN
        INSERT INTO control.tax_group (
            tenant_id, code, name, status, created_by
        ) VALUES (
            v_tenant_id, 'TG-AE-VAT-5-IN', 'UAE VAT 5% Input', 'active', v_sys
        ) RETURNING id INTO v_tg_vat_id;
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, rate_override, status, created_by
        ) VALUES (
            v_tenant_id, v_tg_vat_id, v_trs_vat_id,
            10, NULL, 'active', v_sys
        );
    END IF;

    SELECT id INTO v_tg_wht_id FROM control.tax_group
     WHERE tenant_id = v_tenant_id AND code = 'TG-AE-WHT-5-SVC';
    IF v_tg_wht_id IS NULL THEN
        INSERT INTO control.tax_group (
            tenant_id, code, name, status, created_by
        ) VALUES (
            v_tenant_id, 'TG-AE-WHT-5-SVC', 'UAE WHT 5% Services', 'active', v_sys
        ) RETURNING id INTO v_tg_wht_id;
        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, rate_override, status, created_by
        ) VALUES (
            v_tenant_id, v_tg_wht_id, v_trs_wht_id,
            10, NULL, 'active', v_sys
        );
    END IF;

    -- §1e  Payment methods
    SELECT id INTO v_pm_wire_id FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND code = 'WIRE-AED';
    IF v_pm_wire_id IS NULL THEN
        INSERT INTO master.payment_method (
            tenant_id, code, name, direction, instrument_mode, status, created_by
        ) VALUES (
            v_tenant_id, 'WIRE-AED', 'AED Wire Transfer',
            'outbound', 'bank_transfer', 'active', v_sys
        ) RETURNING id INTO v_pm_wire_id;
    END IF;

    SELECT id INTO v_pm_rtgs_id FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND code = 'RTGS-AED';
    IF v_pm_rtgs_id IS NULL THEN
        INSERT INTO master.payment_method (
            tenant_id, code, name, direction, instrument_mode, status, created_by
        ) VALUES (
            v_tenant_id, 'RTGS-AED', 'AED RTGS Collection',
            'inbound', 'bank_transfer', 'active', v_sys
        ) RETURNING id INTO v_pm_rtgs_id;
    END IF;

    -- §1f  Payment terms (SELECT from universal seed; insert only if absent)
    SELECT id INTO v_pt_net30 FROM master.payment_term
     WHERE tenant_id = v_tenant_id AND code = 'PT-NET30' AND is_current_version = true
     LIMIT 1;
    IF v_pt_net30 IS NULL THEN
        INSERT INTO master.payment_term (
            tenant_id, code, name, version, is_current_version,
            applicable_to, base_event,
            due_rule_type, due_days,
            due_date_flexibility, business_day_convention,
            status, created_by
        ) VALUES (
            v_tenant_id, 'PT-NET30', 'Net 30 Days', 1, true,
            'BOTH', 'INVOICE_DATE',
            'NET_DAYS', 30, 'FIXED', 'FOLLOWING',
            'active', v_sys
        ) RETURNING id INTO v_pt_net30;
    END IF;

    SELECT id INTO v_pt_net60 FROM master.payment_term
     WHERE tenant_id = v_tenant_id AND code = 'PT-NET60' AND is_current_version = true
     LIMIT 1;
    IF v_pt_net60 IS NULL THEN
        INSERT INTO master.payment_term (
            tenant_id, code, name, version, is_current_version,
            applicable_to, base_event,
            due_rule_type, due_days,
            due_date_flexibility, business_day_convention,
            status, created_by
        ) VALUES (
            v_tenant_id, 'PT-NET60', 'Net 60 Days', 1, true,
            'BOTH', 'INVOICE_DATE',
            'NET_DAYS', 60, 'FIXED', 'FOLLOWING',
            'active', v_sys
        ) RETURNING id INTO v_pt_net60;
    END IF;

    -- §1g  Accounting profiles (NULL-safe — exists only if AP/AR packs loaded)
    SELECT id INTO v_acct_ap_id FROM master.accounting_profile
     WHERE tenant_id = v_tenant_id AND code = 'AP_NON_PO_STANDARD';

    SELECT id INTO v_acct_ar_id FROM master.accounting_profile
     WHERE tenant_id = v_tenant_id AND code = 'AR_STANDARD'
     LIMIT 1;

    -- §1h  Certification types — resolved from platform seed
    --      Guaranteed present by platform/003_master/003_certification_type.sql.
    SELECT id INTO v_ct_iso9001  FROM master.certification_type WHERE tenant_id IS NULL AND code = 'iso-9001';
    SELECT id INTO v_ct_iso27001 FROM master.certification_type WHERE tenant_id IS NULL AND code = 'iso-27001';

    -- ══════════════════════════════════════════════════════════════════════
    -- §2  SUPPLIER — Gulf Construction Materials LLC
    -- ══════════════════════════════════════════════════════════════════════

    -- §2a  master.business_partner (identity root for GCM)
    INSERT INTO master.business_partner (
        tenant_id,
        code,                  name,
        display_name,          legal_name,
        partner_category,
        description,
        registration_no,       registration_country_code,
        website_url,           external_ref,
        long_description,
        aliases,               business_types,
        legal_form,            founded_year,
        employee_count_band,   annual_revenue_band,
        tags,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tenant_id,
        'GCM-001',
        'Gulf Construction Materials LLC',
        'GCM',
        'Gulf Construction Materials Limited Liability Company',
        'organization',
        'Premium supplier of construction aggregates, steel rebar, and ready-mix concrete across the UAE.',
        '1234567890',          'AE',
        'https://www.gcm-uae.com',  'ERP-SUP-GCM-0001',
        'Gulf Construction Materials LLC is a UAE-incorporated supplier established in 2008, '
        'operating from Dubai Investment Park. Certified to ISO 9001:2015. '
        'Product range: aggregates, steel rebar, ready-mix concrete, blockwork materials.',
        ARRAY['GCM', 'Gulf Construction', 'Gulf CM'],
        ARRAY['construction', 'goods_manufacturer'],
        'private_limited',     2008,
        'e51_200',             'r10m_50m',
        '["construction","UAE","preferred"]'::jsonb,
        jsonb_build_object(
            '_seed',       jsonb_build_object('pack','001_athq_party_master','version','1.0.0','seeded_at',now()::text),
            'erp_codes',   jsonb_build_object('sap','400000001','legacy','GCM-001'),
            'procurement', jsonb_build_object('category','construction_materials','lead_time_days',7)
        ),
        'active',
        v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner
         WHERE tenant_id = v_tenant_id AND code = 'GCM-001'
    );

    SELECT id INTO v_sup_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'GCM-001';

    -- §2a-ii  master.supplier (thin AP role record)
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code,
        supplier_type, status, created_by
    )
    SELECT v_tenant_id, v_sup_bp_id, 'SUP-ATHQ-GCM-001',
           'general', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier
         WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-GCM-001'
    );

    SELECT id INTO v_sup_id FROM master.supplier
     WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-GCM-001';

    -- §2b  Bank account (supplier's ADCB AED account for remittance)
    SELECT id INTO v_sup_ba_id FROM master.bank_account
     WHERE tenant_id = v_tenant_id AND code = 'ba-gcm-aed-01';
    IF v_sup_ba_id IS NULL THEN
        INSERT INTO master.bank_account (
            tenant_id, code, name, account_holder_name,
            account_id_type, account_id_value, account_last4,
            currency_code, bic_override, bank_name_override, bank_country_override,
            account_nature, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id,
            'ba-gcm-aed-01',
            'Gulf Construction Materials — ADCB AED',
            'Gulf Construction Materials LLC',
            'iban', 'AE180330000001234567890', '7890',
            'AED', 'ADCBAEAA', 'Abu Dhabi Commercial Bank', 'AE',
            'direct', true, now(),
            '{"_seed":{"pack":"001_athq_party_master","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_sup_ba_id;
    END IF;

    -- §2b-ii  bank_account_link (supplier ← bank account, purpose=remittance)
    SELECT id INTO v_sup_bal_id FROM master.bank_account_link
     WHERE tenant_id      = v_tenant_id
       AND bank_account_id = v_sup_ba_id
       AND owner_type      = 'supplier'
       AND owner_id        = v_sup_id
       AND purpose         = 'disbursement'
     LIMIT 1;
    IF v_sup_bal_id IS NULL THEN
        INSERT INTO master.bank_account_link (
            tenant_id, bank_account_id, owner_type, owner_id,
            company_code_id, purpose, is_primary,
            effective_from, metadata, created_by
        ) VALUES (
            v_tenant_id, v_sup_ba_id, 'supplier', v_sup_id,
            v_cc_id, 'disbursement', true,
            '2024-01-01'::date,
            '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb,
            v_sys
        ) RETURNING id INTO v_sup_bal_id;
    END IF;

    -- §2c  master.company_code_supplier_profile
    INSERT INTO master.company_code_supplier_profile (
        tenant_id,              supplier_id,           company_code_id,
        payment_term_id,        payment_method_id,
        currency_code,
        default_accounting_profile_id,
        preferred_remittance_bank_link_id,
        tax_group_id,           default_wht_tax_group_id,
        default_dimension_set_id, invoice_hold_policy_id,
        is_blocked,             block_reason,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id,            v_sup_id,              v_cc_id,
        v_pt_net30,             v_pm_wire_id,
        'AED',
        v_acct_ap_id,
        v_sup_bal_id,
        v_tg_vat_id,            v_tg_wht_id,
        NULL,                   NULL,
        false,                  NULL,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','001_athq_party_master','version','1.0.0'),
            'notes', 'Primary AP profile for ATHQ / AED transactions'
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_profile
         WHERE tenant_id = v_tenant_id AND supplier_id = v_sup_id AND company_code_id = v_cc_id
    );

    -- §2d  Party identifiers: DUNS + LEI
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id,
        scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        'duns', '123456789',
        'Dun & Bradstreet', '2020-03-15'::date, NULL,
        true, now(), true,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_sup_bp_id AND scheme = 'duns'
    );

    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id,
        scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        'lei', '5493001KJTIIGC8Y1R12',
        'GLEIF', '2021-06-01'::date, '2026-06-01'::date,
        true, now(), false,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_sup_bp_id AND scheme = 'lei'
    );

    -- §2f  Party tax profile (UAE)
    INSERT INTO master.party_tax_profile (
        tenant_id, owner_type, owner_id,
        country_code,
        penalty_information,      discount_information,
        global_location_number,
        tax_classification,       taxation_type,
        tax_id,                   state_tax_id,
        sales_tax_id,             service_tax_id,
        regional_tax_id,          vat_id,
        vat_registered,           vat_registration_doc_id,
        has_tax_clearance,        tax_clearance_number,
        tax_clearance_doc_id,     tax_clearance_expiry_date,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        'AE',
        'Late payment: 2% per month on overdue amounts after 30 days.',
        'Early payment discount: 1% discount if settled within 10 days.',
        '6281234567890',
        'company',                'standard',
        '100123456000001',        NULL,
        NULL,                     NULL,
        NULL,                     '100123456000001',
        true,                     NULL,
        true,                     'TCN-AE-2024-GCM-001',
        NULL,                     '2025-12-31'::date,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner' AND owner_id = v_sup_bp_id AND country_code = 'AE'
    );

    -- §2g  Certification (ISO 9001:2015)
    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id,
        certification_type_id,    custom_name,
        certificate_number,       certified_by,
        certified_location,       additional_info,
        document_attachment_id,
        effective_from,           effective_until,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        v_ct_iso9001,             NULL,
        'ISO9001-UAE-GCM-2022-0047',
        'Bureau Veritas Certification',
        'Dubai, UAE',
        'Scope: Design, manufacture, supply and installation of construction materials.',
        NULL,
        '2022-08-01'::date,       '2025-07-31'::date,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_sup_bp_id AND certification_type_id = v_ct_iso9001
    );

    -- §2h  Contact person — Procurement Director
    --      Stored at business_partner level (canonical identity layer).
    --      Role-specific contact overrides (AP/remittance) can be added at supplier level later.
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id,
        company_code_id,
        contact_name,   business_title,
        is_primary,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        NULL,
        'Ahmed Al Rashidi',  'Procurement Director',
        true,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_sup_bp_id AND contact_name = 'Ahmed Al Rashidi'
    )
    RETURNING id INTO v_sup_cp_id;

    IF v_sup_cp_id IS NOT NULL THEN
        -- Contact role
        INSERT INTO master.party_contact_role (
            tenant_id, party_contact_person_id, role_code, created_by
        ) VALUES (v_tenant_id, v_sup_cp_id, 'bid_proposal_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        -- Email + phone anchored at business_partner — shared across all roles.
        -- Use purpose='notification' for general reachability;
        -- AP-specific billing contact can be added at supplier level as an override.
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id,
            channel_type, value, purpose,
            is_primary, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_sup_bp_id,
         'email', 'ahmed.alrashidi@gcm-uae.com', 'notification',
         true, true, now(),
         '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_sup_bp_id,
         'phone', '+97148001234', 'notification',
         true, true, now(),
         '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §2i  Governance relations: director + UBO
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id,
        relation_type,  member_name,              member_type,
        company_name,   business_title,
        ownership_pct,  share_class,
        appointed_date, end_of_term,  notes,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        'director',
        'Khalid Mohammed Al-Mansoori',            'individual',
        NULL,           'Chief Executive Officer',
        NULL,           NULL,
        '2008-01-15'::date, NULL,
        'Founding director and CEO.',
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_sup_bp_id AND relation_type = 'director'
           AND member_name = 'Khalid Mohammed Al-Mansoori'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id,
        relation_type,  member_name,              member_type,
        company_name,   business_title,
        ownership_pct,  share_class,
        appointed_date, end_of_term,  notes,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_sup_bp_id,
        'ubo',
        'Gulf Investments Holding LLC',           'company',
        'Gulf Investments Holding LLC',
        'Ultimate Beneficial Owner',
        75.0000,        'ordinary',
        '2008-01-15'::date, NULL,
        '75% majority shareholder. Registered in ADGM.',
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_sup_bp_id AND relation_type = 'ubo'
           AND member_name = 'Gulf Investments Holding LLC'
    );

    -- §2j  Supplier qualification (all writable columns)
    INSERT INTO master.supplier_qualification (
        tenant_id, supplier_id,
        onboarding_status,         profile_completeness_pct,
        onboarding_approved_at,    onboarding_approved_by,
        is_approved_supplier,      is_preferred_supplier,
        is_blocked,                block_reason,          block_start_date,
        risk_tier,
        sanctions_status,          aml_kyc_status,
        sanctions_check_date,      kyc_expiry_date,
        sourcing_event_count,      bid_count,             awarded_count,
        delivery_score,            quality_score,         sla_score,
        score_period_start,        score_period_end,
        last_review_date,          next_review_date,
        reviewed_by,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_sup_id,
        'approved',                100,
        '2024-03-01 09:00:00+04'::timestamptz,  v_sys,
        true,                      true,
        false,                     NULL,                  NULL,
        'low',
        'clear',                   'passed',
        '2025-01-10'::date,        '2026-01-10'::date,
        12,                        8,                     7,
        96.50,                     94.00,                 97.20,
        '2024-01-01'::date,        '2024-12-31'::date,
        '2025-01-10'::date,        '2026-01-10'::date,
        v_sys,
        jsonb_build_object(
            '_seed',        jsonb_build_object('pack','001_athq_party_master','version','1.0.0'),
            'review_notes', 'Annual review passed. Preferred status granted Q1 2024.'
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier_qualification
         WHERE tenant_id = v_tenant_id AND supplier_id = v_sup_id
    );

    -- §2k  Address — Dubai Investment Park (GCM HQ)
    --      Create one canonical address row and share it across:
    --        BP as 'legal' + 'default'   (source of truth for identity)
    --        Supplier as 'remittance'          (optional operational override, same physical address)
    SELECT id INTO v_sup_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-gcm-dip-hq';
    IF v_sup_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type,
            attention_line,
            line1, line2, city, region, postal_code, country_code,
            formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-gcm-dip-hq',
            'Gulf Construction Materials — Dubai Investment Park',
            'commercial',
            'Attn: Accounts Payable',
            'Plot 597-963, Dubai Investment Park 1', 'Building 4, 3rd Floor',
            'Dubai', 'Dubai', '211832', 'AE',
            'Building 4, 3rd Floor, Plot 597-963, Dubai Investment Park 1, Dubai 211832, UAE',
            '{"_seed":{"pack":"001_athq_party_master","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_sup_addr_id;
    END IF;

    -- Link to BP: 'legal' is the canonical legal address; 'default' ensures
    -- fn_resolve_address falls through cleanly when no specific purpose is requested.
    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES
    (v_tenant_id, 'business_partner', v_sup_bp_id, v_sup_addr_id, 'legal',
     true, '2008-01-01'::date,
     '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, v_sys),
    (v_tenant_id, 'business_partner', v_sup_bp_id, v_sup_addr_id, 'default',
     true, '2008-01-01'::date,
     '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, v_sys)
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    -- Link same address to supplier as 'remittance' (AP operational purpose).
    -- fn_resolve_party_address will fall back to BP 'legal' if this is absent,
    -- but seeding it explicitly makes the AP purpose discoverable.
    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_sup_bp_id, v_sup_addr_id, 'remittance',
        true, '2008-01-01'::date,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[001_athq_party_master] Supplier SUP-ATHQ-GCM-001 seeded (id=%)', v_sup_id;

    -- ══════════════════════════════════════════════════════════════════════
    -- §3  CUSTOMER — Emirates Property Group LLC
    -- ══════════════════════════════════════════════════════════════════════

    -- §3a  master.business_partner (identity root for EPG)
    INSERT INTO master.business_partner (
        tenant_id,
        code,                  name,
        display_name,          legal_name,
        partner_category,
        description,
        registration_no,       registration_country_code,
        website_url,           external_ref,
        long_description,
        aliases,               business_types,
        legal_form,            founded_year,
        employee_count_band,   annual_revenue_band,
        tags,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tenant_id,
        'EPG-001',
        'Emirates Property Group LLC',
        'EPG',
        'Emirates Property Group Limited Liability Company',
        'organization',
        'Large-scale real estate developer and asset manager across the UAE and GCC.',
        '9876543210',          'AE',
        'https://www.epg-uae.com',  'CRM-CUS-EPG-0001',
        'Emirates Property Group LLC is a UAE-incorporated real estate developer founded in 2005. '
        'Major projects include Emirates City Tower (Dubai) and Abu Dhabi Pearl Residences. '
        'Significant buyer of construction materials under multi-year framework agreements.',
        ARRAY['EPG', 'Emirates Property', 'EPG Holdings'],
        ARRAY['construction', 'professional_services'],
        'private_limited',     2005,
        'e201_500',            'r50m_100m',
        '["real_estate","UAE","key_account"]'::jsonb,
        jsonb_build_object(
            '_seed',              jsonb_build_object('pack','001_athq_party_master','version','1.0.0','seeded_at',now()::text),
            'erp_codes',          jsonb_build_object('crm','200000001','legacy','EPG-001'),
            'account_management', jsonb_build_object('tier','key','segment','enterprise')
        ),
        'active',
        v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner
         WHERE tenant_id = v_tenant_id AND code = 'EPG-001'
    );

    SELECT id INTO v_cus_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'EPG-001';

    -- §3a-ii  master.customer (thin AR role record)
    INSERT INTO master.customer (
        tenant_id, business_partner_id, customer_code,
        customer_type, is_key_account, status, created_by
    )
    SELECT v_tenant_id, v_cus_bp_id, 'CUS-ATHQ-EPG-001',
           'corporate', true, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer
         WHERE tenant_id = v_tenant_id AND customer_code = 'CUS-ATHQ-EPG-001'
    );

    SELECT id INTO v_cus_id FROM master.customer
     WHERE tenant_id = v_tenant_id AND customer_code = 'CUS-ATHQ-EPG-001';

    -- §3b  master.company_code_customer_profile
    INSERT INTO master.company_code_customer_profile (
        tenant_id,              customer_id,           company_code_id,
        currency_code,
        credit_limit,           credit_limit_currency_code,
        credit_rating,
        default_accounting_profile_id,
        default_receipt_method_id,
        tax_group_id,
        default_dimension_set_id,
        statement_cycle_code,   dunning_policy_id,
        is_blocked,             block_reason,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id,            v_cus_id,              v_cc_id,
        'AED',
        5000000.0000,           'AED',
        'a',
        v_acct_ar_id,
        v_pm_rtgs_id,
        v_tg_vat_id,
        NULL,
        'monthly',              NULL,
        false,                  NULL,
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','001_athq_party_master','version','1.0.0'),
            'notes', 'Key account AR profile for ATHQ / AED transactions'
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_customer_profile
         WHERE tenant_id = v_tenant_id AND customer_id = v_cus_id AND company_code_id = v_cc_id
    );

    -- §3c  Party identifier: DUNS
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id,
        scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_cus_bp_id,
        'duns', '987654321',
        'Dun & Bradstreet', '2018-05-01'::date, NULL,
        true, now(), true,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_cus_bp_id AND scheme = 'duns'
    );

    -- §3d  Party tax profile (UAE)
    --       Customer tax profile is resolved through the BP-owned party tax table;
    --       Customer-role tax data is BP-owned in master.party_tax_profile.)

    -- §3e  Certification (ISO 27001)
    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id,
        certification_type_id,    custom_name,
        certificate_number,       certified_by,
        certified_location,       additional_info,
        document_attachment_id,
        effective_from,           effective_until,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_cus_bp_id,
        v_ct_iso27001,            NULL,
        'ISO27001-UAE-EPG-2023-0112',
        'KPMG Advisory LLC',
        'Abu Dhabi, UAE',
        'Scope: Information security for property management and ERP systems.',
        NULL,
        '2023-07-01'::date,       '2026-06-30'::date,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_cus_bp_id AND certification_type_id = v_ct_iso27001
    );

    -- §3f  Contact person — CFO / Finance contact
    --      Stored at business_partner level (canonical identity layer).
    --      Role-specific contact overrides (AR/collections) can be added at customer level later.
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id,
        company_code_id,
        contact_name,   business_title,
        is_primary,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_cus_bp_id,
        NULL,
        'Fatima Al-Zarooni',  'Chief Financial Officer',
        true,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_cus_bp_id AND contact_name = 'Fatima Al-Zarooni'
    )
    RETURNING id INTO v_cus_cp_id;

    IF v_cus_cp_id IS NOT NULL THEN
        -- Contact role
        INSERT INTO master.party_contact_role (
            tenant_id, party_contact_person_id, role_code, created_by
        ) VALUES (v_tenant_id, v_cus_cp_id, 'finance_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        -- Email + phone anchored at business_partner — shared across all roles.
        -- AR-specific billing/collections contact can be added at customer level as an override.
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id,
            channel_type, value, purpose,
            is_primary, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_cus_bp_id,
         'email', 'fatima.alzarooni@epg-uae.com', 'notification',
         true, true, now(),
         '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_cus_bp_id,
         'phone', '+97126543210', 'notification',
         true, true, now(),
         '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §3g  Governance: director + UBO
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id,
        relation_type,  member_name,              member_type,
        company_name,   business_title,
        ownership_pct,  share_class,
        appointed_date, end_of_term,  notes,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_cus_bp_id,
        'director',
        'Salem Hamdan Al-Mazrouei',               'individual',
        NULL,           'Chief Executive Officer',
        NULL,           NULL,
        '2005-04-01'::date, NULL,
        'Founding CEO and managing director of Emirates Property Group.',
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_cus_bp_id AND relation_type = 'director'
           AND member_name = 'Salem Hamdan Al-Mazrouei'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id,
        relation_type,  member_name,              member_type,
        company_name,   business_title,
        ownership_pct,  share_class,
        appointed_date, end_of_term,  notes,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_cus_bp_id,
        'ubo',
        'Emirates Development Holdings LLC',      'company',
        'Emirates Development Holdings LLC',
        'Ultimate Beneficial Owner',
        60.0000,        'ordinary',
        '2005-04-01'::date, NULL,
        '60% majority shareholder. Registered in DIFC.',
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_cus_bp_id AND relation_type = 'ubo'
           AND member_name = 'Emirates Development Holdings LLC'
    );

    -- §3h  Customer qualification (all writable columns)
    INSERT INTO master.customer_qualification (
        tenant_id, customer_id,
        credit_status,             credit_limit_band,
        credit_score,              credit_rating,
        dso_days,                  payment_behavior,
        has_overdue_history,
        kyc_status,                aml_sanctions_status,
        beneficial_owner_check_status,
        kyc_check_date,            kyc_expiry_date,
        is_dunning_eligible,       is_statement_eligible,
        dunning_hold_reason,
        last_credit_review_date,   next_credit_review_date,
        reviewer_id,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_cus_id,
        'approved',                'aed_2m_10m',
        820,                       'a',
        28,                        'excellent',
        false,
        'passed',                  'clear',
        'passed',
        '2025-02-01'::date,        '2027-01-31'::date,
        true,                      true,
        NULL,
        '2025-02-01'::date,        '2026-02-01'::date,
        v_sys,
        jsonb_build_object(
            '_seed',        jsonb_build_object('pack','001_athq_party_master','version','1.0.0'),
            'credit_notes', 'Strong payment history. Key account — annual credit review.'
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer_qualification
         WHERE tenant_id = v_tenant_id AND customer_id = v_cus_id
    );

    -- §3i  Address — Abu Dhabi Corniche (EPG HQ)
    --      Create one canonical address row and share it across:
    --        BP as 'legal' + 'default'   (source of truth for identity)
    --        Customer as 'billing'             (optional AR operational override, same physical address)
    SELECT id INTO v_cus_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-epg-auh-hq';
    IF v_cus_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type,
            attention_line,
            line1, line2, city, region, postal_code, country_code,
            formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-epg-auh-hq',
            'Emirates Property Group — Abu Dhabi HQ',
            'commercial',
            'Attn: Finance Department',
            'Al Muroor Road, Corniche Area', 'Al Mamoura Building A, 12th Floor',
            'Abu Dhabi', 'Abu Dhabi', '5648', 'AE',
            'Al Mamoura Building A, 12th Floor, Al Muroor Road, Corniche Area, Abu Dhabi 5648, UAE',
            '{"_seed":{"pack":"001_athq_party_master","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_cus_addr_id;
    END IF;

    -- Link to BP: 'legal' + 'default'
    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES
    (v_tenant_id, 'business_partner', v_cus_bp_id, v_cus_addr_id, 'legal',
     true, '2005-01-01'::date,
     '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, v_sys),
    (v_tenant_id, 'business_partner', v_cus_bp_id, v_cus_addr_id, 'default',
     true, '2005-01-01'::date,
     '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, v_sys)
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    -- Link same address to customer as 'billing' (AR operational purpose).
    -- fn_resolve_party_address will fall back to BP 'legal' if this is absent,
    -- but seeding it explicitly makes the AR billing purpose discoverable.
    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_cus_bp_id, v_cus_addr_id, 'billing',
        true, '2005-01-01'::date,
        '{"_seed":{"pack":"001_athq_party_master"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[001_athq_party_master] Customer CUS-ATHQ-EPG-001 seeded (id=%)', v_cus_id;
    RAISE NOTICE '[001_athq_party_master] Done — 1 supplier + 1 customer seeded for ATHQ (athyper tenant).';

END $athq_party_master$;
