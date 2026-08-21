-- Bridges profile_config to transaction_flow_template event codes (9 events total).
-- INVOICE_RECEIVED has creates_je=false on purpose — JE fires on ORDER_APPROVAL.
-- ADVANCE_RECOVERED is fired by a downstream invoice, not by the advance profile itself.

DO $seed_ap_events$
DECLARE
    v_cfg   record;
    v_sys   uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_STANDARD'
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_event (
            tenant_id, profile_config_id, event_code, event_name,
            creates_je, reverses_event, commitment_action, event_seq,
            status, created_by, metadata
        ) VALUES
            (v_cfg.tenant_id, v_cfg.config_id,
             'INVOICE_RECEIVED', 'Invoice received (draft)',
             false, NULL, 'NONE', 10,
             'active', v_sys,
             '{"description":"Invoice captured; no JE yet; awaits approval"}'::jsonb),

            (v_cfg.tenant_id, v_cfg.config_id,
             'ORDER_APPROVAL', 'Invoice approved & posted',
             true, NULL, 'NONE', 20,
             'active', v_sys,
             '{"description":"Posts AP JE: Dr Expense / Dr Input Tax / Cr AP Trade Payable / Cr WHT"}'::jsonb),

            (v_cfg.tenant_id, v_cfg.config_id,
             'SETTLEMENT', 'Payment posted',
             true, NULL, 'NONE', 30,
             'active', v_sys,
             '{"description":"Posts payment JE: Dr AP Trade Payable / Cr Bank Clearing (+ FX if applicable)"}'::jsonb)
        ON CONFLICT (profile_config_id, event_code) DO UPDATE SET
            event_name        = EXCLUDED.event_name,
            creates_je        = EXCLUDED.creates_je,
            reverses_event    = EXCLUDED.reverses_event,
            commitment_action = EXCLUDED.commitment_action,
            event_seq         = EXCLUDED.event_seq,
            status            = EXCLUDED.status,
            metadata          = EXCLUDED.metadata,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_CAPEX'
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_event (
            tenant_id, profile_config_id, event_code, event_name,
            creates_je, commitment_action, event_seq,
            status, created_by, metadata
        ) VALUES
            (v_cfg.tenant_id, v_cfg.config_id,
             'INVOICE_RECEIVED', 'CAPEX invoice received (draft)',
             false, 'NONE', 10, 'active', v_sys,
             '{"description":"CAPEX invoice captured; no JE yet"}'::jsonb),

            (v_cfg.tenant_id, v_cfg.config_id,
             'ORDER_APPROVAL', 'CAPEX invoice posted',
             true, 'NONE', 20, 'active', v_sys,
             '{"description":"Posts: Dr Fixed Asset (or CWIP) / Dr Input Tax / Cr AP Trade Payable"}'::jsonb),

            (v_cfg.tenant_id, v_cfg.config_id,
             'SETTLEMENT', 'CAPEX payment posted',
             true, 'NONE', 30, 'active', v_sys,
             '{"description":"Posts: Dr AP Trade Payable / Cr Bank Clearing"}'::jsonb)
        ON CONFLICT (profile_config_id, event_code) DO UPDATE SET
            event_name        = EXCLUDED.event_name,
            creates_je        = EXCLUDED.creates_je,
            reverses_event    = EXCLUDED.reverses_event,
            commitment_action = EXCLUDED.commitment_action,
            event_seq         = EXCLUDED.event_seq,
            status            = EXCLUDED.status,
            metadata          = EXCLUDED.metadata,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_ADVANCE_SUPPLIER'
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_event (
            tenant_id, profile_config_id, event_code, event_name,
            creates_je, commitment_action, event_seq,
            status, created_by, metadata
        ) VALUES
            (v_cfg.tenant_id, v_cfg.config_id,
             'ADVANCE_PAID', 'Advance payment to supplier',
             true, 'NONE', 10, 'active', v_sys,
             '{"description":"Posts: Dr AP Advance (asset) / Cr Bank Clearing"}'::jsonb),

            (v_cfg.tenant_id, v_cfg.config_id,
             'ADVANCE_RECOVERED', 'Advance recovered by invoice',
             true, 'NONE', 20, 'active', v_sys,
             '{"description":"Fired by downstream invoice that deducts advance: Dr AP Trade Payable / Cr AP Advance"}'::jsonb)
        ON CONFLICT (profile_config_id, event_code) DO UPDATE SET
            event_name        = EXCLUDED.event_name,
            creates_je        = EXCLUDED.creates_je,
            reverses_event    = EXCLUDED.reverses_event,
            commitment_action = EXCLUDED.commitment_action,
            event_seq         = EXCLUDED.event_seq,
            status            = EXCLUDED.status,
            metadata          = EXCLUDED.metadata,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_RETENTION_RELEASE'
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_event (
            tenant_id, profile_config_id, event_code, event_name,
            creates_je, commitment_action, event_seq,
            status, created_by, metadata
        ) VALUES
            (v_cfg.tenant_id, v_cfg.config_id,
             'RETENTION_RELEASED', 'Retention released to supplier',
             true, 'NONE', 10, 'active', v_sys,
             '{"description":"Posts: Dr AP Retention Payable / Cr Bank Clearing"}'::jsonb)
        ON CONFLICT (profile_config_id, event_code) DO UPDATE SET
            event_name        = EXCLUDED.event_name,
            creates_je        = EXCLUDED.creates_je,
            reverses_event    = EXCLUDED.reverses_event,
            commitment_action = EXCLUDED.commitment_action,
            event_seq         = EXCLUDED.event_seq,
            status            = EXCLUDED.status,
            metadata          = EXCLUDED.metadata,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    RAISE NOTICE 'blueprint/040_acct_profile_events: % events across % configs',
        (SELECT count(*) FROM control.acct_profile_event ape
           JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
           JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
          WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                            'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')),
        (SELECT count(*) FROM control.acct_profile_config apc
           JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
          WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                            'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE'));
END $seed_ap_events$;
