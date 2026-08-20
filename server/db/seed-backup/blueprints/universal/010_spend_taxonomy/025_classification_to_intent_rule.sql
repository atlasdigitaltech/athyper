-- Wave 5 retirement slot.
-- Conditional classification-to-intent routing is no longer authoritative.
-- Allowed/default intents converge through effective commodity buy/sell policies.
DO $wave5_intent_policy_precondition$
DECLARE v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id=v_tid AND status='active') THEN
    RAISE EXCEPTION '[wave5.spend-taxonomy] active business intents required';
  END IF;
END $wave5_intent_policy_precondition$;
