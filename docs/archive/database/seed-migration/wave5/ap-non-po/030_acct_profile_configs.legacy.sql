-- Versioned acct_profile_config for each AP Non-PO profile (one v1/active row each).
-- AP_ADVANCE_SUPPLIER uses profile_type=PREPAYMENT; others STANDARD/CAPITALIZATION.
-- matching_type=NONE because Non-PO invoices are not 3-way matched.

DO $seed_ap_configs$
DECLARE
    v_tenant   record;
    v_prof     record;
    v_tid      uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_today    date := CURRENT_DATE;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active') THEN
        RAISE EXCEPTION '[seed] active tenant % not found', v_tid;
    END IF;

    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE id = v_tid AND status = 'active'
    LOOP
        SELECT id, tenant_id INTO v_prof
          FROM master.accounting_profile
         WHERE tenant_id = v_tenant.tenant_id AND code = 'AP_NON_PO_STANDARD';

        IF v_prof.id IS NOT NULL THEN
            INSERT INTO control.acct_profile_config (
                tenant_id, accounting_profile_id,
                direction, profile_type, subledger_type,
                applicable_flow_codes, applicable_doc_types,
                recognition_timing, matching_type,
                tax_treatment, is_reverse_charge,
                version, effective_from, status, created_by,
                metadata
            ) VALUES (
                v_tenant.tenant_id, v_prof.id,
                'INBOUND', 'STANDARD', 'AP',
                ARRAY['NON_PO'],
                ARRAY['STANDARD','CREDIT_NOTE','DEBIT_NOTE'],
                'IMMEDIATE', 'NONE',
                'STANDARD', false,
                1, v_today, 'active', v_sys,
                jsonb_build_object(
                    'supports_wht',      true,
                    'supports_vat',      true,
                    'supports_retention', false)
            )
            ON CONFLICT (accounting_profile_id, version) DO UPDATE SET
                direction             = EXCLUDED.direction,
                profile_type          = EXCLUDED.profile_type,
                subledger_type        = EXCLUDED.subledger_type,
                applicable_flow_codes = EXCLUDED.applicable_flow_codes,
                applicable_doc_types  = EXCLUDED.applicable_doc_types,
                recognition_timing    = EXCLUDED.recognition_timing,
                matching_type         = EXCLUDED.matching_type,
                tax_treatment         = EXCLUDED.tax_treatment,
                is_reverse_charge     = EXCLUDED.is_reverse_charge,
                status                = EXCLUDED.status,
                metadata              = EXCLUDED.metadata,
                updated_at            = now(),
                updated_by            = v_sys;
        END IF;

        SELECT id, tenant_id INTO v_prof
          FROM master.accounting_profile
         WHERE tenant_id = v_tenant.tenant_id AND code = 'AP_NON_PO_CAPEX';

        IF v_prof.id IS NOT NULL THEN
            INSERT INTO control.acct_profile_config (
                tenant_id, accounting_profile_id,
                direction, profile_type, subledger_type,
                applicable_flow_codes, applicable_doc_types,
                recognition_timing, matching_type,
                tax_treatment, is_reverse_charge,
                version, effective_from, status, created_by,
                metadata
            ) VALUES (
                v_tenant.tenant_id, v_prof.id,
                'INBOUND', 'CAPITALIZATION', 'AP',
                ARRAY['NON_PO'],
                ARRAY['STANDARD','CREDIT_NOTE'],
                'IMMEDIATE', 'NONE',
                'STANDARD', false,
                1, v_today, 'active', v_sys,
                jsonb_build_object(
                    'capitalizes_to',    'CWIP',
                    'supports_vat',      true,
                    'supports_wht',      true)
            )
            ON CONFLICT (accounting_profile_id, version) DO UPDATE SET
                direction             = EXCLUDED.direction,
                profile_type          = EXCLUDED.profile_type,
                subledger_type        = EXCLUDED.subledger_type,
                applicable_flow_codes = EXCLUDED.applicable_flow_codes,
                applicable_doc_types  = EXCLUDED.applicable_doc_types,
                recognition_timing    = EXCLUDED.recognition_timing,
                matching_type         = EXCLUDED.matching_type,
                tax_treatment         = EXCLUDED.tax_treatment,
                is_reverse_charge     = EXCLUDED.is_reverse_charge,
                status                = EXCLUDED.status,
                metadata              = EXCLUDED.metadata,
                updated_at            = now(),
                updated_by            = v_sys;
        END IF;

        SELECT id, tenant_id INTO v_prof
          FROM master.accounting_profile
         WHERE tenant_id = v_tenant.tenant_id AND code = 'AP_ADVANCE_SUPPLIER';

        IF v_prof.id IS NOT NULL THEN
            INSERT INTO control.acct_profile_config (
                tenant_id, accounting_profile_id,
                direction, profile_type, subledger_type,
                applicable_flow_codes, applicable_doc_types,
                recognition_timing, matching_type,
                tax_treatment, is_reverse_charge,
                version, effective_from, status, created_by,
                metadata
            ) VALUES (
                v_tenant.tenant_id, v_prof.id,
                'INBOUND', 'PREPAYMENT', 'AP',
                ARRAY['NON_PO','PURCHASE_CONTRACT','DIRECT_PURCHASE'],
                ARRAY['ADVANCE','DOWN_PAYMENT'],
                'IMMEDIATE', 'NONE',
                'NONE', false,
                1, v_today, 'active', v_sys,
                jsonb_build_object(
                    'creates_advance_balance', true,
                    'recovered_via',           'ADVANCE_RECOVERED')
            )
            ON CONFLICT (accounting_profile_id, version) DO UPDATE SET
                direction             = EXCLUDED.direction,
                profile_type          = EXCLUDED.profile_type,
                subledger_type        = EXCLUDED.subledger_type,
                applicable_flow_codes = EXCLUDED.applicable_flow_codes,
                applicable_doc_types  = EXCLUDED.applicable_doc_types,
                recognition_timing    = EXCLUDED.recognition_timing,
                matching_type         = EXCLUDED.matching_type,
                tax_treatment         = EXCLUDED.tax_treatment,
                is_reverse_charge     = EXCLUDED.is_reverse_charge,
                status                = EXCLUDED.status,
                metadata              = EXCLUDED.metadata,
                updated_at            = now(),
                updated_by            = v_sys;
        END IF;

        SELECT id, tenant_id INTO v_prof
          FROM master.accounting_profile
         WHERE tenant_id = v_tenant.tenant_id AND code = 'AP_RETENTION_RELEASE';

        IF v_prof.id IS NOT NULL THEN
            INSERT INTO control.acct_profile_config (
                tenant_id, accounting_profile_id,
                direction, profile_type, subledger_type,
                applicable_flow_codes, applicable_doc_types,
                recognition_timing, matching_type,
                tax_treatment, is_reverse_charge,
                version, effective_from, status, created_by,
                metadata
            ) VALUES (
                v_tenant.tenant_id, v_prof.id,
                'INBOUND', 'STANDARD', 'AP',
                ARRAY['PURCHASE_CONTRACT','NON_PO'],
                ARRAY['RETENTION_RELEASE'],
                'IMMEDIATE', 'NONE',
                'NONE', false,
                1, v_today, 'active', v_sys,
                jsonb_build_object(
                    'releases_retention_payable', true,
                    'fires_on_event',             'RETENTION_RELEASED')
            )
            ON CONFLICT (accounting_profile_id, version) DO UPDATE SET
                direction             = EXCLUDED.direction,
                profile_type          = EXCLUDED.profile_type,
                subledger_type        = EXCLUDED.subledger_type,
                applicable_flow_codes = EXCLUDED.applicable_flow_codes,
                applicable_doc_types  = EXCLUDED.applicable_doc_types,
                recognition_timing    = EXCLUDED.recognition_timing,
                matching_type         = EXCLUDED.matching_type,
                tax_treatment         = EXCLUDED.tax_treatment,
                is_reverse_charge     = EXCLUDED.is_reverse_charge,
                status                = EXCLUDED.status,
                metadata              = EXCLUDED.metadata,
                updated_at            = now(),
                updated_by            = v_sys;
        END IF;

    END LOOP;

    RAISE NOTICE 'blueprint/030_acct_profile_configs: seeded for tenant %', v_tid;
END $seed_ap_configs$;
