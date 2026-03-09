-- ============================================================================
-- 215_review_snapshot.sql
--
-- Phase 13: CFO Review Pack & Board Reporting Layer.
--   fin.review_snapshot — point-in-time capture of full workspace state
--                         for CFO signoff, board prep, and audit trail.
--
-- Design principles:
--   1. Generic review_type — works for CFO, board, audit committee, interim
--   2. Immutable once SIGNED_OFF — workspace_state JSONB is sealed
--   3. snapshot_hash for tamper detection
--   4. Links to existing pack/cert/close infrastructure
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.review_snapshot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    fiscal_year     SMALLINT NOT NULL,
    period_number   SMALLINT NOT NULL,

    -- Review identity
    snapshot_code   VARCHAR(50) NOT NULL,       -- e.g. 'REVIEW-2026-P3-001'
    review_type     VARCHAR(30) NOT NULL DEFAULT 'cfo_review'
                    CHECK (review_type IN (
                        'cfo_review',
                        'board_prep',
                        'audit_committee',
                        'interim',
                        'custom'
                    )),
    title           VARCHAR(300),
    description     TEXT,

    -- Lifecycle
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN (
                        'DRAFT',            -- being assembled
                        'REVIEWED',         -- reviewed, pending signoff
                        'SIGNED_OFF',       -- formally signed off (immutable)
                        'DISTRIBUTED',      -- sent to recipients
                        'SUPERSEDED'        -- replaced by newer snapshot
                    )),

    -- Linkage to existing infrastructure
    pack_instance_id    UUID REFERENCES fin.report_pack_instance(id),
    certification_id    UUID REFERENCES fin.pack_certification(id),
    close_run_id        UUID,               -- FK to fin.close_run if exists

    -- Full workspace state at snapshot time (immutable JSONB)
    workspace_state     JSONB NOT NULL,     -- serialized ReviewPackDTO

    -- Structured sections (ordered commentary for formal document)
    sections            JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Array of: { sectionKey, title, body, sourceType, generated }

    -- Integrity
    snapshot_hash       VARCHAR(128),       -- SHA-256 of workspace_state

    -- Readiness metrics at snapshot time
    readiness_score     SMALLINT,
    phase               VARCHAR(30),
    blocker_count       SMALLINT DEFAULT 0,
    open_action_items   SMALLINT DEFAULT 0,
    decision_count      SMALLINT DEFAULT 0,
    carryforward_count  SMALLINT DEFAULT 0,

    -- Signoff
    signed_off_by       UUID,
    signed_off_by_name  VARCHAR(200),
    signed_off_at       TIMESTAMPTZ,
    signoff_notes       TEXT,

    -- Supersession
    supersedes_id       UUID REFERENCES fin.review_snapshot(id),

    -- Audit
    created_by          UUID,
    created_by_name     VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_review_snapshot_code UNIQUE (tenant_id, entity_code, snapshot_code)
);

CREATE INDEX IF NOT EXISTS idx_fin_review_snapshot_period
    ON fin.review_snapshot(tenant_id, entity_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_review_snapshot_status
    ON fin.review_snapshot(tenant_id, entity_code, status)
    WHERE status NOT IN ('SUPERSEDED');
CREATE INDEX IF NOT EXISTS idx_fin_review_snapshot_pack
    ON fin.review_snapshot(pack_instance_id)
    WHERE pack_instance_id IS NOT NULL;
