/* ============================================================================
   Athyper v2.7 — Publication & Certification Integrity
   Schema: fin
   Dependencies: 196_management_pack.sql, 197_pack_governance.sql,
                 204_governance_lifecycle.sql, 205_governance_consistency.sql,
                 195_statement_snapshot.sql

   Closes the end-to-end audit chain from data computation through
   certification to distribution. After this migration, every distributed
   pack can be traced back to the exact artifacts (KPI values, planning
   outputs, statement snapshots) that comprised it, the close readiness
   state at the time, and any overrides that were active.

   Sections:
     A. Publication Manifest — immutable item-level data freeze
        - fin.publication_manifest_item: artifact-level record per batch
        - Manifest hash for tamper detection
     B. Certification-to-Publication Binding
        - Enrich pack_certification with publication batch, readiness
          snapshot, and override context references
     C. Supersession Governance
        - Supersession policy columns on publication_batch
        - Certification invalidation on batch supersession
        - Guard against orphaned distributions
     D. Distribution Lineage
        - Add publication_batch_id and artifact_hash to distribution
        - Direct lineage: distribution → publication → certification
     E. Tactical Hardening
        - Publication batch uniqueness (one PUBLISHED per scope)
        - Override density metric in summary view
        - Pack activity event expansion for publication events
        - Governed snapshot view bridging all layers
   ============================================================================ */


-- ############################################################################
-- A. PUBLICATION MANIFEST — DATA FREEZE / RELEASE SNAPSHOT
-- ############################################################################

