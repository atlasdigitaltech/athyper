DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'catalog_import', 'catalog_import_line',
        'punchout_cart', 'punchout_cart_line',
        'production_order', 'production_order_component',
        'sales_order', 'sales_order_line'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_sales_order_line_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, sales_order_id, item_id, currency_code
ON document.sales_order_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_sales_order_line();

CREATE TRIGGER trg_production_order_15_snapshot_contract
BEFORE INSERT OR UPDATE OF
    tenant_id, company_code_id, output_item_id, bom_snapshot_id, uom_code
ON document.production_order
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_production_order();

CREATE TRIGGER trg_production_order_component_15_snapshot_contract
BEFORE INSERT OR UPDATE OF
    tenant_id, production_order_id, bom_component_snapshot_id,
    component_item_id, uom_code
ON document.production_order_component
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_production_order_component();
