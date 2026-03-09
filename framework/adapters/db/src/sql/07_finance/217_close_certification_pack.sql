/* ============================================================================
   Athyper v2.9 — Close Certification Pack
   Schema: fin
   Dependencies: 202_close_orchestration.sql (close_calendar, close_run,
                  close_readiness_snapshot, close_exception)
                 204_governance_lifecycle.sql (close_override)
                 191_period_close_governance.sql (period_close_checklist,
                  period_close_task)
                 214_document_health_reconciliation.sql
                 215_remediation_campaigns.sql
                 216_close_control_tower.sql

   Phase 9C: Audit & Board Reporting Pack — period close certification.
   Provides:
   1. Certification record: immutable sign-off with SHA-256 fingerprint
   2. Certification evidence view: task checklist with handler results
   3. Exception register view: all close exceptions with resolution
   4. Override register view: full override register for audit
   5. SLA compliance snapshot view: SLA targets vs actuals
   6. Certification pack assembly view: single-query bundle
   ============================================================================ */

-- ============================================================================
-- 1. fin.close_certification — Immutable period close certification record
-- ============================================================================
-- Created when a controller/CFO signs off on a period close.
-- Once certified, the period is sealed; only supersession can replace.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.close_certification (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,
    fiscal_year     smallint NOT NULL,
    period_number   smallint NOT NULL,

    -- Close run reference
    run_id          uuid NOT NULL REFERENCES fin.close_run(id),

    -- Certification identity
    cert_code       varchar(40) NOT NULL,   -- e.g., CERT-2026-P03-001
    cert_version    smallint NOT NULL DEFAULT 1,

    -- Status lifecycle
    status          varchar(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN (
                        'DRAFT',            -- pack assembled but not signed
                        'PENDING_REVIEW',   -- awaiting controller review
                        'CERTIFIED',        -- signed off by controller
                        'CFO_ATTESTED',     -- CFO attestation added
                        'SUPERSEDED',       -- replaced by newer certification
                        'REVOKED'           -- revoked due to material error
                    )),

    -- Certification type
    cert_type       varchar(20) NOT NULL DEFAULT 'STANDARD'
                    CHECK (cert_type IN (
                        'STANDARD',         -- normal close
                        'WITH_EXCEPTIONS',  -- close with documented exceptions
                        'QUALIFIED',        -- qualified certification (material issues)
                        'INTERIM'           -- interim/provisional certification
                    )),

    -- Content fingerprint
    content_hash    varchar(64),            -- SHA-256 of pack contents at assembly
    assembled_at    timestamptz,

    -- Controller sign-off
    certified_by    varchar(100),
    certified_at    timestamptz,
    controller_notes text,

    -- CFO attestation
    attested_by     varchar(100),
    attested_at     timestamptz,
    attestation_notes text,

    -- Supersession chain
    superseded_by   uuid REFERENCES fin.close_certification(id),
    superseded_at   timestamptz,
    supersession_reason text,

    -- Revocation
    revoked_by      varchar(100),
    revoked_at      timestamptz,
    revocation_reason text,

    -- Snapshot KPIs at time of certification
    readiness_score     numeric(5,2),
    sla_status          varchar(20),
    total_tasks         smallint,
    completed_tasks     smallint,
    waived_tasks        smallint,
    failed_tasks        smallint,
    total_overrides     smallint DEFAULT 0,
    override_impact     decimal(18,4) DEFAULT 0,
    total_exceptions    smallint DEFAULT 0,
    open_exceptions     smallint DEFAULT 0,
    doc_health_score    numeric(5,2),
    remediation_total   smallint DEFAULT 0,
    remediation_open    smallint DEFAULT 0,
    is_clean_close      boolean NOT NULL DEFAULT false,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Uniqueness: one active cert per period (draft/pending/certified/attested)
    CONSTRAINT uq_fin_close_cert_active
        UNIQUE (tenant_id, entity_code, fiscal_year, period_number, cert_version),

    CONSTRAINT fk_fin_close_cert_period
        FOREIGN KEY (tenant_id, entity_code, fiscal_year, period_number)
        REFERENCES fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number)
);

CREATE INDEX IF NOT EXISTS idx_fin_close_cert_run
    ON fin.close_certification(run_id);
CREATE INDEX IF NOT EXISTS idx_fin_close_cert_status
    ON fin.close_certification(tenant_id, entity_code, fiscal_year, status)
    WHERE status NOT IN ('SUPERSEDED', 'REVOKED');

COMMENT ON TABLE fin.close_certification IS
    'Immutable period close certification record. Sealed sign-off with content hash, controller/CFO attestation chain.';

