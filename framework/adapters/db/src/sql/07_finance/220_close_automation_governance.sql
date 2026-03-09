/* ============================================================================
   Athyper v2.9.3 — Autonomous Close Orchestration Governance
   Schema: fin
   Dependencies: 211_close_action_policies.sql (close_action_policy, close_action_log)
                 202_close_orchestration.sql (close_run, close_calendar)
                 219_autonomous_close_advisor.sql (advisor views)

   Phase 15: Governance layer for autonomous close orchestration.
   Enables safe automation of close actions with configurable risk thresholds,
   rate limits, severity gates, and comprehensive audit trails.

   Tables:
     1. fin.close_automation_rule    — Tenant-configurable automation governance
     2. fin.close_automation_audit   — Append-only audit trail for all auto-actions

   Design principles:
     - Every automated action is governed by an automation rule
     - Critical severity always requires human approval
     - Rate limits prevent runaway automation
     - Kill switch at tenant+entity level
     - Full evidence chain in audit trail
   ============================================================================ */

-- ============================================================================
-- 1. fin.close_automation_rule — Automation governance configuration
-- ============================================================================
-- Defines the governance envelope for autonomous close actions.
-- One rule per (tenant, entity_code, action_type) controls what can be
-- automated and under what conditions.
--
-- Lifecycle: DISABLED → ENABLED → PAUSED → ENABLED
--            DISABLED → ENABLED → DISABLED
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.close_automation_rule (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,

    -- What action type this rule governs
    action_type         varchar(40) NOT NULL,

    -- Master enable/disable
    status              varchar(20) NOT NULL DEFAULT 'DISABLED'
        CHECK (status IN ('ENABLED', 'DISABLED', 'PAUSED')),

    -- Severity gate: which severity levels can be auto-executed
    -- 'low' = only low, 'medium' = low+medium, 'high' = low+medium+high
    -- Critical is NEVER auto-executed (governance invariant)
    max_auto_severity   varchar(10) NOT NULL DEFAULT 'low'
        CHECK (max_auto_severity IN ('low', 'medium', 'high')),

    -- Risk threshold gates
    -- Auto-actions blocked when breach probability exceeds this
    max_breach_probability  smallint NOT NULL DEFAULT 80
        CHECK (max_breach_probability BETWEEN 0 AND 100),
    -- Auto-actions blocked when buffer is below this (hours)
    min_buffer_hours    numeric(6,1) NOT NULL DEFAULT 4.0,

    -- Rate limits per period
    max_auto_accepts_per_period     smallint NOT NULL DEFAULT 10,
    max_auto_campaigns_per_period   smallint NOT NULL DEFAULT 3,
    max_auto_escalations_per_period smallint NOT NULL DEFAULT 5,
    max_auto_actions_per_hour       smallint NOT NULL DEFAULT 5,

    -- Cool-down between auto-actions of same type (minutes)
    cooldown_minutes    smallint NOT NULL DEFAULT 15,

    -- Approval requirements by severity
    -- When true, even auto-eligible actions require approval
    require_approval_high   boolean NOT NULL DEFAULT true,
    require_approval_medium boolean NOT NULL DEFAULT false,

    -- Allowed execution modes from close_action_policy
    -- Only policies with matching execution_mode are eligible
    allowed_execution_modes text[] NOT NULL DEFAULT ARRAY['auto', 'auto_safe'],

    -- Scheduling: only run during these hours (UTC)
    active_hours_start  smallint DEFAULT 6,   -- 06:00 UTC
    active_hours_end    smallint DEFAULT 22,  -- 22:00 UTC

    -- Audit
    enabled_by          varchar(200),
    enabled_at          timestamptz,
    disabled_by         varchar(200),
    disabled_at         timestamptz,
    paused_by           varchar(200),
    paused_at           timestamptz,
    pause_reason        text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_automation_rule
        UNIQUE (tenant_id, entity_code, action_type)
);

CREATE INDEX IF NOT EXISTS idx_fin_automation_rule_tenant
    ON fin.close_automation_rule (tenant_id, entity_code)
    WHERE status = 'ENABLED';

CREATE INDEX IF NOT EXISTS idx_fin_automation_rule_action
    ON fin.close_automation_rule (tenant_id, action_type)
    WHERE status = 'ENABLED';

