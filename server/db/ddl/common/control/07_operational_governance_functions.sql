CREATE OR REPLACE FUNCTION control.trg_guard_control_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'identity and creation evidence are immutable on %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_cycle_dependency_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_cycle_found boolean;
BEGIN
    WITH RECURSIVE reachable(template_id) AS (
        SELECT NEW.successor_template_id
        UNION
        SELECT d.successor_template_id
          FROM control.cycle_task_dependency d
          JOIN reachable r ON r.template_id = d.predecessor_template_id
         WHERE d.tenant_id = NEW.tenant_id
           AND d.cycle_type_id = NEW.cycle_type_id
           AND d.status = 'active'
           AND d.id IS DISTINCT FROM NEW.id
    )
    SELECT EXISTS (
        SELECT 1 FROM reachable WHERE template_id = NEW.predecessor_template_id
    ) INTO v_cycle_found;

    IF v_cycle_found THEN
        RAISE EXCEPTION 'cycle task dependency would create a directed cycle'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_cycle_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT control.lookup_value_is_active(
        'governance.cycle_domain', NEW.domain_code, NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'inactive or unknown governance cycle domain: %', NEW.domain_code
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
