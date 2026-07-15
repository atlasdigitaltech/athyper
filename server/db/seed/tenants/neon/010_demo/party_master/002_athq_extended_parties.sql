-- ============================================================================
-- FILE: tenants/neon/010_demo/party_master/002_athq_extended_parties.sql
-- Tenant:  athyper / ATHQ (Athyper Group Holdings, AE, AED)
-- Purpose: Extended 100%-field-coverage seed — 3 additional suppliers and
--          2 additional customers under company code ATHQ.
--
-- Suppliers:
--   PSM-001  Pinnacle Synergy Management LLC (UAE facilities management)
--   GFL-001  Gulf Freight Logistics WLL (Qatar freight & logistics)
--   NIC-001  Nexus InfoComm Consulting LLC (UAE IT services)
--
-- Customers:
--   AEH-001  Arabian Energy Holdings LLC (UAE energy sector, key account)
--   QNP-001  Qatar National Properties LLC (government-linked real estate)
--
-- Tables written:
--   master.business_partner               (both supplier + customer BPs)
--   master.supplier                       (3 rows)
--   master.customer                       (2 rows)
--   master.bank_account                   (3 supplier remittance accounts)
--   master.bank_account_link              (3 supplier ← bank links)
--   master.company_code_supplier_profile  (3 rows, all writable cols)
--   master.company_code_customer_profile  (2 rows, all writable cols)
--   master.party_identifier               (DUNS + LEI per BP where applicable)
--   master.party_tax_profile              (UAE AE profile per BP)
--   master.certification                  (ISO 9001/45001/27001 per BP)
--   master.party_contact_person           (primary contact per BP)
--   master.party_contact_role             (role per contact)
--   master.contact_link                   (email + phone per BP)
--   master.party_governance_relation      (director + UBO per BP)
--   master.supplier_qualification         (all cols per supplier)
--   master.customer_qualification         (all cols per customer)
--   master.address                        (HQ address per BP)
--   master.address_link                   (one BP default address per party)
--
-- Supporting (created if absent — idempotent):
--   master.payment_method                 (WIRE-USD for international)
--   master.tax_jurisdiction               (QA-FED for Qatar)
--   master.certification_type             (iso-45001 new type)
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout
-- Depends:    000_tenant.sql, 200_demo_legal_entities.sql,
--             001_athq_supplier_customer.sql  (tax groups, payment terms)
-- ============================================================================

DO $athq_ext_parties$
DECLARE
    v_sys        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id  uuid;
    v_cc_id      uuid;      -- ATHQ company code

    -- Shared reference data (resolved from existing seed in file 001)
    v_jur_ae_id  uuid;
    v_jur_qa_id  uuid;      -- QA-FED (new)
    v_tt_vat_ae  uuid;
    v_tg_vat_id  uuid;
    v_tg_wht_id  uuid;
    v_pm_wire_ae uuid;
    v_pm_wire_us uuid;      -- WIRE-USD (new)
    v_pt_net30   uuid;
    v_pt_net60   uuid;
    v_acct_ap_id uuid;
    v_acct_ar_id uuid;

    -- Certification types
    v_ct_iso9001  uuid;
    v_ct_iso27001 uuid;
    v_ct_iso45001 uuid;     -- new: occupational health & safety

    -- PSM-001 (Pinnacle Synergy Management)
    v_psm_bp_id   uuid;
    v_psm_id      uuid;
    v_psm_ba_id   uuid;
    v_psm_bal_id  uuid;
    v_psm_cp_id   uuid;
    v_psm_addr_id uuid;

    -- GFL-001 (Gulf Freight Logistics)
    v_gfl_bp_id   uuid;
    v_gfl_id      uuid;
    v_gfl_ba_id   uuid;
    v_gfl_bal_id  uuid;
    v_gfl_cp_id   uuid;
    v_gfl_addr_id uuid;

    -- NIC-001 (Nexus InfoComm Consulting)
    v_nic_bp_id   uuid;
    v_nic_id      uuid;
    v_nic_ba_id   uuid;
    v_nic_bal_id  uuid;
    v_nic_cp_id   uuid;
    v_nic_addr_id uuid;

    -- AEH-001 (Arabian Energy Holdings — customer)
    v_aeh_bp_id   uuid;
    v_aeh_id      uuid;
    v_aeh_cp_id   uuid;
    v_aeh_addr_id uuid;

    -- QNP-001 (Qatar National Properties — customer)
    v_qnp_bp_id   uuid;
    v_qnp_id      uuid;
    v_qnp_cp_id   uuid;
    v_qnp_addr_id uuid;

