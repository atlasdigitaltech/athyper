/* ============================================================================
   Athyper v2.9 — Close-Document Bridge Phase 2
   Schema: fin
   Dependencies: 210_close_document_bridge.sql,
                 198c_financial_document_refinements.sql (fin.financial_document_posting),
                 204_close_orchestration_snapshot.sql

   Phase 8B enhancements:
   1. Book-aware document readiness (multi-book close operations)
   2. Close-specific defect classes (reversed-still-counted, multibook gaps,
      FX reval missing, IC elimination missing, approval evidence missing)
   3. Defect aging view (time-in-defect for prioritization)
   4. Document readiness counters on orchestration snapshot
   5. Defect trend materialization view

   Design: Still pure views on existing tables — zero migration risk.
   ============================================================================ */

-- ============================================================================
-- 1. fin.v_close_document_book_readiness — Book-level posting completeness
-- ============================================================================
-- For multi-book close (STAT + IFRS + LOCAL), a document is only "book-ready"
-- when ALL required books have POSTED entries in the posting bridge table.
--
-- Example: Purchase invoice posted to STAT but not IFRS means STAT-ready
-- but IFRS has a posting gap. This is invisible to the base readiness view
-- which only checks je_id (primary JE).
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_document_book_readiness CASCADE;
CREATE OR REPLACE VIEW fin.v_close_document_book_readiness AS
SELECT
    fd.id              AS doc_registry_id,
    fd.tenant_id,
    fd.entity_code,
    fd.doc_id,
    fd.doc_type,
    fd.doc_no,
    fd.status          AS canonical_status,
    fd.posting_date,
    fd.total_amount,
    fd.currency_code,
    fp.fiscal_year,
    fp.period_number,
    fdp.book_code,
    fdp.posting_status,
    fdp.je_id          AS book_je_id,
    fdp.posted_at      AS book_posted_at,
    -- Book-level readiness
    CASE
        WHEN fdp.posting_status = 'POSTED' THEN 'READY'
        WHEN fdp.posting_status = 'REVERSED' THEN 'READY'
        WHEN fdp.posting_status = 'FAILED' THEN 'DEFECT_BOOK_POSTING_FAILED'
        WHEN fdp.id IS NULL AND fd.status = 'POSTED' THEN 'DEFECT_BOOK_MISSING'
        ELSE NULL
    END AS book_readiness
FROM fin.financial_document fd
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = fd.tenant_id
    AND fp.entity_code  = fd.entity_code
    AND fd.posting_date >= fp.start_date
    AND fd.posting_date <= fp.end_date
LEFT JOIN fin.financial_document_posting fdp
    ON fdp.tenant_id    = fd.tenant_id
    AND fdp.doc_id      = fd.doc_id
WHERE fd.status IN ('POSTED', 'SETTLED', 'PARTIALLY_SETTLED');

COMMENT ON VIEW fin.v_close_document_book_readiness IS
    'Book-level posting completeness per document per period. Detects multi-book posting gaps where primary JE exists but secondary book postings are missing or failed.';

-- ============================================================================
-- 2. fin.v_close_document_book_summary — Aggregate book readiness per period
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_document_book_summary CASCADE;
CREATE OR REPLACE VIEW fin.v_close_document_book_summary AS
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    r.book_code,
    r.doc_type,
    COUNT(*)                                                    AS doc_count,
    COUNT(*) FILTER (WHERE r.book_readiness = 'READY')          AS ready_count,
    COUNT(*) FILTER (WHERE r.book_readiness = 'DEFECT_BOOK_POSTING_FAILED') AS failed_count,
    COUNT(*) FILTER (WHERE r.book_readiness = 'DEFECT_BOOK_MISSING')        AS missing_count
FROM fin.v_close_document_book_readiness r
WHERE r.book_code IS NOT NULL
GROUP BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number,
         r.book_code, r.doc_type;

COMMENT ON VIEW fin.v_close_document_book_summary IS
    'Aggregate book-level posting readiness per period/entity/book/doc_type. Powers multi-book close operations dashboard.';

-- ============================================================================
-- 3. fin.v_close_reversed_still_counted — Reversed docs still in close population
-- ============================================================================
-- Documents that were reversed but the reversal target (reversing_doc_id) is
-- also in the same period. Both the original and reversal should net to zero
-- but if the reversal is missing or in a different period, the original
-- is still "counted" in the close population without its offset.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_reversed_still_counted CASCADE;
CREATE OR REPLACE VIEW fin.v_close_reversed_still_counted AS
SELECT
    fd.id              AS doc_registry_id,
    fd.tenant_id,
    fd.entity_code,
    fd.doc_id,
    fd.doc_type,
    fd.doc_no,
    fd.total_amount,
    fd.currency_code,
    fd.posting_date,
    fd.reversed_doc_id,
    fp.fiscal_year,
    fp.period_number,
    -- Check if the reversing document is in the same period
    CASE
        WHEN rev.id IS NULL THEN 'REVERSAL_MISSING'
        WHEN rev.posting_date < fp.start_date OR rev.posting_date > fp.end_date
            THEN 'REVERSAL_DIFFERENT_PERIOD'
        ELSE 'REVERSAL_SAME_PERIOD'
    END AS reversal_alignment
