DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'commodity_category', 'product', 'item', 'commodity_code_assignment',
        'catalog', 'catalog_item', 'catalog_price', 'bom', 'bom_component'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON master.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_identity_guard BEFORE UPDATE ON master.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_guard_product_catalog_identity()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON master.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON master.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_commodity_category_15_parent
BEFORE INSERT OR UPDATE OF parent_id, tenant_id
ON master.commodity_category
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_commodity_category_parent();

CREATE TRIGGER trg_item_15_product_uom
BEFORE INSERT OR UPDATE OF tenant_id, product_id, base_uom_code
ON master.item
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_item_product_uom();

CREATE TRIGGER trg_catalog_item_15_company
BEFORE INSERT OR UPDATE OF tenant_id, catalog_id, item_id
ON master.catalog_item
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_catalog_item_company();

CREATE TRIGGER trg_bom_15_header
BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, output_item_id, uom_code
ON master.bom
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_bom_header();

CREATE TRIGGER trg_bom_component_15_contract
BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, bom_id, component_item_id
ON master.bom_component
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_bom_component();

CREATE TRIGGER trg_bom_component_16_released_guard
BEFORE INSERT OR UPDATE OR DELETE ON master.bom_component
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_released_bom();
