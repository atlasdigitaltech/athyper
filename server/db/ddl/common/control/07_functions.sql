CREATE OR REPLACE FUNCTION control.trg_guard_platform_catalog_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_TABLE_NAME IN ('workspace', 'module') THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.code IS DISTINCT FROM OLD.code
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'catalog identity and creation evidence are immutable on control.%', TG_TABLE_NAME
                USING ERRCODE = '22000';
        END IF;
    ELSIF TG_TABLE_NAME = 'workspace_module' THEN
        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
           OR NEW.module_id IS DISTINCT FROM OLD.module_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'workspace-module coordinate and creation evidence are immutable'
                USING ERRCODE = '22000';
        END IF;
    ELSIF TG_TABLE_NAME = 'subscription_plan_module' THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.subscription_plan_id IS DISTINCT FROM OLD.subscription_plan_id
           OR NEW.module_id IS DISTINCT FROM OLD.module_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'plan-module coordinate and creation evidence are immutable'
                USING ERRCODE = '22000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.lookup_value_is_active(
  p_domain_code text,
  p_value_code text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM control.lookup_value value
      JOIN control.lookup_domain domain ON domain.code = value.domain_code
     WHERE value.domain_code = p_domain_code
       AND value.code = p_value_code
       AND value.status = 'active'
       AND domain.status = 'active'
       AND (
         value.tenant_id IS NULL
         OR (
           domain.is_extensible
           AND p_tenant_id IS NOT NULL
           AND value.tenant_id = p_tenant_id
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION control.trg_enforce_lookup_extensibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, shared
AS $$
DECLARE
  v_extensible boolean;
BEGIN
  SELECT is_extensible INTO v_extensible
    FROM control.lookup_domain
   WHERE code = NEW.domain_code AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive lookup domain %', NEW.domain_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.tenant_id IS NULL THEN
    IF NOT NEW.is_system THEN
      RAISE EXCEPTION 'Global lookup values must be system values'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT v_extensible THEN
    RAISE EXCEPTION 'Lookup domain % is not tenant extensible', NEW.domain_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_system THEN
    RAISE EXCEPTION 'Tenant lookup values cannot be system values'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION control.trg_reject_cycle_template_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'published cycle-template revisions are immutable; publish a successor revision'
        USING ERRCODE = '55000';
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

CREATE OR REPLACE FUNCTION control.jsonb_has_secret_shaped_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_key text;
    v_child jsonb;
BEGIN
    CASE jsonb_typeof(p_value)
        WHEN 'object' THEN
            FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
            LOOP
                IF lower(v_key) ~ '(password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|authorization|credential)' THEN
                    RETURN true;
                END IF;
                IF control.jsonb_has_secret_shaped_key(v_child) THEN
                    RETURN true;
                END IF;
            END LOOP;
        WHEN 'array' THEN
            FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
            LOOP
                IF control.jsonb_has_secret_shaped_key(v_child) THEN
                    RETURN true;
                END IF;
            END LOOP;
    END CASE;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_secret_shaped_json()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'connector_instance' THEN
        IF NOT control.jsonb_has_secret_shaped_key(NEW.config) THEN
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'integration_endpoint' THEN
        IF NOT control.jsonb_has_secret_shaped_key(NEW.headers) THEN
            RETURN NEW;
        END IF;
    ELSE
        RAISE EXCEPTION 'unexpected table for secret-material guard: %', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN ('connector_instance', 'integration_endpoint') THEN
        RAISE EXCEPTION 'secret material must be stored only through credential_reference'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_bank_account_validation_rule(
    p_country_code char(2),
    p_payment_rail_code text,
    p_direction control.bank_validation_direction_d DEFAULT 'both',
    p_currency_code char(3) DEFAULT NULL
)
RETURNS control.bank_account_validation_rule
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT rule
      FROM control.bank_account_validation_rule AS rule
     WHERE rule.status = 'active'
       AND rule.country_code = upper(p_country_code)
       AND rule.payment_rail_code = lower(btrim(p_payment_rail_code))
       AND rule.direction IN ('both', p_direction)
       AND (rule.currency_code IS NULL OR rule.currency_code = upper(p_currency_code))
     ORDER BY
       (rule.currency_code IS NOT NULL) DESC,
       (rule.direction = p_direction) DESC,
       rule.priority DESC,
       rule.code
     LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION control.parameter_value_matches_definition(
    p_value jsonb,
    p_value_type text,
    p_min_value jsonb,
    p_max_value jsonb,
    p_allowed_values jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_numeric_value numeric;
BEGIN
    IF p_value_type = 'boolean' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RETURN false;
    ELSIF p_value_type = 'integer'
          AND (jsonb_typeof(p_value) <> 'number' OR p_value::text !~ '^-?[0-9]+$') THEN
        RETURN false;
    ELSIF p_value_type = 'number' AND jsonb_typeof(p_value) <> 'number' THEN
        RETURN false;
    ELSIF p_value_type IN ('string', 'enum') AND jsonb_typeof(p_value) <> 'string' THEN
        RETURN false;
    ELSIF p_value_type = 'duration' AND jsonb_typeof(p_value) NOT IN ('number', 'string') THEN
        RETURN false;
    END IF;

    IF p_allowed_values IS NOT NULL
       AND NOT (p_allowed_values @> jsonb_build_array(p_value)) THEN
        RETURN false;
    END IF;

    IF p_value_type IN ('integer', 'number') THEN
        v_numeric_value := p_value::text::numeric;
        IF p_min_value IS NOT NULL AND v_numeric_value < p_min_value::text::numeric THEN
            RETURN false;
        END IF;
        IF p_max_value IS NOT NULL AND v_numeric_value > p_max_value::text::numeric THEN
            RETURN false;
        END IF;
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_parameter_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NOT control.parameter_value_matches_definition(
        NEW.default_value, NEW.value_type, NEW.min_value, NEW.max_value, NEW.allowed_values
    ) THEN
        RAISE EXCEPTION 'invalid default value for parameter %', NEW.code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tenant_parameter_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_definition control.parameter_definition;
BEGIN
    SELECT * INTO v_definition
      FROM control.parameter_definition
     WHERE id = NEW.parameter_definition_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown parameter definition: %', NEW.parameter_definition_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_definition.status <> 'active' OR NOT v_definition.tenant_can_override THEN
        RAISE EXCEPTION 'parameter % cannot be tenant-overridden', v_definition.code
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT control.parameter_value_matches_definition(
        NEW.value, v_definition.value_type, v_definition.min_value,
        v_definition.max_value, v_definition.allowed_values
    ) THEN
        RAISE EXCEPTION 'invalid value for parameter %', v_definition.code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_feature_parameter_identity()
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

    IF TG_TABLE_NAME IN ('feature_flag_catalog', 'parameter_definition')
       AND NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'catalog code is immutable on %', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    ELSIF TG_TABLE_NAME = 'feature_flag_override'
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.feature_flag_id IS DISTINCT FROM OLD.feature_flag_id) THEN
        RAISE EXCEPTION 'feature-flag override coordinates are immutable'
            USING ERRCODE = 'check_violation';
    ELSIF TG_TABLE_NAME = 'tenant_parameter_value'
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.parameter_definition_id IS DISTINCT FROM OLD.parameter_definition_id) THEN
        RAISE EXCEPTION 'tenant parameter-value coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'deprecated feature and parameter records cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_cron_schedules_for_scheduler()
RETURNS SETOF control.cron_schedule
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
    SELECT * FROM control.cron_schedule
    WHERE is_enabled
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_until IS NULL OR effective_until > now())
    ORDER BY tenant_id NULLS FIRST, code
