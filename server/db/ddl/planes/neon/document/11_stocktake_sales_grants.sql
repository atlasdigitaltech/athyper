DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            document.stocktake,
            document.stocktake_line,
            document.sales_opportunity,
            document.sales_opportunity_company,
            document.sales_quotation,
            document.sales_quotation_company,
            document.sales_quotation_allocation,
            document.sales_order_intercompany_fulfillment
        TO athyperapp;
        GRANT DELETE ON document.stocktake_line TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.stocktake,
            document.stocktake_line,
            document.sales_opportunity,
            document.sales_opportunity_company,
            document.sales_quotation,
            document.sales_quotation_company,
            document.sales_quotation_allocation,
            document.sales_order_intercompany_fulfillment
        TO athyperadmin;
    END IF;
END;
$$;
