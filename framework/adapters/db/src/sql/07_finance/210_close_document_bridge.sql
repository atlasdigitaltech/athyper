/* ============================================================================
   Athyper v2.8 — Close-Document Bridge Layer
   Schema: fin
   Dependencies: fin.financial_document (198_financial_document_registry.sql),
                 fin.fiscal_period, fin.period_close_checklist,
                 fin.period_close_task, fin.close_run

   Bridges the two core subsystems:
     - Document Registry  → source of truth for financial document lifecycle
     - Close Orchestration → governed period-close process

   This is a QUERY layer — no new tables. Views provide the join surface
   that close handlers, risk rules, and the UI command center need.

   Components:
   1. fin.v_close_document_readiness   — per-document close-blocking analysis
   2. fin.v_close_document_summary     — aggregate document stats per period
   3. fin.v_close_document_defects     — compliance defects blocking close
   4. fin.v_close_accrual_reversal_gap — accruals needing reversal in period
   5. fin.v_close_posting_gap          — documents approved but not posted
   ============================================================================ */

-- ============================================================================
-- 1. fin.v_close_document_readiness — Per-document close-blocking analysis
-- ============================================================================
-- Joins fin.financial_document against fin.fiscal_period to determine whether
-- each document in a given period is "close-ready" (POSTED/SETTLED/REVERSED)
-- or has an issue blocking close (DRAFT, IN_REVIEW, APPROVED-not-posted, FAILED).
--
-- Callers filter by tenant_id, entity_code, fiscal_year, period_number.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_document_readiness CASCADE;
CREATE OR REPLACE VIEW fin.v_close_document_readiness AS
SELECT
    fd.id              AS doc_registry_id,
    fd.tenant_id,
    fd.entity_code,
    fd.doc_id,
    fd.txn_id,
    fd.doc_type,
    fd.doc_no,
    fd.status          AS canonical_status,
    fd.source_status,
    fd.posting_date,
    fd.total_amount,
    fd.currency_code,
    fd.je_id,
    fp.fiscal_year,
    fp.period_number,
    -- Close readiness classification
    CASE
        WHEN fd.status IN ('POSTED', 'SETTLED', 'PARTIALLY_SETTLED', 'REVERSED', 'VOIDED', 'CANCELLED')
            THEN 'READY'
        WHEN fd.status = 'FAILED'
            THEN 'DEFECT_FAILED'
        WHEN fd.status = 'APPROVED' AND fd.je_id IS NULL
            THEN 'DEFECT_APPROVED_NOT_POSTED'
        WHEN fd.status IN ('DRAFT', 'IN_REVIEW')
            THEN 'DEFECT_UNFINALIZED'
        WHEN fd.status = 'POSTING_PENDING'
            THEN 'DEFECT_POSTING_PENDING'
        ELSE 'UNKNOWN'
    END AS close_readiness,
    -- Severity for risk signal evaluation
    CASE
        WHEN fd.status = 'FAILED' THEN 'HIGH'
        WHEN fd.status = 'APPROVED' AND fd.je_id IS NULL THEN 'HIGH'
        WHEN fd.status = 'POSTING_PENDING' THEN 'MEDIUM'
        WHEN fd.status IN ('DRAFT', 'IN_REVIEW') THEN 'LOW'
        ELSE NULL
    END AS defect_severity
FROM fin.financial_document fd
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = fd.tenant_id
    AND fp.entity_code  = fd.entity_code
    AND fd.posting_date >= fp.start_date
    AND fd.posting_date <= fp.end_date;

COMMENT ON VIEW fin.v_close_document_readiness IS
    'Per-document close readiness analysis. Joins document registry with fiscal period to classify each document as READY or a specific defect type.';

-- ============================================================================
-- 2. fin.v_close_document_summary — Aggregate document stats per period
-- ============================================================================
-- Powers the Close Command Center dashboard — counts by doc_type × readiness.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_document_summary CASCADE;
CREATE OR REPLACE VIEW fin.v_close_document_summary AS
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    r.doc_type,
    r.close_readiness,
    COUNT(*)                            AS doc_count,
    COALESCE(SUM(r.total_amount), 0)    AS total_amount,
    COUNT(*) FILTER (WHERE r.defect_severity = 'HIGH')   AS high_severity_count,
    COUNT(*) FILTER (WHERE r.defect_severity = 'MEDIUM') AS medium_severity_count,
    COUNT(*) FILTER (WHERE r.defect_severity = 'LOW')    AS low_severity_count
FROM fin.v_close_document_readiness r
GROUP BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number,
         r.doc_type, r.close_readiness;

