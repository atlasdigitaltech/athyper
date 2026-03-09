/* ============================================================================
   Athyper v2.9 — Document Health Score & Posting Reconciliation
   Schema: fin
   Dependencies: 210_close_document_bridge.sql,
                 213_close_document_bridge_v2.sql,
                 198c_financial_document_refinements.sql

   Phase 8C enhancements:
   1. Document health score view — single 0-100 score per entity/period
   2. Posting reconciliation view — cross-validates doc→JE→book bridge
   3. Remediation action table — trackable fix suggestions with approval
   4. Remediation action types and lifecycle

   Design: Health score is a pure view. Remediation actions are a persistent
   workflow table with approval lifecycle (suggested → approved → executed).
   ============================================================================ */

-- ============================================================================
-- 1. fin.v_document_health_score — Composite health score per entity/period
-- ============================================================================
-- Combines multiple signals into a single 0-100 score:
--   - Document readiness ratio (40% weight)
--   - Severity-weighted defect penalty (25% weight)
--   - Aging penalty (15% weight)
--   - Reconciliation completeness (10% weight)
--   - Approval evidence completeness (10% weight)
--
-- Score = 100 - penalties, floor at 0.
-- ============================================================================
DROP VIEW IF EXISTS fin.v_document_health_score CASCADE;
CREATE OR REPLACE VIEW fin.v_document_health_score AS
WITH base_counts AS (
    SELECT
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number,
        COUNT(*)                                                    AS total_docs,
        COUNT(*) FILTER (WHERE r.close_readiness = 'READY')         AS ready_docs,
        COUNT(*) FILTER (WHERE r.defect_severity = 'HIGH')          AS high_defects,
        COUNT(*) FILTER (WHERE r.defect_severity = 'MEDIUM')        AS medium_defects,
        COUNT(*) FILTER (WHERE r.defect_severity = 'LOW')           AS low_defects
    FROM fin.v_close_document_readiness r
    GROUP BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number
),
aging_penalty AS (
    SELECT
        a.tenant_id,
        a.entity_code,
        a.fiscal_year,
        a.period_number,
        -- Aging penalty: CRITICAL=10pts, OVERDUE=5pts, AGING=2pts per defect, cap at 15
        LEAST(
            SUM(CASE a.aging_bucket
                WHEN 'CRITICAL' THEN 10
                WHEN 'OVERDUE'  THEN 5
                WHEN 'AGING'    THEN 2
                ELSE 0
            END),
            15
        ) AS aging_pts
    FROM fin.v_close_defect_aging a
    GROUP BY a.tenant_id, a.entity_code, a.fiscal_year, a.period_number
),
recon_penalty AS (
    SELECT
        g.tenant_id,
        g.entity_code,
        g.fiscal_year,
        g.period_number,
        -- Posting gap penalty: 2pts per gap, cap at 10
        LEAST(COUNT(*) * 2, 10) AS recon_pts
    FROM fin.v_close_posting_gap g
    GROUP BY g.tenant_id, g.entity_code, g.fiscal_year, g.period_number
),
approval_penalty AS (
    SELECT
        ae.tenant_id,
        ae.entity_code,
        ae.fiscal_year,
        ae.period_number,
        -- Approval gap penalty: 1pt per gap, cap at 10
        LEAST(COUNT(*), 10) AS approval_pts
    FROM fin.v_close_approval_evidence_gap ae
    GROUP BY ae.tenant_id, ae.entity_code, ae.fiscal_year, ae.period_number
)
SELECT
    bc.tenant_id,
    bc.entity_code,
    bc.fiscal_year,
    bc.period_number,
    bc.total_docs,
    bc.ready_docs,
    bc.high_defects,
    bc.medium_defects,
    bc.low_defects,
    -- Readiness ratio penalty (40% weight): (1 - ready/total) * 40
    CASE WHEN bc.total_docs > 0
         THEN ROUND((1.0 - bc.ready_docs::numeric / bc.total_docs) * 40, 1)
         ELSE 0
    END AS readiness_penalty,
    -- Severity penalty (25% weight): HIGH=8pts, MEDIUM=3pts, LOW=1pt each, cap at 25
    LEAST(
        bc.high_defects * 8 + bc.medium_defects * 3 + bc.low_defects * 1,
        25
    ) AS severity_penalty,
    -- Aging penalty (15% weight)
    COALESCE(ap.aging_pts, 0) AS aging_penalty,
    -- Recon penalty (10% weight)
    COALESCE(rp.recon_pts, 0) AS recon_penalty,
    -- Approval penalty (10% weight)
    COALESCE(app.approval_pts, 0) AS approval_penalty,
    -- Final health score: 100 - sum of penalties, floor at 0
    GREATEST(
        100 - (
            CASE WHEN bc.total_docs > 0
                 THEN ROUND((1.0 - bc.ready_docs::numeric / bc.total_docs) * 40, 1)
                 ELSE 0
            END
            + LEAST(bc.high_defects * 8 + bc.medium_defects * 3 + bc.low_defects, 25)
            + COALESCE(ap.aging_pts, 0)
            + COALESCE(rp.recon_pts, 0)
            + COALESCE(app.approval_pts, 0)
        ),
        0
    ) AS health_score,
    -- Traffic-light classification
    CASE
        WHEN bc.total_docs = 0 THEN 'NOT_APPLICABLE'
        WHEN GREATEST(100 - (
            CASE WHEN bc.total_docs > 0
                 THEN ROUND((1.0 - bc.ready_docs::numeric / bc.total_docs) * 40, 1)
                 ELSE 0
            END + LEAST(bc.high_defects * 8 + bc.medium_defects * 3 + bc.low_defects, 25)
            + COALESCE(ap.aging_pts, 0)
            + COALESCE(rp.recon_pts, 0)
            + COALESCE(app.approval_pts, 0)
        ), 0) >= 90 THEN 'GREEN'
        WHEN GREATEST(100 - (
            CASE WHEN bc.total_docs > 0
                 THEN ROUND((1.0 - bc.ready_docs::numeric / bc.total_docs) * 40, 1)
                 ELSE 0
            END + LEAST(bc.high_defects * 8 + bc.medium_defects * 3 + bc.low_defects, 25)
            + COALESCE(ap.aging_pts, 0)
            + COALESCE(rp.recon_pts, 0)
            + COALESCE(app.approval_pts, 0)
        ), 0) >= 70 THEN 'AMBER'
        ELSE 'RED'
    END AS health_rating
