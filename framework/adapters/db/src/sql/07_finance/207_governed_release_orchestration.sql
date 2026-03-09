/* ============================================================================
   Athyper v2.7 — Governed Release Orchestration
   Schema: fin
   Dependencies: 196_management_pack.sql, 197_pack_governance.sql,
                 202_close_orchestration.sql, 204_governance_lifecycle.sql,
                 205_governance_consistency.sql,
                 206_publication_certification_integrity.sql

   Shifts from structural governance (tables, triggers, constraints) to
   runtime orchestration and policy consolidation. After this migration,
   the full governed release pipeline has:
     - A top-level release identity (fin.pack_release)
     - Unified policy check functions (preview before act)
     - Clean close designation with threshold policy
     - Integrity verification across the full audit chain

   Sections:
     A. Pack Release Object
        - fin.pack_release: top-level release coordination
        - Binds close_run + publication_batch + certification + distributions
        - Governed lifecycle: ASSEMBLING → READY → RELEASED → SUPERSEDED
     B. Unified Release Policy Engine
        - fin.check_publication_policy(): can batch be finalized/published?
        - fin.check_certification_policy(): can certification proceed?
        - fin.check_distribution_policy(): can distribution be sent?
        - fin.check_supersession_policy(): can batch be superseded?
     C. Clean Close Policy & Exception Reporting
        - Clean close threshold on close_calendar
        - fin.evaluate_clean_close(): returns clean close designation
        - Override-aware release governance classification
     D. Integrity Verification
        - fin.verify_release_integrity(): recomputes and verifies chain
     E. Tactical Fixes
        - INVALIDATED certification status (distinct from REJECTED)
        - Enhanced audit chain view with release scope
        - Release activity emission
   ============================================================================ */


-- ############################################################################
-- A. PACK RELEASE OBJECT
-- ############################################################################

