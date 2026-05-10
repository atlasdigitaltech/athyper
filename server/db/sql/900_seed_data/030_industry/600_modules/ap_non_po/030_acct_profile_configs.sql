-- ============================================================================
-- FILE: blueprint/030_acct_profile_configs.sql
-- Purpose: Create versioned acct_profile_config rows for each accounting_profile
-- Depends on: master.accounting_profile (020_accounting_profiles.sql)
--             control.acct_profile_config
-- Idempotent: ON CONFLICT (accounting_profile_id, version) DO NOTHING
-- ============================================================================
-- Each profile gets exactly one config row at version=1, status='active'.
-- Fields:
--   direction       = INBOUND (AP-facing)
--   profile_type    = STANDARD for normal invoicing; PREPAYMENT for AP_ADVANCE_SUPPLIER
--   subledger_type  = AP
--   applicable_flow_codes   = which transaction_flow_template codes this config applies to
--   applicable_doc_types    = which document types it applies to
--   recognition_timing      = IMMEDIATE (no deferral)
--   matching_type           = NONE (Non-PO invoices are not 3-way matched)
-- ============================================================================

DO $seed_ap_configs$
DECLARE
    v_tenant   record;
    v_prof     record;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_today    date := CURRENT_DATE;
BEGIN
    FOR v_tenant IN
        SELECT id AS tenant_id FROM master.tenant WHERE status = 'active'
    LOOP
        -- ── AP_NON_PO_STANDARD ────────────────────────────────────────────────
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
            ON CONFLICT (accounting_profile_id, version) DO NOTHING;
        END IF;

        -- ── AP_NON_PO_CAPEX ───────────────────────────────────────────────────
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
            ON CONFLICT (accounting_profile_id, version) DO NOTHING;
        END IF;

        -- ── AP_ADVANCE_SUPPLIER ─────────────────────────────────────────────────
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
            ON CONFLICT (accounting_profile_id, version) DO NOTHING;
        END IF;

        -- ── AP_RETENTION_RELEASE ──────────────────────────────────────────────
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
            ON CONFLICT (accounting_profile_id, version) DO NOTHING;
        END IF;

    END LOOP;

    RAISE NOTICE 'blueprint/030_acct_profile_configs: seeded for % tenants',
        (SELECT count(*) FROM master.tenant WHERE status = 'active');
END $seed_ap_configs$;
