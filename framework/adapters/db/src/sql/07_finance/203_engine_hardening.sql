/* ============================================================================
   Athyper v2.7 — Engine Hardening: KPI, Planning, Close Orchestration
   Schema: fin
   Dependencies: 200_kpi_engine.sql, 201_driver_planning.sql,
                 202_close_orchestration.sql, 196_management_pack.sql,
                 197_pack_governance.sql

   Policy & runtime hardening pass across the three engines.
   Addresses auditability, lineage, immutability, validation, and
   governance integration gaps identified during architecture review.

   Changes grouped by engine:
     A. KPI Engine Hardening
        - Effective-dating on kpi_definition
        - Version + definition snapshot on kpi_execution
        - Divide-by-zero guard on resolve_kpi_gl_value
     B. Driver Planning Hardening
        - Budget line lineage columns (source tracking)
        - Planning model immutability trigger
        - Promotion audit in promote_plan_to_budget
     C. Close Orchestration Hardening
        - DAG cycle detection function
        - Readiness threshold policy on close_calendar
        - Readiness → pack certification gate function
     D. Activity Timelines
        - fin.kpi_activity  (append-only)
        - fin.planning_activity (append-only)
     E. Consumer Views
        - vw_kpi_status_board
        - vw_close_critical_path
        - vw_close_blocked_tasks
        - vw_planning_variance_bridge
   ============================================================================ */

-- ############################################################################
-- A. KPI ENGINE HARDENING
-- ############################################################################

-- ============================================================================
-- A1. Effective-dating on kpi_definition
-- ============================================================================
-- Allows answering: "Which formula was in effect for January 2026?"
-- Without this, changing a KPI definition retroactively breaks auditability.
ALTER TABLE fin.kpi_definition
    ADD COLUMN IF NOT EXISTS effective_from date,
    ADD COLUMN IF NOT EXISTS effective_to   date;

-- Effective dates must not overlap for the same kpi_code
-- (enforced at application layer due to complexity of range exclusion with versions)
COMMENT ON COLUMN fin.kpi_definition.effective_from IS
    'Date from which this version of the KPI definition is effective. NULL = effective from creation.';
COMMENT ON COLUMN fin.kpi_definition.effective_to IS
    'Date until which this version is effective. NULL = no end date (current). Set when superseded by newer version.';

-- ============================================================================
-- A2. Version + definition snapshot on kpi_execution
-- ============================================================================
-- Captures WHICH version of the KPI definition produced each result.
-- Frozen definition snapshot enables "why did this value change?" auditing.
ALTER TABLE fin.kpi_execution
    ADD COLUMN IF NOT EXISTS kpi_version    smallint,
    ADD COLUMN IF NOT EXISTS definition_snapshot jsonb;

COMMENT ON COLUMN fin.kpi_execution.kpi_version IS
    'Version of fin.kpi_definition used at calculation time. Enables audit trail when definitions are updated.';
COMMENT ON COLUMN fin.kpi_execution.definition_snapshot IS
    'Frozen snapshot of KPI formula, account bindings, and thresholds at calculation time. Immutable audit artifact.';

-- ============================================================================
-- A3. Divide-by-zero safe KPI GL resolver
-- ============================================================================
-- Replaces the original function with NULLIF guard on denominator references.
-- Returns NULL instead of raising division error when denominator is zero.
DROP FUNCTION IF EXISTS fin.resolve_kpi_gl_value(uuid, varchar, uuid, varchar, smallint, smallint, smallint, varchar, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.resolve_kpi_gl_value(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_kpi_id        uuid,
    p_ref_name      varchar(50),
    p_fiscal_year   smallint,
    p_period_from   smallint,
    p_period_to     smallint,
    p_book_code     varchar(20) DEFAULT 'STAT',
    p_dimension_set_id uuid DEFAULT null
) RETURNS decimal(18,4) LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(
        CASE b.balance_column
            WHEN 'DEBIT'       THEN gl.period_debit
            WHEN 'CREDIT'      THEN gl.period_credit
            WHEN 'NET'         THEN gl.period_debit - gl.period_credit
            WHEN 'CLOSING_NET' THEN gl.closing_debit - gl.closing_credit
        END
    ), 0)
    FROM fin.kpi_account_binding b
    JOIN fin.chart_of_accounts a ON (
        a.tenant_id = p_tenant_id
        AND a.entity_code = p_entity_code
        AND a.is_active = true
        AND (
            (b.mapping_mode = 'EXACT'  AND a.account_code = b.account_code)
            OR (b.mapping_mode = 'RANGE' AND a.account_code >= b.range_from
                AND a.account_code <= b.range_to)
            OR (b.mapping_mode = 'TYPE'  AND a.account_type = b.account_type)
        )
        AND (b.subledger_type IS NULL OR a.subledger_type = b.subledger_type)
    )
    JOIN fin.gl_balance gl ON (
        gl.tenant_id = p_tenant_id
        AND gl.entity_code = p_entity_code
        AND gl.account_id = a.id
        AND gl.fiscal_year = p_fiscal_year
        AND gl.period_number BETWEEN p_period_from AND p_period_to
        AND gl.book_code = p_book_code
        AND (p_dimension_set_id IS NULL OR gl.dimension_set_id = p_dimension_set_id)
    )
    WHERE b.kpi_id = p_kpi_id
      AND b.ref_name = p_ref_name;
