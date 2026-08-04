DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['bom', 'bom_component']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON snapshot.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION snapshot.trg_set_bom_snapshot_created_by()',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_immutable BEFORE UPDATE OR DELETE ON snapshot.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_bom_snapshot_mutation()',
            v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_bom_10_source_contract
BEFORE INSERT ON snapshot.bom
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_bom_snapshot();

CREATE TRIGGER trg_bom_component_10_source_contract
BEFORE INSERT ON snapshot.bom_component
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_bom_component_snapshot();
