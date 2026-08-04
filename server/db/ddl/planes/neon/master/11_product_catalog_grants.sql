DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA master TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            master.commodity_category,
            master.product,
            master.item,
            master.commodity_code_assignment,
            master.catalog,
            master.catalog_item,
            master.catalog_price,
            master.bom,
            master.bom_component
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA master TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            master.commodity_category,
            master.product,
            master.item,
            master.commodity_code_assignment,
            master.catalog,
            master.catalog_item,
            master.catalog_price,
            master.bom,
            master.bom_component
        TO athyperadmin;
    END IF;
END;
$$;
