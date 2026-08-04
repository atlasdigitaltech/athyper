DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            control.commodity_category_buy_policy,
            control.commodity_category_sell_policy,
            control.commodity_category_inventory_policy
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            control.commodity_category_buy_policy,
            control.commodity_category_sell_policy,
            control.commodity_category_inventory_policy
        TO athyperadmin;
    END IF;
END;
$$;
