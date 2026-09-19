-- Preserve historical migration checksums; prepare its constraint even when absent.
BEGIN;
SET LOCAL lock_timeout='5s';
-- Clean-data verification and CHECK validation must inspect the full table.
-- Allow large call histories more time; incompatible diagnostics are bounded.
SET LOCAL statement_timeout='15min';
LOCK TABLE ai.ai_agent_call IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE sample_count integer; sample_ids text;
BEGIN
 -- One bounded result scan, with no global count or ORDER BY over the history.
 SELECT count(*), string_agg(id::text,', ') INTO sample_count,sample_ids
 FROM (SELECT id FROM ai.ai_agent_call
       WHERE outcome='completed' AND usage_source<>'provider_final' LIMIT 20) sample;
 IF sample_count>0 THEN
   RAISE EXCEPTION 'AI_CALL_USAGE_INCOMPATIBLE: found % incompatible completed call(s) in a sample capped at 20',sample_count
     USING ERRCODE='23514', DETAIL='Sample call IDs (not a total count): '||sample_ids,
       HINT='Investigate the identified call records before retrying. Do not fabricate provider usage; tool-only completion belongs to ai_agent_run.';
 END IF;
END $$;
ALTER TABLE ai.ai_agent_call DROP CONSTRAINT IF EXISTS ai_agent_call_aac_completed_usage_chk;
ALTER TABLE ai.ai_agent_call ADD CONSTRAINT ai_agent_call_aac_completed_usage_chk
 CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text);
COMMIT;
