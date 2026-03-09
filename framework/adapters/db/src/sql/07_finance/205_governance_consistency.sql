/* ============================================================================
   Athyper v2.7 — Governance Consistency Hardening
   Schema: fin
   Dependencies: 200_kpi_engine.sql, 201_driver_planning.sql,
                 202_close_orchestration.sql, 203_engine_hardening.sql,
                 204_governance_lifecycle.sql, 197_pack_governance.sql,
                 wf.approval_instance (060_wf.sql)

   Closes governance asymmetries and structural gaps identified during
   architecture review of the 204 governance lifecycle layer.

   Sections:
     A. KPI Effective-Version Exclusivity
        - Trigger to enforce single EFFECTIVE version per KPI identity
        - Automatic SUPERSEDED transition on prior version
     B. Planning Model Lifecycle Governance Parity
        - Add REJECTED + RETIRED states (KPI parity)
        - Transition guard trigger on planning_model itself
        - rejection_reason, approval_instance_id
        - Edit lock on planning_model core fields
     C. Publication Batch Grouping
        - fin.publication_batch: governed publication event
        - publication_batch_id on kpi_execution and planning_output
        - Links pack certification to publication lineage
     D. Override Reason Enrichment & Transition Applicability
        - reason_subcode for structured drill-down
        - Mandatory impact_amount for IMMATERIAL overrides
        - applies_to_transition on close_override
     E. Automatic Governance Activity Emission
        - Trigger-backed activity rows on lifecycle transitions
        - KPI definition lifecycle → kpi_activity
        - Planning model lifecycle → planning_activity
        - Close override lifecycle → close_override_activity
        - Consumer state transitions → respective activity tables
   ============================================================================ */


-- ############################################################################
-- A. KPI EFFECTIVE-VERSION EXCLUSIVITY
-- ############################################################################

-- ============================================================================
-- A1. Enforce single EFFECTIVE version per KPI identity
-- ============================================================================
-- For a given (tenant_id, entity_code, kpi_code), at most one row may
-- have status = 'EFFECTIVE' at any point in time. Without this, runtime
-- resolution is ambiguous: which formula applies for "Gross Margin %"?
--
-- Strategy: BEFORE UPDATE trigger that, when a KPI is set to EFFECTIVE,
-- automatically transitions the prior EFFECTIVE version to SUPERSEDED.
-- This is safer than a partial unique index because it handles the
-- transition atomically rather than requiring two separate UPDATE calls.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_kpi_effective_exclusivity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_kpi_effective_exclusivity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_prior_id   uuid;
    v_prior_ver  smallint;
BEGIN
    -- Only act when transitioning TO 'EFFECTIVE'
    IF NEW.status != 'EFFECTIVE' OR OLD.status = 'EFFECTIVE' THEN
        RETURN NEW;
    END IF;

    -- Find and supersede any existing EFFECTIVE version for same identity
    SELECT id, version INTO v_prior_id, v_prior_ver
    FROM fin.kpi_definition
    WHERE tenant_id = NEW.tenant_id
      AND entity_code = NEW.entity_code
      AND kpi_code = NEW.kpi_code
      AND status = 'EFFECTIVE'
      AND id != NEW.id
    FOR UPDATE;  -- lock to prevent race conditions

    IF v_prior_id IS NOT NULL THEN
        UPDATE fin.kpi_definition
        SET status = 'SUPERSEDED',
            effective_to = coalesce(NEW.effective_from, current_date),
            updated_at = now()
        WHERE id = v_prior_id;

        -- The superseded row's lifecycle trigger will fire and validate
        -- EFFECTIVE → SUPERSEDED (which is a valid transition).
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_effective_exclusivity ON fin.kpi_definition;
CREATE TRIGGER trg_kpi_effective_exclusivity
    BEFORE UPDATE ON fin.kpi_definition
    FOR EACH ROW
    WHEN (NEW.status = 'EFFECTIVE')
    EXECUTE FUNCTION fin.trg_kpi_effective_exclusivity();

COMMENT ON FUNCTION fin.trg_kpi_effective_exclusivity() IS
    'Enforces single-EFFECTIVE-version-per-KPI-identity. Automatically supersedes the prior EFFECTIVE version when a new one activates.';

