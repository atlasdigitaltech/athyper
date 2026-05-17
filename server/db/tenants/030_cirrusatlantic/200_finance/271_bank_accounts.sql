-- =============================================================================
-- 030_cirrusatlantic/200_finance/271_bank_accounts.sql
-- Primary house bank for CirrusAtlantic Ltd (CATL) — GBP operating account.
--
-- Seeds:
--   bank_account          — Barclays Bank PLC, GBP current account (IBAN)
--   bank_account_link     — CATL company-code ownership, purpose = default
--   bank_account_house_config — GL-mapped, default disbursement + collection
--
-- Stable IDs:
--   bank_account : ee001030-0000-0000-0000-000000000001
--   company_code : ee000030-0000-0000-0000-000000000001  (CATL, from 200_legal_entities.sql)
--
-- Idempotent: Yes — ON CONFLICT / NOT EXISTS guards
-- Depends:    100_org_structure/200_legal_entities.sql,
--             200_finance/201_company_chart_assignments.sql
-- =============================================================================

DO $catl_bank$
DECLARE
    v_su    uuid        := '00000000-0000-0000-0000-000000000000';
    v_tid   uuid;
    v_now   timestamptz := now();
    v_meta  jsonb       := '{"_seed":{"batch":"271_bank_accounts","version":"1.0.0"}}'::jsonb;

    v_ba_id uuid := 'ee001030-0000-0000-0000-000000000001';
    v_cc_id uuid := 'ee000030-0000-0000-0000-000000000001';  -- CATL company code
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[271_bank_accounts] CirrusAtlantic tenant not found';
    END IF;

    -- ── 1. Bank Account ───────────────────────────────────────────────────────
    INSERT INTO master.bank_account (
        id, tenant_id,
        code, name, account_holder_name,
        account_id_type, account_id_value, account_last4,
        currency_code,
        account_nature,
        bic_override, bank_name_override, bank_country_override,
        is_verified, verified_at,
        metadata, status, created_by, created_at
    ) VALUES (
        v_ba_id, v_tid,
        'ba-catl-gbp-01',
        'CirrusAtlantic — Barclays GBP ••••0801',
        'CirrusAtlantic Ltd',
        'iban', 'GB29BARC20000058110801', '0801',
        'GBP',
        'direct',
        'BARCGB22', 'Barclays Bank PLC', 'GB',
        true, v_now,
        v_meta, 'active', v_su, v_now
    )
    ON CONFLICT (id) DO NOTHING;

    -- ── 2. Bank Account Link (CATL company-code ownership) ───────────────────
    INSERT INTO master.bank_account_link (
        tenant_id, owner_type, owner_id,
        bank_account_id, company_code_id,
        purpose, is_primary,
        effective_from, metadata, created_by, created_at
    ) VALUES (
        v_tid, 'company_code', v_cc_id,
        v_ba_id, v_cc_id,
        'default', true,
        '2024-01-01', v_meta, v_su, v_now
    )
    ON CONFLICT DO NOTHING;

    -- ── 3. House Config ───────────────────────────────────────────────────────
    INSERT INTO master.bank_account_house_config (
        tenant_id, bank_account_link_id, gl_account_id,
        account_nickname, local_account_type, usage_type,
        is_disbursement_enabled, is_collection_enabled,
        is_default_disbursement, is_default_collection,
        priority, is_manual_payment_allowed, is_payment_file_allowed,
        reconciliation_mode, metadata, status, created_by, created_at
    )
    SELECT
        v_tid,
        bal.id,
        (
            SELECT gl_account_id
            FROM master.mv_company_postable_account
            WHERE company_code_id = v_cc_id
              AND account_code IN ('IFRS-A-CASH-LOCAL', 'USGAAP-A-CASH-CHECKING')
            ORDER BY CASE account_code WHEN 'IFRS-A-CASH-LOCAL' THEN 1 ELSE 2 END
            LIMIT 1
        ),
        'CirrusAtlantic — Barclays GBP ••••0801',
        'current',
        'disbursement',
        true, true,         -- disbursement + collection enabled
        true, true,         -- default for both
        1::smallint,
        true, true,         -- manual + file (BACS) payments allowed
        'manual',
        v_meta, 'active', v_su, v_now
    FROM master.bank_account_link bal
    WHERE bal.tenant_id      = v_tid
      AND bal.bank_account_id = v_ba_id
      AND bal.owner_type     = 'company_code'
      AND NOT EXISTS (
          SELECT 1 FROM master.bank_account_house_config bahc
          WHERE bahc.tenant_id          = v_tid
            AND bahc.bank_account_link_id = bal.id
      );

    RAISE NOTICE '[271_bank_accounts] CirrusAtlantic: 1 bank account + link + house config seeded for CATL (Barclays GBP)';
END $catl_bank$;
