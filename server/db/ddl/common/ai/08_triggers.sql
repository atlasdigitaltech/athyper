-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

-- ============================================================================
-- control/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_aap_updated_at BEFORE UPDATE ON ai.ai_action_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_act_updated_at BEFORE UPDATE ON ai.ai_confidence_threshold FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_adb_updated_at BEFORE UPDATE ON ai.ai_drift_baseline FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_conversation_retention_updated_at BEFORE UPDATE ON ai.atlas_conversation_retention_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_provider_credential_updated_at BEFORE UPDATE ON ai.atlas_tenant_provider_credential FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_provider_epoch_updated_at BEFORE UPDATE ON ai.atlas_tenant_provider_credential_epoch FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_quota_policy_updated_at BEFORE UPDATE ON ai.atlas_tenant_quota_policy FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_quota_window_updated_at BEFORE UPDATE ON ai.atlas_tenant_quota_window FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_quota_reservation_updated_at BEFORE UPDATE ON ai.atlas_tenant_quota_reservation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_atlas_knowledge_source_updated_at BEFORE UPDATE ON ai.atlas_knowledge_source FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ============================================================================
-- event/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_ai_tool_invocation_insert_guard BEFORE INSERT ON ai.ai_tool_invocation FOR EACH ROW EXECUTE FUNCTION ai.trg_validate_ai_tool_invocation_insert();

CREATE TRIGGER trg_ai_tool_invocation_mutation_guard BEFORE UPDATE ON ai.ai_tool_invocation FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_ai_tool_invocation_mutation();

CREATE TRIGGER trg_ai_tool_invocation_updated_at BEFORE UPDATE ON ai.ai_tool_invocation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_atlas_run_message_check AFTER INSERT OR UPDATE ON ai.atlas_run DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ai.trg_validate_atlas_run_messages();

CREATE TRIGGER trg_atlas_run_mutation_guard BEFORE UPDATE ON ai.atlas_run FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_run_mutation();

CREATE TRIGGER trg_atlas_run_updated_at BEFORE UPDATE ON ai.atlas_run FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ai_agent_call_immutable BEFORE DELETE OR UPDATE ON ai.ai_agent_call FOR EACH ROW EXECUTE FUNCTION ai.trg_prevent_mutation();

CREATE TRIGGER trg_ai_agent_run_immutable BEFORE DELETE OR UPDATE ON ai.ai_agent_run FOR EACH ROW EXECUTE FUNCTION ai.trg_prevent_mutation();

CREATE TRIGGER trg_afl_feedback_type_lookup BEFORE INSERT OR UPDATE OF feedback_type ON ai.ai_feedback_log FOR EACH ROW EXECUTE FUNCTION ai.trg_validate_lookup_columns('log.ai_feedback_type', 'feedback_type');

CREATE TRIGGER trg_atlas_message_allocate_sequence BEFORE INSERT ON ai.atlas_message FOR EACH ROW EXECUTE FUNCTION ai.trg_allocate_atlas_message_sequence();

CREATE TRIGGER trg_atlas_message_mutation_guard BEFORE UPDATE ON ai.atlas_message FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_message_mutation();

CREATE TRIGGER trg_atlas_message_updated_at BEFORE UPDATE ON ai.atlas_message FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_atlas_thread_envelope_check AFTER INSERT OR UPDATE ON ai.atlas_thread DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ai.trg_validate_atlas_thread_envelope();

CREATE TRIGGER trg_atlas_thread_mutation_guard BEFORE UPDATE ON ai.atlas_thread FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_thread_mutation();

CREATE TRIGGER trg_atlas_thread_updated_at BEFORE UPDATE ON ai.atlas_thread FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_conversation_atlas_mutation_guard
BEFORE UPDATE ON document.conversation
FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_conversation_mutation();

CREATE CONSTRAINT TRIGGER trg_conversation_participant_atlas_cursor_check
AFTER INSERT OR UPDATE ON document.conversation_participant
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ai.trg_validate_atlas_participant_cursor();

CREATE TRIGGER trg_conversation_participant_atlas_insert_guard
BEFORE INSERT ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_participant_insert();

CREATE TRIGGER trg_conversation_participant_atlas_mutation_guard
BEFORE UPDATE ON document.conversation_participant
FOR EACH ROW EXECUTE FUNCTION ai.trg_guard_atlas_participant_mutation();
