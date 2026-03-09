-- ============================================================================
-- 217_assurance_hub.sql
--
-- Phase 15: Finance Assurance Hub & External Audit Workspace.
--   1. Extend fin.action_item CHECK for evidence_request/pbc_item targets
--   2. Extend fin.decision_log CHECK for evidence_request target
--   3. Extend fin.review_attestation CHECK for evidence_bundle target
--   4. CREATE fin.evidence_bundle — governed export container
--   5. CREATE fin.evidence_bundle_item — artifact references within a bundle
--   6. Extend fin.pack_distribution for bundle distribution
--   7. Extend fin.pack_activity for evidence events
--
-- Design principles:
--   1. Maximize reuse of existing polymorphic tables
--   2. Only 2 new tables (evidence_bundle + evidence_bundle_item)
--   3. PBC requests = action_items with target_kind='evidence_request'
--   4. Resubmission history = report_commentary on action_items
--   5. External distribution = pack_distribution with bundle linkage
-- ============================================================================


-- ============================================================================
-- 1. Extend fin.action_item target_kind for evidence requests
-- ============================================================================
-- Drop and re-create CHECK to add 'evidence_request' and 'pbc_item'
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.action_item'::regclass
          AND contype = 'c'
          AND conname LIKE '%target_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.action_item DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.action_item'::regclass
               AND contype = 'c'
               AND conname LIKE '%target_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.action_item
        ADD CONSTRAINT chk_action_item_target_kind CHECK (target_kind IN (
            'period_close',
            'pack_instance',
            'statement',
            'release',
            'entity',
            'evidence_request',
            'pbc_item'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add source types for audit-originated requests
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.action_item'::regclass
          AND contype = 'c'
          AND conname LIKE '%source%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.action_item DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.action_item'::regclass
               AND contype = 'c'
               AND conname LIKE '%source%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.action_item
        ADD CONSTRAINT chk_action_item_source CHECK (source IN (
            'manual', 'system', 'carryforward',
            'audit_request', 'regulator', 'pbc'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. Extend fin.decision_log target_kind for evidence requests
-- ============================================================================
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.decision_log'::regclass
          AND contype = 'c'
          AND conname LIKE '%target_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.decision_log DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.decision_log'::regclass
               AND contype = 'c'
               AND conname LIKE '%target_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.decision_log
        ADD CONSTRAINT chk_decision_log_target_kind CHECK (target_kind IN (
            'period_close',
            'pack_instance',
            'action_item',
            'release',
            'statement',
            'entity',
            'evidence_request',
            'evidence_bundle'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 3. Extend fin.review_attestation target_kind for evidence bundles
-- ============================================================================
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.review_attestation'::regclass
          AND contype = 'c'
          AND conname LIKE '%target_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.review_attestation DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.review_attestation'::regclass
               AND contype = 'c'
               AND conname LIKE '%target_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.review_attestation
        ADD CONSTRAINT chk_attestation_target_kind CHECK (target_kind IN (
            'review_snapshot',
            'pack_instance',
            'distribution',
            'release',
            'evidence_bundle'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 4. fin.evidence_bundle — Governed export container
-- ============================================================================
-- Assembles selected artifacts into a governed, hashable bundle for
-- external distribution to auditors, regulators, or audit committee.
-- Each bundle has a lifecycle: DRAFT -> SEALED -> DISTRIBUTED -> EXPIRED.

CREATE TABLE IF NOT EXISTS fin.evidence_bundle (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    -- Identity
    bundle_code         VARCHAR(50) NOT NULL,
    title               VARCHAR(300) NOT NULL,
    description         TEXT,

    -- Period context
    fiscal_year         SMALLINT NOT NULL,
    period_number       SMALLINT NOT NULL,

    -- Bundle classification
    bundle_type         VARCHAR(30) NOT NULL DEFAULT 'general'
                        CHECK (bundle_type IN (
                            'general',              -- general evidence collection
                            'pbc',                  -- prepared-by-client package
                            'audit_response',       -- response to audit request
                            'regulatory',           -- regulatory submission
                            'board_pack',           -- board-ready package
                            'compliance'            -- compliance evidence
                        )),

    -- Recipient context (who requested / who it's for)
    requested_by_org    VARCHAR(200),           -- e.g. "Deloitte", "HMRC", "Audit Committee"
    requested_by_name   VARCHAR(200),
    requested_at        TIMESTAMPTZ,
    due_at              TIMESTAMPTZ,

    -- Lifecycle
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN (
                            'DRAFT',        -- items being assembled
                            'SEALED',       -- locked, hash computed, ready for distribution
                            'DISTRIBUTED',  -- sent to recipients
                            'EXPIRED'       -- access window closed
                        )),

    -- Integrity
    bundle_hash         VARCHAR(64),            -- SHA-256 of canonical bundle content
    item_count          SMALLINT NOT NULL DEFAULT 0,

    -- Sealed by
    sealed_by           UUID,
    sealed_by_name      VARCHAR(200),
    sealed_at           TIMESTAMPTZ,

    -- Access governance
    access_window_start TIMESTAMPTZ,            -- when external access opens
    access_window_end   TIMESTAMPTZ,            -- when external access expires

    -- Linked review snapshot (optional — ties bundle to a point-in-time review)
    review_snapshot_id  UUID,

    -- Distribution reference (set when distributed via pack_distribution)
    distribution_id     UUID,

    -- Audit
    created_by          UUID,
    created_by_name     VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_evidence_bundle UNIQUE (tenant_id, entity_code, bundle_code)
);

-- Deferred FKs (review_snapshot may be created after this migration)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.evidence_bundle'::regclass
          AND conname = 'fk_evidence_bundle_snapshot'
    ) THEN
        ALTER TABLE fin.evidence_bundle
            ADD CONSTRAINT fk_evidence_bundle_snapshot
            FOREIGN KEY (review_snapshot_id) REFERENCES fin.review_snapshot(id);
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_evidence_bundle_period
    ON fin.evidence_bundle(tenant_id, entity_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_evidence_bundle_status
    ON fin.evidence_bundle(tenant_id, status)
    WHERE status NOT IN ('EXPIRED');
CREATE INDEX IF NOT EXISTS idx_fin_evidence_bundle_due
    ON fin.evidence_bundle(due_at)
    WHERE status = 'DRAFT' AND due_at IS NOT NULL;

COMMENT ON TABLE fin.evidence_bundle IS
    'Governed evidence export container for audit, compliance, and board reporting. Assembles selected artifacts with integrity hashing and access control.';


-- ============================================================================
-- 5. fin.evidence_bundle_item — Artifact references within a bundle
-- ============================================================================
-- Each item references an existing artifact by kind + ID.
-- Captures the artifact hash at inclusion time for tamper detection.

CREATE TABLE IF NOT EXISTS fin.evidence_bundle_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id           UUID NOT NULL REFERENCES fin.evidence_bundle(id) ON DELETE CASCADE,

    -- Artifact reference (polymorphic)
    artifact_kind       VARCHAR(30) NOT NULL
                        CHECK (artifact_kind IN (
                            'review_snapshot',      -- fin.review_snapshot
                            'review_section',       -- section within a snapshot
                            'attestation',          -- fin.review_attestation
                            'decision',             -- fin.decision_log
                            'action_item',          -- fin.action_item
                            'commentary',           -- fin.report_commentary
                            'publication_manifest',  -- fin.publication_manifest_item
                            'close_override',       -- fin.close_override
                            'certification',        -- fin.pack_certification
                            'readiness_snapshot',   -- fin.close_readiness_snapshot
                            'pack_instance',        -- fin.report_pack_instance
                            'statement_instance',   -- fin.statement_instance
                            'activity_log',         -- fin.pack_activity
                            'custom'                -- ad-hoc evidence (JSONB payload)
                        )),
    artifact_id         UUID,                   -- NULL for 'custom' kind
    artifact_label      VARCHAR(300) NOT NULL,   -- human-readable label

    -- Section context (for review_section kind)
    section_key         VARCHAR(50),

    -- Artifact integrity at inclusion time
    artifact_hash       VARCHAR(64),            -- SHA-256 of artifact content at seal time

    -- Custom evidence payload (for 'custom' kind)
    custom_payload      JSONB,

    -- Ordering within the bundle
    sort_order          SMALLINT NOT NULL DEFAULT 0,

    -- Inclusion metadata
    included_by         UUID,
    included_by_name    VARCHAR(200),
    included_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    inclusion_note      TEXT,

    CONSTRAINT uq_fin_evidence_bundle_item UNIQUE (bundle_id, artifact_kind, artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_evidence_bundle_item_bundle
    ON fin.evidence_bundle_item(bundle_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_fin_evidence_bundle_item_artifact
    ON fin.evidence_bundle_item(artifact_kind, artifact_id);

COMMENT ON TABLE fin.evidence_bundle_item IS
    'Individual artifact references within an evidence bundle. Each item captures the artifact hash at inclusion time for per-item integrity verification.';

-- Immutability guard for sealed bundles — items cannot be modified after seal
DROP FUNCTION IF EXISTS fin.trg_evidence_bundle_item_seal_guard() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_evidence_bundle_item_seal_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_status varchar(20);
BEGIN
    SELECT status INTO v_status FROM fin.evidence_bundle WHERE id = OLD.bundle_id;

    IF v_status IN ('SEALED', 'DISTRIBUTED') THEN
        RAISE EXCEPTION 'Cannot modify items in a % evidence bundle', v_status;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_evidence_item_seal_guard ON fin.evidence_bundle_item;
CREATE TRIGGER trg_evidence_item_seal_guard
    BEFORE UPDATE OR DELETE ON fin.evidence_bundle_item
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_evidence_bundle_item_seal_guard();


-- ============================================================================
-- 6. Extend fin.pack_distribution for evidence bundle distribution
-- ============================================================================
-- Add optional evidence_bundle_id so distributions can reference bundles
-- in addition to (or instead of) pack instances.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fin'
      AND table_name = 'pack_distribution'
      AND column_name = 'evidence_bundle_id'
  ) THEN
    ALTER TABLE fin.pack_distribution
      ADD COLUMN evidence_bundle_id UUID;

    -- Deferred FK
    BEGIN
        ALTER TABLE fin.pack_distribution
            ADD CONSTRAINT fk_dist_evidence_bundle
            FOREIGN KEY (evidence_bundle_id) REFERENCES fin.evidence_bundle(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    CREATE INDEX IF NOT EXISTS idx_fin_distribution_bundle
      ON fin.pack_distribution(evidence_bundle_id)
      WHERE evidence_bundle_id IS NOT NULL;
  END IF;
END $$;

-- Add access_window_start for controlled access windows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fin'
      AND table_name = 'pack_distribution'
      AND column_name = 'access_window_start'
  ) THEN
    ALTER TABLE fin.pack_distribution
      ADD COLUMN access_window_start TIMESTAMPTZ;
  END IF;
END $$;

-- Add recipient_class for external party categorization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fin'
      AND table_name = 'pack_distribution'
      AND column_name = 'recipient_class'
  ) THEN
    ALTER TABLE fin.pack_distribution
      ADD COLUMN recipient_class VARCHAR(30) DEFAULT 'internal'
        CHECK (recipient_class IN (
            'internal',         -- internal finance team
            'management',       -- executive management
            'board',            -- board / audit committee
            'external_audit',   -- external auditors
            'internal_audit',   -- internal audit team
            'regulator',        -- regulatory body
            'other'             -- other external party
        ));
  END IF;
END $$;


-- ============================================================================
-- 7. Extend fin.pack_activity for evidence events
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
            -- Publication events (Phase 6)
            'PUBLICATION_BATCH_LINKED',
            'PUBLICATION_BATCH_PUBLISHED',
            'PUBLICATION_BATCH_SUPERSEDED',
            'CERTIFICATION_CONTEXT_CAPTURED',
            'DISTRIBUTION_RECALLED',
            -- Evidence events (Phase 15)
            'EVIDENCE_BUNDLE_CREATED',
            'EVIDENCE_BUNDLE_SEALED',
            'EVIDENCE_BUNDLE_DISTRIBUTED',
            'EVIDENCE_BUNDLE_EXPIRED',
            'EVIDENCE_REQUEST_CREATED',
            'EVIDENCE_REQUEST_FULFILLED'
        ));
END $$;
