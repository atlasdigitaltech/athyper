-- ============================================================================
-- event/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_ai_tool_invocation_insert_guard BEFORE INSERT ON event.ai_tool_invocation FOR EACH ROW EXECUTE FUNCTION event.trg_validate_ai_tool_invocation_insert();

CREATE TRIGGER trg_ai_tool_invocation_mutation_guard BEFORE UPDATE ON event.ai_tool_invocation FOR EACH ROW EXECUTE FUNCTION event.trg_guard_ai_tool_invocation_mutation();

CREATE TRIGGER trg_ai_tool_invocation_updated_at BEFORE UPDATE ON event.ai_tool_invocation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE CONSTRAINT TRIGGER trg_atlas_run_message_check AFTER INSERT OR UPDATE ON event.atlas_run DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION event.trg_validate_atlas_run_messages();

CREATE TRIGGER trg_atlas_run_mutation_guard BEFORE UPDATE ON event.atlas_run FOR EACH ROW EXECUTE FUNCTION event.trg_guard_atlas_run_mutation();

CREATE TRIGGER trg_atlas_run_updated_at BEFORE UPDATE ON event.atlas_run FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_authorization_invalidation_immutable_v2 BEFORE DELETE OR UPDATE ON event.authorization_invalidation_outbox_v2 FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_invalidation_immutable_v2();

ALTER TABLE "event"."authorization_invalidation_outbox_v2" ENABLE ALWAYS TRIGGER "trg_authorization_invalidation_immutable_v2";

CREATE TRIGGER trg_cf_context_type_lookup BEFORE INSERT OR UPDATE OF context_type ON event.comment_flag FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('document.comment_type', 'context_type');

CREATE TRIGGER trg_cf_flag_reason_lookup BEFORE INSERT OR UPDATE OF flag_reason ON event.comment_flag FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.flag_reason', 'flag_reason');

CREATE TRIGGER trg_cf_sync_moderation AFTER INSERT OR UPDATE OF status ON event.comment_flag FOR EACH ROW EXECUTE FUNCTION event.trg_sync_comment_moderation();

CREATE TRIGGER trg_cf_updated_at BEFORE UPDATE ON event.comment_flag FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ds_channel_lookup BEFORE INSERT OR UPDATE OF channel ON event.digest_staging FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.channel', 'channel');

CREATE TRIGGER trg_ds_frequency_lookup BEFORE INSERT OR UPDATE OF frequency ON event.digest_staging FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.digest_frequency', 'frequency');

CREATE TRIGGER trg_ds_priority_lookup BEFORE INSERT OR UPDATE OF priority ON event.digest_staging FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.priority', 'priority');

CREATE TRIGGER trg_ndlv_channel_lookup BEFORE INSERT OR UPDATE OF channel ON event.notification_delivery FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.channel', 'channel');

CREATE TRIGGER trg_ndlv_updated_at BEFORE UPDATE ON event.notification_delivery FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_ndlv_channel_lookup BEFORE INSERT OR UPDATE OF channel ON event.notification_delivery_default FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.channel', 'channel');

CREATE TRIGGER trg_ndlv_updated_at BEFORE UPDATE ON event.notification_delivery_default FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_nmsg_counts_guard BEFORE UPDATE OF delivered_count, failed_count, recipient_count ON event.notification_message FOR EACH ROW EXECUTE FUNCTION event.trg_guard_notification_message_counts();

CREATE TRIGGER trg_nmsg_priority_lookup BEFORE INSERT OR UPDATE OF priority ON event.notification_message FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('notification.priority', 'priority');

CREATE TRIGGER trg_nmsg_updated_at BEFORE UPDATE ON event.notification_message FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
