-- Gated on app.rebuild_entity_metadata=true: truncates the control metadata graph
-- before subsequent 003_control seeds rebuild it. Order matters â€” children before parents.
-- Listed children are seed-owned; CASCADE catches any DB-resident FK dependents.

DO $$
DECLARE
    v_tables text;
BEGIN
    IF lower(COALESCE(current_setting('app.rebuild_entity_metadata', true), 'false'))
       IN ('1', 'true', 'on', 'yes') THEN
        SELECT string_agg(format('%s', to_regclass(table_name)), ', ' ORDER BY ord)
          INTO v_tables
          FROM unnest(ARRAY[
              -- Flow/editor metadata children
              'control.entity_flow_field',
              'control.entity_flow_section',
              'control.entity_flow_step',
              'control.entity_flow',

              -- Field grouping/security/policy children
              'control.field_group_member',
              'control.field_security_policy',
              'control.entity_policy',
              'control.entity_relation',

              -- Entity binding/config children
              'control.entity_numbering_counter',
              'control.entity_numbering_config',
              'control.entity_lifecycle',
              'control.entity_operation',
              'control.entity_publish_state',

              -- Core entity metadata
              'control.entity_field',
              'control.entity_version',
              'control.entity',

              -- Lifecycle metadata graph
              'control.lifecycle_hook_override',
              'control.lifecycle_transition_hook',
              'control.lifecycle_transition_gate',
              'control.lifecycle_transition',
              'control.lifecycle_state',
              'control.lifecycle_timer_policy',
              'control.lifecycle',

              -- Root/platform metadata
              'control.feature_flag',
              'control.field_group',
              'control.entity_class_profile'
          ]::text[]) WITH ORDINALITY AS t(table_name, ord)
         WHERE to_regclass(table_name) IS NOT NULL;

        IF v_tables IS NOT NULL THEN
            RAISE NOTICE 'Rebuilding entity metadata: truncating %', v_tables;
            EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';
        END IF;
    END IF;
END $$;

