-- ============================================================================
-- UNIVERSAL — DIRECT-OPS BUSINESS INTENTS (Layer B verification guard)
-- ============================================================================
-- File:     021b_business_intents_direct_ops.sql
-- Schema:   master.business_intent
-- Purpose:  Verify 9 direct-operations intents (COGS + MRO + production CAPEX)
--           and their GL account / asset-profile defaults are fully resolved.
--           All 9 intents are seeded by 021_business_intents.sql (Layer A).
--           This file is a prerequisite guard for 022b, 026b, and industry packs
--           that reference COGS or production-CAPEX intent codes.
-- Depends:  021_business_intents.sql          (intents + GL defaults)
--           211_framework_ifrs_accounts.sql    (COA-IFRS accounts)
--           020b_spend_categories_direct_ops.sql (Layer B categories)
-- Idempotent: Yes — read-only; no writes
-- Spec ref: §5 Business Intent Taxonomy — Layer B extension
-- ============================================================================
-- OPT-IN: Run manually after default provisioning (021_business_intents.sql).
--         Required before running 022b, 026b, and direct-ops industry packs.
-- ============================================================================
-- VERIFIED (all owned/seeded by 021_base):
--   BI-OPEX-MRO        — Maintenance parts, tools, repair supplies → IFRS-E-GA-REPAIR
--   BI-CAPEX-EQUIP     — Production equipment                      → IFRS-A-FA-PLANT / PLANT
--   BI-CAPEX-MACH      — Heavy machinery, CNC, automated systems   → IFRS-A-FA-PLANT / PLANT
--   BI-CAPEX-TOOL      — Dies, moulds, jigs, special tooling       → IFRS-A-FA-TOOLS / TOOLS
--   BI-COGS-MAT        — Raw materials consumed in production      → IFRS-E-COGS-MAT
--   BI-COGS-SUB        — Contract manufacturing / assembly         → IFRS-E-COGS-SUB
--   BI-COGS-LABOUR     — Production wages and shift allowances     → IFRS-E-COGS-LABOUR
--   BI-COGS-OH         — Factory overhead / indirect production    → IFRS-E-COGS-OH
--   BI-COGS-FREIGHT    — Inbound/outbound freight tied to sales    → IFRS-E-COGS-FREIGHT
-- ============================================================================

