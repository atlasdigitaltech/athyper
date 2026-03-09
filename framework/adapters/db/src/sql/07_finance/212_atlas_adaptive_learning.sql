-- 212_atlas_adaptive_learning.sql
--
-- Atlas Phase 6 — Adaptive Learning
--
-- Feedback tracking for anomalies and recommendations,
-- plus per-entity/account threshold calibration.
--
-- Design constraints:
--   - Calibrations are SUGGESTED, never auto-applied
--   - No mutation of finance truth — only tunes detection sensitivity
--   - Reason codes use enum taxonomy (not free-text)
--   - Append-only feedback log — immutable for audit

-- ---------------------------------------------------------------------------
-- 1. Atlas Feedback — tracks user feedback on anomalies & recommendations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.atlas_feedback (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    entity_code         varchar(20) NOT NULL,
    fiscal_year         int NOT NULL,
    period_number       int NOT NULL,

    -- What is being evaluated
    feedback_target     varchar(20) NOT NULL
        CHECK (feedback_target IN ('ANOMALY', 'RECOMMENDATION')),

    -- Reference to the target
    -- For ANOMALY: atlas_anomaly.id UUID
    -- For RECOMMENDATION: recommendation key string (ephemeral, no FK)
    target_id           text NOT NULL,

    -- Anomaly context (populated when feedback_target = 'ANOMALY')
    anomaly_type        text,
    anomaly_severity    text,
    account_code        varchar(20),

    -- User verdict
    verdict             varchar(20) NOT NULL
        CHECK (verdict IN (
            'CONFIRMED',          -- user confirms this is a real issue
            'FALSE_POSITIVE',     -- user marks as false positive
            'ACCEPTED',           -- user accepts recommendation
            'DISMISSED',          -- user dismisses recommendation
            'DEFERRED'            -- user defers action to later
        )),

    -- Structured reason code (enum, not free-text)
    reason_code         varchar(30)
        CHECK (reason_code IN (
            'SEASONAL_PATTERN',       -- normal seasonal variation
            'ONE_TIME_EVENT',         -- non-recurring, expected
            'KNOWN_ADJUSTMENT',       -- pre-approved adjustment
            'DATA_QUALITY',           -- source data issue, not real anomaly
            'THRESHOLD_TOO_SENSITIVE',-- z-score threshold too low for this entity/account
            'THRESHOLD_TOO_LOOSE',    -- threshold too high, missed real issue
            'NOT_ACTIONABLE',         -- recommendation cannot be acted upon
            'ALREADY_ADDRESSED',      -- issue was already resolved
            'INCORRECT_OWNER',        -- wrong owner role suggested
            'IMMATERIAL',             -- below materiality threshold
            'OTHER'                   -- free-text in reason_detail
        )),
    reason_detail       text,

    -- Outcome tracking (filled later — was the feedback correct?)
    outcome_verified    boolean,
    outcome_notes       text,

    -- Evidence snapshot (immutable context when feedback was given)
    evidence_snapshot   jsonb NOT NULL DEFAULT '{}',

    -- Audit
    submitted_by        uuid NOT NULL,
    submitted_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- Period FK
    CONSTRAINT fk_atlas_feedback_period
        FOREIGN KEY (tenant_id, entity_code, fiscal_year, period_number)
        REFERENCES fin.fiscal_period (tenant_id, entity_code, fiscal_year, period_number)
        DEFERRABLE INITIALLY DEFERRED
);

-- Index for querying feedback by target
CREATE INDEX IF NOT EXISTS idx_atlas_feedback_target
    ON fin.atlas_feedback (tenant_id, entity_code, feedback_target, target_id);

-- Index for calibration queries (false positive rates per anomaly type)
CREATE INDEX IF NOT EXISTS idx_atlas_feedback_calibration
    ON fin.atlas_feedback (tenant_id, entity_code, anomaly_type, verdict)
    WHERE feedback_target = 'ANOMALY';

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_atlas_feedback_submitted
    ON fin.atlas_feedback (tenant_id, entity_code, submitted_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Atlas Threshold Calibration — per-entity/account threshold overrides
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fin.atlas_threshold_calibration (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    entity_code         varchar(20) NOT NULL,

    -- Scope: entity-wide or per-account
    account_code        varchar(20),           -- NULL = entity-wide default

    -- Which anomaly type this calibration applies to
    anomaly_type        text NOT NULL,

    -- Calibrated thresholds (override the global 2.5 / 3.0 defaults)
    warning_z_threshold decimal(6,2) NOT NULL DEFAULT 2.50,
    critical_z_threshold decimal(6,2) NOT NULL DEFAULT 3.00,

    -- Status: only APPROVED calibrations are used by the detector
    status              varchar(20) NOT NULL DEFAULT 'SUGGESTED'
        CHECK (status IN (
            'SUGGESTED',          -- computed from feedback, awaiting approval
            'APPROVED',           -- human-approved, active
            'REJECTED',           -- human-rejected
            'SUPERSEDED'          -- replaced by newer calibration
        )),

    -- How this calibration was derived
    source              varchar(20) NOT NULL DEFAULT 'FEEDBACK'
        CHECK (source IN (
            'FEEDBACK',           -- computed from false positive rates
            'MANUAL',             -- manually configured by admin
            'BASELINE_DRIFT'      -- triggered by baseline quality metrics
        )),

    -- Evidence: false positive rate, sample size, confidence
    false_positive_rate decimal(5,2),          -- e.g., 0.35 = 35%
    sample_size         int,                   -- number of anomalies in sample
    confidence          decimal(5,2),          -- confidence in suggestion

    -- Approval governance
    suggested_at        timestamptz NOT NULL DEFAULT now(),
    suggested_by        text,                  -- 'atlas.calibration.service' or user UUID
    approved_by         uuid,
    approved_at         timestamptz,
    rejection_reason    text,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_calibration_scope
    ON fin.atlas_threshold_calibration (
        tenant_id, entity_code, COALESCE(account_code, '__ENTITY__'), anomaly_type
    );

-- Index for detector lookups (only APPROVED calibrations)
CREATE INDEX IF NOT EXISTS idx_atlas_calibration_active
    ON fin.atlas_threshold_calibration (tenant_id, entity_code, anomaly_type, status)
    WHERE status = 'APPROVED';

-- ---------------------------------------------------------------------------
-- 3. Convenience view: false positive rates per anomaly type per entity
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS fin.vw_atlas_false_positive_rates CASCADE;
CREATE OR REPLACE VIEW fin.vw_atlas_false_positive_rates AS
SELECT
    f.tenant_id,
    f.entity_code,
    f.anomaly_type,
    f.account_code,
    COUNT(*) AS total_feedback,
    COUNT(*) FILTER (WHERE f.verdict = 'FALSE_POSITIVE') AS false_positive_count,
    COUNT(*) FILTER (WHERE f.verdict = 'CONFIRMED') AS confirmed_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE f.verdict = 'FALSE_POSITIVE')
        / NULLIF(COUNT(*), 0), 2
    ) AS false_positive_pct,
    -- Most common false positive reason
    MODE() WITHIN GROUP (ORDER BY f.reason_code)
        FILTER (WHERE f.verdict = 'FALSE_POSITIVE') AS top_fp_reason,
    MAX(f.submitted_at) AS latest_feedback_at
FROM fin.atlas_feedback f
WHERE f.feedback_target = 'ANOMALY'
GROUP BY f.tenant_id, f.entity_code, f.anomaly_type, f.account_code;

COMMENT ON VIEW fin.vw_atlas_false_positive_rates IS
    'Aggregated false positive rates per anomaly type/account — input for threshold calibration';
