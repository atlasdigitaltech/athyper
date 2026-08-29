BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('athyper_studio','athyper_neon','athyper_mesh') THEN
    RAISE EXCEPTION 'Usage-limit trigger guard migration requires an Athyper plane database';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION control.trg_guard_usage_limit_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'identity and creation evidence are immutable on %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'subscription_plan_usage_limit' THEN
        IF NEW.subscription_plan_id IS DISTINCT FROM OLD.subscription_plan_id
           OR NEW.usage_metric_id IS DISTINCT FROM OLD.usage_metric_id
           OR NEW.dimension_code IS DISTINCT FROM OLD.dimension_code THEN
            RAISE EXCEPTION 'subscription plan usage-limit coordinates are immutable' USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'tenant_usage_limit_override' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.usage_metric_id IS DISTINCT FROM OLD.usage_metric_id
           OR NEW.dimension_code IS DISTINCT FROM OLD.dimension_code THEN
            RAISE EXCEPTION 'tenant usage-limit override coordinates are immutable' USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'usage_metric_catalog' THEN
        IF NEW.code IS DISTINCT FROM OLD.code THEN
            RAISE EXCEPTION 'usage metric catalog code is immutable' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'deprecated usage controls cannot be reactivated' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
