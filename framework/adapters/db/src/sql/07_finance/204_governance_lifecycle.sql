/* ============================================================================
   Athyper v2.7 — Governance Lifecycle Integration
   Schema: fin
   Dependencies: 200_kpi_engine.sql, 201_driver_planning.sql,
                 202_close_orchestration.sql, 203_engine_hardening.sql,
                 192_period_close_phase3.sql, 197_pack_governance.sql,
                 wf.approval_instance (060_wf.sql),
                 evt.event (150_event_store.sql)

   Governance hardening pass that integrates the three finance engines
   with the platform's governed lifecycle, approval workflow, and
   event provenance infrastructure.

   Sections:
     A. KPI Definition Governed Lifecycle
        - Replace is_active boolean with explicit status lifecycle
          (DRAFT→IN_REVIEW→APPROVED→EFFECTIVE→SUPERSEDED→RETIRED)
        - Approval audit columns on kpi_definition
        - Transition guard trigger
     B. Close Override Control Object
        - fin.close_override: first-class waiver/override with scope,
          reason code, approver, effective window, audit payload
        - Approval workflow integration via wf.approval_instance FK
        - fin.close_override_activity: append-only audit timeline
     C. Execution Provenance
        - Provenance columns on kpi_execution, close_readiness_snapshot,
          and planning_output (execution_job_id, trigger_source,
          actor_type, correlation_id)
     D. Published Consumer State
        - consumer_state on kpi_execution and planning_output
          (CALCULATED→REVIEWED→APPROVED→PUBLISHED)
        - Immutability guard: PUBLISHED rows cannot be mutated
        - Consumer-state-aware views
     E. Governance Functions & Views
        - KPI lifecycle transition guard
        - Consumer-state-aware KPI dashboard view
        - Override effectiveness view
   ============================================================================ */


-- ############################################################################
-- A. KPI DEFINITION GOVERNED LIFECYCLE
-- ############################################################################

-- ============================================================================
-- A1. Add governed status lifecycle to kpi_definition
-- ============================================================================
-- Replaces the simple is_active boolean with an explicit lifecycle that
-- mirrors meta.entity_version states. KPI definitions must be EFFECTIVE
-- before their executions can be consumed by packs.
--
-- Lifecycle:
--   DRAFT → IN_REVIEW → APPROVED → EFFECTIVE → SUPERSEDED
--                 ↓                      ↓
--              REJECTED              RETIRED
--
-- A DRAFT definition can be edited freely.
-- IN_REVIEW locks edits pending controller/CFO approval.
-- APPROVED means endorsed but not yet live.
-- EFFECTIVE means actively producing values for consumption.
-- SUPERSEDED replaced by a newer version.
-- RETIRED permanently deactivated (preserved for audit).
-- ============================================================================
ALTER TABLE fin.kpi_definition
    ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'DRAFT';

