-- Retired no-op slot — business intents no longer carry GL/tax/asset defaults.
-- Accounting defaults now live on commodity_category buy/sell policy rows.

DO $seed$
BEGIN
    RAISE NOTICE '[213_business_intent_coa_defaults] Skipped: business intent defaults moved to commodity category policy tables';
END $seed$;