FROM fin.financial_document fd
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = fd.tenant_id
    AND fp.entity_code  = fd.entity_code
    AND fd.posting_date >= fp.start_date
    AND fd.posting_date <= fp.end_date
LEFT JOIN fin.financial_document rev
    ON rev.tenant_id    = fd.tenant_id
    AND rev.doc_id      = fd.reversed_doc_id
WHERE fd.status = 'REVERSED'
  AND fd.reversed_doc_id IS NOT NULL
  AND (rev.id IS NULL
       OR rev.posting_date < fp.start_date
       OR rev.posting_date > fp.end_date);

COMMENT ON VIEW fin.v_close_reversed_still_counted IS
    'Reversed documents whose reversal entry is missing or in a different period. Close population includes the original without its offset.';

-- ============================================================================
-- 4. fin.v_close_approval_evidence_gap — Governed docs missing approval evidence
-- ============================================================================
-- Documents requiring approval (APPROVED/POSTED status, non-JE doc types)
-- that have no approval_instance_id or approval_route. Indicates approval
-- was bypassed outside the decision grid.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_approval_evidence_gap CASCADE;
CREATE OR REPLACE VIEW fin.v_close_approval_evidence_gap AS
SELECT
    fd.id              AS doc_registry_id,
    fd.tenant_id,
    fd.entity_code,
    fd.doc_id,
    fd.doc_type,
    fd.doc_no,
    fd.status          AS canonical_status,
    fd.posting_date,
    fd.total_amount,
    fd.currency_code,
    fd.approval_route,
    fd.approval_instance_id,
    fd.decision_score,
    fp.fiscal_year,
    fp.period_number,
    -- What's missing
    CASE
        WHEN fd.approval_instance_id IS NULL AND fd.approval_route IS NULL
            THEN 'NO_APPROVAL_EVIDENCE'
        WHEN fd.approval_instance_id IS NOT NULL AND fd.decision_score IS NULL
            THEN 'NO_DECISION_SCORE'
        ELSE 'PARTIAL'
    END AS gap_type
FROM fin.financial_document fd
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = fd.tenant_id
    AND fp.entity_code  = fd.entity_code
    AND fd.posting_date >= fp.start_date
    AND fd.posting_date <= fp.end_date
WHERE fd.status IN ('APPROVED', 'POSTED', 'SETTLED', 'PARTIALLY_SETTLED')
  AND fd.doc_type NOT IN ('JOURNAL_ENTRY')  -- JE has its own approval model
  AND (fd.approval_instance_id IS NULL OR fd.decision_score IS NULL);

COMMENT ON VIEW fin.v_close_approval_evidence_gap IS
    'Documents in APPROVED/POSTED state missing approval evidence (approval_instance_id or decision_score). Indicates potential approval bypass.';

-- ============================================================================
-- 5. fin.v_close_defect_aging — Defect duration for prioritization
-- ============================================================================
-- How long each defect has been in its current state. Powers the "aging"
-- dashboard widget — older defects get higher priority.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_defect_aging CASCADE;
CREATE OR REPLACE VIEW fin.v_close_defect_aging AS
SELECT
    d.doc_registry_id,
    d.tenant_id,
    d.entity_code,
    d.fiscal_year,
    d.period_number,
    d.doc_id,
    d.doc_type,
    d.doc_no,
    d.canonical_status,
    d.defect_type,
    d.defect_severity,
    d.total_amount,
    d.currency_code,
    d.posting_date,
    -- Aging buckets
    EXTRACT(EPOCH FROM (now() - fd.updated_at)) / 3600 AS hours_in_defect,
    CASE
        WHEN EXTRACT(EPOCH FROM (now() - fd.updated_at)) / 3600 > 72 THEN 'CRITICAL'
        WHEN EXTRACT(EPOCH FROM (now() - fd.updated_at)) / 3600 > 24 THEN 'OVERDUE'
        WHEN EXTRACT(EPOCH FROM (now() - fd.updated_at)) / 3600 > 8  THEN 'AGING'
        ELSE 'RECENT'
    END AS aging_bucket,
    fd.updated_at  AS defect_since
FROM fin.v_close_document_defects d
INNER JOIN fin.financial_document fd
    ON fd.id = d.doc_registry_id;

COMMENT ON VIEW fin.v_close_defect_aging IS
    'Defect aging analysis: how long each document has been in its defect state. CRITICAL >72h, OVERDUE >24h, AGING >8h, RECENT <8h.';

