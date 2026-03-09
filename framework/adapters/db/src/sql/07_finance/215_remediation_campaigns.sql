/* ============================================================================
   Athyper v2.9 — Remediation Campaigns & Preview Infrastructure
   Schema: fin
   Dependencies: 214_document_health_reconciliation.sql

   Phase 8D enhancements:
   1. Campaign table — batched remediation with approval lifecycle
   2. Campaign-action bridge — tracks which actions belong to each campaign
   3. Campaign progress view — real-time status aggregation
   4. Preview log table — dry-run / pre-execution audit trail
   5. Playbook reference on remediation actions

   Design: Campaigns group same-type actions into a single approval unit.
   Preview logs record dry-run results for audit before actual execution.
   ============================================================================ */

-- ============================================================================
-- 1. Add playbook_code + campaign_id columns to existing remediation table
-- ============================================================================
ALTER TABLE fin.document_remediation_action
    ADD COLUMN IF NOT EXISTS campaign_id    uuid,
    ADD COLUMN IF NOT EXISTS playbook_code  varchar(40);

COMMENT ON COLUMN fin.document_remediation_action.campaign_id IS
    'FK to remediation_campaign when this action is part of a batched campaign';
COMMENT ON COLUMN fin.document_remediation_action.playbook_code IS
    'Playbook code used for execution (matches PLAYBOOK_REGISTRY key)';

-- ============================================================================
-- 2. fin.remediation_campaign — batched remediation with approval lifecycle
-- ============================================================================
-- Lifecycle: DRAFT → APPROVED → EXECUTING → COMPLETED / PARTIALLY_COMPLETED
--            DRAFT → CANCELLED
--
-- All actions in a campaign must share the same action_type.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.remediation_campaign (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,
    fiscal_year     integer NOT NULL,
    period_number   integer NOT NULL,

    -- Campaign specification
    campaign_name   varchar(200) NOT NULL,
    description     text,
    action_type     varchar(40) NOT NULL
                    CHECK (action_type IN (
                        'REPOST_DOCUMENT',
                        'GENERATE_REVERSAL_JE',
                        'POST_TO_BOOK',
                        'REQUEST_REAPPROVAL',
                        'FILL_APPROVAL_EVIDENCE',
                        'MARK_VOID',
                        'WAIVE_DEFECT',
                        'MANUAL_CORRECTION'
                    )),
    priority_filter varchar(10)
                    CHECK (priority_filter IS NULL OR priority_filter IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),

    -- Lifecycle
    status          varchar(25) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN (
                        'DRAFT',
                        'APPROVED',
                        'EXECUTING',
                        'COMPLETED',
                        'PARTIALLY_COMPLETED',
                        'CANCELLED'
                    )),

    -- Progress
    total_actions       integer NOT NULL DEFAULT 0,
    completed_actions   integer NOT NULL DEFAULT 0,
    failed_actions      integer NOT NULL DEFAULT 0,

    -- Playbook metadata (copied at creation time)
    risk_level          varchar(10),
    requires_approval   boolean NOT NULL DEFAULT true,
    max_batch_size      integer,

    -- Approval / execution
    created_by      varchar(200) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    approved_by     varchar(200),
    approved_at     timestamptz,
    executed_at     timestamptz,
    completed_at    timestamptz,
    cancelled_by    varchar(200),
    cancelled_at    timestamptz,
    cancellation_reason text,

    -- Audit
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_campaign_tenant_period
    ON fin.remediation_campaign (tenant_id, entity_code, fiscal_year, period_number);

CREATE INDEX IF NOT EXISTS idx_fin_campaign_status
    ON fin.remediation_campaign (tenant_id, status)
    WHERE status IN ('DRAFT', 'APPROVED', 'EXECUTING');

COMMENT ON TABLE fin.remediation_campaign IS
    'Batched remediation campaigns. Groups same-type actions into a single approval unit. Lifecycle: DRAFT → APPROVED → EXECUTING → COMPLETED.';

