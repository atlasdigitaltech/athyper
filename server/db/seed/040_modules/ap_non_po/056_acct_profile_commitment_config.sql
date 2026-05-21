-- ============================================================================
-- FILE: blueprint/056_acct_profile_commitment_config.sql
-- Purpose: Commitment / encumbrance behaviour per AP Non-PO profile
-- Depends on: control.acct_profile_config (030_acct_profile_configs.sql)
-- Idempotent: ON CONFLICT (profile_config_id) DO UPDATE
-- ============================================================================
-- AP_NON_PO_STANDARD   — creates_commitment=true; obligation at approval; released on SETTLEMENT
-- AP_NON_PO_CAPEX      — creates_commitment=true; capital obligation; released on SETTLEMENT
-- AP_ADVANCE_SUPPLIER  — creates_commitment=true; 100% prepayment; released on ADVANCE_RECOVERED
-- AP_RETENTION_RELEASE — creates_commitment=false; releases existing retention encumbrance
-- ============================================================================

DO $seed_ap_commitment$
DECLARE
    v_cfg  record;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── AP_NON_PO_STANDARD ────────────────────────────────────────────────
    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_STANDARD'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_commitment_config (
            tenant_id, profile_config_id,
            creates_commitment, commitment_type,
            releases_commitment_on, encumbrance_behavior,
            multi_year_strategy,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            true, 'ONE_TIME',
            'SETTLEMENT', 'STANDARD',
            'CURRENT_YEAR_ONLY',
            'active', v_sys,
            '{"description":"OPEX Non-PO — obligation created at invoice approval; encumbrance released on payment settlement"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            creates_commitment      = EXCLUDED.creates_commitment,
            commitment_type         = EXCLUDED.commitment_type,
            releases_commitment_on  = EXCLUDED.releases_commitment_on,
            encumbrance_behavior    = EXCLUDED.encumbrance_behavior,
            multi_year_strategy     = EXCLUDED.multi_year_strategy,
            advance_pct             = EXCLUDED.advance_pct,
            advance_recovery_method = EXCLUDED.advance_recovery_method,
            retention_pct           = EXCLUDED.retention_pct,
            retention_release_event = EXCLUDED.retention_release_event,
            status                  = EXCLUDED.status,
            metadata                = EXCLUDED.metadata,
            updated_at              = now(),
            updated_by              = v_sys;
    END LOOP;

    -- ── AP_NON_PO_CAPEX ───────────────────────────────────────────────────
    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_NON_PO_CAPEX'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_commitment_config (
            tenant_id, profile_config_id,
            creates_commitment, commitment_type,
            releases_commitment_on, encumbrance_behavior,
            multi_year_strategy,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            true, 'ONE_TIME',
            'SETTLEMENT', 'STANDARD',
            'CURRENT_YEAR_ONLY',
            'active', v_sys,
            '{"description":"CAPEX Non-PO — capital obligation at invoice approval; encumbrance released on payment"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            creates_commitment      = EXCLUDED.creates_commitment,
            commitment_type         = EXCLUDED.commitment_type,
            releases_commitment_on  = EXCLUDED.releases_commitment_on,
            encumbrance_behavior    = EXCLUDED.encumbrance_behavior,
            multi_year_strategy     = EXCLUDED.multi_year_strategy,
            advance_pct             = EXCLUDED.advance_pct,
            advance_recovery_method = EXCLUDED.advance_recovery_method,
            retention_pct           = EXCLUDED.retention_pct,
            retention_release_event = EXCLUDED.retention_release_event,
            status                  = EXCLUDED.status,
            metadata                = EXCLUDED.metadata,
            updated_at              = now(),
            updated_by              = v_sys;
    END LOOP;

    -- ── AP_ADVANCE_SUPPLIER ───────────────────────────────────────────────
    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_ADVANCE_SUPPLIER'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_commitment_config (
            tenant_id, profile_config_id,
            creates_commitment, commitment_type,
            releases_commitment_on, encumbrance_behavior,
            multi_year_strategy,
            advance_pct, advance_recovery_method,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            true, 'ONE_TIME',
            'ADVANCE_RECOVERED', 'STANDARD',
            'CURRENT_YEAR_ONLY',
            100.00, 'INVOICE_DEDUCTION',
            'active', v_sys,
            '{"description":"Advance — 100% prepayment commitment; encumbrance released via ADVANCE_RECOVERED event on downstream invoice"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            creates_commitment      = EXCLUDED.creates_commitment,
            commitment_type         = EXCLUDED.commitment_type,
            releases_commitment_on  = EXCLUDED.releases_commitment_on,
            encumbrance_behavior    = EXCLUDED.encumbrance_behavior,
            multi_year_strategy     = EXCLUDED.multi_year_strategy,
            advance_pct             = EXCLUDED.advance_pct,
            advance_recovery_method = EXCLUDED.advance_recovery_method,
            retention_pct           = EXCLUDED.retention_pct,
            retention_release_event = EXCLUDED.retention_release_event,
            status                  = EXCLUDED.status,
            metadata                = EXCLUDED.metadata,
            updated_at              = now(),
            updated_by              = v_sys;
    END LOOP;

    -- ── AP_RETENTION_RELEASE ──────────────────────────────────────────────
    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code = 'AP_RETENTION_RELEASE'
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        INSERT INTO control.acct_profile_commitment_config (
            tenant_id, profile_config_id,
            creates_commitment, commitment_type,
            releases_commitment_on, encumbrance_behavior,
            multi_year_strategy,
            retention_release_event,
            status, created_by, metadata
        ) VALUES (
            v_cfg.tenant_id, v_cfg.config_id,
            false, 'RETENTION_RELEASE',
            'RETENTION_RELEASED', 'NONE',
            'CURRENT_YEAR_ONLY',
            'RETENTION_RELEASED',
            'active', v_sys,
            '{"description":"Retention release — no new commitment; releases existing AP Retention Payable encumbrance on RETENTION_RELEASED event"}'::jsonb
        )
        ON CONFLICT (profile_config_id) DO UPDATE SET
            creates_commitment      = EXCLUDED.creates_commitment,
            commitment_type         = EXCLUDED.commitment_type,
            releases_commitment_on  = EXCLUDED.releases_commitment_on,
            encumbrance_behavior    = EXCLUDED.encumbrance_behavior,
            multi_year_strategy     = EXCLUDED.multi_year_strategy,
            advance_pct             = EXCLUDED.advance_pct,
            advance_recovery_method = EXCLUDED.advance_recovery_method,
            retention_pct           = EXCLUDED.retention_pct,
            retention_release_event = EXCLUDED.retention_release_event,
            status                  = EXCLUDED.status,
            metadata                = EXCLUDED.metadata,
            updated_at              = now(),
            updated_by              = v_sys;
    END LOOP;

    RAISE NOTICE 'blueprint/056_acct_profile_commitment_config: upserted commitment configs for tenant %', v_tid;
END $seed_ap_commitment$;