-- ============================================================================
-- A1. fin.pack_release — Top-level release coordination
-- ============================================================================
-- The single identity for a governed management pack release event.
-- Binds together the close context, data publication, certification,
-- and distribution into one auditable unit.
--
-- This is NOT a container that duplicates data from its children.
-- It is a coordination point that:
--   1. Gives external systems a stable release ID to reference
--   2. Provides a single lifecycle for the entire release pipeline
--   3. Enables release-level governance (clean close, exception signoff)
--   4. Simplifies UI: one object = one release dashboard
--
-- Example:
--   "REL-2026-P3-MGMT" — March 2026 Management Pack Release
--     → close_run: March close cycle (run #1)
--     → publication_batch: 24 KPIs + 12 planning outputs
--     → certification: CFO-certified
--     → distributions: board + audit committee + finance team
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.pack_release (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- Identity
    release_code    varchar(50) NOT NULL,
    release_name    varchar(200) NOT NULL,
    description     text,

    -- Scope
    fiscal_year     smallint NOT NULL,
    period_from     smallint NOT NULL,
    period_to       smallint NOT NULL,
    book_code       varchar(20) NOT NULL DEFAULT 'STAT',

    -- Release type
    release_type    varchar(20) NOT NULL DEFAULT 'MANAGEMENT_PACK'
                    CHECK (release_type IN (
                        'MANAGEMENT_PACK',  -- standard management pack
                        'BOARD_PACK',       -- board-level reporting
                        'REGULATORY',       -- regulatory filing
                        'AD_HOC',           -- ad-hoc / one-off
                        'INTERIM'           -- mid-period release
                    )),

    -- Component references
    pack_instance_id        uuid,       -- FK deferred
    publication_batch_id    uuid,       -- FK deferred
    certification_id        uuid,       -- FK deferred
    close_run_id            uuid,       -- FK deferred
    readiness_snapshot_id   uuid,       -- FK deferred

    -- Lifecycle
    status          varchar(20) NOT NULL DEFAULT 'ASSEMBLING'
                    CHECK (status IN (
                        'ASSEMBLING',   -- components being prepared
                        'READY',        -- all components in place, awaiting sign-off
                        'RELEASED',     -- signed off and distributed
                        'SUPERSEDED',   -- replaced by correction release
                        'CANCELLED'     -- abandoned
                    )),

    -- Governance posture at release
    is_clean_close          boolean,        -- NULL until evaluated
    override_count          integer NOT NULL DEFAULT 0,
    override_impact_total   decimal(18,4),
    readiness_score         decimal(5,2),
    period_status_at_release varchar(20),

    -- Exception governance
    requires_exception_signoff boolean NOT NULL DEFAULT false,
    exception_signoff_by    uuid,
    exception_signoff_at    timestamptz,
    exception_signoff_notes text,

    -- Lifecycle timestamps
    assembled_at    timestamptz,
    ready_at        timestamptz,
    released_at     timestamptz,
    released_by     uuid,
    superseded_at   timestamptz,
    supersession_reason text,

    -- Supersession chain
    supersedes_id   uuid REFERENCES fin.pack_release(id),

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,

    CONSTRAINT uq_fin_pack_release UNIQUE (tenant_id, entity_code, release_code),
    -- Released releases must have a releaser
    CONSTRAINT chk_release_signoff CHECK (
        status != 'RELEASED' OR released_by IS NOT NULL
    ),
    -- Exception signoff required if flagged
    CONSTRAINT chk_release_exception_signoff CHECK (
        NOT requires_exception_signoff
        OR status != 'RELEASED'
        OR exception_signoff_by IS NOT NULL
    ),
    -- Superseded releases must have reason
    CONSTRAINT chk_release_supersession CHECK (
        status != 'SUPERSEDED' OR supersession_reason IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_release_tenant
    ON fin.pack_release(tenant_id, entity_code, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_pack_release_status
    ON fin.pack_release(status)
    WHERE status IN ('ASSEMBLING', 'READY');
CREATE INDEX IF NOT EXISTS idx_fin_pack_release_pack
    ON fin.pack_release(pack_instance_id)
    WHERE pack_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_pack_release_batch
    ON fin.pack_release(publication_batch_id)
    WHERE publication_batch_id IS NOT NULL;

-- Deferred FKs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fin.pack_release'::regclass AND conname = 'fk_release_pack_instance') THEN
        ALTER TABLE fin.pack_release ADD CONSTRAINT fk_release_pack_instance FOREIGN KEY (pack_instance_id) REFERENCES fin.report_pack_instance(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fin.pack_release'::regclass AND conname = 'fk_release_pub_batch') THEN
        ALTER TABLE fin.pack_release ADD CONSTRAINT fk_release_pub_batch FOREIGN KEY (publication_batch_id) REFERENCES fin.publication_batch(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fin.pack_release'::regclass AND conname = 'fk_release_certification') THEN
        ALTER TABLE fin.pack_release ADD CONSTRAINT fk_release_certification FOREIGN KEY (certification_id) REFERENCES fin.pack_certification(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fin.pack_release'::regclass AND conname = 'fk_release_close_run') THEN
        ALTER TABLE fin.pack_release ADD CONSTRAINT fk_release_close_run FOREIGN KEY (close_run_id) REFERENCES fin.close_run(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fin.pack_release'::regclass AND conname = 'fk_release_readiness') THEN
        ALTER TABLE fin.pack_release ADD CONSTRAINT fk_release_readiness FOREIGN KEY (readiness_snapshot_id) REFERENCES fin.close_readiness_snapshot(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

COMMENT ON TABLE fin.pack_release IS
    'Top-level governed release identity. Binds close run, publication batch, certification, and distributions into one auditable unit.';

-- ============================================================================
-- A2. Release lifecycle transition guard
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_pack_release_lifecycle() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_pack_release_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_valid := CASE OLD.status
        WHEN 'ASSEMBLING' THEN NEW.status IN ('READY', 'CANCELLED')
        WHEN 'READY'      THEN NEW.status IN ('RELEASED', 'ASSEMBLING', 'CANCELLED')
        WHEN 'RELEASED'   THEN NEW.status = 'SUPERSEDED'
        WHEN 'SUPERSEDED' THEN false  -- terminal
        WHEN 'CANCELLED'  THEN false  -- terminal
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid pack release transition: % → %', OLD.status, NEW.status;
    END IF;

    -- Auto-fill timestamps
    IF NEW.status = 'READY' AND NEW.ready_at IS NULL THEN
        NEW.ready_at := now();
    END IF;
    IF NEW.status = 'RELEASED' AND NEW.released_at IS NULL THEN
        NEW.released_at := now();
    END IF;
    IF NEW.status = 'SUPERSEDED' AND NEW.superseded_at IS NULL THEN
        NEW.superseded_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pack_release_lifecycle ON fin.pack_release;
CREATE TRIGGER trg_pack_release_lifecycle
    BEFORE UPDATE ON fin.pack_release
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_pack_release_lifecycle();

-- ============================================================================
-- A3. Release activity timeline (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.pack_release_activity (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    release_id      uuid NOT NULL REFERENCES fin.pack_release(id),

    event_type      varchar(40) NOT NULL
                    CHECK (event_type IN (
                        'RELEASE_CREATED',
                        'RELEASE_COMPONENT_LINKED',
                        'RELEASE_READY',
                        'RELEASE_RELEASED',
                        'RELEASE_SUPERSEDED',
                        'RELEASE_CANCELLED',
                        'CLEAN_CLOSE_EVALUATED',
                        'EXCEPTION_SIGNOFF_REQUIRED',
                        'EXCEPTION_SIGNOFF_GRANTED',
                        'INTEGRITY_VERIFIED',
                        'INTEGRITY_FAILED'
                    )),

    actor_id        uuid,
    actor_type      varchar(20) NOT NULL DEFAULT 'USER'
                    CHECK (actor_type IN ('USER', 'SYSTEM', 'SCHEDULER')),

    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_release_activity_release
    ON fin.pack_release_activity(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_release_activity_tenant
    ON fin.pack_release_activity(tenant_id, entity_code, created_at DESC);

-- Immutability
DROP FUNCTION IF EXISTS fin.trg_release_activity_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_release_activity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'pack_release_activity rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_activity_no_update ON fin.pack_release_activity;
CREATE TRIGGER trg_release_activity_no_update
    BEFORE UPDATE ON fin.pack_release_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_release_activity_immutable();

DROP TRIGGER IF EXISTS trg_release_activity_no_delete ON fin.pack_release_activity;
CREATE TRIGGER trg_release_activity_no_delete
    BEFORE DELETE ON fin.pack_release_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_release_activity_immutable();

-- Automatic activity emission on release lifecycle transitions
DROP FUNCTION IF EXISTS fin.trg_pack_release_emit_activity() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_pack_release_emit_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_event_type varchar(40);
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'READY'       THEN 'RELEASE_READY'
        WHEN 'RELEASED'    THEN 'RELEASE_RELEASED'
        WHEN 'SUPERSEDED'  THEN 'RELEASE_SUPERSEDED'
        WHEN 'CANCELLED'   THEN 'RELEASE_CANCELLED'
        ELSE NULL
    END;

    IF v_event_type IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO fin.pack_release_activity (
        tenant_id, entity_code, release_id,
        event_type, actor_id, actor_type, payload
    ) VALUES (
        NEW.tenant_id, NEW.entity_code, NEW.id,
        v_event_type,
        CASE NEW.status
            WHEN 'RELEASED' THEN NEW.released_by
            ELSE NULL
        END,
        CASE WHEN NEW.status IN ('RELEASED') THEN 'USER' ELSE 'SYSTEM' END,
        jsonb_build_object(
            'from_status', OLD.status,
            'to_status', NEW.status,
            'release_code', NEW.release_code,
            'is_clean_close', NEW.is_clean_close,
            'override_count', NEW.override_count,
            'requires_exception_signoff', NEW.requires_exception_signoff,
            'supersession_reason', NEW.supersession_reason
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pack_release_emit_activity ON fin.pack_release;
CREATE TRIGGER trg_pack_release_emit_activity
    AFTER UPDATE ON fin.pack_release
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fin.trg_pack_release_emit_activity();


-- ############################################################################
-- B. UNIFIED RELEASE POLICY ENGINE
-- ############################################################################

-- ============================================================================
-- B1. fin.check_publication_policy — Can batch be finalized/published?
-- ============================================================================
-- Returns structured policy evaluation result.
-- Does NOT enforce — triggers handle enforcement.
-- This is the query interface for UI/runtime to preview before attempting.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.check_publication_policy(uuid, varchar) CASCADE;
CREATE OR REPLACE FUNCTION fin.check_publication_policy(
    p_batch_id      uuid,
    p_target_action varchar(20)  -- 'FINALIZE' or 'PUBLISH'
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_batch     fin.publication_batch;
    v_blockers  text[] := '{}';
    v_warnings  text[] := '{}';
    v_kpi_cnt   integer;
    v_plan_cnt  integer;
    v_unapproved integer;
BEGIN
    SELECT * INTO v_batch FROM fin.publication_batch WHERE id = p_batch_id;
    IF v_batch IS NULL THEN
        RETURN jsonb_build_object('can_proceed', false, 'blockers', '["Batch not found"]'::jsonb);
    END IF;

    IF p_target_action = 'FINALIZE' THEN
        -- Must be DRAFT
        IF v_batch.status != 'DRAFT' THEN
            v_blockers := array_append(v_blockers, format('Batch must be DRAFT to finalize (current: %s)', v_batch.status));
        END IF;

        -- Must have at least one item assigned
        SELECT count(*) INTO v_kpi_cnt FROM fin.kpi_execution WHERE publication_batch_id = p_batch_id;
        SELECT count(*) INTO v_plan_cnt FROM fin.planning_output WHERE publication_batch_id = p_batch_id;
        IF v_kpi_cnt + v_plan_cnt = 0 THEN
            v_blockers := array_append(v_blockers, 'Batch has no items assigned');
        END IF;

        -- All items must be APPROVED
        SELECT count(*) INTO v_unapproved
        FROM fin.kpi_execution
        WHERE publication_batch_id = p_batch_id AND consumer_state != 'APPROVED';
        IF v_unapproved > 0 THEN
            v_blockers := array_append(v_blockers, format('%s KPI executions are not APPROVED', v_unapproved));
        END IF;

        SELECT count(*) INTO v_unapproved
        FROM fin.planning_output
        WHERE publication_batch_id = p_batch_id AND consumer_state != 'APPROVED';
        IF v_unapproved > 0 THEN
            v_blockers := array_append(v_blockers, format('%s planning outputs are not APPROVED', v_unapproved));
        END IF;

    ELSIF p_target_action = 'PUBLISH' THEN
        -- Must be FINALIZED
        IF v_batch.status != 'FINALIZED' THEN
            v_blockers := array_append(v_blockers, format('Batch must be FINALIZED to publish (current: %s)', v_batch.status));
        END IF;

        -- Check for existing published batch in same scope
        IF EXISTS (
            SELECT 1 FROM fin.publication_batch
            WHERE tenant_id = v_batch.tenant_id
              AND entity_code = v_batch.entity_code
              AND fiscal_year = v_batch.fiscal_year
              AND period_number = v_batch.period_number
              AND coalesce(pack_instance_id, '00000000-0000-0000-0000-000000000000')
                  = coalesce(v_batch.pack_instance_id, '00000000-0000-0000-0000-000000000000')
              AND status = 'PUBLISHED'
              AND id != p_batch_id
        ) THEN
            v_warnings := array_append(v_warnings, 'An existing PUBLISHED batch exists for this scope — it will need to be superseded');
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'can_proceed', array_length(v_blockers, 1) IS NULL,
        'target_action', p_target_action,
        'batch_id', p_batch_id,
        'batch_status', v_batch.status,
        'blockers', to_jsonb(v_blockers),
        'warnings', to_jsonb(v_warnings),
        'context', jsonb_build_object(
            'kpi_items', v_kpi_cnt,
            'planning_items', v_plan_cnt
        )
    );
END;
$$;

COMMENT ON FUNCTION fin.check_publication_policy(uuid, varchar) IS
    'Preview policy evaluation for publication batch finalization or publishing. Returns blockers and warnings without enforcing.';

-- ============================================================================
-- B2. fin.check_certification_policy — Can certification proceed?
-- ============================================================================
DROP FUNCTION IF EXISTS fin.check_certification_policy(uuid, varchar) CASCADE;
CREATE OR REPLACE FUNCTION fin.check_certification_policy(
    p_certification_id  uuid,
    p_target_status     varchar(20)  -- 'REVIEWED', 'APPROVED', 'CERTIFIED'
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_cert      fin.pack_certification;
    v_pack      fin.report_pack_instance;
    v_batch     fin.publication_batch;
    v_blockers  text[] := '{}';
    v_warnings  text[] := '{}';
BEGIN
    SELECT * INTO v_cert FROM fin.pack_certification WHERE id = p_certification_id;
    IF v_cert IS NULL THEN
        RETURN jsonb_build_object('can_proceed', false, 'blockers', '["Certification not found"]'::jsonb);
    END IF;

    SELECT * INTO v_pack FROM fin.report_pack_instance WHERE id = v_cert.pack_instance_id;

    -- Status transition validation
    IF p_target_status = 'REVIEWED' AND v_cert.certification_status NOT IN ('PENDING', 'IN_REVIEW') THEN
        v_blockers := array_append(v_blockers, format('Cannot review from %s status', v_cert.certification_status));
    END IF;
    IF p_target_status = 'APPROVED' AND v_cert.certification_status NOT IN ('IN_REVIEW', 'REVIEWED') THEN
        v_blockers := array_append(v_blockers, format('Cannot approve from %s status', v_cert.certification_status));
    END IF;
    IF p_target_status = 'CERTIFIED' AND v_cert.certification_status != 'APPROVED' THEN
        v_blockers := array_append(v_blockers, format('Cannot certify from %s status', v_cert.certification_status));
    END IF;

    -- Pack must be FINALIZED or PUBLISHED
    IF v_pack.status NOT IN ('FINALIZED', 'PUBLISHED') THEN
        v_blockers := array_append(v_blockers, format('Pack instance must be FINALIZED or PUBLISHED (current: %s)', v_pack.status));
    END IF;

    -- For CERTIFIED: publication batch must be PUBLISHED
    IF p_target_status = 'CERTIFIED' AND v_cert.publication_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM fin.publication_batch WHERE id = v_cert.publication_batch_id;
        IF v_batch IS NOT NULL AND v_batch.status != 'PUBLISHED' THEN
            v_blockers := array_append(v_blockers, format('Publication batch must be PUBLISHED for certification (current: %s)', v_batch.status));
        END IF;
    ELSIF p_target_status = 'CERTIFIED' AND v_cert.publication_batch_id IS NULL THEN
        v_warnings := array_append(v_warnings, 'No publication batch linked — certification will not have data lineage');
    END IF;

    -- Check for active overrides
    IF v_cert.active_override_count > 0 THEN
        v_warnings := array_append(v_warnings,
            format('%s active overrides with total impact %s', v_cert.active_override_count,
                   coalesce(v_cert.override_impact_total::text, 'N/A')));
    END IF;

    RETURN jsonb_build_object(
        'can_proceed', array_length(v_blockers, 1) IS NULL,
        'target_status', p_target_status,
        'certification_id', p_certification_id,
        'current_status', v_cert.certification_status,
        'blockers', to_jsonb(v_blockers),
        'warnings', to_jsonb(v_warnings),
        'context', jsonb_build_object(
            'pack_status', v_pack.status,
            'has_publication_batch', v_cert.publication_batch_id IS NOT NULL,
            'override_count', v_cert.active_override_count,
            'readiness_score', v_cert.readiness_score_at_cert
        )
    );
END;
$$;

COMMENT ON FUNCTION fin.check_certification_policy(uuid, varchar) IS
    'Preview policy evaluation for certification transitions. Returns blockers and warnings without enforcing.';

-- ============================================================================
-- B3. fin.check_distribution_policy — Can distribution proceed?
-- ============================================================================
DROP FUNCTION IF EXISTS fin.check_distribution_policy(uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.check_distribution_policy(
    p_distribution_id   uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_dist      fin.pack_distribution;
    v_cert      fin.pack_certification;
    v_batch     fin.publication_batch;
    v_blockers  text[] := '{}';
    v_warnings  text[] := '{}';
BEGIN
    SELECT * INTO v_dist FROM fin.pack_distribution WHERE id = p_distribution_id;
    IF v_dist IS NULL THEN
        RETURN jsonb_build_object('can_proceed', false, 'blockers', '["Distribution not found"]'::jsonb);
    END IF;

    -- Must be DRAFT to proceed
    IF v_dist.status != 'DRAFT' THEN
        v_blockers := array_append(v_blockers, format('Distribution must be DRAFT to send (current: %s)', v_dist.status));
    END IF;

    -- Must have recipients
    IF v_dist.recipient_count = 0 THEN
        v_blockers := array_append(v_blockers, 'Distribution has no recipients');
    END IF;

    -- Certification check
    IF v_dist.certification_id IS NOT NULL THEN
        SELECT * INTO v_cert FROM fin.pack_certification WHERE id = v_dist.certification_id;
        IF v_cert.certification_status NOT IN ('APPROVED', 'CERTIFIED') THEN
            v_blockers := array_append(v_blockers,
                format('Certification must be APPROVED or CERTIFIED (current: %s)', v_cert.certification_status));
        END IF;
        IF v_cert.certification_status = 'INVALIDATED' THEN
            v_blockers := array_append(v_blockers, 'Certification has been INVALIDATED by supersession');
        END IF;
    ELSE
        v_warnings := array_append(v_warnings, 'No certification linked — distribution will not be governed');
    END IF;

    -- Publication batch check
    IF v_dist.publication_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM fin.publication_batch WHERE id = v_dist.publication_batch_id;
        IF v_batch.status = 'SUPERSEDED' THEN
            v_blockers := array_append(v_blockers, 'Publication batch has been SUPERSEDED — cannot distribute stale data');
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'can_proceed', array_length(v_blockers, 1) IS NULL,
        'distribution_id', p_distribution_id,
        'current_status', v_dist.status,
        'blockers', to_jsonb(v_blockers),
        'warnings', to_jsonb(v_warnings),
        'context', jsonb_build_object(
            'has_certification', v_dist.certification_id IS NOT NULL,
            'certification_status', v_cert.certification_status,
            'has_publication_batch', v_dist.publication_batch_id IS NOT NULL,
            'recipient_count', v_dist.recipient_count
        )
    );
END;
$$;

COMMENT ON FUNCTION fin.check_distribution_policy(uuid) IS
    'Preview policy evaluation for distribution send. Returns blockers and warnings without enforcing.';

-- ============================================================================
-- B4. fin.check_supersession_policy — Can batch be superseded?
-- ============================================================================
DROP FUNCTION IF EXISTS fin.check_supersession_policy(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.check_supersession_policy(
    p_old_batch_id  uuid,
    p_new_batch_id  uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_old       fin.publication_batch;
    v_new       fin.publication_batch;
    v_blockers  text[] := '{}';
    v_warnings  text[] := '{}';
    v_dist_cnt  integer;
    v_cert_cnt  integer;
BEGIN
    SELECT * INTO v_old FROM fin.publication_batch WHERE id = p_old_batch_id;
    SELECT * INTO v_new FROM fin.publication_batch WHERE id = p_new_batch_id;

    IF v_old IS NULL THEN
        v_blockers := array_append(v_blockers, 'Old batch not found');
    END IF;
    IF v_new IS NULL THEN
        v_blockers := array_append(v_blockers, 'New batch not found');
    END IF;
    IF v_old IS NULL OR v_new IS NULL THEN
        RETURN jsonb_build_object('can_proceed', false, 'blockers', to_jsonb(v_blockers));
    END IF;

    -- Old must be PUBLISHED
    IF v_old.status != 'PUBLISHED' THEN
        v_blockers := array_append(v_blockers, format('Can only supersede PUBLISHED batches (current: %s)', v_old.status));
    END IF;

    -- New must be DRAFT or FINALIZED
    IF v_new.status NOT IN ('DRAFT', 'FINALIZED') THEN
        v_blockers := array_append(v_blockers, format('Replacement batch must be DRAFT or FINALIZED (current: %s)', v_new.status));
    END IF;

    -- Count affected distributions
    SELECT count(*) INTO v_dist_cnt
    FROM fin.pack_distribution
    WHERE pack_instance_id = v_old.pack_instance_id
      AND status IN ('SENT', 'PARTIAL');
    IF v_dist_cnt > 0 THEN
        v_warnings := array_append(v_warnings, format('%s active distributions will need recall or re-send', v_dist_cnt));
    END IF;

    -- Count affected certifications
    SELECT count(*) INTO v_cert_cnt
    FROM fin.pack_certification
    WHERE publication_batch_id = p_old_batch_id
      AND certification_status IN ('APPROVED', 'CERTIFIED');
    IF v_cert_cnt > 0 THEN
        v_warnings := array_append(v_warnings, format('%s active certifications will be invalidated', v_cert_cnt));
    END IF;

    RETURN jsonb_build_object(
        'can_proceed', array_length(v_blockers, 1) IS NULL,
        'old_batch_id', p_old_batch_id,
        'new_batch_id', p_new_batch_id,
        'blockers', to_jsonb(v_blockers),
        'warnings', to_jsonb(v_warnings),
        'impact', jsonb_build_object(
            'affected_distributions', v_dist_cnt,
            'affected_certifications', v_cert_cnt,
            'old_manifest_items', v_old.manifest_item_count
        )
    );
END;
$$;

COMMENT ON FUNCTION fin.check_supersession_policy(uuid, uuid) IS
    'Preview policy evaluation for publication batch supersession. Returns blockers, warnings, and impact analysis.';


-- ############################################################################
-- C. CLEAN CLOSE POLICY & EXCEPTION REPORTING
-- ############################################################################

-- ============================================================================
-- C1. Clean close threshold on close_calendar
-- ============================================================================
-- A "clean close" means: no overrides used, readiness ≥ threshold,
-- all mandatory tasks completed (not waived). The threshold is configurable
-- per period via the close calendar.
ALTER TABLE fin.close_calendar
    ADD COLUMN IF NOT EXISTS clean_close_max_overrides    integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS clean_close_min_readiness    decimal(5,2) NOT NULL DEFAULT 95.00,
    ADD COLUMN IF NOT EXISTS clean_close_max_impact       decimal(18,4);

COMMENT ON COLUMN fin.close_calendar.clean_close_max_overrides IS
    'Maximum number of approved overrides for a close to qualify as "clean". Default 0 (no overrides allowed).';
COMMENT ON COLUMN fin.close_calendar.clean_close_min_readiness IS
    'Minimum readiness score for a close to qualify as "clean". Default 95.00.';
COMMENT ON COLUMN fin.close_calendar.clean_close_max_impact IS
    'Maximum total monetary impact of overrides for clean close. NULL = no monetary threshold (only count matters).';

-- ============================================================================
-- C2. fin.evaluate_clean_close — Returns clean close designation
-- ============================================================================
DROP FUNCTION IF EXISTS fin.evaluate_clean_close(uuid, varchar, smallint, smallint) CASCADE;
CREATE OR REPLACE FUNCTION fin.evaluate_clean_close(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_fiscal_year   smallint,
    p_period_number smallint
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_cal               fin.close_calendar;
    v_run_id            uuid;
    v_readiness         decimal(5,2);
    v_override_cnt      integer;
    v_override_impact   decimal(18,4);
    v_waived_cnt        integer;
    v_is_clean          boolean;
    v_reasons           text[] := '{}';
BEGIN
    -- Get calendar policy
    SELECT * INTO v_cal
    FROM fin.close_calendar
    WHERE tenant_id = p_tenant_id
      AND entity_code = p_entity_code
      AND fiscal_year = p_fiscal_year
      AND period_number = p_period_number;

    IF v_cal IS NULL THEN
        RETURN jsonb_build_object(
            'is_clean', null,
            'evaluated', false,
            'reason', 'No close calendar entry found'
        );
    END IF;

    -- Get active close run
    SELECT r.id INTO v_run_id
    FROM fin.close_run r
    WHERE r.tenant_id = p_tenant_id
      AND r.entity_code = p_entity_code
      AND r.fiscal_year = p_fiscal_year
      AND r.period_number = p_period_number
      AND r.status NOT IN ('CANCELLED')
    ORDER BY r.run_number DESC
    LIMIT 1;

    -- Get readiness
    IF v_run_id IS NOT NULL THEN
        SELECT s.readiness_score INTO v_readiness
        FROM fin.close_readiness_snapshot s
        WHERE s.run_id = v_run_id
        ORDER BY s.captured_at DESC
        LIMIT 1;
    END IF;

    -- Count overrides
    SELECT count(*), coalesce(sum(impact_amount), 0)
    INTO v_override_cnt, v_override_impact
    FROM fin.close_override
    WHERE run_id = v_run_id
      AND status = 'APPROVED'
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now());

    -- Count waived tasks
    SELECT count(*) INTO v_waived_cnt
    FROM fin.period_close_checklist cl
    JOIN fin.period_close_task pt ON pt.id = cl.task_id
    WHERE cl.tenant_id = p_tenant_id
      AND cl.entity_code = p_entity_code
      AND cl.fiscal_year = p_fiscal_year
      AND cl.period_number = p_period_number
      AND cl.task_status = 'WAIVED'
      AND pt.is_mandatory = true;

    -- Evaluate clean close
    v_is_clean := true;

    IF coalesce(v_override_cnt, 0) > v_cal.clean_close_max_overrides THEN
        v_is_clean := false;
        v_reasons := array_append(v_reasons,
            format('Override count %s exceeds threshold %s', v_override_cnt, v_cal.clean_close_max_overrides));
    END IF;

    IF coalesce(v_readiness, 0) < v_cal.clean_close_min_readiness THEN
        v_is_clean := false;
        v_reasons := array_append(v_reasons,
            format('Readiness score %s below threshold %s', v_readiness, v_cal.clean_close_min_readiness));
    END IF;

    IF v_cal.clean_close_max_impact IS NOT NULL AND coalesce(v_override_impact, 0) > v_cal.clean_close_max_impact THEN
        v_is_clean := false;
        v_reasons := array_append(v_reasons,
            format('Override impact %s exceeds threshold %s', v_override_impact, v_cal.clean_close_max_impact));
    END IF;

    IF coalesce(v_waived_cnt, 0) > 0 THEN
        v_is_clean := false;
        v_reasons := array_append(v_reasons,
            format('%s mandatory tasks were waived', v_waived_cnt));
    END IF;

    RETURN jsonb_build_object(
        'is_clean', v_is_clean,
        'evaluated', true,
        'requires_exception_signoff', NOT v_is_clean,
        'override_count', coalesce(v_override_cnt, 0),
        'override_impact', coalesce(v_override_impact, 0),
        'readiness_score', coalesce(v_readiness, 0),
        'waived_task_count', coalesce(v_waived_cnt, 0),
        'policy', jsonb_build_object(
            'max_overrides', v_cal.clean_close_max_overrides,
            'min_readiness', v_cal.clean_close_min_readiness,
            'max_impact', v_cal.clean_close_max_impact
        ),
        'disqualification_reasons', to_jsonb(v_reasons)
    );
END;
$$;

COMMENT ON FUNCTION fin.evaluate_clean_close(uuid, varchar, smallint, smallint) IS
    'Evaluates whether a close period qualifies as a "clean close" based on configurable thresholds for overrides, readiness, and waived tasks.';


-- ############################################################################
-- D. INTEGRITY VERIFICATION
-- ############################################################################

-- ============================================================================
-- D1. fin.verify_release_integrity — Full chain verification
-- ============================================================================
-- Recomputes and verifies the integrity of the full release chain.
-- Returns structured diagnostic JSONB with pass/fail per check.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.verify_release_integrity(uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.verify_release_integrity(
    p_release_id    uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_release       fin.pack_release;
    v_batch         fin.publication_batch;
    v_cert          fin.pack_certification;
    v_checks        jsonb := '[]'::jsonb;
    v_all_passed    boolean := true;
    v_manifest_cnt  integer;
    v_dist_cnt      integer;
    v_dist_sent     integer;
BEGIN
    SELECT * INTO v_release FROM fin.pack_release WHERE id = p_release_id;
    IF v_release IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Release not found');
    END IF;

    -- Check 1: Release has all required components
    IF v_release.pack_instance_id IS NULL THEN
        v_checks := v_checks || jsonb_build_object('check', 'pack_instance_linked', 'passed', false, 'detail', 'No pack instance linked');
        v_all_passed := false;
    ELSE
        v_checks := v_checks || jsonb_build_object('check', 'pack_instance_linked', 'passed', true);
    END IF;

    IF v_release.publication_batch_id IS NULL THEN
        v_checks := v_checks || jsonb_build_object('check', 'publication_batch_linked', 'passed', false, 'detail', 'No publication batch linked');
        v_all_passed := false;
    ELSE
        v_checks := v_checks || jsonb_build_object('check', 'publication_batch_linked', 'passed', true);
    END IF;

    IF v_release.certification_id IS NULL THEN
        v_checks := v_checks || jsonb_build_object('check', 'certification_linked', 'passed', false, 'detail', 'No certification linked');
        v_all_passed := false;
    ELSE
        v_checks := v_checks || jsonb_build_object('check', 'certification_linked', 'passed', true);
    END IF;

    -- Check 2: Publication batch is PUBLISHED
    IF v_release.publication_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM fin.publication_batch WHERE id = v_release.publication_batch_id;
        IF v_batch.status = 'PUBLISHED' THEN
            v_checks := v_checks || jsonb_build_object('check', 'batch_published', 'passed', true);
        ELSE
            v_checks := v_checks || jsonb_build_object('check', 'batch_published', 'passed', false,
                'detail', format('Batch status is %s, expected PUBLISHED', v_batch.status));
            v_all_passed := false;
        END IF;

        -- Check 3: Manifest hash present
        IF v_batch.manifest_hash IS NOT NULL THEN
            v_checks := v_checks || jsonb_build_object('check', 'manifest_hash_present', 'passed', true,
                'hash', v_batch.manifest_hash);
        ELSE
            v_checks := v_checks || jsonb_build_object('check', 'manifest_hash_present', 'passed', false,
                'detail', 'No manifest hash computed');
            v_all_passed := false;
        END IF;

        -- Check 4: Manifest items match count
        SELECT count(*) INTO v_manifest_cnt
        FROM fin.publication_manifest_item WHERE publication_batch_id = v_batch.id;

        IF v_manifest_cnt = v_batch.manifest_item_count THEN
            v_checks := v_checks || jsonb_build_object('check', 'manifest_count_consistent', 'passed', true,
                'count', v_manifest_cnt);
        ELSE
            v_checks := v_checks || jsonb_build_object('check', 'manifest_count_consistent', 'passed', false,
                'detail', format('Manifest has %s items but batch reports %s', v_manifest_cnt, v_batch.manifest_item_count));
            v_all_passed := false;
        END IF;

        -- Check 5: All manifest items still have PUBLISHED consumer_state
        IF EXISTS (
            SELECT 1
            FROM fin.publication_manifest_item m
            JOIN fin.kpi_execution e ON e.id = m.artifact_id AND m.artifact_type = 'KPI_EXECUTION'
            WHERE m.publication_batch_id = v_batch.id
              AND e.consumer_state != 'PUBLISHED'
        ) THEN
            v_checks := v_checks || jsonb_build_object('check', 'kpi_consumer_state_consistent', 'passed', false,
                'detail', 'Some KPI executions in manifest are no longer PUBLISHED');
            v_all_passed := false;
        ELSE
            v_checks := v_checks || jsonb_build_object('check', 'kpi_consumer_state_consistent', 'passed', true);
        END IF;

        -- Check 6: Batch not superseded
        IF v_batch.status = 'SUPERSEDED' THEN
            v_checks := v_checks || jsonb_build_object('check', 'batch_not_superseded', 'passed', false,
                'detail', format('Batch was superseded: %s', v_batch.supersession_reason));
            v_all_passed := false;
        ELSE
            v_checks := v_checks || jsonb_build_object('check', 'batch_not_superseded', 'passed', true);
        END IF;
    END IF;

    -- Check 7: Certification is valid
    IF v_release.certification_id IS NOT NULL THEN
        SELECT * INTO v_cert FROM fin.pack_certification WHERE id = v_release.certification_id;
        IF v_cert.certification_status IN ('APPROVED', 'CERTIFIED') THEN
            v_checks := v_checks || jsonb_build_object('check', 'certification_valid', 'passed', true,
                'status', v_cert.certification_status);
        ELSE
            v_checks := v_checks || jsonb_build_object('check', 'certification_valid', 'passed', false,
                'detail', format('Certification status is %s', v_cert.certification_status));
            v_all_passed := false;
        END IF;
    END IF;

    -- Check 8: Distributions exist and were delivered
    SELECT count(*), count(*) FILTER (WHERE status = 'SENT')
    INTO v_dist_cnt, v_dist_sent
    FROM fin.pack_distribution
    WHERE pack_instance_id = v_release.pack_instance_id;

    IF v_dist_cnt > 0 THEN
        v_checks := v_checks || jsonb_build_object('check', 'distributions_exist', 'passed', true,
            'total', v_dist_cnt, 'sent', v_dist_sent);
    ELSE
        v_checks := v_checks || jsonb_build_object('check', 'distributions_exist', 'passed', false,
            'detail', 'No distributions found');
        -- Not a blocker — release can exist before distribution
    END IF;

    RETURN jsonb_build_object(
        'valid', v_all_passed,
        'release_id', p_release_id,
        'release_code', v_release.release_code,
        'release_status', v_release.status,
        'is_clean_close', v_release.is_clean_close,
        'checks', v_checks,
        'checked_at', now()
    );
END;
$$;

COMMENT ON FUNCTION fin.verify_release_integrity(uuid) IS
    'Verifies the integrity of the full release chain: component linkage, batch publication status, manifest consistency, certification validity, and distribution status.';


-- ############################################################################
-- E. TACTICAL FIXES
-- ############################################################################

-- ============================================================================
-- E1. Add INVALIDATED to certification_status
-- ============================================================================
-- INVALIDATED is distinct from REJECTED:
--   REJECTED = reviewer/approver returned the pack for rework
--   INVALIDATED = system-driven invalidation due to data supersession
-- This prevents confusion in audit reporting.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.pack_certification'::regclass
          AND conname LIKE '%cert_status%'
          AND contype = 'c'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.pack_certification DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.pack_certification'::regclass
               AND conname LIKE '%cert_status%'
               AND contype = 'c'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.pack_certification
        ADD CONSTRAINT chk_pack_cert_status CHECK (certification_status IN (
            'PENDING',
            'IN_REVIEW',
            'REVIEWED',
            'APPROVED',
            'CERTIFIED',
            'REJECTED',
            'INVALIDATED'   -- system-driven invalidation due to supersession
        ));
END $$;

COMMENT ON COLUMN fin.pack_certification.certification_status IS
    'Sign-off chain status. INVALIDATED is distinct from REJECTED: INVALIDATED = system-driven due to data supersession; REJECTED = reviewer returned for rework.';

-- Update supersede_publication_batch to use INVALIDATED instead of REJECTED
DROP FUNCTION IF EXISTS fin.supersede_publication_batch(uuid, uuid, text, boolean, boolean, boolean) CASCADE;
CREATE OR REPLACE FUNCTION fin.supersede_publication_batch(
    p_old_batch_id      uuid,
    p_new_batch_id      uuid,
    p_reason            text,
    p_invalidate_cert   boolean DEFAULT true,
    p_require_redist    boolean DEFAULT true,
    p_auto_recall       boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_old   fin.publication_batch;
    v_new   fin.publication_batch;
BEGIN
    SELECT * INTO v_old FROM fin.publication_batch WHERE id = p_old_batch_id;
    SELECT * INTO v_new FROM fin.publication_batch WHERE id = p_new_batch_id;

    IF v_old IS NULL OR v_new IS NULL THEN
        RAISE EXCEPTION 'Both old and new publication batches must exist';
    END IF;

    IF v_old.status != 'PUBLISHED' THEN
        RAISE EXCEPTION 'Can only supersede PUBLISHED batches (current: %)', v_old.status;
    END IF;

    IF v_new.status NOT IN ('DRAFT', 'FINALIZED') THEN
        RAISE EXCEPTION 'Replacement batch must be DRAFT or FINALIZED (current: %)', v_new.status;
    END IF;

    -- 1. Mark old batch as superseded
    UPDATE fin.publication_batch
    SET status = 'SUPERSEDED',
        supersession_reason = p_reason,
        invalidates_certification = p_invalidate_cert,
        requires_redistribution = p_require_redist,
        auto_recall_prior = p_auto_recall,
        updated_at = now()
    WHERE id = p_old_batch_id;

    -- 2. Link new batch to old
    UPDATE fin.publication_batch
    SET supersedes_id = p_old_batch_id,
        updated_at = now()
    WHERE id = p_new_batch_id;

    -- 3. Invalidate certification if policy requires it
    IF p_invalidate_cert THEN
        UPDATE fin.pack_certification
        SET certification_status = 'INVALIDATED',   -- NOT REJECTED
            certification_notes = coalesce(certification_notes, '') ||
                E'\n[SYSTEM] Certification invalidated by publication batch supersession: ' || p_reason,
            updated_at = now()
        WHERE publication_batch_id = p_old_batch_id
          AND certification_status IN ('APPROVED', 'CERTIFIED');

        -- Emit pack activity
        INSERT INTO fin.pack_activity (
            tenant_id, entity_code, pack_instance_id,
            activity_type, actor_type, message, payload
        )
        SELECT
            v_old.tenant_id, v_old.entity_code, v_old.pack_instance_id,
            'CERTIFICATION_REVOKED', 'system',
            'Certification invalidated by publication supersession',
            jsonb_build_object(
                'superseded_batch_id', p_old_batch_id,
                'replacement_batch_id', p_new_batch_id,
                'reason', p_reason,
                'invalidation_type', 'SUPERSESSION'
            )
        WHERE v_old.pack_instance_id IS NOT NULL;
    END IF;

    -- 4. Auto-recall distributions if policy requires it
    IF p_auto_recall THEN
        UPDATE fin.pack_distribution
        SET status = 'RECALLED',
            recalled_at = now(),
            recall_reason = 'Auto-recalled due to publication batch supersession: ' || p_reason,
            updated_at = now()
        WHERE pack_instance_id = v_old.pack_instance_id
          AND status IN ('SENT', 'PARTIAL')
          AND certification_id IN (
              SELECT id FROM fin.pack_certification
              WHERE publication_batch_id = p_old_batch_id
          );
    END IF;
END;
$$;

-- ============================================================================
-- E2. Enhanced audit chain view with full release scope
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_pack_audit_chain CASCADE;
CREATE OR REPLACE VIEW fin.vw_pack_audit_chain AS
SELECT
    dist.tenant_id,
    pi.entity_code,
    pi.fiscal_year,
    pi.period_from,
    pi.period_to,
    pi.book_code,
    -- Release layer (if exists)
    rel.id AS release_id,
    rel.release_code,
    rel.release_type,
    rel.status AS release_status,
    rel.is_clean_close,
    rel.requires_exception_signoff,
    -- Distribution layer
    dist.id AS distribution_id,
    dist.distribution_code,
    dist.format AS distribution_format,
    dist.distributed_at,
    dist.distributed_by,
    dist.status AS distribution_status,
    dist.artifact_hash AS distribution_artifact_hash,
    dist.recipient_count,
    dist.delivered_count,
    -- Certification layer
    cert.id AS certification_id,
    cert.certification_status,
    cert.prepared_by,
    cert.reviewed_by,
    cert.approved_by,
    cert.certified_by,
    cert.certified_at,
    -- Governance context at certification
    cert.readiness_score_at_cert,
    cert.active_override_count,
    cert.override_impact_total,
    cert.period_status_at_cert,
    -- Publication layer
    pb.id AS publication_batch_id,
    pb.batch_code,
    pb.status AS publication_status,
    pb.kpi_item_count,
    pb.planning_item_count,
    pb.manifest_item_count,
    pb.manifest_hash,
    pb.published_at AS publication_published_at,
    pb.published_by AS publication_published_by,
    -- Supersession chain
    pb.supersedes_id AS supersedes_batch_id,
    spb.batch_code AS supersedes_batch_code,
    pb.supersession_reason,
    pb.invalidates_certification,
    pb.requires_redistribution,
    -- Pack context
    pi.id AS pack_instance_id,
    pd.name AS pack_name,
    pd.pack_code,
    pi.status AS pack_status,
    -- Integrity flags
    CASE
        WHEN dist.artifact_hash IS NOT NULL AND pb.manifest_hash IS NOT NULL
            THEN true
        ELSE false
    END AS has_integrity_hashes,
    CASE
        WHEN cert.certification_status IN ('APPROVED', 'CERTIFIED')
            AND pb.status = 'PUBLISHED'
            AND dist.status = 'SENT'
            THEN true
        ELSE false
    END AS is_fully_governed
FROM fin.pack_distribution dist
JOIN fin.report_pack_instance pi ON pi.id = dist.pack_instance_id
JOIN fin.report_pack_definition pd ON pd.id = pi.pack_definition_id
LEFT JOIN fin.pack_certification cert ON cert.id = dist.certification_id
LEFT JOIN fin.publication_batch pb ON pb.id = coalesce(
    dist.publication_batch_id,
    cert.publication_batch_id
)
LEFT JOIN fin.publication_batch spb ON spb.id = pb.supersedes_id
LEFT JOIN fin.pack_release rel ON rel.pack_instance_id = pi.id
    AND rel.status NOT IN ('CANCELLED');

COMMENT ON VIEW fin.vw_pack_audit_chain IS
    'End-to-end audit chain from release through distribution, certification, and publication manifest. Includes full release scope (tenant, entity, year, period, book).';

-- ============================================================================
-- E3. Release dashboard view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_pack_release_dashboard CASCADE;
CREATE OR REPLACE VIEW fin.vw_pack_release_dashboard AS
SELECT
    r.tenant_id,
    r.entity_code,
    r.release_code,
    r.release_name,
    r.release_type,
    r.fiscal_year,
    r.period_from,
    r.period_to,
    r.status,
    r.is_clean_close,
    r.override_count,
    r.override_impact_total,
    r.readiness_score,
    r.requires_exception_signoff,
    r.exception_signoff_by IS NOT NULL AS has_exception_signoff,
    -- Component status summary
    pi.status AS pack_status,
    pb.status AS batch_status,
    cert.certification_status,
    pb.manifest_item_count,
    pb.manifest_hash IS NOT NULL AS has_manifest_hash,
    -- Distribution summary
    (SELECT count(*) FROM fin.pack_distribution d
     WHERE d.pack_instance_id = r.pack_instance_id) AS distribution_count,
    (SELECT count(*) FROM fin.pack_distribution d
     WHERE d.pack_instance_id = r.pack_instance_id AND d.status = 'SENT') AS distributions_sent,
    -- Timeline
    r.created_at,
    r.assembled_at,
    r.ready_at,
    r.released_at,
    -- Duration metrics
    CASE WHEN r.released_at IS NOT NULL AND r.created_at IS NOT NULL
        THEN extract(epoch FROM r.released_at - r.created_at) / 3600
    END AS release_duration_hours
FROM fin.pack_release r
LEFT JOIN fin.report_pack_instance pi ON pi.id = r.pack_instance_id
LEFT JOIN fin.publication_batch pb ON pb.id = r.publication_batch_id
LEFT JOIN fin.pack_certification cert ON cert.id = r.certification_id;

COMMENT ON VIEW fin.vw_pack_release_dashboard IS
    'Release dashboard with component status, governance posture, distribution summary, and timeline metrics.';
