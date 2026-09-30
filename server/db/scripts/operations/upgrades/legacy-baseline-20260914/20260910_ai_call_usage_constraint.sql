-- Model-call records still require provider usage; tool-only completion belongs to runs.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE ai.ai_agent_call DROP CONSTRAINT ai_agent_call_aac_completed_usage_chk;
ALTER TABLE ai.ai_agent_call ADD CONSTRAINT ai_agent_call_aac_completed_usage_chk
 CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text);
COMMIT;
