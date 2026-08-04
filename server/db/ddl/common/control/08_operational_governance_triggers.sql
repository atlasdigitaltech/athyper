CREATE TRIGGER connector_type_updated_at
BEFORE UPDATE ON control.connector_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'connector_instance', 'integration_endpoint', 'webhook_subscription',
        'cycle_type', 'cycle_phase', 'cycle_task_category', 'cycle_task_template',
        'cycle_task_dependency', 'cycle_cross_dependency', 'cycle_carryforward_rule'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity()',
            v_table || '_identity_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'connector_instance', 'integration_endpoint', 'webhook_subscription',
        'cycle_type', 'cycle_phase', 'cycle_task_category', 'cycle_task_template'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER cycle_task_dependency_acyclic
BEFORE INSERT OR UPDATE OF predecessor_template_id, successor_template_id, status
ON control.cycle_task_dependency
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION control.trg_reject_cycle_dependency_cycle();

CREATE TRIGGER cycle_type_domain_validate
BEFORE INSERT OR UPDATE OF tenant_id, domain_code
ON control.cycle_type
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_cycle_domain();
