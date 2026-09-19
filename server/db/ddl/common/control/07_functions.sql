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

    IF TG_TABLE_NAME = 'subscription_plan_usage_limit' THEN
        IF NEW.subscription_plan_id IS DISTINCT FROM OLD.subscription_plan_id
           OR NEW.usage_metric_id IS DISTINCT FROM OLD.usage_metric_id
           OR NEW.dimension_code IS DISTINCT FROM OLD.dimension_code THEN
            RAISE EXCEPTION 'subscription plan usage-limit coordinates are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'tenant_usage_limit_override' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.usage_metric_id IS DISTINCT FROM OLD.usage_metric_id
           OR NEW.dimension_code IS DISTINCT FROM OLD.dimension_code THEN
            RAISE EXCEPTION 'tenant usage-limit override coordinates are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'usage_metric_catalog' THEN
        IF NEW.code IS DISTINCT FROM OLD.code THEN
            RAISE EXCEPTION 'usage metric catalog code is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'deprecated usage controls cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'tenant_usage_limit_override' THEN
        NEW.version := OLD.version + 1;
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

-- Reject JSON that cannot be consumed by the API without non-finite numbers or excess nesting.
CREATE OR REPLACE FUNCTION control.parameter_json_is_api_compatible(p_value jsonb, p_depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE
    v_child jsonb;
    v_number double precision;
BEGIN
    IF p_value IS NULL OR p_depth > 64 THEN RETURN false; END IF;
    CASE jsonb_typeof(p_value)
      WHEN 'number' THEN
        BEGIN
            v_number := p_value::text::double precision;
        EXCEPTION WHEN numeric_value_out_of_range THEN RETURN false;
        END;
        RETURN v_number NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision);
      WHEN 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
            IF NOT control.parameter_json_is_api_compatible(v_child,p_depth+1) THEN RETURN false; END IF;
        END LOOP;
      WHEN 'object' THEN
        FOR v_child IN SELECT value FROM jsonb_each(p_value) LOOP
            IF NOT control.parameter_json_is_api_compatible(v_child,p_depth+1) THEN RETURN false; END IF;
        END LOOP;
      ELSE NULL;
    END CASE;
    RETURN true;
END $$;

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
    v_allowed jsonb;
    v_matches boolean := false;
