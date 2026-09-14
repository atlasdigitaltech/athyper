-- Atlas F3: additive response feedback coordinates and static guidance completion.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE ai.ai_agent_run ADD COLUMN guidance_code text;
ALTER TABLE ai.ai_feedback_log ADD COLUMN atlas_response_message_id uuid;
ALTER TABLE ai.ai_feedback_log ADD COLUMN atlas_response_plane text;
ALTER TABLE ai.ai_agent_run DROP CONSTRAINT ai_agent_run_aar_completed_usage_chk;
ALTER TABLE ai.ai_agent_run
ADD CONSTRAINT "ai_agent_run_aar_completed_usage_chk" CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text OR (usage_source = 'unavailable'::text AND model_call_count = 0 AND (tool_call_count > 0 OR guidance_code IS NOT NULL) AND resolved_provider_id IS NULL AND actual_model_id IS NULL));

-- F3: exact response feedback binding and explicit zero-model guidance metering.
ALTER TABLE ai.atlas_run ADD CONSTRAINT atlas_run_response_coordinate_uq
  UNIQUE (tenant_id, id, plane, output_message_id, principal_id);
ALTER TABLE ai.ai_feedback_log ADD CONSTRAINT ai_feedback_response_coordinate_chk CHECK (
  (atlas_response_message_id IS NULL AND atlas_response_plane IS NULL) OR
  (atlas_response_message_id IS NOT NULL AND atlas_response_plane IS NOT NULL AND target_id IS NOT NULL AND feedback_type = 'atlas_agent'));
ALTER TABLE ai.ai_feedback_log ADD CONSTRAINT ai_feedback_response_coordinate_fk
  FOREIGN KEY (tenant_id, target_id, atlas_response_plane, atlas_response_message_id, submitted_by)
  REFERENCES ai.atlas_run (tenant_id, id, plane, output_message_id, principal_id) ON DELETE CASCADE;
ALTER TABLE ai.ai_agent_run ADD CONSTRAINT ai_agent_run_guidance_chk CHECK (
  guidance_code IS NULL OR (guidance_code IN ('ambiguous', 'missing_scope', 'access_denied')
    AND outcome = 'completed' AND usage_source = 'unavailable'
    AND model_call_count = 0 AND retrieval_call_count = 0
    AND resolved_provider_id IS NULL AND actual_model_id IS NULL
    AND input_tokens IS NULL AND output_tokens IS NULL AND cache_read_tokens IS NULL AND cost_amount IS NULL));

COMMIT;