$$;

CREATE OR REPLACE FUNCTION control.fn_mark_cron_schedule_reconciled(
    p_schedule_id uuid,
    p_reconciled_at timestamptz,
    p_next_run_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
BEGIN
    UPDATE control.cron_schedule
       SET last_reconciled_at = p_reconciled_at,
           next_run_at = COALESCE(p_next_run_at, next_run_at)
     WHERE id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'cron_schedule.not_found' USING ERRCODE = 'no_data_found';
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_numbering_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_remainder text;
BEGIN
    IF regexp_count(NEW.format_template, '\{seq\}') <> 1 THEN
        RAISE EXCEPTION 'Numbering format_template must contain exactly one {seq}' USING ERRCODE = 'check_violation';
    END IF;
    v_remainder := regexp_replace(
        NEW.format_template,
        '\{(seq|yyyy|yy|mm|dd|mmm|fiscal_year|scope|ctx\.[a-z][a-z0-9_]{0,62})\}',
        '',
        'g'
    );
    IF v_remainder ~ '[{}]' THEN
        RAISE EXCEPTION 'Numbering format_template contains an unknown or malformed token' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.format_template ~ '\{(yyyy|yy|mm|dd|mmm)\}' OR NEW.reset_kind LIKE 'calendar_%')
       AND NEW.timezone_code IS NULL THEN
        RAISE EXCEPTION 'Calendar numbering tokens and reset policies require timezone_code' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.format_template ~ '\{fiscal_year\}' AND NEW.reset_kind <> 'fiscal_year' THEN
        RAISE EXCEPTION '{fiscal_year} requires reset_kind=fiscal_year' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_numbering_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id <> OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.policy_code <> OLD.policy_code
       OR NEW.policy_revision <> OLD.policy_revision THEN
        RAISE EXCEPTION 'Numbering policy identity is immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.status = 'active' AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.format_template IS DISTINCT FROM OLD.format_template
        OR NEW.sequence_width IS DISTINCT FROM OLD.sequence_width
        OR NEW.pad_character IS DISTINCT FROM OLD.pad_character
        OR NEW.start_value IS DISTINCT FROM OLD.start_value
        OR NEW.increment_by IS DISTINCT FROM OLD.increment_by
        OR NEW.maximum_value IS DISTINCT FROM OLD.maximum_value
        OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
        OR NEW.reset_kind IS DISTINCT FROM OLD.reset_kind
        OR NEW.timezone_code IS DISTINCT FROM OLD.timezone_code
        OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
        OR NEW.activated_by IS DISTINCT FROM OLD.activated_by
    ) THEN
        RAISE EXCEPTION 'Active numbering policy revisions are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'draft' AND NEW.status IN ('active','retired'))
        OR (OLD.status = 'active' AND NEW.status = 'retired')
    ) THEN
        RAISE EXCEPTION 'Invalid numbering policy status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_rounding_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated rounding rules cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Rounding-rule identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.method IS DISTINCT FROM OLD.method
        OR NEW.precision_digits IS DISTINCT FROM OLD.precision_digits
        OR NEW.rounding_increment IS DISTINCT FROM OLD.rounding_increment
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated rounding decisions are immutable; create a replacement rule'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Archived rounding rules cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active'   AND NEW.status IN ('inactive', 'archived')
            OR OLD.status = 'inactive' AND NEW.status = 'archived'
       ) THEN
        RAISE EXCEPTION 'Invalid activated rounding-rule status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION control.trg_fn_protect_published_policy_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition_status text;
BEGIN
  IF TG_TABLE_NAME = 'policy_definition' THEN definition_status := OLD.status;
  ELSE SELECT status INTO definition_status FROM control.policy_definition WHERE id = OLD.policy_definition_id;
  END IF;
  IF definition_status IN ('published', 'active') THEN
    RAISE EXCEPTION 'Published policy definition revisions and their children are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;
