-- ============================================================================
-- TECHNOSTAT — PAY GROUPS
-- ============================================================================
-- File:     018_pay_groups.sql
-- Schema:   master.pay_group
-- Purpose:  Create one monthly pay group per Technostat company code.
--           KSA entities (TKSA, SSK) pay in SAR; Egypt entities (TEGY, SDTX)
--           pay in EGP — aligned to each company's functional currency.
--
-- Pay groups (4):
--   TKSA-PG-STAFF  Technostat KSA Staff     monthly  SAR  SA
--   SSK-PG-STAFF   SSK Saudi Staff          monthly  SAR  SA
--   TEGY-PG-STAFF  Technostat Egypt Staff   monthly  EGP  EG
--   SDTX-PG-STAFF  Satellites DT Staff      monthly  EGP  EG
--
-- Depends:  003_technostat_production_seed.sql
--             → company codes: TKSA · SSK · TEGY · SDTX
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE throughout
-- ============================================================================

DO $tksa_pay_groups$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;

    v_cc_tksa  uuid;  v_le_tksa  uuid;
    v_cc_ssk   uuid;  v_le_ssk   uuid;
    v_cc_tegy  uuid;  v_le_tegy  uuid;
    v_cc_sdtx  uuid;  v_le_sdtx  uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[018_pay_groups] Technostat tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ── company codes & their legal entities ──────────────────────────────────
    SELECT cc.id, cc.legal_entity_id INTO v_cc_tksa, v_le_tksa
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'TKSA';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_ssk, v_le_ssk
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'SSK';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_tegy, v_le_tegy
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'TEGY';

    SELECT cc.id, cc.legal_entity_id INTO v_cc_sdtx, v_le_sdtx
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'SDTX';

    -- ── TKSA — Technostat Group KSA (SAR · monthly) ───────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'TKSA-PG-STAFF', 'Technostat KSA Staff Pay',
        v_le_tksa, v_cc_tksa, 'monthly', 'SAR', 'SA', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── SSK — SSK Saudi (SAR · monthly) ──────────────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'SSK-PG-STAFF', 'SSK Saudi Staff Pay',
        v_le_ssk, v_cc_ssk, 'monthly', 'SAR', 'SA', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── TEGY — Technostat Egypt (EGP · monthly) ───────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'TEGY-PG-STAFF', 'Technostat Egypt Staff Pay',
        v_le_tegy, v_cc_tegy, 'monthly', 'EGP', 'EG', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    -- ── SDTX — Satellites DT Egypt (EGP · monthly) ───────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES (
        v_tid, 'SDTX-PG-STAFF', 'Satellites DT Staff Pay',
        v_le_sdtx, v_cc_sdtx, 'monthly', 'EGP', 'EG', 'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    RAISE NOTICE '[018_pay_groups] 4 pay groups seeded (TKSA, SSK, TEGY, SDTX)';

END $tksa_pay_groups$;
