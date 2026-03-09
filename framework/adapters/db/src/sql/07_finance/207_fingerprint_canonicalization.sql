/* ============================================================================
   Athyper v2.9.2 — Fingerprint Canonicalization & Rule Identity Guard
   Schema: fin
   Dependencies: 205_close_risk_signals.sql,
                 206_close_risk_hardening.sql

   Stabilizes signal_fingerprint as a durable contract:

   1. Rule identity immutability — prevents mutation of rule_code and
      target_status on fin.close_risk_rule once signals exist.
      Changing these columns would invalidate the fingerprint of every
      historical signal for that rule, silently breaking cooldown,
      suppression, and auto-resolve matching.

   2. Fingerprint format contract — documented here for cross-layer
      consistency (TypeScript domain, BFF route, SQL helpers).

   Fingerprint format (v1):
     v1:RULE_CODE:TARGET_STATUS:SORTED_TASK_CODES

   Canonicalization rules:
     - All segments are trimmed and uppercased
     - NULL target_status is represented as "*"
     - Task codes are sorted lexicographically after canonicalization
     - Empty task-code set omits the fourth segment entirely
     - Delimiter is ":" between segments, "," between task codes

   Examples:
     v1:FORECAST_SLIP_2H:SOFT_CLOSE
     v1:BLOCKER_STALE_3:HARD_CLOSE:AP_RECON,AR_RECON
     v1:SLA_BREACH:*:BANK_RECON,FX_REVALUATION
   ============================================================================ */

-- ============================================================================
-- 1. Rule identity immutability — guard rule_code + target_status
-- ============================================================================
-- Follows existing Athyper pattern: fin.trg_dimension_set_immutable()
-- Only blocks mutation when signals exist for the rule. This allows
-- free editing of newly created rules with no signal history.

DROP FUNCTION IF EXISTS fin.trg_risk_rule_identity_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_risk_rule_identity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Allow changes if neither identity column changed
    IF NEW.rule_code = OLD.rule_code
       AND NEW.target_status IS NOT DISTINCT FROM OLD.target_status
    THEN
        RETURN NEW;
    END IF;

    -- Block only if signals exist for this rule
    IF EXISTS (
        SELECT 1 FROM fin.close_risk_signal
        WHERE rule_id = OLD.id
        LIMIT 1
    ) THEN
        IF NEW.rule_code != OLD.rule_code THEN
            RAISE EXCEPTION
                'close_risk_rule.rule_code is immutable once signals exist (rule_id=%)',
                OLD.id;
        END IF;
        IF NEW.target_status IS DISTINCT FROM OLD.target_status THEN
            RAISE EXCEPTION
                'close_risk_rule.target_status is immutable once signals exist (rule_id=%)',
                OLD.id;
        END IF;
    END IF;

    RETURN NEW;
END $$;

COMMENT ON FUNCTION fin.trg_risk_rule_identity_immutable() IS
    'Prevents mutation of rule_code and target_status on close_risk_rule once '
    'signals exist for the rule. These columns are fingerprint identity dimensions; '
    'changing them would orphan historical signal fingerprints.';

DROP TRIGGER IF EXISTS trg_risk_rule_identity_guard ON fin.close_risk_rule;
CREATE TRIGGER trg_risk_rule_identity_guard
    BEFORE UPDATE ON fin.close_risk_rule
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_risk_rule_identity_immutable();
