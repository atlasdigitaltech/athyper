-- ============================================================================
-- FILE: blueprint/040_acct_profile_events.sql
-- Purpose: Bridge profile_config → transaction_flow_template event_code
-- Depends on: control.acct_profile_config (030), transaction_flow_template events
-- Idempotent: ON CONFLICT (profile_config_id, event_code) DO NOTHING
-- ============================================================================
-- Events registered per profile:
--
-- AP_NON_PO_STANDARD:
--   INVOICE_RECEIVED   → creates_je=false (informational only; JE fires on approval)
--   ORDER_APPROVAL     → creates_je=true  (invoice post — the AP JE)
--   SETTLEMENT         → creates_je=true  (payment post — AP→Bank Clearing)
--
-- AP_NON_PO_CAPEX:
--   Same 3 events — only the entry templates differ (Dr Fixed Asset vs Dr Expense)
--
-- AP_ADVANCE_SUPPLIER:
--   ADVANCE_PAID       → creates_je=true  (advance post — AP Advance asset created)
--
-- AP_RETENTION_RELEASE:
--   RETENTION_RELEASED → creates_je=true  (retention release payment — Dr AP Retention / Cr Bank)
-- ============================================================================

DO $seed_ap_events$
DECLARE
    v_cfg   record;
    v_sys   uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    -- ────────────────────────────────────────────────────────────────────────
    -- AP_NON_PO_STANDARD events
    -- ────────────────────────────────────────────────────────────────────────
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

    -- ────────────────────────────────────────────────────────────────────────
    -- AP_NON_PO_CAPEX events (same 3 events, different entry templates later)
    -- ────────────────────────────────────────────────────────────────────────
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

    -- ────────────────────────────────────────────────────────────────────────
    -- AP_ADVANCE_SUPPLIER events
    -- ────────────────────────────────────────────────────────────────────────
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

    -- ────────────────────────────────────────────────────────────────────────
    -- AP_RETENTION_RELEASE events
    -- ────────────────────────────────────────────────────────────────────────
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
