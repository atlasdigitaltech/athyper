CREATE INDEX catalog_import_supplier_status_idx
    ON document.catalog_import (
        tenant_id, company_code_id, supplier_business_partner_id, status, received_at
    );
CREATE INDEX catalog_import_source_idx
    ON document.catalog_import (source_system, source_publication_id);
CREATE INDEX catalog_import_line_import_status_idx
    ON document.catalog_import_line (
        tenant_id, catalog_import_id, match_status, review_decision, line_no
    );
CREATE INDEX catalog_import_line_proposed_item_idx
    ON document.catalog_import_line (tenant_id, proposed_item_id)
    WHERE proposed_item_id IS NOT NULL;
CREATE INDEX catalog_import_line_published_item_idx
    ON document.catalog_import_line (tenant_id, published_catalog_item_id)
    WHERE published_catalog_item_id IS NOT NULL;
CREATE INDEX catalog_import_line_commodity_idx
    ON document.catalog_import_line (commodity_code_id)
    WHERE commodity_code_id IS NOT NULL;

CREATE INDEX punchout_cart_supplier_status_idx
    ON document.punchout_cart (
        tenant_id, company_code_id, supplier_business_partner_id, status, returned_at
    );
CREATE INDEX punchout_cart_line_cart_idx
    ON document.punchout_cart_line (
        tenant_id, punchout_cart_id, match_status, line_no
    );
CREATE INDEX punchout_cart_line_item_idx
    ON document.punchout_cart_line (tenant_id, item_id)
    WHERE item_id IS NOT NULL;
CREATE INDEX punchout_cart_line_commodity_idx
    ON document.punchout_cart_line (commodity_code_id)
    WHERE commodity_code_id IS NOT NULL;

CREATE INDEX production_order_output_status_idx
    ON document.production_order (
        tenant_id, company_code_id, output_item_id, status, planned_start_at
    );
CREATE INDEX production_order_bom_snapshot_idx
    ON document.production_order (tenant_id, bom_snapshot_id);
CREATE INDEX production_order_site_idx
    ON document.production_order (tenant_id, assembly_site_id)
    WHERE assembly_site_id IS NOT NULL;
CREATE INDEX production_order_component_order_idx
    ON document.production_order_component (
        tenant_id, production_order_id, status, line_no
    );
CREATE INDEX production_order_component_snapshot_idx
    ON document.production_order_component (
        tenant_id, bom_component_snapshot_id
    )
    WHERE bom_component_snapshot_id IS NOT NULL;
CREATE INDEX production_order_component_item_idx
    ON document.production_order_component (tenant_id, component_item_id);

CREATE INDEX sales_order_customer_status_idx
    ON document.sales_order (
        tenant_id, company_code_id, customer_id, status, order_date
    );
CREATE INDEX sales_order_line_order_idx
    ON document.sales_order_line (tenant_id, sales_order_id, status, line_no);
CREATE INDEX sales_order_line_item_idx
    ON document.sales_order_line (tenant_id, item_id, status);

CREATE INDEX catalog_import_supplier_fk_idx
    ON document.catalog_import (tenant_id, supplier_business_partner_id);
CREATE INDEX catalog_import_reviewed_by_idx
    ON document.catalog_import (tenant_id, reviewed_by)
    WHERE reviewed_by IS NOT NULL;
CREATE INDEX catalog_import_published_by_idx
    ON document.catalog_import (tenant_id, published_by)
    WHERE published_by IS NOT NULL;
CREATE INDEX catalog_import_created_by_idx
    ON document.catalog_import (tenant_id, created_by);
CREATE INDEX catalog_import_line_reviewed_by_idx
    ON document.catalog_import_line (tenant_id, reviewed_by)
    WHERE reviewed_by IS NOT NULL;
CREATE INDEX catalog_import_line_created_by_idx
    ON document.catalog_import_line (tenant_id, created_by);

CREATE INDEX punchout_cart_created_by_idx
    ON document.punchout_cart (tenant_id, created_by);
CREATE INDEX punchout_cart_line_matched_by_idx
    ON document.punchout_cart_line (tenant_id, matched_by)
    WHERE matched_by IS NOT NULL;
CREATE INDEX punchout_cart_line_created_by_idx
    ON document.punchout_cart_line (tenant_id, created_by);

CREATE INDEX production_order_created_by_idx
    ON document.production_order (tenant_id, created_by);
CREATE INDEX production_order_component_created_by_idx
    ON document.production_order_component (tenant_id, created_by);

CREATE INDEX sales_order_customer_fk_idx
    ON document.sales_order (tenant_id, customer_id);
CREATE INDEX sales_order_created_by_idx
    ON document.sales_order (tenant_id, created_by);
CREATE INDEX sales_order_line_created_by_idx
    ON document.sales_order_line (tenant_id, created_by);
