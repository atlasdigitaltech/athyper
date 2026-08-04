DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'commodity_category_buy_policy',
        'commodity_category_sell_policy',
        'commodity_category_inventory_policy'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_10_guard BEFORE UPDATE OR DELETE ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_commodity_category_policy()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_15_validate BEFORE INSERT OR UPDATE ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_validate_commodity_category_policy()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status BEFORE UPDATE OF status ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated BEFORE UPDATE ON control.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;
END;
$$;
