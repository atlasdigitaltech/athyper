CREATE OR REPLACE FUNCTION control.trg_guard_planning_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'control.% identity and creation evidence are immutable',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_planning_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE dependencies(driver_id) AS (
            SELECT NEW.depends_on_driver_id
            UNION
            SELECT d.depends_on_driver_id
              FROM control.planning_driver_dependency d
              JOIN dependencies p ON d.planning_driver_id = p.driver_id
             WHERE d.tenant_id = NEW.tenant_id
               AND d.planning_model_id = NEW.planning_model_id
               AND d.id <> NEW.id
        )
        SELECT 1 FROM dependencies WHERE driver_id = NEW.planning_driver_id
    ) THEN
        RAISE EXCEPTION 'Planning driver dependency graph cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_planning_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
       OR NEW.planning_driver_id IS DISTINCT FROM OLD.planning_driver_id
       OR NEW.depends_on_driver_id IS DISTINCT FROM OLD.depends_on_driver_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Planning dependency coordinates and evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
