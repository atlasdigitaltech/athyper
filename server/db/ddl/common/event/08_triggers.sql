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

CREATE TRIGGER trg_authorization_epoch_coordinates_immutable
BEFORE UPDATE ON runtime_meta.authorization_epoch
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_authorization_epoch_coordinates_immutable();

CREATE OR REPLACE FUNCTION event.trg_authorization_invalidation_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'authorization invalidation outbox rows cannot be deleted'; END IF;
    IF (OLD.idempotency_key, OLD.scope_kind, OLD.tenant_id, OLD.plane_code, OLD.authority_schema, OLD.authority_table,
        OLD.authority_operation, OLD.source_row_key, OLD.affected_principal_ids, OLD.affected_group_ids, OLD.affected_role_ids,
        OLD.affected_permission_set_ids, OLD.affected_permission_ids, OLD.affected_scope_ids, OLD.affected_record_ids,
        OLD.affected_delegation_ids, OLD.effective_at, OLD.created_at)
       IS DISTINCT FROM
       (NEW.idempotency_key, NEW.scope_kind, NEW.tenant_id, NEW.plane_code, NEW.authority_schema, NEW.authority_table,
        NEW.authority_operation, NEW.source_row_key, NEW.affected_principal_ids, NEW.affected_group_ids, NEW.affected_role_ids,
        NEW.affected_permission_set_ids, NEW.affected_permission_ids, NEW.affected_scope_ids, NEW.affected_record_ids,
        NEW.affected_delegation_ids, NEW.effective_at, NEW.created_at) THEN
      RAISE EXCEPTION 'authorization invalidation identity is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_authorization_invalidation_immutable
BEFORE UPDATE OR DELETE ON event.authorization_invalidation_outbox
FOR EACH ROW EXECUTE FUNCTION event.trg_authorization_invalidation_immutable();

CREATE TRIGGER notification_delivery_claim_updated_at
BEFORE UPDATE ON event.notification_delivery_claim
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER notification_outbox_state_updated_at
BEFORE UPDATE ON event.notification_outbox_state
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER push_subscription_updated_at
BEFORE UPDATE ON event.push_subscription
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER whatsapp_consent_updated_at
BEFORE UPDATE ON event.whatsapp_consent
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER whatsapp_consent_ledger
AFTER INSERT OR UPDATE OF consent_status ON event.whatsapp_consent
FOR EACH ROW EXECUTE FUNCTION event.trg_mirror_whatsapp_consent_event();

CREATE TRIGGER webhook_subscription_updated_at
BEFORE UPDATE ON event.webhook_subscription
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_authorization_invalidation_notify ON event.authorization_invalidation_outbox;
CREATE TRIGGER trg_authorization_invalidation_notify AFTER INSERT ON event.authorization_invalidation_outbox FOR EACH ROW EXECUTE FUNCTION event.notify_invalidation();
DROP TRIGGER IF EXISTS trg_descriptor_invalidation_notify ON event.descriptor_invalidation_outbox;
CREATE TRIGGER trg_descriptor_invalidation_notify AFTER INSERT ON event.descriptor_invalidation_outbox FOR EACH ROW EXECUTE FUNCTION event.notify_invalidation();
