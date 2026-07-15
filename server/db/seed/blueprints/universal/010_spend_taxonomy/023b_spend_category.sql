-- Retired ordering slot. master.commodity_category is now seeded by
-- 023_commodity_category.sql and owns the procurement taxonomy.

DO $seed$
BEGIN
    RAISE NOTICE '[023b_spend_category] retired; commodity_category seed owns taxonomy';
END
$seed$;
