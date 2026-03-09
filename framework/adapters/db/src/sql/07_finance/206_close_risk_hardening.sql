/* ============================================================================
   Athyper v2.9.1 — Close Risk Signal Hardening
   Schema: fin
   Dependencies: 205_close_risk_signals.sql

   Phase 6.1 Hardening — 4 verification points:

   1. Signal deduplication identity (signal_fingerprint)
      Deterministic fingerprint per rule_type so semantically identical
      signals are not duplicated. Cooldown + suppression checks use
      fingerprint, not just rule_id.

   2. Resolver semantics (auto_resolve_when_clear)
      Per-rule flag: when the evaluator determines the condition has
      cleared, auto-resolve any active signal with matching fingerprint.

   3. Suppression scope (suppression_scope)
      Controls what "suppress" means operationally:
        instance              — this signal instance only
        rule_period           — this rule for the rest of this close period
        until_fingerprint_change — until the affected set changes

   4. Activity payload normalization
      (Handled in TypeScript — no schema change, but documented here)
      All RISK_SIGNAL_* activity payloads MUST include:
        signal_id, rule_id, rule_code, rule_type, signal_fingerprint,
        prior_state, new_state, target_status, affected_task_codes,
        evaluation_at
   ============================================================================ */

-- ============================================================================
-- 1. Signal deduplication identity
-- ============================================================================

ALTER TABLE fin.close_risk_signal
    ADD COLUMN IF NOT EXISTS signal_fingerprint text;

COMMENT ON COLUMN fin.close_risk_signal.signal_fingerprint IS
    'Deterministic identity key for deduplication. Format: rule_code:target_status:sorted_task_codes. '
    'Two signals with the same fingerprint represent the same semantic risk condition. '
    'Used for cooldown checks and auto-resolution matching.';

-- Update cooldown index to include fingerprint
DROP INDEX IF EXISTS fin.idx_crs_cooldown;
CREATE INDEX IF NOT EXISTS idx_crs_cooldown
    ON fin.close_risk_signal (tenant_id, entity_code, fiscal_year, period_number, rule_id, signal_fingerprint, fired_at DESC);

-- Fingerprint lookup for active signals (auto-resolve and suppression checks)
CREATE INDEX IF NOT EXISTS idx_crs_fingerprint_active
    ON fin.close_risk_signal (tenant_id, entity_code, fiscal_year, period_number, signal_fingerprint)
    WHERE signal_state IN ('fired', 'acknowledged');

-- ============================================================================
-- 2. Auto-resolve when condition clears
-- ============================================================================

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS auto_resolve_when_clear boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN fin.close_risk_rule.auto_resolve_when_clear IS
    'When true, the evaluator auto-resolves any active signal for this rule '
    'when re-evaluation shows the condition has cleared. Resolution note is '
    '"Auto-resolved: condition cleared". Default true for all rule types.';

-- ============================================================================
-- 3. Suppression scope
-- ============================================================================

ALTER TABLE fin.close_risk_rule
    ADD COLUMN IF NOT EXISTS suppression_scope text NOT NULL DEFAULT 'instance'
        CHECK (suppression_scope IN (
            'instance',                 -- suppress only this signal instance
            'rule_period',              -- suppress this rule for the rest of this period
            'until_fingerprint_change'  -- suppress until the affected set changes
        ));

COMMENT ON COLUMN fin.close_risk_rule.suppression_scope IS
    'Controls what "suppress" means operationally. '
    'instance: only this signal, cooldown still applies. '
    'rule_period: no more firings of this rule for this period. '
    'until_fingerprint_change: suppressed until the affected task set changes.';

-- Add suppression_scope to signal for resolved/suppressed signal records
ALTER TABLE fin.close_risk_signal
    ADD COLUMN IF NOT EXISTS suppression_scope text;

COMMENT ON COLUMN fin.close_risk_signal.suppression_scope IS
    'Copied from rule at suppression time. Used by evaluator to determine '
    'whether subsequent firings should be suppressed.';

