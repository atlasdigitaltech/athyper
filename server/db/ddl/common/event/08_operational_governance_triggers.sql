CREATE TRIGGER notification_message_creation_guard
BEFORE UPDATE ON event.notification_message
FOR EACH ROW EXECUTE FUNCTION event.trg_guard_event_creation();
CREATE TRIGGER notification_message_updated_at
BEFORE UPDATE ON event.notification_message
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_delivery_creation_guard
BEFORE UPDATE ON event.notification_delivery
FOR EACH ROW EXECUTE FUNCTION event.trg_guard_event_creation();
CREATE TRIGGER notification_delivery_updated_at
BEFORE UPDATE ON event.notification_delivery
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_inbox_state_identity_guard
BEFORE UPDATE ON event.notification_inbox_state
FOR EACH ROW EXECUTE FUNCTION event.trg_guard_notification_inbox_state();
CREATE TRIGGER notification_inbox_state_updated_at
BEFORE UPDATE ON event.notification_inbox_state
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER channel_consent_event_append_only
BEFORE UPDATE OR DELETE ON event.channel_consent_event
FOR EACH ROW EXECUTE FUNCTION event.trg_reject_append_only_mutation();

CREATE TRIGGER command_execution_10_guard
BEFORE UPDATE ON event.command_execution
FOR EACH ROW EXECUTE FUNCTION event.trg_guard_command_execution();

CREATE TRIGGER command_execution_20_status
BEFORE UPDATE OF status ON event.command_execution
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER command_execution_90_updated
BEFORE UPDATE ON event.command_execution
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
