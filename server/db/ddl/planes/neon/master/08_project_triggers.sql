DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['project', 'project_wbs', 'project_item']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_00_created_by BEFORE INSERT ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_10_identity BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_guard_product_catalog_identity()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_80_status BEFORE UPDATE OF status ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_90_updated_at BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_project_wbs_20_validate
BEFORE INSERT OR UPDATE OF parent_wbs_id, project_id, level_no, is_postable
ON master.project_wbs
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_project_wbs();

CREATE TRIGGER trg_project_item_20_validate
BEFORE INSERT OR UPDATE OF project_id, item_id, uom_code
ON master.project_item
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_project_item();