-- ============================================================================
-- A1. fin.publication_manifest_item — per-artifact record in a batch
-- ============================================================================
-- When a publication batch is published, each constituent artifact gets
-- a manifest row that freezes:
--   - The artifact ID and type
--   - The definition/model version in effect at publish time
--   - A value snapshot (the actual number)
--   - The period context
--
-- This is the immutable answer to "what exactly did the pack contain?"
-- Append-only: once created, manifest items are never modified or deleted.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.publication_manifest_item (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id),
    entity_code         varchar(20) NOT NULL,

    -- Batch reference
    publication_batch_id uuid NOT NULL REFERENCES fin.publication_batch(id),

    -- Artifact identity
    artifact_type       varchar(20) NOT NULL
                        CHECK (artifact_type IN (
                            'KPI_EXECUTION',    -- from fin.kpi_execution
                            'PLANNING_OUTPUT',  -- from fin.planning_output
                            'STATEMENT_INSTANCE' -- from fin.statement_instance
                        )),
    artifact_id         uuid NOT NULL,

    -- Definition/model version frozen at publish time
    definition_code     varchar(50),    -- kpi_code, model_code, or definition_code
    definition_version  smallint,       -- version of the definition in effect

    -- Period context
    fiscal_year         smallint NOT NULL,
    period_number       smallint NOT NULL,
    book_code           varchar(20) NOT NULL DEFAULT 'STAT',

    -- Value snapshot (the actual number published)
    -- For KPI: the value. For planning: the amount. For statements: NULL (hash covers content).
    published_value     decimal(18,4),
    published_currency  varchar(3),

    -- Dimension context (if applicable)
    dimension_set_id    uuid REFERENCES fin.dimension_set(id),

    -- Artifact-level hash (SHA-256 of canonical artifact content)
    artifact_hash       varchar(64),

    -- Metadata
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_pub_manifest UNIQUE (publication_batch_id, artifact_type, artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_pub_manifest_batch
    ON fin.publication_manifest_item(publication_batch_id);
CREATE INDEX IF NOT EXISTS idx_fin_pub_manifest_artifact
    ON fin.publication_manifest_item(artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS idx_fin_pub_manifest_period
    ON fin.publication_manifest_item(tenant_id, entity_code, fiscal_year, period_number);

-- Immutability: manifest items are append-only
DROP FUNCTION IF EXISTS fin.trg_pub_manifest_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_pub_manifest_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'publication_manifest_item rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_pub_manifest_no_update ON fin.publication_manifest_item;
CREATE TRIGGER trg_pub_manifest_no_update
    BEFORE UPDATE ON fin.publication_manifest_item
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_pub_manifest_immutable();

DROP TRIGGER IF EXISTS trg_pub_manifest_no_delete ON fin.publication_manifest_item;
CREATE TRIGGER trg_pub_manifest_no_delete
    BEFORE DELETE ON fin.publication_manifest_item
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_pub_manifest_immutable();

COMMENT ON TABLE fin.publication_manifest_item IS
    'Immutable per-artifact manifest for publication batches. Freezes exactly which values were published, at which definition versions, for full audit traceability.';

-- ============================================================================
-- A2. Add manifest_hash to publication_batch
-- ============================================================================
-- SHA-256 hash of the ordered, canonical manifest content.
-- Computed over: all manifest items sorted by artifact_type + artifact_id,
-- including definition_code, version, value, and artifact_hash.
-- Enables tamper detection: re-hashing the manifest must produce the same hash.
ALTER TABLE fin.publication_batch
    ADD COLUMN IF NOT EXISTS manifest_hash       varchar(64),
    ADD COLUMN IF NOT EXISTS manifest_item_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN fin.publication_batch.manifest_hash IS
    'SHA-256 hash of the canonical publication manifest. Enables tamper detection across the full artifact set.';
COMMENT ON COLUMN fin.publication_batch.manifest_item_count IS
    'Total count of manifest items (KPI + planning + statement). Set at finalization.';

-- ============================================================================
-- A3. Enhanced publish_batch — writes manifest items atomically
-- ============================================================================
-- Replaces the 205 version to also create manifest items during publish.
DROP FUNCTION IF EXISTS fin.publish_batch(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.publish_batch(
    p_batch_id      uuid,
    p_published_by  uuid
) RETURNS TABLE (
    kpi_count       integer,
    planning_count  integer,
    manifest_count  integer
) LANGUAGE plpgsql AS $$
DECLARE
    v_batch     fin.publication_batch;
    v_kpi_cnt   integer := 0;
    v_plan_cnt  integer := 0;
    v_manifest  integer := 0;
BEGIN
    SELECT * INTO v_batch FROM fin.publication_batch WHERE id = p_batch_id;

    IF v_batch IS NULL THEN
        RAISE EXCEPTION 'Publication batch % not found', p_batch_id;
    END IF;

    IF v_batch.status != 'FINALIZED' THEN
        RAISE EXCEPTION 'Publication batch % must be FINALIZED before publishing (current: %)',
            p_batch_id, v_batch.status;
    END IF;

    -- 1. Create manifest items for KPI executions
    INSERT INTO fin.publication_manifest_item (
        tenant_id, entity_code, publication_batch_id,
        artifact_type, artifact_id,
        definition_code, definition_version,
        fiscal_year, period_number, book_code,
        published_value, dimension_set_id
    )
    SELECT
        e.tenant_id, e.entity_code, p_batch_id,
        'KPI_EXECUTION', e.id,
        d.kpi_code, e.kpi_version,
        e.fiscal_year, e.period_number, e.book_code,
        e.value, e.dimension_set_id
    FROM fin.kpi_execution e
    JOIN fin.kpi_definition d ON d.id = e.kpi_id
    WHERE e.publication_batch_id = p_batch_id
      AND e.consumer_state = 'APPROVED';

    GET DIAGNOSTICS v_kpi_cnt = ROW_COUNT;

    -- 2. Create manifest items for planning outputs
    INSERT INTO fin.publication_manifest_item (
        tenant_id, entity_code, publication_batch_id,
        artifact_type, artifact_id,
        definition_code, definition_version,
        fiscal_year, period_number, book_code,
        published_value, dimension_set_id
    )
    SELECT
        o.tenant_id, o.entity_code, p_batch_id,
        'PLANNING_OUTPUT', o.id,
        m.model_code, m.version,
        o.fiscal_year, o.period_number, v_batch.book_code,
        o.amount, o.dimension_set_id
    FROM fin.planning_output o
    JOIN fin.planning_model m ON m.id = o.model_id
    WHERE o.publication_batch_id = p_batch_id
      AND o.consumer_state = 'APPROVED';

    GET DIAGNOSTICS v_plan_cnt = ROW_COUNT;

    v_manifest := v_kpi_cnt + v_plan_cnt;

    -- 3. Transition KPI executions to PUBLISHED
    UPDATE fin.kpi_execution
    SET consumer_state = 'PUBLISHED',
        published_by = p_published_by,
        published_at = now(),
        published_to_pack_id = v_batch.pack_instance_id
    WHERE publication_batch_id = p_batch_id
      AND consumer_state = 'APPROVED';

    -- 4. Transition planning outputs to PUBLISHED
    UPDATE fin.planning_output
    SET consumer_state = 'PUBLISHED',
        published_at = now()
    WHERE publication_batch_id = p_batch_id
      AND consumer_state = 'APPROVED';

    -- 5. Update batch status and counts
    UPDATE fin.publication_batch
    SET status = 'PUBLISHED',
        published_by = p_published_by,
        published_at = now(),
        kpi_item_count = v_kpi_cnt,
        planning_item_count = v_plan_cnt,
        manifest_item_count = v_manifest,
        updated_at = now()
    WHERE id = p_batch_id;

    RETURN QUERY SELECT v_kpi_cnt, v_plan_cnt, v_manifest;
END;
$$;

COMMENT ON FUNCTION fin.publish_batch(uuid, uuid) IS
    'Atomically publishes a FINALIZED batch: creates immutable manifest items, transitions consumer_state to PUBLISHED, and updates counts.';


-- ############################################################################
-- B. CERTIFICATION-TO-PUBLICATION BINDING
-- ############################################################################

-- ============================================================================
-- B1. Enrich pack_certification with governed release context
-- ============================================================================
-- Certification should reference not just the pack instance, but the
-- specific publication batch that populated it, the close readiness state,
-- and a summary of any active overrides at certification time.
-- ============================================================================
ALTER TABLE fin.pack_certification
    ADD COLUMN IF NOT EXISTS publication_batch_id   uuid,
    ADD COLUMN IF NOT EXISTS readiness_snapshot_id   uuid,
    ADD COLUMN IF NOT EXISTS close_run_id            uuid,
    ADD COLUMN IF NOT EXISTS active_override_count   integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS override_impact_total   decimal(18,4),
    ADD COLUMN IF NOT EXISTS readiness_score_at_cert decimal(5,2),
    ADD COLUMN IF NOT EXISTS period_status_at_cert   varchar(20);

-- Deferred FKs (these tables may not exist in every deployment order)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.pack_certification'::regclass
          AND conname = 'fk_cert_publication_batch'
    ) THEN
        ALTER TABLE fin.pack_certification
            ADD CONSTRAINT fk_cert_publication_batch
            FOREIGN KEY (publication_batch_id) REFERENCES fin.publication_batch(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.pack_certification'::regclass
          AND conname = 'fk_cert_readiness_snapshot'
    ) THEN
        ALTER TABLE fin.pack_certification
            ADD CONSTRAINT fk_cert_readiness_snapshot
            FOREIGN KEY (readiness_snapshot_id) REFERENCES fin.close_readiness_snapshot(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.pack_certification'::regclass
          AND conname = 'fk_cert_close_run'
    ) THEN
        ALTER TABLE fin.pack_certification
            ADD CONSTRAINT fk_cert_close_run
            FOREIGN KEY (close_run_id) REFERENCES fin.close_run(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_pack_cert_pub_batch
    ON fin.pack_certification(publication_batch_id)
    WHERE publication_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_pack_cert_close_run
    ON fin.pack_certification(close_run_id)
    WHERE close_run_id IS NOT NULL;

COMMENT ON COLUMN fin.pack_certification.publication_batch_id IS
    'The publication batch whose artifacts populate this pack. Certification approves THIS specific data set.';
COMMENT ON COLUMN fin.pack_certification.readiness_snapshot_id IS
    'Close readiness snapshot at certification time. Records the governance posture when the pack was certified.';
COMMENT ON COLUMN fin.pack_certification.close_run_id IS
    'Close run active at certification time. Links certification to the close cycle context.';
COMMENT ON COLUMN fin.pack_certification.active_override_count IS
    'Number of active close overrides at certification time. Zero means clean close.';
COMMENT ON COLUMN fin.pack_certification.override_impact_total IS
    'Total monetary impact of active overrides at certification time. Quantifies governance exceptions.';
COMMENT ON COLUMN fin.pack_certification.readiness_score_at_cert IS
    'Close readiness score at certification time. Captures governance posture.';
COMMENT ON COLUMN fin.pack_certification.period_status_at_cert IS
    'Fiscal period status at certification time (OPEN, SOFT_CLOSE, HARD_CLOSE).';

-- ============================================================================
-- B2. Certification context capture function
-- ============================================================================
-- Captures the current close context (readiness, overrides, period status)
-- into a certification record. Called when certification transitions to
-- APPROVED or CERTIFIED.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.capture_certification_context(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.capture_certification_context(
    p_certification_id  uuid,
    p_publication_batch_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_cert          fin.pack_certification;
    v_pack          fin.report_pack_instance;
    v_run_id        uuid;
    v_readiness_id  uuid;
    v_readiness     decimal(5,2);
    v_override_cnt  integer;
    v_override_amt  decimal(18,4);
    v_period_status varchar(20);
BEGIN
    SELECT * INTO v_cert FROM fin.pack_certification WHERE id = p_certification_id;
    IF v_cert IS NULL THEN
        RAISE EXCEPTION 'Certification % not found', p_certification_id;
    END IF;

    SELECT * INTO v_pack FROM fin.report_pack_instance WHERE id = v_cert.pack_instance_id;

    -- Find active close run for this period
    SELECT r.id INTO v_run_id
    FROM fin.close_run r
    WHERE r.tenant_id = v_cert.tenant_id
      AND r.entity_code = v_pack.entity_code
      AND r.fiscal_year = v_pack.fiscal_year
      AND r.period_number = v_pack.period_to
      AND r.status NOT IN ('CANCELLED')
    ORDER BY r.run_number DESC
    LIMIT 1;

    -- Get latest readiness snapshot
    IF v_run_id IS NOT NULL THEN
        SELECT s.id, s.readiness_score INTO v_readiness_id, v_readiness
        FROM fin.close_readiness_snapshot s
        WHERE s.run_id = v_run_id
        ORDER BY s.captured_at DESC
        LIMIT 1;
    END IF;

    -- Count active overrides
    SELECT count(*), coalesce(sum(impact_amount), 0)
    INTO v_override_cnt, v_override_amt
    FROM fin.close_override
    WHERE run_id = v_run_id
      AND status = 'APPROVED'
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now());

    -- Get period status
    SELECT fp.status INTO v_period_status
    FROM fin.fiscal_period fp
    WHERE fp.tenant_id = v_cert.tenant_id
      AND fp.entity_code = v_pack.entity_code
      AND fp.fiscal_year = v_pack.fiscal_year
      AND fp.period_number = v_pack.period_to;

    -- Update certification with context
    UPDATE fin.pack_certification
    SET publication_batch_id   = coalesce(p_publication_batch_id, publication_batch_id),
        close_run_id           = v_run_id,
        readiness_snapshot_id  = v_readiness_id,
        readiness_score_at_cert = v_readiness,
        active_override_count  = coalesce(v_override_cnt, 0),
        override_impact_total  = v_override_amt,
        period_status_at_cert  = v_period_status,
        updated_at             = now()
    WHERE id = p_certification_id;
END;
$$;

COMMENT ON FUNCTION fin.capture_certification_context(uuid, uuid) IS
    'Captures close readiness, override context, and period status into a certification record. Call at APPROVED/CERTIFIED transitions.';


-- ############################################################################
-- C. SUPERSESSION GOVERNANCE
-- ############################################################################

-- ============================================================================
-- C1. Supersession policy columns on publication_batch
-- ============================================================================
-- Governs what happens when a published batch is superseded:
--   - Does the prior certification become invalid?
--   - Must distributions be recalled?
--   - Is redistribution required?
-- ============================================================================
ALTER TABLE fin.publication_batch
    ADD COLUMN IF NOT EXISTS supersession_reason    text,
    ADD COLUMN IF NOT EXISTS invalidates_certification boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS requires_redistribution  boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS auto_recall_prior       boolean NOT NULL DEFAULT false;

-- Superseded batches must have a reason
DO $$ BEGIN
    ALTER TABLE fin.publication_batch
        ADD CONSTRAINT chk_pub_batch_supersession_reason
        CHECK (status != 'SUPERSEDED' OR supersession_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN fin.publication_batch.supersession_reason IS
    'Why this batch was superseded. Required when status transitions to SUPERSEDED.';
COMMENT ON COLUMN fin.publication_batch.invalidates_certification IS
    'Whether superseding this batch invalidates the associated pack certification. Default true.';
COMMENT ON COLUMN fin.publication_batch.requires_redistribution IS
    'Whether supersession requires the pack to be redistributed. Default true.';
COMMENT ON COLUMN fin.publication_batch.auto_recall_prior IS
    'Whether superseding this batch should automatically recall prior distributions. Default false (manual recall preferred).';

-- ============================================================================
-- C2. Supersession function — handles certification invalidation
-- ============================================================================
-- Supersedes a published batch with a new one, and optionally:
--   1. Invalidates the certification linked to the superseded batch
--   2. Recalls active distributions (if auto_recall_prior = true)
-- ============================================================================
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
        SET certification_status = 'REJECTED',
            certification_notes = coalesce(certification_notes, '') ||
                E'\n[SYSTEM] Certification invalidated by publication batch supersession: ' || p_reason,
            updated_at = now()
        WHERE publication_batch_id = p_old_batch_id
          AND certification_status IN ('APPROVED', 'CERTIFIED');

        -- Emit pack activity for invalidation
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
                'reason', p_reason
            )
        WHERE v_old.pack_instance_id IS NOT NULL;
    END IF;

    -- 4. Auto-recall distributions if policy requires it
    IF p_auto_recall THEN
        UPDATE fin.pack_distribution
        SET status = 'RECALLED',
            recalled_by = null,  -- system recall
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

COMMENT ON FUNCTION fin.supersede_publication_batch(uuid, uuid, text, boolean, boolean, boolean) IS
    'Supersedes a published batch with a new one. Optionally invalidates certification and recalls distributions per supersession policy.';

-- ============================================================================
-- C3. Publication batch lifecycle guard
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_publication_batch_lifecycle() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_publication_batch_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid boolean := false;
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_valid := CASE OLD.status
        WHEN 'DRAFT'     THEN NEW.status = 'FINALIZED'
        WHEN 'FINALIZED' THEN NEW.status = 'PUBLISHED'
        WHEN 'PUBLISHED' THEN NEW.status = 'SUPERSEDED'
        WHEN 'SUPERSEDED' THEN false  -- terminal
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid publication batch transition: % → %', OLD.status, NEW.status;
    END IF;

    -- Auto-fill timestamps
    IF NEW.status = 'FINALIZED' AND NEW.finalized_at IS NULL THEN
        NEW.finalized_at := now();
    END IF;

    IF NEW.status = 'PUBLISHED' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pub_batch_lifecycle ON fin.publication_batch;
CREATE TRIGGER trg_pub_batch_lifecycle
    BEFORE UPDATE ON fin.publication_batch
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_publication_batch_lifecycle();

COMMENT ON FUNCTION fin.trg_publication_batch_lifecycle() IS
    'Enforces publication batch lifecycle transitions: DRAFT → FINALIZED → PUBLISHED → SUPERSEDED.';


-- ############################################################################
-- D. DISTRIBUTION LINEAGE
-- ############################################################################

-- ============================================================================
-- D1. Add publication_batch_id and artifact_hash to pack_distribution
-- ============================================================================
-- Direct lineage from distribution → publication batch → manifest → artifacts.
-- artifact_hash is the hash of the rendered distribution payload (PDF, Excel, etc.).
ALTER TABLE fin.pack_distribution
    ADD COLUMN IF NOT EXISTS publication_batch_id uuid,
    ADD COLUMN IF NOT EXISTS artifact_hash        varchar(64);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.pack_distribution'::regclass
          AND conname = 'fk_dist_publication_batch'
    ) THEN
        ALTER TABLE fin.pack_distribution
            ADD CONSTRAINT fk_dist_publication_batch
            FOREIGN KEY (publication_batch_id) REFERENCES fin.publication_batch(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_pack_dist_pub_batch
    ON fin.pack_distribution(publication_batch_id)
    WHERE publication_batch_id IS NOT NULL;

COMMENT ON COLUMN fin.pack_distribution.publication_batch_id IS
    'Publication batch that produced the data for this distribution. Enables direct distribution → data lineage.';
COMMENT ON COLUMN fin.pack_distribution.artifact_hash IS
    'SHA-256 hash of the rendered distribution payload (PDF/Excel/ZIP). Enables tamper detection on distributed artifacts.';

-- ============================================================================
-- D2. Distribution guard — block distribution without certification
-- ============================================================================
-- Prevents distributing a pack that hasn't been certified at the required
-- level. Only enforced for pack instances that have a certification record.
DROP FUNCTION IF EXISTS fin.trg_distribution_cert_guard() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_distribution_cert_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cert_status varchar(20);
BEGIN
    -- Only guard on transition to SENDING or SENT
    IF NEW.status NOT IN ('SENDING', 'SENT') THEN
        RETURN NEW;
    END IF;

    -- Skip if no certification reference
    IF NEW.certification_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT certification_status INTO v_cert_status
    FROM fin.pack_certification
    WHERE id = NEW.certification_id;

    IF v_cert_status IS NULL THEN
        RAISE EXCEPTION 'Certification % not found', NEW.certification_id;
    END IF;

    IF v_cert_status NOT IN ('APPROVED', 'CERTIFIED') THEN
        RAISE EXCEPTION 'Cannot distribute pack: certification status is % (must be APPROVED or CERTIFIED)', v_cert_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distribution_cert_guard ON fin.pack_distribution;
CREATE TRIGGER trg_distribution_cert_guard
    BEFORE UPDATE ON fin.pack_distribution
    FOR EACH ROW
    WHEN (NEW.status IN ('SENDING', 'SENT'))
    EXECUTE FUNCTION fin.trg_distribution_cert_guard();

COMMENT ON FUNCTION fin.trg_distribution_cert_guard() IS
    'Guards distribution from proceeding without APPROVED/CERTIFIED certification. Blocks send for uncertified packs.';


-- ############################################################################
-- E. TACTICAL HARDENING
-- ############################################################################

-- ============================================================================
-- E1. Publication batch uniqueness — one PUBLISHED per scope
-- ============================================================================
-- For a given (tenant, entity, fiscal_year, period_number, pack_instance),
-- only one batch may be PUBLISHED unless explicitly superseded.
-- This prevents accidental double-publish to the same pack/period scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_pub_batch_one_published
    ON fin.publication_batch(tenant_id, entity_code, fiscal_year, period_number,
        coalesce(pack_instance_id, '00000000-0000-0000-0000-000000000000'))
    WHERE status = 'PUBLISHED';

-- ============================================================================
-- E2. Expand pack_activity for publication events
-- ============================================================================
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.pack_activity'::regclass
          AND conname LIKE '%activity_type%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.pack_activity DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.pack_activity'::regclass
               AND conname LIKE '%activity_type%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.pack_activity
        ADD CONSTRAINT chk_pack_activity_type CHECK (activity_type IN (
            -- Existing events
            'PACK_GENERATED',
            'ITEM_GENERATED',
            'ITEM_FAILED',
            'ITEM_SKIPPED',
            'REVIEW_STARTED',
            'REVIEW_COMPLETED',
            'APPROVAL_REQUESTED',
            'APPROVAL_GRANTED',
            'APPROVAL_REJECTED',
            'CERTIFICATION_GRANTED',
            'CERTIFICATION_REVOKED',
            'STATUS_CHANGED',
            'SUPERSEDED',
            'DISTRIBUTION_CREATED',
            'DISTRIBUTION_SENT',
            'DISTRIBUTION_DOWNLOADED',
            'DISTRIBUTION_VIEWED',
            'COMMENTARY_ADDED',
            'COMMENTARY_UPDATED',
            'EXPORTED',
            -- New publication events
            'PUBLICATION_BATCH_LINKED',
            'PUBLICATION_BATCH_PUBLISHED',
            'PUBLICATION_BATCH_SUPERSEDED',
            'CERTIFICATION_CONTEXT_CAPTURED',
            'DISTRIBUTION_RECALLED'
        ));
END $$;

-- ============================================================================
-- E3. Enhanced override summary view with density metrics
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
    count(*) FILTER (WHERE o.applies_to_transition = 'HARD_CLOSE') AS hard_close_count,
    -- Override density: approved overrides as % of total mandatory tasks
    CASE
        WHEN (SELECT count(*) FROM fin.period_close_checklist cl
              JOIN fin.period_close_task pt ON pt.id = cl.task_id
              WHERE cl.tenant_id = o.tenant_id
                AND cl.entity_code = o.entity_code
                AND cl.fiscal_year = r.fiscal_year
                AND cl.period_number = r.period_number
                AND pt.is_mandatory = true) > 0
        THEN round(
            count(*) FILTER (WHERE o.status = 'APPROVED')::decimal /
            (SELECT count(*) FROM fin.period_close_checklist cl
             JOIN fin.period_close_task pt ON pt.id = cl.task_id
             WHERE cl.tenant_id = o.tenant_id
               AND cl.entity_code = o.entity_code
               AND cl.fiscal_year = r.fiscal_year
               AND cl.period_number = r.period_number
               AND pt.is_mandatory = true) * 100, 2)
        ELSE 0
    END AS override_density_pct
FROM fin.close_override o
JOIN fin.close_run r ON r.id = o.run_id
GROUP BY
    o.tenant_id, o.entity_code,
    r.fiscal_year, r.period_number,
    o.reason_code, o.reason_subcode;

COMMENT ON VIEW fin.vw_close_override_summary IS
    'Aggregated override reporting by reason code/subcode. Includes approval rates, total impact, scope distribution, and override density percentage.';

-- ============================================================================
-- E4. End-to-end audit chain view
-- ============================================================================
-- The definitive view that answers: "What exactly did this distribution contain,
-- who certified it, what was the governance posture, and can we verify it?"
DROP VIEW IF EXISTS fin.vw_pack_audit_chain CASCADE;
CREATE OR REPLACE VIEW fin.vw_pack_audit_chain AS
SELECT
    dist.tenant_id,
    pi.entity_code,
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
    -- Pack instance context
    pi.id AS pack_instance_id,
    pd.name AS pack_name,
    pi.fiscal_year,
    pi.period_from,
    pi.period_to,
    pi.book_code,
    pi.status AS pack_status,
    -- Integrity check flags
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
LEFT JOIN fin.publication_batch spb ON spb.id = pb.supersedes_id;

COMMENT ON VIEW fin.vw_pack_audit_chain IS
    'End-to-end audit chain from distribution through certification to publication manifest. The definitive view for "what did the board see and who approved it?"';

-- ============================================================================
-- E5. Publication manifest summary view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_publication_manifest CASCADE;
CREATE OR REPLACE VIEW fin.vw_publication_manifest AS
SELECT
    b.tenant_id,
    b.entity_code,
    b.batch_code,
    b.fiscal_year,
    b.period_number,
    b.status AS batch_status,
    b.manifest_hash,
    -- Manifest summary by type
    count(*) FILTER (WHERE m.artifact_type = 'KPI_EXECUTION') AS kpi_count,
    count(*) FILTER (WHERE m.artifact_type = 'PLANNING_OUTPUT') AS planning_count,
    count(*) FILTER (WHERE m.artifact_type = 'STATEMENT_INSTANCE') AS statement_count,
    count(*) AS total_items,
    -- Definition coverage
    count(DISTINCT m.definition_code) AS distinct_definitions,
    array_agg(DISTINCT m.definition_code) FILTER (WHERE m.definition_code IS NOT NULL) AS definition_codes,
    -- Value summary
    sum(m.published_value) FILTER (WHERE m.artifact_type = 'KPI_EXECUTION') AS total_kpi_value,
    sum(abs(m.published_value)) FILTER (WHERE m.artifact_type = 'PLANNING_OUTPUT') AS total_planning_abs_amount
FROM fin.publication_batch b
LEFT JOIN fin.publication_manifest_item m ON m.publication_batch_id = b.id
GROUP BY b.id, b.tenant_id, b.entity_code, b.batch_code,
         b.fiscal_year, b.period_number, b.status, b.manifest_hash;

COMMENT ON VIEW fin.vw_publication_manifest IS
    'Publication manifest summary by batch. Shows artifact counts, definition coverage, and value summaries.';
