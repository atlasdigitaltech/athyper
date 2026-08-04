CREATE DOMAIN control.commodity_crosswalk_strategy_d AS text
    CHECK (VALUE IN ('exact_only', 'best_match', 'ai_assisted'));