DO $seed$
DECLARE
    v_tid       uuid;
    v_coa_id    uuid;
    v_gaap_coa_id uuid;
    v_ifrs_ready boolean := false;
    v_gaap_ready boolean := false;
    v_missing   text;
    v_no_gl     text;
    v_no_gaap_gl text;
    v_no_asset  text;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── STAGE B: Verify domain root prerequisites ────────────────────────
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-OPEX') THEN
        RAISE EXCEPTION '[021_base_direct_ops] BI-OPEX root not found — run 021_business_intents.sql first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-CAPEX') THEN
        RAISE EXCEPTION '[021_base_direct_ops] BI-CAPEX root not found — run 021_business_intents.sql first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION '[021_base_direct_ops] BI-COGS root not found — run 021_business_intents.sql first';
    END IF;

    -- ── STAGE C: Verify all 9 required direct-ops intents exist ─────────
    -- These are owned by 021_base — do NOT re-insert here; doing so would
    -- overwrite their _seed.pack metadata tag and break 021_base assertions.
    SELECT string_agg(required.code, ', ' ORDER BY required.code)
    INTO   v_missing
    FROM (VALUES
        ('BI-OPEX-MRO'),
        ('BI-CAPEX-EQUIP'),
        ('BI-CAPEX-MACH'),
        ('BI-CAPEX-TOOL'),
        ('BI-COGS-MAT'),
        ('BI-COGS-SUB'),
        ('BI-COGS-LABOUR'),
        ('BI-COGS-OH'),
        ('BI-COGS-FREIGHT')
    ) AS required(code)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_intent bi
        WHERE bi.tenant_id = v_tid AND bi.code = required.code
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[021_base_direct_ops] Required direct-ops intents missing '
                        '(must be seeded by 021_business_intents.sql): %', v_missing;
    END IF;

    -- ── STAGE D: Verify asset_profile_code on the 3 production CAPEX intents
    SELECT string_agg(bi.code, ', ' ORDER BY bi.code)
    INTO   v_no_asset
    FROM master.business_intent bi
    WHERE bi.tenant_id = v_tid
      AND bi.code = ANY(ARRAY['BI-CAPEX-EQUIP','BI-CAPEX-MACH','BI-CAPEX-TOOL'])
      AND bi.default_asset_profile_code IS NULL;

    IF v_no_asset IS NOT NULL THEN
        RAISE EXCEPTION '[021_base_direct_ops] Production CAPEX intents missing asset_profile_code: %. '
                        'Re-run 021_business_intents.sql to populate.', v_no_asset;
    END IF;

    -- ── STAGE E: Verify GL account defaults (requires COA-IFRS) ─────────
    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS';

    SELECT id INTO v_gaap_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-GAAP';

    v_ifrs_ready := v_coa_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
            ('IFRS-E-GA-REPAIR'),
            ('IFRS-A-FA-PLANT'),
            ('IFRS-A-FA-TOOLS'),
            ('IFRS-E-COGS-MAT'),
            ('IFRS-E-COGS-SUB'),
            ('IFRS-E-COGS-LABOUR'),
            ('IFRS-E-COGS-OH'),
            ('IFRS-E-COGS-FREIGHT')
        ) AS required(code)
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.gl_account a
            WHERE a.tenant_id = v_tid
              AND a.chart_of_account_id = v_coa_id
              AND a.code = required.code
              AND a.is_active = true
              AND a.node_type = 'posting'
              AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true
        )
    );

    v_gaap_ready := v_gaap_coa_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
            ('USGAAP-E-GA-REPAIR'),
            ('USGAAP-A-FA-MACH'),
            ('USGAAP-E-COGS-MAT'),
            ('USGAAP-E-COGS-SUB'),
            ('USGAAP-E-COGS-LABOR'),
            ('USGAAP-E-COGS-OH'),
            ('USGAAP-E-COGS-FREIGHT')
        ) AS required(code)
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.gl_account a
            WHERE a.tenant_id = v_tid
              AND a.chart_of_account_id = v_gaap_coa_id
              AND a.code = required.code
              AND a.is_active = true
              AND a.node_type = 'posting'
              AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true
        )
    );

    IF NOT v_ifrs_ready THEN
        RAISE WARNING '[021_base_direct_ops] COA-IFRS accounts not ready - skipping IFRS GL default verification. '
                      '211_framework_ifrs_accounts.sql plus 213_business_intent_coa_defaults.sql will populate '
                      'default_gl_account_id after the operating COA is loaded.';
    ELSE
        -- Identify any direct-ops intents that still have NULL GL defaults
        SELECT string_agg(bi.code, ', ' ORDER BY bi.code)
        INTO   v_no_gl
        FROM master.business_intent bi
        WHERE bi.tenant_id = v_tid
          AND bi.code = ANY(ARRAY[
                'BI-OPEX-MRO',
                'BI-CAPEX-EQUIP',
                'BI-CAPEX-MACH',
                'BI-CAPEX-TOOL',
                'BI-COGS-MAT',
                'BI-COGS-SUB',
                'BI-COGS-LABOUR',
                'BI-COGS-OH',
                'BI-COGS-FREIGHT'
              ])
          AND bi.default_gl_account_id IS NULL;

        IF v_no_gl IS NOT NULL THEN
            RAISE WARNING '[021_base_direct_ops] Direct-ops intents missing IFRS GL account defaults: %. '
                          '213_business_intent_coa_defaults.sql will backfill them after COA-IFRS is loaded.',
                v_no_gl;
        ELSE

        -- Spot-check: confirm expected GL codes are mapped correctly
        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent bi
            JOIN master.gl_account a
              ON a.id                  = bi.default_gl_account_id
             AND a.tenant_id           = v_tid
             AND a.chart_of_account_id = v_coa_id
            WHERE bi.tenant_id = v_tid
              AND bi.code       = 'BI-COGS-MAT'
              AND a.code        = 'IFRS-E-COGS-MAT'
        ) THEN
            RAISE EXCEPTION '[021_base_direct_ops] BI-COGS-MAT GL default does not point to '
                            'IFRS-E-COGS-MAT — possible COA mismatch or seed data corruption.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent bi
            JOIN master.gl_account a
              ON a.id                  = bi.default_gl_account_id
             AND a.tenant_id           = v_tid
             AND a.chart_of_account_id = v_coa_id
            WHERE bi.tenant_id = v_tid
              AND bi.code       = 'BI-CAPEX-EQUIP'
              AND a.code        = 'IFRS-A-FA-PLANT'
        ) THEN
            RAISE EXCEPTION '[021_base_direct_ops] BI-CAPEX-EQUIP GL default does not point to '
                            'IFRS-A-FA-PLANT — possible COA mismatch or seed data corruption.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent bi
            JOIN master.gl_account a
              ON a.id                  = bi.default_gl_account_id
             AND a.tenant_id           = v_tid
             AND a.chart_of_account_id = v_coa_id
            WHERE bi.tenant_id = v_tid
              AND bi.code       = 'BI-OPEX-MRO'
              AND a.code        = 'IFRS-E-GA-REPAIR'
        ) THEN
            RAISE EXCEPTION '[021_base_direct_ops] BI-OPEX-MRO GL default does not point to '
                            'IFRS-E-GA-REPAIR — possible COA mismatch or seed data corruption.';
        END IF;

        RAISE NOTICE '[021_base_direct_ops] GL spot-checks passed: '
                     'BI-COGS-MAT→IFRS-E-COGS-MAT, '
                     'BI-CAPEX-EQUIP→IFRS-A-FA-PLANT, '
                     'BI-OPEX-MRO→IFRS-E-GA-REPAIR';
        END IF;
    END IF;

    IF NOT v_gaap_ready THEN
        RAISE WARNING '[021_base_direct_ops] COA-GAAP accounts not ready - skipping US GAAP semantic default verification. '
                      '212_framework_gaap_accounts.sql plus 213_business_intent_coa_defaults.sql will populate '
                      'metadata._coa_defaults.usgaap_code after the operating COA is loaded.';
    ELSE
        SELECT string_agg(bi.code, ', ' ORDER BY bi.code)
        INTO   v_no_gaap_gl
        FROM master.business_intent bi
        WHERE bi.tenant_id = v_tid
          AND bi.code = ANY(ARRAY[
                'BI-OPEX-MRO',
                'BI-CAPEX-EQUIP',
                'BI-CAPEX-MACH',
                'BI-CAPEX-TOOL',
                'BI-COGS-MAT',
                'BI-COGS-SUB',
                'BI-COGS-LABOUR',
                'BI-COGS-OH',
                'BI-COGS-FREIGHT'
              ])
          AND NOT EXISTS (
                SELECT 1
                FROM master.gl_account ga
                WHERE ga.tenant_id = v_tid
                  AND ga.chart_of_account_id = v_gaap_coa_id
                  AND ga.code = bi.metadata #>> '{_coa_defaults,usgaap_code}'
                  AND ga.is_active = true
                  AND ga.node_type = 'posting'
                  AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
          );

        IF v_no_gaap_gl IS NOT NULL THEN
            RAISE WARNING '[021_base_direct_ops] Direct-ops intents missing US GAAP semantic GL defaults: %. '
                          '213_business_intent_coa_defaults.sql will backfill them after COA-GAAP is loaded.',
                v_no_gaap_gl;
        ELSE

        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent bi
            JOIN master.gl_account a
              ON a.tenant_id = v_tid
             AND a.chart_of_account_id = v_gaap_coa_id
             AND a.code = bi.metadata #>> '{_coa_defaults,usgaap_code}'
            WHERE bi.tenant_id = v_tid
              AND bi.code = 'BI-COGS-MAT'
              AND a.code = 'USGAAP-E-COGS-MAT'
        ) THEN
            RAISE EXCEPTION '[021_base_direct_ops] BI-COGS-MAT US GAAP default does not point to USGAAP-E-COGS-MAT.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent bi
            JOIN master.gl_account a
              ON a.tenant_id = v_tid
             AND a.chart_of_account_id = v_gaap_coa_id
             AND a.code = bi.metadata #>> '{_coa_defaults,usgaap_code}'
            WHERE bi.tenant_id = v_tid
              AND bi.code = 'BI-CAPEX-EQUIP'
              AND a.code = 'USGAAP-A-FA-MACH'
        ) THEN
            RAISE EXCEPTION '[021_base_direct_ops] BI-CAPEX-EQUIP US GAAP default does not point to USGAAP-A-FA-MACH.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM master.business_intent bi
            JOIN master.gl_account a
              ON a.tenant_id = v_tid
             AND a.chart_of_account_id = v_gaap_coa_id
             AND a.code = bi.metadata #>> '{_coa_defaults,usgaap_code}'
            WHERE bi.tenant_id = v_tid
              AND bi.code = 'BI-OPEX-MRO'
              AND a.code = 'USGAAP-E-GA-REPAIR'
        ) THEN
            RAISE EXCEPTION '[021_base_direct_ops] BI-OPEX-MRO US GAAP default does not point to USGAAP-E-GA-REPAIR.';
        END IF;

        RAISE NOTICE '[021_base_direct_ops] US GAAP semantic GL spot-checks passed: '
                     'BI-COGS-MAT->USGAAP-E-COGS-MAT, '
                     'BI-CAPEX-EQUIP->USGAAP-A-FA-MACH, '
                     'BI-OPEX-MRO->USGAAP-E-GA-REPAIR';
        END IF;
    END IF;

    RAISE NOTICE '[021_base_direct_ops] All 9 direct-ops intents verified '
                 '(BI-OPEX-MRO, BI-CAPEX-EQUIP/MACH/TOOL, BI-COGS-MAT/SUB/LABOUR/OH/FREIGHT). '
                 'Asset profiles: 3 CAPEX intents confirmed. GL: %.',
        CASE
            WHEN NOT v_ifrs_ready AND NOT v_gaap_ready THEN 'SKIPPED (COA-IFRS/COA-GAAP accounts not ready)'
            WHEN v_no_gl IS NOT NULL AND v_no_gaap_gl IS NOT NULL THEN 'PENDING 213 backfill for IFRS and US GAAP'
            WHEN v_no_gl IS NOT NULL THEN 'US GAAP 9/9 resolved; IFRS pending 213 backfill'
            WHEN v_no_gaap_gl IS NOT NULL THEN 'IFRS 9/9 resolved; US GAAP pending 213 backfill'
            WHEN NOT v_ifrs_ready THEN 'US GAAP 9/9 resolved; IFRS skipped'
            WHEN NOT v_gaap_ready THEN 'IFRS 9/9 resolved; US GAAP skipped'
            ELSE 'IFRS 9/9 + US GAAP 9/9 resolved'
        END;

END $seed$;
