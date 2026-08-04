DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'stocktake', 'stocktake_line',
        'sales_opportunity', 'sales_opportunity_company',
        'sales_quotation', 'sales_quotation_company',
        'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'stocktake', 'sales_opportunity', 'sales_opportunity_company',
        'sales_quotation', 'sales_quotation_company',
        'sales_quotation_allocation', 'sales_order_intercompany_fulfillment'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_stocktake_15_completion
BEFORE INSERT OR UPDATE ON document.stocktake
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_stocktake_completion();

CREATE TRIGGER trg_stocktake_line_15_contract
BEFORE INSERT OR UPDATE ON document.stocktake_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_stocktake_line();

CREATE TRIGGER trg_stocktake_line_15_delete_guard
BEFORE DELETE ON document.stocktake_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_stocktake_line_delete();

CREATE TRIGGER trg_sales_opportunity_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id, selling_model, principal_seller_company_id
ON document.sales_opportunity
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_header();

CREATE TRIGGER trg_sales_opportunity_company_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, opportunity_id, company_code_id
ON document.sales_opportunity_company
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_company('opportunity');

CREATE TRIGGER trg_sales_quotation_14_opportunity_contract
BEFORE INSERT OR UPDATE OF
    tenant_id, opportunity_id, customer_id, operating_organization_id,
    selling_model, principal_seller_company_id
ON document.sales_quotation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_quotation();

CREATE TRIGGER trg_sales_quotation_15_sales_org_contract
BEFORE INSERT OR UPDATE OF tenant_id, operating_organization_id, selling_model, principal_seller_company_id
ON document.sales_quotation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_header();

CREATE TRIGGER trg_sales_quotation_company_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, quotation_id, company_code_id
ON document.sales_quotation_company
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_company('quotation');

CREATE TRIGGER trg_sales_quotation_allocation_15_contract
BEFORE INSERT OR UPDATE ON document.sales_quotation_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_allocation();

CREATE TRIGGER trg_sales_order_ic_fulfillment_15_contract
BEFORE INSERT OR UPDATE ON document.sales_order_intercompany_fulfillment
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_intercompany_fulfillment();

CREATE TRIGGER trg_sales_order_15_quotation_contract
BEFORE INSERT OR UPDATE OF tenant_id, quotation_id, company_code_id, customer_id, currency_code
ON document.sales_order
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_order_quotation();

CREATE CONSTRAINT TRIGGER trg_sales_opportunity_95_structure
AFTER INSERT OR UPDATE ON document.sales_opportunity
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_opportunity_structure();

CREATE CONSTRAINT TRIGGER trg_sales_opportunity_company_95_structure
AFTER INSERT OR UPDATE OR DELETE ON document.sales_opportunity_company
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_opportunity_structure();

CREATE CONSTRAINT TRIGGER trg_sales_quotation_95_structure
AFTER INSERT OR UPDATE ON document.sales_quotation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_quotation_structure();

CREATE CONSTRAINT TRIGGER trg_sales_quotation_company_95_structure
AFTER INSERT OR UPDATE OR DELETE ON document.sales_quotation_company
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_quotation_structure();

CREATE CONSTRAINT TRIGGER trg_sales_quotation_allocation_95_structure
AFTER INSERT OR UPDATE OR DELETE ON document.sales_quotation_allocation
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_sales_quotation_structure();

CREATE CONSTRAINT TRIGGER trg_sales_order_95_intercompany_total
AFTER UPDATE OF total_amount ON document.sales_order
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_intercompany_fulfillment_total();

CREATE CONSTRAINT TRIGGER trg_sales_order_ic_fulfillment_95_total
AFTER INSERT OR UPDATE OR DELETE ON document.sales_order_intercompany_fulfillment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION document.trg_assert_intercompany_fulfillment_total();
