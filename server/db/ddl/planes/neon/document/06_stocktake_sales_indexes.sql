CREATE INDEX stocktake_open_idx
    ON document.stocktake (tenant_id, warehouse_id, stocktake_date, status)
    WHERE status IN ('planned', 'in_progress');
CREATE INDEX stocktake_variance_journal_idx
    ON document.stocktake (tenant_id, variance_journal_entry_id)
    WHERE variance_journal_entry_id IS NOT NULL;
CREATE INDEX stocktake_company_site_idx
    ON document.stocktake (tenant_id, company_code_id, site_id);
CREATE INDEX stocktake_site_warehouse_idx
    ON document.stocktake (tenant_id, site_id, warehouse_id);
CREATE INDEX stocktake_completed_by_idx
    ON document.stocktake (tenant_id, completed_by)
    WHERE completed_by IS NOT NULL;
CREATE INDEX stocktake_line_item_idx
    ON document.stocktake_line (tenant_id, item_id, stocktake_id);
CREATE INDEX stocktake_line_uncounted_idx
    ON document.stocktake_line (tenant_id, stocktake_id, line_no)
    WHERE counted_quantity IS NULL;
CREATE INDEX stocktake_line_movement_idx
    ON document.stocktake_line (tenant_id, posted_inventory_movement_id)
    WHERE posted_inventory_movement_id IS NOT NULL;
CREATE INDEX stocktake_line_counted_by_idx
    ON document.stocktake_line (tenant_id, counted_by)
    WHERE counted_by IS NOT NULL;

CREATE INDEX sales_opportunity_org_status_idx
    ON document.sales_opportunity (tenant_id, operating_organization_id, status, expected_close_date);
CREATE INDEX sales_opportunity_customer_idx
    ON document.sales_opportunity (tenant_id, customer_id, status);
CREATE INDEX sales_opportunity_principal_company_idx
    ON document.sales_opportunity (tenant_id, principal_seller_company_id)
    WHERE principal_seller_company_id IS NOT NULL;
CREATE INDEX sales_opportunity_requested_by_idx
    ON document.sales_opportunity (tenant_id, requested_by)
    WHERE requested_by IS NOT NULL;
CREATE UNIQUE INDEX sales_opportunity_one_lead_idx
    ON document.sales_opportunity_company (tenant_id, opportunity_id)
    WHERE participation_role = 'lead_seller' AND status = 'active';
CREATE INDEX sales_opportunity_company_company_idx
    ON document.sales_opportunity_company (tenant_id, company_code_id, status);

CREATE INDEX sales_quotation_opportunity_idx
    ON document.sales_quotation (tenant_id, opportunity_id)
    WHERE opportunity_id IS NOT NULL;
CREATE INDEX sales_quotation_org_status_idx
    ON document.sales_quotation (tenant_id, operating_organization_id, status, valid_until);
CREATE INDEX sales_quotation_customer_idx
    ON document.sales_quotation (tenant_id, customer_id, status);
CREATE INDEX sales_quotation_principal_company_idx
    ON document.sales_quotation (tenant_id, principal_seller_company_id)
    WHERE principal_seller_company_id IS NOT NULL;
CREATE INDEX sales_quotation_requested_by_idx
    ON document.sales_quotation (tenant_id, requested_by)
    WHERE requested_by IS NOT NULL;
CREATE UNIQUE INDEX sales_quotation_one_lead_idx
    ON document.sales_quotation_company (tenant_id, quotation_id)
    WHERE participation_role = 'lead_seller' AND status = 'active';
CREATE INDEX sales_quotation_company_company_idx
    ON document.sales_quotation_company (tenant_id, company_code_id, status);
CREATE INDEX sales_quotation_allocation_company_idx
    ON document.sales_quotation_allocation (tenant_id, company_code_id, status);
CREATE INDEX sales_quotation_allocation_order_idx
    ON document.sales_quotation_allocation (tenant_id, output_sales_order_id)
    WHERE output_sales_order_id IS NOT NULL;
CREATE UNIQUE INDEX sales_order_quotation_company_uq
    ON document.sales_order (tenant_id, quotation_id, company_code_id)
    WHERE quotation_id IS NOT NULL;
CREATE INDEX sales_order_ic_fulfillment_order_idx
    ON document.sales_order_intercompany_fulfillment (tenant_id, sales_order_id, status);
CREATE INDEX sales_order_ic_fulfillment_company_idx
    ON document.sales_order_intercompany_fulfillment (tenant_id, fulfillment_company_code_id, status);
CREATE INDEX sales_order_ic_fulfillment_selling_company_idx
    ON document.sales_order_intercompany_fulfillment (tenant_id, selling_company_code_id, status);