-- Safety net: partial unique index as belt-and-suspenders
-- This catches any edge case where the trigger doesn't fire
-- (e.g., direct INSERT with status='EFFECTIVE').
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_kpi_def_one_effective
    ON fin.kpi_definition(tenant_id, entity_code, kpi_code)
    WHERE status = 'EFFECTIVE';


-- ############################################################################
-- B. PLANNING MODEL LIFECYCLE GOVERNANCE PARITY
-- ############################################################################

-- ============================================================================
-- B1. Expand planning_model status CHECK to include REJECTED + RETIRED
-- ============================================================================
-- Current: DRAFT, IN_REVIEW, APPROVED, PROMOTED, SUPERSEDED, ARCHIVED
-- Adding:  REJECTED (returned from review), RETIRED (permanent deactivation)
--
-- This closes the governance asymmetry with kpi_definition which has both.
-- REJECTED allows the review→reject→revise→resubmit cycle.
-- RETIRED is a terminal state distinct from ARCHIVED (RETIRED = policy
-- decision, ARCHIVED = housekeeping).
-- ============================================================================
DO $$ BEGIN
    -- Drop existing CHECK constraint on status
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.planning_model'::regclass
          AND conname LIKE '%status%'
          AND contype = 'c'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.planning_model DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.planning_model'::regclass
               AND conname LIKE '%status%'
               AND contype = 'c'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.planning_model
        ADD CONSTRAINT chk_plan_model_status CHECK (status IN (
            'DRAFT',        -- being built
            'IN_REVIEW',    -- submitted for review
            'APPROVED',     -- approved by controller/CFO
            'PROMOTED',     -- promoted to fin.budget_line
            'SUPERSEDED',   -- replaced by newer version
            'ARCHIVED',     -- housekeeping archive
            'REJECTED',     -- returned from review
            'RETIRED'       -- permanent policy deactivation
        ));
END $$;

-- ============================================================================
-- B2. Add governance audit columns to planning_model
-- ============================================================================
ALTER TABLE fin.planning_model
    ADD COLUMN IF NOT EXISTS rejection_reason     text,
    ADD COLUMN IF NOT EXISTS retired_by           uuid,
    ADD COLUMN IF NOT EXISTS retired_at           timestamptz,
    ADD COLUMN IF NOT EXISTS approval_instance_id uuid;

COMMENT ON COLUMN fin.planning_model.rejection_reason IS
    'Reason for rejection when status transitions to REJECTED. Required by transition guard.';
COMMENT ON COLUMN fin.planning_model.retired_by IS
    'Principal who retired this model.';
COMMENT ON COLUMN fin.planning_model.approval_instance_id IS
    'FK to wf.approval_instance for formal approval workflow integration.';

-- Index for approval instance lookup
CREATE INDEX IF NOT EXISTS idx_fin_plan_model_approval
    ON fin.planning_model(approval_instance_id)
    WHERE approval_instance_id IS NOT NULL;

