-- ============================================================================
-- 216_review_governance.sql
--
-- Phase 14: Review Diff, Assurance Traceability, Distribution Governance.
--   fin.review_attestation — generic acknowledgment/attestation for any
--                            review artifact (board receipt, controller
--                            attestation, CFO confirmation, etc.)
--
--   ALTER fin.pack_distribution — add review_snapshot_id to bridge
--                                 snapshots to distributions.
--
-- Design principles:
--   1. Generic attestation — reusable for any role/artifact
--   2. Append-only attestation records (immutable once confirmed)
--   3. Minimal schema changes to existing tables
-- ============================================================================

-- ============================================================================
-- fin.review_attestation — Generic review acknowledgment/attestation
-- ============================================================================
-- Tracks who acknowledged/attested to a review snapshot or pack.
-- Supports: reviewer ack, board receipt, controller attestation, CFO notes.
-- Append-only by convention — confirmed attestations are immutable.

CREATE TABLE IF NOT EXISTS fin.review_attestation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- What is being attested
    target_kind     VARCHAR(30) NOT NULL
                    CHECK (target_kind IN (
                        'review_snapshot',
                        'pack_instance',
                        'distribution',
                        'release'
                    )),
    target_id       UUID NOT NULL,

    -- Attestation type
    attestation_type VARCHAR(30) NOT NULL
                    CHECK (attestation_type IN (
                        'acknowledgment',       -- received and noted
                        'review_complete',      -- reviewed the content
                        'attestation',          -- formal attestation of accuracy
                        'confirmation',         -- CFO/controller confirmation
                        'board_receipt',        -- board member receipt
                        'objection'             -- formal objection recorded
                    )),

    -- Attestor
    attested_by     UUID NOT NULL,
    attested_by_name VARCHAR(200),
    attested_by_role VARCHAR(50),       -- CFO, Controller, Board Member, etc.
    attested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Content
    notes           TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'withdrawn')),

    -- Period context
    fiscal_year     SMALLINT,
    period_number   SMALLINT,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attestation per target is append-only; unique per attestor + type + target
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_attestation_unique
    ON fin.review_attestation(tenant_id, target_kind, target_id, attestation_type, attested_by)
    WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_fin_attestation_target
    ON fin.review_attestation(tenant_id, target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_fin_attestation_period
    ON fin.review_attestation(tenant_id, entity_code, fiscal_year, period_number);


-- ============================================================================
-- Extend fin.pack_distribution — bridge snapshots to distributions
-- ============================================================================
-- Adds optional review_snapshot_id so we know which snapshot was distributed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fin'
      AND table_name = 'pack_distribution'
      AND column_name = 'review_snapshot_id'
  ) THEN
    ALTER TABLE fin.pack_distribution
      ADD COLUMN review_snapshot_id UUID REFERENCES fin.review_snapshot(id);

    CREATE INDEX IF NOT EXISTS idx_fin_distribution_snapshot
      ON fin.pack_distribution(review_snapshot_id)
      WHERE review_snapshot_id IS NOT NULL;
  END IF;
END $$;
