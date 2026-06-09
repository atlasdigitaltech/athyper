-- ============================================================================
-- UNIVERSAL — PRE-SEED FOUNDATION
-- ============================================================================
-- File:     019_pre_seed_foundation.sql
-- Schemas:  control.lookup_value, control.commodity_classification_config
-- Purpose:  Prerequisites that MUST land before any Tier 2 seed file executes
-- Depends:  platform/099_tenant_bootstrap (tenant must exist),
--           platform/000_lookups (cc_provenance lookup must exist)
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE
-- Spec ref: §7.5 (provenance prerequisite), §2 (execution order)
-- ============================================================================
-- Execution order: 019 → 020 → 021 → 025 → 022 → 023 → 024 → 026
-- This file MUST run before 023 (commodity bridge) and all pack files.
-- ============================================================================
-- FIX B1: The platform's cc_provenance lookup does NOT include 'seed'.
--         Without it, trg_cc_provenance_lookup rejects all bridge rows
--         with provenance = 'seed'. This INSERT adds the missing value.
--
-- FIX B2: control.commodity_classification_config — 1-row tenant foundation that
--         locks classification behavior (crosswalk strategy, confidence
--         thresholds, auto-classification flags) explicitly rather than
--         relying on application defaults.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '019_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- B1: Verify 'seed' provenance value exists in cc_provenance lookup (§7.5)
    -- Note: 'seed' is now seeded in the canonical lookup file:
    --   platform/000_lookups/LookupDomain/master/cc_provenance.sql
    -- ══════════════════════════════════════════════════════════════════════
    IF NOT EXISTS (
        SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.cc_provenance' AND code = 'seed'
    ) THEN
        RAISE EXCEPTION '[019_base] Provenance "seed" not found in cc_provenance lookup — ensure platform/000_lookups ran first';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- B2: Insert commodity_classification_config for tenant
    -- ══════════════════════════════════════════════════════════════════════
    -- This row locks tenant-level classification behavior explicitly:
    --   • primary_commodity_domain: 'unspsc' (all bridge anchors use this)
    --   • crosswalk_strategy: 'BEST_MATCH' (HS↔UNSPSC resolution)
    --   • confidence thresholds: auto ≥90, suggest ≥60
    --   • auto-classify enabled: AI suggestions for product classification
    --   • auto-crosswalk enabled: HS↔UNSPSC mapping via crosswalk table
    --   • cross-border triggers: standard set for GCC operations
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO control.commodity_classification_config (
        tenant_id,
        primary_commodity_domain,
        trade_commodity_domain,
        is_commodity_code_required,
        is_trade_code_required,
        is_required_for_regulated,
        primary_industry_domain,
        is_auto_classify_enabled,
        is_auto_crosswalk_enabled,
        min_confidence_auto,
        min_confidence_suggest,
        crosswalk_strategy,
        cross_border_triggers,
        metadata,
        created_by
    ) VALUES (
        v_tid,
        'unspsc',                       -- primary commodity domain
        'hs',                           -- trade commodity domain (HS tariff)
        false,                          -- commodity code not mandatory globally
        false,                          -- trade code not mandatory globally
        true,                           -- require classification for regulated items
        'isic',                         -- primary industry domain
        true,                           -- AI auto-classification enabled
        true,                           -- auto-crosswalk enabled
        90.00,                          -- min confidence for auto-accept
        60.00,                          -- min confidence for suggestion display
        'BEST_MATCH',                   -- crosswalk strategy
        '["SUPPLIER_COUNTRY_MISMATCH","SHIP_TO_MISMATCH","IMPORT_TAX","CUSTOMS_REQUIRED"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack',      v_pack,
                'version',   v_version,
                'seeded_at', now()::text
            ),
            'company_capex_currencies', '{}'::jsonb
        ),
        v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        primary_commodity_domain    = EXCLUDED.primary_commodity_domain,
        trade_commodity_domain      = EXCLUDED.trade_commodity_domain,
        is_commodity_code_required  = EXCLUDED.is_commodity_code_required,
        is_trade_code_required      = EXCLUDED.is_trade_code_required,
        is_required_for_regulated   = EXCLUDED.is_required_for_regulated,
        primary_industry_domain     = EXCLUDED.primary_industry_domain,
        is_auto_classify_enabled    = EXCLUDED.is_auto_classify_enabled,
        is_auto_crosswalk_enabled   = EXCLUDED.is_auto_crosswalk_enabled,
        min_confidence_auto         = EXCLUDED.min_confidence_auto,
        min_confidence_suggest      = EXCLUDED.min_confidence_suggest,
        crosswalk_strategy          = EXCLUDED.crosswalk_strategy,
        cross_border_triggers       = EXCLUDED.cross_border_triggers,
        metadata                  = control.commodity_classification_config.metadata
                                    || jsonb_build_object(
                                           '_seed', jsonb_build_object(
                                               'pack',      v_pack,
                                               'version',   v_version,
                                               'seeded_at', now()::text
                                           ),
                                           'company_capex_currencies', EXCLUDED.metadata->'company_capex_currencies'
                                       ),
        updated_at = now(),
        updated_by = v_su
    WHERE (control.commodity_classification_config.primary_commodity_domain,
           control.commodity_classification_config.trade_commodity_domain,
           control.commodity_classification_config.is_commodity_code_required,
           control.commodity_classification_config.is_trade_code_required,
           control.commodity_classification_config.is_required_for_regulated,
           control.commodity_classification_config.primary_industry_domain,
           control.commodity_classification_config.is_auto_classify_enabled,
           control.commodity_classification_config.is_auto_crosswalk_enabled,
           control.commodity_classification_config.min_confidence_auto,
           control.commodity_classification_config.min_confidence_suggest,
           control.commodity_classification_config.crosswalk_strategy,
           control.commodity_classification_config.cross_border_triggers)
       IS DISTINCT FROM
          (EXCLUDED.primary_commodity_domain,
           EXCLUDED.trade_commodity_domain,
           EXCLUDED.is_commodity_code_required,
           EXCLUDED.is_trade_code_required,
           EXCLUDED.is_required_for_regulated,
           EXCLUDED.primary_industry_domain,
           EXCLUDED.is_auto_classify_enabled,
           EXCLUDED.is_auto_crosswalk_enabled,
           EXCLUDED.min_confidence_auto,
           EXCLUDED.min_confidence_suggest,
           EXCLUDED.crosswalk_strategy,
           EXCLUDED.cross_border_triggers);

    -- ── Assertions ───────────────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM control.commodity_classification_config WHERE tenant_id = v_tid
    ) THEN
        RAISE EXCEPTION '[019_base] commodity_classification_config row not created for tenant %', v_tid;
    END IF;

    RAISE NOTICE '[019_base] Pre-seed foundation complete: provenance "seed" registered, commodity_classification_config ready';

END $seed$;
