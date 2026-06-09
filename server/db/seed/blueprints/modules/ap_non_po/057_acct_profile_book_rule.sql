-- ============================================================================
-- FILE: blueprint/057_acct_profile_book_rule.sql
-- Purpose: Per-book posting behaviour for all AP Non-PO profiles
-- Depends on: control.acct_profile_config (030_acct_profile_configs.sql)
-- Idempotent: ON CONFLICT (profile_config_id, book_code) DO UPDATE
-- ============================================================================
-- Seeds one IFRS MIRROR rule per profile (posting_method = MIRROR).
-- MIRROR = engine generates identical journal entries in the IFRS book as the
-- primary book — no account remapping required for standard IFRS AP treatment.
--
-- Companies running dual books (IFRS + LOCAL_GAAP) add a second row per
-- profile via admin UI or a separate tenant-specific seed file.
-- ============================================================================

DO $seed_ap_book_rules$
DECLARE
    v_cfg  record;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id, ap.code AS profile_code
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                           'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_book_rule (
            tenant_id, profile_config_id,
            book_code, posting_method, account_mapping, applies_to_events,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            'IFRS', 'MIRROR', '{}', NULL,
            'active', v_sys,
            jsonb_build_object(
                'description',
                format('IFRS primary book — MIRROR all events for profile %s', v_cfg.profile_code))
        )
        ON CONFLICT (profile_config_id, book_code) DO UPDATE SET
            posting_method    = EXCLUDED.posting_method,
            account_mapping   = EXCLUDED.account_mapping,
            applies_to_events = EXCLUDED.applies_to_events,
            status            = EXCLUDED.status,
            metadata          = EXCLUDED.metadata,
            updated_at        = now(),
            updated_by        = v_sys;
    END LOOP;

    RAISE NOTICE 'blueprint/057_acct_profile_book_rule: upserted IFRS MIRROR rules for tenant %', v_tid;
END $seed_ap_book_rules$;