-- FK from remediation_action to campaign
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_remediation_action_campaign') THEN
        ALTER TABLE fin.document_remediation_action
            ADD CONSTRAINT fk_remediation_action_campaign
            FOREIGN KEY (campaign_id) REFERENCES fin.remediation_campaign(id);
    END IF;
END $$;

-- ============================================================================
-- 3. fin.v_campaign_progress — real-time campaign status aggregation
-- ============================================================================
DROP VIEW IF EXISTS fin.v_campaign_progress CASCADE;
CREATE OR REPLACE VIEW fin.v_campaign_progress AS
SELECT
    c.id                AS campaign_id,
    c.tenant_id,
    c.entity_code,
    c.fiscal_year,
    c.period_number,
    c.campaign_name,
    c.action_type,
    c.status            AS campaign_status,
    c.risk_level,
    c.total_actions,
    c.completed_actions,
    c.failed_actions,
    -- Live counts from actions (may differ from denormalized counters during execution)
    COUNT(ra.id)                                                    AS live_total,
    COUNT(ra.id) FILTER (WHERE ra.status = 'COMPLETED')             AS live_completed,
    COUNT(ra.id) FILTER (WHERE ra.status = 'FAILED')                AS live_failed,
    COUNT(ra.id) FILTER (WHERE ra.status = 'EXECUTING')             AS live_executing,
    COUNT(ra.id) FILTER (WHERE ra.status IN ('SUGGESTED', 'APPROVED')) AS live_pending,
    -- Completion percentage
    CASE WHEN COUNT(ra.id) > 0
         THEN ROUND(COUNT(ra.id) FILTER (WHERE ra.status = 'COMPLETED')::numeric / COUNT(ra.id) * 100, 1)
         ELSE 0
    END AS completion_pct,
    c.created_by,
    c.created_at,
    c.approved_by,
    c.approved_at,
    c.executed_at,
    c.completed_at
FROM fin.remediation_campaign c
LEFT JOIN fin.document_remediation_action ra
    ON ra.campaign_id = c.id
GROUP BY c.id, c.tenant_id, c.entity_code, c.fiscal_year, c.period_number,
         c.campaign_name, c.action_type, c.status, c.risk_level,
         c.total_actions, c.completed_actions, c.failed_actions,
         c.created_by, c.created_at, c.approved_by, c.approved_at,
         c.executed_at, c.completed_at;

COMMENT ON VIEW fin.v_campaign_progress IS
    'Real-time campaign progress with live action counts. Used by Close Control Tower for campaign monitoring.';

-- ============================================================================
-- 4. fin.remediation_preview_log — dry-run audit trail
-- ============================================================================
-- Records every preview / dry-run execution for audit. Immutable log.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.remediation_preview_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id),
    action_id           uuid NOT NULL REFERENCES fin.document_remediation_action(id),
    campaign_id         uuid REFERENCES fin.remediation_campaign(id),

    -- Playbook snapshot at preview time
    action_type         varchar(40) NOT NULL,
    playbook_code       varchar(40) NOT NULL,
    risk_level          varchar(10) NOT NULL,

    -- Preview results
    all_prerequisites_met boolean NOT NULL,
    can_execute         boolean NOT NULL,
    blocking_reasons    jsonb NOT NULL DEFAULT '[]',
    prerequisite_results jsonb NOT NULL DEFAULT '[]',
    predicted_side_effects jsonb NOT NULL DEFAULT '[]',
    impact_summary      text NOT NULL,

    -- Context
    doc_id              varchar(100),
    doc_type            varchar(30),
    doc_no              varchar(100),

    -- Audit
    previewed_by        varchar(200) NOT NULL,
    previewed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_preview_log_action
    ON fin.remediation_preview_log (action_id);

CREATE INDEX IF NOT EXISTS idx_fin_preview_log_campaign
    ON fin.remediation_preview_log (campaign_id)
    WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE fin.remediation_preview_log IS
    'Immutable audit log of remediation previews / dry-runs. Records what would happen before execution.';
