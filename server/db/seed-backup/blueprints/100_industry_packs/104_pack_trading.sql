-- Retired industry-pack slot — kept as a no-op for stable ordering. Industry
-- procurement taxonomy now lives in master.commodity_category + policy tables.

DO $seed$
BEGIN
    RAISE NOTICE '[104_pack_trading] retired legacy procurement taxonomy pack; commodity_category owns taxonomy';
END
$seed$;