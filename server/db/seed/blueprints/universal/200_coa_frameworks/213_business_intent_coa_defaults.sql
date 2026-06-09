-- ============================================================================
-- UNIVERSAL - BUSINESS INTENT COA DEFAULTS (retired)
-- ============================================================================
-- Business intents no longer carry GL/tax/asset defaults. Accounting defaults
-- are seeded and maintained on commodity category buy/sell policy rows.
-- This file remains as an idempotent compatibility step for existing seed order.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[213_business_intent_coa_defaults] Skipped: business intent defaults moved to commodity category policy tables';
END $seed$;