BEGIN
    IF NOT control.parameter_json_is_api_compatible(p_value)
       OR p_value_type IS NULL OR p_value_type NOT IN ('boolean','integer','number','string','enum','duration','json') THEN
        RETURN false;
    END IF;
    CASE p_value_type
      WHEN 'boolean' THEN IF jsonb_typeof(p_value) <> 'boolean' THEN RETURN false; END IF;
      WHEN 'string' THEN IF jsonb_typeof(p_value) <> 'string' THEN RETURN false; END IF;
      WHEN 'integer' THEN
        IF jsonb_typeof(p_value) <> 'number' THEN RETURN false; END IF;
        v_numeric_value := p_value::text::numeric;
        IF trunc(v_numeric_value) <> v_numeric_value OR abs(v_numeric_value) > 9007199254740991 THEN RETURN false; END IF;
      WHEN 'number' THEN IF jsonb_typeof(p_value) <> 'number' THEN RETURN false; END IF;
      WHEN 'enum' THEN
        IF jsonb_typeof(p_value) NOT IN ('string','number','boolean') OR p_allowed_values IS NULL THEN RETURN false; END IF;
      WHEN 'duration' THEN
        IF jsonb_typeof(p_value) <> 'string' THEN RETURN false; END IF;
        IF (p_value #>> '{}') !~ '^P([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+([.][0-9]+)?S)?)?$'
           OR (p_value #>> '{}') IN ('P','PT') OR (p_value #>> '{}') ~ 'T$' THEN RETURN false; END IF;
      ELSE NULL;
    END CASE;

    -- SQL NULL means no bound. JSON null and non-number bounds are invalid configuration.
    IF p_min_value IS NOT NULL OR p_max_value IS NOT NULL THEN
        IF p_value_type NOT IN ('integer','number') THEN RETURN false; END IF;
        IF p_min_value IS NOT NULL AND (jsonb_typeof(p_min_value) <> 'number'
           OR NOT control.parameter_json_is_api_compatible(p_min_value)) THEN RETURN false; END IF;
        IF p_max_value IS NOT NULL AND (jsonb_typeof(p_max_value) <> 'number'
           OR NOT control.parameter_json_is_api_compatible(p_max_value)) THEN RETURN false; END IF;
        IF p_min_value IS NOT NULL AND p_max_value IS NOT NULL
           AND p_min_value::text::numeric > p_max_value::text::numeric THEN RETURN false; END IF;
        v_numeric_value := p_value::text::numeric;
        IF p_min_value IS NOT NULL AND v_numeric_value < p_min_value::text::numeric THEN RETURN false; END IF;
        IF p_max_value IS NOT NULL AND v_numeric_value > p_max_value::text::numeric THEN RETURN false; END IF;
    END IF;

    IF p_allowed_values IS NOT NULL THEN
        IF jsonb_typeof(p_allowed_values) <> 'array' THEN RETURN false; END IF;
        FOR v_allowed IN SELECT value FROM jsonb_array_elements(p_allowed_values) LOOP
            IF NOT control.parameter_json_is_api_compatible(v_allowed) THEN RETURN false; END IF;
            -- Full jsonb equality preserves array order and scalar types, unlike containment.
            IF v_allowed = p_value THEN v_matches := true; END IF;
        END LOOP;
        IF NOT v_matches THEN RETURN false; END IF;
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

    IF TG_TABLE_NAME IN ('feature_flag_catalog', 'parameter_definition') THEN
        IF NEW.code IS DISTINCT FROM OLD.code THEN
            RAISE EXCEPTION 'catalog code is immutable on %', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'feature_flag_override' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.feature_flag_id IS DISTINCT FROM OLD.feature_flag_id THEN
            RAISE EXCEPTION 'feature-flag override coordinates are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'tenant_parameter_value' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.parameter_definition_id IS DISTINCT FROM OLD.parameter_definition_id THEN
            RAISE EXCEPTION 'tenant parameter-value coordinates are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
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
  ELSE
    SELECT status INTO definition_status FROM control.policy_definition
      WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.policy_definition_id ELSE OLD.policy_definition_id END FOR SHARE;
    IF TG_OP = 'UPDATE' AND NEW.policy_definition_id IS DISTINCT FROM OLD.policy_definition_id THEN
      RAISE EXCEPTION 'Policy children cannot move between revisions' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF definition_status IN ('published', 'active') THEN
    RAISE EXCEPTION 'Published policy definition revisions and their children are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Versions describe the current catalog projection. Historical reads must use
-- snapshot evidence; the adapter never presents today's composition as history.
CREATE OR REPLACE FUNCTION control.trg_version_entitlement_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, control AS $$
BEGIN
    NEW.entitlement_version := OLD.entitlement_version + 1;
    NEW.entitlement_effective_from := greatest(date_trunc('milliseconds', clock_timestamp()), OLD.entitlement_effective_from + interval '1 millisecond');
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.trg_version_entitlement_plan_components()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, control AS $$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
    IF TG_TABLE_NAME IN ('subscription_plan_module', 'subscription_plan_usage_limit') THEN
        UPDATE control.subscription_plan SET entitlement_version = entitlement_version
        WHERE id IN ((v_old->>'subscription_plan_id')::uuid, (v_new->>'subscription_plan_id')::uuid);
    ELSIF TG_TABLE_NAME = 'module' THEN
        UPDATE control.subscription_plan SET entitlement_version = entitlement_version
        WHERE id IN (SELECT subscription_plan_id FROM control.subscription_plan_module
                     WHERE module_id IN ((v_old->>'id')::uuid, (v_new->>'id')::uuid));
    ELSE
        UPDATE control.subscription_plan SET entitlement_version = entitlement_version
        WHERE id IN (SELECT subscription_plan_id FROM control.subscription_plan_usage_limit
                     WHERE usage_metric_id IN ((v_old->>'id')::uuid, (v_new->>'id')::uuid));
    END IF;
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION control.trg_version_entitlement_plan_components() FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.trg_guard_module_entitlement_override()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, control AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.module_id IS DISTINCT FROM OLD.module_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR (OLD.status = 'deprecated' AND NEW.status <> 'deprecated') THEN
        RAISE EXCEPTION 'Module exception identity and terminal lifecycle are immutable' USING ERRCODE='check_violation';
    END IF;
    NEW.version := OLD.version + 1;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.capture_entitlement_plan(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, control, snapshot AS $$
    INSERT INTO snapshot.subscription_plan_entitlement
        (subscription_plan_id, version, code, effective_from, status, modules, limits, dimensions, captured_by)
    SELECT p.id, p.entitlement_version, p.code, p.entitlement_effective_from, p.status,
        coalesce((SELECT jsonb_agg(m.code ORDER BY m.code)
            FROM control.subscription_plan_module pm JOIN control.module m ON m.id=pm.module_id
            WHERE pm.subscription_plan_id=p.id AND pm.status='active'
              AND pm.entitlement_mode='included' AND m.status='active'), '[]'::jsonb),
        coalesce((SELECT jsonb_object_agg(m.code, l.limit_value::text)
            FROM control.subscription_plan_usage_limit l JOIN control.usage_metric_catalog m ON m.id=l.usage_metric_id
            WHERE l.subscription_plan_id=p.id AND l.status='active' AND m.status='active' AND l.dimension_code='*'), '{}'::jsonb),
        coalesce((SELECT jsonb_object_agg(d.code, d.values) FROM (
            SELECT m.code, jsonb_object_agg(l.dimension_code, l.limit_value::text) AS values
            FROM control.subscription_plan_usage_limit l JOIN control.usage_metric_catalog m ON m.id=l.usage_metric_id
            WHERE l.subscription_plan_id=p.id AND l.status='active' AND m.status='active' GROUP BY m.code
        ) d), '{}'::jsonb), coalesce(p.updated_by, p.created_by)
    FROM control.subscription_plan p WHERE p.id=p_id;
$$;
REVOKE ALL ON FUNCTION control.capture_entitlement_plan(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.trg_capture_entitlement_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, control AS $$
BEGIN
    PERFORM control.capture_entitlement_plan(NEW.id);
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION control.trg_capture_entitlement_plan() FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.entitlement_plan_at(p_code text, p_at timestamptz)
RETURNS TABLE (id uuid, code text, version integer, effective_from timestamptz,
    effective_until timestamptz, modules jsonb, limits jsonb, dimensions jsonb)
LANGUAGE sql STABLE SET search_path = pg_catalog, control, snapshot AS $$
    SELECT r.subscription_plan_id, r.code, r.version, r.effective_from, r.effective_until, r.modules, r.limits, r.dimensions
    FROM (
        SELECT s.*, lead(s.effective_from) OVER (PARTITION BY s.subscription_plan_id ORDER BY s.version) AS effective_until
        FROM snapshot.subscription_plan_entitlement s WHERE s.code=p_code
    ) r
    WHERE r.status='active' AND r.effective_from<=p_at AND (r.effective_until IS NULL OR r.effective_until>p_at)
    ORDER BY r.version DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION control.entitlement_plan_at(text,timestamptz) FROM PUBLIC;

-- Runtime commercial availability. This does not grant IAM permission or
-- reserve usage capacity; callers still enforce authorization and metering.
CREATE OR REPLACE FUNCTION control.effective_tenant_entitlement(p_tenant uuid, p_at timestamptz, p_dimension text DEFAULT '*')
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, control, master AS $$
    WITH plan AS MATERIALIZED (
        SELECT h.* FROM master.tenant t JOIN control.subscription_plan p ON p.id=t.subscription_plan_id
        CROSS JOIN LATERAL control.entitlement_plan_at(p.code,p_at) h
        WHERE t.id=p_tenant AND p_tenant=shared.current_tenant_id_soft() AND t.status='active'
    ), base_limits AS (
        SELECT d.key, coalesce(d.value->p_dimension, d.value->'*') AS value
        FROM plan p CROSS JOIN LATERAL jsonb_each(p.dimensions) d
        WHERE d.value ? p_dimension OR d.value ? '*'
    ), usage_exceptions AS MATERIALIZED (
        SELECT DISTINCT ON (m.code) m.code, o.limit_value, o.id, o.version
        FROM control.tenant_usage_limit_override o JOIN control.usage_metric_catalog m ON m.id=o.usage_metric_id
        CROSS JOIN plan p
        WHERE o.tenant_id=p_tenant AND (o.subscription_plan_id=p.id OR o.subscription_plan_id IS NULL)
          AND o.dimension_code IN (p_dimension,'*') AND o.status='active'
          AND o.effective_from<=p_at AND (o.effective_until IS NULL OR o.effective_until>p_at)
          AND p.dimensions ? m.code
        ORDER BY m.code, (o.dimension_code=p_dimension) DESC, o.id
    ), module_exceptions AS MATERIALIZED (
        SELECT m.code, o.id, o.version FROM control.tenant_module_entitlement_override o
        JOIN control.module m ON m.id=o.module_id AND m.status='active' CROSS JOIN plan p
        WHERE o.tenant_id=p_tenant AND o.subscription_plan_id=p.id AND o.status='active'
          AND o.effective_from<=p_at AND (o.effective_until IS NULL OR o.effective_until>p_at)
    ), resolved AS (
        SELECT jsonb_build_object('planCode',p.code,'planId',p.id,'version',p.version,
            'modules', (SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) FROM (
                SELECT jsonb_array_elements_text(p.modules) AS code UNION SELECT code FROM module_exceptions
            ) codes),
            'limits', coalesce((SELECT jsonb_object_agg(key,value) FROM base_limits),'{}'::jsonb)
                || coalesce((SELECT jsonb_object_agg(code,limit_value::text) FROM usage_exceptions),'{}'::jsonb),
            'overrides', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) ORDER BY id),'[]'::jsonb)
                FROM (SELECT id,version FROM usage_exceptions UNION ALL SELECT id,version FROM module_exceptions) x)
        ) AS value FROM plan p
    ) SELECT value || jsonb_build_object('revision',md5(value::text)) FROM resolved;
