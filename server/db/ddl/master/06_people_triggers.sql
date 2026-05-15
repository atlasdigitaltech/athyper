-- ============================================================================
-- master/06_people_triggers.sql
-- ============================================================================

DO $$
DECLARE
    r record;
    v_table text;
    v_tables text[] := ARRAY[
        'person',
        'person_sensitive_profile',
        'external_reference',
        'org_unit',
        'job_family',
        'job_function',
        'career_band',
        'career_level',
        'pay_grade',
        'designation',
        'job',
        'position',
        'employment',
        'work_assignment',
        'work_pattern',
        'work_pattern_day',
        'shift_type',
        'leave_type',
        'leave_plan',
        'leave_plan_rule',
        'employee_leave_enrollment',
        'pay_group',
        'pay_component',
        'pay_structure',
        'pay_structure_line',
        'statutory_scheme',
        'employee_statutory_enrollment'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_people_updated_at ON master.%I', v_table);
        EXECUTE format(
            'CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON master.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table
        );
    END LOOP;

    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'master'
          AND c.column_name = 'status_changed_at'
          AND c.table_name = ANY (v_tables)
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_people_status_changed ON master.%I', r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_people_status_changed BEFORE UPDATE ON master.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            r.table_name
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION master.trg_people_org_unit_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, document, shared, pg_catalog
AS $$
DECLARE
    v_parent_id uuid := NEW.parent_id;
    v_seen uuid[] := ARRAY[NEW.id];
    v_depth integer := 1;
    v_parent_code text;
    v_parent_path text;
    v_parent_level smallint;
BEGIN
    IF btrim(NEW.code) = '' THEN
        RAISE EXCEPTION 'ORG_UNIT_INVALID: code must not be empty';
    END IF;

    WHILE v_parent_id IS NOT NULL LOOP
        IF v_parent_id = ANY (v_seen) THEN
            RAISE EXCEPTION 'ORG_UNIT_CYCLE: org_unit % cannot be parented under its own descendant', NEW.id;
        END IF;

        v_seen := array_append(v_seen, v_parent_id);

        SELECT parent_id
          INTO v_parent_id
          FROM master.org_unit
         WHERE tenant_id = NEW.tenant_id
           AND id = v_parent_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ORG_UNIT_PARENT_MISSING: parent org_unit % does not exist for tenant %', v_seen[array_length(v_seen, 1)], NEW.tenant_id;
        END IF;

        v_depth := v_depth + 1;
        IF v_depth > 25 THEN
            RAISE EXCEPTION 'ORG_UNIT_DEPTH_LIMIT: hierarchy depth exceeds 25 for org_unit %', NEW.id;
        END IF;
    END LOOP;

    IF NEW.parent_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path := '/' || NEW.code;
    ELSE
        SELECT code, path, level_no
          INTO v_parent_code, v_parent_path, v_parent_level
          FROM master.org_unit
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.parent_id;

        NEW.level_no := COALESCE(v_parent_level, 0) + 1;
        NEW.path := COALESCE(v_parent_path, '/' || v_parent_code) || '/' || NEW.code;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.path IS NOT NULL
       AND NEW.path IS DISTINCT FROM OLD.path THEN
        UPDATE master.org_unit
           SET path = NEW.path || substring(path FROM length(OLD.path) + 1),
               level_no = NEW.level_no + (level_no - OLD.level_no)
         WHERE tenant_id = NEW.tenant_id
           AND path LIKE OLD.path || '/%';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_org_unit_path ON master.org_unit;
CREATE TRIGGER trg_people_org_unit_path
    BEFORE INSERT OR UPDATE OF code, parent_id ON master.org_unit
    FOR EACH ROW EXECUTE FUNCTION master.trg_people_org_unit_path();
