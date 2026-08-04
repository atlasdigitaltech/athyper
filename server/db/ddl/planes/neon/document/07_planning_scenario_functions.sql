CREATE OR REPLACE FUNCTION document.trg_validate_planning_scenario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_base document.planning_scenario%ROWTYPE;
BEGIN
    IF NEW.based_on_scenario_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A planning scenario lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_base
          FROM document.planning_scenario
         WHERE tenant_id = NEW.tenant_id
           AND planning_model_id = NEW.planning_model_id
           AND id = NEW.based_on_scenario_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Base planning scenario is outside the model or tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_base.status NOT IN ('approved', 'superseded')
           OR v_base.code <> NEW.code
           OR NEW.version_no <> v_base.version_no + 1 THEN
            RAISE EXCEPTION 'Planning scenario replacement requires an approved prior version and sequential version number'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IN ('approved', 'superseded') AND NOT EXISTS (
        SELECT 1 FROM document.planning_scenario_line AS line
         WHERE line.tenant_id = NEW.tenant_id
           AND line.planning_scenario_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'An approved planning scenario requires at least one line'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_planning_scenario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Submitted planning scenarios cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.based_on_scenario_id IS DISTINCT FROM OLD.based_on_scenario_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Planning scenario identity, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IN ('approved', 'superseded', 'cancelled') AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.probability_weight IS DISTINCT FROM OLD.probability_weight
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Approved, superseded and cancelled planning scenarios are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        OLD.status = 'draft' AND NEW.status IN ('in_review', 'cancelled')
        OR OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved', 'cancelled')
        OR OLD.status = 'approved' AND NEW.status = 'superseded'
    ) THEN
        RAISE EXCEPTION 'Invalid planning scenario status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_planning_scenario_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_scenario_id uuid;
    v_status document.planning_scenario_status_d;
BEGIN
    v_scenario_id := CASE WHEN TG_OP = 'DELETE'
                          THEN OLD.planning_scenario_id
                          ELSE NEW.planning_scenario_id END;
    SELECT status INTO v_status
      FROM document.planning_scenario
     WHERE tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
       AND id = v_scenario_id
     FOR UPDATE;
    IF NOT FOUND OR v_status <> 'draft' THEN
        RAISE EXCEPTION 'Planning scenario lines can only change while the scenario is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.planning_scenario_id IS DISTINCT FROM OLD.planning_scenario_id
        OR NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Planning scenario line ownership and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION document.planning_scenario_input_hash(
    p_tenant_id uuid,
    p_planning_scenario_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, document, public
AS $$
    SELECT encode(
        digest(
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'line_no', line.line_no,
                        'planning_driver_id', line.planning_driver_id,
                        'gl_account_id', line.gl_account_id,
                        'cost_center_id', line.cost_center_id,
                        'profit_center_id', line.profit_center_id,
                        'project_id', line.project_id,
                        'project_wbs_id', line.project_wbs_id,
                        'fiscal_year', line.fiscal_year,
                        'period_number', line.period_number,
                        'currency_code', line.currency_code,
                        'planned_amount', line.planned_amount,
                        'baseline_amount', line.baseline_amount,
                        'source_type', line.source_type,
                        'source_reference_id', line.source_reference_id,
                        'confidence', line.confidence,
                        'metadata', line.metadata
                    ) ORDER BY line.line_no
                )::text,
                '[]'
            ),
            'sha256'
        ),
        'hex'
    )
      FROM document.planning_scenario_line AS line
     WHERE line.tenant_id = p_tenant_id
       AND line.planning_scenario_id = p_planning_scenario_id
$$;