BEGIN

    -- ── Resolve tenant + company code ────────────────────────────────────────
    SELECT id INTO v_tenant_id
      FROM master.tenant
     WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[002_athq_ext_parties] athyper tenant not found';
    END IF;

    SELECT id INTO v_cc_id
      FROM master.company_code
     WHERE tenant_id = v_tenant_id AND code = 'ATHQ';
    IF v_cc_id IS NULL THEN
        RAISE EXCEPTION '[002_athq_ext_parties] ATHQ company code not found';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- §0  SUPPORTING REFERENCE DATA
    -- ══════════════════════════════════════════════════════════════════════════

    -- Resolve existing AE reference data from file 001
    SELECT id INTO v_jur_ae_id  FROM master.tax_jurisdiction
     WHERE tenant_id = v_tenant_id AND code = 'AE-FED';
    SELECT id INTO v_tt_vat_ae  FROM master.tax_type
     WHERE tenant_id = v_tenant_id AND code = 'VAT-AE';
    SELECT id INTO v_tg_vat_id  FROM control.tax_group
     WHERE tenant_id = v_tenant_id AND code = 'TG-AE-VAT-5-IN';
    SELECT id INTO v_tg_wht_id  FROM control.tax_group
     WHERE tenant_id = v_tenant_id AND code = 'TG-AE-WHT-5-SVC';
    SELECT id INTO v_pm_wire_ae FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND code = 'WIRE-AED';
    SELECT id INTO v_pt_net30   FROM master.payment_term
     WHERE tenant_id = v_tenant_id AND code = 'PT-NET30' AND is_current_version = true LIMIT 1;
    SELECT id INTO v_pt_net60   FROM master.payment_term
     WHERE tenant_id = v_tenant_id AND code = 'PT-NET60' AND is_current_version = true LIMIT 1;
    SELECT id INTO v_acct_ap_id FROM master.accounting_profile
     WHERE tenant_id = v_tenant_id AND code = 'AP_NON_PO_STANDARD';
    SELECT id INTO v_acct_ar_id FROM master.accounting_profile
     WHERE tenant_id = v_tenant_id AND code = 'AR_STANDARD' LIMIT 1;
    SELECT id INTO v_ct_iso9001 FROM master.certification_type
     WHERE COALESCE(tenant_id, v_sys) = v_sys AND code = 'iso-9001';
    SELECT id INTO v_ct_iso27001 FROM master.certification_type
     WHERE COALESCE(tenant_id, v_sys) = v_sys AND code = 'iso-27001';

    -- §0a  Qatar Federal tax jurisdiction
    SELECT id INTO v_jur_qa_id FROM master.tax_jurisdiction
     WHERE tenant_id = v_tenant_id AND code = 'QA-FED';
    IF v_jur_qa_id IS NULL THEN
        INSERT INTO master.tax_jurisdiction (
            tenant_id, code, name, jurisdiction_type, country_code, status, created_by
        ) VALUES (
            v_tenant_id, 'QA-FED', 'Qatar Federal', 'country', 'QA', 'active', v_sys
        ) RETURNING id INTO v_jur_qa_id;
    END IF;

    -- §0b  WIRE-USD international payment method
    SELECT id INTO v_pm_wire_us FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND code = 'WIRE-USD';
    IF v_pm_wire_us IS NULL THEN
        INSERT INTO master.payment_method (
            tenant_id, code, name, direction, instrument_mode, status, created_by
        ) VALUES (
            v_tenant_id, 'WIRE-USD', 'USD Wire Transfer',
            'outbound', 'bank_transfer', 'active', v_sys
        ) RETURNING id INTO v_pm_wire_us;
    END IF;

    -- §0c  Certification types — resolved from platform seed
    --      Guaranteed present by platform/003_master/003_certification_type.sql.
    SELECT id INTO v_ct_iso45001 FROM master.certification_type WHERE tenant_id IS NULL AND code = 'iso-45001';


    -- ══════════════════════════════════════════════════════════════════════════
    -- §1  SUPPLIER — Pinnacle Synergy Management LLC (PSM-001)
    --     UAE facilities management & property services
    -- ══════════════════════════════════════════════════════════════════════════

    -- §1a  Business partner
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description,
        registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band,
        incorporation_date, tax_residence_country_code,
        tags, metadata, status, created_by
    )
    SELECT
        v_tenant_id,
        'PSM-001', 'Pinnacle Synergy Management LLC', 'Pinnacle FM',
        'Pinnacle Synergy Management Limited Liability Company',
        'organization',
        'Integrated facilities management and property maintenance services across Abu Dhabi and Dubai.',
        '2345678901', 'AE',
        'https://www.pinnaclefm.ae', 'ERP-SUP-PSM-0001',
        'Pinnacle Synergy Management LLC was incorporated in Abu Dhabi in 2012 and provides '
        'total facilities management (TFM) services including HVAC, electrical, civil maintenance, '
        'cleaning, security, and soft services to commercial and industrial clients across the UAE.',
        ARRAY['Pinnacle FM', 'PSM', 'Pinnacle Synergy'],
        ARRAY['facilities_management', 'property_services'],
        'private_limited', 2012,
        'e11_50', 'r1m_10m',
        '2012-05-15'::date, 'AE',
        '["facilities","UAE","preferred"]'::jsonb,
        jsonb_build_object(
            '_seed',       jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0','seeded_at',now()::text),
            'erp_codes',   jsonb_build_object('sap','400000002','legacy','PSM-001'),
            'procurement', jsonb_build_object('category','facilities_management','lead_time_days',3)
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id = v_tenant_id AND code = 'PSM-001'
    );
    SELECT id INTO v_psm_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'PSM-001';

    -- §1a-ii  Supplier role
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code,
        supplier_type, is_payment_ready, payment_ready_at, payment_ready_by,
        payment_ready_reason, anticipated_risk_tier, status, created_by
    )
    SELECT v_tenant_id, v_psm_bp_id, 'SUP-ATHQ-PSM-001',
           'service', true, '2023-01-15 10:00:00+04'::timestamptz, v_sys,
           'Bank details verified. All compliance documents on file.',
           'low', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-PSM-001'
    );
    SELECT id INTO v_psm_id FROM master.supplier
     WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-PSM-001';

    -- §1b  Bank account (First Abu Dhabi Bank AED)
    SELECT id INTO v_psm_ba_id FROM master.bank_account
     WHERE tenant_id = v_tenant_id AND code = 'ba-psm-aed-01';
    IF v_psm_ba_id IS NULL THEN
        INSERT INTO master.bank_account (
            tenant_id, code, name, account_holder_name,
            account_id_type, account_id_value, account_last4,
            currency_code, bic_override, bank_name_override, bank_country_override,
            account_nature, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id,
            'ba-psm-aed-01',
            'Pinnacle Synergy Management — First Abu Dhabi Bank AED',
            'Pinnacle Synergy Management LLC',
            'iban', 'AE830540000009876543210', '3210',
            'AED', 'NBADAEAA', 'First Abu Dhabi Bank', 'AE',
            'direct', true, now(),
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_psm_ba_id;
    END IF;

    SELECT id INTO v_psm_bal_id FROM master.bank_account_link
     WHERE tenant_id = v_tenant_id AND bank_account_id = v_psm_ba_id
       AND owner_type = 'supplier' AND owner_id = v_psm_id AND purpose = 'disbursement' LIMIT 1;
    IF v_psm_bal_id IS NULL THEN
        INSERT INTO master.bank_account_link (
            tenant_id, bank_account_id, owner_type, owner_id,
            company_code_id, purpose, is_primary, effective_from, metadata, created_by
        ) VALUES (
            v_tenant_id, v_psm_ba_id, 'supplier', v_psm_id,
            v_cc_id, 'disbursement', true, '2023-01-01'::date,
            '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
        ) RETURNING id INTO v_psm_bal_id;
    END IF;

    -- §1c  Company code supplier profile
    INSERT INTO master.company_code_supplier_profile (
        tenant_id, supplier_id, company_code_id,
        payment_term_id, payment_method_id, currency_code,
        default_accounting_profile_id, preferred_remittance_bank_link_id,
        tax_group_id, default_wht_tax_group_id,
        default_dimension_set_id, invoice_hold_policy_id,
        is_blocked, block_reason, metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_psm_id, v_cc_id,
        v_pt_net30, v_pm_wire_ae, 'AED',
        v_acct_ap_id, v_psm_bal_id,
        v_tg_vat_id, v_tg_wht_id,
        NULL, NULL, false, NULL,
        jsonb_build_object('_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
                           'notes', 'Facilities management AP profile — ATHQ/AED'),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_profile
         WHERE tenant_id = v_tenant_id AND supplier_id = v_psm_id AND company_code_id = v_cc_id
    );

    -- §1d  Party identifiers (DUNS)
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_psm_bp_id,
           'duns', '234567890', 'Dun & Bradstreet', '2021-06-01'::date, NULL,
           true, now(), true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_psm_bp_id AND scheme = 'duns'
    );

    -- §1e  Tax profile (UAE)
    INSERT INTO master.party_tax_profile (
        tenant_id, owner_type, owner_id, country_code,
        penalty_information, discount_information, global_location_number,
        tax_classification, taxation_type,
        tax_id, state_tax_id, sales_tax_id, service_tax_id, regional_tax_id, vat_id,
        vat_registered, vat_registration_doc_id,
        has_tax_clearance, tax_clearance_number, tax_clearance_doc_id, tax_clearance_expiry_date,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_psm_bp_id, 'AE',
        'Late payment penalty: 1.5% per month after 45 days.',
        NULL,
        '6282345678901',
        'company', 'standard',
        '100234567000001', NULL, NULL, NULL, NULL, '100234567000001',
        true, NULL,
        false, NULL, NULL, NULL,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_psm_bp_id AND country_code = 'AE'
    );

    -- §1f  Certifications (ISO 9001 + ISO 45001)
    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id, certification_type_id, custom_name,
        certificate_number, certified_by, certified_location, additional_info,
        document_attachment_id, effective_from, effective_until,
        metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_psm_bp_id,
           v_ct_iso9001, NULL,
           'ISO9001-UAE-PSM-2023-0089', 'Intertek Certification Ltd', 'Abu Dhabi, UAE',
           'Scope: Provision of integrated facilities management services.',
           NULL, '2023-04-01'::date, '2026-03-31'::date,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE v_ct_iso9001 IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_psm_bp_id AND certification_type_id = v_ct_iso9001
    );

    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id, certification_type_id, custom_name,
        certificate_number, certified_by, certified_location, additional_info,
        document_attachment_id, effective_from, effective_until,
        metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_psm_bp_id,
           v_ct_iso45001, NULL,
           'ISO45001-UAE-PSM-2023-0034', 'Intertek Certification Ltd', 'Abu Dhabi, UAE',
           'Scope: OH&S management for on-site facilities maintenance teams.',
           NULL, '2023-04-01'::date, '2026-03-31'::date,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE v_ct_iso45001 IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_psm_bp_id AND certification_type_id = v_ct_iso45001
    );

    -- §1g  Contact person + contact_link
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id, company_code_id,
        contact_name, business_title, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_psm_bp_id, NULL,
           'Hassan Al-Balushi', 'Operations Manager', true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_psm_bp_id AND contact_name = 'Hassan Al-Balushi'
    )
    RETURNING id INTO v_psm_cp_id;

    IF v_psm_cp_id IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id, party_contact_person_id, role_code, created_by)
        VALUES (v_tenant_id, v_psm_cp_id, 'operations_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value, purpose,
            is_primary, is_verified, verified_at, metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_psm_bp_id, 'email',
         'hassan.albalushi@pinnaclefm.ae', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_psm_bp_id, 'phone',
         '+97126789012', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_psm_bp_id, 'email',
         'accounts@pinnaclefm.ae', 'default',
         false, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §1h  Governance (director + UBO)
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_psm_bp_id,
           'director', 'Mohammed Saeed Al-Hamdan', 'individual',
           NULL, 'Chief Executive Officer', NULL, NULL,
           '2012-05-15'::date, NULL, 'Founding CEO.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_psm_bp_id AND relation_type = 'director'
           AND member_name = 'Mohammed Saeed Al-Hamdan'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_psm_bp_id,
           'ubo', 'Synergy Investments LLC', 'company',
           'Synergy Investments LLC', 'Ultimate Beneficial Owner',
           85.0000, 'ordinary',
           '2012-05-15'::date, NULL,
           '85% majority shareholder. Abu Dhabi registered holding company.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_psm_bp_id AND relation_type = 'ubo'
           AND member_name = 'Synergy Investments LLC'
    );

    -- §1i  Supplier qualification
    INSERT INTO master.supplier_qualification (
        tenant_id, supplier_id,
        onboarding_status, profile_completeness_pct,
        onboarding_approved_at, onboarding_approved_by,
        is_approved_supplier, is_preferred_supplier,
        is_blocked, block_reason, block_start_date, risk_tier,
        sanctions_status, aml_kyc_status, sanctions_check_date, kyc_expiry_date,
        sourcing_event_count, bid_count, awarded_count,
        delivery_score, quality_score, sla_score,
        score_period_start, score_period_end,
        last_review_date, next_review_date, reviewed_by,
        metadata, status, created_by
    )
    SELECT v_tenant_id, v_psm_id,
           'approved', 95,
           '2023-03-01 09:00:00+04'::timestamptz, v_sys,
           true, false,
           false, NULL, NULL, 'low',
           'clear', 'passed', '2025-03-10'::date, '2027-03-10'::date,
           8, 5, 4,
           91.00, 88.50, 93.20,
           '2024-01-01'::date, '2024-12-31'::date,
           '2025-03-10'::date, '2026-03-10'::date, v_sys,
           jsonb_build_object(
               '_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
               'review_notes', 'Annual review completed. Scope expanded to include soft services.'
           ),
           'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier_qualification
         WHERE tenant_id = v_tenant_id AND supplier_id = v_psm_id
    );

    -- §1j  Address (Mussafah Industrial Area, Abu Dhabi)
    SELECT id INTO v_psm_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-psm-muss-hq';
    IF v_psm_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, city, region, postal_code, country_code, formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-psm-muss-hq',
            'Pinnacle Synergy Management — Mussafah HQ', 'commercial',
            'Attn: Accounts Payable',
            'Plot M-14, Mussafah Industrial Area', 'Sector 27, Building 2',
            'Abu Dhabi', 'Abu Dhabi', '38476', 'AE',
            'Building 2, Plot M-14, Sector 27, Mussafah Industrial Area, Abu Dhabi 38476, UAE',
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_psm_addr_id;
    END IF;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_psm_bp_id, v_psm_addr_id, 'default',
        true, '2012-05-15'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[002_athq_ext_parties] Supplier SUP-ATHQ-PSM-001 seeded (id=%)', v_psm_id;


    -- ══════════════════════════════════════════════════════════════════════════
    -- §2  SUPPLIER — Gulf Freight Logistics WLL (GFL-001)
    --     Qatar-based freight & logistics provider
    -- ══════════════════════════════════════════════════════════════════════════

    -- §2a  Business partner
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description,
        registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band,
        incorporation_date, tax_residence_country_code,
        tags, metadata, status, created_by
    )
    SELECT
        v_tenant_id,
        'GFL-001', 'Gulf Freight Logistics WLL', 'Gulf Freight',
        'Gulf Freight Logistics with Limited Liability',
        'organization',
        'End-to-end freight forwarding, customs clearance, and logistics across Qatar and GCC.',
        '55432198765', 'QA',
        'https://www.gulffreight.qa', 'ERP-SUP-GFL-0001',
        'Gulf Freight Logistics WLL, founded in 2006, is Qatar''s mid-tier freight and logistics '
        'specialist. Services: sea freight, air freight, customs brokerage, bonded warehousing, '
        'and last-mile delivery across Doha and the GCC.',
        ARRAY['Gulf Freight', 'GFL', 'GFL Logistics'],
        ARRAY['logistics', 'freight_forwarding', 'customs_clearance'],
        'private_limited', 2006,
        'e201_500', 'r10m_50m',
        '2006-03-20'::date, 'QA',
        '["logistics","Qatar","GCC","freight"]'::jsonb,
        jsonb_build_object(
            '_seed',       jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0','seeded_at',now()::text),
            'erp_codes',   jsonb_build_object('sap','400000003','legacy','GFL-001'),
            'procurement', jsonb_build_object('category','freight_logistics','lead_time_days',2,'transit_days_sea',21,'transit_days_air',3)
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id = v_tenant_id AND code = 'GFL-001'
    );
    SELECT id INTO v_gfl_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'GFL-001';

    -- §2a-ii  Supplier role
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code,
        supplier_type, is_payment_ready, payment_ready_at, payment_ready_by,
        payment_ready_reason, anticipated_risk_tier, status, created_by
    )
    SELECT v_tenant_id, v_gfl_bp_id, 'SUP-ATHQ-GFL-001',
           'general', true, '2022-07-01 10:00:00+03'::timestamptz, v_sys,
           'IBAN verified with Qatar National Bank. Compliance docs current.',
           'low', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-GFL-001'
    );
    SELECT id INTO v_gfl_id FROM master.supplier
     WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-GFL-001';

    -- §2b  Bank account (Qatar National Bank — USD invoicing)
    SELECT id INTO v_gfl_ba_id FROM master.bank_account
     WHERE tenant_id = v_tenant_id AND code = 'ba-gfl-usd-01';
    IF v_gfl_ba_id IS NULL THEN
        INSERT INTO master.bank_account (
            tenant_id, code, name, account_holder_name,
            account_id_type, account_id_value, account_last4,
            currency_code, bic_override, bank_name_override, bank_country_override,
            account_nature, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id,
            'ba-gfl-usd-01',
            'Gulf Freight Logistics — QNB USD',
            'Gulf Freight Logistics WLL',
            'iban', 'QA58QNBA000000000001234567890', '7890',
            'USD', 'QNBAQAQA', 'Qatar National Bank', 'QA',
            'direct', true, now(),
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_gfl_ba_id;
    END IF;

    SELECT id INTO v_gfl_bal_id FROM master.bank_account_link
     WHERE tenant_id = v_tenant_id AND bank_account_id = v_gfl_ba_id
       AND owner_type = 'supplier' AND owner_id = v_gfl_id AND purpose = 'disbursement' LIMIT 1;
    IF v_gfl_bal_id IS NULL THEN
        INSERT INTO master.bank_account_link (
            tenant_id, bank_account_id, owner_type, owner_id,
            company_code_id, purpose, is_primary, effective_from, metadata, created_by
        ) VALUES (
            v_tenant_id, v_gfl_ba_id, 'supplier', v_gfl_id,
            v_cc_id, 'disbursement', true, '2022-07-01'::date,
            '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
        ) RETURNING id INTO v_gfl_bal_id;
    END IF;

    -- §2c  Company code supplier profile (USD invoicing)
    INSERT INTO master.company_code_supplier_profile (
        tenant_id, supplier_id, company_code_id,
        payment_term_id, payment_method_id, currency_code,
        default_accounting_profile_id, preferred_remittance_bank_link_id,
        tax_group_id, default_wht_tax_group_id,
        default_dimension_set_id, invoice_hold_policy_id,
        is_blocked, block_reason, metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_gfl_id, v_cc_id,
        v_pt_net60, v_pm_wire_us, 'USD',
        v_acct_ap_id, v_gfl_bal_id,
        NULL, NULL,
        NULL, NULL, false, NULL,
        jsonb_build_object('_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
                           'notes', 'Freight logistics AP profile — USD invoicing, NET60'),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_profile
         WHERE tenant_id = v_tenant_id AND supplier_id = v_gfl_id AND company_code_id = v_cc_id
    );

    -- §2d  Party identifiers (DUNS + customs registration)
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_gfl_bp_id,
           'duns', '345678901', 'Dun & Bradstreet', '2019-11-15'::date, NULL,
           true, now(), true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_gfl_bp_id AND scheme = 'duns'
    );

    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_gfl_bp_id,
           'customs_registration', 'QA-CR-2006-009876',
           'Qatar Customs Authority', '2006-04-01'::date, NULL,
           true, now(), false,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_gfl_bp_id AND scheme = 'customs_registration'
    );

    -- §2e  Party tax profile (Qatar — no VAT regime)
    INSERT INTO master.party_tax_profile (
        tenant_id, owner_type, owner_id, country_code,
        penalty_information, discount_information, global_location_number,
        tax_classification, taxation_type,
        tax_id, state_tax_id, sales_tax_id, service_tax_id, regional_tax_id, vat_id,
        vat_registered, vat_registration_doc_id,
        has_tax_clearance, tax_clearance_number, tax_clearance_doc_id, tax_clearance_expiry_date,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_gfl_bp_id, 'QA',
        'Interest on late payment: 2% per annum per QFCA guidelines.',
        'Prompt payment discount: 0.5% for settlement within 15 days.',
        '6340987654321',
        'company', 'standard',
        'QA-TIN-2006-GFL-0001', NULL, NULL, NULL, NULL, NULL,
        false, NULL,
        false, NULL, NULL, NULL,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_gfl_bp_id AND country_code = 'QA'
    );

    -- §2f  Certification (ISO 9001)
    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id, certification_type_id, custom_name,
        certificate_number, certified_by, certified_location, additional_info,
        document_attachment_id, effective_from, effective_until,
        metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_gfl_bp_id,
           v_ct_iso9001, NULL,
           'ISO9001-QA-GFL-2021-0023', 'SGS Gulf Ltd', 'Doha, Qatar',
           'Scope: Freight forwarding, customs clearance, and bonded warehousing.',
           NULL, '2021-09-01'::date, '2024-08-31'::date,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE v_ct_iso9001 IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_gfl_bp_id AND certification_type_id = v_ct_iso9001
    );

    -- §2g  Contact person
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id, company_code_id,
        contact_name, business_title, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_gfl_bp_id, NULL,
           'Mohammed Khalil Al-Qahtani', 'Commercial Director', true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_gfl_bp_id AND contact_name = 'Mohammed Khalil Al-Qahtani'
    )
    RETURNING id INTO v_gfl_cp_id;

    IF v_gfl_cp_id IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id, party_contact_person_id, role_code, created_by)
        VALUES (v_tenant_id, v_gfl_cp_id, 'commercial_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value, purpose,
            is_primary, is_verified, verified_at, metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_gfl_bp_id, 'email',
         'm.alqahtani@gulffreight.qa', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_gfl_bp_id, 'phone',
         '+97444556677', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_gfl_bp_id, 'email',
         'finance@gulffreight.qa', 'default',
         false, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §2h  Governance
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_gfl_bp_id,
           'director', 'Ahmad Khalil Al-Manhal', 'individual',
           NULL, 'Chief Executive Officer', NULL, NULL,
           '2006-03-20'::date, NULL, 'Founding CEO and major shareholder.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_gfl_bp_id AND relation_type = 'director'
           AND member_name = 'Ahmad Khalil Al-Manhal'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_gfl_bp_id,
           'ubo', 'Qatar Logistics & Maritime Holdings WLL', 'company',
           'Qatar Logistics & Maritime Holdings WLL', 'Ultimate Beneficial Owner',
           70.0000, 'ordinary',
           '2010-01-01'::date, NULL,
           '70% shareholder. Listed on the Qatar Exchange.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_gfl_bp_id AND relation_type = 'ubo'
           AND member_name = 'Qatar Logistics & Maritime Holdings WLL'
    );

    -- §2i  Supplier qualification
    INSERT INTO master.supplier_qualification (
        tenant_id, supplier_id,
        onboarding_status, profile_completeness_pct,
        onboarding_approved_at, onboarding_approved_by,
        is_approved_supplier, is_preferred_supplier,
        is_blocked, block_reason, block_start_date, risk_tier,
        sanctions_status, aml_kyc_status, sanctions_check_date, kyc_expiry_date,
        sourcing_event_count, bid_count, awarded_count,
        delivery_score, quality_score, sla_score,
        score_period_start, score_period_end,
        last_review_date, next_review_date, reviewed_by,
        metadata, status, created_by
    )
    SELECT v_tenant_id, v_gfl_id,
           'approved', 90,
           '2022-07-15 09:00:00+03'::timestamptz, v_sys,
           true, false,
           false, NULL, NULL, 'low',
           'clear', 'passed', '2024-11-20'::date, '2026-11-20'::date,
           15, 9, 8,
           94.30, 90.00, 92.10,
           '2024-01-01'::date, '2024-12-31'::date,
           '2024-11-20'::date, '2025-11-20'::date, v_sys,
           jsonb_build_object(
               '_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
               'review_notes', 'On-time delivery rate consistently above 94%. No incidents reported.'
           ),
           'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier_qualification WHERE tenant_id = v_tenant_id AND supplier_id = v_gfl_id
    );

    -- §2j  Address (Doha Industrial Area, Qatar)
    SELECT id INTO v_gfl_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-gfl-doh-ia';
    IF v_gfl_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, city, region, postal_code, country_code, formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-gfl-doh-ia',
            'Gulf Freight Logistics — Doha Industrial Area', 'commercial',
            'Attn: Finance & Accounts',
            'Street 53, Zone 53, Industrial Area', 'Gate 4, Warehouse Block B',
            'Doha', 'Ad Dawhah', '23411', 'QA',
            'Warehouse Block B, Gate 4, Street 53, Zone 53, Industrial Area, Doha 23411, Qatar',
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_gfl_addr_id;
    END IF;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_gfl_bp_id, v_gfl_addr_id, 'default',
        true, '2006-03-20'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[002_athq_ext_parties] Supplier SUP-ATHQ-GFL-001 seeded (id=%)', v_gfl_id;


    -- ══════════════════════════════════════════════════════════════════════════
    -- §3  SUPPLIER — Nexus InfoComm Consulting LLC (NIC-001)
    --     UAE IT services & cloud consulting
    -- ══════════════════════════════════════════════════════════════════════════

    -- §3a  Business partner
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description,
        registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band,
        incorporation_date, tax_residence_country_code,
        tags, metadata, status, created_by
    )
    SELECT
        v_tenant_id,
        'NIC-001', 'Nexus InfoComm Consulting LLC', 'Nexus IC',
        'Nexus InfoComm Consulting Limited Liability Company',
        'organization',
        'Cloud strategy, managed IT services, and digital transformation consulting in the UAE.',
        '3456789012', 'AE',
        'https://www.nexusic.ae', 'ERP-SUP-NIC-0001',
        'Nexus InfoComm Consulting LLC was founded in 2015 in Dubai Media City. Specialises in '
        'cloud migration (AWS, Azure, GCP), managed SOC services, ERP implementations, '
        'and IT governance advisory for mid-to-large UAE corporates.',
        ARRAY['Nexus IC', 'NIC', 'Nexus InfoComm'],
        ARRAY['information_technology', 'professional_services', 'cloud_services'],
        'private_limited', 2015,
        'e11_50', 'r1m_10m',
        '2015-09-01'::date, 'AE',
        '["IT","cloud","UAE","managed_services","preferred"]'::jsonb,
        jsonb_build_object(
            '_seed',       jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0','seeded_at',now()::text),
            'erp_codes',   jsonb_build_object('sap','400000004','legacy','NIC-001'),
            'procurement', jsonb_build_object('category','it_managed_services','lead_time_days',14)
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id = v_tenant_id AND code = 'NIC-001'
    );
    SELECT id INTO v_nic_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'NIC-001';

    -- §3a-ii  Supplier role
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code,
        supplier_type, is_payment_ready, payment_ready_at, payment_ready_by,
        payment_ready_reason, anticipated_risk_tier, status, created_by
    )
    SELECT v_tenant_id, v_nic_bp_id, 'SUP-ATHQ-NIC-001',
           'service', true, '2024-01-10 09:00:00+04'::timestamptz, v_sys,
           'Bank verified. SOC 2 + ISO 27001 on file.',
           'low', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-NIC-001'
    );
    SELECT id INTO v_nic_id FROM master.supplier
     WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-ATHQ-NIC-001';

    -- §3b  Bank account (Emirates NBD AED)
    SELECT id INTO v_nic_ba_id FROM master.bank_account
     WHERE tenant_id = v_tenant_id AND code = 'ba-nic-aed-01';
    IF v_nic_ba_id IS NULL THEN
        INSERT INTO master.bank_account (
            tenant_id, code, name, account_holder_name,
            account_id_type, account_id_value, account_last4,
            currency_code, bic_override, bank_name_override, bank_country_override,
            account_nature, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id,
            'ba-nic-aed-01',
            'Nexus InfoComm Consulting — Emirates NBD AED',
            'Nexus InfoComm Consulting LLC',
            'iban', 'AE570260001234567890123', '0123',
            'AED', 'EBILAEAD', 'Emirates NBD', 'AE',
            'direct', true, now(),
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_nic_ba_id;
    END IF;

    SELECT id INTO v_nic_bal_id FROM master.bank_account_link
     WHERE tenant_id = v_tenant_id AND bank_account_id = v_nic_ba_id
       AND owner_type = 'supplier' AND owner_id = v_nic_id AND purpose = 'disbursement' LIMIT 1;
    IF v_nic_bal_id IS NULL THEN
        INSERT INTO master.bank_account_link (
            tenant_id, bank_account_id, owner_type, owner_id,
            company_code_id, purpose, is_primary, effective_from, metadata, created_by
        ) VALUES (
            v_tenant_id, v_nic_ba_id, 'supplier', v_nic_id,
            v_cc_id, 'disbursement', true, '2024-01-01'::date,
            '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
        ) RETURNING id INTO v_nic_bal_id;
    END IF;

    -- §3c  Company code supplier profile
    INSERT INTO master.company_code_supplier_profile (
        tenant_id, supplier_id, company_code_id,
        payment_term_id, payment_method_id, currency_code,
        default_accounting_profile_id, preferred_remittance_bank_link_id,
        tax_group_id, default_wht_tax_group_id,
        default_dimension_set_id, invoice_hold_policy_id,
        is_blocked, block_reason, metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_nic_id, v_cc_id,
        v_pt_net30, v_pm_wire_ae, 'AED',
        v_acct_ap_id, v_nic_bal_id,
        v_tg_vat_id, v_tg_wht_id,
        NULL, NULL, false, NULL,
        jsonb_build_object('_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
                           'notes', 'IT services AP profile — ATHQ/AED, WHT applicable'),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_supplier_profile
         WHERE tenant_id = v_tenant_id AND supplier_id = v_nic_id AND company_code_id = v_cc_id
    );

    -- §3d  Party identifiers
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_nic_bp_id,
           'duns', '456789012', 'Dun & Bradstreet', '2022-02-01'::date, NULL,
           true, now(), true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_nic_bp_id AND scheme = 'duns'
    );

    -- §3e  Tax profile (UAE, VAT registered)
    INSERT INTO master.party_tax_profile (
        tenant_id, owner_type, owner_id, country_code,
        penalty_information, discount_information, global_location_number,
        tax_classification, taxation_type,
        tax_id, state_tax_id, sales_tax_id, service_tax_id, regional_tax_id, vat_id,
        vat_registered, vat_registration_doc_id,
        has_tax_clearance, tax_clearance_number, tax_clearance_doc_id, tax_clearance_expiry_date,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_nic_bp_id, 'AE',
        'Late payment: 2% per month after 30 days.', NULL,
        '6283456789012',
        'company', 'standard',
        '100456789000001', NULL, NULL, NULL, NULL, '100456789000001',
        true, NULL,
        true, 'TCN-AE-2025-NIC-001', NULL, '2027-12-31'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_nic_bp_id AND country_code = 'AE'
    );

    -- §3f  Certifications (ISO 27001)
    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id, certification_type_id, custom_name,
        certificate_number, certified_by, certified_location, additional_info,
        document_attachment_id, effective_from, effective_until,
        metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_nic_bp_id,
           v_ct_iso27001, NULL,
           'ISO27001-UAE-NIC-2024-0201', 'BSI Group', 'Dubai, UAE',
           'Scope: Managed cloud services, SOC operations, and IT consulting.',
           NULL, '2024-01-15'::date, '2027-01-14'::date,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE v_ct_iso27001 IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_nic_bp_id AND certification_type_id = v_ct_iso27001
    );

    -- §3g  Contact person
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id, company_code_id,
        contact_name, business_title, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_nic_bp_id, NULL,
           'Priya Sharma', 'Account Manager', true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_nic_bp_id AND contact_name = 'Priya Sharma'
    )
    RETURNING id INTO v_nic_cp_id;

    IF v_nic_cp_id IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id, party_contact_person_id, role_code, created_by)
        VALUES (v_tenant_id, v_nic_cp_id, 'account_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value, purpose,
            is_primary, is_verified, verified_at, metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_nic_bp_id, 'email',
         'priya.sharma@nexusic.ae', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_nic_bp_id, 'phone',
         '+97145678901', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_nic_bp_id, 'email',
         'billing@nexusic.ae', 'default',
         false, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §3h  Governance
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_nic_bp_id,
           'director', 'Rajesh Kumar Menon', 'individual',
           NULL, 'Chief Executive Officer', NULL, NULL,
           '2015-09-01'::date, NULL, 'Founding CEO. Led digital transformation practice since inception.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_nic_bp_id AND relation_type = 'director'
           AND member_name = 'Rajesh Kumar Menon'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_nic_bp_id,
           'ubo', 'TechVentures International Ltd', 'company',
           'TechVentures International Ltd', 'Ultimate Beneficial Owner',
           60.0000, 'ordinary',
           '2015-09-01'::date, NULL,
           '60% investor. Mumbai-headquartered technology investment group.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_nic_bp_id AND relation_type = 'ubo'
           AND member_name = 'TechVentures International Ltd'
    );

    -- §3i  Supplier qualification
    INSERT INTO master.supplier_qualification (
        tenant_id, supplier_id,
        onboarding_status, profile_completeness_pct,
        onboarding_approved_at, onboarding_approved_by,
        is_approved_supplier, is_preferred_supplier,
        is_blocked, block_reason, block_start_date, risk_tier,
        sanctions_status, aml_kyc_status, sanctions_check_date, kyc_expiry_date,
        sourcing_event_count, bid_count, awarded_count,
        delivery_score, quality_score, sla_score,
        score_period_start, score_period_end,
        last_review_date, next_review_date, reviewed_by,
        metadata, status, created_by
    )
    SELECT v_tenant_id, v_nic_id,
           'approved', 100,
           '2024-02-01 09:00:00+04'::timestamptz, v_sys,
           true, true,
           false, NULL, NULL, 'low',
           'clear', 'passed', '2025-01-15'::date, '2027-01-15'::date,
           6, 4, 3,
           98.00, 96.50, 99.10,
           '2024-01-01'::date, '2024-12-31'::date,
           '2025-01-15'::date, '2026-01-15'::date, v_sys,
           jsonb_build_object(
               '_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
               'review_notes', 'Preferred status granted. Delivered ERP migration ahead of schedule.'
           ),
           'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier_qualification WHERE tenant_id = v_tenant_id AND supplier_id = v_nic_id
    );

    -- §3j  Address (Dubai Media City)
    SELECT id INTO v_nic_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-nic-dmc-hq';
    IF v_nic_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, city, region, postal_code, country_code, formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-nic-dmc-hq',
            'Nexus InfoComm Consulting — Dubai Media City', 'commercial',
            'Attn: Finance Department',
            'Building 9, Dubai Media City', 'Office 302, 3rd Floor',
            'Dubai', 'Dubai', '500019', 'AE',
            'Office 302, 3rd Floor, Building 9, Dubai Media City, Dubai 500019, UAE',
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_nic_addr_id;
    END IF;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_nic_bp_id, v_nic_addr_id, 'default',
        true, '2015-09-01'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[002_athq_ext_parties] Supplier SUP-ATHQ-NIC-001 seeded (id=%)', v_nic_id;


    -- ══════════════════════════════════════════════════════════════════════════
    -- §4  CUSTOMER — Arabian Energy Holdings LLC (AEH-001)
    --     UAE energy sector — key account
    -- ══════════════════════════════════════════════════════════════════════════

    -- §4a  Business partner
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description,
        registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band,
        incorporation_date, tax_residence_country_code,
        tags, metadata, status, created_by
    )
    SELECT
        v_tenant_id,
        'AEH-001', 'Arabian Energy Holdings LLC', 'AEH',
        'Arabian Energy Holdings Limited Liability Company',
        'organization',
        'Diversified energy investment and asset management group across the UAE.',
        '1111111111', 'AE',
        'https://www.aeh.ae', 'CRM-CUS-AEH-0001',
        'Arabian Energy Holdings LLC is an Abu Dhabi-based energy investment and asset management '
        'company, founded in 2010. Manages a portfolio of upstream, midstream, and downstream '
        'energy assets across the UAE and broader MENA region. '
        'Significant buyer of construction materials, IT services, and facilities management.',
        ARRAY['AEH', 'Arabian Energy', 'AEH Holdings'],
        ARRAY['energy', 'investment_holding', 'asset_management'],
        'private_limited', 2010,
        'e201_500', 'r100m_500m',
        '2010-07-01'::date, 'AE',
        '["energy","UAE","key_account","enterprise"]'::jsonb,
        jsonb_build_object(
            '_seed',              jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0','seeded_at',now()::text),
            'erp_codes',          jsonb_build_object('crm','300000001','legacy','AEH-001'),
            'account_management', jsonb_build_object('tier','key','segment','enterprise','nda_signed',true)
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id = v_tenant_id AND code = 'AEH-001'
    );
    SELECT id INTO v_aeh_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'AEH-001';

    -- §4a-ii  Customer role
    INSERT INTO master.customer (
        tenant_id, business_partner_id, customer_code,
        customer_type, is_key_account, risk_rating, status, created_by
    )
    SELECT v_tenant_id, v_aeh_bp_id, 'CUS-ATHQ-AEH-001',
           'corporate', true, 'low', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer WHERE tenant_id = v_tenant_id AND customer_code = 'CUS-ATHQ-AEH-001'
    );
    SELECT id INTO v_aeh_id FROM master.customer
     WHERE tenant_id = v_tenant_id AND customer_code = 'CUS-ATHQ-AEH-001';

    -- §4b  Company code customer profile
    INSERT INTO master.company_code_customer_profile (
        tenant_id, customer_id, company_code_id,
        currency_code, credit_limit, credit_limit_currency_code, credit_rating,
        default_accounting_profile_id, default_receipt_method_id,
        tax_group_id, default_dimension_set_id,
        statement_cycle_code, dunning_policy_id,
        is_blocked, block_reason, metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_aeh_id, v_cc_id,
        'AED', 10000000.0000, 'AED', 'aa',
        v_acct_ar_id, NULL,
        v_tg_vat_id, NULL,
        'monthly', NULL,
        false, NULL,
        jsonb_build_object('_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
                           'notes', 'Key account AR profile — ATHQ/AED, AED 10M credit facility'),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_customer_profile
         WHERE tenant_id = v_tenant_id AND customer_id = v_aeh_id AND company_code_id = v_cc_id
    );

    -- §4c  Party identifier
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_aeh_bp_id,
           'duns', '111111111', 'Dun & Bradstreet', '2017-03-01'::date, NULL,
           true, now(), true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_aeh_bp_id AND scheme = 'duns'
    );

    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_aeh_bp_id,
           'lei', '549300AEH00UAE12X001',
           'GLEIF', '2022-08-01'::date, '2027-08-01'::date,
           true, now(), false,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_aeh_bp_id AND scheme = 'lei'
    );

    -- §4d  Tax profile (UAE)
    INSERT INTO master.party_tax_profile (
        tenant_id, owner_type, owner_id, country_code,
        penalty_information, discount_information, global_location_number,
        tax_classification, taxation_type,
        tax_id, state_tax_id, sales_tax_id, service_tax_id, regional_tax_id, vat_id,
        vat_registered, vat_registration_doc_id,
        has_tax_clearance, tax_clearance_number, tax_clearance_doc_id, tax_clearance_expiry_date,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_aeh_bp_id, 'AE',
        NULL, 'Early payment discount: 1.5% for payment within 7 days.',
        '6281111111001',
        'company', 'standard',
        '100111111000001', NULL, NULL, NULL, NULL, '100111111000001',
        true, NULL,
        true, 'TCN-AE-2025-AEH-001', NULL, '2026-12-31'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_aeh_bp_id AND country_code = 'AE'
    );

    -- §4e  Certification (ISO 27001)
    INSERT INTO master.certification (
        tenant_id, owner_type, owner_id, certification_type_id, custom_name,
        certificate_number, certified_by, certified_location, additional_info,
        document_attachment_id, effective_from, effective_until,
        metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_aeh_bp_id,
           v_ct_iso27001, NULL,
           'ISO27001-UAE-AEH-2024-0055', 'PwC Certification', 'Abu Dhabi, UAE',
           'Scope: Information security management for energy asset management systems.',
           NULL, '2024-06-01'::date, '2027-05-31'::date,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE v_ct_iso27001 IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.certification
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_aeh_bp_id AND certification_type_id = v_ct_iso27001
    );

    -- §4f  Contact person
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id, company_code_id,
        contact_name, business_title, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_aeh_bp_id, NULL,
           'Sultan Hamad Al-Dhaheri', 'Finance Director', true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_aeh_bp_id AND contact_name = 'Sultan Hamad Al-Dhaheri'
    )
    RETURNING id INTO v_aeh_cp_id;

    IF v_aeh_cp_id IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id, party_contact_person_id, role_code, created_by)
        VALUES (v_tenant_id, v_aeh_cp_id, 'finance_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value, purpose,
            is_primary, is_verified, verified_at, metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_aeh_bp_id, 'email',
         's.aldhaheri@aeh.ae', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_aeh_bp_id, 'phone',
         '+97124556789', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_aeh_bp_id, 'email',
         'ar@aeh.ae', 'default',
         false, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §4g  Governance
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_aeh_bp_id,
           'director', 'Hamdan Khalifa Al-Mansouri', 'individual',
           NULL, 'Chief Executive Officer', NULL, NULL,
           '2010-07-01'::date, NULL, 'Founding CEO.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_aeh_bp_id AND relation_type = 'director'
           AND member_name = 'Hamdan Khalifa Al-Mansouri'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_aeh_bp_id,
           'ubo', 'Abu Dhabi Energy Investment LLC', 'company',
           'Abu Dhabi Energy Investment LLC', 'Ultimate Beneficial Owner',
           80.0000, 'ordinary',
           '2010-07-01'::date, NULL,
           '80% shareholder. Sovereign-linked investment vehicle.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_aeh_bp_id AND relation_type = 'ubo'
           AND member_name = 'Abu Dhabi Energy Investment LLC'
    );

    -- §4h  Customer qualification
    INSERT INTO master.customer_qualification (
        tenant_id, customer_id,
        credit_status, credit_limit_band, credit_score, credit_rating,
        dso_days, payment_behavior, has_overdue_history,
        kyc_status, aml_sanctions_status, beneficial_owner_check_status,
        kyc_check_date, kyc_expiry_date,
        is_dunning_eligible, is_statement_eligible, dunning_hold_reason,
        last_credit_review_date, next_credit_review_date, reviewer_id,
        metadata, status, created_by
    )
    SELECT v_tenant_id, v_aeh_id,
           'approved', 'aed_5m_20m', 850, 'aa',
           21, 'excellent', false,
           'passed', 'clear', 'passed',
           '2025-01-15'::date, '2027-01-15'::date,
           true, true, NULL,
           '2025-01-15'::date, '2026-01-15'::date, v_sys,
           jsonb_build_object(
               '_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
               'credit_notes', 'Key account. AAA rated. Payment history exceptional. Annual review.'
           ),
           'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer_qualification WHERE tenant_id = v_tenant_id AND customer_id = v_aeh_id
    );

    -- §4i  Address (Al Maryah Island, Abu Dhabi)
    SELECT id INTO v_aeh_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-aeh-maryah-hq';
    IF v_aeh_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, city, region, postal_code, country_code, formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-aeh-maryah-hq',
            'Arabian Energy Holdings — Al Maryah Island HQ', 'commercial',
            'Attn: Finance Department',
            'Gate Tower 1, Al Maryah Island', 'Level 28, Tower 1',
            'Abu Dhabi', 'Abu Dhabi', '94000', 'AE',
            'Level 28, Tower 1, Gate Tower 1, Al Maryah Island, Abu Dhabi 94000, UAE',
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_aeh_addr_id;
    END IF;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_aeh_bp_id, v_aeh_addr_id, 'default',
        true, '2010-07-01'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[002_athq_ext_parties] Customer CUS-ATHQ-AEH-001 seeded (id=%)', v_aeh_id;


    -- ══════════════════════════════════════════════════════════════════════════
    -- §5  CUSTOMER — Qatar National Properties LLC (QNP-001)
    --     Qatar government-linked real estate entity
    -- ══════════════════════════════════════════════════════════════════════════

    -- §5a  Business partner
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, description,
        registration_no, registration_country_code,
        website_url, external_ref, long_description,
        aliases, business_types, legal_form, founded_year,
        employee_count_band, annual_revenue_band,
        incorporation_date, tax_residence_country_code,
        tags, metadata, status, created_by
    )
    SELECT
        v_tenant_id,
        'QNP-001', 'Qatar National Properties LLC', 'QNP',
        'Qatar National Properties Limited Liability Company',
        'government',
        'Government-linked real estate development and property management entity in Qatar.',
        '22222222222', 'QA',
        'https://www.qnp.qa', 'CRM-CUS-QNP-0001',
        'Qatar National Properties LLC, established in 2002, is a government-linked real estate '
        'developer mandated to develop and manage national property assets. Major projects include '
        'the West Bay Diplomatic District, Lusail City infrastructure, and QNP Commercial Towers. '
        'Significant procurer of construction materials and project management services.',
        ARRAY['QNP', 'Qatar National Properties', 'QNP Real Estate'],
        ARRAY['real_estate', 'property_development', 'government_entity'],
        'government_entity', 2002,
        'e201_500', 'r100m_500m',
        '2002-01-15'::date, 'QA',
        '["real_estate","Qatar","government"]'::jsonb,
        jsonb_build_object(
            '_seed',              jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0','seeded_at',now()::text),
            'erp_codes',          jsonb_build_object('crm','300000002','legacy','QNP-001'),
            'account_management', jsonb_build_object('tier','standard','segment','government')
        ),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner WHERE tenant_id = v_tenant_id AND code = 'QNP-001'
    );
    SELECT id INTO v_qnp_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'QNP-001';

    -- §5a-ii  Customer role
    INSERT INTO master.customer (
        tenant_id, business_partner_id, customer_code,
        customer_type, is_key_account, risk_rating, status, created_by
    )
    SELECT v_tenant_id, v_qnp_bp_id, 'CUS-ATHQ-QNP-001',
           'government', false, 'medium', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer WHERE tenant_id = v_tenant_id AND customer_code = 'CUS-ATHQ-QNP-001'
    );
    SELECT id INTO v_qnp_id FROM master.customer
     WHERE tenant_id = v_tenant_id AND customer_code = 'CUS-ATHQ-QNP-001';

    -- §5b  Company code customer profile
    INSERT INTO master.company_code_customer_profile (
        tenant_id, customer_id, company_code_id,
        currency_code, credit_limit, credit_limit_currency_code, credit_rating,
        default_accounting_profile_id, default_receipt_method_id,
        tax_group_id, default_dimension_set_id,
        statement_cycle_code, dunning_policy_id,
        is_blocked, block_reason, metadata, status, created_by
    )
    SELECT
        v_tenant_id, v_qnp_id, v_cc_id,
        'AED', 5000000.0000, 'AED', 'bbb',
        v_acct_ar_id, NULL,
        NULL, NULL,
        'monthly', NULL,
        false, NULL,
        jsonb_build_object('_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
                           'notes', 'Government entity — no VAT applicable on sales. Monthly statements.'),
        'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code_customer_profile
         WHERE tenant_id = v_tenant_id AND customer_id = v_qnp_id AND company_code_id = v_cc_id
    );

    -- §5c  Party identifier (DUNS)
    INSERT INTO master.party_identifier (
        tenant_id, owner_type, owner_id, scheme, value,
        issuing_authority, issued_at, valid_until,
        is_verified, verified_at, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_qnp_bp_id,
           'duns', '222222222', 'Dun & Bradstreet', '2016-07-01'::date, NULL,
           true, now(), true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_identifier
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_qnp_bp_id AND scheme = 'duns'
    );

    -- §5d  Tax profile (Qatar)
    INSERT INTO master.party_tax_profile (
        tenant_id, owner_type, owner_id, country_code,
        penalty_information, discount_information, global_location_number,
        tax_classification, taxation_type,
        tax_id, state_tax_id, sales_tax_id, service_tax_id, regional_tax_id, vat_id,
        vat_registered, vat_registration_doc_id,
        has_tax_clearance, tax_clearance_number, tax_clearance_doc_id, tax_clearance_expiry_date,
        metadata, status, created_by
    )
    SELECT
        v_tenant_id, 'business_partner', v_qnp_bp_id, 'QA',
        NULL, NULL,
        '6340222222001',
        'government', 'exempt',
        'QA-GOV-TIN-2002-QNP-001', NULL, NULL, NULL, NULL, NULL,
        false, NULL,
        false, NULL, NULL, NULL,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_tax_profile
         WHERE tenant_id = v_tenant_id AND owner_type = 'business_partner'
           AND owner_id = v_qnp_bp_id AND country_code = 'QA'
    );

    -- §5e  Contact person
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id, company_code_id,
        contact_name, business_title, is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_qnp_bp_id, NULL,
           'Abdullah Jassim Al-Thani', 'Director of Finance', true,
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_qnp_bp_id AND contact_name = 'Abdullah Jassim Al-Thani'
    )
    RETURNING id INTO v_qnp_cp_id;

    IF v_qnp_cp_id IS NOT NULL THEN
        INSERT INTO master.party_contact_role (tenant_id, party_contact_person_id, role_code, created_by)
        VALUES (v_tenant_id, v_qnp_cp_id, 'finance_manager', v_sys)
        ON CONFLICT (tenant_id, party_contact_person_id, role_code) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value, purpose,
            is_primary, is_verified, verified_at, metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_qnp_bp_id, 'email',
         'a.althani@qnp.qa', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_qnp_bp_id, 'phone',
         '+97444123456', 'default',
         true, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_qnp_bp_id, 'email',
         'finance@qnp.qa', 'default',
         false, true, now(),
         '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    -- §5f  Governance
    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_qnp_bp_id,
           'director', 'Sheikh Jassim Hamad Al-Thani', 'individual',
           NULL, 'Chairman & Managing Director', NULL, NULL,
           '2002-01-15'::date, NULL, 'Government appointee. Board chairman.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_qnp_bp_id AND relation_type = 'director'
           AND member_name = 'Sheikh Jassim Hamad Al-Thani'
    );

    INSERT INTO master.party_governance_relation (
        tenant_id, party_type, party_id, relation_type, member_name, member_type,
        company_name, business_title, ownership_pct, share_class,
        appointed_date, end_of_term, notes, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_qnp_bp_id,
           'ubo', 'Qatar Investment Authority', 'organization',
           'Qatar Investment Authority', 'Sovereign Owner',
           100.0000, 'ordinary',
           '2002-01-15'::date, NULL,
           '100% government-owned. Ultimate beneficial owner is the State of Qatar via QIA.',
           '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_governance_relation
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_qnp_bp_id AND relation_type = 'ubo'
           AND member_name = 'Qatar Investment Authority'
    );

    -- §5g  Customer qualification
    INSERT INTO master.customer_qualification (
        tenant_id, customer_id,
        credit_status, credit_limit_band, credit_score, credit_rating,
        dso_days, payment_behavior, has_overdue_history,
        kyc_status, aml_sanctions_status, beneficial_owner_check_status,
        kyc_check_date, kyc_expiry_date,
        is_dunning_eligible, is_statement_eligible, dunning_hold_reason,
        last_credit_review_date, next_credit_review_date, reviewer_id,
        metadata, status, created_by
    )
    SELECT v_tenant_id, v_qnp_id,
           'conditional', 'aed_2m_10m', 710, 'bbb',
           45, 'good', false,
           'in_progress', 'clear', 'in_progress',
           '2025-04-01'::date, '2027-04-01'::date,
           false, true, 'KYC renewal and BOD documentation pending resubmission',
           '2025-04-01'::date, '2026-04-01'::date, v_sys,
           jsonb_build_object(
               '_seed', jsonb_build_object('pack','002_athq_ext_parties','version','1.0.0'),
               'credit_notes', 'Government entity. KYC renewal in progress. BOD documentation pending resubmission.'
           ),
           'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.customer_qualification WHERE tenant_id = v_tenant_id AND customer_id = v_qnp_id
    );

    -- §5h  Address (West Bay Diplomatic Area, Doha)
    SELECT id INTO v_qnp_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-qnp-wb-hq';
    IF v_qnp_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, city, region, postal_code, country_code, formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-qnp-wb-hq',
            'Qatar National Properties — West Bay HQ', 'commercial',
            'Attn: Finance Division',
            'Al Dafna Street, West Bay Diplomatic Area', 'QNP Tower, 15th Floor',
            'Doha', 'Ad Dawhah', '22435', 'QA',
            'QNP Tower, 15th Floor, Al Dafna Street, West Bay Diplomatic Area, Doha 22435, Qatar',
            '{"_seed":{"pack":"002_athq_ext_parties","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_qnp_addr_id;
    END IF;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES (
        v_tenant_id, 'business_partner', v_qnp_bp_id, v_qnp_addr_id, 'default',
        true, '2002-01-15'::date,
        '{"_seed":{"pack":"002_athq_ext_parties"}}'::jsonb, v_sys
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    RAISE NOTICE '[002_athq_ext_parties] Customer CUS-ATHQ-QNP-001 seeded (id=%)', v_qnp_id;
    RAISE NOTICE '[002_athq_ext_parties] Done — 3 suppliers + 2 customers seeded for ATHQ.';

END $athq_ext_parties$;