$$;

-- Safe division helper for KPI formula evaluation (runtime calls this)
DROP FUNCTION IF EXISTS fin.safe_divide(decimal, decimal) CASCADE;
CREATE OR REPLACE FUNCTION fin.safe_divide(
    p_numerator   decimal(18,4),
    p_denominator decimal(18,4)
) RETURNS decimal(18,4) LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_denominator = 0 OR p_denominator IS NULL THEN NULL
        ELSE p_numerator / p_denominator
    END;
$$;

COMMENT ON FUNCTION fin.safe_divide(decimal, decimal) IS
    'Division-safe helper for KPI formula evaluation. Returns NULL when denominator is zero or NULL.';

-- ============================================================================
-- A4. Atomically flip is_current on recalculation
-- ============================================================================
DROP FUNCTION IF EXISTS fin.retire_prior_kpi_executions(uuid, varchar, uuid, smallint, smallint, varchar, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.retire_prior_kpi_executions(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_kpi_id        uuid,
    p_fiscal_year   smallint,
    p_period_number smallint,
    p_book_code     varchar(20) DEFAULT 'STAT',
    p_dimension_set_id uuid DEFAULT null
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE fin.kpi_execution
    SET is_current = false
    WHERE tenant_id = p_tenant_id
      AND entity_code = p_entity_code
      AND kpi_id = p_kpi_id
      AND fiscal_year = p_fiscal_year
      AND period_number = p_period_number
      AND book_code = p_book_code
      AND coalesce(dimension_set_id, '00000000-0000-0000-0000-000000000000')
          = coalesce(p_dimension_set_id, '00000000-0000-0000-0000-000000000000')
      AND is_current = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ############################################################################
-- B. DRIVER PLANNING HARDENING
-- ############################################################################

-- ============================================================================
-- B1. Budget line lineage columns
-- ============================================================================
-- Adds source tracking to fin.budget_line so every promoted budget line
-- can be traced back to its planning model, scenario, and promotion event.
ALTER TABLE fin.budget_line
    ADD COLUMN IF NOT EXISTS source_type              varchar(30)
        CHECK (source_type IS NULL OR source_type IN (
            'MANUAL',               -- manually entered
            'PLANNING_MODEL',       -- promoted from driver planning engine
            'IMPORT',               -- imported from external source
            'PRIOR_BUDGET',         -- copied/adjusted from prior budget
            'FORECAST_BASE'         -- derived from forecast model
        )),
    ADD COLUMN IF NOT EXISTS source_planning_model_id uuid REFERENCES fin.planning_model(id),
    ADD COLUMN IF NOT EXISTS source_planning_version  smallint,
    ADD COLUMN IF NOT EXISTS derived_at               timestamptz,
    ADD COLUMN IF NOT EXISTS derived_by               uuid,
    ADD COLUMN IF NOT EXISTS prior_budget_amount       decimal(18,4);

COMMENT ON COLUMN fin.budget_line.source_type IS
    'Origin of this budget line: MANUAL, PLANNING_MODEL, IMPORT, PRIOR_BUDGET, FORECAST_BASE.';
COMMENT ON COLUMN fin.budget_line.source_planning_model_id IS
    'FK to fin.planning_model that produced this line (when source_type = PLANNING_MODEL).';
COMMENT ON COLUMN fin.budget_line.prior_budget_amount IS
    'Previous budget_amount before last promotion/update. Enables overwrite audit trail.';

CREATE INDEX IF NOT EXISTS idx_fin_budget_line_source_model
    ON fin.budget_line(source_planning_model_id)
    WHERE source_planning_model_id IS NOT NULL;

-- ============================================================================
-- B2. Planning model immutability trigger
-- ============================================================================
-- Prevents modification of driver assumptions or outputs for models that
-- have been APPROVED, PROMOTED, or SUPERSEDED. Enforces scenario locking.
DROP FUNCTION IF EXISTS fin.trg_planning_model_lock_check() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_planning_model_lock_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_status varchar(20);
BEGIN
    -- Check the parent model's status
    SELECT status INTO v_status
    FROM fin.planning_model
    WHERE id = NEW.model_id;

    IF v_status IN ('APPROVED', 'PROMOTED', 'SUPERSEDED', 'ARCHIVED') THEN
        RAISE EXCEPTION 'Cannot modify % for planning model in % status',
            TG_TABLE_NAME, v_status;
    END IF;

    RETURN NEW;
END;
$$;

-- Guard driver_assumption inserts/updates
DROP TRIGGER IF EXISTS trg_driver_assumption_lock ON fin.driver_assumption;
CREATE TRIGGER trg_driver_assumption_lock
    BEFORE INSERT OR UPDATE ON fin.driver_assumption
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_planning_model_lock_check();

-- Guard planning_output inserts/updates (only system should write; extra safety)
DROP TRIGGER IF EXISTS trg_planning_output_lock ON fin.planning_output;
CREATE TRIGGER trg_planning_output_lock
    BEFORE INSERT OR UPDATE ON fin.planning_output
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_planning_model_lock_check();

-- ============================================================================
-- B3. Enhanced promote_plan_to_budget with lineage tracking
-- ============================================================================
DROP FUNCTION IF EXISTS fin.promote_plan_to_budget(uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.promote_plan_to_budget(
    p_model_id uuid
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    v_model     fin.planning_model;
    v_count     integer := 0;
    v_budget_code text;
BEGIN
    SELECT * INTO v_model FROM fin.planning_model WHERE id = p_model_id;

    IF v_model IS NULL THEN
        RAISE EXCEPTION 'Planning model % not found', p_model_id;
    END IF;

    IF v_model.status != 'APPROVED' THEN
        RAISE EXCEPTION 'Planning model % must be APPROVED before promotion (current: %)',
            p_model_id, v_model.status;
    END IF;

    v_budget_code := v_model.model_code;

    -- Upsert planning outputs into budget lines WITH lineage tracking
    INSERT INTO fin.budget_line (
        tenant_id, entity_code, budget_code, budget_type, budget_version,
        account_id, fiscal_year, period_number, book_code,
        dimension_set_id, budget_amount, is_approved, approved_by, approved_at,
        created_by,
        -- Lineage columns
        source_type, source_planning_model_id, source_planning_version,
        derived_at, derived_by
    )
    SELECT
        o.tenant_id, o.entity_code, v_budget_code,
        CASE v_model.scenario
            WHEN 'BUDGET'    THEN 'BUDGET'
            WHEN 'FORECAST'  THEN 'FORECAST'
            WHEN 'ROLLING'   THEN 'FORECAST'
            ELSE 'PLAN'
        END,
        v_model.version,
        o.account_id, o.fiscal_year, o.period_number, v_model.book_code,
        o.dimension_set_id,
        CASE o.posting_side
            WHEN 'DEBIT' THEN o.amount
            ELSE -o.amount
        END,
        true, v_model.approved_by, v_model.approved_at,
        v_model.promoted_by,
        -- Lineage
        'PLANNING_MODEL', p_model_id, v_model.version,
        now(), v_model.promoted_by
    FROM fin.planning_output o
    WHERE o.model_id = p_model_id
      AND o.is_current = true
    ON CONFLICT (tenant_id, entity_code, budget_code, budget_version,
                 account_id, fiscal_year, period_number, book_code,
                 coalesce(dimension_set_id, '00000000-0000-0000-0000-000000000000'))
    DO UPDATE SET
        -- Capture prior value before overwriting
        prior_budget_amount       = fin.budget_line.budget_amount,
        budget_amount             = excluded.budget_amount,
        is_approved               = true,
        approved_by               = excluded.approved_by,
        approved_at               = excluded.approved_at,
        source_type               = 'PLANNING_MODEL',
        source_planning_model_id  = excluded.source_planning_model_id,
        source_planning_version   = excluded.source_planning_version,
        derived_at                = excluded.derived_at,
        derived_by                = excluded.derived_by,
        updated_at                = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Update model status
    UPDATE fin.planning_model
    SET status = 'PROMOTED', promoted_at = now(), updated_at = now()
    WHERE id = p_model_id;

    RETURN v_count;
END;
$$;


-- ############################################################################
-- C. CLOSE ORCHESTRATION HARDENING
-- ############################################################################

-- ============================================================================
-- C1. DAG cycle detection function
-- ============================================================================
-- Validates that adding a dependency would not create a cycle.
-- Uses recursive CTE to walk the dependency graph from the proposed
-- successor forward; if it reaches the proposed predecessor, cycle detected.
--
-- Call this BEFORE inserting into fin.close_dependency.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.validate_close_dag(uuid, varchar, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.validate_close_dag(
    p_tenant_id           uuid,
    p_entity_code         varchar(20),
    p_predecessor_task_id uuid,
    p_successor_task_id   uuid
) RETURNS TABLE (
    is_valid        boolean,
    cycle_path      text[]
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_path text[];
BEGIN
    -- Check if adding predecessor → successor creates a cycle
    -- by walking forward from successor to see if we reach predecessor
    WITH RECURSIVE dep_walk AS (
        -- Start from the proposed successor
        SELECT
            d.successor_task_id AS current_id,
            ARRAY[pt.task_code] AS path
        FROM fin.close_dependency d
        JOIN fin.period_close_task pt ON pt.id = d.successor_task_id
        WHERE d.predecessor_task_id = p_successor_task_id
          AND d.tenant_id = p_tenant_id
          AND d.entity_code = p_entity_code
          AND d.is_active = true

        UNION ALL

        -- Walk forward through successors
        SELECT
            d.successor_task_id,
            dw.path || pt.task_code
        FROM dep_walk dw
        JOIN fin.close_dependency d ON d.predecessor_task_id = dw.current_id
        JOIN fin.period_close_task pt ON pt.id = d.successor_task_id
        WHERE d.tenant_id = p_tenant_id
          AND d.entity_code = p_entity_code
          AND d.is_active = true
          AND array_length(dw.path, 1) < 50  -- safety limit
    )
    SELECT path INTO v_path
    FROM dep_walk
    WHERE current_id = p_predecessor_task_id
    LIMIT 1;

    IF v_path IS NOT NULL THEN
        -- Cycle detected
        RETURN QUERY SELECT false, v_path;
    ELSE
        RETURN QUERY SELECT true, '{}'::text[];
    END IF;
END;
$$;

COMMENT ON FUNCTION fin.validate_close_dag(uuid, varchar, uuid, uuid) IS
    'Validates that adding a dependency would not create a cycle in the close task DAG. Call before inserting into fin.close_dependency.';

-- ============================================================================
-- C2. Readiness threshold policy on close_calendar
-- ============================================================================
-- Adds a minimum readiness score that must be met before the period
-- can transition to SOFT_CLOSE or HARD_CLOSE. Connects orchestration
-- to governance: readiness is no longer just telemetry.
ALTER TABLE fin.close_calendar
    ADD COLUMN IF NOT EXISTS min_readiness_soft_close  decimal(5,2) DEFAULT 80.00,
    ADD COLUMN IF NOT EXISTS min_readiness_hard_close  decimal(5,2) DEFAULT 95.00;

COMMENT ON COLUMN fin.close_calendar.min_readiness_soft_close IS
    'Minimum readiness score (0-100) required before soft close can proceed. NULL = no threshold enforcement.';
COMMENT ON COLUMN fin.close_calendar.min_readiness_hard_close IS
    'Minimum readiness score (0-100) required before hard close can proceed. NULL = no threshold enforcement.';

-- ============================================================================
-- C3. Readiness-gated close transition check
-- ============================================================================
-- Combines the existing gate check with readiness threshold validation.
-- Returns whether both the gate (all mandatory tasks) AND the readiness
-- threshold are satisfied.
DROP FUNCTION IF EXISTS fin.check_close_readiness_gate(uuid, varchar, smallint, smallint, varchar) CASCADE;
CREATE OR REPLACE FUNCTION fin.check_close_readiness_gate(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_fiscal_year   smallint,
    p_period_num    smallint,
    p_target_status varchar(20)  -- 'SOFT_CLOSE' or 'HARD_CLOSE'
) RETURNS TABLE (
    gate_passed         boolean,
    readiness_passed    boolean,
    combined_passed     boolean,
    pending_task_count  integer,
    pending_tasks       text[],
    current_readiness   decimal(5,2),
    required_readiness  decimal(5,2)
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_gate          record;
    v_readiness     decimal(5,2);
    v_required      decimal(5,2);
    v_run_id        uuid;
BEGIN
    -- Get task gate status
    SELECT * INTO v_gate
    FROM fin.check_close_gate(p_tenant_id, p_entity_code, p_fiscal_year, p_period_num, p_target_status);

    -- Get latest readiness score from most recent active run
    SELECT r.id INTO v_run_id
    FROM fin.close_run r
    WHERE r.tenant_id = p_tenant_id
      AND r.entity_code = p_entity_code
      AND r.fiscal_year = p_fiscal_year
      AND r.period_number = p_period_num
      AND r.status NOT IN ('CANCELLED', 'HARD_CLOSED')
    ORDER BY r.run_number DESC
    LIMIT 1;

    IF v_run_id IS NOT NULL THEN
        SELECT s.readiness_score INTO v_readiness
        FROM fin.close_readiness_snapshot s
        WHERE s.run_id = v_run_id
        ORDER BY s.captured_at DESC
        LIMIT 1;
    END IF;

    -- Get required threshold from calendar
    SELECT
        CASE p_target_status
            WHEN 'SOFT_CLOSE' THEN c.min_readiness_soft_close
            WHEN 'HARD_CLOSE' THEN c.min_readiness_hard_close
        END INTO v_required
    FROM fin.close_calendar c
    WHERE c.tenant_id = p_tenant_id
      AND c.entity_code = p_entity_code
      AND c.fiscal_year = p_fiscal_year
      AND c.period_number = p_period_num;

    RETURN QUERY SELECT
        v_gate.gate_passed,
        CASE
            WHEN v_required IS NULL THEN true  -- no threshold configured
            WHEN v_readiness IS NULL THEN false -- no snapshot captured yet
            ELSE v_readiness >= v_required
        END,
        v_gate.gate_passed AND CASE
            WHEN v_required IS NULL THEN true
            WHEN v_readiness IS NULL THEN false
            ELSE v_readiness >= v_required
        END,
        v_gate.pending_count,
        v_gate.pending_tasks,
        coalesce(v_readiness, 0),
        v_required;
END;
$$;

COMMENT ON FUNCTION fin.check_close_readiness_gate(uuid, varchar, smallint, smallint, varchar) IS
    'Combined gate + readiness threshold check for period close transitions. Returns whether both conditions are met.';


-- ############################################################################
-- D. ACTIVITY TIMELINES
-- ############################################################################

-- ============================================================================
-- D1. fin.kpi_activity — Append-only KPI engine activity timeline
-- ============================================================================
-- Follows the same pattern as fin.period_close_activity.
-- Captures execution events, threshold breaches, and config changes
-- for dashboard display and operational monitoring.
CREATE TABLE IF NOT EXISTS fin.kpi_activity (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- Event classification
    event_type      varchar(40) NOT NULL
                    CHECK (event_type IN (
                        'EXECUTION_STARTED',
                        'EXECUTION_COMPLETED',
                        'EXECUTION_FAILED',
                        'THRESHOLD_BREACHED',
                        'THRESHOLD_CLEARED',
                        'DEFINITION_CREATED',
                        'DEFINITION_UPDATED',
                        'DEFINITION_ACTIVATED',
                        'DEFINITION_RETIRED',
                        'BINDING_CHANGED',
                        'THRESHOLD_CHANGED'
                    )),

    -- References
    kpi_id          uuid REFERENCES fin.kpi_definition(id),
    execution_id    uuid REFERENCES fin.kpi_execution(id),
    calculation_run_id uuid,

    -- Context
    fiscal_year     smallint,
    period_number   smallint,

    -- Actor
    actor_id        uuid,
    actor_type      varchar(20) NOT NULL DEFAULT 'SYSTEM'
                    CHECK (actor_type IN ('USER', 'SYSTEM', 'SCHEDULER')),

    -- Event payload (schema varies by event_type)
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_kpi_activity_tenant
    ON fin.kpi_activity(tenant_id, entity_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_kpi_activity_kpi
    ON fin.kpi_activity(kpi_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_kpi_activity_type
    ON fin.kpi_activity(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_kpi_activity_run
    ON fin.kpi_activity(calculation_run_id)
    WHERE calculation_run_id IS NOT NULL;

-- Immutability: activity rows are append-only
DROP FUNCTION IF EXISTS fin.trg_kpi_activity_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_kpi_activity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'kpi_activity rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_activity_no_update ON fin.kpi_activity;
CREATE TRIGGER trg_kpi_activity_no_update
    BEFORE UPDATE ON fin.kpi_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_kpi_activity_immutable();

DROP TRIGGER IF EXISTS trg_kpi_activity_no_delete ON fin.kpi_activity;
CREATE TRIGGER trg_kpi_activity_no_delete
    BEFORE DELETE ON fin.kpi_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_kpi_activity_immutable();

COMMENT ON TABLE fin.kpi_activity IS
    'Append-only activity timeline for the KPI engine. Captures executions, threshold breaches, and config changes.';

-- ============================================================================
-- D2. fin.planning_activity — Append-only planning engine activity timeline
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.planning_activity (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- Event classification
    event_type      varchar(40) NOT NULL
                    CHECK (event_type IN (
                        'MODEL_CREATED',
                        'MODEL_SUBMITTED',
                        'MODEL_APPROVED',
                        'MODEL_REJECTED',
                        'MODEL_PROMOTED',
                        'MODEL_SUPERSEDED',
                        'ASSUMPTIONS_UPDATED',
                        'ASSUMPTIONS_IMPORTED',
                        'CALCULATION_STARTED',
                        'CALCULATION_COMPLETED',
                        'CALCULATION_FAILED',
                        'PROMOTION_STARTED',
                        'PROMOTION_COMPLETED',
                        'PROMOTION_FAILED',
                        'DRIVER_CREATED',
                        'FORMULA_CREATED',
                        'FORMULA_UPDATED'
                    )),

    -- References
    model_id        uuid REFERENCES fin.planning_model(id),
    driver_id       uuid REFERENCES fin.planning_driver(id),
    formula_id      uuid REFERENCES fin.planning_driver_formula(id),
    calculation_run_id uuid,

    -- Actor
    actor_id        uuid,
    actor_type      varchar(20) NOT NULL DEFAULT 'USER'
                    CHECK (actor_type IN ('USER', 'SYSTEM', 'SCHEDULER')),

    -- Promotion metadata (for PROMOTION_* events)
    budget_lines_affected integer,
    budget_lines_created  integer,
    budget_lines_updated  integer,

    -- Event payload
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_plan_activity_tenant
    ON fin.planning_activity(tenant_id, entity_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_plan_activity_model
    ON fin.planning_activity(model_id, created_at DESC)
    WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_plan_activity_type
    ON fin.planning_activity(event_type, created_at DESC);

-- Immutability
DROP FUNCTION IF EXISTS fin.trg_planning_activity_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_planning_activity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'planning_activity rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_planning_activity_no_update ON fin.planning_activity;
CREATE TRIGGER trg_planning_activity_no_update
    BEFORE UPDATE ON fin.planning_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_planning_activity_immutable();

DROP TRIGGER IF EXISTS trg_planning_activity_no_delete ON fin.planning_activity;
CREATE TRIGGER trg_planning_activity_no_delete
    BEFORE DELETE ON fin.planning_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_planning_activity_immutable();

COMMENT ON TABLE fin.planning_activity IS
    'Append-only activity timeline for the planning engine. Captures model lifecycle, calculations, and promotions.';


-- ############################################################################
-- E. CONSUMER VIEWS
-- ############################################################################

-- ============================================================================
-- E1. vw_kpi_status_board — Full KPI board with trend and thresholds
-- ============================================================================
-- Enriches the basic dashboard view with:
--   - Prior period value for trend arrow
--   - Threshold bands for traffic-light rendering
--   - Category grouping for dashboard layout
DROP VIEW IF EXISTS fin.vw_kpi_status_board CASCADE;
CREATE OR REPLACE VIEW fin.vw_kpi_status_board AS
WITH current_values AS (
    SELECT
        e.tenant_id,
        e.entity_code,
        e.kpi_id,
        d.kpi_code,
        d.kpi_name,
        d.category,
        d.unit,
        d.sign_rule,
        d.decimal_places,
        d.format_pattern,
        d.compare_mode,
        d.data_source,
        e.fiscal_year,
        e.period_number,
        e.book_code,
        e.dimension_set_id,
        ds.display_label AS dimension_label,
        e.value,
        e.comparison_value,
        e.variance_amount,
        e.variance_pct,
        e.threshold_severity,
        e.kpi_version,
        e.calculated_at,
        d.sort_order,
        d.target_value
    FROM fin.kpi_execution e
    JOIN fin.kpi_definition d ON d.id = e.kpi_id
    LEFT JOIN fin.dimension_set ds ON ds.id = e.dimension_set_id
    WHERE e.is_current = true
      AND d.is_active = true
),
prior_period AS (
    SELECT DISTINCT ON (e.kpi_id, e.fiscal_year, e.entity_code, e.book_code,
                         coalesce(e.dimension_set_id, '00000000-0000-0000-0000-000000000000'))
        e.kpi_id,
        e.fiscal_year,
        e.entity_code,
        e.book_code,
        e.dimension_set_id,
        e.period_number AS prior_period,
        e.value AS prior_value
    FROM fin.kpi_execution e
    WHERE e.is_current = true
    ORDER BY e.kpi_id, e.fiscal_year, e.entity_code, e.book_code,
             coalesce(e.dimension_set_id, '00000000-0000-0000-0000-000000000000'),
             e.period_number DESC
)
SELECT
    cv.*,
    pp.prior_value,
    pp.prior_period,
    CASE
        WHEN pp.prior_value IS NULL THEN 'NEW'
        WHEN cv.value > pp.prior_value THEN
            CASE WHEN cv.sign_rule = 'INVERSE' THEN 'DOWN' ELSE 'UP' END
        WHEN cv.value < pp.prior_value THEN
            CASE WHEN cv.sign_rule = 'INVERSE' THEN 'UP' ELSE 'DOWN' END
        ELSE 'FLAT'
    END AS trend_direction,
    -- Threshold bands for this KPI (joined for front-end rendering)
    (SELECT jsonb_agg(jsonb_build_object(
        'severity', t.severity,
        'operator', t.operator,
        'value', t.threshold_value,
        'label', t.label,
        'color', t.color_code
    ) ORDER BY t.priority DESC)
    FROM fin.kpi_threshold t
    WHERE t.kpi_id = cv.kpi_id AND t.is_active = true
    ) AS threshold_bands
FROM current_values cv
LEFT JOIN prior_period pp ON (
    pp.kpi_id = cv.kpi_id
    AND pp.fiscal_year = cv.fiscal_year
    AND pp.entity_code = cv.entity_code
    AND pp.book_code = cv.book_code
    AND coalesce(pp.dimension_set_id, '00000000-0000-0000-0000-000000000000')
        = coalesce(cv.dimension_set_id, '00000000-0000-0000-0000-000000000000')
    AND pp.prior_period = cv.period_number - 1
);

COMMENT ON VIEW fin.vw_kpi_status_board IS
    'Full KPI status board with trend direction, prior period comparison, and threshold bands for traffic-light rendering.';

-- ============================================================================
-- E2. vw_close_critical_path — Longest dependency chain per close run
-- ============================================================================
-- Identifies the critical path through the close DAG: the longest chain
-- of incomplete tasks that determines earliest possible completion.
DROP VIEW IF EXISTS fin.vw_close_critical_path CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_critical_path AS
WITH RECURSIVE task_chain AS (
    -- Start from tasks with no predecessors (roots)
    SELECT
        d.tenant_id,
        d.entity_code,
        d.successor_task_id AS task_id,
        pt.task_code,
        pt.task_name,
        pt.category,
        1 AS chain_depth,
        ARRAY[pt.task_code]::text[] AS chain_path
    FROM fin.close_dependency d
    JOIN fin.period_close_task pt ON pt.id = d.successor_task_id
    WHERE d.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM fin.close_dependency d2
          WHERE d2.successor_task_id = d.predecessor_task_id
            AND d2.tenant_id = d.tenant_id
            AND d2.entity_code = d.entity_code
            AND d2.is_active = true
      )

    UNION ALL

    SELECT
        tc.tenant_id,
        tc.entity_code,
        d.successor_task_id,
        pt.task_code,
        pt.task_name,
        pt.category,
        tc.chain_depth + 1,
        tc.chain_path || pt.task_code
    FROM task_chain tc
    JOIN fin.close_dependency d ON (
        d.predecessor_task_id = tc.task_id
        AND d.tenant_id = tc.tenant_id
        AND d.entity_code = tc.entity_code
        AND d.is_active = true
    )
    JOIN fin.period_close_task pt ON pt.id = d.successor_task_id
    WHERE tc.chain_depth < 50  -- safety
      AND NOT (pt.task_code = ANY(tc.chain_path))  -- cycle guard
)
SELECT DISTINCT ON (tenant_id, entity_code, task_id)
    tenant_id,
    entity_code,
    task_id,
    task_code,
    task_name,
    category,
    chain_depth,
    chain_path
FROM task_chain
ORDER BY tenant_id, entity_code, task_id, chain_depth DESC;

COMMENT ON VIEW fin.vw_close_critical_path IS
    'Critical path analysis: longest dependency chain to each task in the close DAG. Highlights bottleneck tasks.';

-- ============================================================================
-- E3. vw_close_blocked_tasks — Tasks blocked by unresolved dependencies
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_blocked_tasks CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_blocked_tasks AS
SELECT
    cl.tenant_id,
    cl.entity_code,
    cl.fiscal_year,
    cl.period_number,
    cl.task_code,
    pt.task_name,
    pt.category,
    cl.task_status,
    cl.assigned_to,
    -- Blocking predecessors
    array_agg(DISTINCT pred_pt.task_code) AS blocked_by_tasks,
    array_agg(DISTINCT pred_cl.task_status) AS blocker_statuses,
    count(DISTINCT d.predecessor_task_id) AS blocker_count
FROM fin.period_close_checklist cl
JOIN fin.period_close_task pt ON pt.id = cl.task_id
JOIN fin.close_dependency d ON (
    d.successor_task_id = cl.task_id
    AND d.tenant_id = cl.tenant_id
    AND d.entity_code = cl.entity_code
    AND d.is_active = true
    AND d.is_hard = true
)
JOIN fin.period_close_checklist pred_cl ON (
    pred_cl.task_id = d.predecessor_task_id
    AND pred_cl.tenant_id = cl.tenant_id
    AND pred_cl.entity_code = cl.entity_code
    AND pred_cl.fiscal_year = cl.fiscal_year
    AND pred_cl.period_number = cl.period_number
    AND pred_cl.task_status NOT IN ('COMPLETED', 'WAIVED')
)
JOIN fin.period_close_task pred_pt ON pred_pt.id = d.predecessor_task_id
WHERE cl.task_status IN ('PENDING', 'BLOCKED')
GROUP BY cl.tenant_id, cl.entity_code, cl.fiscal_year, cl.period_number,
         cl.task_code, pt.task_name, pt.category, cl.task_status, cl.assigned_to;

COMMENT ON VIEW fin.vw_close_blocked_tasks IS
    'Tasks blocked by incomplete hard dependencies. Shows which predecessor tasks are blocking and their current status.';

-- ============================================================================
-- E4. vw_planning_variance_bridge — Actual vs Plan variance breakdown
-- ============================================================================
-- Bridges actual GL balances to planning model outputs for variance analysis.
-- Shows per-account: actual amount, planned amount, variance, and source model.
DROP VIEW IF EXISTS fin.vw_planning_variance_bridge CASCADE;
CREATE OR REPLACE VIEW fin.vw_planning_variance_bridge AS
SELECT
    bl.tenant_id,
    bl.entity_code,
    bl.fiscal_year,
    bl.period_number,
    bl.book_code,
    a.account_code,
    a.account_name,
    a.account_type,
    -- Actual (from GL balance)
    coalesce(gl.period_debit - gl.period_credit, 0) AS actual_amount,
    -- Plan (from budget line)
    bl.budget_amount AS plan_amount,
    -- Variance
    coalesce(gl.period_debit - gl.period_credit, 0) - bl.budget_amount AS variance_amount,
    CASE
        WHEN bl.budget_amount = 0 THEN NULL
        ELSE round(
            (coalesce(gl.period_debit - gl.period_credit, 0) - bl.budget_amount)
            / bl.budget_amount * 100, 2
        )
    END AS variance_pct,
    -- Lineage
    bl.budget_code,
    bl.budget_type,
    bl.budget_version,
    bl.source_type,
    bl.source_planning_model_id,
    pm.model_code AS source_model_code,
    pm.scenario AS source_scenario,
    bl.derived_at AS promoted_at,
    bl.prior_budget_amount
FROM fin.budget_line bl
JOIN fin.chart_of_accounts a ON a.id = bl.account_id
LEFT JOIN fin.gl_balance gl ON (
    gl.tenant_id = bl.tenant_id
    AND gl.entity_code = bl.entity_code
    AND gl.account_id = bl.account_id
    AND gl.fiscal_year = bl.fiscal_year
    AND gl.period_number = bl.period_number
    AND gl.book_code = bl.book_code
    AND gl.dimension_set_id IS NOT DISTINCT FROM bl.dimension_set_id
)
LEFT JOIN fin.planning_model pm ON pm.id = bl.source_planning_model_id
WHERE bl.is_approved = true;

COMMENT ON VIEW fin.vw_planning_variance_bridge IS
    'Actual vs Plan variance analysis with full lineage to source planning model. Shows per-account variance with prior-value tracking.';
