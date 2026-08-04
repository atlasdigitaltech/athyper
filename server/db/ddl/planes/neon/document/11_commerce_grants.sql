DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            document.catalog_import,
            document.catalog_import_line,
            document.punchout_cart,
            document.punchout_cart_line,
            document.production_order,
            document.production_order_component,
            document.sales_order,
            document.sales_order_line
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.catalog_import,
            document.catalog_import_line,
            document.punchout_cart,
            document.punchout_cart_line,
            document.production_order,
            document.production_order_component,
            document.sales_order,
            document.sales_order_line
        TO athyperadmin;
    END IF;
END;
$$;
