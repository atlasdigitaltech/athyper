-- ============================================================================
-- FILE: demo/001_supplier_profile.sql
-- Purpose: Create 1 demo supplier profile + tax groups for tenant 'athyper'
--          and company_code 'AUIC'. Prerequisite for all scenario files.
-- Idempotent: all inserts use WHERE NOT EXISTS / ON CONFLICT DO NOTHING
-- ============================================================================

DO $demo_supplier_setup$
DECLARE
    v_tenant_id      uuid;
    v_cc_id          uuid;
    v_sys            uuid := '00000000-0000-0000-0000-000000000000';
    v_bp_id          uuid;
    v_supplier_id      uuid;
    v_scp_id         uuid;
    v_bp_addr_id     uuid;
    v_bp_cp_id       uuid;
    v_apc_std_id     uuid;
    v_acct_prof_id   uuid;
    v_pm_wire_id     uuid;
    v_house_bank_id  uuid;
    v_bank_link_id   uuid;
    v_tg_vat_id      uuid;
    v_tg_wht_id      uuid;
    v_tt_vat_id      uuid;
    v_tt_wht_id      uuid;
    v_trs_vat_id     uuid;
    v_trs_wht_id     uuid;
    v_jur_id         uuid;
    v_pt_net30_id    uuid;
