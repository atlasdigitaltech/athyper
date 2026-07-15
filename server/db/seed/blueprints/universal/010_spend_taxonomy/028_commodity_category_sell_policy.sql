-- No-op slot. Sell-side policy is domain-specific and owned by industry packs
-- (manufactured goods, professional services, contract mfg outputs). Universal
-- commodity_category rows have sell_allowed=false; industry packs flip the flag
-- and insert their own commodity_category_sell_policy rows when needed.

DO $seed$
BEGIN
    RAISE NOTICE '[028_commodity_sell_policy] No universal sell policies — industry packs own sell-side seeding';
END $seed$;
