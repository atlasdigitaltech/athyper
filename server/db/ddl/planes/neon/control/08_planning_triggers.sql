DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['planning_model', 'planning_driver']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_00_created_by BEFORE INSERT ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_10_identity BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_planning_identity()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_80_status BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_90_updated_at BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_planning_dependency_00_created_by
BEFORE INSERT ON control.planning_driver_dependency
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_planning_dependency_10_identity
BEFORE UPDATE ON control.planning_driver_dependency
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_planning_dependency();

CREATE TRIGGER trg_planning_dependency_20_cycle
BEFORE INSERT OR UPDATE OF planning_driver_id, depends_on_driver_id
ON control.planning_driver_dependency
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_planning_dependency();
