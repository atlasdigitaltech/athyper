CREATE TRIGGER usage_metric_catalog_updated_at
BEFORE UPDATE ON control.usage_metric_catalog
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER usage_metric_catalog_guard
BEFORE UPDATE ON control.usage_metric_catalog
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_usage_limit_identity();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'subscription_plan_usage_limit', 'tenant_usage_limit_override'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF usage_metric_id, dimension_code ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_validate_usage_limit_dimension()',
            v_table || '_dimension_validate', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_usage_limit_identity()',
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
