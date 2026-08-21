-- ============================================================================
-- DEMO — PAY GROUPS
-- ============================================================================
-- File:     900_principals/009_pay_groups.sql
-- Schema:   master.pay_group
-- Purpose:  Create pay groups for all five Athyper demo company codes.
--           ATHQ carries two groups (executive + staff) to support pay-structure
--           demos; the four subsidiaries each carry one staff group aligned to
--           their functional currency and local pay cycle.
--
-- Pay groups (6):
--   ATHQ-PG-EXEC   Group Executive      monthly   AED  AE
--   ATHQ-PG-STAFF  Group Staff          monthly   AED  AE
--   AQTU-PG-STAFF  Qatar Utilities      monthly   QAR  QA
--   ASAC-PG-STAFF  Saudi Construction   monthly   SAR  SA
--   AUIC-PG-STAFF  US InfoComm          bi_weekly USD  US
--   ASGF-PG-STAFF  Singapore Financial  monthly   SGD  SG
--
-- Depends:  200_demo_legal_entities.sql, 201_athyper_subsidiaries.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE throughout
-- ============================================================================

DO $demo_pay_groups$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;

    v_cc_athq  uuid;  v_le_athq  uuid;
    v_cc_aqtu  uuid;  v_le_aqtu  uuid;
    v_cc_asac  uuid;  v_le_asac  uuid;
    v_cc_auic  uuid;  v_le_auic  uuid;
    v_cc_asgf  uuid;  v_le_asgf  uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[009_pay_groups] Athyper demo tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ── company codes & their legal entities ──────────────────────────────────
    SELECT cc.id, cc.legal_entity_id INTO v_cc_athq, v_le_athq
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'ATHQ';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_aqtu, v_le_aqtu
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'AQTU';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_asac, v_le_asac
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'ASAC';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_auic, v_le_auic
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'AUIC';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_asgf, v_le_asgf
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'ASGF';

    -- ── ATHQ — Group HQ (AED · monthly) ──────────────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES
        (v_tid, 'ATHQ-PG-EXEC',  'Group Executive Pay',
         v_le_athq, v_cc_athq, 'monthly', 'AED', 'AE', 'active', v_su),
        (v_tid, 'ATHQ-PG-STAFF', 'Group Staff Pay',
         v_le_athq, v_cc_athq, 'monthly', 'AED', 'AE', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── AQTU — Qatar Utilities (QAR · monthly) ────────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'AQTU-PG-STAFF', 'Qatar Utilities Staff Pay',
        v_le_aqtu, v_cc_aqtu, 'monthly', 'QAR', 'QA', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── ASAC — Saudi Construction (SAR · monthly) ─────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'ASAC-PG-STAFF', 'Saudi Construction Staff Pay',
        v_le_asac, v_cc_asac, 'monthly', 'SAR', 'SA', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── AUIC — US InfoComm (USD · bi-weekly) ──────────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'AUIC-PG-STAFF', 'US InfoComm Staff Pay',
        v_le_auic, v_cc_auic, 'bi_weekly', 'USD', 'US', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── ASGF — Singapore Financial (SGD · monthly) ────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'ASGF-PG-STAFF', 'Singapore Financial Staff Pay',
        v_le_asgf, v_cc_asgf, 'monthly', 'SGD', 'SG', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    RAISE NOTICE '[009_pay_groups] 6 pay groups seeded (ATHQ×2, AQTU, ASAC, AUIC, ASGF)';

END $demo_pay_groups$;