COMMENT ON VIEW fin.v_close_document_summary IS
    'Aggregate document-readiness counts per period/entity/doc_type. Powers the Close Command Center dashboard.';

-- ============================================================================
-- 3. fin.v_close_document_defects — Documents with issues blocking close
-- ============================================================================
-- Filters to only the defect rows — the actionable work queue for controllers.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_document_defects CASCADE;
CREATE OR REPLACE VIEW fin.v_close_document_defects AS
SELECT
    r.doc_registry_id,
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    r.doc_id,
    r.doc_type,
    r.doc_no,
    r.canonical_status,
    r.source_status,
    r.posting_date,
    r.total_amount,
    r.currency_code,
    r.close_readiness   AS defect_type,
    r.defect_severity
FROM fin.v_close_document_readiness r
WHERE r.close_readiness != 'READY'
  AND r.close_readiness != 'UNKNOWN';

COMMENT ON VIEW fin.v_close_document_defects IS
    'Documents with compliance defects blocking period close. The actionable work queue for controllers during close.';

-- ============================================================================
-- 4. fin.v_close_accrual_reversal_gap — Accruals needing reversal
-- ============================================================================
-- Accruals that are POSTED with auto_reverse=true but reversal_je_id is NULL.
-- These block close because the reversal hasn't been generated yet.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_accrual_reversal_gap CASCADE;
CREATE OR REPLACE VIEW fin.v_close_accrual_reversal_gap AS
SELECT
    a.id               AS accrual_id,
    a.tenant_id,
    a.entity_code,
    a.accrual_code     AS doc_no,
    a.posting_date,
    a.accrual_amount   AS total_amount,
    a.currency_code,
    a.reversal_date,
    a.status,
    fp.fiscal_year,
    fp.period_number,
    CASE
        WHEN a.reversal_date <= fp.end_date THEN 'REVERSAL_DUE_THIS_PERIOD'
        ELSE 'REVERSAL_DUE_FUTURE'
    END AS reversal_urgency
FROM fin.accrual_document a
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = a.tenant_id
    AND fp.entity_code  = a.entity_code
    AND a.posting_date >= fp.start_date
    AND a.posting_date <= fp.end_date
WHERE a.auto_reverse = true
  AND a.reversal_je_id IS NULL
  AND a.status = 'POSTED';

COMMENT ON VIEW fin.v_close_accrual_reversal_gap IS
    'Accruals posted with auto_reverse=true but missing reversal JE. Blocks close when reversal_date falls within the closing period.';

-- ============================================================================
-- 5. fin.v_close_posting_gap — Approved documents not yet posted
-- ============================================================================
-- Documents that have been approved but don't have a JE linkage.
-- These represent a posting pipeline gap that must be resolved before close.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_close_posting_gap CASCADE;
CREATE OR REPLACE VIEW fin.v_close_posting_gap AS
SELECT
    fd.id              AS doc_registry_id,
    fd.tenant_id,
    fd.entity_code,
    fd.doc_id,
    fd.doc_type,
    fd.doc_no,
    fd.status          AS canonical_status,
    fd.source_status,
    fd.posting_date,
    fd.total_amount,
    fd.currency_code,
    fd.approval_route,
    fd.approval_instance_id,
    fp.fiscal_year,
    fp.period_number,
    -- Time since approval (for aging)
    EXTRACT(EPOCH FROM (now() - fd.updated_at)) / 3600 AS hours_since_update
FROM fin.financial_document fd
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = fd.tenant_id
    AND fp.entity_code  = fd.entity_code
    AND fd.posting_date >= fp.start_date
    AND fd.posting_date <= fp.end_date
WHERE fd.status = 'APPROVED'
  AND fd.je_id IS NULL;

COMMENT ON VIEW fin.v_close_posting_gap IS
    'Approved documents without JE linkage — posting pipeline gap. Must be resolved before period close.';

-- ============================================================================
-- Indexes to support the view queries (on base table)
-- ============================================================================
-- Composite index for the fiscal period join pattern used by all bridge views
CREATE INDEX IF NOT EXISTS idx_fin_fd_posting_date_entity
    ON fin.financial_document (tenant_id, entity_code, posting_date)
    WHERE posting_date IS NOT NULL;

-- Partial index for defect-state documents (the minority case)
CREATE INDEX IF NOT EXISTS idx_fin_fd_close_defects
    ON fin.financial_document (tenant_id, entity_code, status, posting_date)
    WHERE status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'POSTING_PENDING', 'FAILED')
      AND posting_date IS NOT NULL;
