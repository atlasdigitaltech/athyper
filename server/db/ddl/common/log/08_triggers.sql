CREATE TRIGGER notification_delivery_attempt_mutation_guard
BEFORE UPDATE OR DELETE ON log.notification_delivery_attempt
FOR EACH ROW EXECUTE FUNCTION log.trg_guard_notification_delivery_attempt();

CREATE TRIGGER notification_dlq_mutation_guard
BEFORE UPDATE OR DELETE ON log.notification_dlq
FOR EACH ROW EXECUTE FUNCTION log.trg_guard_notification_dlq();

CREATE TRIGGER integration_delivery_attempt_mutation_guard
BEFORE UPDATE OR DELETE ON log.integration_delivery_attempt
FOR EACH ROW EXECUTE FUNCTION log.trg_guard_integration_attempt();

CREATE TRIGGER integration_dlq_mutation_guard
BEFORE UPDATE OR DELETE ON log.integration_dlq
FOR EACH ROW EXECUTE FUNCTION log.trg_guard_integration_dlq();
