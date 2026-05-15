-- ============================================================================
-- control/06_people_formula_triggers.sql
-- ============================================================================

DO $$
DECLARE
    r record;
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'formula_expression',
        'formula_expression_version',
        'rate_table',
        'rate_table_row'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_people_updated_at ON control.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON control.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;

    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'control'
          AND c.column_name = 'status_changed_at'
          AND c.table_name IN ('formula_expression', 'rate_table')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_people_status_changed ON control.%I', r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON control.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            r.table_name
        );
    END LOOP;
END $$;