FROM base_counts bc
LEFT JOIN aging_penalty ap
    ON ap.tenant_id     = bc.tenant_id
    AND ap.entity_code  = bc.entity_code
    AND ap.fiscal_year  = bc.fiscal_year
    AND ap.period_number = bc.period_number
LEFT JOIN recon_penalty rp
    ON rp.tenant_id     = bc.tenant_id
    AND rp.entity_code  = bc.entity_code
    AND rp.fiscal_year  = bc.fiscal_year
    AND rp.period_number = bc.period_number
LEFT JOIN approval_penalty app
    ON app.tenant_id     = bc.tenant_id
    AND app.entity_code  = bc.entity_code
    AND app.fiscal_year  = bc.fiscal_year
    AND app.period_number = bc.period_number;

COMMENT ON VIEW fin.v_document_health_score IS
    'Composite document health score (0-100) per entity/period. Combines readiness ratio, severity-weighted defects, aging, reconciliation gaps, and approval evidence. Traffic-light: GREEN>=90, AMBER>=70, RED<70.';

-- ============================================================================
-- 2. fin.v_posting_reconciliation — Cross-validates doc→JE→book pipeline
-- ============================================================================
-- For each POSTED document, validates the full posting chain:
--   1. Primary JE exists and is POSTED (not REVERSED)
--   2. All required books have bridge entries
--   3. Bridge entry status matches expectations
--   4. Amount consistency (doc total vs JE total)
--
-- Each row represents one reconciliation finding (pass or finding).
-- ============================================================================
DROP VIEW IF EXISTS fin.v_posting_reconciliation CASCADE;
CREATE OR REPLACE VIEW fin.v_posting_reconciliation AS
WITH doc_je AS (
    SELECT
        fd.id              AS doc_registry_id,
        fd.tenant_id,
        fd.entity_code,
        fd.doc_id,
        fd.doc_type,
        fd.doc_no,
        fd.status          AS doc_status,
        fd.total_amount    AS doc_amount,
        fd.currency_code,
        fd.je_id,
        fd.posting_date,
        fp.fiscal_year,
        fp.period_number,
        je.status          AS je_status,
        je.total_debit     AS je_total_debit,
        je.total_credit    AS je_total_credit
    FROM fin.financial_document fd
    INNER JOIN fin.fiscal_period fp
        ON fp.tenant_id     = fd.tenant_id
        AND fp.entity_code  = fd.entity_code
        AND fd.posting_date >= fp.start_date
        AND fd.posting_date <= fp.end_date
    LEFT JOIN fin.journal_entry je
        ON je.tenant_id = fd.tenant_id
        AND je.id       = fd.je_id
    WHERE fd.status IN ('POSTED', 'SETTLED', 'PARTIALLY_SETTLED')
)
-- Finding: POSTED doc with no JE reference
SELECT
    d.doc_registry_id,
    d.tenant_id,
    d.entity_code,
    d.fiscal_year,
    d.period_number,
    d.doc_id,
    d.doc_type,
    d.doc_no,
    d.doc_amount,
    d.currency_code,
    'POSTED_NO_JE'::varchar(40) AS finding_type,
    'HIGH'::varchar(10)         AS finding_severity,
    'Document is POSTED but has no journal entry reference'::text AS finding_detail,
    d.posting_date