-- Deferred FK to wf.approval_instance
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.planning_model'::regclass
          AND conname = 'fk_plan_model_approval_instance'
    ) THEN
        ALTER TABLE fin.planning_model
            ADD CONSTRAINT fk_plan_model_approval_instance
            FOREIGN KEY (approval_instance_id) REFERENCES wf.approval_instance(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- B3. Planning model lifecycle transition guard
-- ============================================================================
-- Validates status transitions, blocks invalid paths, requires audit fields.
-- Mirrors the KPI definition lifecycle guard from 204.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_planning_model_lifecycle() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_planning_model_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    -- Allow if status hasn't changed
    IF OLD.status = NEW.status THEN
        -- Block core field edits on locked statuses
        IF NEW.status IN ('APPROVED', 'PROMOTED', 'SUPERSEDED', 'RETIRED') THEN
            IF OLD.scenario IS DISTINCT FROM NEW.scenario
                OR OLD.fiscal_year IS DISTINCT FROM NEW.fiscal_year
                OR OLD.period_from IS DISTINCT FROM NEW.period_from
                OR OLD.period_to IS DISTINCT FROM NEW.period_to
                OR OLD.book_code IS DISTINCT FROM NEW.book_code
            THEN
                RAISE EXCEPTION 'Cannot modify core fields on planning_model in % status. Create a new version instead.', NEW.status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Validate transition
    v_valid := CASE OLD.status
        WHEN 'DRAFT'      THEN NEW.status IN ('IN_REVIEW', 'RETIRED')
        WHEN 'IN_REVIEW'  THEN NEW.status IN ('APPROVED', 'REJECTED')
        WHEN 'APPROVED'   THEN NEW.status IN ('PROMOTED', 'RETIRED')
        WHEN 'PROMOTED'   THEN NEW.status IN ('SUPERSEDED', 'ARCHIVED')
        WHEN 'REJECTED'   THEN NEW.status IN ('DRAFT', 'RETIRED')
        WHEN 'SUPERSEDED' THEN NEW.status = 'ARCHIVED'  -- only archive allowed
        WHEN 'ARCHIVED'   THEN false  -- terminal
        WHEN 'RETIRED'    THEN false  -- terminal
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid planning model lifecycle transition: % → %', OLD.status, NEW.status;
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

    IF NEW.status = 'PROMOTED' AND NEW.promoted_at IS NULL THEN
        NEW.promoted_at := now();
    END IF;

    IF NEW.status = 'RETIRED' THEN
        NEW.retired_at := coalesce(NEW.retired_at, now());
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planning_model_lifecycle ON fin.planning_model;
CREATE TRIGGER trg_planning_model_lifecycle
    BEFORE UPDATE ON fin.planning_model
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_planning_model_lifecycle();

COMMENT ON FUNCTION fin.trg_planning_model_lifecycle() IS
    'Enforces governed lifecycle transitions on planning_model. Blocks invalid transitions, requires audit fields, auto-fills timestamps.';

-- ============================================================================
-- B4. Expand planning_activity event types
-- ============================================================================
-- Add REJECTED, RETIRED, and consumer-state events.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.planning_activity'::regclass
          AND conname LIKE '%event_type%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.planning_activity DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.planning_activity'::regclass
               AND conname LIKE '%event_type%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.planning_activity
        ADD CONSTRAINT chk_plan_activity_event_type CHECK (event_type IN (
            -- Existing events
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
            'FORMULA_UPDATED',
            -- New lifecycle events
            'MODEL_RETIRED',
            'MODEL_ARCHIVED',
            -- Consumer state events
            'OUTPUT_REVIEWED',
            'OUTPUT_APPROVED',
            'OUTPUT_PUBLISHED',
            -- Publication batch events
            'PUBLICATION_BATCH_CREATED',
            'PUBLICATION_BATCH_FINALIZED'
        ));
END $$;


-- ############################################################################
-- C. PUBLICATION BATCH GROUPING
-- ############################################################################

-- ============================================================================
-- C1. fin.publication_batch — Governed publication event
-- ============================================================================
-- Groups multiple KPI executions and/or planning outputs into a single
-- governed publication event. This is the "publish to pack" action that
-- atomically transitions N items from APPROVED → PUBLISHED.
--
-- Aligns with pack_certification's sign-off model: the batch is the
-- unit of governance, not individual rows.
--
-- Example: "FY2026 P3 KPI Publish — March Close Pack"
--   → publishes 24 KPI executions + 12 planning outputs
--   → all linked to one pack_instance
--   → signed off by CFO
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.publication_batch (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- Identity
    batch_code      varchar(50) NOT NULL,
    description     text,

    -- Context
    fiscal_year     smallint NOT NULL,
    period_number   smallint NOT NULL,
    book_code       varchar(20) NOT NULL DEFAULT 'STAT',

    -- What this batch contains
    batch_type      varchar(20) NOT NULL DEFAULT 'MIXED'
                    CHECK (batch_type IN (
                        'KPI',          -- KPI executions only
                        'PLANNING',     -- planning outputs only
                        'MIXED'         -- both
                    )),

    -- Target pack (optional — not all publications target a pack)
    pack_instance_id uuid,  -- FK to fin.report_pack_instance (deferred)

    -- Status lifecycle
    status          varchar(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN (
                        'DRAFT',        -- being assembled
                        'FINALIZED',    -- items locked, ready for sign-off
                        'PUBLISHED',    -- signed off, items transitioned to PUBLISHED
                        'SUPERSEDED'    -- replaced by a correction batch
                    )),

    -- Counts (materialized for dashboard display)
    kpi_item_count      integer NOT NULL DEFAULT 0,
    planning_item_count integer NOT NULL DEFAULT 0,

    -- Governance
    finalized_by    uuid,
    finalized_at    timestamptz,
    published_by    uuid,
    published_at    timestamptz,

    -- Supersession
    supersedes_id   uuid REFERENCES fin.publication_batch(id),

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,

    CONSTRAINT uq_fin_pub_batch UNIQUE (tenant_id, entity_code, batch_code),
    -- Published batches must have sign-off
    CONSTRAINT chk_pub_batch_signoff CHECK (
        status != 'PUBLISHED' OR published_by IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_fin_pub_batch_tenant
    ON fin.publication_batch(tenant_id, entity_code, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_pub_batch_status
    ON fin.publication_batch(status) WHERE status IN ('DRAFT', 'FINALIZED');
CREATE INDEX IF NOT EXISTS idx_fin_pub_batch_pack
    ON fin.publication_batch(pack_instance_id) WHERE pack_instance_id IS NOT NULL;

COMMENT ON TABLE fin.publication_batch IS
    'Governed publication event that atomically transitions KPI executions and/or planning outputs from APPROVED → PUBLISHED. Unit of pack lineage.';

-- Deferred FK to report_pack_instance
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.publication_batch'::regclass
          AND conname = 'fk_pub_batch_pack_instance'
    ) THEN
        ALTER TABLE fin.publication_batch
            ADD CONSTRAINT fk_pub_batch_pack_instance
            FOREIGN KEY (pack_instance_id) REFERENCES fin.report_pack_instance(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- C2. Add publication_batch_id to kpi_execution and planning_output
-- ============================================================================
ALTER TABLE fin.kpi_execution
    ADD COLUMN IF NOT EXISTS publication_batch_id uuid REFERENCES fin.publication_batch(id);

ALTER TABLE fin.planning_output
    ADD COLUMN IF NOT EXISTS publication_batch_id uuid REFERENCES fin.publication_batch(id);

CREATE INDEX IF NOT EXISTS idx_fin_kpi_exec_pub_batch
    ON fin.kpi_execution(publication_batch_id)
    WHERE publication_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_plan_output_pub_batch
    ON fin.planning_output(publication_batch_id)
    WHERE publication_batch_id IS NOT NULL;

COMMENT ON COLUMN fin.kpi_execution.publication_batch_id IS
    'Publication batch that transitioned this execution to PUBLISHED. Links to fin.publication_batch for pack lineage.';
COMMENT ON COLUMN fin.planning_output.publication_batch_id IS
    'Publication batch that transitioned this output to PUBLISHED. Links to fin.publication_batch for pack lineage.';

-- ============================================================================
-- C3. Publish batch function — atomically publishes all items
-- ============================================================================
-- Transitions a FINALIZED batch to PUBLISHED by setting consumer_state
-- on all linked KPI executions and planning outputs.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.publish_batch(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.publish_batch(
    p_batch_id      uuid,
    p_published_by  uuid
) RETURNS TABLE (
    kpi_count       integer,
    planning_count  integer
) LANGUAGE plpgsql AS $$
DECLARE
    v_batch     fin.publication_batch;
    v_kpi_cnt   integer := 0;
    v_plan_cnt  integer := 0;
BEGIN
    SELECT * INTO v_batch FROM fin.publication_batch WHERE id = p_batch_id;

    IF v_batch IS NULL THEN
        RAISE EXCEPTION 'Publication batch % not found', p_batch_id;
    END IF;

    IF v_batch.status != 'FINALIZED' THEN
        RAISE EXCEPTION 'Publication batch % must be FINALIZED before publishing (current: %)',
            p_batch_id, v_batch.status;
    END IF;

    -- Publish KPI executions in this batch
    UPDATE fin.kpi_execution
    SET consumer_state = 'PUBLISHED',
        published_by = p_published_by,
        published_at = now(),
        published_to_pack_id = v_batch.pack_instance_id
    WHERE publication_batch_id = p_batch_id
      AND consumer_state = 'APPROVED';

    GET DIAGNOSTICS v_kpi_cnt = ROW_COUNT;

    -- Publish planning outputs in this batch
    UPDATE fin.planning_output
    SET consumer_state = 'PUBLISHED',
        published_at = now()
    WHERE publication_batch_id = p_batch_id
      AND consumer_state = 'APPROVED';

    GET DIAGNOSTICS v_plan_cnt = ROW_COUNT;

    -- Update batch status and counts
    UPDATE fin.publication_batch
    SET status = 'PUBLISHED',
        published_by = p_published_by,
        published_at = now(),
        kpi_item_count = v_kpi_cnt,
        planning_item_count = v_plan_cnt,
        updated_at = now()
    WHERE id = p_batch_id;

    RETURN QUERY SELECT v_kpi_cnt, v_plan_cnt;
END;
$$;

COMMENT ON FUNCTION fin.publish_batch(uuid, uuid) IS
    'Atomically publishes all APPROVED items in a FINALIZED publication batch. Transitions consumer_state to PUBLISHED and links to pack instance.';


-- ############################################################################
-- D. OVERRIDE REASON ENRICHMENT & TRANSITION APPLICABILITY
-- ############################################################################

-- ============================================================================
-- D1. Add reason_subcode and mandatory impact for IMMATERIAL
-- ============================================================================
ALTER TABLE fin.close_override
    ADD COLUMN IF NOT EXISTS reason_subcode  varchar(30),
    ADD COLUMN IF NOT EXISTS applies_to_transition varchar(20);

-- Subcode taxonomy (optional structured drill-down within reason_code)
DO $$ BEGIN
    ALTER TABLE fin.close_override
        ADD CONSTRAINT chk_override_reason_subcode
        CHECK (reason_subcode IS NULL OR reason_subcode IN (
            -- IMMATERIAL subcodes
            'BELOW_THRESHOLD',      -- below materiality threshold
            'SELF_CORRECTING',      -- will reverse in next period
            'ROUNDING',             -- rounding difference only
            -- TIMING subcodes
            'CUTOFF_ADJUSTMENT',    -- cutoff timing difference
            'ACCRUAL_REVERSAL',     -- accrual that will reverse
            'IN_TRANSIT',           -- items in transit
            -- EXTERNAL_DELAY subcodes
            'VENDOR_DELAY',         -- vendor/supplier delayed
            'BANK_DELAY',           -- bank processing delay
            'REGULATORY_DELAY',     -- regulatory body delayed
            -- SYSTEM_ISSUE subcodes
            'INTERFACE_FAILURE',    -- system interface failure
            'DATA_FEED_DELAY',      -- data feed delayed
            'CALCULATION_ERROR',    -- system calculation error
            -- PROCESS_GAP subcodes
            'MANUAL_WORKAROUND',    -- manual workaround in place
            'CONTROL_EXCEPTION',    -- control exception noted
            -- MANAGEMENT_JUDGEMENT subcodes
            'ESTIMATE_ACCEPTED',    -- management estimate accepted
            'RISK_ACCEPTED'         -- risk formally accepted
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transition applicability: which close transition this override applies to
DO $$ BEGIN
    ALTER TABLE fin.close_override
        ADD CONSTRAINT chk_override_applies_to
        CHECK (applies_to_transition IS NULL OR applies_to_transition IN (
            'SOFT_CLOSE',   -- override applies to soft close gate only
            'HARD_CLOSE',   -- override applies to hard close gate only
            'BOTH'          -- override applies to both gates
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mandatory impact_amount for IMMATERIAL overrides
-- (The whole point of IMMATERIAL is quantifying that it doesn't matter)
DO $$ BEGIN
    ALTER TABLE fin.close_override
        ADD CONSTRAINT chk_override_immaterial_impact
        CHECK (reason_code != 'IMMATERIAL' OR impact_amount IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN fin.close_override.reason_subcode IS
    'Structured drill-down within reason_code. Optional but improves override reporting granularity.';
COMMENT ON COLUMN fin.close_override.applies_to_transition IS
    'Which close transition this override applies to: SOFT_CLOSE, HARD_CLOSE, or BOTH. NULL = BOTH.';


-- ############################################################################
-- E. AUTOMATIC GOVERNANCE ACTIVITY EMISSION
-- ############################################################################

-- ============================================================================
-- E1. KPI definition lifecycle → kpi_activity
-- ============================================================================
-- Automatically emits activity rows when kpi_definition status changes.
-- This guarantees audit trail even if service layer fails to emit.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_kpi_def_emit_activity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_kpi_def_emit_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event_type varchar(40);
BEGIN
    -- Only fire on status change
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'IN_REVIEW'  THEN 'DEFINITION_SUBMITTED'
        WHEN 'APPROVED'   THEN 'DEFINITION_APPROVED'
        WHEN 'REJECTED'   THEN 'DEFINITION_REJECTED'
        WHEN 'EFFECTIVE'  THEN 'DEFINITION_EFFECTIVE'
        WHEN 'SUPERSEDED' THEN 'DEFINITION_SUPERSEDED'
        WHEN 'RETIRED'    THEN 'DEFINITION_RETIRED'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO fin.kpi_activity (
        tenant_id, entity_code, event_type, kpi_id,
        actor_id, actor_type, payload
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, v_event_type, NEW.id,
        CASE NEW.status
            WHEN 'IN_REVIEW'  THEN NEW.submitted_by
            WHEN 'APPROVED'   THEN NEW.approved_by
            WHEN 'RETIRED'    THEN NEW.retired_by
            ELSE NULL
        END,
        'USER',
        jsonb_build_object(
            'from_status', OLD.status,
            'to_status', NEW.status,
            'version', NEW.version,
            'kpi_code', NEW.kpi_code,
            'rejection_reason', NEW.rejection_reason
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_def_emit_activity ON fin.kpi_definition;
CREATE TRIGGER trg_kpi_def_emit_activity
    AFTER UPDATE ON fin.kpi_definition
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fin.trg_kpi_def_emit_activity();

COMMENT ON FUNCTION fin.trg_kpi_def_emit_activity() IS
    'Trigger-backed activity emission for KPI definition lifecycle transitions. Guarantees audit trail independent of service layer.';

-- ============================================================================
-- E2. Planning model lifecycle → planning_activity
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_planning_model_emit_activity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_planning_model_emit_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event_type varchar(40);
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'IN_REVIEW'  THEN 'MODEL_SUBMITTED'
        WHEN 'APPROVED'   THEN 'MODEL_APPROVED'
        WHEN 'REJECTED'   THEN 'MODEL_REJECTED'
        WHEN 'PROMOTED'   THEN 'MODEL_PROMOTED'
        WHEN 'SUPERSEDED' THEN 'MODEL_SUPERSEDED'
        WHEN 'RETIRED'    THEN 'MODEL_RETIRED'
        WHEN 'ARCHIVED'   THEN 'MODEL_ARCHIVED'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO fin.planning_activity (
        tenant_id, entity_code, event_type, model_id,
        actor_id, actor_type, payload
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, v_event_type, NEW.id,
        CASE NEW.status
            WHEN 'IN_REVIEW'  THEN NEW.submitted_by
            WHEN 'APPROVED'   THEN NEW.approved_by
            WHEN 'PROMOTED'   THEN NEW.promoted_by
            WHEN 'RETIRED'    THEN NEW.retired_by
            ELSE NULL
        END,
        'USER',
        jsonb_build_object(
            'from_status', OLD.status,
            'to_status', NEW.status,
            'version', NEW.version,
            'model_code', NEW.model_code,
            'scenario', NEW.scenario,
            'rejection_reason', NEW.rejection_reason
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planning_model_emit_activity ON fin.planning_model;
CREATE TRIGGER trg_planning_model_emit_activity
    AFTER UPDATE ON fin.planning_model
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fin.trg_planning_model_emit_activity();

COMMENT ON FUNCTION fin.trg_planning_model_emit_activity() IS
    'Trigger-backed activity emission for planning model lifecycle transitions.';

-- ============================================================================
-- E3. Close override lifecycle → close_override_activity
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_close_override_emit_activity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_close_override_emit_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event_type varchar(40);
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'APPROVED' THEN 'OVERRIDE_APPROVED'
        WHEN 'REJECTED' THEN 'OVERRIDE_REJECTED'
        WHEN 'EXPIRED'  THEN 'OVERRIDE_EXPIRED'
        WHEN 'REVOKED'  THEN 'OVERRIDE_REVOKED'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO fin.close_override_activity (
        tenant_id, entity_code, event_type, override_id, run_id,
        actor_id, actor_type, payload
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, v_event_type, NEW.id, NEW.run_id,
        CASE NEW.status
            WHEN 'APPROVED' THEN NEW.decided_by
            WHEN 'REJECTED' THEN NEW.decided_by
            WHEN 'REVOKED'  THEN NEW.revoked_by
            ELSE NULL
        END,
        CASE NEW.status
            WHEN 'EXPIRED' THEN 'SYSTEM'
            ELSE 'USER'
        END,
        jsonb_build_object(
            'from_status', OLD.status,
            'to_status', NEW.status,
            'override_scope', NEW.override_scope,
            'reason_code', NEW.reason_code,
            'reason_subcode', NEW.reason_subcode,
            'impact_amount', NEW.impact_amount,
            'decision_notes', NEW.decision_notes,
            'revocation_reason', NEW.revocation_reason
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_override_emit_activity ON fin.close_override;
CREATE TRIGGER trg_close_override_emit_activity
    AFTER UPDATE ON fin.close_override
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fin.trg_close_override_emit_activity();

COMMENT ON FUNCTION fin.trg_close_override_emit_activity() IS
    'Trigger-backed activity emission for close override lifecycle transitions.';

-- ============================================================================
-- E4. KPI consumer state → kpi_activity
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_kpi_exec_emit_consumer_activity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_kpi_exec_emit_consumer_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event_type varchar(40);
BEGIN
    IF OLD.consumer_state = NEW.consumer_state THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.consumer_state
        WHEN 'REVIEWED'  THEN 'EXECUTION_REVIEWED'
        WHEN 'APPROVED'  THEN 'EXECUTION_APPROVED'
        WHEN 'PUBLISHED' THEN 'EXECUTION_PUBLISHED'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO fin.kpi_activity (
        tenant_id, entity_code, event_type,
        kpi_id, execution_id, fiscal_year, period_number,
        actor_id, actor_type, payload
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, v_event_type,
        NEW.kpi_id, NEW.id, NEW.fiscal_year, NEW.period_number,
        CASE NEW.consumer_state
            WHEN 'REVIEWED'  THEN NEW.reviewed_by
            WHEN 'APPROVED'  THEN NEW.approved_by
            WHEN 'PUBLISHED' THEN NEW.published_by
        END,
        'USER',
        jsonb_build_object(
            'from_state', OLD.consumer_state,
            'to_state', NEW.consumer_state,
            'value', NEW.value,
            'publication_batch_id', NEW.publication_batch_id,
            'published_to_pack_id', NEW.published_to_pack_id
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_exec_emit_consumer_activity ON fin.kpi_execution;
CREATE TRIGGER trg_kpi_exec_emit_consumer_activity
    AFTER UPDATE ON fin.kpi_execution
    FOR EACH ROW
    WHEN (OLD.consumer_state IS DISTINCT FROM NEW.consumer_state)
    EXECUTE FUNCTION fin.trg_kpi_exec_emit_consumer_activity();

-- ============================================================================
-- E5. Planning output consumer state → planning_activity
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_plan_output_emit_consumer_activity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_plan_output_emit_consumer_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event_type varchar(40);
BEGIN
    IF OLD.consumer_state = NEW.consumer_state THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.consumer_state
        WHEN 'REVIEWED'  THEN 'OUTPUT_REVIEWED'
        WHEN 'APPROVED'  THEN 'OUTPUT_APPROVED'
        WHEN 'PUBLISHED' THEN 'OUTPUT_PUBLISHED'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO fin.planning_activity (
        tenant_id, entity_code, event_type,
        model_id, calculation_run_id,
        actor_id, actor_type, payload
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, v_event_type,
        NEW.model_id, NEW.calculation_run_id,
        CASE NEW.consumer_state
            WHEN 'REVIEWED'  THEN NEW.reviewed_by
            WHEN 'APPROVED'  THEN NEW.approved_by
            ELSE NULL
        END,
        'USER',
        jsonb_build_object(
            'from_state', OLD.consumer_state,
            'to_state', NEW.consumer_state,
            'amount', NEW.amount,
            'publication_batch_id', NEW.publication_batch_id
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_output_emit_consumer_activity ON fin.planning_output;
CREATE TRIGGER trg_plan_output_emit_consumer_activity
    AFTER UPDATE ON fin.planning_output
    FOR EACH ROW
    WHEN (OLD.consumer_state IS DISTINCT FROM NEW.consumer_state)
    EXECUTE FUNCTION fin.trg_plan_output_emit_consumer_activity();


-- ############################################################################
-- F. GOVERNANCE VIEWS
-- ############################################################################

-- ============================================================================
-- F1. Publication batch lineage view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_publication_batch_summary CASCADE;
CREATE OR REPLACE VIEW fin.vw_publication_batch_summary AS
SELECT
    b.tenant_id,
    b.entity_code,
    b.batch_code,
    b.description,
    b.fiscal_year,
    b.period_number,
    b.batch_type,
    b.status,
    b.kpi_item_count,
    b.planning_item_count,
    b.kpi_item_count + b.planning_item_count AS total_items,
    b.finalized_by,
    b.finalized_at,
    b.published_by,
    b.published_at,
    b.pack_instance_id,
    -- Pack certification status (if linked)
    pc.certification_status AS pack_cert_status,
    -- Supersession chain
    b.supersedes_id,
    sb.batch_code AS supersedes_batch_code
FROM fin.publication_batch b
LEFT JOIN fin.pack_certification pc
    ON pc.pack_instance_id = b.pack_instance_id
LEFT JOIN fin.publication_batch sb
    ON sb.id = b.supersedes_id;

COMMENT ON VIEW fin.vw_publication_batch_summary IS
    'Publication batch overview with pack certification status and supersession chain.';

-- ============================================================================
-- F2. Planning model governance dashboard view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_planning_model_governance CASCADE;
CREATE OR REPLACE VIEW fin.vw_planning_model_governance AS
SELECT
    m.tenant_id,
    m.entity_code,
    m.model_code,
    m.model_name,
    m.scenario,
    m.fiscal_year,
    m.version,
    m.status,
    m.submitted_by,
    m.submitted_at,
    m.approved_by,
    m.approved_at,
    m.promoted_at,
    m.promoted_by,
    m.rejection_reason,
    m.retired_by,
    m.retired_at,
    m.supersedes_id,
    -- Counts
    (SELECT count(*) FROM fin.planning_driver d
     WHERE d.tenant_id = m.tenant_id AND d.entity_code = m.entity_code
       AND d.is_active = true) AS active_drivers,
    (SELECT count(*) FROM fin.driver_assumption a
     WHERE a.model_id = m.id) AS assumption_count,
    (SELECT count(*) FROM fin.planning_output o
     WHERE o.model_id = m.id AND o.is_current = true) AS current_outputs,
    -- Consumer state distribution
    (SELECT count(*) FROM fin.planning_output o
     WHERE o.model_id = m.id AND o.is_current = true
       AND o.consumer_state = 'APPROVED') AS approved_outputs,
    (SELECT count(*) FROM fin.planning_output o
     WHERE o.model_id = m.id AND o.is_current = true
       AND o.consumer_state = 'PUBLISHED') AS published_outputs,
    -- Is model fully published?
    CASE
        WHEN m.status = 'PROMOTED' AND NOT EXISTS (
            SELECT 1 FROM fin.planning_output o
            WHERE o.model_id = m.id AND o.is_current = true
              AND o.consumer_state != 'PUBLISHED'
        ) THEN true
        ELSE false
    END AS is_fully_published
FROM fin.planning_model m
WHERE m.status NOT IN ('ARCHIVED');

COMMENT ON VIEW fin.vw_planning_model_governance IS
    'Planning model governance dashboard with lifecycle status, output counts, and consumer state distribution.';

-- ============================================================================
-- F3. Override reporting view — aggregated by reason code
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_override_summary CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_override_summary AS
SELECT
    o.tenant_id,
    o.entity_code,
    r.fiscal_year,
    r.period_number,
    o.reason_code,
    o.reason_subcode,
    count(*) AS override_count,
    count(*) FILTER (WHERE o.status = 'APPROVED') AS approved_count,
    count(*) FILTER (WHERE o.status = 'REJECTED') AS rejected_count,
    count(*) FILTER (WHERE o.status = 'PENDING')  AS pending_count,
    count(*) FILTER (WHERE o.status = 'REVOKED')  AS revoked_count,
    sum(o.impact_amount) FILTER (WHERE o.status = 'APPROVED') AS total_approved_impact,
    -- Scope distribution
    count(*) FILTER (WHERE o.override_scope = 'TASK')     AS task_scope_count,
    count(*) FILTER (WHERE o.override_scope = 'CATEGORY') AS category_scope_count,
    count(*) FILTER (WHERE o.override_scope = 'GATE')     AS gate_scope_count,
    -- Transition applicability
    count(*) FILTER (WHERE o.applies_to_transition = 'SOFT_CLOSE') AS soft_close_count,
    count(*) FILTER (WHERE o.applies_to_transition = 'HARD_CLOSE') AS hard_close_count
FROM fin.close_override o
JOIN fin.close_run r ON r.id = o.run_id
GROUP BY
    o.tenant_id, o.entity_code,
    r.fiscal_year, r.period_number,
    o.reason_code, o.reason_subcode;

COMMENT ON VIEW fin.vw_close_override_summary IS
    'Aggregated override reporting by reason code and subcode. Shows approval rates, total impact, and scope distribution.';
