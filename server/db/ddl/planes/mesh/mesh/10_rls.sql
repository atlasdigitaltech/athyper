ALTER TABLE mesh.network_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_identifier FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_account_reference FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.network_relationship FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON mesh.network_account FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON mesh.network_account_identifier FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_identifier FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON mesh.network_account_reference FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON mesh.network_account_reference FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
CREATE POLICY participant_access ON mesh.network_relationship FOR ALL
    USING (
        buyer_tenant_id = shared.current_tenant_id_soft()
        OR supplier_tenant_id = shared.current_tenant_id_soft()
    )
    WITH CHECK (
        buyer_tenant_id = shared.current_tenant_id()
        OR supplier_tenant_id = shared.current_tenant_id()
    );
CREATE POLICY seed_write ON mesh.network_relationship FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE mesh.catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_identifier FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_classification FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_uom ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_item_uom FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_audience FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_price FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.catalog_availability FORCE ROW LEVEL SECURITY;

CREATE POLICY catalog_owner_manage ON mesh.catalog
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_publication_read ON mesh.catalog
    FOR SELECT
    USING (mesh.catalog_is_visible(id));
CREATE POLICY seed_write ON mesh.catalog
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_owner_manage ON mesh.catalog_item
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_publication_read ON mesh.catalog_item
    FOR SELECT
    USING (mesh.catalog_item_is_visible(id));
CREATE POLICY seed_write ON mesh.catalog_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_identifier_owner_manage
    ON mesh.catalog_item_identifier
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_identifier_publication_read
    ON mesh.catalog_item_identifier
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_item_identifier
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_classification_owner_manage
    ON mesh.catalog_item_classification
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_classification_publication_read
    ON mesh.catalog_item_classification
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_item_classification
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_item_uom_owner_manage ON mesh.catalog_item_uom
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_item_uom_publication_read ON mesh.catalog_item_uom
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_item_uom
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_audience_supplier_manage ON mesh.catalog_audience
    FOR ALL
    USING (supplier_tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (supplier_tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_audience_participant_read ON mesh.catalog_audience
    FOR SELECT
    USING (
        supplier_tenant_id = shared.current_tenant_id_soft()
        OR buyer_tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY seed_write ON mesh.catalog_audience
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_price_owner_manage ON mesh.catalog_price
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_price_publication_read ON mesh.catalog_price
    FOR SELECT
    USING (mesh.catalog_price_is_visible(id));
CREATE POLICY seed_write ON mesh.catalog_price
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY catalog_availability_owner_manage
    ON mesh.catalog_availability
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY catalog_availability_publication_read
    ON mesh.catalog_availability
    FOR SELECT
    USING (mesh.catalog_item_is_visible(catalog_item_id));
CREATE POLICY seed_write ON mesh.catalog_availability
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
