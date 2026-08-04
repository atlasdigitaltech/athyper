DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'feature_flag_catalog', 'feature_flag_override',
        'parameter_definition', 'tenant_parameter_value'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_feature_parameter_identity()',
            v_table || '_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER parameter_definition_validate
BEFORE INSERT OR UPDATE OF value_type, default_value, min_value, max_value, allowed_values
ON control.parameter_definition
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_parameter_definition();

CREATE TRIGGER tenant_parameter_value_validate
BEFORE INSERT OR UPDATE OF parameter_definition_id, value
ON control.tenant_parameter_value
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tenant_parameter_value();