-- ============================================================================
-- 6. fin.v_close_document_trend — Per-period document readiness snapshot
-- ============================================================================
-- Compact aggregate designed for trend charting: one row per period with
-- all document readiness metrics. Join with close_orchestration_snapshot
-- for the combined task+document trend.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_document_trend CASCADE;
CREATE OR REPLACE VIEW fin.v_close_document_trend AS
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    COUNT(*)                                                        AS total_documents,
    COUNT(*) FILTER (WHERE r.close_readiness = 'READY')              AS ready_count,
    COUNT(*) FILTER (WHERE r.close_readiness != 'READY'
                       AND r.close_readiness != 'UNKNOWN')           AS defect_count,
    COUNT(*) FILTER (WHERE r.defect_severity = 'HIGH')               AS high_severity_count,
    COUNT(*) FILTER (WHERE r.defect_severity = 'MEDIUM')             AS medium_severity_count,
    COUNT(*) FILTER (WHERE r.defect_severity = 'LOW')                AS low_severity_count,
    CASE WHEN COUNT(*) > 0
         THEN ROUND(
             COUNT(*) FILTER (WHERE r.close_readiness = 'READY')::numeric
             / COUNT(*) * 100, 1)
         ELSE 100
    END AS readiness_pct,
    COALESCE(SUM(r.total_amount) FILTER (WHERE r.close_readiness != 'READY'
                                           AND r.close_readiness != 'UNKNOWN'), 0) AS defect_total_amount
FROM fin.v_close_document_readiness r
GROUP BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number;

COMMENT ON VIEW fin.v_close_document_trend IS
    'Compact per-period document readiness aggregate for trend charting. Join with close_orchestration_snapshot for combined task+document trends.';

-- ============================================================================
-- 7. Extend close_orchestration_snapshot with document readiness counters
-- ============================================================================
-- Add optional document readiness columns. These are populated at snapshot
-- capture time by querying v_close_document_trend.
-- ============================================================================
ALTER TABLE fin.close_orchestration_snapshot
    ADD COLUMN IF NOT EXISTS doc_total_count        integer,
    ADD COLUMN IF NOT EXISTS doc_ready_count        integer,
    ADD COLUMN IF NOT EXISTS doc_defect_count       integer,
    ADD COLUMN IF NOT EXISTS doc_high_severity_count integer,
    ADD COLUMN IF NOT EXISTS doc_readiness_pct      numeric(5,1);

COMMENT ON COLUMN fin.close_orchestration_snapshot.doc_total_count IS
    'Total financial documents in the period at snapshot time. NULL for snapshots captured before Phase 8B.';
COMMENT ON COLUMN fin.close_orchestration_snapshot.doc_readiness_pct IS
    'Document close-readiness percentage (0-100) at snapshot time. NULL for pre-8B snapshots.';

-- Update the latest view to include document readiness columns
DROP VIEW IF EXISTS fin.vw_close_orchestration_latest CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_orchestration_latest AS
SELECT DISTINCT ON (tenant_id, entity_code, fiscal_year, period_number, target_status)
    id,
    tenant_id,
    entity_code,
    fiscal_year,
    period_number,
    target_status,
    snapshot_at,
    snapshot_source,
    total_tasks,
    satisfied_count,
    ready_count,
    blocked_count,
    failed_count,
    not_ready_count,
    in_progress_count,
    critical_path_minutes,
    predicted_ready_at,
    blocker_task_codes,
    failed_task_codes,
    confidence,
    computation_version,
    triggered_by,
    -- Document readiness (Phase 8B)
    doc_total_count,
    doc_ready_count,
    doc_defect_count,
    doc_high_severity_count,
    doc_readiness_pct
FROM fin.close_orchestration_snapshot
ORDER BY tenant_id, entity_code, fiscal_year, period_number, target_status, snapshot_at DESC;

COMMENT ON VIEW fin.vw_close_orchestration_latest IS
    'Most recent orchestration snapshot for each period + target status. Includes document readiness counters (Phase 8B).';

-- Update the trend view to include document readiness columns
DROP VIEW IF EXISTS fin.vw_close_orchestration_trend CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_orchestration_trend AS
SELECT
    tenant_id,
    entity_code,
    fiscal_year,
    period_number,
    target_status,
    snapshot_at,
    snapshot_source,
    satisfied_count,
    total_tasks,
    CASE WHEN total_tasks > 0
         THEN ROUND(satisfied_count::numeric / total_tasks * 100, 1)
         ELSE 0
    END AS satisfaction_pct,
    critical_path_minutes,
    predicted_ready_at,
    confidence,
    blocked_count,
    failed_count,
    computation_version,
    -- Document readiness (Phase 8B)
    doc_total_count,
    doc_ready_count,
    doc_defect_count,
    doc_high_severity_count,
    doc_readiness_pct,
    -- Version boundary flag
    computation_version IS DISTINCT FROM LAG(computation_version) OVER (
        PARTITION BY tenant_id, entity_code, fiscal_year, period_number, target_status
        ORDER BY snapshot_at
    ) AS version_changed
FROM fin.close_orchestration_snapshot
WHERE snapshot_at >= now() - interval '30 days'
ORDER BY tenant_id, entity_code, fiscal_year, period_number, target_status, snapshot_at;

COMMENT ON VIEW fin.vw_close_orchestration_trend IS
    'Last 30 days of orchestration snapshots with document readiness counters. Enables combined task+document trend analysis.';