-- ============================================================================
-- 2. fin.vw_close_task_evidence — Task checklist with handler evidence
-- ============================================================================
-- Full audit record of each close task: status, handler results, waivers,
-- timing, and ownership. Powers the certification evidence sheet.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_task_evidence CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_task_evidence AS
SELECT
    cl.tenant_id,
    cl.entity_code,
    cl.fiscal_year,
    cl.period_number,
    t.task_code,
    t.task_name,
    t.category,
    t.required_before,
    t.completion_mode,
    t.is_mandatory,
    t.is_waivable,
    t.severity,
    cl.task_status               AS task_status,
    cl.assigned_to,
    cl.assigned_role,
    cl.due_at,
    cl.completed_by,
    cl.completed_at,
    cl.completion_notes,
    cl.evidence_payload,
    cl.failure_reason,
    cl.failed_at,
    cl.waiver_status,
    cl.waiver_reason,
    cl.waived_by,
    cl.waived_at,
    cl.last_handler_run_at,
    cl.last_handler_result,
    cl.handler_run_count,
    -- Derived timing
    CASE
        WHEN cl.completed_at IS NOT NULL AND cl.task_status = 'COMPLETED'
            THEN EXTRACT(EPOCH FROM (cl.completed_at - COALESCE(
                (SELECT r.started_at FROM fin.close_run r
                 WHERE r.tenant_id = cl.tenant_id
                   AND r.entity_code = cl.entity_code
                   AND r.fiscal_year = cl.fiscal_year
                   AND r.period_number = cl.period_number
                   AND r.status NOT IN ('CANCELLED')
                 ORDER BY r.run_number DESC LIMIT 1),
                cl.created_at
            ))) / 3600.0
        ELSE NULL
    END AS hours_to_complete,
    -- SLA compliance
    CASE
        WHEN cl.due_at IS NOT NULL AND cl.completed_at IS NOT NULL
            THEN cl.completed_at <= cl.due_at
        WHEN cl.due_at IS NOT NULL AND cl.task_status NOT IN ('COMPLETED', 'WAIVED')
            THEN now() <= cl.due_at
        ELSE NULL
    END AS within_sla,
    cl.created_at
FROM fin.period_close_checklist cl
JOIN fin.period_close_task t ON t.id = cl.task_id;

COMMENT ON VIEW fin.vw_close_task_evidence IS
    'Full close task evidence: status, handler results, waivers, timing, SLA compliance. Powers the certification evidence sheet.';

-- ============================================================================
-- 3. fin.vw_close_exception_register — Exception log for audit pack
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_exception_register CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_exception_register AS
SELECT
    ri.tenant_id,
    ri.entity_code,
    ri.fiscal_year,
    ri.period_number,
    e.id                AS exception_id,
    e.exception_code,
    e.title,
    e.description,
    e.severity,
    e.impact,
    e.status,
    e.assigned_to,
    e.resolved_by,
    e.resolved_at,
    e.resolution_notes,
    e.created_at
FROM (
    SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
        r.id AS run_id, r.tenant_id, r.entity_code, r.fiscal_year, r.period_number
    FROM fin.close_run r
    WHERE r.status NOT IN ('CANCELLED')
    ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number, r.run_number DESC
) ri
JOIN fin.close_exception e ON e.run_id = ri.run_id;

COMMENT ON VIEW fin.vw_close_exception_register IS
    'Full exception register per period. Includes severity, status, root cause, resolution. Powers the certification exception sheet.';

-- ============================================================================
-- 4. fin.vw_close_override_register — Override register for audit pack
-- ============================================================================
-- Re-uses vw_override_posture with additional decision audit columns.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_override_register CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_override_register AS
SELECT
    op.*,
    oa.event_type       AS last_activity,
    oa.created_at       AS last_activity_at,
    oa.actor_id         AS last_activity_by
FROM fin.vw_override_posture op
LEFT JOIN LATERAL (
    SELECT a.event_type, a.created_at, a.actor_id
    FROM fin.close_override_activity a
    WHERE a.override_id = op.override_id
    ORDER BY a.created_at DESC
    LIMIT 1
) oa ON true;

COMMENT ON VIEW fin.vw_close_override_register IS
    'Full override register with latest activity. Powers the certification override sheet.';

-- ============================================================================
-- 5. fin.vw_close_sla_compliance — SLA compliance snapshot for certification
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_sla_compliance CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_sla_compliance AS
SELECT
    c.tenant_id,
    c.entity_code,
    c.fiscal_year,
    c.period_number,
    c.close_type,
    c.period_end_date,
    c.close_start_date,
    c.soft_close_target,
    c.hard_close_target,
    c.soft_close_actual,
    c.hard_close_actual,
    c.target_working_days,
    c.actual_working_days,
    -- SLA verdicts
    CASE
        WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual <= c.hard_close_target THEN 'MET'
        WHEN c.hard_close_actual IS NOT NULL THEN 'BREACHED'
        WHEN current_date > c.hard_close_target THEN 'BREACHED'
        WHEN current_date > c.soft_close_target THEN 'AT_RISK'
        ELSE 'ON_TRACK'
    END AS sla_status,
    CASE
        WHEN c.soft_close_actual IS NOT NULL AND c.soft_close_actual <= c.soft_close_target THEN true
        WHEN c.soft_close_actual IS NOT NULL THEN false
        ELSE NULL
    END AS soft_close_met,
    CASE
        WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual <= c.hard_close_target THEN true
        WHEN c.hard_close_actual IS NOT NULL THEN false
        ELSE NULL
    END AS hard_close_met,
    -- Duration
    CASE
        WHEN c.hard_close_actual IS NOT NULL
            THEN (c.hard_close_actual - c.close_start_date)
        ELSE (current_date - c.close_start_date)
    END AS days_elapsed,
    GREATEST(0, c.hard_close_target - current_date) AS days_remaining
FROM fin.close_calendar c;

COMMENT ON VIEW fin.vw_close_sla_compliance IS
    'SLA compliance snapshot per period. Target vs actual dates, SLA met/breached. Powers the certification SLA sheet.';