FROM doc_je d
WHERE d.je_id IS NULL

UNION ALL

-- Finding: JE exists but is REVERSED while doc is still POSTED
SELECT
    d.doc_registry_id,
    d.tenant_id,
    d.entity_code,
    d.fiscal_year,
    d.period_number,
    d.doc_id,
    d.doc_type,
    d.doc_no,
    d.doc_amount,
    d.currency_code,
    'JE_REVERSED_DOC_NOT'::varchar(40),
    'HIGH'::varchar(10),
    'Journal entry is REVERSED but document status is still ' || d.doc_status,
    d.posting_date
FROM doc_je d
WHERE d.je_id IS NOT NULL
  AND d.je_status = 'REVERSED'

UNION ALL

-- Finding: JE total doesn't match document total (amount discrepancy)
SELECT
    d.doc_registry_id,
    d.tenant_id,
    d.entity_code,
    d.fiscal_year,
    d.period_number,
    d.doc_id,
    d.doc_type,
    d.doc_no,
    d.doc_amount,
    d.currency_code,
    'AMOUNT_MISMATCH'::varchar(40),
    'MEDIUM'::varchar(10),
    'Document amount ' || d.doc_amount || ' != JE debit total ' || d.je_total_debit,
    d.posting_date
FROM doc_je d
WHERE d.je_id IS NOT NULL
  AND d.je_status = 'POSTED'
  AND d.doc_amount IS NOT NULL
  AND d.je_total_debit IS NOT NULL
  AND ABS(d.doc_amount - d.je_total_debit) > 0.01

UNION ALL

-- Finding: Multi-book posting gap (POSTED doc missing book bridge entry)
SELECT
    fd.id AS doc_registry_id,
    fd.tenant_id,
    fd.entity_code,
    fp.fiscal_year,
    fp.period_number,
    fd.doc_id,
    fd.doc_type,
    fd.doc_no,
    fd.total_amount AS doc_amount,
    fd.currency_code,
    'INCOMPLETE_MULTIBOOK'::varchar(40),
    'MEDIUM'::varchar(10),
    'Document posted to primary book but missing book bridge entry for secondary books',
    fd.posting_date
FROM fin.financial_document fd
INNER JOIN fin.fiscal_period fp
    ON fp.tenant_id     = fd.tenant_id
    AND fp.entity_code  = fd.entity_code
    AND fd.posting_date >= fp.start_date
    AND fd.posting_date <= fp.end_date
WHERE fd.status IN ('POSTED', 'SETTLED', 'PARTIALLY_SETTLED')
  AND fd.je_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM fin.financial_document_posting fdp
      WHERE fdp.tenant_id = fd.tenant_id
        AND fdp.doc_id    = fd.doc_id
  );

COMMENT ON VIEW fin.v_posting_reconciliation IS
    'Cross-validates the document→JE→book pipeline. Each row is a reconciliation finding: POSTED_NO_JE, JE_REVERSED_DOC_NOT, AMOUNT_MISMATCH, INCOMPLETE_MULTIBOOK.';

-- ============================================================================
-- 3. fin.v_posting_reconciliation_summary — Aggregate per entity/period
-- ============================================================================
DROP VIEW IF EXISTS fin.v_posting_reconciliation_summary CASCADE;
CREATE OR REPLACE VIEW fin.v_posting_reconciliation_summary AS
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    COUNT(*)                                                        AS total_findings,
    COUNT(*) FILTER (WHERE r.finding_severity = 'HIGH')             AS high_findings,
    COUNT(*) FILTER (WHERE r.finding_severity = 'MEDIUM')           AS medium_findings,
    COUNT(*) FILTER (WHERE r.finding_type = 'POSTED_NO_JE')         AS posted_no_je_count,
    COUNT(*) FILTER (WHERE r.finding_type = 'JE_REVERSED_DOC_NOT')  AS je_reversed_doc_not_count,
    COUNT(*) FILTER (WHERE r.finding_type = 'AMOUNT_MISMATCH')      AS amount_mismatch_count,
    COUNT(*) FILTER (WHERE r.finding_type = 'INCOMPLETE_MULTIBOOK') AS incomplete_multibook_count
FROM fin.v_posting_reconciliation r
GROUP BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number;

COMMENT ON VIEW fin.v_posting_reconciliation_summary IS
    'Aggregate posting reconciliation findings per entity/period. Powers the reconciliation dashboard and close handler evidence.';

