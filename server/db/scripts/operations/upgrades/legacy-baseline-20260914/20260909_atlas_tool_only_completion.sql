-- Tool-only answers retain unavailable provider usage, with no fabricated tokens.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE ai.ai_agent_run DROP CONSTRAINT ai_agent_run_aar_completed_usage_chk;
ALTER TABLE ai.ai_agent_run ADD CONSTRAINT ai_agent_run_aar_completed_usage_chk
  CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text OR (usage_source = 'unavailable'::text AND model_call_count = 0 AND tool_call_count > 0 AND resolved_provider_id IS NULL AND actual_model_id IS NULL));
COMMIT;
