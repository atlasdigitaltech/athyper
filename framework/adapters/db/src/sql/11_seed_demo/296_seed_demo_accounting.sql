/* ============================================================================
   Athyper v2.1 — Accounting Profiles Seed (Blueprint-Based)
   Table: fin.accounting_profile
   Dependencies: core.tenant, fin.operating_unit (entity_code discovery)

   Profiles define hidden posting intelligence — how transactions auto-generate
   journal entries (debit/credit patterns, GL account mappings).

   Base profiles (all blueprints): AP-OPEX, AP-CAPEX, AP-TRAVEL, AP-VENDOR-PMT
   Extended profiles (C/D/E/F): + AP-INTERCOMPANY, AP-DEPRECIATION
   ============================================================================ */

-- ============================================================================
-- Helper: upsert accounting profile
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_acct_profile(
    p_tenant uuid, p_entity_code text, p_code text, p_name text,
    p_desc text, p_intent_filter jsonb, p_posting_pattern jsonb
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.accounting_profile (
        id, tenant_id, entity_code, code, name, description,
        intent_filter, posting_pattern
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, p_code, p_name, p_desc,
        p_intent_filter, p_posting_pattern
    )
    ON CONFLICT (tenant_id, entity_code, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Base profiles (seeded for every entity_code)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_base_profiles(p_tenant uuid, p_entity_code text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM pg_temp.upsert_acct_profile(p_tenant, p_entity_code,
        'AP-OPEX', 'Operating Expense Profile',
        'Standard operating expense posting: Dr Expense, Cr AP/Cash',
        '{"domains": ["OPEX"]}'::jsonb,
        '{"lines": [{"side": "DEBIT", "account_resolve": "intent.default_gl_account"}, {"side": "CREDIT", "account_resolve": "2110"}]}'::jsonb
    );

    PERFORM pg_temp.upsert_acct_profile(p_tenant, p_entity_code,
        'AP-CAPEX', 'Capital Expenditure Profile',
        'Capital expenditure posting: Dr Asset/WIP, Cr AP',
        '{"domains": ["CAPEX"]}'::jsonb,
        '{"lines": [{"side": "DEBIT", "account_resolve": "intent.default_gl_account", "fallback": "1250"}, {"side": "CREDIT", "account_resolve": "2110"}]}'::jsonb
    );

    PERFORM pg_temp.upsert_acct_profile(p_tenant, p_entity_code,
        'AP-TRAVEL', 'Travel & Entertainment Profile',
        'Travel expense posting: Dr T&E expense, Cr Employee advances / AP',
        '{"subtypes": ["TRAVEL"]}'::jsonb,
        '{"lines": [{"side": "DEBIT", "account_resolve": "6400"}, {"side": "CREDIT", "account_resolve": "1160", "fallback": "2110"}]}'::jsonb
    );

    PERFORM pg_temp.upsert_acct_profile(p_tenant, p_entity_code,
        'AP-VENDOR-PMT', 'Vendor Payment Profile',
        'Vendor payment posting: Dr AP, Cr Cash/Bank',
        '{"domains": ["OPEX", "CAPEX"]}'::jsonb,
        '{"lines": [{"side": "DEBIT", "account_resolve": "2110"}, {"side": "CREDIT", "account_resolve": "1110"}], "trigger": "payment"}'::jsonb
    );
END $fn$;

-- ============================================================================
-- Extended profiles (C/D/E/F only)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_extended_profiles(p_tenant uuid, p_entity_code text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM pg_temp.upsert_acct_profile(p_tenant, p_entity_code,
        'AP-INTERCOMPANY', 'Intercompany Transfer Profile',
        'IC transfer posting: Dr IC Receivable, Cr IC Payable (mirror entity)',
        '{"domains": ["TRANSFER"], "subtypes": ["INTERCOMPANY"]}'::jsonb,
        '{"lines": [{"side": "DEBIT", "account_resolve": "1900"}, {"side": "CREDIT", "account_resolve": "2900"}], "mirror": true}'::jsonb
    );

    PERFORM pg_temp.upsert_acct_profile(p_tenant, p_entity_code,
        'AP-DEPRECIATION', 'Depreciation Profile',
        'Periodic depreciation: Dr Depreciation expense, Cr Accumulated depreciation',
        '{"domains": ["ADMIN"], "subtypes": ["ADJUSTMENT"]}'::jsonb,
        '{"lines": [{"side": "DEBIT", "account_resolve": "6800"}, {"side": "CREDIT", "account_resolve": "1220"}], "trigger": "period_close"}'::jsonb
    );
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_code   text;
    v_entity text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Discover entity_codes for this tenant
        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Base profiles for all blueprints
            PERFORM pg_temp.seed_base_profiles(v_tenant, v_entity);

            -- Extended profiles for C/D/E/F only
            IF v_code IN ('demo_fr','demo_de','demo_us','demo_ch','demo_ca') THEN
                PERFORM pg_temp.seed_extended_profiles(v_tenant, v_entity);
            END IF;
        END LOOP;

        RAISE NOTICE 'Accounting profiles seeded for tenant %', v_code;
    END LOOP;
END $$;