$$;
REVOKE ALL ON FUNCTION control.effective_tenant_entitlement(uuid,timestamptz,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.trg_guard_feature_override()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.feature_flag_id IS DISTINCT FROM OLD.feature_flag_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR (OLD.status='deprecated' AND NEW.status<>'deprecated') THEN
        RAISE EXCEPTION 'Feature exception identity and terminal lifecycle are immutable' USING ERRCODE='check_violation';
    END IF;
    NEW.version:=OLD.version+1;
    RETURN NEW;
END $$;

-- Catalog writers must deliberately review and identify a cohort cutover.
-- Ordinary tenant override writers have no UPDATE privilege on this catalog.
CREATE OR REPLACE FUNCTION control.trg_guard_feature_cohort()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
DECLARE
    v_actor uuid;
    v_reason text;
    v_audit uuid;
    v_before jsonb;
    v_after jsonb;
    v_invalidation jsonb;
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'Feature cohort identity is immutable; create a new feature' USING ERRCODE='check_violation';
    END IF;
    NEW.cohort_revision := OLD.cohort_revision;
    IF NEW.cohort_strategy IS NOT DISTINCT FROM OLD.cohort_strategy THEN
        IF nullif(current_setting('app.feature_cohort_expected_revision',true),'') IS NOT NULL
           AND current_setting('app.feature_cohort_expected_revision')::integer <> OLD.cohort_revision THEN
            RAISE EXCEPTION 'Feature cohort revision conflict' USING ERRCODE='serialization_failure';
        END IF;
        RETURN NEW;
    END IF;
    v_actor := master.current_principal_id_soft();
    v_reason := btrim(current_setting('app.feature_cohort_change_reason',true));
    IF v_actor IS NULL OR shared.current_tenant_id_soft() IS NULL
       OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'Cohort cutover requires operator tenant, principal and reason' USING ERRCODE='check_violation';
    END IF;
    IF nullif(current_setting('app.feature_cohort_expected_revision',true),'')::integer IS DISTINCT FROM OLD.cohort_revision THEN
        RAISE EXCEPTION 'Feature cohort revision conflict' USING ERRCODE='serialization_failure';
    END IF;
    NEW.cohort_revision := OLD.cohort_revision + 1;
    NEW.updated_at := clock_timestamp();
    NEW.updated_by := v_actor;
    v_before := jsonb_build_object('code',OLD.code,'cohortStrategy',OLD.cohort_strategy,'cohortRevision',OLD.cohort_revision);
    v_after := jsonb_build_object('code',NEW.code,'cohortStrategy',NEW.cohort_strategy,'cohortRevision',NEW.cohort_revision,'reason',v_reason);
    v_invalidation := jsonb_build_object('namespace','features','scope','plane','keys',jsonb_build_array(NEW.code));
    v_audit := audit.append_event(p_event_code=>'control.feature_cohort.changed',p_operation=>'update'::audit.operation_d,
        p_entity_type=>'control.feature_flag_catalog',p_entity_id=>NEW.id,p_old_values=>v_before,p_new_values=>v_after,
        p_context=>jsonb_build_object('plane',current_setting('app.database_plane'),'cacheInvalidation',v_invalidation));
    INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,partition_key,payload,created_by)
    VALUES(shared.current_tenant_id(),'control.features','control.feature_cohort.changed',NEW.id::text || ':cohort:' || NEW.cohort_revision,
        'control.feature_flag_catalog',NEW.id,'control.feature_flag_catalog',NEW.id,v_actor,'control-admin',current_setting('app.database_plane'),
        jsonb_build_object('schemaVersion',1,'plane',current_setting('app.database_plane'),'actorId',v_actor,'auditEventId',v_audit,
            'before',v_before,'after',v_after,'cacheInvalidation',v_invalidation),v_actor);
    RETURN NEW;
END $$;

-- Counters are database-owned; existing identity/lifecycle guards remain in force.
CREATE OR REPLACE FUNCTION control.trg_advance_parameter_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
BEGIN
    IF TG_TABLE_NAME = 'parameter_definition' THEN
        IF TG_OP = 'INSERT' THEN NEW.revision := 1;
        ELSE NEW.revision := OLD.revision + 1;
        END IF;
    ELSIF TG_TABLE_NAME = 'tenant_parameter_value' THEN
        IF TG_OP = 'INSERT' THEN NEW.version := 1;
        ELSE NEW.version := OLD.version + 1;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unexpected parameter version target' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END $$;

-- Narrow locking capability: readers can lock a non-sensitive definition without catalog UPDATE grants.
CREATE OR REPLACE FUNCTION control.lock_parameter_definition(p_id uuid)
RETURNS SETOF control.parameter_definition LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,control AS $$
 SELECT * FROM control.parameter_definition WHERE id=p_id AND NOT is_sensitive FOR SHARE;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_process_publication_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'PROCESS_SELECTION_PUBLICATION_IMMUTABLE' USING ERRCODE='55000';
END;
$$;
