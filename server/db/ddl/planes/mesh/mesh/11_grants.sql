REVOKE ALL ON SCHEMA mesh FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA mesh FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA mesh TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            mesh.network_account,
            mesh.network_account_identifier,
            mesh.network_account_reference,
            mesh.network_relationship,
            mesh.catalog,
            mesh.catalog_item,
            mesh.catalog_item_identifier,
            mesh.catalog_item_classification,
            mesh.catalog_item_uom,
            mesh.catalog_audience,
            mesh.catalog_price,
            mesh.catalog_availability
        TO athyperapp;
        GRANT SELECT ON
            mesh.current_tenant_network_account,
            mesh.current_tenant_network_relationship,
            mesh.visible_catalog,
            mesh.visible_catalog_item,
            mesh.visible_catalog_price
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            mesh.current_network_account_id_soft(),
            mesh.catalog_is_visible(uuid),
            mesh.catalog_item_is_visible(uuid),
            mesh.catalog_price_is_visible(uuid)
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA mesh TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA mesh TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh TO athyperadmin;
    END IF;
END;
$$;
