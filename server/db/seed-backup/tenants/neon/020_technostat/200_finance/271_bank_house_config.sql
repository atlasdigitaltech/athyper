-- =============================================================================
-- 020_technostat/200_finance/271_bank_house_config.sql
-- House-bank config backfill for Technostat Group's 4 primary bank accounts.
--
-- The bank accounts and links were created in 004_technostat_finance_controls.sql
-- (P07). This file registers those accounts as company-code house banks with
-- their GL cash account assignments.
--
-- Companies:
--   TKSA  → Riyad Bank SAR  (dd001000-...-0001) → IFRS-A-CASH-LOCAL
--   SSK   → Riyad Bank SAR  (dd001000-...-0002) → IFRS-A-CASH-LOCAL
--   TEGY  → Banque Misr EGP (dd001000-...-0003) → IFRS-A-CASH-LOCAL
--   SDTX  → Banque Misr EGP (dd001000-...-0004) → IFRS-A-CASH-LOCAL
--
-- Each is the sole account for its company code — marked as default for both
-- disbursement and collection at priority 1.
--
-- Idempotent: Yes — NOT EXISTS guard
-- Depends:    004_technostat_finance_controls.sql (P07),
--             200_finance/201_company_chart_assignments.sql
-- =============================================================================

DO $tks_bahc$
DECLARE
    v_su   uuid        := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_now  timestamptz := now();
    v_meta jsonb       := '{"_seed":{"batch":"271_bank_house_config","version":"1.0.0"}}'::jsonb;
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[271_bank_house_config] Technostat tenant not found';
    END IF;

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
            WHERE company_code_id = bal.owner_id
              AND account_code IN ('IFRS-A-CASH-LOCAL', 'USGAAP-A-CASH-CHECKING')
            ORDER BY CASE account_code WHEN 'IFRS-A-CASH-LOCAL' THEN 1 ELSE 2 END
            LIMIT 1
        ),
        ba.name,
        'current',
        'disbursement',
        true,           -- is_disbursement_enabled
        true,           -- is_collection_enabled
        true,           -- is_default_disbursement
        true,           -- is_default_collection
        1::smallint,
        true,           -- is_manual_payment_allowed
        true,           -- is_payment_file_allowed
        'manual',
        v_meta, 'active', v_su, v_now
    FROM master.bank_account_link bal
    JOIN master.bank_account ba
      ON ba.id        = bal.bank_account_id
     AND ba.tenant_id = v_tid
    WHERE bal.tenant_id  = v_tid
      AND bal.owner_type = 'company_code'
      AND ba.id = ANY(ARRAY[
          'dd001000-0000-0000-0000-000000000001'::uuid,
          'dd001000-0000-0000-0000-000000000002'::uuid,
          'dd001000-0000-0000-0000-000000000003'::uuid,
          'dd001000-0000-0000-0000-000000000004'::uuid
      ])
      AND NOT EXISTS (
          SELECT 1 FROM master.bank_account_house_config bahc
          WHERE bahc.tenant_id          = v_tid
            AND bahc.bank_account_link_id = bal.id
      );

    RAISE NOTICE '[271_bank_house_config] Technostat: house configs seeded for 4 primary bank accounts';
END $tks_bahc$;
