/* ============================================================================
   Athyper v2.9.2 — Risk Signal Escalation Policy
   Schema: fin
   Dependencies: 205_close_risk_signals.sql,
                 206_close_risk_hardening.sql,
                 207_fingerprint_canonicalization.sql

   Phase 6.2: Adds rule-owned escalation SLA policy to close_risk_rule.
   The operations service uses these to schedule escalation timers
   when signals fire and are not acknowledged/resolved in time.

   Columns:
     acknowledge_sla_minutes  — SLA for acknowledging a fired signal
     resolve_sla_minutes      — SLA for resolving after acknowledgement
     escalation_enabled       — whether this rule triggers escalation timers
     max_escalation_level     — how many escalation rounds (1 = single, 2+ = chain)
     escalation_interval_minutes — delay between successive escalation rounds

   Also extends period_close_activity with escalation event type.
   ============================================================================ */

-- ============================================================================
-- 1. Escalation SLA policy on risk rules
-- ============================================================================

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS acknowledge_sla_minutes integer NOT NULL DEFAULT 120
        CHECK (acknowledge_sla_minutes >= 0);

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS resolve_sla_minutes integer NOT NULL DEFAULT 480
        CHECK (resolve_sla_minutes >= 0);

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS escalation_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS max_escalation_level smallint NOT NULL DEFAULT 1
        CHECK (max_escalation_level >= 1 AND max_escalation_level <= 5);

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS escalation_interval_minutes integer NOT NULL DEFAULT 60
        CHECK (escalation_interval_minutes >= 0);

COMMENT ON COLUMN fin.close_risk_rule.acknowledge_sla_minutes IS
    'Minutes allowed to acknowledge a fired signal before escalation. 0 disables acknowledge SLA.';

COMMENT ON COLUMN fin.close_risk_rule.resolve_sla_minutes IS
    'Minutes allowed to resolve after acknowledgement before escalation. 0 disables resolve SLA.';

COMMENT ON COLUMN fin.close_risk_rule.escalation_enabled IS
    'When true, unacknowledged/unresolved signals trigger escalation timers.';

COMMENT ON COLUMN fin.close_risk_rule.max_escalation_level IS
    'Maximum escalation rounds. 1 = single escalation, 2+ = chain with interval.';

COMMENT ON COLUMN fin.close_risk_rule.escalation_interval_minutes IS
    'Minutes between successive escalation rounds when max_escalation_level > 1.';

-- ============================================================================
-- 2. Track escalation level on signal
-- ============================================================================

ALTER TABLE fin.close_risk_signal
    ADD COLUMN IF NOT EXISTS escalation_level smallint NOT NULL DEFAULT 0;

ALTER TABLE fin.close_risk_signal
    ADD COLUMN IF NOT EXISTS last_escalated_at timestamptz;

COMMENT ON COLUMN fin.close_risk_signal.escalation_level IS
    'Current escalation level. 0 = not escalated, 1+ = escalation round.';

COMMENT ON COLUMN fin.close_risk_signal.last_escalated_at IS
    'Timestamp of the most recent escalation event for this signal.';

-- ============================================================================
-- 3. Extend activity_type with escalation event
-- ============================================================================

ALTER TABLE fin.period_close_activity
    DROP CONSTRAINT IF EXISTS chk_close_activity_type;

ALTER TABLE fin.period_close_activity
    ADD CONSTRAINT chk_close_activity_type
        CHECK (activity_type IN (
            'TASK_COMPLETED', 'TASK_FAILED', 'TASK_BLOCKED', 'TASK_UNBLOCKED',
            'TASK_ASSIGNED', 'TASK_REASSIGNED',
            'WAIVER_REQUESTED', 'WAIVER_APPROVED', 'WAIVER_REJECTED',
            'HANDLER_EXECUTED', 'HANDLER_FAILED',
            'REMINDER_SENT', 'ESCALATED',
            'TRANSITION_ATTEMPTED', 'TRANSITION_DENIED', 'TRANSITION_SUCCEEDED',
            'CHECKLIST_MATERIALIZED',
            -- Phase 6.1: Risk signal lifecycle events
            'RISK_SIGNAL_FIRED', 'RISK_SIGNAL_ACKNOWLEDGED', 'RISK_SIGNAL_RESOLVED',
            -- Phase 6.2: Risk signal suppression + escalation
            'RISK_SIGNAL_SUPPRESSED', 'RISK_SIGNAL_ESCALATED'
        ));

-- ============================================================================
-- 4. Index for escalation timer queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crs_escalation_pending
    ON fin.close_risk_signal (tenant_id, entity_code, fired_at)
    WHERE signal_state IN ('fired', 'acknowledged')
      AND escalation_level < 5;

-- ============================================================================
-- 5. Scheduled evaluation config per entity
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.close_risk_schedule (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,

    is_enabled          boolean NOT NULL DEFAULT false,
    cadence_minutes     integer NOT NULL DEFAULT 30
        CHECK (cadence_minutes >= 5 AND cadence_minutes <= 1440),

    -- Only evaluate during active close periods
    -- When true, dispatcher checks fiscal_period status before evaluating
    active_periods_only boolean NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_close_risk_schedule
        UNIQUE (tenant_id, entity_code)
);

COMMENT ON TABLE fin.close_risk_schedule IS
    'Per-entity automation policy for scheduled risk signal evaluation. '
    'Controls whether the dispatcher evaluates this entity and at what cadence.';