-- Index for rule_period suppression check
CREATE INDEX IF NOT EXISTS idx_crs_rule_period_suppressed
    ON fin.close_risk_signal (tenant_id, entity_code, fiscal_year, period_number, rule_id)
    WHERE signal_state = 'suppressed' AND suppression_scope = 'rule_period';

-- ============================================================================
-- Update cooldown helper to be fingerprint-aware
-- ============================================================================

DROP FUNCTION IF EXISTS fin.is_risk_rule_cooled_down(uuid, varchar, smallint, smallint, uuid, integer, text) CASCADE;
DROP FUNCTION IF EXISTS fin.is_risk_rule_cooled_down(uuid, varchar, smallint, smallint, uuid, integer) CASCADE;
CREATE OR REPLACE FUNCTION fin.is_risk_rule_cooled_down(
    p_tenant_id         uuid,
    p_entity_code       varchar(20),
    p_fiscal_year       smallint,
    p_period_number     smallint,
    p_rule_id           uuid,
    p_cooldown_minutes  integer,
    p_fingerprint       text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM fin.close_risk_signal
        WHERE tenant_id = p_tenant_id
          AND entity_code = p_entity_code
          AND fiscal_year = p_fiscal_year
          AND period_number = p_period_number
          AND rule_id = p_rule_id
          -- Fingerprint-aware: if provided, only match same fingerprint
          AND (p_fingerprint IS NULL OR signal_fingerprint = p_fingerprint)
          AND signal_state IN ('fired', 'acknowledged')
          AND fired_at > now() - (p_cooldown_minutes || ' minutes')::interval
    );
$$;

-- ============================================================================
-- Helper: Check if rule is period-suppressed
-- ============================================================================

DROP FUNCTION IF EXISTS fin.is_risk_rule_suppressed(uuid, varchar, smallint, smallint, uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION fin.is_risk_rule_suppressed(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_fiscal_year   smallint,
    p_period_number smallint,
    p_rule_id       uuid,
    p_fingerprint   text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM fin.close_risk_signal
        WHERE tenant_id = p_tenant_id
          AND entity_code = p_entity_code
          AND fiscal_year = p_fiscal_year
          AND period_number = p_period_number
          AND rule_id = p_rule_id
          AND signal_state = 'suppressed'
          AND (
              -- rule_period: any suppressed signal for this rule blocks all firings
              suppression_scope = 'rule_period'
              -- until_fingerprint_change: only blocks if fingerprint matches
              OR (suppression_scope = 'until_fingerprint_change'
                  AND p_fingerprint IS NOT NULL
                  AND signal_fingerprint = p_fingerprint)
          )
    );
$$;

COMMENT ON FUNCTION fin.is_risk_rule_suppressed(uuid, varchar, smallint, smallint, uuid, text) IS
    'Returns true if the rule is suppressed for this period, considering '
    'the suppression_scope semantics (rule_period or until_fingerprint_change).';

-- ============================================================================
-- Update active signals view to include fingerprint
-- ============================================================================

DROP VIEW IF EXISTS fin.vw_close_risk_signals_active CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_risk_signals_active AS
SELECT
    s.id,
    s.tenant_id,
    s.entity_code,
    s.fiscal_year,
    s.period_number,
    s.rule_code,
    s.rule_type,
    s.severity,
    s.signal_state,
    s.signal_fingerprint,
    s.title,
    s.message,
    s.evidence,
    s.fired_at,
    s.acknowledged_by,
    s.acknowledged_at,
    r.rule_name,
    r.escalation_role,
    r.target_status AS rule_target_status,
    r.auto_resolve_when_clear,
    r.suppression_scope AS rule_suppression_scope,
    EXTRACT(EPOCH FROM (now() - s.fired_at)) / 3600 AS age_hours
FROM fin.close_risk_signal s
JOIN fin.close_risk_rule r ON r.id = s.rule_id
WHERE s.signal_state IN ('fired', 'acknowledged')
ORDER BY
    CASE s.severity
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
    END,
    s.fired_at DESC;