-- ============================================================================
-- 4. fin.document_remediation_action — Tracked fix suggestions with approval
-- ============================================================================
-- Lifecycle: SUGGESTED → APPROVED → EXECUTING → COMPLETED
--            SUGGESTED → REJECTED
--            EXECUTING → FAILED → SUGGESTED (retry)
--
-- Controllers review suggested actions in the Close Command Center,
-- approve them, and the system executes the approved corrections.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.document_remediation_action (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,
    fiscal_year     integer NOT NULL,
    period_number   integer NOT NULL,

    -- Source: what triggered this action
    source_type     varchar(30) NOT NULL
                    CHECK (source_type IN (
                        'CLOSE_HANDLER',        -- auto-generated by close handler
                        'RECONCILIATION',       -- from posting reconciliation
                        'RISK_SIGNAL',          -- from risk signal evaluation
                        'MANUAL'                -- controller-initiated
                    )),
    source_ref      varchar(200),       -- handler code, signal ID, etc.

    -- Target document
    doc_registry_id uuid REFERENCES fin.financial_document(id),
    doc_id          varchar(100),
    doc_type        varchar(30),
    doc_no          varchar(100),

    -- Action specification
    action_type     varchar(40) NOT NULL
                    CHECK (action_type IN (
                        'REPOST_DOCUMENT',       -- re-trigger posting pipeline
                        'GENERATE_REVERSAL_JE',  -- create reversal JE for accrual
                        'POST_TO_BOOK',          -- post to missing secondary book
                        'REQUEST_REAPPROVAL',    -- trigger re-approval flow
                        'FILL_APPROVAL_EVIDENCE',-- attach approval evidence
                        'MARK_VOID',             -- mark document as voided
                        'WAIVE_DEFECT',          -- waive the defect (exception)
                        'MANUAL_CORRECTION'      -- free-form manual fix
                    )),
    action_detail   jsonb NOT NULL DEFAULT '{}',
    priority        varchar(10) NOT NULL DEFAULT 'MEDIUM'
                    CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),

    -- Lifecycle
    status          varchar(20) NOT NULL DEFAULT 'SUGGESTED'
                    CHECK (status IN (
                        'SUGGESTED',
                        'APPROVED',
                        'REJECTED',
                        'EXECUTING',
                        'COMPLETED',
                        'FAILED'
                    )),

    -- Approval
    suggested_by    varchar(200),       -- SYSTEM or actor ID
    suggested_at    timestamptz NOT NULL DEFAULT now(),
    approved_by     varchar(200),
    approved_at     timestamptz,
    rejection_reason text,

    -- Execution
    executed_by     varchar(200),
    executed_at     timestamptz,
    execution_result jsonb,
    failure_reason  text,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_remediation_tenant_period
    ON fin.document_remediation_action (tenant_id, entity_code, fiscal_year, period_number);

CREATE INDEX IF NOT EXISTS idx_fin_remediation_status
    ON fin.document_remediation_action (tenant_id, status)
    WHERE status IN ('SUGGESTED', 'APPROVED', 'EXECUTING');

COMMENT ON TABLE fin.document_remediation_action IS
    'Tracked remediation actions for document defects. Lifecycle: SUGGESTED → APPROVED → EXECUTING → COMPLETED. Controllers review and approve before execution.';

-- ============================================================================
-- 5. fin.v_remediation_summary — Aggregate per entity/period
-- ============================================================================
DROP VIEW IF EXISTS fin.v_remediation_summary CASCADE;
CREATE OR REPLACE VIEW fin.v_remediation_summary AS
SELECT
    ra.tenant_id,
    ra.entity_code,
    ra.fiscal_year,
    ra.period_number,
    COUNT(*)                                                    AS total_actions,
    COUNT(*) FILTER (WHERE ra.status = 'SUGGESTED')             AS suggested_count,
    COUNT(*) FILTER (WHERE ra.status = 'APPROVED')              AS approved_count,
    COUNT(*) FILTER (WHERE ra.status = 'EXECUTING')             AS executing_count,
    COUNT(*) FILTER (WHERE ra.status = 'COMPLETED')             AS completed_count,
    COUNT(*) FILTER (WHERE ra.status = 'REJECTED')              AS rejected_count,
    COUNT(*) FILTER (WHERE ra.status = 'FAILED')                AS failed_count,
    COUNT(*) FILTER (WHERE ra.priority = 'CRITICAL')            AS critical_count,
    COUNT(*) FILTER (WHERE ra.priority = 'HIGH')                AS high_count
FROM fin.document_remediation_action ra
GROUP BY ra.tenant_id, ra.entity_code, ra.fiscal_year, ra.period_number;

COMMENT ON VIEW fin.v_remediation_summary IS
    'Aggregate remediation action status per entity/period. Powers the remediation dashboard in the Close Command Center.';