COMMENT ON TABLE fin.close_automation_rule IS
    'Phase 15: Governance rules for autonomous close orchestration. Controls what can be automated, severity gates, rate limits, and risk thresholds per entity/action_type.';
COMMENT ON COLUMN fin.close_automation_rule.max_auto_severity IS
    'Maximum severity level eligible for auto-execution. Critical is NEVER auto-executed regardless of this setting.';
COMMENT ON COLUMN fin.close_automation_rule.cooldown_minutes IS
    'Minimum interval between consecutive auto-actions of the same type. Prevents cascade execution.';

-- ============================================================================
-- 2. fin.close_automation_audit — Append-only autonomous action audit trail
-- ============================================================================
-- Every autonomous action (proposed, executed, or blocked) is recorded here.
-- Provides complete evidence chain: which rule, which policy, which data,
-- what governance gates were evaluated, and what the outcome was.
--
-- Immutable: no UPDATE or DELETE allowed.
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.close_automation_audit (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,
    fiscal_year         smallint NOT NULL,
    period_number       smallint NOT NULL,

    -- What was evaluated
    automation_rule_id  uuid REFERENCES fin.close_automation_rule(id),
    policy_id           uuid REFERENCES fin.close_action_policy(id),
    policy_code         varchar(60),
    action_type         varchar(40) NOT NULL,

    -- Source action (if from defect queue)
    source_action_id    uuid,
    source_action_ids   uuid[],  -- for batch/campaign actions

    -- Governance verdict
    verdict             varchar(30) NOT NULL
        CHECK (verdict IN (
            'AUTO_EXECUTED',        -- passed all gates, auto-executed
            'REQUIRES_APPROVAL',    -- blocked by severity or approval gate
            'BLOCKED_BY_THRESHOLD', -- blocked by risk threshold (breach/buffer)
            'BLOCKED_BY_RATE_LIMIT',-- blocked by rate limit
            'BLOCKED_BY_COOLDOWN',  -- blocked by cooldown period
            'BLOCKED_BY_SCHEDULE',  -- blocked by active hours
            'BLOCKED_BY_KILL_SWITCH',-- automation disabled for entity
            'ESCALATED',            -- auto-escalated to controller
            'SKIPPED_NO_RULE',      -- no automation rule configured
            'FAILED'                -- execution attempted but failed
        )),

    -- What was proposed/executed
    action_detail       jsonb NOT NULL DEFAULT '{}',

    -- Gate evaluation evidence
    gate_evidence       jsonb NOT NULL DEFAULT '{}',
    -- Structure:
    -- {
    --   "severityGate": { "actionSeverity": "medium", "maxAuto": "low", "passed": false },
    --   "thresholdGate": { "breachPct": 45, "maxAllowed": 80, "bufferH": 12, "minRequired": 4, "passed": true },
    --   "rateLimitGate": { "currentCount": 3, "maxAllowed": 10, "passed": true },
    --   "cooldownGate": { "lastActionAt": "...", "cooldownMin": 15, "passed": true },
    --   "scheduleGate": { "currentHour": 14, "activeStart": 6, "activeEnd": 22, "passed": true }
    -- }

    -- Execution result (if AUTO_EXECUTED)
    execution_result    jsonb,
    execution_error     text,

    -- Correlation
    correlation_id      uuid,

    -- Timestamps
    evaluated_at        timestamptz NOT NULL DEFAULT now(),
    executed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fin_automation_audit_tenant
    ON fin.close_automation_audit (tenant_id, entity_code, fiscal_year, period_number);

CREATE INDEX IF NOT EXISTS idx_fin_automation_audit_verdict
    ON fin.close_automation_audit (verdict, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fin_automation_audit_rule
    ON fin.close_automation_audit (automation_rule_id)
    WHERE automation_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_automation_audit_recent
    ON fin.close_automation_audit (evaluated_at DESC)
    WHERE verdict IN ('AUTO_EXECUTED', 'REQUIRES_APPROVAL', 'ESCALATED');

COMMENT ON TABLE fin.close_automation_audit IS
    'Phase 15: Append-only audit trail for all autonomous close orchestration decisions. Records gate evaluations, verdicts, and execution results.';

-- Immutability guard
DROP FUNCTION IF EXISTS fin.trg_automation_audit_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_automation_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'close_automation_audit rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_audit_no_update ON fin.close_automation_audit;
CREATE TRIGGER trg_automation_audit_no_update
    BEFORE UPDATE ON fin.close_automation_audit
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_automation_audit_immutable();

DROP TRIGGER IF EXISTS trg_automation_audit_no_delete ON fin.close_automation_audit;
CREATE TRIGGER trg_automation_audit_no_delete
    BEFORE DELETE ON fin.close_automation_audit
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_automation_audit_immutable();

-- ============================================================================
-- 3. View: Automation rule status with current-period usage counts
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_automation_rule_status CASCADE;
CREATE OR REPLACE VIEW fin.vw_automation_rule_status AS
WITH current_period AS (
    SELECT DISTINCT ON (r.tenant_id, r.entity_code)
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number
    FROM fin.close_run r
    WHERE r.status NOT IN ('CANCELLED', 'HARD_CLOSED')
    ORDER BY r.tenant_id, r.entity_code, r.run_number DESC
),
usage_counts AS (
    SELECT
        a.tenant_id,
        a.entity_code,
        a.action_type,
        COUNT(*) FILTER (WHERE a.verdict = 'AUTO_EXECUTED') AS auto_executed_count,
        COUNT(*) FILTER (WHERE a.verdict = 'REQUIRES_APPROVAL') AS approval_required_count,
        COUNT(*) FILTER (WHERE a.verdict LIKE 'BLOCKED_%') AS blocked_count,
        COUNT(*) FILTER (WHERE a.verdict = 'ESCALATED') AS escalated_count,
        MAX(a.evaluated_at) FILTER (WHERE a.verdict = 'AUTO_EXECUTED') AS last_auto_executed_at
    FROM fin.close_automation_audit a
    JOIN current_period cp
        ON cp.tenant_id = a.tenant_id AND cp.entity_code = a.entity_code
        AND cp.fiscal_year = a.fiscal_year AND cp.period_number = a.period_number
    GROUP BY a.tenant_id, a.entity_code, a.action_type
),
hourly_counts AS (
    SELECT
        a.tenant_id,
        a.entity_code,
        a.action_type,
        COUNT(*) AS actions_last_hour
    FROM fin.close_automation_audit a
    WHERE a.verdict = 'AUTO_EXECUTED'
      AND a.evaluated_at >= now() - interval '1 hour'
    GROUP BY a.tenant_id, a.entity_code, a.action_type
)
SELECT
    r.id AS rule_id,
    r.tenant_id,
    r.entity_code,
    r.action_type,
    r.status,
    r.max_auto_severity,
    r.max_breach_probability,
    r.min_buffer_hours,
    r.max_auto_accepts_per_period,
    r.max_auto_campaigns_per_period,
    r.max_auto_escalations_per_period,
    r.max_auto_actions_per_hour,
    r.cooldown_minutes,
    r.require_approval_high,
    r.require_approval_medium,
    r.active_hours_start,
    r.active_hours_end,
    -- Current period usage
    COALESCE(uc.auto_executed_count, 0) AS period_auto_executed,
    COALESCE(uc.approval_required_count, 0) AS period_approvals_required,
    COALESCE(uc.blocked_count, 0) AS period_blocked,
    COALESCE(uc.escalated_count, 0) AS period_escalated,
    COALESCE(hc.actions_last_hour, 0) AS actions_last_hour,
    uc.last_auto_executed_at,
    -- Capacity remaining
    GREATEST(0, r.max_auto_accepts_per_period - COALESCE(uc.auto_executed_count, 0)) AS accepts_remaining,
    GREATEST(0, r.max_auto_actions_per_hour - COALESCE(hc.actions_last_hour, 0)) AS hourly_capacity_remaining,
    -- Audit metadata
    r.enabled_by,
    r.enabled_at,
    r.pause_reason
FROM fin.close_automation_rule r
LEFT JOIN usage_counts uc
    ON uc.tenant_id = r.tenant_id AND uc.entity_code = r.entity_code
    AND uc.action_type = r.action_type
LEFT JOIN hourly_counts hc
    ON hc.tenant_id = r.tenant_id AND hc.entity_code = r.entity_code
    AND hc.action_type = r.action_type;

COMMENT ON VIEW fin.vw_automation_rule_status IS
    'Phase 15: Automation rule status with current-period usage counts, capacity remaining, and hourly rate tracking.';
