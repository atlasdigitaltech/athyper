-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

REVOKE ALL ON SCHEMA ai FROM PUBLIC;
GRANT USAGE ON SCHEMA ai TO athyperapp, athyperadmin;

REVOKE ALL ON FUNCTION ai.fn_atlas_conversation_access(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai.fn_atlas_conversation_access(uuid, uuid, boolean) TO athyperapp, athyperadmin;

GRANT DELETE ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_action_policy" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_action_policy" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_confidence_threshold" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_confidence_threshold" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_drift_baseline" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_drift_baseline" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_conversation_retention_policy" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperapp;

GRANT SELECT ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."atlas_tenant_provider_credential" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperapp;

GRANT SELECT ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."atlas_tenant_provider_credential_epoch" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_tool_invocation" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_tool_invocation" TO athyperapp;

GRANT SELECT ON TABLE "ai"."ai_tool_invocation" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."ai_tool_invocation" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_run" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_run" TO athyperapp;

GRANT SELECT ON TABLE "ai"."atlas_run" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."atlas_run" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_agent_call" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_agent_call" TO athyperapp;

GRANT SELECT ON TABLE "ai"."ai_agent_call" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_agent_run" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_agent_run" TO athyperapp;

GRANT SELECT ON TABLE "ai"."ai_agent_run" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_calibration_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_calibration_log" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_call_transcript" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_call_transcript" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_call_transcript_default" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_call_transcript_default" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_feedback_log" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_feedback_log" TO athyperapp;

GRANT SELECT ON TABLE "ai"."ai_feedback_log" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_inference_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_inference_log" TO athyperapp;

GRANT DELETE ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."ai_monitoring_log" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."ai_monitoring_log" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_knowledge_chunk" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_knowledge_chunk" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_knowledge_revision" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_knowledge_revision" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_knowledge_source" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_knowledge_source" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_message" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_message" TO athyperapp;

GRANT SELECT ON TABLE "ai"."atlas_message" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."atlas_message" TO athyperapp;

GRANT DELETE ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT INSERT ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT REFERENCES ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT TRIGGER ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT TRUNCATE ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT UPDATE ON TABLE "ai"."atlas_thread" TO athyperadmin;

GRANT SELECT ON TABLE "ai"."atlas_thread" TO athyperadmin_atlas_maintenance;

GRANT UPDATE ON TABLE "ai"."atlas_thread" TO athyperadmin_atlas_maintenance;

GRANT INSERT ON TABLE "ai"."atlas_thread" TO athyperapp;

GRANT SELECT ON TABLE "ai"."atlas_thread" TO athyperapp;

GRANT UPDATE ON TABLE "ai"."atlas_thread" TO athyperapp;

GRANT ALL PRIVILEGES ON TABLE "ai"."atlas_tenant_quota_policy" TO athyperadmin;
GRANT SELECT, INSERT, UPDATE ON TABLE "ai"."atlas_tenant_quota_policy" TO athyperapp;
GRANT ALL PRIVILEGES ON TABLE "ai"."atlas_tenant_quota_window" TO athyperadmin;
GRANT SELECT, INSERT, UPDATE ON TABLE "ai"."atlas_tenant_quota_window" TO athyperapp;
GRANT ALL PRIVILEGES ON TABLE "ai"."atlas_tenant_quota_reservation" TO athyperadmin;
GRANT SELECT, INSERT, UPDATE ON TABLE "ai"."atlas_tenant_quota_reservation" TO athyperapp;
