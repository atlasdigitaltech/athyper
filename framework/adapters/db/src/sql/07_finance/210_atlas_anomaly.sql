/* ============================================================================
   Athyper v2.10 — Atlas AI: Anomaly Detection Engine
   Schema: fin
   Dependencies: 166_atlas_ai.sql, 190_posting.sql, 205_close_risk_signals.sql

   Phase 1 of the Atlas Intelligence Layer — statistical anomaly detection
   for financial close operations.

   Architecture:
     - Baselines computed post-close from trailing GL balance history
     - Anomaly detector compares current period against baselines
     - Detected anomalies feed into existing close_risk_signal system
       via the 'atlas_anomaly' rule_type
     - Atlas is advisory — it never posts, certifies, or releases

   Anomaly types:
     UNUSUAL_ADJUSTMENT   — period-end adjustments exceed historical baseline
     RECON_VARIANCE       — reconciliation discrepancy outside tolerance
     EXCEPTION_PATTERN    — override/exception count above historical norm
     AMOUNT_OUTLIER       — account balance z-score exceeds threshold
     TIMING_ANOMALY       — posting date pattern break vs historical cadence
     MISSING_RECURRENCE   — expected recurring entry absent for current period
   ============================================================================ */

-- ============================================================================
-- fin.atlas_anomaly_baseline — Rolling statistical baselines per account
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.atlas_anomaly_baseline (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code     varchar(20) NOT NULL,
    account_id      uuid REFERENCES fin.chart_of_accounts(id),  -- NULL for entity-level baselines

    -- What metric this baseline tracks
    metric_type     text NOT NULL
        CHECK (metric_type IN (
            'PERIOD_DEBIT',         -- sum of period debits
            'PERIOD_CREDIT',        -- sum of period credits
            'NET_MOVEMENT',         -- debit - credit
            'ADJUSTMENT_COUNT',     -- count of adjustment JEs
            'POSTING_DAY_OF_MONTH', -- avg day-of-month for postings
            'RECON_VARIANCE',       -- avg reconciliation variance
            'LAST_3_DAYS_VOLUME',   -- JE count in last 3 days of period
            'MANUAL_ENTRY_RATIO',   -- ratio of manual JEs to total
            'CLOSE_TASK_DURATION',  -- avg task completion hours
            'WAIVER_COUNT',         -- count of waived tasks per period
            'MAX_ADJUSTMENT_AMOUNT' -- largest single adjustment amount
        )),

    -- Statistical baseline values
    baseline_mean   decimal(18,4) NOT NULL,
    baseline_stddev decimal(18,4) NOT NULL,
    sample_count    int NOT NULL CHECK (sample_count > 0),

    -- Window this baseline was computed over
    window_periods  int NOT NULL DEFAULT 12,    -- trailing N periods
    fiscal_year_from int NOT NULL,
    period_from     int NOT NULL,
    fiscal_year_to  int NOT NULL,
    period_to       int NOT NULL,

    book_code       varchar(10) NOT NULL DEFAULT 'STAT',
    currency_code   varchar(3) NOT NULL DEFAULT 'USD',

    computed_at     timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz        -- NULL = no expiry, recompute on next close
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_baseline
    ON fin.atlas_anomaly_baseline (
        tenant_id, entity_code, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_type, book_code
    );

CREATE INDEX IF NOT EXISTS idx_atlas_baseline_tenant
    ON fin.atlas_anomaly_baseline(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_atlas_baseline_account
    ON fin.atlas_anomaly_baseline(account_id);

-- ============================================================================
-- fin.atlas_anomaly — Detected anomalies
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.atlas_anomaly (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code     varchar(20) NOT NULL,

    -- What was detected
    anomaly_type    text NOT NULL
        CHECK (anomaly_type IN (
            'UNUSUAL_ADJUSTMENT',
            'RECON_VARIANCE',
            'EXCEPTION_PATTERN',
            'AMOUNT_OUTLIER',
            'TIMING_ANOMALY',
            'MISSING_RECURRENCE',
            'PERIOD_END_SPIKE',
            'MANUAL_JOURNAL_RATIO',
            'LATE_CLOSE_TASK',
            'OVERRIDE_SPIKE',
            'LARGE_ADJUSTMENT'
        )),
    severity        text NOT NULL DEFAULT 'INFO'
        CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),

    -- Financial context
    account_id      uuid REFERENCES fin.chart_of_accounts(id),
    fiscal_year     int NOT NULL,
    period_number   int NOT NULL,
    book_code       varchar(10) NOT NULL DEFAULT 'STAT',

    -- Statistical evidence
    observed_value  decimal(18,4),
    expected_value  decimal(18,4),
    z_score         decimal(8,4),
    baseline_id     uuid REFERENCES fin.atlas_anomaly_baseline(id),

    -- Human-readable
    title           text NOT NULL,
    description     text NOT NULL,

    -- Structured evidence for UI drill-down
    evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Link to risk signal system (set when escalated)
    risk_signal_id  uuid REFERENCES fin.close_risk_signal(id),

    -- Lifecycle
    status          text NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE')),
    acknowledged_by uuid,
    acknowledged_at timestamptz,
    resolved_by     uuid,
    resolved_at     timestamptz,
    resolution_notes text,

    detected_at     timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Prevent duplicate anomalies for same condition in same period
    CONSTRAINT uq_atlas_anomaly_dedup UNIQUE (
        tenant_id, entity_code, anomaly_type, account_id,
        fiscal_year, period_number, book_code
    )
);

CREATE INDEX IF NOT EXISTS idx_atlas_anomaly_active
    ON fin.atlas_anomaly(tenant_id, entity_code, fiscal_year, period_number)
    WHERE status IN ('OPEN', 'ACKNOWLEDGED');
CREATE INDEX IF NOT EXISTS idx_atlas_anomaly_severity
    ON fin.atlas_anomaly(severity, status)
    WHERE status IN ('OPEN', 'ACKNOWLEDGED');
CREATE INDEX IF NOT EXISTS idx_atlas_anomaly_account
    ON fin.atlas_anomaly(account_id)
    WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_anomaly_risk_signal
    ON fin.atlas_anomaly(risk_signal_id)
    WHERE risk_signal_id IS NOT NULL;

-- ============================================================================
-- View: Active anomalies sorted by severity then recency
-- ============================================================================

DROP VIEW IF EXISTS fin.vw_atlas_anomalies_active CASCADE;
CREATE OR REPLACE VIEW fin.vw_atlas_anomalies_active AS
SELECT
    a.*,
    c.account_code,
    c.account_name,
    c.account_type
FROM fin.atlas_anomaly a
LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
WHERE a.status IN ('OPEN', 'ACKNOWLEDGED')
ORDER BY
    CASE a.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'WARNING' THEN 2
        WHEN 'INFO' THEN 3
    END,
    a.detected_at DESC;

-- ============================================================================
-- View: Anomaly summary per period
-- ============================================================================

DROP VIEW IF EXISTS fin.vw_atlas_anomaly_summary CASCADE;
CREATE OR REPLACE VIEW fin.vw_atlas_anomaly_summary AS
SELECT
    a.tenant_id,
    a.entity_code,
    a.fiscal_year,
    a.period_number,
    count(*) FILTER (WHERE a.status IN ('OPEN', 'ACKNOWLEDGED')) AS active_count,
    count(*) FILTER (WHERE a.severity = 'CRITICAL' AND a.status IN ('OPEN', 'ACKNOWLEDGED')) AS critical_count,
    count(*) FILTER (WHERE a.severity = 'WARNING' AND a.status IN ('OPEN', 'ACKNOWLEDGED')) AS warning_count,
    count(*) FILTER (WHERE a.status = 'RESOLVED') AS resolved_count,
    count(*) FILTER (WHERE a.status = 'FALSE_POSITIVE') AS false_positive_count,
    count(*) AS total_count
FROM fin.atlas_anomaly a
GROUP BY a.tenant_id, a.entity_code, a.fiscal_year, a.period_number;