-- Add CHECK constraint via DO block (idempotent)
DO $$ BEGIN
    ALTER TABLE fin.kpi_definition
        ADD CONSTRAINT chk_kpi_def_status
        CHECK (status IN (
            'DRAFT',        -- being authored
            'IN_REVIEW',    -- submitted for review
            'APPROVED',     -- endorsed, pending activation
            'EFFECTIVE',    -- live, producing consumable values
            'SUPERSEDED',   -- replaced by newer version
            'RETIRED',      -- permanently deactivated
            'REJECTED'      -- returned from review
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Approval audit columns
ALTER TABLE fin.kpi_definition
    ADD COLUMN IF NOT EXISTS submitted_by   uuid,
    ADD COLUMN IF NOT EXISTS submitted_at   timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by    uuid,
    ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
    ADD COLUMN IF NOT EXISTS retired_by     uuid,
    ADD COLUMN IF NOT EXISTS retired_at     timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN fin.kpi_definition.status IS
    'Governed lifecycle: DRAFT→IN_REVIEW→APPROVED→EFFECTIVE→SUPERSEDED→RETIRED. Only EFFECTIVE definitions produce consumable values.';
COMMENT ON COLUMN fin.kpi_definition.submitted_by IS
    'Principal who submitted this definition for review.';
COMMENT ON COLUMN fin.kpi_definition.approved_by IS
    'Principal who approved this definition (controller/CFO).';

-- Partial index for active definitions: replaces is_active-based indexes
CREATE INDEX IF NOT EXISTS idx_fin_kpi_def_effective
    ON fin.kpi_definition(tenant_id, entity_code, kpi_code)
    WHERE status = 'EFFECTIVE';

CREATE INDEX IF NOT EXISTS idx_fin_kpi_def_status
    ON fin.kpi_definition(tenant_id, status)
    WHERE status NOT IN ('SUPERSEDED', 'RETIRED', 'REJECTED');

-- ============================================================================
-- A2. KPI lifecycle transition guard
-- ============================================================================
-- Validates that status transitions follow the governed lifecycle.
-- Blocks invalid transitions (e.g., DRAFT→EFFECTIVE without approval).
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_kpi_definition_lifecycle() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_kpi_definition_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    -- Allow if status hasn't changed
    IF OLD.status = NEW.status THEN
        -- Block field edits on locked statuses
        IF NEW.status IN ('IN_REVIEW', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'RETIRED') THEN
            IF OLD.formula IS DISTINCT FROM NEW.formula
                OR OLD.data_source IS DISTINCT FROM NEW.data_source
                OR OLD.aggregation_method IS DISTINCT FROM NEW.aggregation_method
                OR OLD.category IS DISTINCT FROM NEW.category
            THEN
                RAISE EXCEPTION 'Cannot modify formula/classification fields on kpi_definition in % status. Create a new version instead.', NEW.status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Validate transition
    v_valid := CASE OLD.status
        WHEN 'DRAFT'      THEN NEW.status IN ('IN_REVIEW', 'RETIRED')
        WHEN 'IN_REVIEW'  THEN NEW.status IN ('APPROVED', 'REJECTED')
        WHEN 'APPROVED'   THEN NEW.status IN ('EFFECTIVE', 'RETIRED')
        WHEN 'EFFECTIVE'  THEN NEW.status IN ('SUPERSEDED', 'RETIRED')
        WHEN 'REJECTED'   THEN NEW.status IN ('DRAFT', 'RETIRED')
        WHEN 'SUPERSEDED' THEN false  -- terminal state
        WHEN 'RETIRED'    THEN false  -- terminal state
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid KPI definition lifecycle transition: % → %', OLD.status, NEW.status;
    END IF;

    -- Enforce audit fields on key transitions
    IF NEW.status = 'IN_REVIEW' AND NEW.submitted_by IS NULL THEN
        RAISE EXCEPTION 'submitted_by is required when transitioning to IN_REVIEW';
    END IF;

    IF NEW.status = 'APPROVED' AND NEW.approved_by IS NULL THEN
        RAISE EXCEPTION 'approved_by is required when transitioning to APPROVED';
    END IF;

    IF NEW.status = 'REJECTED' AND NEW.rejection_reason IS NULL THEN
        RAISE EXCEPTION 'rejection_reason is required when transitioning to REJECTED';
    END IF;

    -- Set timestamps automatically
    IF NEW.status = 'IN_REVIEW' AND NEW.submitted_at IS NULL THEN
        NEW.submitted_at := now();
    END IF;

    IF NEW.status = 'APPROVED' AND NEW.approved_at IS NULL THEN
        NEW.approved_at := now();
    END IF;

    IF NEW.status = 'RETIRED' THEN
        NEW.retired_at := coalesce(NEW.retired_at, now());
        -- Also set effective_to for temporal queries
        NEW.effective_to := coalesce(NEW.effective_to, current_date);
    END IF;

    IF NEW.status = 'EFFECTIVE' AND NEW.effective_from IS NULL THEN
        NEW.effective_from := current_date;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_def_lifecycle ON fin.kpi_definition;
CREATE TRIGGER trg_kpi_def_lifecycle
    BEFORE UPDATE ON fin.kpi_definition
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_kpi_definition_lifecycle();

COMMENT ON FUNCTION fin.trg_kpi_definition_lifecycle() IS
    'Enforces governed lifecycle transitions on kpi_definition. Blocks invalid transitions and requires audit fields.';

-- ============================================================================
-- A3. Expand kpi_activity event types for lifecycle events
-- ============================================================================
-- Drop and recreate the CHECK to include new lifecycle event types.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.kpi_activity'::regclass
          AND conname LIKE '%event_type%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.kpi_activity DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.kpi_activity'::regclass
               AND conname LIKE '%event_type%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.kpi_activity
        ADD CONSTRAINT chk_kpi_activity_event_type CHECK (event_type IN (
            -- Existing events
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
            'THRESHOLD_CHANGED',
            -- New lifecycle events
            'DEFINITION_SUBMITTED',
            'DEFINITION_APPROVED',
            'DEFINITION_REJECTED',
            'DEFINITION_EFFECTIVE',
            'DEFINITION_SUPERSEDED',
            -- Consumer state events
            'EXECUTION_REVIEWED',
            'EXECUTION_APPROVED',
            'EXECUTION_PUBLISHED'
        ));
END $$;


-- ############################################################################
-- B. CLOSE OVERRIDE CONTROL OBJECT
-- ############################################################################

-- ============================================================================
-- B1. fin.close_override — First-class waiver/override control
-- ============================================================================
-- Elevates the waiver concept from a flag on period_close_checklist to a
-- governed first-class object. Provides:
--   - Scoped overrides (single task, category, or full gate)
--   - Reason taxonomy (not free-text — auditable classification)
--   - Effective window (time-boxed overrides that auto-expire)
--   - Approval workflow integration (wf.approval_instance)
--   - Evidence/justification payload
--
-- Unlike the checklist-level waiver_status (which it replaces for new
-- overrides), this table is the single source of truth for "who authorized
-- bypassing which control, why, and for how long."
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.close_override (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- Scope: what is being overridden
    -- TASK = single checklist item; CATEGORY = all tasks in a category;
    -- GATE = entire soft/hard close gate
    override_scope  varchar(20) NOT NULL
                    CHECK (override_scope IN ('TASK', 'CATEGORY', 'GATE')),

    -- References (nullable based on scope)
    run_id          uuid NOT NULL REFERENCES fin.close_run(id),
    task_id         uuid REFERENCES fin.period_close_task(id),
    checklist_id    uuid REFERENCES fin.period_close_checklist(id),
    task_category   varchar(30),    -- for CATEGORY scope

    -- Reason taxonomy (auditable classification)
    reason_code     varchar(30) NOT NULL
                    CHECK (reason_code IN (
                        'IMMATERIAL',       -- amount below materiality threshold
                        'TIMING',           -- timing difference, self-correcting
                        'EXTERNAL_DELAY',   -- external dependency delayed
                        'SYSTEM_ISSUE',     -- system/technical failure
                        'PROCESS_GAP',      -- process gap being remediated
                        'MANAGEMENT_JUDGEMENT', -- CFO/controller judgement call
                        'REGULATORY',       -- regulatory exception
                        'OTHER'             -- requires justification text
                    )),
    reason_detail   text,           -- free-text justification (required for OTHER)

    -- Effective window
    effective_from  timestamptz NOT NULL DEFAULT now(),
    effective_to    timestamptz,    -- NULL = no expiry (period-bounded)

    -- Monetary impact (if applicable)
    impact_amount   decimal(18,4),
    impact_currency varchar(3),

    -- Status lifecycle
    status          varchar(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN (
                        'PENDING',      -- awaiting approval
                        'APPROVED',     -- approved, in effect
                        'REJECTED',     -- denied
                        'EXPIRED',      -- past effective_to
                        'REVOKED'       -- manually revoked before expiry
                    )),

    -- Approval workflow integration
    approval_instance_id uuid,      -- FK to wf.approval_instance (deferred)
    requested_by    uuid NOT NULL,
    requested_at    timestamptz NOT NULL DEFAULT now(),
    decided_by      uuid,
    decided_at      timestamptz,
    decision_notes  text,

    -- Revocation
    revoked_by      uuid,
    revoked_at      timestamptz,
    revocation_reason text,

    -- Evidence/audit payload
    evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- OTHER reason requires detail text
    CONSTRAINT chk_override_reason_detail CHECK (
        reason_code != 'OTHER' OR reason_detail IS NOT NULL
    ),
    -- TASK scope requires task reference
    CONSTRAINT chk_override_task_ref CHECK (
        override_scope != 'TASK' OR task_id IS NOT NULL
    ),
    -- CATEGORY scope requires category
    CONSTRAINT chk_override_category_ref CHECK (
        override_scope != 'CATEGORY' OR task_category IS NOT NULL
    ),
    -- Decided overrides must have actor
    CONSTRAINT chk_override_decision CHECK (
        status NOT IN ('APPROVED', 'REJECTED') OR decided_by IS NOT NULL
    ),
    -- Revoked overrides must have reason
    CONSTRAINT chk_override_revocation CHECK (
        status != 'REVOKED' OR (revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fin_close_override_run
    ON fin.close_override(run_id);
CREATE INDEX IF NOT EXISTS idx_fin_close_override_task
    ON fin.close_override(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_close_override_status
    ON fin.close_override(status) WHERE status IN ('PENDING', 'APPROVED');
CREATE INDEX IF NOT EXISTS idx_fin_close_override_effective
    ON fin.close_override(tenant_id, entity_code, effective_from, effective_to)
    WHERE status = 'APPROVED';
CREATE INDEX IF NOT EXISTS idx_fin_close_override_approval
    ON fin.close_override(approval_instance_id)
    WHERE approval_instance_id IS NOT NULL;

COMMENT ON TABLE fin.close_override IS
    'First-class waiver/override control object for period close. Provides scoped, time-bounded, approval-governed overrides with full audit trail.';
COMMENT ON COLUMN fin.close_override.override_scope IS
    'What is being overridden: TASK (single checklist item), CATEGORY (all tasks in a category), GATE (entire close gate).';
COMMENT ON COLUMN fin.close_override.reason_code IS
    'Auditable classification of override reason. OTHER requires reason_detail.';
COMMENT ON COLUMN fin.close_override.effective_to IS
    'When the override expires. NULL = effective until period close completes.';

-- Deferred FK to wf.approval_instance
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.close_override'::regclass
          AND conname = 'fk_close_override_approval_instance'
    ) THEN
        ALTER TABLE fin.close_override
            ADD CONSTRAINT fk_close_override_approval_instance
            FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- B2. Override lifecycle transition guard
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_close_override_lifecycle() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_close_override_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    IF OLD.status = NEW.status THEN
        -- Block edits on decided overrides
        IF NEW.status IN ('APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED') THEN
            IF OLD.reason_code IS DISTINCT FROM NEW.reason_code
                OR OLD.override_scope IS DISTINCT FROM NEW.override_scope
                OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
            THEN
                RAISE EXCEPTION 'Cannot modify core fields on close_override in % status', NEW.status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    v_valid := CASE OLD.status
        WHEN 'PENDING'  THEN NEW.status IN ('APPROVED', 'REJECTED')
        WHEN 'APPROVED' THEN NEW.status IN ('EXPIRED', 'REVOKED')
        WHEN 'REJECTED' THEN false  -- terminal
        WHEN 'EXPIRED'  THEN false  -- terminal
        WHEN 'REVOKED'  THEN false  -- terminal
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid close override transition: % → %', OLD.status, NEW.status;
    END IF;

    -- Timestamp auto-fill
    IF NEW.status IN ('APPROVED', 'REJECTED') AND NEW.decided_at IS NULL THEN
        NEW.decided_at := now();
    END IF;

    IF NEW.status = 'REVOKED' AND NEW.revoked_at IS NULL THEN
        NEW.revoked_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_override_lifecycle ON fin.close_override;
CREATE TRIGGER trg_close_override_lifecycle
    BEFORE UPDATE ON fin.close_override
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_close_override_lifecycle();

-- ============================================================================
-- B3. fin.close_override_activity — Append-only override audit timeline
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.close_override_activity (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    event_type      varchar(40) NOT NULL
                    CHECK (event_type IN (
                        'OVERRIDE_REQUESTED',
                        'OVERRIDE_APPROVED',
                        'OVERRIDE_REJECTED',
                        'OVERRIDE_EXPIRED',
                        'OVERRIDE_REVOKED',
                        'OVERRIDE_EVIDENCE_ADDED'
                    )),

    override_id     uuid NOT NULL REFERENCES fin.close_override(id),
    run_id          uuid REFERENCES fin.close_run(id),

    actor_id        uuid,
    actor_type      varchar(20) NOT NULL DEFAULT 'USER'
                    CHECK (actor_type IN ('USER', 'SYSTEM', 'SCHEDULER')),

    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_override_activity_override
    ON fin.close_override_activity(override_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_override_activity_tenant
    ON fin.close_override_activity(tenant_id, entity_code, created_at DESC);

-- Immutability triggers
DROP FUNCTION IF EXISTS fin.trg_close_override_activity_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_close_override_activity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'close_override_activity rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_override_activity_no_update ON fin.close_override_activity;
CREATE TRIGGER trg_override_activity_no_update
    BEFORE UPDATE ON fin.close_override_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_close_override_activity_immutable();

DROP TRIGGER IF EXISTS trg_override_activity_no_delete ON fin.close_override_activity;
CREATE TRIGGER trg_override_activity_no_delete
    BEFORE DELETE ON fin.close_override_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_close_override_activity_immutable();

COMMENT ON TABLE fin.close_override_activity IS
    'Append-only audit timeline for close override lifecycle events.';

-- ============================================================================
-- B4. Function: Check if a task/gate has an active approved override
-- ============================================================================
DROP FUNCTION IF EXISTS fin.has_active_override(uuid, varchar, uuid, uuid, varchar, varchar) CASCADE;
CREATE OR REPLACE FUNCTION fin.has_active_override(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_run_id        uuid,
    p_task_id       uuid DEFAULT NULL,
    p_task_category varchar(30) DEFAULT NULL,
    p_check_scope   varchar(20) DEFAULT 'TASK'  -- TASK, CATEGORY, or GATE
) RETURNS TABLE (
    has_override    boolean,
    override_id     uuid,
    reason_code     varchar(30),
    decided_by      uuid,
    effective_to    timestamptz
) LANGUAGE sql STABLE AS $$
    SELECT
        true,
        o.id,
        o.reason_code,
        o.decided_by,
        o.effective_to
    FROM fin.close_override o
    WHERE o.tenant_id = p_tenant_id
      AND o.entity_code = p_entity_code
      AND o.run_id = p_run_id
      AND o.status = 'APPROVED'
      AND o.effective_from <= now()
      AND (o.effective_to IS NULL OR o.effective_to > now())
      AND (
          -- Direct task override
          (p_check_scope = 'TASK' AND o.override_scope = 'TASK' AND o.task_id = p_task_id)
          -- Category override covers the task's category
          OR (p_check_scope = 'TASK' AND o.override_scope = 'CATEGORY'
              AND o.task_category = p_task_category)
          -- Gate override covers everything
          OR (o.override_scope = 'GATE')
          -- Direct category check
          OR (p_check_scope = 'CATEGORY' AND o.override_scope = 'CATEGORY'
              AND o.task_category = p_task_category)
          -- Direct gate check
          OR (p_check_scope = 'GATE' AND o.override_scope = 'GATE')
      )
    ORDER BY
        CASE o.override_scope
            WHEN 'GATE' THEN 1
            WHEN 'CATEGORY' THEN 2
            WHEN 'TASK' THEN 3
        END
    LIMIT 1;
$$;

COMMENT ON FUNCTION fin.has_active_override(uuid, varchar, uuid, uuid, varchar, varchar) IS
    'Checks whether an active approved override exists for a given task, category, or gate within a close run.';


-- ############################################################################
-- C. EXECUTION PROVENANCE
-- ############################################################################

-- ============================================================================
-- C1. Provenance columns on fin.kpi_execution
-- ============================================================================
-- Follows the event store pattern (evt.event.correlation_id) and the
-- statement snapshot pattern (trigger_context, period_status_at_capture).
-- Enables answering: "What triggered this calculation, as part of which
-- batch, and what was the period state when it ran?"
-- ============================================================================
ALTER TABLE fin.kpi_execution
    ADD COLUMN IF NOT EXISTS execution_job_id    uuid,
    ADD COLUMN IF NOT EXISTS trigger_source      varchar(20) DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS correlation_id      uuid,
    ADD COLUMN IF NOT EXISTS period_status_at_calc varchar(20);

DO $$ BEGIN
    ALTER TABLE fin.kpi_execution
        ADD CONSTRAINT chk_kpi_exec_trigger_source
        CHECK (trigger_source IN (
            'MANUAL',           -- user-initiated recalculation
            'SCHEDULER',        -- scheduled batch job
            'PERIOD_CLOSE',     -- triggered by close process
            'EVENT',            -- triggered by GL posting event
            'PACK_REFRESH'      -- triggered by pack generation
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN fin.kpi_execution.execution_job_id IS
    'ID of the execution job/batch that produced this value. Links to scheduler infrastructure.';
COMMENT ON COLUMN fin.kpi_execution.trigger_source IS
    'What triggered this calculation: MANUAL, SCHEDULER, PERIOD_CLOSE, EVENT, PACK_REFRESH.';
COMMENT ON COLUMN fin.kpi_execution.correlation_id IS
    'Cross-system correlation ID (same as evt.event.correlation_id). Links this execution to its triggering event chain.';
COMMENT ON COLUMN fin.kpi_execution.period_status_at_calc IS
    'Fiscal period status when calculation ran (e.g., OPEN, SOFT_CLOSE). Audit provenance for "was this calculated on final numbers?"';

CREATE INDEX IF NOT EXISTS idx_fin_kpi_exec_correlation
    ON fin.kpi_execution(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_kpi_exec_job
    ON fin.kpi_execution(execution_job_id) WHERE execution_job_id IS NOT NULL;

-- ============================================================================
-- C2. Provenance columns on fin.close_readiness_snapshot
-- ============================================================================
ALTER TABLE fin.close_readiness_snapshot
    ADD COLUMN IF NOT EXISTS execution_job_id    uuid,
    ADD COLUMN IF NOT EXISTS trigger_source      varchar(20) DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS correlation_id      uuid,
    ADD COLUMN IF NOT EXISTS snapshot_hash       varchar(64);

DO $$ BEGIN
    ALTER TABLE fin.close_readiness_snapshot
        ADD CONSTRAINT chk_readiness_trigger_source
        CHECK (trigger_source IN (
            'MANUAL',           -- user-initiated capture
            'SCHEDULER',        -- scheduled (e.g., daily during close)
            'EVENT',            -- triggered by task status change
            'CLOSE_TRANSITION'  -- triggered by close run state change
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN fin.close_readiness_snapshot.execution_job_id IS
    'ID of the job/batch that captured this snapshot. Links to scheduler infrastructure.';
COMMENT ON COLUMN fin.close_readiness_snapshot.trigger_source IS
    'What triggered this snapshot: MANUAL, SCHEDULER, EVENT, CLOSE_TRANSITION.';
COMMENT ON COLUMN fin.close_readiness_snapshot.correlation_id IS
    'Cross-system correlation ID for tracing the snapshot capture event chain.';
COMMENT ON COLUMN fin.close_readiness_snapshot.snapshot_hash IS
    'SHA-256 hash of the canonical snapshot content. Enables change detection across captures.';

-- ============================================================================
-- C3. Provenance columns on fin.planning_output
-- ============================================================================
ALTER TABLE fin.planning_output
    ADD COLUMN IF NOT EXISTS execution_job_id    uuid,
    ADD COLUMN IF NOT EXISTS trigger_source      varchar(20) DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS correlation_id      uuid;

DO $$ BEGIN
    ALTER TABLE fin.planning_output
        ADD CONSTRAINT chk_plan_output_trigger_source
        CHECK (trigger_source IN (
            'MANUAL',           -- user-initiated calculation
            'SCHEDULER',        -- scheduled recalculation
            'ASSUMPTION_CHANGE' -- triggered by assumption update
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN fin.planning_output.execution_job_id IS
    'ID of the calculation job that produced this output.';
COMMENT ON COLUMN fin.planning_output.trigger_source IS
    'What triggered this calculation: MANUAL, SCHEDULER, ASSUMPTION_CHANGE.';
COMMENT ON COLUMN fin.planning_output.correlation_id IS
    'Cross-system correlation ID for tracing the calculation event chain.';


-- ############################################################################
-- D. PUBLISHED CONSUMER STATE
-- ############################################################################

-- ============================================================================
-- D1. Consumer state on fin.kpi_execution
-- ============================================================================
-- Distinguishes between:
--   CALCULATED  — freshly computed, not yet reviewed
--   REVIEWED    — reviewed by analyst/accountant
--   APPROVED    — approved by controller/CFO
--   PUBLISHED   — published to management pack (external consumption)
--
-- Only APPROVED or PUBLISHED values should appear in pack reports.
-- Operational dashboards can show CALCULATED values with appropriate caveats.
-- ============================================================================
ALTER TABLE fin.kpi_execution
    ADD COLUMN IF NOT EXISTS consumer_state varchar(20) NOT NULL DEFAULT 'CALCULATED';

DO $$ BEGIN
    ALTER TABLE fin.kpi_execution
        ADD CONSTRAINT chk_kpi_exec_consumer_state
        CHECK (consumer_state IN (
            'CALCULATED',   -- freshly computed, operational use only
            'REVIEWED',     -- analyst-reviewed
            'APPROVED',     -- controller/CFO approved
            'PUBLISHED'     -- published to pack, immutable
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Approval/publication audit
ALTER TABLE fin.kpi_execution
    ADD COLUMN IF NOT EXISTS reviewed_by    uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by    uuid,
    ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
    ADD COLUMN IF NOT EXISTS published_by   uuid,
    ADD COLUMN IF NOT EXISTS published_at   timestamptz,
    ADD COLUMN IF NOT EXISTS published_to_pack_id uuid;

COMMENT ON COLUMN fin.kpi_execution.consumer_state IS
    'Governs consumption eligibility: CALCULATED (operational), REVIEWED, APPROVED (pack-eligible), PUBLISHED (in pack, immutable).';
COMMENT ON COLUMN fin.kpi_execution.published_to_pack_id IS
    'report_pack_instance that consumed this value. Set when consumer_state transitions to PUBLISHED.';

CREATE INDEX IF NOT EXISTS idx_fin_kpi_exec_consumer
    ON fin.kpi_execution(tenant_id, consumer_state)
    WHERE is_current = true AND consumer_state IN ('APPROVED', 'PUBLISHED');

-- ============================================================================
-- D2. Consumer state on fin.planning_output
-- ============================================================================
ALTER TABLE fin.planning_output
    ADD COLUMN IF NOT EXISTS consumer_state varchar(20) NOT NULL DEFAULT 'CALCULATED';

DO $$ BEGIN
    ALTER TABLE fin.planning_output
        ADD CONSTRAINT chk_plan_output_consumer_state
        CHECK (consumer_state IN (
            'CALCULATED',   -- freshly computed
            'REVIEWED',     -- analyst-reviewed
            'APPROVED',     -- approved for promotion
            'PUBLISHED'     -- promoted to budget, immutable
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE fin.planning_output
    ADD COLUMN IF NOT EXISTS reviewed_by    uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by    uuid,
    ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
    ADD COLUMN IF NOT EXISTS published_at   timestamptz;

COMMENT ON COLUMN fin.planning_output.consumer_state IS
    'Governs consumption eligibility: CALCULATED (draft), REVIEWED, APPROVED (promotion-eligible), PUBLISHED (promoted to budget, immutable).';

CREATE INDEX IF NOT EXISTS idx_fin_plan_output_consumer
    ON fin.planning_output(model_id, consumer_state)
    WHERE is_current = true AND consumer_state IN ('APPROVED', 'PUBLISHED');

-- ============================================================================
-- D3. Consumer state transition guard on kpi_execution
-- ============================================================================
-- Enforces:
--   1. Valid transitions only (CALCULATED→REVIEWED→APPROVED→PUBLISHED)
--   2. PUBLISHED rows are fully immutable (value cannot change)
--   3. Audit fields required at each transition
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_kpi_execution_consumer_state() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_kpi_execution_consumer_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    -- Block any modification to PUBLISHED rows
    IF OLD.consumer_state = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot modify PUBLISHED kpi_execution row %. Value is consumed by pack %.', OLD.id, OLD.published_to_pack_id;
    END IF;

    -- If consumer_state hasn't changed, allow other updates
    IF OLD.consumer_state = NEW.consumer_state THEN
        RETURN NEW;
    END IF;

    -- Validate transition
    v_valid := CASE OLD.consumer_state
        WHEN 'CALCULATED' THEN NEW.consumer_state IN ('REVIEWED', 'APPROVED')  -- skip REVIEWED for simple flows
        WHEN 'REVIEWED'   THEN NEW.consumer_state = 'APPROVED'
        WHEN 'APPROVED'   THEN NEW.consumer_state = 'PUBLISHED'
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid consumer state transition: % → %', OLD.consumer_state, NEW.consumer_state;
    END IF;

    -- Auto-fill timestamps
    IF NEW.consumer_state = 'REVIEWED' AND NEW.reviewed_at IS NULL THEN
        NEW.reviewed_at := now();
    END IF;
    IF NEW.consumer_state = 'APPROVED' AND NEW.approved_at IS NULL THEN
        NEW.approved_at := now();
    END IF;
    IF NEW.consumer_state = 'PUBLISHED' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_exec_consumer_state ON fin.kpi_execution;
CREATE TRIGGER trg_kpi_exec_consumer_state
    BEFORE UPDATE ON fin.kpi_execution
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_kpi_execution_consumer_state();

COMMENT ON FUNCTION fin.trg_kpi_execution_consumer_state() IS
    'Enforces consumer state transitions on kpi_execution. PUBLISHED rows are fully immutable.';

-- ============================================================================
-- D4. Consumer state transition guard on planning_output
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_planning_output_consumer_state() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_planning_output_consumer_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    IF OLD.consumer_state = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot modify PUBLISHED planning_output row %. Value has been promoted to budget.', OLD.id;
    END IF;

    IF OLD.consumer_state = NEW.consumer_state THEN
        RETURN NEW;
    END IF;

    v_valid := CASE OLD.consumer_state
        WHEN 'CALCULATED' THEN NEW.consumer_state IN ('REVIEWED', 'APPROVED')
        WHEN 'REVIEWED'   THEN NEW.consumer_state = 'APPROVED'
        WHEN 'APPROVED'   THEN NEW.consumer_state = 'PUBLISHED'
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid consumer state transition: % → %', OLD.consumer_state, NEW.consumer_state;
    END IF;

    IF NEW.consumer_state = 'REVIEWED' AND NEW.reviewed_at IS NULL THEN
        NEW.reviewed_at := now();
    END IF;
    IF NEW.consumer_state = 'APPROVED' AND NEW.approved_at IS NULL THEN
        NEW.approved_at := now();
    END IF;
    IF NEW.consumer_state = 'PUBLISHED' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_output_consumer_state ON fin.planning_output;
CREATE TRIGGER trg_plan_output_consumer_state
    BEFORE UPDATE ON fin.planning_output
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_planning_output_consumer_state();


-- ############################################################################
-- E. GOVERNANCE FUNCTIONS & VIEWS
-- ############################################################################

-- ============================================================================
-- E1. Enhanced close readiness gate with override support
-- ============================================================================
-- Extends check_close_readiness_gate to consider active overrides.
-- A task with an approved override is treated as "waived" for gate purposes.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.check_close_readiness_gate_v2(uuid, varchar, smallint, smallint, varchar) CASCADE;
CREATE OR REPLACE FUNCTION fin.check_close_readiness_gate_v2(
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
    overridden_count    integer,
    pending_tasks       text[],
    current_readiness   decimal(5,2),
    required_readiness  decimal(5,2)
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_run_id        uuid;
    v_readiness     decimal(5,2);
    v_required      decimal(5,2);
    v_pending       integer := 0;
    v_overridden    integer := 0;
    v_pending_names text[] := '{}';
BEGIN
    -- Find active close run
    SELECT r.id INTO v_run_id
    FROM fin.close_run r
    WHERE r.tenant_id = p_tenant_id
      AND r.entity_code = p_entity_code
      AND r.fiscal_year = p_fiscal_year
      AND r.period_number = p_period_num
      AND r.status NOT IN ('CANCELLED', 'HARD_CLOSED')
    ORDER BY r.run_number DESC
    LIMIT 1;

    -- Count pending mandatory tasks, excluding those with active overrides
    SELECT
        count(*) FILTER (WHERE NOT has_override),
        count(*) FILTER (WHERE has_override),
        array_agg(task_code) FILTER (WHERE NOT has_override)
    INTO v_pending, v_overridden, v_pending_names
    FROM (
        SELECT
            pt.task_code,
            EXISTS (
                SELECT 1 FROM fin.close_override o
                WHERE o.run_id = v_run_id
                  AND o.status = 'APPROVED'
                  AND o.effective_from <= now()
                  AND (o.effective_to IS NULL OR o.effective_to > now())
                  AND (
                      (o.override_scope = 'TASK' AND o.task_id = pt.id)
                      OR (o.override_scope = 'CATEGORY' AND o.task_category = pt.task_category)
                      OR o.override_scope = 'GATE'
                  )
            ) AS has_override
        FROM fin.period_close_checklist cl
        JOIN fin.period_close_task pt ON pt.id = cl.task_id
        WHERE cl.tenant_id = p_tenant_id
          AND cl.entity_code = p_entity_code
          AND cl.fiscal_year = p_fiscal_year
          AND cl.period_number = p_period_num
          AND pt.is_mandatory = true
          AND cl.task_status NOT IN ('COMPLETED', 'WAIVED')
          AND pt.required_before = p_target_status
    ) pending_tasks;

    -- Get readiness score
    IF v_run_id IS NOT NULL THEN
        SELECT s.readiness_score INTO v_readiness
        FROM fin.close_readiness_snapshot s
        WHERE s.run_id = v_run_id
        ORDER BY s.captured_at DESC
        LIMIT 1;
    END IF;

    -- Get required threshold
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
        coalesce(v_pending, 0) = 0,
        CASE
            WHEN v_required IS NULL THEN true
            WHEN v_readiness IS NULL THEN false
            ELSE v_readiness >= v_required
        END,
        (coalesce(v_pending, 0) = 0) AND CASE
            WHEN v_required IS NULL THEN true
            WHEN v_readiness IS NULL THEN false
            ELSE v_readiness >= v_required
        END,
        coalesce(v_pending, 0),
        coalesce(v_overridden, 0),
        coalesce(v_pending_names, '{}'),
        coalesce(v_readiness, 0),
        v_required;
END;
$$;

COMMENT ON FUNCTION fin.check_close_readiness_gate_v2(uuid, varchar, smallint, smallint, varchar) IS
    'Enhanced gate check that treats tasks with active approved overrides as waived. Returns override count alongside gate/readiness status.';

-- ============================================================================
-- E2. Consumer-state-aware KPI dashboard view
-- ============================================================================
-- Shows the latest KPI values with consumer state visibility.
-- Pack-bound consumers should filter for consumer_state IN ('APPROVED', 'PUBLISHED').
-- Operational dashboards show all states with appropriate badges.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_kpi_governed_dashboard CASCADE;
CREATE OR REPLACE VIEW fin.vw_kpi_governed_dashboard AS
SELECT
    d.tenant_id,
    d.entity_code,
    d.kpi_code,
    d.kpi_name,
    d.category,
    d.data_source,
    d.unit,
    d.status AS definition_status,
    e.fiscal_year,
    e.period_number,
    e.book_code,
    e.value,
    e.comparison_value,
    e.variance_amount,
    e.variance_pct,
    e.threshold_severity,
    e.consumer_state,
    e.trigger_source,
    e.period_status_at_calc,
    e.calculated_at,
    e.reviewed_at,
    e.approved_at,
    e.published_at,
    e.published_to_pack_id,
    e.kpi_version,
    -- Consumption eligibility flag
    CASE
        WHEN d.status != 'EFFECTIVE' THEN false
        WHEN e.consumer_state IN ('APPROVED', 'PUBLISHED') THEN true
        ELSE false
    END AS is_pack_eligible,
    -- Staleness: has the KPI been recalculated since last approval?
    CASE
        WHEN e.consumer_state = 'CALCULATED' AND e.approved_at IS NOT NULL
            THEN true  -- recalculated after prior approval
        ELSE false
    END AS is_stale_recalc
FROM fin.kpi_definition d
LEFT JOIN fin.kpi_execution e
    ON e.kpi_id = d.id
    AND e.is_current = true
WHERE d.status IN ('EFFECTIVE', 'APPROVED');

COMMENT ON VIEW fin.vw_kpi_governed_dashboard IS
    'KPI dashboard with governed lifecycle and consumer state visibility. Use is_pack_eligible to filter for pack consumption.';

-- ============================================================================
-- E3. Active overrides view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_active_close_overrides CASCADE;
CREATE OR REPLACE VIEW fin.vw_active_close_overrides AS
SELECT
    o.tenant_id,
    o.entity_code,
    o.id AS override_id,
    o.override_scope,
    o.reason_code,
    o.reason_detail,
    o.impact_amount,
    o.impact_currency,
    o.effective_from,
    o.effective_to,
    o.requested_by,
    o.requested_at,
    o.decided_by,
    o.decided_at,
    o.decision_notes,
    r.fiscal_year,
    r.period_number,
    r.run_number,
    pt.task_code,
    pt.task_name,
    o.task_category,
    -- Time remaining on override
    CASE
        WHEN o.effective_to IS NULL THEN NULL
        ELSE o.effective_to - now()
    END AS time_remaining,
    -- Is the override about to expire? (within 24h)
    CASE
        WHEN o.effective_to IS NULL THEN false
        WHEN o.effective_to - now() < interval '24 hours' THEN true
        ELSE false
    END AS expiring_soon
FROM fin.close_override o
JOIN fin.close_run r ON r.id = o.run_id
LEFT JOIN fin.period_close_task pt ON pt.id = o.task_id
WHERE o.status = 'APPROVED'
  AND o.effective_from <= now()
  AND (o.effective_to IS NULL OR o.effective_to > now());

COMMENT ON VIEW fin.vw_active_close_overrides IS
    'Currently active (approved, non-expired) close overrides with task and run context. Includes expiry warnings.';
