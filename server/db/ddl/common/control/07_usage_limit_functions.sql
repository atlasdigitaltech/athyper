CREATE OR REPLACE FUNCTION control.trg_guard_usage_limit_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'identity and creation evidence are immutable on %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'subscription_plan_usage_limit'
       AND (
           NEW.subscription_plan_id IS DISTINCT FROM OLD.subscription_plan_id
           OR NEW.usage_metric_id IS DISTINCT FROM OLD.usage_metric_id
           OR NEW.dimension_code IS DISTINCT FROM OLD.dimension_code
       ) THEN
        RAISE EXCEPTION 'subscription plan usage-limit coordinates are immutable'
            USING ERRCODE = 'check_violation';
    ELSIF TG_TABLE_NAME = 'tenant_usage_limit_override'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.usage_metric_id IS DISTINCT FROM OLD.usage_metric_id
           OR NEW.dimension_code IS DISTINCT FROM OLD.dimension_code
       ) THEN
        RAISE EXCEPTION 'tenant usage-limit override coordinates are immutable'
            USING ERRCODE = 'check_violation';
    ELSIF TG_TABLE_NAME = 'usage_metric_catalog'
       AND NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'usage metric catalog code is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'deprecated usage controls cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_usage_limit_dimension()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_dimension_type_code text;
BEGIN
    SELECT dimension_type_code
      INTO v_dimension_type_code
      FROM control.usage_metric_catalog
     WHERE id = NEW.usage_metric_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown usage metric: %', NEW.usage_metric_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_dimension_type_code IS NULL AND NEW.dimension_code <> '*' THEN
        RAISE EXCEPTION 'usage metric does not support a dimension: %', NEW.dimension_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