BEGIN

    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant athyper not found — run base tenant provisioning first';
    END IF;

    SELECT id INTO v_cc_id FROM master.company_code
     WHERE tenant_id = v_tenant_id AND code = 'AUIC';
    IF v_cc_id IS NULL THEN
        RAISE EXCEPTION 'Company code AUIC not found in tenant athyper';
    END IF;

    -- ── 1a. Business partner (identity root) ───────────────────────────────
    INSERT INTO master.business_partner (
        tenant_id, code, name, legal_name,
        partner_category, registration_country_code,
        status, created_by
    )
    SELECT v_tenant_id, 'ACME-CONSULT-US', 'Acme Consulting LLC',
           'Acme Consulting Limited Liability Company',
           'organization', 'US', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner
         WHERE tenant_id = v_tenant_id AND code = 'ACME-CONSULT-US'
    );

    SELECT id INTO v_bp_id FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'ACME-CONSULT-US';

    -- ── 1b. Supplier role (thin AP record) ─────────────────────────────────
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code,
        supplier_type, status, created_by
    )
    SELECT v_tenant_id, v_bp_id, 'ACME-CONSULT-US',
           'general', 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.supplier
         WHERE tenant_id = v_tenant_id AND supplier_code = 'ACME-CONSULT-US'
    );

    SELECT id INTO v_supplier_id FROM master.supplier
     WHERE tenant_id = v_tenant_id AND supplier_code = 'ACME-CONSULT-US';

    -- ── 2. Tax jurisdiction (US federal) ────────────────────────────────────
    SELECT id INTO v_jur_id FROM master.tax_jurisdiction
     WHERE tenant_id = v_tenant_id AND code = 'US-FED';
    IF v_jur_id IS NULL THEN
        INSERT INTO master.tax_jurisdiction (
            tenant_id, code, name, jurisdiction_type, country_code, status, created_by
        ) VALUES (v_tenant_id, 'US-FED', 'US Federal', 'COUNTRY', 'US', 'active', v_sys)
        RETURNING id INTO v_jur_id;
    END IF;

    -- ── 3. Tax types: VAT (INDIRECT) + WHT (WITHHOLDING) ────────────────────
    SELECT id INTO v_tt_vat_id FROM master.tax_type
     WHERE tenant_id = v_tenant_id AND code = 'VAT-STD';
    IF v_tt_vat_id IS NULL THEN
        INSERT INTO master.tax_type (
            tenant_id, code, name, category, is_recoverable, status, created_by
        ) VALUES (v_tenant_id, 'VAT-STD', 'Standard VAT/GST',
                  'INDIRECT', true, 'active', v_sys)
        RETURNING id INTO v_tt_vat_id;
    END IF;

    SELECT id INTO v_tt_wht_id FROM master.tax_type
     WHERE tenant_id = v_tenant_id AND code = 'WHT-CONSULT';
    IF v_tt_wht_id IS NULL THEN
        INSERT INTO master.tax_type (
            tenant_id, code, name, category, is_deducted_at_source, status, created_by
        ) VALUES (v_tenant_id, 'WHT-CONSULT', 'WHT on Consulting Services',
                  'WITHHOLDING', true, 'active', v_sys)
        RETURNING id INTO v_tt_wht_id;
    END IF;

    -- ── 4. Tax rate schedules (7% VAT, 10% WHT) ─────────────────────────────
    SELECT id INTO v_trs_vat_id FROM control.tax_rate_schedule
     WHERE tenant_id = v_tenant_id
       AND jurisdiction_id = v_jur_id
       AND tax_type_id = v_tt_vat_id
       AND tax_direction = 'PURCHASE'
       AND COALESCE(component_code,'') = 'MAIN'
     LIMIT 1;
    IF v_trs_vat_id IS NULL THEN
        INSERT INTO control.tax_rate_schedule (
            tenant_id, jurisdiction_id, tax_type_id, tax_direction,
            component_code, rate_kind, rate_value,
            recoverability_mode, recoverability_percent,
            calculation_basis, rounding_stage,
            effective_from, status, created_by
        ) VALUES (
            v_tenant_id, v_jur_id, v_tt_vat_id, 'PURCHASE',
            'MAIN', 'PERCENT', 7.00,
            'FULL', 100.00,
            'LINE_NET', 'LINE',
            CURRENT_DATE, 'active', v_sys
        ) RETURNING id INTO v_trs_vat_id;
    END IF;

    SELECT id INTO v_trs_wht_id FROM control.tax_rate_schedule
     WHERE tenant_id = v_tenant_id
       AND jurisdiction_id = v_jur_id
       AND tax_type_id = v_tt_wht_id
       AND tax_direction = 'PAYMENT'
       AND COALESCE(component_code,'') = 'MAIN'
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
            v_tenant_id, v_jur_id, v_tt_wht_id, 'PAYMENT',
            'MAIN', 'PERCENT', 10.00,
            'NONE',
            'LINE_NET', 'LINE',
            'GROSS', true,
            CURRENT_DATE, 'active', v_sys
        ) RETURNING id INTO v_trs_wht_id;
    END IF;

    -- ── 5. Tax groups bundling the schedules ────────────────────────────────
    SELECT id INTO v_tg_vat_id FROM control.tax_group
     WHERE tenant_id = v_tenant_id AND code = 'VAT_STD_US_7PCT';
    IF v_tg_vat_id IS NULL THEN
        INSERT INTO control.tax_group (
            tenant_id, code, name, status, created_by
        ) VALUES (v_tenant_id, 'VAT_STD_US_7PCT', 'US Standard VAT 7%',
                  'active', v_sys)
        RETURNING id INTO v_tg_vat_id;

        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, rate_override, status, created_by
        ) VALUES (
            v_tenant_id, v_tg_vat_id, v_trs_vat_id,
            10, NULL, 'active', v_sys
        );
    END IF;

    SELECT id INTO v_tg_wht_id FROM control.tax_group
     WHERE tenant_id = v_tenant_id AND code = 'WHT_CONSULT_10PCT';
    IF v_tg_wht_id IS NULL THEN
        INSERT INTO control.tax_group (
            tenant_id, code, name, status, created_by
        ) VALUES (v_tenant_id, 'WHT_CONSULT_10PCT', 'WHT on Consulting 10%',
                  'active', v_sys)
        RETURNING id INTO v_tg_wht_id;

        INSERT INTO control.tax_group_component (
            tenant_id, tax_group_id, tax_rate_schedule_id,
            calculation_seq, rate_override, status, created_by
        ) VALUES (
            v_tenant_id, v_tg_wht_id, v_trs_wht_id,
            10, NULL, 'active', v_sys
        );
    END IF;

    -- ── 6. Payment method (WIRE-USD, OUTBOUND) ──────────────────────────────
    SELECT id INTO v_pm_wire_id FROM master.payment_method
     WHERE tenant_id = v_tenant_id AND code = 'WIRE-USD';
    IF v_pm_wire_id IS NULL THEN
        INSERT INTO master.payment_method (
            tenant_id, code, name, direction, instrument_mode,
            status, created_by
        ) VALUES (
            v_tenant_id, 'WIRE-USD', 'USD Wire Transfer', 'outbound', 'bank_transfer',
            'active', v_sys
        ) RETURNING id INTO v_pm_wire_id;
    END IF;

    -- ── 7. Company house bank + link (purpose=disbursement) ─────────────────
    -- Assumes base pack has created at least one master.bank_account. If this
    -- fails for new tenants, create via master.bank_account INSERT here first.
    SELECT ba.id INTO v_house_bank_id
      FROM master.bank_account ba
     WHERE ba.tenant_id = v_tenant_id
       AND ba.currency_code = 'USD'
       AND ba.status = 'active'
     LIMIT 1;

    IF v_house_bank_id IS NOT NULL THEN
        SELECT id INTO v_bank_link_id FROM master.bank_account_link
         WHERE tenant_id = v_tenant_id
           AND bank_account_id = v_house_bank_id
           AND owner_type = 'company_code'
           AND owner_id = v_cc_id
           AND purpose = 'disbursement'
         LIMIT 1;

        IF v_bank_link_id IS NULL THEN
            INSERT INTO master.bank_account_link (
                tenant_id, bank_account_id, owner_type, owner_id,
                company_code_id, purpose, is_primary,
                effective_from, created_by
            ) VALUES (
                v_tenant_id, v_house_bank_id, 'company_code', v_cc_id,
                v_cc_id, 'disbursement', true,
                CURRENT_DATE, v_sys
            ) RETURNING id INTO v_bank_link_id;
        END IF;
    END IF;

    -- ── 8. Supplier profile (company_code × supplier) ───────────────────────
    SELECT id INTO v_acct_prof_id FROM master.accounting_profile
     WHERE tenant_id = v_tenant_id AND code = 'AP_NON_PO_STANDARD';

    SELECT id INTO v_pt_net30_id
      FROM master.payment_term
     WHERE tenant_id = v_tenant_id
       AND code = 'PT-NET30'
       AND is_current_version = true
     LIMIT 1;

    SELECT id INTO v_scp_id FROM master.company_code_supplier_profile
     WHERE tenant_id = v_tenant_id
       AND supplier_id = v_supplier_id
       AND company_code_id = v_cc_id;

    IF v_scp_id IS NULL THEN
        INSERT INTO master.company_code_supplier_profile (
            tenant_id, supplier_id, company_code_id,
            payment_term_id, currency_code,
            default_accounting_profile_id,
            payment_method_id,
            preferred_remittance_bank_link_id,
            tax_group_id,
            default_wht_tax_group_id,
            is_blocked, status, created_by
        ) VALUES (
            v_tenant_id, v_supplier_id, v_cc_id,
            v_pt_net30_id, 'USD',
            v_acct_prof_id,
            v_pm_wire_id,
            NULL,
            v_tg_vat_id,
            v_tg_wht_id,
            false, 'active', v_sys
        );
    ELSE
        -- Backfill payment_term_id for existing profile rows (new UUID FK column)
        UPDATE master.company_code_supplier_profile
           SET payment_term_id = COALESCE(payment_term_id, v_pt_net30_id)
         WHERE id = v_scp_id
           AND payment_term_id IS NULL;
    END IF;

    -- ── 9. Address at BP level ────────────────────────────────────────────────
    -- Create a single canonical address for ACME-CONSULT-US and link it to the
    -- business_partner as 'legal' + 'default'. fn_resolve_party_address will
    -- fall through to these BP links when no supplier-role address is present.
    SELECT id INTO v_bp_addr_id FROM master.address
     WHERE tenant_id = v_tenant_id AND code = 'addr-acme-nyc-hq';
    IF v_bp_addr_id IS NULL THEN
        INSERT INTO master.address (
            tenant_id, code, name, address_type,
            attention_line,
            line1, city, region, postal_code, country_code,
            formatted_address,
            metadata, status, created_by
        ) VALUES (
            v_tenant_id, 'addr-acme-nyc-hq',
            'Acme Consulting LLC — New York HQ',
            'commercial',
            'Attn: Accounts Payable',
            '350 Fifth Avenue, Suite 4810',
            'New York', 'NY', '10118', 'US',
            '350 Fifth Avenue, Suite 4810, New York, NY 10118, USA',
            '{"_seed":{"pack":"ap_non_po_demo"}}'::jsonb,
            'active', v_sys
        ) RETURNING id INTO v_bp_addr_id;
    END IF;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, metadata, created_by
    ) VALUES
    (v_tenant_id, 'business_partner', v_bp_id, v_bp_addr_id, 'legal',
     true, CURRENT_DATE, '{"_seed":{"pack":"ap_non_po_demo"}}'::jsonb, v_sys),
    (v_tenant_id, 'business_partner', v_bp_id, v_bp_addr_id, 'default',
     true, CURRENT_DATE, '{"_seed":{"pack":"ap_non_po_demo"}}'::jsonb, v_sys)
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    -- ── 10. Contact at BP level ───────────────────────────────────────────────
    INSERT INTO master.party_contact_person (
        tenant_id, party_type, party_id,
        company_code_id, contact_name, business_title,
        is_primary, metadata, status, created_by
    )
    SELECT v_tenant_id, 'business_partner', v_bp_id,
           NULL, 'Jane Doe', 'AP Contact',
           true,
           '{"_seed":{"pack":"ap_non_po_demo"}}'::jsonb, 'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.party_contact_person
         WHERE tenant_id = v_tenant_id AND party_type = 'business_partner'
           AND party_id = v_bp_id AND contact_name = 'Jane Doe'
    )
    RETURNING id INTO v_bp_cp_id;

    IF v_bp_cp_id IS NOT NULL THEN
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id,
            channel_type, value, purpose,
            is_primary, is_verified, verified_at,
            metadata, status, created_by
        ) VALUES
        (v_tenant_id, 'business_partner', v_bp_id,
         'email', 'ap@acmeconsulting.com', 'notification',
         true, true, now(),
         '{"_seed":{"pack":"ap_non_po_demo"}}'::jsonb, 'active', v_sys),
        (v_tenant_id, 'business_partner', v_bp_id,
         'phone', '+12125551234', 'notification',
         true, true, now(),
         '{"_seed":{"pack":"ap_non_po_demo"}}'::jsonb, 'active', v_sys)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'demo/001: supplier ACME-CONSULT-US + profile for AUIC set up';
END $demo_supplier_setup$;
